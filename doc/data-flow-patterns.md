# 前端数据流模式指南

## 一、组件间数据传递决策模型

### 1.1 决策流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                    数据传递决策流程                               │
└─────────────────────────────────────────────────────────────────┘

        组件 B 需要组件 A 的数据
                   │
                   ▼
          ┌───────────────┐
          │ A 和 B 是什么关系？│
          └───────┬───────┘
                  │
     ┌────────────┼────────────┐
     │            │            │
     ▼            ▼            ▼
   父子关系     兄弟关系      跨层级
     │            │            │
     ▼            ▼            ▼
  Props传递   状态提升      Context
     │         到共同        或
     │          父组件      全局Store
     │            │            │
     └────────────┴────────────┘
                  │
                  ▼
         ┌───────────────┐
         │  数据量大不大？  │
         └───────┬───────┘
                 │
        ┌────────┴────────┐
        │                 │
        ▼                 ▼
      小量数据          大量数据
    (< 50条)          (> 50条)
        │                 │
        ▼                 ▼
    直接传递          按需加载
    完整对象          传递ID
```

### 1.2 实际场景对照表

| 场景 | 关系 | 数据量 | 推荐方案 |
|------|------|--------|----------|
| VideoCard 显示 uploader 信息 | 父子 | 小 | Props 传递 |
| 首页和设置页共享视频列表 | 跨层级 | 大 | Context + 缓存 |
| 添加待看后刷新列表 | 兄弟 | - | 事件/回调 |
| 弹窗显示视频详情 | 父子 | 小 | Props 传递完整对象 |
| 多个页面显示待看数量 | 跨层级 | 小 | Context |

---

## 二、三种核心模式详解

### 模式一：Props 向下传递

**适用场景：** 父组件已有数据，子组件需要展示

```typescript
// ✅ 正确：父组件传递完整数据
function HomePage({ videos }) {
  return (
    <div>
      {videos.map(video => (
        <VideoCard 
          key={video.bvid}
          video={video}           // 传递完整对象
          uploader={video.uploader} // 已包含的关联数据
        />
      ))}
    </div>
  );
}

// ❌ 错误：子组件自己去查询
function VideoCard({ bvid }) {
  const [video, setVideo] = useState(null);
  
  useEffect(() => {
    // 这会导致 N 个卡片发 N 次请求！
    fetchVideo(bvid).then(setVideo);
  }, [bvid]);
}
```

**原则：数据向下流，避免子组件独立查询**

---

### 模式二：状态提升 + 回调

**适用场景：** 兄弟组件需要同步状态

```
┌─────────────────────────────────────────────────────────┐
│                    状态提升示意                          │
└─────────────────────────────────────────────────────────┘

        修改前                           修改后
        ─────                           ─────

    ComponentA      ComponentB       ParentComponent
        │               │                  │
        │  各自管理     │              ┌───┴───┐
        │   状态        │              │ state │ ← 状态提升到这里
        ▼               ▼              └───┬───┘
    [state]         [state]                │
        │               │           ┌──────┴──────┐
        ✗ 无法同步 ✗                │             │
                                    ▼             ▼
                               ComponentA    ComponentB
                               (props)       (props)
                                    ✓ 自动同步 ✓
```

**代码示例：**

```typescript
// 父组件管理状态
function App() {
  const [watchLaterIds, setWatchLaterIds] = useState<Set<string>>(new Set());
  
  // 添加到待看列表的回调
  const handleAddToWatchlist = async (bvid: string) => {
    await addToWatchlist(bvid);
    setWatchLaterIds(prev => new Set([...prev, bvid])); // 更新状态
  };
  
  const handleRemoveFromWatchlist = async (bvid: string) => {
    await removeFromWatchlist(bvid);
    setWatchLaterIds(prev => {
      const next = new Set(prev);
      next.delete(bvid);
      return next;
    });
  };
  
  return (
    <>
      {/* 视频卡片：可以添加到待看 */}
      <VideoCard 
        video={video}
        isInWatchlist={watchLaterIds.has(video.bvid)}
        onAddToWatchlist={handleAddToWatchlist}
      />
      
      {/* 待看列表：显示已添加的视频 */}
      <WatchLaterList 
        bvids={watchLaterIds}
        onRemove={handleRemoveFromWatchlist}
      />
    </>
  );
}
```

---

### 模式三：Context 全局共享

**适用场景：** 多层级、多页面需要共享的数据

```typescript
// 1. 创建 Context
interface WatchlistContextType {
  ids: Set<string>;
  add: (bvid: string) => Promise<void>;
  remove: (bvid: string) => Promise<void>;
  isInList: (bvid: string) => boolean;
}

const WatchlistContext = createContext<WatchlistContextType | null>(null);

// 2. Provider 组件
function WatchlistProvider({ children }: { children: React.ReactNode }) {
  const [ids, setIds] = useState<Set<string>>(new Set());
  
  useEffect(() => {
    // 初始加载
    fetchWatchlistIds().then(bvids => setIds(new Set(bvids)));
  }, []);
  
  const add = async (bvid: string) => {
    // 乐观更新
    setIds(prev => new Set([...prev, bvid]));
    try {
      await supabase.from('watchlist').insert({ bvid });
    } catch {
      // 失败回滚
      setIds(prev => {
        const next = new Set(prev);
        next.delete(bvid);
        return next;
      });
    }
  };
  
  const remove = async (bvid: string) => {
    const prev = ids;
    setIds(p => {
      const next = new Set(p);
      next.delete(bvid);
      return next;
    });
    try {
      await supabase.from('watchlist').delete().eq('bvid', bvid);
    } catch {
      setIds(prev); // 回滚
    }
  };
  
  return (
    <WatchlistContext.Provider value={{ 
      ids, 
      add, 
      remove, 
      isInList: (bvid) => ids.has(bvid) 
    }}>
      {children}
    </WatchlistContext.Provider>
  );
}

// 3. 自定义 Hook
function useWatchlist() {
  const context = useContext(WatchlistContext);
  if (!context) throw new Error('useWatchlist must be used within Provider');
  return context;
}

// 4. 任意组件使用
function VideoCard({ video }) {
  const { isInList, add, remove } = useWatchlist();
  
  return (
    <button onClick={() => isInList(video.bvid) ? remove(video.bvid) : add(video.bvid)}>
      {isInList(video.bvid) ? '已添加' : '添加待看'}
    </button>
  );
}
```

---

## 三、"差一个字段"问题的解决方案

### 场景描述

```
视频列表查询了：id, bvid, title, pic, duration, publoader.name, uploader.face
详情弹窗还需要：uploader.sign (UP主签名)

怎么办？
```

### 方案对比

| 方案 | 实现方式 | 优点 | 缺点 |
|------|----------|------|------|
| 扩展原查询 | 最初就查 sign | 简单，一次到位 | 数据量略增 |
| 按需补查 | 点开详情时单独查 | 节省带宽 | 额外请求，体验延迟 |
| 预加载 | 后台静默预取 | 用户无感知 | 实现复杂 |

### 推荐方案：扩展原查询

```typescript
// 原查询
const { data } = await supabase
  .from('video')
  .select(`
    *,
    uploader:uploader!fk_video_uploader (name, face)
  `);

// 改为
const { data } = await supabase
  .from('video')
  .select(`
    *,
    uploader:uploader!fk_video_uploader (name, face, sign)  // 多加一个字段
  `);
```

**判断标准：**
- 字段小（< 1KB）→ 直接扩展查询
- 字段大（如 description 几KB）→ 按需加载

### 按需补查的正确写法

```typescript
function VideoDetailModal({ video, onClose }) {
  const [uploaderSign, setUploaderSign] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  useEffect(() => {
    // 只查缺失的字段
    if (video.uploader && !video.uploader.sign) {
      setLoading(true);
      supabase
        .from('uploader')
        .select('sign')
        .eq('mid', video.mid)
        .single()
        .then(({ data }) => {
          setUploaderSign(data?.sign || null);
          setLoading(false);
        });
    }
  }, [video.mid]);
  
  return (
    <div>
      <h2>{video.title}</h2>
      <p>UP主：{video.uploader?.name}</p>
      <p>签名：{loading ? '加载中...' : (video.uploader?.sign || uploaderSign || '无')}</p>
    </div>
  );
}
```

---

## 四、数据流最佳实践清单

### ✅ 应该做

1. **单一数据源** - 同一份数据只在一个地方管理
2. **数据向下流** - Props 从父到子，不要反向
3. **事件向上传** - 子组件通过回调通知父组件
4. **扩展查询** - 宁可多查几个字段，不要多发请求
5. **乐观更新** - 先更新 UI，再发请求

### ❌ 不应该做

1. **子组件独立查询父组件已有的数据**
2. **同一数据在多个组件各自 useState**
3. **为了一个字段发完整查询**
4. **每次渲染都发请求（无依赖数组的 useEffect）**
5. **在循环中发请求（N+1 问题）**

---

## 五、FluxFilter 项目具体建议

### 当前问题

```typescript
// App.tsx 查询视频
const { data } = await supabase.from('video').select('*, uploader(...)');

// SettingsModal.tsx 又查一次
const { data: videoData } = await supabase.from('video').select('...');

// 问题：重复查询！
```

### 修复方案

```typescript
// 方案：通过 Props 传递，不重复查询
<SettingsModal 
  isOpen={isSettingsOpen}
  videos={videos}           // 传递已有数据
  uploaders={uploaders}     // 传递已有数据
  onClose={() => setIsSettingsOpen(false)}
/>
```

或使用 Context：

```typescript
// 创建 VideoContext，全局共享
const VideoContext = createContext<{
  videos: VideoWithUploader[];
  refresh: () => void;
} | null>(null);

// App.tsx 作为 Provider
<VideoContext.Provider value={{ videos, refresh: fetchVideos }}>
  <SettingsModal />  {/* 内部通过 useContext 获取 */}
</VideoContext.Provider>
```
