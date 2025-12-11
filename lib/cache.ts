/**
 * 缓存管理模块
 * 提供内存缓存和 localStorage 持久化缓存
 */

// ============================================
// 内存缓存（页面刷新后失效）
// ============================================

interface CacheItem<T> {
  data: T;
  expireAt: number;
}

const memoryCache = new Map<string, CacheItem<any>>();

/**
 * 设置内存缓存
 * @param key 缓存键
 * @param data 缓存数据
 * @param ttlMs 过期时间（毫秒），默认 5 分钟
 */
export function setMemoryCache<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
  memoryCache.set(key, {
    data,
    expireAt: Date.now() + ttlMs,
  });
}

/**
 * 获取内存缓存
 * @param key 缓存键
 * @returns 缓存数据，过期或不存在返回 null
 */
export function getMemoryCache<T>(key: string): T | null {
  const item = memoryCache.get(key);
  if (!item) return null;
  
  if (Date.now() > item.expireAt) {
    memoryCache.delete(key);
    return null;
  }
  
  return item.data as T;
}

/**
 * 删除内存缓存
 */
export function deleteMemoryCache(key: string): void {
  memoryCache.delete(key);
}

/**
 * 清空所有内存缓存
 */
export function clearMemoryCache(): void {
  memoryCache.clear();
}

// ============================================
// localStorage 持久化缓存（页面刷新后保留）
// ============================================

interface StorageCacheItem<T> {
  data: T;
  expireAt: number;
  version: number;
}

// 缓存版本号，修改数据结构时递增，自动清理旧缓存
const CACHE_VERSION = 1;
const STORAGE_PREFIX = 'fluxfilter_cache_';

/**
 * 设置持久化缓存
 * @param key 缓存键
 * @param data 缓存数据
 * @param ttlMs 过期时间（毫秒），默认 1 小时
 */
export function setStorageCache<T>(key: string, data: T, ttlMs: number = 60 * 60 * 1000): void {
  try {
    const item: StorageCacheItem<T> = {
      data,
      expireAt: Date.now() + ttlMs,
      version: CACHE_VERSION,
    };
    localStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(item));
  } catch (err) {
    console.warn('缓存写入失败:', err);
  }
}

/**
 * 获取持久化缓存
 * @param key 缓存键
 * @returns 缓存数据，过期或不存在返回 null
 */
export function getStorageCache<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    
    const item: StorageCacheItem<T> = JSON.parse(raw);
    
    // 版本不匹配，清除
    if (item.version !== CACHE_VERSION) {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    
    // 已过期，清除
    if (Date.now() > item.expireAt) {
      localStorage.removeItem(STORAGE_PREFIX + key);
      return null;
    }
    
    return item.data;
  } catch (err) {
    return null;
  }
}

/**
 * 删除持久化缓存
 */
export function deleteStorageCache(key: string): void {
  localStorage.removeItem(STORAGE_PREFIX + key);
}

/**
 * 清空所有持久化缓存
 */
export function clearStorageCache(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(STORAGE_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  keysToRemove.forEach(key => localStorage.removeItem(key));
}

// ============================================
// 缓存键常量
// ============================================

export const CACHE_KEYS = {
  // UP主列表（持久化，1小时）
  UPLOADERS: (userId: string) => `uploaders_${userId}`,
  
  // 视频统计（持久化，30分钟）
  VIDEO_COUNT_BY_DATE: (userId: string) => `video_count_${userId}`,
  
  // 视频列表首页（内存，5分钟）
  VIDEOS_FIRST_PAGE: (userId: string) => `videos_first_${userId}`,
  
  // 待看列表（内存，5分钟）
  WATCHLIST: (userId: string) => `watchlist_${userId}`,
};

// ============================================
// 缓存 TTL 配置（毫秒）
// ============================================

export const CACHE_TTL = {
  UPLOADERS: 60 * 60 * 1000,        // 1小时
  VIDEO_COUNT: 30 * 60 * 1000,       // 30分钟
  VIDEOS: 5 * 60 * 1000,             // 5分钟
  WATCHLIST: 5 * 60 * 1000,          // 5分钟
};

// ============================================
// 带缓存的数据获取
// ============================================

/**
 * 带缓存的数据获取（内存优先，支持持久化）
 * @param key 缓存键
 * @param fetcher 数据获取函数
 * @param options 缓存选项
 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: {
    memoryTTL?: number;      // 内存缓存时间
    storageTTL?: number;     // 持久化缓存时间（不设置则不持久化）
    forceRefresh?: boolean;  // 强制刷新
  } = {}
): Promise<T> {
  const { memoryTTL = 5 * 60 * 1000, storageTTL, forceRefresh = false } = options;
  
  // 1. 如果不强制刷新，先检查内存缓存
  if (!forceRefresh) {
    const memoryData = getMemoryCache<T>(key);
    if (memoryData !== null) {
      return memoryData;
    }
    
    // 2. 检查持久化缓存
    if (storageTTL) {
      const storageData = getStorageCache<T>(key);
      if (storageData !== null) {
        // 写入内存缓存
        setMemoryCache(key, storageData, memoryTTL);
        return storageData;
      }
    }
  }
  
  // 3. 获取新数据
  const data = await fetcher();
  
  // 4. 写入缓存
  setMemoryCache(key, data, memoryTTL);
  if (storageTTL) {
    setStorageCache(key, data, storageTTL);
  }
  
  return data;
}

/**
 * 使缓存失效
 */
export function invalidateCache(key: string): void {
  deleteMemoryCache(key);
  deleteStorageCache(key);
  
  // 通知其他标签页缓存已失效
  broadcastCacheInvalidation(key);
}

// ============================================
// 缓存一致性保障
// ============================================

/**
 * 广播缓存失效事件（多标签页同步）
 */
function broadcastCacheInvalidation(key: string): void {
  try {
    // 使用 localStorage 事件实现跨标签页通信
    const eventKey = `${STORAGE_PREFIX}invalidate_${Date.now()}`;
    localStorage.setItem(eventKey, key);
    // 立即删除，只是为了触发 storage 事件
    localStorage.removeItem(eventKey);
  } catch (err) {
    // 忽略错误
  }
}

/**
 * 监听其他标签页的缓存失效事件
 */
export function setupCacheInvalidationListener(): () => void {
  const handler = (event: StorageEvent) => {
    if (event.key?.startsWith(`${STORAGE_PREFIX}invalidate_`) && event.newValue) {
      const invalidatedKey = event.newValue;
      // 清除本标签页的内存缓存
      deleteMemoryCache(invalidatedKey);
      console.log('[Cache] 收到缓存失效广播:', invalidatedKey);
    }
  };
  
  window.addEventListener('storage', handler);
  return () => window.removeEventListener('storage', handler);
}

/**
 * 批量使缓存失效
 */
export function invalidateCaches(keys: string[]): void {
  keys.forEach(key => invalidateCache(key));
}

/**
 * 使用户相关的所有缓存失效
 */
export function invalidateUserCaches(userId: string): void {
  const keysToInvalidate = [
    CACHE_KEYS.UPLOADERS(userId),
    CACHE_KEYS.VIDEO_COUNT_BY_DATE(userId),
    CACHE_KEYS.VIDEOS_FIRST_PAGE(userId),
    CACHE_KEYS.WATCHLIST(userId),
  ];
  invalidateCaches(keysToInvalidate);
}

/**
 * 缓存版本检查（数据结构变更时自动清理）
 */
export function checkCacheVersion(): void {
  const versionKey = 'fluxfilter_cache_version';
  const storedVersion = localStorage.getItem(versionKey);
  
  if (storedVersion !== String(CACHE_VERSION)) {
    console.log('[Cache] 缓存版本更新，清理旧缓存');
    clearStorageCache();
    localStorage.setItem(versionKey, String(CACHE_VERSION));
  }
}

// ============================================
// 跨设备缓存同步（服务端时间戳）
// ============================================

const LAST_UPDATE_KEY = 'fluxfilter_last_data_update';

/**
 * 记录本地最后同步时间
 */
export function setLocalLastUpdate(timestamp: number): void {
  localStorage.setItem(LAST_UPDATE_KEY, String(timestamp));
}

/**
 * 获取本地最后同步时间
 */
export function getLocalLastUpdate(): number {
  return parseInt(localStorage.getItem(LAST_UPDATE_KEY) || '0', 10);
}

/**
 * 检查跨设备缓存是否需要刷新
 * 对比本地记录的时间和服务端的时间
 */
export async function checkCrossDeviceSync(
  supabase: any,
  userId: string
): Promise<boolean> {
  try {
    // 获取服务端最后更新时间（从 user 表或专门的表）
    const { data } = await supabase
      .from('user')
      .select('updated_at')
      .eq('id', userId)
      .single();
    
    if (!data?.updated_at) return false;
    
    const serverTime = new Date(data.updated_at).getTime();
    const localTime = getLocalLastUpdate();
    
    // 服务端时间比本地新，说明其他设备有更新
    if (serverTime > localTime) {
      console.log('[Cache] 检测到其他设备有更新，清理本地缓存');
      invalidateUserCaches(userId);
      setLocalLastUpdate(serverTime);
      return true; // 需要刷新
    }
    
    return false;
  } catch (err) {
    console.warn('[Cache] 跨设备同步检查失败:', err);
    return false;
  }
}

/**
 * 标记服务端数据已更新（在写操作后调用）
 */
export async function markServerDataUpdated(
  supabase: any,
  userId: string
): Promise<void> {
  try {
    const now = new Date().toISOString();
    await supabase
      .from('user')
      .update({ updated_at: now })
      .eq('id', userId);
    
    setLocalLastUpdate(Date.now());
  } catch (err) {
    console.warn('[Cache] 标记更新时间失败:', err);
  }
}
