/**
 * 视频同步 API
 * 
 * 定时任务调用此接口同步B站UP主的最新视频
 * Vercel Cron: 每天 6:30 和 17:00 执行
 */

import { createClient } from '@supabase/supabase-js';

// Vercel Edge Function 配置
export const config = {
  runtime: 'edge',
};

// B站API配置
const BILIBILI_API_BASE = 'https://api.bilibili.com';

// 获取请求头（包含用户 Cookie，模拟浏览器请求）
function getHeaders(userCookie?: string): Record<string, string> {
  const cookie = userCookie || process.env.BILIBILI_COOKIE || '';
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Referer': 'https://space.bilibili.com',
    'Origin': 'https://space.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    ...(cookie ? { 'Cookie': cookie } : {}),
  };
}

interface BilibiliVideoItem {
  aid: number;
  bvid: string;
  title: string;
  pic: string;
  description: string;
  duration: number;
  pubdate: number;
  accessRestriction?: string | null;
}

export default async function handler(request: Request) {
  // 验证请求（可选：添加密钥验证）
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // 初始化 Supabase 客户端
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  // 确定同步类型
  const hour = new Date().getHours();
  const syncType = hour < 12 ? 'cron_morning' : 'cron_evening';

  try {
    // 1. 获取所有用户（包含 B站 Cookie）
    const { data: users, error: userError } = await supabase
      .from('user')
      .select('id, bilibili_cookie');

    if (userError) throw userError;
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ message: 'No users found' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let totalAdded = 0;
    const userResults: { userId: string; added: number; errors: string[] }[] = [];

    // 2. 遍历每个用户
    for (const user of users) {
      const userId = user.id;
      const userCookie = user.bilibili_cookie || '';
      const userErrors: string[] = [];
      let userAdded = 0;

      // 记录同步开始（每个用户一条日志）
      const { data: logData } = await supabase
        .from('sync_log')
        .insert({ user_id: userId, sync_type: syncType, status: 'running' })
        .select()
        .single();

      const logId = logData?.id;

      try {
        // 获取该用户的所有启用UP主
        const { data: uploaders, error: uploaderError } = await supabase
          .from('uploader')
          .select('mid, name')
          .eq('user_id', userId)
          .eq('is_active', true);

        if (uploaderError) throw uploaderError;
        if (!uploaders || uploaders.length === 0) {
          continue;
        }

        // 遍历每个UP主获取视频（使用用户的 Cookie）
        for (const uploader of uploaders) {
          try {
            const videos = await fetchUploaderVideos(uploader.mid, userCookie);
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const todayTimestamp = today.getTime() / 1000;
            const todayVideos = videos.filter(v => v.pubdate >= todayTimestamp);

            for (const video of todayVideos) {
              // 获取视频访问限制信息
              let accessRestriction: string | null = null;
              try {
                accessRestriction = await fetchVideoAccessRestriction(video.bvid, userCookie);
              } catch {
                // 获取失败不影响主流程
              }

              const videoData = {
                user_id: userId,
                bvid: video.bvid,
                aid: video.aid,
                mid: uploader.mid,
                title: video.title,
                pic: video.pic.startsWith('//') ? `https:${video.pic}` : video.pic,
                description: video.description || '',
                duration: video.duration,
                pubdate: new Date(video.pubdate * 1000).toISOString(),
                access_restriction: accessRestriction,
              };

              const { error: upsertError } = await supabase
                .from('video')
                .upsert(videoData, { onConflict: 'user_id,bvid' });

              if (upsertError) {
                userErrors.push(`视频 ${video.bvid}: ${upsertError.message}`);
              } else {
                userAdded++;
              }
            }

            await sleep(100); // 减少延迟避免超时
          } catch (err) {
            userErrors.push(`UP主 ${uploader.name}: ${err}`);
          }
        }

        // 更新该用户的同步日志
        const status = userErrors.length === 0 ? 'success' : (userAdded > 0 ? 'partial' : 'failed');
        if (logId) {
          await supabase
            .from('sync_log')
            .update({
              status,
              videos_added: userAdded,
              uploaders_synced: uploaders.length,
              error_message: userErrors.length > 0 ? userErrors.join('\n') : null,
              finished_at: new Date().toISOString(),
            })
            .eq('id', logId);
        }

      } catch (err) {
        if (logId) {
          await supabase
            .from('sync_log')
            .update({
              status: 'failed',
              error_message: String(err),
              finished_at: new Date().toISOString(),
            })
            .eq('id', logId);
        }
        userErrors.push(String(err));
      }

      totalAdded += userAdded;
      userResults.push({ userId, added: userAdded, errors: userErrors });
    }

    return new Response(JSON.stringify({
      success: true,
      sync_type: syncType,
      users_synced: users.length,
      videos_added: totalAdded,
      details: userResults,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 获取UP主视频列表
 * 使用用户的 Cookie 调用 B站 API
 */
async function fetchUploaderVideos(mid: number, userCookie?: string): Promise<BilibiliVideoItem[]> {
  const url = new URL(`${BILIBILI_API_BASE}/x/space/arc/search`);
  url.searchParams.set('mid', mid.toString());
  url.searchParams.set('pn', '1');
  url.searchParams.set('ps', '30');
  url.searchParams.set('order', 'pubdate');
  url.searchParams.set('tid', '0');
  url.searchParams.set('keyword', '');

  try {
    const response = await fetch(url.toString(), { headers: getHeaders(userCookie) });
    const data = await response.json();

    if (data.code === 0 && data.data?.list?.vlist) {
      return data.data.list.vlist;
    }

    // 如果失败，尝试备用接口
    console.log(`主接口失败 [${data.code}]，尝试备用接口...`);
    return await fetchUploaderVideosFallback(mid, userCookie);
  } catch (err) {
    console.log(`请求失败，尝试备用接口: ${err}`);
    return await fetchUploaderVideosFallback(mid, userCookie);
  }
}

/**
 * 备用接口 - 使用用户动态接口
 */
async function fetchUploaderVideosFallback(mid: number, userCookie?: string): Promise<BilibiliVideoItem[]> {
  // 尝试使用用户动态接口
  const url = `${BILIBILI_API_BASE}/x/polymer/web-dynamic/v1/feed/space?host_mid=${mid}`;
  
  try {
    const response = await fetch(url, { headers: getHeaders(userCookie) });
    const data = await response.json();

    if (data.code !== 0 || !data.data?.items) {
      return [];
    }

    // 解析动态中的视频
    const videos: BilibiliVideoItem[] = [];
    for (const item of data.data.items) {
      if (item.type === 'DYNAMIC_TYPE_AV' && item.modules?.module_dynamic?.major?.archive) {
        const archive = item.modules.module_dynamic.major.archive;
        videos.push({
          aid: parseInt(archive.aid),
          bvid: archive.bvid,
          title: archive.title,
          pic: archive.cover,
          description: archive.desc || '',
          duration: parseDuration(archive.duration_text || '0:00'),
          pubdate: Math.floor(new Date(item.modules?.module_author?.pub_ts * 1000 || Date.now()).getTime() / 1000),
        });
      }
    }
    return videos;
  } catch {
    return [];
  }
}

/**
 * 解析时长字符串 "1:23:45" -> 秒数
 */
function parseDuration(durationStr: string): number {
  const parts = durationStr.split(':').map(Number);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  } else if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 获取视频访问限制信息
 * 通过视频详情接口获取判断是否有访问限制
 */
async function fetchVideoAccessRestriction(bvid: string, userCookie?: string): Promise<string | null> {
  const url = `${BILIBILI_API_BASE}/x/web-interface/view?bvid=${bvid}`;
  
  try {
    const response = await fetch(url, { headers: getHeaders(userCookie) });
    const data = await response.json();

    if (data.code !== 0) {
      return null;
    }

    const videoData = data.data;
    const rights = videoData?.rights;

    // 检查充电专属（顶层字段）
    if (videoData?.is_upower_exclusive === true) {
      return 'charging';
    }

    // 检查付费相关（rights字段）
    if (rights) {
      if (rights.arc_pay === 1) return 'arc_pay';
      if (rights.ugc_pay === 1) return 'ugc_pay';
      if (rights.pay === 1) return 'pay';
    }

    return null;
  } catch {
    return null;
  }
}
