/**
 * 客户端自动同步模块
 * 
 * 完整流程：
 * 1. 从 Supabase 读取 UP主列表
 * 2. 按限流策略依次调用 B站 API
 * 3. 将视频数据 UPSERT 到 Supabase
 * 4. 返回同步结果
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { getUploaderVideos, transformVideoToDbFormat } from './bilibili';
import type { Uploader } from './database.types';

const SYNC_CHECK_KEY = 'fluxfilter_last_sync';
const SYNC_INTERVAL_HOURS = 6; // 同步间隔（小时）

// 同步配置 - 有Cookie版（快速）
const SYNC_CONFIG = {
  delayBetweenUploaders: 1000,  // UP主之间间隔 1秒
  videosPerUploader: 10,        // 每个UP主获取最新10个
  onlyToday: true,              // 只同步今天的视频
};

/**
 * 检查是否需要同步
 */
export function shouldSync(): boolean {
  if (typeof window === 'undefined') return false;
  
  const lastSync = localStorage.getItem(SYNC_CHECK_KEY);
  if (!lastSync) return true;
  
  const lastSyncTime = parseInt(lastSync, 10);
  const hoursSinceSync = (Date.now() - lastSyncTime) / (1000 * 60 * 60);
  
  return hoursSinceSync >= SYNC_INTERVAL_HOURS;
}

/**
 * 记录同步时间
 */
export function markSynced(): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(SYNC_CHECK_KEY, Date.now().toString());
}

/**
 * 触发同步 - 统一入口
 */
export async function triggerSync(
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; message: string; videosAdded?: number }> {
  try {
    return await syncFromSupabase(onProgress);
  } catch (error: any) {
    console.error('同步失败:', error);
    
    const errMsg = error?.message || String(error);
    
    // 友好的错误提示
    if (errMsg.includes('-799') || errMsg.includes('频繁')) {
      return { success: false, message: '⏳ B站限流中，请等待2分钟后再试' };
    }
    if (errMsg.includes('-352') || errMsg.includes('风控')) {
      return { success: false, message: '🛡️ B站风控触发，请稍后再试' };
    }
    if (errMsg.includes('Supabase') || errMsg.includes('配置缺失')) {
      return { success: false, message: '⚠️ 请先配置 Supabase 环境变量' };
    }
    
    return { success: false, message: '同步失败: ' + errMsg };
  }
}

/**
 * 触发同步 - 指定UP主列表
 * @param shouldCancel - 返回 true 时中断同步
 */
export async function triggerSyncWithUploaders(
  uploaders: Uploader[],
  onProgress?: (msg: string) => void,
  shouldCancel?: () => boolean
): Promise<{ success: boolean; message: string; videosAdded?: number; cancelled?: boolean }> {
  try {
    return await syncWithUploaders(uploaders, onProgress, shouldCancel);
  } catch (error: any) {
    console.error('同步失败:', error);
    const errMsg = error?.message || String(error);
    
    if (errMsg.includes('-799') || errMsg.includes('频繁')) {
      return { success: false, message: '⏳ B站限流中，请等待2分钟后再试' };
    }
    if (errMsg.includes('-352') || errMsg.includes('风控')) {
      return { success: false, message: '🛡️ B站风控触发，请稍后再试' };
    }
    
    return { success: false, message: '同步失败: ' + errMsg };
  }
}

/**
 * 同步指定UP主列表
 */
async function syncWithUploaders(
  uploaders: Uploader[],
  onProgress?: (msg: string) => void,
  shouldCancel?: () => boolean
): Promise<{ success: boolean; message: string; videosAdded?: number; cancelled?: boolean }> {
  if (!isSupabaseConfigured) {
    return { success: false, message: '⚠️ 请先配置 Supabase 环境变量' };
  }

  if (!uploaders || uploaders.length === 0) {
    return { success: true, message: '⚠️ 没有选择UP主', videosAdded: 0 };
  }

  let totalAdded = 0;
  const results: string[] = [];
  let completedCount = 0;

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTimestamp = Math.floor(todayStart.getTime() / 1000);

  // ============================================
  // 智能调度：仅在必要时启用公平调度
  // ============================================
  const taskCount = uploaders.length;
  
  // 极速配置：最大并发（所有请求同时发出）
  const CONCURRENCY = Math.min(taskCount, 20); // 最多 20 并发
  
  // 公平调度阈值
  const needFairSchedule = taskCount >= 20;
  
  // ============================================
  // 阶段1：并发获取所有 UP 主的视频（纯网络请求）
  // ============================================
  type VideoData = {
    user_id: string;
    bvid: string;
    aid: number;
    mid: number;
    title: string;
    pic: string;
    description: string;
    duration: number;
    view_count: number;
    danmaku_count: number;
    reply_count: number;
    favorite_count: number;
    coin_count: number;
    share_count: number;
    like_count: number;
    pubdate: string;
  };
  
  const allVideos: VideoData[] = [];
  let rateLimitHits = 0;
  
  // 单个 UP 主获取任务（仅获取，不写入）
  const fetchOne = async (up: Uploader): Promise<{ name: string; videos: VideoData[]; rateLimited?: boolean }> => {
    if (shouldCancel?.()) {
      return { name: up.name, videos: [] };
    }
    
    try {
      const { videos } = await getUploaderVideos(up.mid, 1, SYNC_CONFIG.videosPerUploader);
      
      const todayVideos = SYNC_CONFIG.onlyToday 
        ? videos.filter(v => v.pubdate >= todayTimestamp)
        : videos;

      if (todayVideos.length === 0) {
        return { name: up.name, videos: [] };
      }

      const videoDataList = todayVideos.map(video => {
        const data = transformVideoToDbFormat(video, up.mid);
        return {
          user_id: up.user_id,
          bvid: data.bvid,
          aid: data.aid,
          mid: data.mid,
          title: data.title,
          pic: data.pic,
          description: data.description,
          duration: data.duration,
          view_count: data.view_count,
          danmaku_count: data.danmaku_count,
          reply_count: data.reply_count,
          favorite_count: data.favorite_count,
          coin_count: data.coin_count,
          share_count: data.share_count,
          like_count: data.like_count,
          pubdate: data.pubdate,
        };
      });

      return { name: up.name, videos: videoDataList };
    } catch (err: any) {
      const errMsg = err?.message || '';
      if (errMsg.includes('-799') || errMsg.includes('频繁') || errMsg.includes('-352') || errMsg.includes('风控')) {
        return { name: up.name, videos: [], rateLimited: true };
      }
      return { name: up.name, videos: [] };
    }
  };

  // ============================================
  // 阶段1：有限并发获取（避免触发B站风控）
  // ============================================
  const MAX_CONCURRENT = 8; // 最大并发数，平衡速度和风控
  
  onProgress?.(`🚀 获取 ${taskCount} 个UP主视频...`);
  
  const fetchResults: { name: string; videos: VideoData[]; rateLimited?: boolean }[] = [];
  const queue = [...uploaders];
  let activeCount = 0;
  
  // 有限并发执行
  await new Promise<void>((resolve) => {
    const runNext = async () => {
      while (queue.length > 0 && activeCount < MAX_CONCURRENT) {
        const up = queue.shift()!;
        activeCount++;
        
        (async () => {
          const result = await fetchOne(up);
          fetchResults.push(result);
          completedCount++;
          activeCount--;
          
          // 更新进度
          const percent = Math.round((completedCount / taskCount) * 100);
          onProgress?.(`🔄 [${completedCount}/${taskCount}] ${percent}%`);
          
          if (result.rateLimited) rateLimitHits++;
          
          // 继续下一个
          if (queue.length > 0) {
            runNext();
          } else if (activeCount === 0) {
            resolve();
          }
        })();
      }
      
      if (queue.length === 0 && activeCount === 0) {
        resolve();
      }
    };
    
    runNext();
  });
  
  if (shouldCancel?.()) {
    return { success: false, message: '已取消同步', videosAdded: 0, cancelled: true };
  }
  
  // 收集所有视频
  for (const result of fetchResults) {
    allVideos.push(...result.videos);
  }
  
  // ============================================
  // 阶段2：分批写入数据库（每批最多 200 条）
  // ============================================
  if (allVideos.length > 0) {
    const BATCH_SIZE = 200;
    const batches = [];
    
    for (let i = 0; i < allVideos.length; i += BATCH_SIZE) {
      batches.push(allVideos.slice(i, i + BATCH_SIZE));
    }
    
    onProgress?.(`💾 写入 ${allVideos.length} 个视频 (${batches.length} 批)...`);
    
    // 并发写入所有批次
    const writePromises = batches.map(batch => 
      supabase.from('video').upsert(batch, { onConflict: 'user_id,bvid' })
    );
    
    const writeResults = await Promise.all(writePromises);
    const successCount = writeResults.filter(r => !r.error).length;
    
    if (successCount === batches.length) {
      totalAdded = allVideos.length;
    } else {
      // 部分成功
      totalAdded = successCount * BATCH_SIZE;
    }
  }

  if (shouldCancel?.()) {
    return { success: false, message: '已取消同步', videosAdded: totalAdded, cancelled: true };
  }

  markSynced();

  return {
    success: true,
    message: `✅ 同步完成！新增 ${totalAdded} 个视频`,
    videosAdded: totalAdded,
  };
}

/**
 * 从 Supabase 同步
 */
async function syncFromSupabase(
  onProgress?: (msg: string) => void
): Promise<{ success: boolean; message: string; videosAdded?: number }> {
  
  // 检查 Supabase 配置
  if (!isSupabaseConfigured) {
    return {
      success: false,
      message: '⚠️ 请先配置 Supabase 环境变量（.env.local）',
    };
  }

  // 1. 获取 UP主列表
  onProgress?.('📋 获取UP主列表...');
  const { data: uploaders, error: uploaderError } = await supabase
    .from('uploader')
    .select('*')
    .eq('is_active', true);

  if (uploaderError) {
    throw new Error('获取UP主列表失败: ' + uploaderError.message);
  }

  if (!uploaders || uploaders.length === 0) {
    return { success: true, message: '⚠️ 没有配置UP主，请先添加UP主', videosAdded: 0 };
  }

  console.log(`📋 共 ${uploaders.length} 个UP主待同步`);

  let totalAdded = 0;
  const results: string[] = [];

  // 今天0点的时间戳（用于过滤）
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayTimestamp = Math.floor(todayStart.getTime() / 1000);

  // 2. 依次处理每个UP主（串行避免限流）
  for (let i = 0; i < uploaders.length; i++) {
    const up = uploaders[i] as Uploader;
    onProgress?.(`🔄 [${i + 1}/${uploaders.length}] ${up.name}...`);
    
    try {
      // 调用 B站 API - 只获取最新5个
      const { videos } = await getUploaderVideos(up.mid, 1, SYNC_CONFIG.videosPerUploader);
      
      // 过滤：只保留今天发布的视频
      const todayVideos = SYNC_CONFIG.onlyToday 
        ? videos.filter(v => v.pubdate >= todayTimestamp)
        : videos;

      if (todayVideos.length === 0) {
        results.push(`${up.name}: 0`);
        console.log(`📭 ${up.name}: 今天没有新视频`);
        
        // 继续下一个UP主前等待
        if (i < uploaders.length - 1) {
          await sleep(SYNC_CONFIG.delayBetweenUploaders);
        }
        continue;
      }

      // 3. 批量插入视频到数据库
      const videoDataList = todayVideos.map(video => {
        const data = transformVideoToDbFormat(video, up.mid);
        return {
          user_id: up.user_id,  // 添加用户ID
          bvid: data.bvid,
          aid: data.aid,
          mid: data.mid,
          title: data.title,
          pic: data.pic,
          description: data.description,
          duration: data.duration,
          view_count: data.view_count,
          danmaku_count: data.danmaku_count,
          reply_count: data.reply_count,
          favorite_count: data.favorite_count,
          coin_count: data.coin_count,
          share_count: data.share_count,
          like_count: data.like_count,
          pubdate: data.pubdate,
        };
      });

      // 批量 upsert（一次请求插入多个）
      const { error: insertError } = await supabase
        .from('video')
        .upsert(videoDataList, { onConflict: 'user_id,bvid' });

      if (!insertError) {
        totalAdded += todayVideos.length;
        results.push(`${up.name}: ${todayVideos.length}`);
        console.log(`✅ ${up.name}: 同步 ${todayVideos.length} 个今日视频`);
      } else {
        results.push(`${up.name}: 写入失败`);
        console.error(`❌ ${up.name} 写入失败:`, insertError);
      }

      // 限流：等待后再处理下一个UP主
      if (i < uploaders.length - 1) {
        await sleep(SYNC_CONFIG.delayBetweenUploaders);
      }

    } catch (error: any) {
      const errMsg = error?.message || '';
      
      // 遇到限流，等待更长时间后继续（不立即放弃）
      if (errMsg.includes('-799') || errMsg.includes('频繁')) {
        console.warn(`⏳ ${up.name} 触发限流，等待10秒后继续...`);
        results.push(`${up.name}: 限流`);
        await sleep(10000); // 等待10秒
        continue; // 跳过这个UP主，继续下一个
      }
      
      if (errMsg.includes('-352') || errMsg.includes('风控')) {
        // 风控错误，停止所有请求
        throw error;
      }
      
      results.push(`${up.name}: 失败`);
      console.error(`❌ ${up.name} 同步失败:`, error);
    }
  }

  markSynced();

  return {
    success: true,
    message: `✅ 同步完成！${results.join('，')}`,
    videosAdded: totalAdded,
  };
}

/**
 * 自动同步检查（在应用启动时调用）
 */
export async function autoSyncCheck(): Promise<void> {
  if (!shouldSync()) {
    console.log('📅 距上次同步不足6小时，跳过');
    return;
  }

  console.log('🔄 开始自动同步视频...');
  const result = await triggerSync();
  console.log(result.success ? `✅ ${result.message}` : `❌ ${result.message}`);
}

/**
 * 获取上次同步时间
 */
export function getLastSyncTime(): Date | null {
  if (typeof window === 'undefined') return null;
  
  const lastSync = localStorage.getItem(SYNC_CHECK_KEY);
  if (!lastSync) return null;
  
  return new Date(parseInt(lastSync, 10));
}

/**
 * 格式化上次同步时间
 */
export function formatLastSyncTime(): string {
  const lastSync = getLastSyncTime();
  if (!lastSync) return '从未同步';
  
  const now = new Date();
  const diffMs = now.getTime() - lastSync.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  
  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  
  return lastSync.toLocaleDateString('zh-CN');
}

// 工具函数
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
