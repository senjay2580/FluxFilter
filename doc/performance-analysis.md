# FluxFilter 性能分析报告

## 一、当前架构问题诊断

### 1.1 数据获取现状

| 组件 | 数据源 | 获取时机 | 问题 |
|------|--------|----------|------|
| `App.tsx` | `video` + `uploader` | 每次切换到 home | 全量查询，无分页 |
| `App.tsx` | `watchlist` | 每次切换 tab | 重复查询 |
| `App.tsx` | `collected_video` | 每次切换到 home | 仅获取 count |
| `SettingsModal` | `uploader` + `video` | 每次打开弹窗 | 重新查询，无缓存复用 |
| `useWatchlist` | `watchlist` + `video` + `uploader` | Hook 初始化 | 3次串行请求 |

### 1.2 核心问题

```
┌──────────────────────────────────────────────────────────────┐
│                    当前数据流问题                              │
├──────────────────────────────────────────────────────────────┤
│                                                              │
│   App.tsx                    SettingsModal                   │
│      │                            │                          │
│      ├─→ fetchVideos()           ├─→ fetchData()            │
│      │   (查询 video + uploader)  │   (重复查询 video)       │
│      │                            │                          │
│      ├─→ fetchWatchlist()        │                          │
│      │   (仅查 bvid)             │                          │
│      │                            │                          │
│   useWatchlist Hook              │                          │
│      │                            │                          │
│      └─→ 又查一次 watchlist      │                          │
│          + video + uploader      │                          │
│                                                              │
│   问题：同一数据被多次查询，组件间无状态共享                    │
└──────────────────────────────────────────────────────────────┘
```

### 1.3 性能瓶颈量化

| 场景 | 请求次数 | 潜在问题 |
|------|----------|----------|
| 进入首页 | 3-4次 | video, watchlist, collected_video count |
| 打开设置 | 2次 | 重新查询 uploader, video |
| 切换 tab | 1-2次 | 重复查询 watchlist |
| 刷新操作 | 全量 | 无增量更新 |

---

## 二、性能优化策略

### 2.1 缓存策略矩阵

| 数据类型 | 变化频率 | 推荐策略 | TTL |
|----------|----------|----------|-----|
| 视频列表 | 低 (同步时更新) | Memory + IndexedDB | 5-10分钟 |
| UP主列表 | 极低 | Memory Cache | 30分钟 |
| 待看列表 | 中 (用户操作) | Memory + 乐观更新 | 实时 |
| 统计数量 | 低 | Memory Cache | 5分钟 |

### 2.2 推荐架构

```
┌─────────────────────────────────────────────────────────────────┐
│                      推荐数据层架构                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│                    React Context (全局状态)                      │
│                           │                                     │
│         ┌─────────────────┼─────────────────┐                   │
│         │                 │                 │                   │
│         ▼                 ▼                 ▼                   │
│   VideoStore        WatchlistStore    UploaderStore             │
│   ├─ videos[]       ├─ items[]        ├─ list[]                │
│   ├─ loading        ├─ bvidSet        ├─ loading               │
│   ├─ lastFetch      ├─ add()          └─ refresh()             │
│   ├─ refresh()      ├─ remove()                                │
│   └─ getByFilter()  └─ toggle()                                │
│         │                 │                                     │
│         └────────┬────────┘                                     │
│                  │                                              │
│                  ▼                                              │
│            Supabase API                                         │
│                  │                                              │
│                  ▼                                              │
│         LocalStorage / IndexedDB (离线缓存)                      │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 三、具体问题分析

### 3.1 每次进入页面都查询 - 性能影响

**当前代码问题：**
```typescript
// App.tsx - 每次切换到 home 都会执行
useEffect(() => {
  if (activeTab === 'home') {
    fetchVideos();  // ❌ 无条件重新查询
  }
}, [activeTab]);
```

**优化方案：**
```typescript
// 添加缓存有效性检查
const CACHE_TTL = 5 * 60 * 1000; // 5分钟

useEffect(() => {
  if (activeTab === 'home') {
    const now = Date.now();
    if (!lastFetchTime || now - lastFetchTime > CACHE_TTL) {
      fetchVideos();
      setLastFetchTime(now);
    }
  }
}, [activeTab]);
```

### 3.2 缓存一致性问题

**场景：用户在 A 组件添加待看，B 组件需要同步显示**

```
┌─────────────────────────────────────────────────────────────┐
│                   缓存一致性解决方案                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   方案一：事件总线 (推荐简单场景)                             │
│   ─────────────────────────────────────                     │
│   VideoCard                   WatchLaterList                │
│      │                              ▲                       │
│      │ addToWatchlist()             │                       │
│      │                              │                       │
│      └──→ emit('watchlist:add')  ───┘                       │
│                                                             │
│   方案二：全局 Context (推荐复杂场景)                         │
│   ─────────────────────────────────────                     │
│   <WatchlistProvider>                                       │
│      │                                                      │
│      ├─→ VideoCard (useWatchlist().add)                    │
│      │                                                      │
│      └─→ WatchLaterList (useWatchlist().items)             │
│          自动同步，无需手动刷新                              │
│                                                             │
│   方案三：乐观更新 (最佳用户体验)                             │
│   ─────────────────────────────────────                     │
│   1. 先更新本地状态 (立即响应)                               │
│   2. 异步发送请求                                           │
│   3. 失败时回滚                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.3 组件间数据传递 vs 重新查询

**决策树：**

```
需要另一个组件的数据？
        │
        ▼
   数据已在父组件？
        │
    ┌───┴───┐
   YES      NO
    │        │
    ▼        ▼
  Props   数据量大？
  传递        │
         ┌───┴───┐
        YES      NO
         │        │
         ▼        ▼
     Context   重新查询
     共享     (加缓存)
```

**你提到的场景："就差一个字段"**

```typescript
// ❌ 错误做法：为一个字段重新查询
const { data } = await supabase.from('video').select('*').eq('bvid', bvid);

// ✅ 正确做法 1：扩展原查询
// 在最初查询时就包含需要的字段
.select('*, uploader(name, face, sign)')  // 多查一个 sign

// ✅ 正确做法 2：Props 传递
<DetailModal video={currentVideo} />  // 传递已有数据

// ✅ 正确做法 3：补充查询单个字段
const { data } = await supabase
  .from('uploader')
  .select('sign')  // 只查缺失字段
  .eq('mid', video.mid)
  .single();
```

---

## 四、接口合并建议

### 4.1 当前重复请求

| 请求 | 调用位置 | 可合并性 |
|------|----------|----------|
| `video + uploader` | App.tsx, SettingsModal | ✅ 可共享 |
| `watchlist.bvid` | App.tsx fetchWatchlist | ✅ 合并到完整查询 |
| `collected_video count` | App.tsx loadCounts | ✅ 合并到统计接口 |

### 4.2 合并方案

**创建统一的数据服务：**

```typescript
// lib/dataService.ts
class DataService {
  private videoCache: VideoWithUploader[] | null = null;
  private videoCacheTime: number = 0;
  private watchlistCache: Set<string> = new Set();
  
  async getVideos(userId: string, forceRefresh = false): Promise<VideoWithUploader[]> {
    const now = Date.now();
    if (!forceRefresh && this.videoCache && now - this.videoCacheTime < 5 * 60 * 1000) {
      return this.videoCache;
    }
    
    const { data } = await supabase
      .from('video')
      .select('*, uploader:uploader!fk_video_uploader (name, face)')
      .eq('user_id', userId)
      .order('pubdate', { ascending: false });
    
    this.videoCache = data || [];
    this.videoCacheTime = now;
    return this.videoCache;
  }
  
  async getDashboardStats(userId: string) {
    // 一次请求获取所有统计
    const [videos, watchlist, collected] = await Promise.all([
      this.getVideos(userId),
      supabase.from('watchlist').select('bvid').eq('user_id', userId),
      supabase.from('collected_video').select('*', { count: 'exact', head: true }).eq('user_id', userId)
    ]);
    
    return {
      videoCount: videos.length,
      watchlistBvids: new Set(watchlist.data?.map(w => w.bvid)),
      collectedCount: collected.count || 0
    };
  }
  
  invalidateCache() {
    this.videoCache = null;
    this.videoCacheTime = 0;
  }
}

export const dataService = new DataService();
```

---

## 五、性能指标监控

### 5.1 关键指标

| 指标 | 目标值 | 测量方法 |
|------|--------|----------|
| 首页加载时间 | < 1s | `performance.now()` |
| 接口响应时间 | < 300ms | Supabase Dashboard |
| 缓存命中率 | > 80% | 自定义计数器 |
| 重复请求率 | < 10% | 网络面板分析 |

### 5.2 简单监控代码

```typescript
// lib/performance.ts
const apiMetrics = new Map<string, number[]>();

export function trackApiCall(name: string, duration: number) {
  const metrics = apiMetrics.get(name) || [];
  metrics.push(duration);
  if (metrics.length > 100) metrics.shift();
  apiMetrics.set(name, metrics);
}

export function getApiStats(name: string) {
  const metrics = apiMetrics.get(name) || [];
  if (metrics.length === 0) return null;
  
  return {
    avg: metrics.reduce((a, b) => a + b, 0) / metrics.length,
    max: Math.max(...metrics),
    min: Math.min(...metrics),
    count: metrics.length
  };
}
```

---

## 六、总结与行动项

### 立即可做 (低成本高收益)

1. **添加缓存 TTL 检查** - 避免重复查询
2. **合并 Promise.all** - 并行请求统计数据
3. **移除 useWatchlist Hook 中的冗余查询** - 复用 App.tsx 的数据

### 中期优化 (需要重构)

1. **实现 DataService 单例** - 统一数据管理
2. **添加 React Context** - 全局状态共享
3. **实现乐观更新** - 提升用户体验

### 长期架构 (可选)

1. **引入 React Query / SWR** - 专业的数据缓存库
2. **实现 IndexedDB 离线缓存** - 支持离线使用
3. **WebSocket 实时同步** - 多端数据一致性
