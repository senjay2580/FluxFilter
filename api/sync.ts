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
const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://www.bilibili.com',
};

interface BilibiliVideoItem {
  aid: number;
  bvid: string;
  title: string;
  pic: string;
  description: string;
  duration: number;
  pubdate: number;
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

  // 记录同步开始
  const { data: logData } = await supabase
    .from('sync_log')
    .insert({ sync_type: syncType, status: 'running' })
    .select()
    .single();

  const logId = logData?.id;

  try {
    // 1. 获取所有启用的UP主
    const { data: uploaders, error: uploaderError } = await supabase
      .from('uploader')
      .select('mid, name')
      .eq('is_active', true);

    if (uploaderError) throw uploaderError;
    if (!uploaders || uploaders.length === 0) {
      return new Response(JSON.stringify({ message: 'No active uploaders found' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let totalAdded = 0;
    let totalUpdated = 0;
    const errors: string[] = [];

    // 2. 遍历每个UP主获取视频
    for (const uploader of uploaders) {
      try {
        // 获取UP主最近的视频
        const videos = await fetchUploaderVideos(uploader.mid);
        
        // 过滤出今天的视频
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime() / 1000;

        const todayVideos = videos.filter(v => v.pubdate >= todayTimestamp);

        // 3. 使用 UPSERT 插入或更新视频
        for (const video of todayVideos) {
          const videoData = {
            bvid: video.bvid,
            aid: video.aid,
            mid: uploader.mid,
            title: video.title,
            pic: video.pic.startsWith('//') ? `https:${video.pic}` : video.pic,
            description: video.description || '',
            duration: video.duration,
            pubdate: new Date(video.pubdate * 1000).toISOString(),
          };

          const { error: upsertError } = await supabase
            .from('video')
            .upsert(videoData, { onConflict: 'bvid' });

          if (upsertError) {
            errors.push(`视频 ${video.bvid}: ${upsertError.message}`);
          } else {
            totalAdded++;
          }
        }

        // 避免请求过快
        await sleep(500);
      } catch (err) {
        errors.push(`UP主 ${uploader.name}[${uploader.mid}]: ${err}`);
      }
    }

    // 4. 更新同步日志
    const status = errors.length === 0 ? 'success' : (totalAdded > 0 ? 'partial' : 'failed');
    
    if (logId) {
      await supabase
        .from('sync_log')
        .update({
          status,
          videos_added: totalAdded,
          videos_updated: totalUpdated,
          error_message: errors.length > 0 ? errors.join('\n') : null,
          finished_at: new Date().toISOString(),
        })
        .eq('id', logId);
    }

    return new Response(JSON.stringify({
      success: true,
      sync_type: syncType,
      videos_added: totalAdded,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    // 记录错误
    if (logId) {
      await supabase
        .from('sync_log')
        .update({
          status: 'failed',
          error_message: String(error),
          finished_at: new Date().toISOString(),
        })
        .eq('id', logId);
    }

    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * 获取UP主视频列表
 */
async function fetchUploaderVideos(mid: number): Promise<BilibiliVideoItem[]> {
  const url = new URL(`${BILIBILI_API_BASE}/x/space/wbi/arc/search`);
  url.searchParams.set('mid', mid.toString());
  url.searchParams.set('pn', '1');
  url.searchParams.set('ps', '30');
  url.searchParams.set('order', 'pubdate');

  const response = await fetch(url.toString(), { headers });
  const data = await response.json();

  if (data.code !== 0) {
    throw new Error(`B站API错误 [${data.code}]: ${data.message}`);
  }

  return data.data?.list?.vlist || [];
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
