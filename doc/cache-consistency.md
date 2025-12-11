# 缓存与一致性策略指南

## 一、缓存策略总览

### 1.1 为什么需要缓存？

```
无缓存的问题：
─────────────────────────────────────────────────────────
用户操作          请求次数         用户体验
─────────────────────────────────────────────────────────
打开首页          1次              等待 300ms
切换到设置        1次              又等待 300ms
切回首页          1次              又等待 300ms（重复！）
下拉刷新          1次              合理
                  ────
                  4次请求，其中 1 次是重复的
─────────────────────────────────────────────────────────

有缓存的优化：
─────────────────────────────────────────────────────────
用户操作          请求次数         用户体验
─────────────────────────────────────────────────────────
打开首页          1次              等待 300ms
切换到设置        0次（缓存命中）  立即显示 ✨
切回首页          0次（缓存命中）  立即显示 ✨
下拉刷新          1次              强制刷新
                  ────
                  2次请求，节省 50%！
─────────────────────────────────────────────────────────
```

### 1.2 缓存层级

```
┌─────────────────────────────────────────────────────────────┐
│                      缓存层级架构                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   Level 1: React State (最快，页面刷新丢失)                  │
│   ├─ useState 中的数据                                      │
│   └─ 生命周期：组件挂载期间                                  │
│                                                             │
│   Level 2: Memory Cache (快，标签页关闭丢失)                 │
│   ├─ 模块级变量 / 单例对象                                   │
│   └─ 生命周期：浏览器标签页打开期间                          │
│                                                             │
│   Level 3: SessionStorage (中，标签页关闭丢失)               │
│   ├─ 页面刷新保留                                           │
│   └─ 生命周期：浏览器会话期间                                │
│                                                             │
│   Level 4: LocalStorage (慢，持久化)                        │
│   ├─ 永久保存（除非清除）                                    │
│   └─ 生命周期：永久                                          │
│                                                             │
│   Level 5: IndexedDB (慢，大容量持久化)                     │
│   ├─ 支持大数据量、结构化数据                                │
│   └─ 生命周期：永久                                          │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 二、缓存实现方案

### 2.1 简单内存缓存（推荐起步）

```typescript
// lib/cache.ts

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;  // 毫秒
}

class SimpleCache {
  private store = new Map<string, CacheEntry<any>>();
  
  set<T>(key: string, data: T, ttlMs: number = 5 * 60 * 1000): void {
    this.store.set(key, {
      data,
      timestamp: Date.now(),
      ttl: ttlMs
    });
  }
  
  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    
    // 检查是否过期
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.store.delete(key);
      return null;
    }
    
    return entry.data as T;
  }
  
  invalidate(key: string): void {
    this.store.delete(key);
  }
  
  invalidatePattern(pattern: RegExp): void {
    for (const key of this.store.keys()) {
      if (pattern.test(key)) {
        this.store.delete(key);
      }
    }
  }
  
  clear(): void {
    this.store.clear();
  }
}

export const cache = new SimpleCache();
```

### 2.2 在数据获取中使用缓存

```typescript
// lib/dataService.ts

import { cache } from './cache';
import { supabase } from './supabase';

export async function getVideos(userId: string, forceRefresh = false) {
  const cacheKey = `videos:${userId}`;
  
  // 1. 检查缓存
  if (!forceRefresh) {
    const cached = cache.get<VideoWithUploader[]>(cacheKey);
    if (cached) {
      console.log('Cache HIT for videos');
      return cached;
    }
  }
  
  // 2. 查询数据库
  console.log('Cache MISS, fetching from Supabase...');
  const { data, error } = await supabase
    .from('video')
    .select('*, uploader:uploader!fk_video_uploader (name, face)')
    .eq('user_id', userId)
    .order('pubdate', { ascending: false });
  
  if (error) throw error;
  
  // 3. 存入缓存 (TTL: 5分钟)
  cache.set(cacheKey, data || [], 5 * 60 * 1000);
  
  return data || [];
}

// 刷新时调用
export function invalidateVideosCache(userId: string) {
  cache.invalidate(`videos:${userId}`);
}
```

### 2.3 在组件中使用

```typescript
function App() {
  const [videos, setVideos] = useState<VideoWithUploader[]>([]);
  const [loading, setLoading] = useState(true);
  
  const loadVideos = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    try {
      const data = await getVideos(currentUser.id, forceRefresh);
      setVideos(data);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);
  
  // 首次加载
  useEffect(() => {
    loadVideos(false);  // 使用缓存
  }, [loadVideos]);
  
  // 下拉刷新
  const handleRefresh = () => {
    loadVideos(true);  // 强制刷新
  };
  
  // 同步后刷新
  const handleSyncComplete = () => {
    invalidateVideosCache(currentUser.id);
    loadVideos(true);
  };
}
```

---

## 三、缓存一致性问题

### 3.1 问题场景

```
场景：用户在 A 组件添加待看，B 组件显示待看列表

时间线：
─────────────────────────────────────────────────────────
T1: 用户在 VideoCard 点击"添加待看"
T2: 请求发送到 Supabase
T3: Supabase 返回成功
T4: VideoCard 更新自己的状态 ✓
T5: WatchLaterList 还是旧数据 ✗ (不一致！)
─────────────────────────────────────────────────────────
```

### 3.2 解决方案一：事件广播

```typescript
// lib/events.ts
type EventHandler = (data: any) => void;

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();
  
  on(event: string, handler: EventHandler) {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
    
    // 返回取消订阅函数
    return () => this.handlers.get(event)?.delete(handler);
  }
  
  emit(event: string, data?: any) {
    this.handlers.get(event)?.forEach(handler => handler(data));
  }
}

export const eventBus = new EventBus();

// 定义事件类型
export const EVENTS = {
  WATCHLIST_ADD: 'watchlist:add',
  WATCHLIST_REMOVE: 'watchlist:remove',
  VIDEOS_UPDATED: 'videos:updated',
};
```

**使用：**

```typescript
// VideoCard.tsx - 发送事件
async function handleAddToWatchlist(bvid: string) {
  await addToWatchlist(bvid);
  eventBus.emit(EVENTS.WATCHLIST_ADD, { bvid });
}

// WatchLaterList.tsx - 监听事件
useEffect(() => {
  const unsubscribe = eventBus.on(EVENTS.WATCHLIST_ADD, ({ bvid }) => {
    // 更新本地状态或重新获取
    setWatchlist(prev => [...prev, { bvid, /* ... */ }]);
  });
  
  return unsubscribe;  // 组件卸载时取消订阅
}, []);
```

### 3.3 解决方案二：乐观更新 + 回滚

```typescript
// 乐观更新的完整流程
async function addToWatchlistOptimistic(bvid: string) {
  // 1. 保存旧状态（用于回滚）
  const previousIds = new Set(watchLaterIds);
  
  // 2. 乐观更新 UI（立即响应）
  setWatchLaterIds(prev => new Set([...prev, bvid]));
  
  try {
    // 3. 发送请求
    const { error } = await supabase
      .from('watchlist')
      .insert({ bvid, user_id: currentUser.id });
    
    if (error) throw error;
    
    // 4. 成功：状态已经是对的，不需要额外操作
    
  } catch (err) {
    // 5. 失败：回滚到旧状态
    setWatchLaterIds(previousIds);
    
    // 6. 提示用户
    toast.error('添加失败，请重试');
  }
}
```

### 3.4 解决方案三：全局 Store（推荐复杂应用）

```typescript
// stores/watchlistStore.ts
import { create } from 'zustand';  // 或使用 React Context

interface WatchlistStore {
  ids: Set<string>;
  loading: boolean;
  
  // Actions
  fetchIds: (userId: string) => Promise<void>;
  add: (bvid: string, userId: string) => Promise<void>;
  remove: (bvid: string, userId: string) => Promise<void>;
}

export const useWatchlistStore = create<WatchlistStore>((set, get) => ({
  ids: new Set(),
  loading: false,
  
  fetchIds: async (userId) => {
    set({ loading: true });
    const { data } = await supabase
      .from('watchlist')
      .select('bvid')
      .eq('user_id', userId);
    
    set({ 
      ids: new Set(data?.map(d => d.bvid) || []),
      loading: false 
    });
  },
  
  add: async (bvid, userId) => {
    // 乐观更新
    const prev = get().ids;
    set({ ids: new Set([...prev, bvid]) });
    
    try {
      await supabase.from('watchlist').insert({ bvid, user_id: userId });
    } catch {
      set({ ids: prev });  // 回滚
    }
  },
  
  remove: async (bvid, userId) => {
    const prev = get().ids;
    const next = new Set(prev);
    next.delete(bvid);
    set({ ids: next });
    
    try {
      await supabase.from('watchlist').delete().eq('bvid', bvid);
    } catch {
      set({ ids: prev });
    }
  },
}));

// 任意组件使用
function VideoCard({ video }) {
  const { ids, add } = useWatchlistStore();
  const isInList = ids.has(video.bvid);
  
  return (
    <button onClick={() => add(video.bvid, userId)}>
      {isInList ? '已添加' : '添加'}
    </button>
  );
}

function WatchLaterList() {
  const { ids } = useWatchlistStore();
  // 自动同步！无需手动刷新
}
```

---

## 四、缓存失效策略

### 4.1 何时使缓存失效？

| 事件 | 失效范围 | 原因 |
|------|----------|------|
| 同步完成 | videos 缓存 | 可能有新视频 |
| 添加/删除待看 | watchlist 缓存 | 数据已变更 |
| 删除 UP 主 | videos + uploaders | 关联数据变更 |
| 用户登出 | 全部缓存 | 切换用户 |
| 5分钟过期 | 自动失效 | TTL 机制 |

### 4.2 实现缓存失效

```typescript
// 同步完成后
async function handleSyncComplete() {
  cache.invalidatePattern(/^videos:/);  // 清除所有视频缓存
  await loadVideos(true);  // 重新加载
}

// 删除 UP 主后
async function handleDeleteUploader(uploaderId: number) {
  await supabase.from('uploader').delete().eq('id', uploaderId);
  
  // 失效相关缓存
  cache.invalidate(`uploaders:${userId}`);
  cache.invalidate(`videos:${userId}`);  // 视频也需要重新加载
  
  // 重新获取
  await Promise.all([
    loadUploaders(true),
    loadVideos(true)
  ]);
}

// 用户登出
function handleLogout() {
  cache.clear();  // 清除所有缓存
  // ... 其他登出逻辑
}
```

---

## 五、最佳实践总结

### 缓存策略选择

```
┌─────────────────────────────────────────────────────────────┐
│                   缓存策略决策树                              │
└─────────────────────────────────────────────────────────────┘

                数据更新频率？
                     │
          ┌──────────┼──────────┐
          │          │          │
          ▼          ▼          ▼
        高频        中频        低频
      (实时)    (分钟级)    (小时级)
          │          │          │
          ▼          ▼          ▼
      不缓存      内存缓存    LocalStorage
     或WebSocket  TTL 1-5分   + 内存缓存
          │          │          │
          │          │          │
          ▼          ▼          ▼
      待看操作   视频列表    UP主列表
      评论点赞   筛选结果    用户配置
```

### 一致性策略选择

```
┌─────────────────────────────────────────────────────────────┐
│                   一致性策略决策树                            │
└─────────────────────────────────────────────────────────────┘

              多少组件共享这份数据？
                      │
           ┌──────────┼──────────┐
           │          │          │
           ▼          ▼          ▼
         1-2个      3-5个       5+个
           │          │          │
           ▼          ▼          ▼
       Props/     事件广播    全局Store
       回调传递   EventBus   (Zustand/
           │          │      Context)
           │          │          │
           ▼          ▼          ▼
        简单场景   中等复杂    复杂应用
```

### 核心原则

1. **先用缓存，后查数据库** - 减少不必要的请求
2. **乐观更新优先** - 提升用户体验
3. **失效胜于更新** - 简单可靠
4. **单一数据源** - 避免状态分散
5. **适度缓存** - 不是所有数据都需要缓存
