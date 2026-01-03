import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端（服务端）
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// B站 Cookie（从环境变量获取）
const DEFAULT_COOKIE = process.env.BILIBILI_COOKIE || '';

/**
 * 使用动态接口获取UP主视频（和前端一致，限流更宽松）
 */
async function getUploaderVideos(mid: number, cookie: string): Promise<any[]> {
  const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${mid}`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Referer': 'https://www.bilibili.com',
      'Origin': 'https://www.bilibili.com',
      'Cookie': cookie || DEFAULT_COOKIE,
    },
  });

  const data = await response.json();
  
  if (data.code !== 0) {
    console.error(`获取UP主[${mid}]视频失败:`, data.message);
    return [];
  }

  // 从动态中提取视频
  const videos: any[] = [];
  const items = data.data?.items || [];
  
  for (const item of items) {
    if (item.type !== 'DYNAMIC_TYPE_AV') continue;
    
    const archive = item.modules?.module_dynamic?.major?.archive;
    if (!archive) continue;
    
    let pic = archive.cover || '';
    if (pic.startsWith('//')) pic = `https:${pic}`;
    
    videos.push({
      aid: parseInt(archive.aid) || 0,
      bvid: archive.bvid,
      title: archive.title,
      pic,
      description: archive.desc || '',
      duration: parseDurationText(archive.duration_text),
      pubdate: item.modules?.module_author?.pub_ts || Math.floor(Date.now() / 1000),
    });
  }

  return videos;
}

// 解析时长文本 "12:34" -> 秒数
function parseDurationText(duration: string | number): number {
  if (typeof duration === 'number') return duration;
  if (!duration) return 0;
  const parts = duration.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

// 转换视频数据格式
function transformVideo(video: any, userId: string, mid: number) {
  return {
    user_id: userId,
    bvid: video.bvid,
    aid: video.aid,
    mid: mid,
    title: video.title,
    pic: video.pic,
    description: video.description || '',
    duration: video.duration || 0,
    view_count: 0,
    danmaku_count: 0,
    reply_count: 0,
    favorite_count: 0,
    coin_count: 0,
    share_count: 0,
    like_count: 0,
    pubdate: new Date(video.pubdate * 1000).toISOString(),
    platform: 'bilibili',
  };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 验证 Cron 密钥（防止未授权调用）
  const authHeader = req.headers.authorization;
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  console.log('🕐 定时同步任务开始:', new Date().toISOString());

  try {
    // 1. 获取所有活跃用户及其 UP 主列表
    const { data: users, error: userError } = await supabase
      .from('user')
      .select('id, bilibili_cookie')
      .not('bilibili_cookie', 'is', null);

    if (userError) throw userError;
    if (!users || users.length === 0) {
      return res.json({ success: true, message: '没有配置 Cookie 的用户' });
    }

    const results: { userId: string; videosAdded: number; error?: string }[] = [];

    // 2. 遍历每个用户
    for (const user of users) {
      if (!user.bilibili_cookie) continue;

      try {
        // 获取用户的 UP 主列表
        const { data: uploaders, error: uploaderError } = await supabase
          .from('uploader')
          .select('mid, name')
          .eq('user_id', user.id)
          .eq('is_active', true)
          .eq('platform', 'bilibili');

        if (uploaderError || !uploaders?.length) {
          results.push({ userId: user.id, videosAdded: 0, error: '无UP主' });
          continue;
        }

        // 今天0点时间戳
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayTimestamp = Math.floor(todayStart.getTime() / 1000);

        const allVideos: any[] = [];
        const newVideoTitles: string[] = [];
        let successCount = 0;
        let failCount = 0;

        // 3. 获取每个 UP 主的视频
        for (const uploader of uploaders) {
          try {
            const videos = await getUploaderVideos(uploader.mid, user.bilibili_cookie);
            
            if (videos.length > 0) {
              successCount++;
              // 只保留今天发布的视频
              const todayVideos = videos.filter(v => v.pubdate >= todayTimestamp);
              
              for (const video of todayVideos) {
                allVideos.push(transformVideo(video, user.id, uploader.mid));
                newVideoTitles.push(`${uploader.name}: ${video.title}`);
              }
              console.log(`✅ ${uploader.name}: ${videos.length} 个视频`);
            } else {
              failCount++;
            }

            // 限流：每个UP主之间等待300ms
            await new Promise(r => setTimeout(r, 300));
          } catch (err) {
            failCount++;
            console.error(`获取UP主[${uploader.mid}]失败:`, err);
          }
        }

        console.log(`统计: 成功 ${successCount}, 失败 ${failCount}`);

        // 4. 查询已存在的视频
        if (allVideos.length > 0) {
          const bvids = allVideos.map(v => v.bvid);
          const { data: existing } = await supabase
            .from('video')
            .select('bvid')
            .eq('user_id', user.id)
            .in('bvid', bvids);

          const existingBvids = new Set(existing?.map(v => v.bvid) || []);
          const newVideos = allVideos.filter(v => !existingBvids.has(v.bvid));

          // 5. 插入新视频
          if (newVideos.length > 0) {
            const { error: insertError } = await supabase
              .from('video')
              .upsert(newVideos, { onConflict: 'user_id,platform,bvid' });

            if (insertError) {
              console.error('插入视频失败:', insertError);
            }

            // 6. 创建通知
            const notification = {
              user_id: user.id,
              type: 'sync_result',
              title: `同步完成：新增 ${newVideos.length} 个视频`,
              content: newVideoTitles.slice(0, 5).join('\n') + (newVideoTitles.length > 5 ? `\n...等 ${newVideoTitles.length} 个` : ''),
              data: {
                videos_added: newVideos.length,
                new_videos: newVideos.slice(0, 10).map(v => ({
                  bvid: v.bvid,
                  title: v.title,
                  pic: v.pic,
                })),
              },
            };

            await supabase.from('notification').insert(notification);
          }

          results.push({ userId: user.id, videosAdded: newVideos.length });
        } else {
          results.push({ userId: user.id, videosAdded: 0 });
        }

      } catch (err: any) {
        console.error(`用户[${user.id}]同步失败:`, err);
        results.push({ userId: user.id, videosAdded: 0, error: err.message });
      }
    }

    console.log('✅ 定时同步完成:', results);

    return res.json({
      success: true,
      timestamp: new Date().toISOString(),
      results,
    });

  } catch (error: any) {
    console.error('❌ 定时同步失败:', error);
    return res.status(500).json({ error: error.message });
  }
}
