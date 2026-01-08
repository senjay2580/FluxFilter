import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

// 初始化 Supabase 客户端（服务端）
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// B站 Cookie（从环境变量获取）
const DEFAULT_COOKIE = process.env.BILIBILI_COOKIE || '';

// 重试配置
const RETRY_CONFIG = {
  maxRetries: 3,           // 最大重试次数
  baseDelay: 1000,         // 基础延迟 1s
  maxDelay: 10000,         // 最大延迟 10s
  timeout: 15000,          // 请求超时 15s
  retryableStatusCodes: [408, 429, 500, 502, 503, 504], // 可重试的状态码
};

/**
 * 带超时的 fetch
 */
async function fetchWithTimeout(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * 计算指数退避延迟
 */
function getRetryDelay(attempt: number): number {
  const delay = Math.min(
    RETRY_CONFIG.baseDelay * Math.pow(2, attempt) + Math.random() * 1000,
    RETRY_CONFIG.maxDelay
  );
  return delay;
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(error: any, statusCode?: number): boolean {
  // 网络错误、超时错误可重试
  if (error?.name === 'AbortError') return true;
  if (error?.message?.includes('network') || error?.message?.includes('timeout')) return true;
  
  // 特定状态码可重试
  if (statusCode && RETRY_CONFIG.retryableStatusCodes.includes(statusCode)) return true;
  
  return false;
}

/**
 * 带重试的请求封装
 */
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  context: string = ''
): Promise<Response> {
  let lastError: any;
  
  for (let attempt = 0; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, RETRY_CONFIG.timeout);
      
      // 检查是否需要重试
      if (!response.ok && isRetryableError(null, response.status)) {
        if (attempt < RETRY_CONFIG.maxRetries) {
          const delay = getRetryDelay(attempt);
          console.log(`⚠️ ${context} 请求失败 (${response.status})，${delay}ms 后重试 (${attempt + 1}/${RETRY_CONFIG.maxRetries})`);
          await new Promise(r => setTimeout(r, delay));
          continue;
        }
      }
      
      return response;
    } catch (error: any) {
      lastError = error;
      
      if (isRetryableError(error) && attempt < RETRY_CONFIG.maxRetries) {
        const delay = getRetryDelay(attempt);
        console.log(`⚠️ ${context} 请求异常 (${error.message})，${delay}ms 后重试 (${attempt + 1}/${RETRY_CONFIG.maxRetries})`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

/**
 * 使用动态接口获取UP主视频（和前端一致，限流更宽松）
 * 带重试机制
 */
async function getUploaderVideos(mid: number, cookie: string, uploaderName?: string): Promise<any[]> {
  const url = `https://api.bilibili.com/x/polymer/web-dynamic/v1/feed/space?host_mid=${mid}`;
  const context = uploaderName ? `UP主[${uploaderName}]` : `UP主[${mid}]`;
  
  try {
    const response = await fetchWithRetry(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        'Origin': 'https://www.bilibili.com',
        'Cookie': cookie || DEFAULT_COOKIE,
      },
    }, context);

    const data = await response.json();
    
    if (data.code !== 0) {
      // B站业务错误码，部分可重试
      if (data.code === -352 || data.code === -412) {
        // 风控/限流，记录但不抛错
        console.warn(`⚠️ ${context} 被限流 (code: ${data.code}): ${data.message}`);
        return [];
      }
      console.error(`❌ ${context} 获取失败:`, data.message);
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
  } catch (error: any) {
    console.error(`❌ ${context} 请求失败 (已重试):`, error.message);
    return [];
  }
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
        const allRawVideos: any[] = []; // 保留原始视频数据用于通知
        const newVideoTitles: string[] = [];
        let successCount = 0;
        let failCount = 0;

        // 3. 获取每个 UP 主的视频（带重试）
        for (const uploader of uploaders) {
          try {
            const videos = await getUploaderVideos(uploader.mid, user.bilibili_cookie, uploader.name);
            
            if (videos.length > 0) {
              successCount++;
              // 只保留今天发布的视频
              const todayVideos = videos.filter(v => v.pubdate >= todayTimestamp);
              
              for (const video of todayVideos) {
                allVideos.push(transformVideo(video, user.id, uploader.mid));
                allRawVideos.push(video); // 保存原始视频数据
                newVideoTitles.push(`${uploader.name}: ${video.title}`);
              }
              console.log(`✅ ${uploader.name}: ${videos.length} 个视频，今日 ${todayVideos.length} 个`);
            } else {
              failCount++;
              console.log(`⚠️ ${uploader.name} (mid: ${uploader.mid}): 无视频数据，可能被限流或UP主无动态`);
            }

            // 限流：每个UP主之间等待500ms（增加间隔减少限流风险）
            await new Promise(r => setTimeout(r, 500));
          } catch (err: any) {
            failCount++;
            console.error(`❌ UP主[${uploader.name}]失败:`, err.message);
          }
        }

        console.log(`统计: 成功 ${successCount}, 失败 ${failCount}`);

        // 4. 查询已存在的视频（带重试）
        if (allVideos.length > 0) {
          const bvids = allVideos.map(v => v.bvid);
          
          let existing: any[] = [];
          for (let attempt = 0; attempt <= 2; attempt++) {
            const { data, error } = await supabase
              .from('video')
              .select('bvid')
              .eq('user_id', user.id)
              .in('bvid', bvids);
            
            if (!error) {
              existing = data || [];
              break;
            }
            if (attempt < 2) {
              console.log(`⚠️ 查询已存在视频失败，重试中... (${attempt + 1}/2)`);
              await new Promise(r => setTimeout(r, 1000));
            }
          }

          const existingBvids = new Set(existing.map(v => v.bvid));
          const newVideos = allVideos.filter(v => !existingBvids.has(v.bvid));
          const newRawVideos = allRawVideos.filter(v => !existingBvids.has(v.bvid));

          // 5. 插入新视频（带重试）
          if (newVideos.length > 0) {
            let insertSuccess = false;
            for (let attempt = 0; attempt <= 2; attempt++) {
              const { error: insertError } = await supabase
                .from('video')
                .upsert(newVideos, { onConflict: 'user_id,platform,bvid' });

              if (!insertError) {
                insertSuccess = true;
                console.log(`✅ 成功插入 ${newVideos.length} 个新视频`);
                break;
              }
              
              if (attempt < 2) {
                console.log(`⚠️ 插入视频失败 (${insertError.message})，重试中... (${attempt + 1}/2)`);
                await new Promise(r => setTimeout(r, 1000));
              } else {
                console.error('❌ 插入视频最终失败:', insertError);
              }
            }

            // 6. 创建通知（带重试）
            if (insertSuccess) {
              const notification = {
                user_id: user.id,
                type: 'sync_result',
                title: `同步完成：新增 ${newVideos.length} 个视频`,
                content: newVideoTitles.slice(0, 5).join('\n') + (newVideoTitles.length > 5 ? `\n...等 ${newVideoTitles.length} 个` : ''),
                data: {
                  videos_added: newVideos.length,
                  new_videos: newRawVideos.slice(0, 10).map(v => ({
                    bvid: v.bvid,
                    title: v.title,
                    pic: v.pic,
                    pubdate: new Date(v.pubdate * 1000).toISOString(),
                  })),
                },
                is_read: false,
              };

              for (let attempt = 0; attempt <= 2; attempt++) {
                const { error } = await supabase.from('notification').insert(notification);
                if (!error) break;
                if (attempt < 2) {
                  await new Promise(r => setTimeout(r, 500));
                }
              }
            }
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
