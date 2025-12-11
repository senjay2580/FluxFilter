# FluxFilter 重构实施指南

## 一、当前代码问题清单

### 1.1 App.tsx 数据获取问题

```typescript
// 问题 1: 每次切换 tab 都重新查询
useEffect(() => {
  if (activeTab === 'home' && currentUser?.id) {
    fetchVideos();      // ❌ 无缓存检查
    fetchWatchlist();   // ❌ 无缓存检查
  }
}, [activeTab, currentUser?.id]);

// 问题 2: loadCounts 重复调用
useEffect(() => {
  loadCounts();
  if (activeTab === 'home') loadCounts();  // ❌ 会执行两次
}, [activeTab]);

// 问题 3: fetchWatchlist 只查 bvid
const fetchWatchlist = async () => {
  const { data } = await supabase
    .from('watchlist')
    .select('bvid')  // ❌ 后续还需要查完整信息
    .eq('user_id', userId);
};
```

### 1.2 SettingsModal 重复查询

```typescript
// SettingsModal.tsx
const fetchData = async () => {
  // ❌ 重新查询 video，App.tsx 已经查过了
  const { data: videoData } = await supabase
    .from('video')
    .select('...')
    .eq('user_id', currentUser.id);
};
```

### 1.3 useWatchlist Hook 的 N+1 问题

```typescript
// hooks/useWatchlist.ts
const fetchWatchlist = async () => {
  // 查询 1: 获取 watchlist
  const { data: watchlistData } = await supabase.from('watchlist').select('*');
  
  // 查询 2: 获取 videos (❌ 可能 App.tsx 已查过)
  const { data: videoData } = await supabase.from('video').select('...');
  
  // 查询 3: 获取 uploaders (❌ 重复)
  const { data: uploaderData } = await supabase.from('uploader').select('...');
};
```

---

## 二、分步重构计划

### Phase 1: 添加简单缓存（1-2小时）

**目标：** 减少重复请求，不改变现有架构

#### Step 1.1: 创建缓存工具

```typescript
// lib/cache.ts
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL = 5 * 60 * 1000; // 5分钟
const memoryCache = new Map<string, CacheEntry<any>>();

export function getCache<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

export function setCache<T>(key: string, data: T): void {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

export function invalidateCache(pattern?: string): void {
  if (!pattern) {
    memoryCache.clear();
  } else {
    for (const key of memoryCache.keys()) {
      if (key.includes(pattern)) {
        memoryCache.delete(key);
      }
    }
  }
}
```

#### Step 1.2: 修改 App.tsx 的 fetchVideos

```typescript
// App.tsx
import { getCache, setCache, invalidateCache } from './lib/cache';

const fetchVideos = useCallback(async (forceRefresh = false) => {
  const cacheKey = `videos:${currentUser?.id}`;
  
  // 检查缓存
  if (!forceRefresh) {
    const cached = getCache<VideoWithUploader[]>(cacheKey);
    if (cached) {
      setVideos(cached);
      setLoading(false);
      return;
    }
  }
  
  // 原有查询逻辑...
  const { data } = await supabase.from('video').select('...');
  
  // 存入缓存
  setCache(cacheKey, data || []);
  setVideos(data || []);
}, [currentUser?.id]);

// 下拉刷新时强制刷新
const handleRefresh = () => {
  fetchVideos(true);
};

// 同步完成后清除缓存
const handleSyncComplete = () => {
  invalidateCache('videos');
  fetchVideos(true);
};
```

#### Step 1.3: 修复 loadCounts 重复调用

```typescript
// 修改前
useEffect(() => {
  loadCounts();
  if (activeTab === 'home') loadCounts();  // 重复！
}, [activeTab]);

// 修改后
useEffect(() => {
  if (activeTab === 'home') {
    loadCounts();
  }
}, [activeTab]);
```

---

### Phase 2: 统一数据服务（2-3小时）

**目标：** 创建集中式数据管理，避免重复查询

#### Step 2.1: 创建 DataService

```typescript
// lib/dataService.ts
import { supabase } from './supabase';
import { getCache, setCache, invalidateCache } from './cache';
import type { VideoWithUploader } from './database.types';

class DataService {
  private userId: string | null = null;
  
  setUserId(id: string | null) {
    if (this.userId !== id) {
      this.userId = id;
      invalidateCache();  // 切换用户时清缓存
    }
  }
  
  async getVideos(forceRefresh = false): Promise<VideoWithUploader[]> {
    if (!this.userId) return [];
    
    const cacheKey = `videos:${this.userId}`;
    
    if (!forceRefresh) {
      const cached = getCache<VideoWithUploader[]>(cacheKey);
      if (cached) return cached;
    }
    
    const { data, error } = await supabase
      .from('video')
      .select('*, uploader:uploader!fk_video_uploader (name, face, sign)')
      .eq('user_id', this.userId)
      .order('pubdate', { ascending: false });
    
    if (error) throw error;
    
    const result = data || [];
    setCache(cacheKey, result);
    return result;
  }
  
  async getWatchlistBvids(forceRefresh = false): Promise<Set<string>> {
    if (!this.userId) return new Set();
    
    const cacheKey = `watchlist:${this.userId}`;
    
    if (!forceRefresh) {
      const cached = getCache<string[]>(cacheKey);
      if (cached) return new Set(cached);
    }
    
    const { data } = await supabase
      .from('watchlist')
      .select('bvid')
      .eq('user_id', this.userId);
    
    const bvids = data?.map(d => d.bvid) || [];
    setCache(cacheKey, bvids);
    return new Set(bvids);
  }
  
  async getUploaders(forceRefresh = false) {
    if (!this.userId) return [];
    
    const cacheKey = `uploaders:${this.userId}`;
    
    if (!forceRefresh) {
      const cached = getCache(cacheKey);
      if (cached) return cached;
    }
    
    const { data } = await supabase
      .from('uploader')
      .select('*')
      .eq('user_id', this.userId)
      .order('created_at', { ascending: false });
    
    setCache(cacheKey, data || []);
    return data || [];
  }
  
  async getDashboardCounts(): Promise<{
    collected: number;
    todo: number;
    reminder: number;
  }> {
    if (!this.userId) return { collected: 0, todo: 0, reminder: 0 };
    
    // 使用 Promise.all 并行查询
    const [{ count }] = await Promise.all([
      supabase
        .from('collected_video')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', this.userId)
    ]);
    
    // 本地数据
    const todos = JSON.parse(localStorage.getItem('todos') || '[]');
    const tasks = JSON.parse(localStorage.getItem('interval-reminder-tasks') || '[]');
    
    return {
      collected: count || 0,
      todo: todos.filter((t: any) => !t.completed).length,
      reminder: tasks.filter((t: any) => t.isActive).length
    };
  }
  
  // 添加待看
  async addToWatchlist(bvid: string): Promise<boolean> {
    if (!this.userId) return false;
    
    const { error } = await supabase
      .from('watchlist')
      .insert({ bvid, user_id: this.userId });
    
    if (error) {
      if (error.code === '23505') return false;  // 已存在
      throw error;
    }
    
    // 更新缓存
    const cacheKey = `watchlist:${this.userId}`;
    const cached = getCache<string[]>(cacheKey);
    if (cached) {
      setCache(cacheKey, [...cached, bvid]);
    }
    
    return true;
  }
  
  // 移除待看
  async removeFromWatchlist(bvid: string): Promise<boolean> {
    if (!this.userId) return false;
    
    const { error } = await supabase
      .from('watchlist')
      .delete()
      .eq('bvid', bvid)
      .eq('user_id', this.userId);
    
    if (error) throw error;
    
    // 更新缓存
    const cacheKey = `watchlist:${this.userId}`;
    const cached = getCache<string[]>(cacheKey);
    if (cached) {
      setCache(cacheKey, cached.filter(b => b !== bvid));
    }
    
    return true;
  }
  
  // 失效缓存
  invalidateVideos() {
    invalidateCache('videos');
  }
  
  invalidateWatchlist() {
    invalidateCache('watchlist');
  }
  
  invalidateAll() {
    invalidateCache();
  }
}

export const dataService = new DataService();
```

#### Step 2.2: 在 App.tsx 中使用

```typescript
// App.tsx
import { dataService } from './lib/dataService';

// 设置用户 ID
useEffect(() => {
  dataService.setUserId(currentUser?.id || null);
}, [currentUser?.id]);

// 简化的数据加载
const loadData = useCallback(async (forceRefresh = false) => {
  setLoading(true);
  try {
    const [videos, watchlistBvids, counts] = await Promise.all([
      dataService.getVideos(forceRefresh),
      dataService.getWatchlistBvids(forceRefresh),
      dataService.getDashboardCounts()
    ]);
    
    setVideos(videos);
    setWatchLaterIds(watchlistBvids);
    setCollectedCount(counts.collected);
    setTodoCount(counts.todo);
    setReminderCount(counts.reminder);
  } finally {
    setLoading(false);
  }
}, []);

// 首次加载
useEffect(() => {
  if (currentUser?.id && activeTab === 'home') {
    loadData(false);  // 使用缓存
  }
}, [activeTab, currentUser?.id, loadData]);
```

---

### Phase 3: 传递数据给子组件（30分钟）

**目标：** 避免子组件重复查询

#### Step 3.1: SettingsModal 接收 Props

```typescript
// SettingsModal.tsx - 修改接口
interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
  // 新增：接收已有数据
  videos?: VideoWithUploader[];
  uploaders?: Uploader[];
}

const SettingsModal: React.FC<SettingsModalProps> = ({ 
  isOpen, 
  onClose, 
  onLogout,
  videos: initialVideos,
  uploaders: initialUploaders 
}) => {
  const [videos, setVideos] = useState(initialVideos || []);
  const [uploaders, setUploaders] = useState(initialUploaders || []);
  
  // 只在没有初始数据时才查询
  useEffect(() => {
    if (isOpen && !initialVideos) {
      fetchVideos();
    }
  }, [isOpen, initialVideos]);
};
```

#### Step 3.2: App.tsx 传递数据

```typescript
// App.tsx
<SettingsModal
  isOpen={isSettingsOpen}
  onClose={() => setIsSettingsOpen(false)}
  onLogout={handleLogout}
  videos={videos}           // 传递已有数据
  uploaders={uploaders}     // 如果已经有的话
/>
```

---

## 三、重构检查清单

### 完成 Phase 1 后检查

- [ ] 切换 tab 不再重复请求（看 Network 面板）
- [ ] 下拉刷新正常工作
- [ ] 同步后数据正确更新
- [ ] loadCounts 只执行一次

### 完成 Phase 2 后检查

- [ ] DataService 正确管理所有数据请求
- [ ] 缓存命中时无网络请求
- [ ] 用户切换时缓存正确清除
- [ ] 添加/删除待看后状态同步

### 完成 Phase 3 后检查

- [ ] SettingsModal 打开不发请求（使用传入数据）
- [ ] 子组件删除数据后父组件状态更新
- [ ] 无控制台报错

---

## 四、性能验证方法

### 4.1 Network 面板观察

```
打开 DevTools > Network > 筛选 Fetch/XHR

操作：从首页切换到设置再切回首页

优化前预期：
- GET /rest/v1/video - 3次
- GET /rest/v1/watchlist - 2次

优化后预期：
- GET /rest/v1/video - 1次（缓存命中后无请求）
- GET /rest/v1/watchlist - 1次
```

### 4.2 添加调试日志

```typescript
// lib/dataService.ts
async getVideos(forceRefresh = false) {
  const cacheKey = `videos:${this.userId}`;
  
  if (!forceRefresh) {
    const cached = getCache(cacheKey);
    if (cached) {
      console.log('📦 [Cache HIT] videos');  // 添加日志
      return cached;
    }
  }
  
  console.log('🌐 [Cache MISS] Fetching videos from Supabase');
  // ...
}
```

### 4.3 性能对比记录

| 操作 | 优化前 | 优化后 |
|------|--------|--------|
| 首次加载 | 3请求 / 800ms | 3请求 / 600ms (并行) |
| 切换 tab | 2请求 / 400ms | 0请求 / 10ms (缓存) |
| 打开设置 | 2请求 / 500ms | 0请求 / 10ms (Props) |
| 下拉刷新 | 3请求 / 800ms | 3请求 / 600ms |

---

## 五、常见问题 FAQ

### Q1: 缓存会导致数据不是最新的？

**A:** 是的，这是缓存的本质。解决方案：
1. 设置合理的 TTL（5分钟对于视频列表够用）
2. 关键操作后主动失效缓存
3. 提供下拉刷新让用户主动刷新

### Q2: 多个组件同时修改同一份数据怎么办？

**A:** 使用单一数据源（DataService），所有修改都通过它进行。它会负责更新缓存，其他组件重新获取时就能拿到最新数据。

### Q3: 用户快速操作会不会导致数据不一致？

**A:** 使用乐观更新 + 请求队列：
```typescript
// 乐观更新立即响应 UI
setWatchLaterIds(prev => new Set([...prev, bvid]));

// 请求失败时回滚
try {
  await dataService.addToWatchlist(bvid);
} catch {
  setWatchLaterIds(previousState);  // 回滚
}
```

### Q4: 这些改动会影响现有功能吗？

**A:** 按 Phase 分步进行，每个 Phase 都是增量改进，不破坏现有功能。建议每完成一个 Phase 就进行测试。
