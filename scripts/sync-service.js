#!/usr/bin/env node
/**
 * B站视频同步服务
 * 
 * 独立运行的定时任务脚本，部署在服务器上
 * 
 * 使用方法：
 * 1. 配置环境变量（见下方）
 * 2. npm install node-cron @supabase/supabase-js
 * 3. node sync-service.js
 * 
 * 或使用 PM2 保持运行：
 * pm2 start sync-service.js --name "bilibili-sync"
 */

const cron = require('node-cron');
const { createClient } = require('@supabase/supabase-js');

// ============================================
// 配置区域 - 请填写你的配置
// ============================================
const CONFIG = {
  // Supabase 配置
  SUPABASE_URL: process.env.SUPABASE_URL || '你的Supabase URL',
  SUPABASE_SERVICE_KEY: process.env.SUPABASE_SERVICE_KEY || '你的Service Role Key',
  
  // 定时任务配置（cron 表达式）
  // 默认：每天 6:30 和 17:00 执行
  CRON_SCHEDULE_MORNING: '30 6 * * *',   // 6:30
  CRON_SCHEDULE_EVENING: '0 17 * * *',   // 17:00
  
  // 请求延迟（毫秒），避免被B站风控
  REQUEST_DELAY: 500,
};

// B站API配置
const BILIBILI_API = 'https://api.bilibili.com';

// 初始化 Supabase
const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_SERVICE_KEY);

/**
 * 获取请求头
 */
function getHeaders(cookie = '') {
  return {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    'Referer': 'https://space.bilibili.com',
    'Origin': 'https://space.bilibili.com',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
    ...(cookie ? { 'Cookie': cookie } : {}),
  };
}

/**
 * 获取UP主视频列表
 */
async function fetchUploaderVideos(mid, cookie) {
  const url = `${BILIBILI_API}/x/space/arc/search?mid=${mid}&pn=1&ps=30&order=pubdate&tid=0&keyword=`;
  
  try {
    const response = await fetch(url, { headers: getHeaders(cookie) });
    const data = await response.json();
    
    if (data.code === 0 && data.data?.list?.vlist) {
      return data.data.list.vlist;
    }
    
    // 主接口失败，尝试备用接口
    console.log(`  ⚠️ 主接口失败 [${data.code}]: ${data.message}，尝试备用接口...`);
    return await fetchVideosFallback(mid, cookie);
  } catch (err) {
    console.log(`  ❌ 请求失败: ${err.message}`);
    return await fetchVideosFallback(mid, cookie);
  }
}

/**
 * 备用接口 - 用户动态
 */
async function fetchVideosFallback(mid, cookie) {
  const url = `${BILIBILI_API}/x/polymer/web-dynamic/v1/feed/space?host_mid=${mid}`;
  
  try {
    const response = await fetch(url, { headers: getHeaders(cookie) });
    const data = await response.json();
    
    if (data.code !== 0 || !data.data?.items) {
      return [];
    }
    
    const videos = [];
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
          pubdate: Math.floor((item.modules?.module_author?.pub_ts || Date.now() / 1000)),
        });
      }
    }
    return videos;
  } catch {
    return [];
  }
}

/**
 * 解析时长
 */
function parseDuration(str) {
  const parts = str.split(':').map(Number);
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return 0;
}

/**
 * 延迟函数
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * 同步单个用户的视频
 */
async function syncUserVideos(user, syncType) {
  const userId = user.id;
  const userCookie = user.bilibili_cookie || '';
  const errors = [];
  let addedCount = 0;
  
  console.log(`\n👤 同步用户: ${userId.slice(0, 8)}...`);
  
  if (!userCookie) {
    console.log('  ⚠️ 用户未配置 Cookie，跳过');
    return { userId, added: 0, errors: ['未配置 Cookie'] };
  }
  
  // 创建同步日志
  const { data: logData } = await supabase
    .from('sync_log')
    .insert({ user_id: userId, sync_type: syncType, status: 'running' })
    .select()
    .single();
  
  const logId = logData?.id;
  
  try {
    // 获取用户的UP主列表
    const { data: uploaders, error: uploaderError } = await supabase
      .from('uploader')
      .select('mid, name')
      .eq('user_id', userId)
      .eq('is_active', true);
    
    if (uploaderError) throw uploaderError;
    if (!uploaders || uploaders.length === 0) {
      console.log('  📭 没有关注的UP主');
      return { userId, added: 0, errors: [] };
    }
    
    console.log(`  📺 关注 ${uploaders.length} 个UP主`);
    
    // 遍历UP主
    for (const uploader of uploaders) {
      try {
        process.stdout.write(`  ⏳ ${uploader.name}... `);
        
        const videos = await fetchUploaderVideos(uploader.mid, userCookie);
        
        // 过滤今天的视频
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime() / 1000;
        const todayVideos = videos.filter(v => v.pubdate >= todayTimestamp);
        
        if (todayVideos.length === 0) {
          console.log('无新视频');
        } else {
          // 保存视频
          for (const video of todayVideos) {
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
            };
            
            const { error: upsertError } = await supabase
              .from('video')
              .upsert(videoData, { onConflict: 'user_id,bvid' });
            
            if (!upsertError) {
              addedCount++;
            }
          }
          console.log(`✅ ${todayVideos.length} 个新视频`);
        }
        
        await sleep(CONFIG.REQUEST_DELAY);
      } catch (err) {
        console.log(`❌ ${err.message}`);
        errors.push(`UP主 ${uploader.name}: ${err.message}`);
      }
    }
    
    // 更新同步日志
    const status = errors.length === 0 ? 'success' : (addedCount > 0 ? 'partial' : 'failed');
    if (logId) {
      await supabase
        .from('sync_log')
        .update({
          status,
          videos_added: addedCount,
          uploaders_synced: uploaders.length,
          error_message: errors.length > 0 ? errors.join('\n') : null,
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
    errors.push(String(err));
  }
  
  return { userId, added: addedCount, errors };
}

/**
 * 执行同步任务
 */
async function runSync(syncType = 'manual') {
  console.log('\n' + '='.repeat(50));
  console.log(`🚀 开始同步 - ${new Date().toLocaleString('zh-CN')}`);
  console.log(`📋 类型: ${syncType}`);
  console.log('='.repeat(50));
  
  try {
    // 获取所有用户
    const { data: users, error: userError } = await supabase
      .from('user')
      .select('id, bilibili_cookie');
    
    if (userError) throw userError;
    if (!users || users.length === 0) {
      console.log('❌ 没有用户');
      return;
    }
    
    console.log(`👥 共 ${users.length} 个用户`);
    
    let totalAdded = 0;
    const results = [];
    
    // 同步每个用户
    for (const user of users) {
      const result = await syncUserVideos(user, syncType);
      results.push(result);
      totalAdded += result.added;
    }
    
    console.log('\n' + '='.repeat(50));
    console.log(`✅ 同步完成！新增 ${totalAdded} 个视频`);
    console.log('='.repeat(50) + '\n');
    
  } catch (err) {
    console.error('❌ 同步失败:', err);
  }
}

// ============================================
// 主程序
// ============================================
console.log('🎬 B站视频同步服务启动');
console.log(`⏰ 定时任务: ${CONFIG.CRON_SCHEDULE_MORNING}, ${CONFIG.CRON_SCHEDULE_EVENING}`);

// 启动时执行一次
runSync('startup');

// 设置定时任务
cron.schedule(CONFIG.CRON_SCHEDULE_MORNING, () => {
  runSync('cron_morning');
});

cron.schedule(CONFIG.CRON_SCHEDULE_EVENING, () => {
  runSync('cron_evening');
});

console.log('✅ 定时任务已启动，按 Ctrl+C 退出\n');
