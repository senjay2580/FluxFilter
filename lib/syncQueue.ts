/**
 * 同步队列管理
 * 
 * 使用 Supabase 实现分布式同步队列，避免多用户同时请求导致限流
 */

import { supabase, isSupabaseConfigured } from './supabase';
import { getStoredUserId } from './auth';

// 队列配置
const QUEUE_CONFIG = {
  MAX_CONCURRENT: 5,        // 全局最大并发同步数
  WAIT_TIMEOUT: 60000,      // 最大等待时间（60秒）
  POLL_INTERVAL: 2000,      // 轮询间隔（2秒）
  LOCK_EXPIRE_TIME: 120000, // 锁过期时间（2分钟）
  // 防风暴配置
  STORM_THRESHOLD: 3,       // 触发防风暴的并发阈值
  STORM_JITTER_MIN: 1000,   // 随机延迟最小值（1秒）
  STORM_JITTER_MAX: 5000,   // 随机延迟最大值（5秒）
};

// 限流配置
const RATE_LIMIT_CONFIG = {
  MIN_SYNC_INTERVAL: 60000,   // 最小同步间隔（60秒）
  DEBOUNCE_DELAY: 500,        // 防抖延迟（500ms）
  MAX_SYNCS_PER_HOUR: 10,     // 每小时最大同步次数
};

// 本地存储键
const STORAGE_KEYS = {
  LAST_SYNC_TIME: 'fluxfilter_last_sync_time',
  SYNC_COUNT_HOUR: 'fluxfilter_sync_count_hour',
  SYNC_COUNT_RESET: 'fluxfilter_sync_count_reset',
};

interface SyncLock {
  id: string;
  user_id: string;
  started_at: string;
  expires_at: string;
}

/**
 * 尝试获取同步锁
 * 如果当前并发数未达上限，获取锁成功
 */
export async function acquireSyncLock(): Promise<{ success: boolean; position?: number; lockId?: string }> {
  if (!isSupabaseConfigured) {
    return { success: true }; // 未配置时直接允许
  }

  const userId = getStoredUserId();
  if (!userId) {
    return { success: false };
  }

  try {
    // 1. 清理过期的锁
    const expireTime = new Date(Date.now() - QUEUE_CONFIG.LOCK_EXPIRE_TIME).toISOString();
    await supabase
      .from('sync_lock')
      .delete()
      .lt('started_at', expireTime);

    // 2. 检查自己是否已有锁
    const { data: existingLocks } = await supabase
      .from('sync_lock')
      .select('id')
      .eq('user_id', userId)
      .limit(1);

    if (existingLocks && existingLocks.length > 0) {
      return { success: true, lockId: existingLocks[0].id };
    }

    // 3. 获取当前活跃锁数量
    const { count } = await supabase
      .from('sync_lock')
      .select('*', { count: 'exact', head: true });

    const currentCount = count || 0;

    // 4. 如果未达上限，尝试获取锁
    if (currentCount < QUEUE_CONFIG.MAX_CONCURRENT) {
      const { data: newLock, error } = await supabase
        .from('sync_lock')
        .insert({
          user_id: userId,
          started_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!error && newLock) {
        return { success: true, lockId: newLock.id };
      }
    }

    // 5. 返回排队位置
    return { 
      success: false, 
      position: currentCount - QUEUE_CONFIG.MAX_CONCURRENT + 1 
    };

  } catch (err) {
    console.error('获取同步锁失败:', err);
    return { success: true }; // 出错时允许同步，避免阻塞
  }
}

/**
 * 释放同步锁
 */
export async function releaseSyncLock(lockId?: string): Promise<void> {
  if (!isSupabaseConfigured) return;

  const userId = getStoredUserId();
  if (!userId) return;

  try {
    if (lockId) {
      await supabase.from('sync_lock').delete().eq('id', lockId);
    } else {
      await supabase.from('sync_lock').delete().eq('user_id', userId);
    }
  } catch (err) {
    console.error('释放同步锁失败:', err);
  }
}

/**
 * 等待获取同步锁
 * 
 * 优化策略：
 * - 单用户或低并发：直接返回，无任何延迟
 * - 多用户（≥3人）+ 排队：才启用等待和防风暴
 */
export async function waitForSyncLock(
  onWaiting?: (position: number) => void,
  onJitter?: (seconds: number) => void,
  taskCount?: number  // UP主数量，用于判断是否大任务
): Promise<{ success: boolean; lockId?: string; timedOut?: boolean; jitterApplied?: number }> {
  
  // 小任务（<15 UP主）：跳过队列机制，直接返回
  if (taskCount !== undefined && taskCount < 15) {
    // 尝试获取锁但不等待
    const result = await acquireSyncLock();
    return { success: true, lockId: result.lockId, jitterApplied: 0 };
  }
  
  const startTime = Date.now();

  while (Date.now() - startTime < QUEUE_CONFIG.WAIT_TIMEOUT) {
    const result = await acquireSyncLock();
    
    if (result.success) {
      // 检查是否需要防风暴
      const status = await getQueueStatus();
      
      // 只有高并发（≥3人）才启用防风暴延迟
      if (status.activeCount >= QUEUE_CONFIG.STORM_THRESHOLD) {
        const jitterFactor = (status.activeCount - QUEUE_CONFIG.STORM_THRESHOLD + 1) / QUEUE_CONFIG.MAX_CONCURRENT;
        const baseJitter = QUEUE_CONFIG.STORM_JITTER_MIN + 
          (QUEUE_CONFIG.STORM_JITTER_MAX - QUEUE_CONFIG.STORM_JITTER_MIN) * jitterFactor;
        const jitterMs = Math.floor(baseJitter * (0.7 + Math.random() * 0.6));
        
        if (onJitter) {
          onJitter(Math.ceil(jitterMs / 1000));
        }
        await new Promise(resolve => setTimeout(resolve, jitterMs));
        return { success: true, lockId: result.lockId, jitterApplied: jitterMs };
      }
      
      // 低并发：直接返回
      return { success: true, lockId: result.lockId, jitterApplied: 0 };
    }

    // 需要排队
    if (result.position && onWaiting) {
      onWaiting(result.position);
    }

    await new Promise(resolve => setTimeout(resolve, QUEUE_CONFIG.POLL_INTERVAL));
  }

  return { success: false, timedOut: true };
}

/**
 * 获取当前队列状态
 */
export async function getQueueStatus(): Promise<{ 
  activeCount: number; 
  maxConcurrent: number;
  isAvailable: boolean;
}> {
  if (!isSupabaseConfigured) {
    return { activeCount: 0, maxConcurrent: QUEUE_CONFIG.MAX_CONCURRENT, isAvailable: true };
  }

  try {
    const { count } = await supabase
      .from('sync_lock')
      .select('*', { count: 'exact', head: true });

    const activeCount = count || 0;
    
    return {
      activeCount,
      maxConcurrent: QUEUE_CONFIG.MAX_CONCURRENT,
      isAvailable: activeCount < QUEUE_CONFIG.MAX_CONCURRENT,
    };
  } catch {
    return { activeCount: 0, maxConcurrent: QUEUE_CONFIG.MAX_CONCURRENT, isAvailable: true };
  }
}

// ============================================
// 限流、节流、防抖机制
// ============================================

/**
 * 检查是否可以同步（节流检查）
 * 返回剩余等待时间（秒），0 表示可以同步
 */
export function checkSyncThrottle(): { canSync: boolean; waitSeconds: number; reason?: string } {
  try {
    const now = Date.now();
    
    // 1. 检查最小同步间隔（节流）
    const lastSyncTime = parseInt(localStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME) || '0');
    const timeSinceLastSync = now - lastSyncTime;
    
    if (timeSinceLastSync < RATE_LIMIT_CONFIG.MIN_SYNC_INTERVAL) {
      const waitSeconds = Math.ceil((RATE_LIMIT_CONFIG.MIN_SYNC_INTERVAL - timeSinceLastSync) / 1000);
      return { 
        canSync: false, 
        waitSeconds, 
        reason: `请等待 ${waitSeconds} 秒后再同步` 
      };
    }
    
    // 2. 检查每小时同步次数限制
    const countResetTime = parseInt(localStorage.getItem(STORAGE_KEYS.SYNC_COUNT_RESET) || '0');
    let syncCount = parseInt(localStorage.getItem(STORAGE_KEYS.SYNC_COUNT_HOUR) || '0');
    
    // 如果过了1小时，重置计数
    if (now - countResetTime > 3600000) {
      syncCount = 0;
      localStorage.setItem(STORAGE_KEYS.SYNC_COUNT_RESET, now.toString());
      localStorage.setItem(STORAGE_KEYS.SYNC_COUNT_HOUR, '0');
    }
    
    if (syncCount >= RATE_LIMIT_CONFIG.MAX_SYNCS_PER_HOUR) {
      const resetIn = Math.ceil((3600000 - (now - countResetTime)) / 60000);
      return { 
        canSync: false, 
        waitSeconds: resetIn * 60, 
        reason: `已达到每小时同步上限 (${RATE_LIMIT_CONFIG.MAX_SYNCS_PER_HOUR}次)，${resetIn} 分钟后重置` 
      };
    }
    
    return { canSync: true, waitSeconds: 0 };
  } catch {
    return { canSync: true, waitSeconds: 0 };
  }
}

/**
 * 记录同步完成（更新节流计数器）
 */
export function recordSyncComplete(): void {
  try {
    const now = Date.now();
    localStorage.setItem(STORAGE_KEYS.LAST_SYNC_TIME, now.toString());
    
    // 更新每小时计数
    const countResetTime = parseInt(localStorage.getItem(STORAGE_KEYS.SYNC_COUNT_RESET) || '0');
    let syncCount = parseInt(localStorage.getItem(STORAGE_KEYS.SYNC_COUNT_HOUR) || '0');
    
    if (now - countResetTime > 3600000) {
      syncCount = 0;
      localStorage.setItem(STORAGE_KEYS.SYNC_COUNT_RESET, now.toString());
    }
    
    localStorage.setItem(STORAGE_KEYS.SYNC_COUNT_HOUR, (syncCount + 1).toString());
  } catch {
    // 忽略 localStorage 错误
  }
}

/**
 * 获取同步限流状态
 */
export function getSyncRateLimitStatus(): {
  lastSyncTime: Date | null;
  syncCountThisHour: number;
  maxSyncsPerHour: number;
  minIntervalSeconds: number;
  canSyncIn: number;
} {
  try {
    const now = Date.now();
    const lastSyncTime = parseInt(localStorage.getItem(STORAGE_KEYS.LAST_SYNC_TIME) || '0');
    const countResetTime = parseInt(localStorage.getItem(STORAGE_KEYS.SYNC_COUNT_RESET) || '0');
    let syncCount = parseInt(localStorage.getItem(STORAGE_KEYS.SYNC_COUNT_HOUR) || '0');
    
    if (now - countResetTime > 3600000) {
      syncCount = 0;
    }
    
    const timeSinceLastSync = now - lastSyncTime;
    const canSyncIn = Math.max(0, Math.ceil((RATE_LIMIT_CONFIG.MIN_SYNC_INTERVAL - timeSinceLastSync) / 1000));
    
    return {
      lastSyncTime: lastSyncTime ? new Date(lastSyncTime) : null,
      syncCountThisHour: syncCount,
      maxSyncsPerHour: RATE_LIMIT_CONFIG.MAX_SYNCS_PER_HOUR,
      minIntervalSeconds: RATE_LIMIT_CONFIG.MIN_SYNC_INTERVAL / 1000,
      canSyncIn,
    };
  } catch {
    return {
      lastSyncTime: null,
      syncCountThisHour: 0,
      maxSyncsPerHour: RATE_LIMIT_CONFIG.MAX_SYNCS_PER_HOUR,
      minIntervalSeconds: RATE_LIMIT_CONFIG.MIN_SYNC_INTERVAL / 1000,
      canSyncIn: 0,
    };
  }
}

/**
 * 创建防抖函数
 */
export function createSyncDebounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number = RATE_LIMIT_CONFIG.DEBOUNCE_DELAY
): (...args: Parameters<T>) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      fn(...args);
      timeoutId = null;
    }, delay);
  };
}

/**
 * 同步按钮点击防抖 Hook
 */
let syncClickTimeout: ReturnType<typeof setTimeout> | null = null;
let lastClickTime = 0;

export function handleSyncClick(callback: () => void): boolean {
  const now = Date.now();
  
  // 防止快速双击（500ms 内的重复点击）
  if (now - lastClickTime < RATE_LIMIT_CONFIG.DEBOUNCE_DELAY) {
    return false;
  }
  
  lastClickTime = now;
  
  // 清除之前的定时器
  if (syncClickTimeout) {
    clearTimeout(syncClickTimeout);
  }
  
  // 延迟执行，防止抖动
  syncClickTimeout = setTimeout(() => {
    callback();
    syncClickTimeout = null;
  }, 100);
  
  return true;
}
