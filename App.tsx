import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Tab, FilterType, DateFilter } from './types';
import VideoCard from './components/VideoCard';
import { HomeIcon, ClockIcon, SearchIcon, CalendarIcon, SlidersIcon } from './components/Icons';
import CustomDatePicker from './components/CustomDatePicker';
import DateFilterPicker from './components/DateFilterPicker';
import SyncButton from './components/SyncButton';
import AddUploaderModal from './components/AddUploaderModal';
import TodoList from './components/TodoList';
import Loader3D from './components/Loader3D';
import SplashScreen from './components/SplashScreen';
import PullToRefresh from './components/PullToRefresh';
import RssFeed from './components/RssFeed';
import SettingsPage from './components/SettingsPage';
import HotCarousel from './components/HotCarousel';
import SettingsModal from './components/SettingsModal';
import AuthPage from './components/AuthPage';
import VideoTimeline from './components/VideoTimeline';
import LogoSvg from './assets/logo.svg';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import HighPriorityTodoReminder from './components/HighPriorityTodoReminder';
import { supabase, isSupabaseConfigured, addToWatchlist, removeFromWatchlistByBvid } from './lib/supabase';
import { getStoredUserId, getCurrentUser, logout, type User } from './lib/auth';
import { clearCookieCache } from './lib/bilibili';
import type { VideoWithUploader, WatchlistItem } from './lib/database.types';

const App = () => {
  // 认证状态 - null=检查中, true=已登录, false=游客模式
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authExpired, setAuthExpired] = useState(false); // 认证过期标记
  const [networkError, setNetworkError] = useState<string | null>(null); // 网络错误
  
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const saved = localStorage.getItem('activeTab');
    return (saved as Tab) || 'home';
  });
  const [watchLaterIds, setWatchLaterIds] = useState<Set<string>>(new Set());
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('today'); // 默认今天
  const [customDateFilter, setCustomDateFilter] = useState<DateFilter>({});
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isAddUploaderOpen, setIsAddUploaderOpen] = useState(false);
  const [isTodoOpen, setIsTodoOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialView, setSettingsInitialView] = useState<'main' | 'todo' | 'reminder' | 'collector'>('main');
  const [searchTerm, setSearchTerm] = useState('');
  
  // UP主筛选
  const [selectedUploader, setSelectedUploader] = useState<{ mid: number; name: string } | null>(null);
  const [isUploaderPickerOpen, setIsUploaderPickerOpen] = useState(false);
  const [uploaderSearchTerm, setUploaderSearchTerm] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
  const timeFilterBtnRef = React.useRef<HTMLButtonElement>(null);
  const [timeFilterPos, setTimeFilterPos] = useState({ top: 0, left: 0, width: 0 });

  // 保存当前 tab 到 localStorage
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);
  
  // 检查登录状态 - 支持游客模式
  useEffect(() => {
    const checkAuth = async () => {
      // 最小延迟让加载动画显示
      const minDelay = new Promise(r => setTimeout(r, 800));
      
      const userId = getStoredUserId();
      if (userId) {
        try {
          const user = await getCurrentUser();
          await minDelay;
          if (user) {
            setCurrentUser(user);
            setIsAuthenticated(true);
            return;
          }
        } catch (err) {
          console.error('认证检查失败:', err);
          // 网络错误时仍允许进入游客模式
        }
      }
      await minDelay;
      // 游客模式 - 允许访问但无数据功能
      setIsAuthenticated(false);
    };
    checkAuth();
  }, []);
  
  // 登录成功回调
  const handleLoginSuccess = async () => {
    const user = await getCurrentUser();
    setCurrentUser(user);
    setIsAuthenticated(true);
    clearCookieCache(); // 清除Cookie缓存，使用新用户的Cookie
  };
  
  // 退出登录
  const handleLogout = () => {
    logout();
    clearCookieCache();
    setCurrentUser(null);
    setIsAuthenticated(false);
  };
  
  // 真实数据状态
  const [videos, setVideos] = useState<VideoWithUploader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // 快捷入口数量
  const [collectedCount, setCollectedCount] = useState(0);
  const [todoCount, setTodoCount] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);
  
  // 时间轴
  const [showTimeline, setShowTimeline] = useState(false);
  
  // 加载快捷入口数量
  useEffect(() => {
    const loadCounts = async () => {
      const userId = getStoredUserId();
      if (!userId) return;
      
      // 收藏夹数量
      const { count: cCount } = await supabase
        .from('collected_video')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      setCollectedCount(cCount || 0);
      
      // TODO数量（从 localStorage 读取）
      try {
        const todos = JSON.parse(localStorage.getItem('todos') || '[]');
        setTodoCount(todos.filter((t: any) => !t.completed).length);
      } catch { setTodoCount(0); }
      
      // 提醒任务数量
      try {
        const tasks = JSON.parse(localStorage.getItem('interval-reminder-tasks') || '[]');
        setReminderCount(tasks.filter((t: any) => t.isActive).length);
      } catch { setReminderCount(0); }
    };
    
    loadCounts();
    // 每次切换到首页时刷新
    if (activeTab === 'home') loadCounts();
  }, [activeTab]);
  
  // Infinite Scroll State
  const [visibleCount, setVisibleCount] = useState(10);
  const mainRef = React.useRef<HTMLDivElement>(null);

  // 筛选条件变化时重置 visibleCount
  useEffect(() => {
    setVisibleCount(10);
  }, [activeFilter, selectedUploader, searchTerm, activeTab]);

  // 滑动切换Tab
  const touchStartX = React.useRef<number>(0);
  const touchEndX = React.useRef<number>(0);
  const isSwiping = React.useRef<boolean>(false);
  const tabs: Tab[] = ['home', 'watchLater', 'rss', 'todo'];

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchEndX.current = e.touches[0].clientX; // 重置为起始位置
    isSwiping.current = false;
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.touches[0].clientX;
    // 水平移动超过10px才算滑动
    if (Math.abs(touchEndX.current - touchStartX.current) > 10) {
      isSwiping.current = true;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    // 没有发生滑动则不处理
    if (!isSwiping.current) return;
    
    const diff = touchStartX.current - touchEndX.current;
    const threshold = 80; // 滑动阈值

    if (Math.abs(diff) < threshold) return;

    const currentIndex = tabs.indexOf(activeTab);
    
    if (diff > 0 && currentIndex < tabs.length - 1) {
      // 左滑 -> 下一个tab
      setActiveTab(tabs[currentIndex + 1]);
    } else if (diff < 0 && currentIndex > 0) {
      // 右滑 -> 上一个tab
      setActiveTab(tabs[currentIndex - 1]);
    }
  }, [activeTab, tabs]);

  // 处理 API 错误 - 检测认证过期和网络问题
  const handleApiError = useCallback((err: any, context: string) => {
    console.error(`${context}:`, err);
    
    // 检测认证过期 (401/403)
    if (err?.code === 'PGRST301' || err?.message?.includes('JWT') || err?.status === 401 || err?.status === 403) {
      setAuthExpired(true);
      setNetworkError('登录已过期，请重新登录');
      return '登录已过期';
    }
    
    // 检测网络错误
    if (err?.message?.includes('network') || err?.message?.includes('fetch') || !navigator.onLine) {
      setNetworkError('网络连接失败，请检查网络后重试');
      return '网络连接失败';
    }
    
    // 其他错误
    const message = err instanceof Error ? err.message : '操作失败';
    setNetworkError(message);
    return message;
  }, []);

  // 从 Supabase 获取视频数据
  const fetchVideos = useCallback(async () => {
    // 未配置 Supabase 或游客模式时直接返回空
    if (!isSupabaseConfigured || !currentUser?.id) {
      setLoading(false);
      setVideos([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setNetworkError(null);
      
      const { data, error: fetchError } = await supabase
        .from('video')
        .select(`
          *,
          uploader:uploader!fk_video_uploader (name, face)
        `)
        .eq('user_id', currentUser.id)
        .order('pubdate', { ascending: false });

      if (fetchError) throw fetchError;
      setVideos((data as VideoWithUploader[]) || []);
    } catch (err) {
      const message = handleApiError(err, '获取视频失败');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [currentUser?.id, handleApiError]);

  // 从 Supabase 获取待看列表
  const fetchWatchlist = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    
    const userId = currentUser?.id;
    if (!userId) return;
    
    try {
      const { data, error: fetchError } = await supabase
        .from('watchlist')
        .select('bvid')
        .eq('user_id', userId);
      
      if (fetchError) throw fetchError;
      
      const bvidSet = new Set(data?.map(item => item.bvid) || []);
      setWatchLaterIds(bvidSet);
    } catch (err) {
      console.error('获取待看列表失败:', err);
    }
  }, [currentUser?.id]);

  // 用户登录后加载数据
  useEffect(() => {
    if (currentUser?.id) {
      console.log('👤 用户已登录，加载数据...', currentUser.id);
      fetchVideos();
      fetchWatchlist();
    }
  }, [currentUser?.id]); // 只在用户ID变化时触发

  // 切换到首页时检查是否需要重新加载
  useEffect(() => {
    if (activeTab === 'home' && videos.length === 0 && !loading && !error && currentUser?.id) {
      console.log('🏠 回到首页，重新加载...');
      fetchVideos();
    }
  }, [activeTab, videos.length, loading, error, currentUser?.id]);

  // 监听同步完成事件，刷新数据
  useEffect(() => {
    const handleSyncComplete = () => {
      console.log('🔄 同步完成，刷新数据...');
      fetchVideos();
    };
    window.addEventListener('sync-complete', handleSyncComplete);
    return () => window.removeEventListener('sync-complete', handleSyncComplete);
  }, [fetchVideos]);
  
  // Toast 提示
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  // Toggle Watch Later - 同步到 Supabase
  const toggleWatchLater = useCallback(async (bvid: string) => {
    if (watchlistLoading) return;
    
    const isInList = watchLaterIds.has(bvid);
    
    // 乐观更新UI
    setWatchLaterIds(prev => {
      const newSet = new Set(prev);
      if (isInList) {
        newSet.delete(bvid);
      } else {
        newSet.add(bvid);
      }
      return newSet;
    });
    
    showToast(isInList ? '已从待看列表移除' : '已加入待看列表');
    
    // 同步到 Supabase
    if (isSupabaseConfigured && currentUser?.id) {
      try {
        setWatchlistLoading(true);
        if (isInList) {
          await removeFromWatchlistByBvid(bvid, currentUser.id);
        } else {
          await addToWatchlist(bvid, currentUser.id);
        }
      } catch (err) {
        console.error('待看列表操作失败:', err);
        // 回滚UI状态
        setWatchLaterIds(prev => {
          const newSet = new Set(prev);
          if (isInList) {
            newSet.add(bvid);
          } else {
            newSet.delete(bvid);
          }
          return newSet;
        });
        showToast('操作失败，请重试');
      } finally {
        setWatchlistLoading(false);
      }
    }
  }, [watchLaterIds, watchlistLoading]);

  // 删除视频
  const handleDeleteVideo = useCallback(async (bvid: string) => {
    if (!currentUser?.id || !isSupabaseConfigured) {
      showToast('请先登录');
      return;
    }

    try {
      // 先从 UI 中移除
      setVideos(prev => prev.filter(v => v.bvid !== bvid));
      
      // 从数据库删除
      const { error } = await supabase
        .from('video')
        .delete()
        .eq('bvid', bvid)
        .eq('user_id', currentUser.id);

      if (error) throw error;
      
      showToast('视频已删除');
    } catch (err) {
      console.error('删除视频失败:', err);
      // 删除失败，重新加载数据
      fetchVideos();
      showToast('删除失败，请重试');
    }
  }, [currentUser?.id, fetchVideos]);

  // 获取所有UP主列表（去重，按视频数量排序）
  const uploaders = useMemo(() => {
    const uploaderMap = new Map<number, { mid: number; name: string; face: string | null; count: number; latestTime: string }>();
    
    videos.forEach(v => {
      if (v.mid && v.uploader?.name) {
        const existing = uploaderMap.get(v.mid);
        if (existing) {
          existing.count++;
          if (v.created_at > existing.latestTime) {
            existing.latestTime = v.created_at;
          }
        } else {
          uploaderMap.set(v.mid, {
            mid: v.mid,
            name: v.uploader.name,
            face: v.uploader.face || null,
            count: 1,
            latestTime: v.created_at,
          });
        }
      }
    });
    
    // 按最新插入时间排序
    return Array.from(uploaderMap.values()).sort((a, b) => 
      new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime()
    );
  }, [videos]);

  // 筛选后的UP主列表（支持搜索）
  const filteredUploaders = useMemo(() => {
    if (!uploaderSearchTerm) return uploaders;
    const term = uploaderSearchTerm.toLowerCase();
    return uploaders.filter(u => u.name.toLowerCase().includes(term));
  }, [uploaders, uploaderSearchTerm]);

  // Filter Logic
  const filteredVideos = useMemo(() => {
    let result = [...videos];

    // 1. Tab - 先根据当前界面过滤
    if (activeTab === 'watchLater') {
      result = result.filter(v => watchLaterIds.has(v.bvid));
    }

    // 2. UP主筛选
    if (selectedUploader) {
      result = result.filter(v => v.mid === selectedUploader.mid);
    }

    // 3. Search - 基于当前界面搜索（标题 + UP主名称）
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(v =>
        v.title.toLowerCase().includes(term) ||
        (v.uploader?.name || '').toLowerCase().includes(term)
      );
    }

    // 4. Time Filter - 基于插入时间 (created_at)
    const now = new Date();
    result = result.filter(v => {
      if (activeFilter === 'all') return true;

      const insertDate = new Date(v.created_at);
      const diffTime = Math.abs(now.getTime() - insertDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      if (activeFilter === 'today') return diffDays <= 1;
      if (activeFilter === 'week') return diffDays <= 7;
      if (activeFilter === 'month') return diffDays <= 30;

      if (activeFilter === 'custom') {
         if (!customDateFilter.year) return true;
         const pubDate = new Date(v.pubdate || v.created_at);
         if (pubDate.getFullYear() !== customDateFilter.year) return false;
         if (customDateFilter.month !== undefined && pubDate.getMonth() !== customDateFilter.month) return false;
         if (customDateFilter.day !== undefined && pubDate.getDate() !== customDateFilter.day) return false;
         return true;
      }

      return true;
    });

    // 按插入时间排序（最新的在前）
    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return result;
  }, [videos, activeTab, watchLaterIds, activeFilter, customDateFilter, searchTerm, selectedUploader]);

  // 热门视频排序 - 根据热度分数排序
  const hotVideos = useMemo(() => {
    return [...videos]
      .sort((a, b) => {
        // 热度计算：播放量50% + 点赞数30% + 收藏数20%
        const scoreA = (a.view_count || 0) * 0.5 + (a.like_count || 0) * 0.3 + (a.favorite_count || 0) * 0.2;
        const scoreB = (b.view_count || 0) * 0.5 + (b.like_count || 0) * 0.3 + (b.favorite_count || 0) * 0.2;
        return scoreB - scoreA;
      })
      .slice(0, 5);
  }, [videos]);

  // Infinite Scroll Handler - 节流优化
  useEffect(() => {
    const mainElement = mainRef.current;
    if (!mainElement) return;

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const { scrollTop, scrollHeight, clientHeight } = mainElement;
          if (scrollTop + clientHeight >= scrollHeight - 500) {
            setVisibleCount(prev => Math.min(prev + 5, filteredVideos.length));
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    mainElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainElement.removeEventListener('scroll', handleScroll);
  }, [filteredVideos.length]);

  // 下拉刷新处理
  const handlePullRefresh = useCallback(async () => {
    console.log('🔃 下拉刷新触发');
    if (!currentUser?.id) {
      console.log('⚠️ 未登录，跳过刷新');
      showToast('请先登录');
      return;
    }
    await fetchVideos();
    await fetchWatchlist();
    showToast('刷新成功');
  }, [fetchVideos, fetchWatchlist, currentUser?.id]);

  // 认证检查中显示加载动画
  if (isAuthenticated === null) {
    return (
      <div className="h-screen bg-[#050510] flex items-center justify-center">
        <Loader3D text="正在加载..." />
      </div>
    );
  }

  // 认证过期时显示登录页
  if (authExpired) {
    return <AuthPage onLoginSuccess={() => { setAuthExpired(false); handleLoginSuccess(); }} />;
  }

  return (
    <PullToRefresh onRefresh={handlePullRefresh} scrollContainerRef={mainRef} disabled={showTimeline}>
    <div className="h-screen bg-cyber-dark font-sans selection:bg-cyber-lime selection:text-black relative overflow-hidden flex flex-col">
      
      {/* PWA 安装提示 */}
      <PWAInstallPrompt />

      {/* 高优先级待办提醒弹窗 */}
      <HighPriorityTodoReminder 
        onNavigateToTodo={() => setActiveTab('todo')}
      />

      {/* 网络错误提示 */}
      {networkError && (
        <div className="fixed top-4 left-4 right-4 z-[9999] animate-slide-down">
          <div className="bg-red-500/90 backdrop-blur-xl rounded-2xl p-4 shadow-2xl border border-red-400/30">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium">{networkError}</p>
                <p className="text-white/70 text-sm mt-0.5">
                  {!navigator.onLine ? '请检查您的网络连接' : '请稍后重试或联系支持'}
                </p>
              </div>
              <button 
                onClick={() => setNetworkError(null)}
                className="p-1 hover:bg-white/20 rounded-lg transition-colors"
              >
                <svg className="w-5 h-5 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18"/>
                  <line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 游客模式提示 - 未登录时显示 */}
      {!isAuthenticated && !authExpired && (
        <div className="fixed bottom-20 left-4 right-4 z-50">
          <div className="bg-gradient-to-r from-cyber-lime/20 to-cyan-500/20 backdrop-blur-xl rounded-2xl p-4 border border-cyber-lime/30">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-cyber-lime/20 flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white font-medium text-sm">游客模式</p>
                <p className="text-gray-400 text-xs">登录后可同步视频数据</p>
              </div>
              <button 
                onClick={() => setAuthExpired(true)}
                className="px-4 py-2 bg-cyber-lime text-black text-sm font-medium rounded-xl hover:bg-cyber-lime/90 transition-colors"
              >
                登录
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Spotify风格渐变背景 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* 基础深色 */}
        <div className="absolute inset-0 bg-[#0a0a0f]" />
        
        {/* 动态渐变光斑 */}
        <div className="absolute inset-0">
          {/* 主色调光斑 - 根据Tab变化 */}
          <div 
            className={`absolute -top-1/4 -left-1/4 w-[80%] h-[60%] rounded-full blur-[120px] transition-all duration-1000 ${
              activeTab === 'home' ? 'bg-emerald-600/30' :
              activeTab === 'watchLater' ? 'bg-amber-500/25' :
              activeTab === 'rss' ? 'bg-blue-500/25' :
              'bg-purple-500/25'
            }`} 
          />
          {/* 次要光斑 */}
          <div className="absolute top-1/3 -right-1/4 w-[60%] h-[50%] bg-cyan-500/15 rounded-full blur-[100px]" />
          <div className="absolute -bottom-1/4 left-1/4 w-[50%] h-[40%] bg-fuchsia-500/10 rounded-full blur-[80px]" />
        </div>
        
        {/* 噪点纹理 */}
        <div className="absolute inset-0 opacity-[0.015]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
        }} />
        
        {/* 顶部渐变遮罩 */}
        <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-black/40 to-transparent" />
      </div>
      
      {/* Header & Sticky Filter */}
      <header className="sticky top-0 z-40 w-full transition-all duration-300">
        {/* Top Bar - 毛玻璃效果 */}
        <div className="bg-black/40 backdrop-blur-xl px-4 py-3 border-b border-white/10">
          <div className="flex items-center gap-3">
            <img src={LogoSvg} alt="FluxF" className="w-9 h-9 shrink-0" />
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                placeholder={activeTab === 'watchLater' ? '搜索待看列表...' : '搜索视频或UP...'}
                className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-10 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 transition-colors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {/* 清除按钮 */}
              {searchTerm && (
                <button 
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                >
                  <svg className="w-3 h-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <SyncButton compact />
            {/* 时间轴按钮 */}
            <button 
              onClick={() => setShowTimeline(true)}
              className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:border-cyber-lime/50 hover:bg-cyber-lime/10 transition-colors"
              title="时间轴"
            >
              <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="20" x2="12" y2="10"/>
                <line x1="18" y1="20" x2="18" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="16"/>
              </svg>
            </button>
            <button 
              onClick={() => setIsCalendarOpen(true)}
              className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:border-cyber-lime/50 transition-colors"
              title="视频日历"
            >
              <CalendarIcon className="w-4 h-4 text-gray-400" />
            </button>
            {/* 个人头像/设置 */}
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-cyber-lime to-emerald-400 flex items-center justify-center text-black font-bold text-xs hover:scale-110 transition-transform"
              title="设置"
            >
              {currentUser?.username?.[0]?.toUpperCase() || 'U'}
            </button>
          </div>
        </div>

        {/* Filter Chips - 毛玻璃效果 */}
        <div className="bg-black/30 backdrop-blur-xl border-b border-white/10 py-2 overflow-x-auto no-scrollbar touch-pan-x">
          <div className="flex px-4 gap-2 w-max">
            {/* All 按钮 */}
            <button
              onClick={() => {
                setActiveFilter('all');
                mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
              }}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-all border ${
                activeFilter === 'all' 
                  ? 'bg-cyber-lime text-black border-cyber-lime shadow-[0_0_10px_rgba(163,230,53,0.3)]' 
                  : 'bg-white/5 text-gray-400 border-white/5 hover:border-gray-600'
              }`}
            >
              All
            </button>
            
            {/* 时间筛选按钮 */}
            <button
              ref={timeFilterBtnRef}
              onClick={() => {
                if (timeFilterBtnRef.current) {
                  const rect = timeFilterBtnRef.current.getBoundingClientRect();
                  setTimeFilterPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                }
                setIsTimeFilterOpen(true);
              }}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-all border flex items-center gap-1.5 ${
                ['today', 'week', 'month'].includes(activeFilter)
                  ? 'bg-cyber-lime text-black border-cyber-lime shadow-[0_0_10px_rgba(163,230,53,0.3)]' 
                  : 'bg-white/5 text-gray-400 border-white/5 hover:border-gray-600'
              }`}
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              {activeFilter === 'today' ? '今天' : activeFilter === 'week' ? '本周' : activeFilter === 'month' ? '本月' : '时间'}
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
            
            {/* 高级筛选组合按钮 */}
            <div className={`flex items-center rounded-full border overflow-hidden ${
              activeFilter === 'custom' || selectedUploader
                ? 'border-cyber-lime/50 bg-white/5'
                : 'border-white/10 bg-white/5'
            }`}>
              {/* 自定义日期 */}
              <button
                onClick={() => setIsFilterOpen(true)}
                className={`whitespace-nowrap px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 ${
                  activeFilter === 'custom'
                      ? 'bg-cyber-lime text-black' 
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <SlidersIcon className="w-3 h-3" />
                {activeFilter === 'custom' 
                  ? `${customDateFilter.year}${customDateFilter.month !== undefined ? `/${customDateFilter.month + 1}` : ''}${customDateFilter.day !== undefined ? `/${customDateFilter.day}` : ''}`
                  : '日期'}
              </button>
              
              {/* 分隔线 */}
              <div className="w-px h-4 bg-white/20" />
              
              {/* UP主筛选 */}
              <button
                onClick={() => setIsUploaderPickerOpen(true)}
                className={`whitespace-nowrap px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 ${
                  selectedUploader
                      ? 'bg-violet-500 text-white' 
                      : 'text-gray-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                {selectedUploader ? selectedUploader.name : '关注'}
              </button>
              
              {/* 清除按钮 */}
              {(selectedUploader || activeFilter === 'custom') && (
                <>
                  <div className="w-px h-4 bg-white/20" />
                  <button
                    onClick={() => {
                      setSelectedUploader(null);
                      if (activeFilter === 'custom') setActiveFilter('today');
                    }}
                    className="px-2 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                    title="清除筛选"
                  >
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Feed */}
      <main 
        ref={mainRef} 
        className="flex-1 overflow-y-auto px-3 py-4 max-w-4xl mx-auto w-full"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* 页面内容容器 */}
        <div>
        
        {/* RSS 阅读界面 */}
        {activeTab === 'rss' && (
          <RssFeed scrollContainerRef={mainRef} timeFilter={activeFilter} />
        )}

        {/* TODO 待办事项界面 */}
        {activeTab === 'todo' && (
          <TodoList embedded timeFilter={activeFilter} />
        )}

        {/* 设置页面 */}
        <SettingsPage
          isOpen={activeTab === 'settings'}
          onClose={() => setActiveTab('home')}
          initialView={settingsInitialView}
        />
        
        {/* 视频内容 */}
        {(activeTab === 'home' || activeTab === 'watchLater') && (
        <>
        {/* 搜索结果提示 */}
        {searchTerm && (
          <div className="mb-4 flex items-center justify-between">
            <p className="text-sm text-gray-400">
              {activeTab === 'watchLater' ? '待看列表中' : ''}搜索 "<span className="text-cyber-lime">{searchTerm}</span>" 
              <span className="ml-1">找到 <span className="text-white font-medium">{filteredVideos.length}</span> 个结果</span>
            </p>
            <button 
              onClick={() => setSearchTerm('')}
              className="text-xs text-gray-500 hover:text-white transition-colors"
            >
              清除搜索
            </button>
          </div>
        )}
        
        {/* 热门轮播图 */}
        {activeTab === 'home' && !searchTerm && activeFilter === 'all' && videos.length > 0 && (
          <HotCarousel videos={hotVideos} />
        )}

        {/* 快捷入口 - 均匀分布居中 */}
        {activeTab === 'home' && !searchTerm && (
          <div className="flex justify-center gap-4 mb-4">
            {/* 收藏夹 */}
            <button
              onClick={() => { setSettingsInitialView('collector'); setActiveTab('settings'); }}
              className="relative w-11 h-11 bg-gradient-to-br from-cyan-500/20 to-blue-500/20 border border-cyan-500/30 rounded-xl flex items-center justify-center hover:from-cyan-500/30 hover:to-blue-500/30 transition-all active:scale-[0.95]"
            >
              <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
              </svg>
              {collectedCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-cyan-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {collectedCount > 99 ? '99+' : collectedCount}
                </span>
              )}
            </button>

            {/* 提醒 */}
            <button
              onClick={() => { setSettingsInitialView('reminder'); setActiveTab('settings'); }}
              className="relative w-11 h-11 bg-gradient-to-br from-amber-500/20 to-orange-500/20 border border-amber-500/30 rounded-xl flex items-center justify-center hover:from-amber-500/30 hover:to-orange-500/30 transition-all active:scale-[0.95]"
            >
              <svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <polyline points="12 6 12 12 16 14"/>
              </svg>
              {reminderCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-amber-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {reminderCount > 99 ? '99+' : reminderCount}
                </span>
              )}
            </button>

            {/* TODO */}
            <button
              onClick={() => { setSettingsInitialView('todo'); setActiveTab('settings'); }}
              className="relative w-11 h-11 bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 rounded-xl flex items-center justify-center hover:from-blue-500/30 hover:to-purple-500/30 transition-all active:scale-[0.95]"
            >
              <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4"/>
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
              </svg>
              {todoCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] px-1 bg-blue-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center">
                  {todoCount > 99 ? '99+' : todoCount}
                </span>
              )}
            </button>
          </div>
        )}

        <div className="space-y-3">
            {/* 区块标题 */}
            <h2 className="text-sm font-medium text-gray-400 flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-cyber-lime rounded-full" />
              <span>{activeTab === 'watchLater' ? '待看列表' : '最新视频'}</span>
              {!loading && (
                <span className="text-cyber-lime text-xs">{filteredVideos.length}</span>
              )}
            </h2>

            {/* 加载状态 */}
            {loading && <Loader3D text="正在加载视频..." />}

            {/* 错误提示 */}
            {error && (
                <div className="text-center py-10 text-red-400">
                    <p>加载失败: {error}</p>
                    <button onClick={fetchVideos} className="mt-2 text-cyber-lime underline">重试</button>
                </div>
            )}

            {/* 空状态提示 - 精美插画风格 */}
            {!loading && !error && videos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 px-6">
                  {/* 插画 SVG */}
                  <div className="relative w-64 h-48 mb-8">
                    {/* 背景装饰圆 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-40 h-40 rounded-full bg-gradient-to-br from-cyber-lime/10 to-cyan-500/10 blur-2xl"></div>
                    </div>
                    
                    {/* 主体插画 */}
                    <svg viewBox="0 0 200 150" className="w-full h-full relative z-10">
                      {/* 视频播放器外框 */}
                      <rect x="40" y="30" width="120" height="80" rx="8" 
                        fill="none" stroke="url(#emptyGrad)" strokeWidth="2" opacity="0.6"/>
                      
                      {/* 播放按钮 */}
                      <circle cx="100" cy="70" r="20" fill="none" stroke="#a3e635" strokeWidth="2" opacity="0.4"/>
                      <polygon points="95,62 95,78 108,70" fill="#a3e635" opacity="0.6"/>
                      
                      {/* 装饰线条 */}
                      <line x1="50" y1="120" x2="150" y2="120" stroke="#374151" strokeWidth="2" strokeDasharray="8 4"/>
                      
                      {/* 浮动的小方块 */}
                      <rect x="25" y="50" width="12" height="12" rx="2" fill="#22d3ee" opacity="0.3">
                        <animate attributeName="y" values="50;45;50" dur="3s" repeatCount="indefinite"/>
                      </rect>
                      <rect x="165" y="60" width="10" height="10" rx="2" fill="#a3e635" opacity="0.4">
                        <animate attributeName="y" values="60;55;60" dur="2.5s" repeatCount="indefinite"/>
                      </rect>
                      <circle cx="30" cy="90" r="5" fill="#f472b6" opacity="0.3">
                        <animate attributeName="cy" values="90;85;90" dur="2s" repeatCount="indefinite"/>
                      </circle>
                      
                      {/* 渐变定义 */}
                      <defs>
                        <linearGradient id="emptyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#a3e635"/>
                          <stop offset="100%" stopColor="#22d3ee"/>
                        </linearGradient>
                      </defs>
                    </svg>
                  </div>

                  {/* 文字内容 */}
                  <h3 className="text-xl font-bold text-white mb-2">开始你的视频之旅</h3>
                  <p className="text-gray-400 text-sm mb-6 text-center max-w-xs">
                    添加你喜欢的 UP主，我们会帮你追踪他们的最新更新
                  </p>

       
                
                </div>
            )}

            {/* 筛选后无结果 / 待看列表为空 */}
            {!loading && !error && videos.length > 0 && filteredVideos.length === 0 && (
                <div className="flex flex-col items-center justify-center py-16 px-6">
                  {/* 动态插画 */}
                  <div className="relative w-72 h-56 mb-6">
                    {/* 背景光晕 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-48 h-48 rounded-full bg-gradient-to-br from-cyber-lime/10 to-cyan-500/5 blur-3xl animate-pulse"></div>
                    </div>
                    
                    <svg viewBox="0 0 280 220" className="w-full h-full relative z-10">
                      <defs>
                        <linearGradient id="emptyGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                          <stop offset="0%" stopColor="#a3e635"/>
                          <stop offset="100%" stopColor="#22d3ee"/>
                        </linearGradient>
                        <filter id="glow2">
                          <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                          <feMerge>
                            <feMergeNode in="coloredBlur"/>
                            <feMergeNode in="SourceGraphic"/>
                          </feMerge>
                        </filter>
                      </defs>
                      
                      {activeTab === 'watchLater' ? (
                        <>
                          {/* 待看列表空状态 - 时钟主题 */}
                          <circle cx="140" cy="100" r="50" fill="none" stroke="url(#emptyGrad2)" strokeWidth="3" opacity="0.6"/>
                          <circle cx="140" cy="100" r="42" fill="none" stroke="#374151" strokeWidth="1" strokeDasharray="4 4"/>
                          
                          {/* 时钟指针 */}
                          <line x1="140" y1="100" x2="140" y2="70" stroke="#a3e635" strokeWidth="3" strokeLinecap="round" filter="url(#glow2)">
                            <animateTransform attributeName="transform" type="rotate" from="0 140 100" to="360 140 100" dur="10s" repeatCount="indefinite"/>
                          </line>
                          <line x1="140" y1="100" x2="160" y2="100" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round">
                            <animateTransform attributeName="transform" type="rotate" from="0 140 100" to="360 140 100" dur="60s" repeatCount="indefinite"/>
                          </line>
                          <circle cx="140" cy="100" r="5" fill="#a3e635" filter="url(#glow2)"/>
                          
                          {/* 书签装饰 */}
                          <path d="M200 60 L200 100 L215 85 L230 100 L230 60 Z" fill="none" stroke="#a3e635" strokeWidth="2" opacity="0.4">
                            <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite"/>
                          </path>
                          
                          {/* 浮动元素 */}
                          <rect x="60" y="70" width="16" height="16" rx="4" fill="#22d3ee" opacity="0.3">
                            <animate attributeName="y" values="70;60;70" dur="3s" repeatCount="indefinite"/>
                          </rect>
                          <circle cx="80" cy="140" r="6" fill="#f472b6" opacity="0.25">
                            <animate attributeName="cy" values="140;130;140" dur="2.5s" repeatCount="indefinite"/>
                          </circle>
                          <rect x="210" y="130" width="12" height="12" rx="2" fill="#a3e635" opacity="0.35">
                            <animate attributeName="y" values="130;120;130" dur="2s" repeatCount="indefinite"/>
                          </rect>
                        </>
                      ) : (
                        <>
                          {/* 搜索无结果 - 放大镜主题 */}
                          <circle cx="130" cy="90" r="40" fill="none" stroke="url(#emptyGrad2)" strokeWidth="3" opacity="0.6"/>
                          <line x1="158" y1="118" x2="190" y2="150" stroke="url(#emptyGrad2)" strokeWidth="4" strokeLinecap="round"/>
                          
                          {/* 问号 */}
                          <text x="130" y="100" textAnchor="middle" fill="#a3e635" fontSize="32" fontWeight="bold" opacity="0.6">?</text>
                          
                          {/* 浮动元素 */}
                          <rect x="70" y="50" width="14" height="14" rx="3" fill="#22d3ee" opacity="0.3">
                            <animate attributeName="y" values="50;40;50" dur="2.5s" repeatCount="indefinite"/>
                          </rect>
                          <circle cx="200" cy="70" r="8" fill="#f472b6" opacity="0.25">
                            <animate attributeName="cy" values="70;60;70" dur="3s" repeatCount="indefinite"/>
                          </circle>
                          <rect x="180" y="140" width="10" height="10" rx="2" fill="#a3e635" opacity="0.35">
                            <animate attributeName="y" values="140;130;140" dur="2s" repeatCount="indefinite"/>
                          </rect>
                        </>
                      )}
                      
                      {/* 底部装饰线 */}
                      <line x1="80" y1="190" x2="200" y2="190" stroke="#374151" strokeWidth="2" strokeDasharray="8 4" opacity="0.5"/>
                      <circle cx="90" cy="190" r="3" fill="#a3e635" opacity="0.6"/>
                      <circle cx="190" cy="190" r="3" fill="#22d3ee" opacity="0.6"/>
                    </svg>
                  </div>

                  {/* 文字内容 */}
                  <h3 className="text-xl font-bold text-white mb-2">
                    {activeTab === 'watchLater' 
                      ? '暂无待看视频' 
                      : searchTerm 
                        ? '没有找到相关视频'
                        : '当前筛选无结果'}
                  </h3>
                  <p className="text-gray-400 text-sm mb-6 text-center max-w-xs leading-relaxed">
                    {activeTab === 'watchLater' 
                      ? '长按视频卡片可以快速添加到待看列表，开始收藏你感兴趣的内容吧' 
                      : searchTerm
                        ? `未找到与"${searchTerm}"相关的视频，试试其他关键词`
                        : '调整筛选条件或切换时间范围查看更多'}
                  </p>
                  
                  {/* 操作按钮 */}
                  {activeTab === 'watchLater' ? (
                    <button 
                      onClick={() => setActiveTab('home')}
                      className="px-6 py-2.5 bg-gradient-to-r from-cyber-lime to-lime-400  font-medium rounded-full 
                                 shadow-[0_0_20px_rgba(163,230,53,0.4)] hover:shadow-[0_0_30px_rgba(163,230,53,0.6)]
                                 transition-all hover:scale-105 active:scale-95"
                    >
                      去发现视频
                    </button>
                  ) : searchTerm ? (
                    <button 
                      onClick={() => setSearchTerm('')}
                      className="px-6 py-2.5 bg-white/10 text-white font-medium rounded-full border border-white/20
                                 hover:bg-white/20 transition-all"
                    >
                      清除搜索
                    </button>
                  ) : (
                    <button 
                      onClick={() => setActiveFilter('all')}
                      className="px-6 py-2.5 bg-white/10 text-white font-medium rounded-full border border-white/20
                                 hover:bg-white/20 transition-all"
                    >
                      查看全部
                    </button>
                  )}
                </div>
            )}
            
            {/* 视频列表 */}
            {!loading && filteredVideos.length > 0 && (
                <div className="grid grid-cols-2 gap-3">
                    {filteredVideos.slice(0, visibleCount).map((video) => (
                        <VideoCard 
                            key={video.bvid}
                            video={video}
                            onAddToWatchlist={toggleWatchLater}
                            onRemoveFromWatchlist={toggleWatchLater}
                            isInWatchlist={watchLaterIds.has(video.bvid)}
                            openMenuId={openMenuId}
                            onMenuToggle={setOpenMenuId}
                            onDelete={handleDeleteVideo}
                        />
                    ))}
                </div>
            )}
            
            {/* Loading / End indicator */}
            {!loading && filteredVideos.length > 0 && (
                <div className="pt-8 pb-24 flex justify-center">
                    {visibleCount < filteredVideos.length ? (
                        <div className="w-6 h-6 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <div className="flex flex-col items-center gap-3">
                          <p className="text-gray-500 text-sm">没有更多视频了，去看看 RSS 吧 ✨</p>
                          <button
                            onClick={() => setActiveTab('rss')}
                            className="px-4 py-2 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-full text-blue-400 text-sm font-medium hover:from-blue-500/30 hover:to-cyan-500/30 transition-all flex items-center gap-2"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M4 11a9 9 0 0 1 9 9" />
                              <path d="M4 4a16 16 0 0 1 16 16" />
                              <circle cx="5" cy="19" r="1" fill="currentColor" />
                            </svg>
                            去看 RSS 订阅
                          </button>
                        </div>
                    )}
                </div>
            )}
        </div>
        </>
        )}
        </div>
      </main>
      
      {/* 页面切换动画样式 */}
      <style>{`
        @keyframes page-fade-in {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-page-fade-in {
          animation: page-fade-in 0.3s ease-out;
        }
      `}</style>

      {/* Bottom Navigation - 毛玻璃效果 */}
      <nav className="fixed bottom-0 left-0 right-0 bg-black/40 backdrop-blur-2xl border-t border-white/10 pb-safe pt-2 px-4 z-50 h-[80px]">
        <div className="flex justify-around items-center h-full max-w-lg mx-auto pb-4">
          {/* Discovery */}
          <button 
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${
              activeTab === 'home' ? 'text-cyber-lime -translate-y-1' : 'text-gray-500'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'home' ? 'bg-cyber-lime/10' : ''}`}>
               <HomeIcon className="w-5 h-5" />
            </div>
            <span className="text-[9px] font-medium">Discovery</span>
          </button>

          {/* Pending (待看视频) */}
          <button 
            onClick={() => setActiveTab('watchLater')}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${
              activeTab === 'watchLater' ? 'text-cyber-lime -translate-y-1' : 'text-gray-500'
            }`}
          >
             <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'watchLater' ? 'bg-cyber-lime/10' : ''}`}>
                <ClockIcon className="w-5 h-5" />
             </div>
            <span className="text-[9px] font-medium">Pending</span>
          </button>
          
          {/* 中间加号按钮 */}
          <button 
            onClick={() => setIsAddUploaderOpen(true)}
            className="w-12 h-12 rounded-full bg-gradient-to-tr from-cyber-lime to-cyan-400 flex items-center justify-center -translate-y-4 shadow-[0_0_20px_rgba(163,230,53,0.4)] border-4 border-cyber-dark hover:scale-110 active:scale-95 transition-transform"
          >
             <div className="text-black font-bold text-xl">+</div>
          </button>

          {/* RSS 订阅 */}
          <button 
            onClick={() => setActiveTab('rss')} 
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${
              activeTab === 'rss' ? 'text-cyber-lime -translate-y-1' : 'text-gray-500 hover:text-cyber-lime'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'rss' ? 'bg-cyber-lime/10' : ''}`}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 11a9 9 0 0 1 9 9" />
                <path d="M4 4a16 16 0 0 1 16 16" />
                <circle cx="5" cy="19" r="1" fill="currentColor" />
              </svg>
            </div>
            <span className="text-[9px] font-medium">RSS</span>
          </button>

          {/* 设置 */}
          <button 
            onClick={() => { setSettingsInitialView('main'); setActiveTab('settings'); }}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${
              activeTab === 'settings' ? 'text-cyber-lime -translate-y-1' : 'text-gray-500 hover:text-cyber-lime'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-cyber-lime/10' : ''}`}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </div>
            <span className="text-[9px] font-medium">设置</span>
          </button>
        </div>
      </nav>

      {/* 热力图日历 - 查看视频分布 */}
      <CustomDatePicker 
        isOpen={isCalendarOpen}
        onClose={() => setIsCalendarOpen(false)}
        currentFilter={customDateFilter}
        videos={videos}
        onApply={(filter) => {
          setCustomDateFilter(filter);
          setActiveFilter('custom');
        }}
      />

      {/* 时间筛选器 */}
      <DateFilterPicker
        isOpen={isFilterOpen}
        onClose={() => setIsFilterOpen(false)}
        currentFilter={customDateFilter}
        onApply={(filter) => {
          setCustomDateFilter(filter);
          setActiveFilter('custom');
        }}
      />

      {/* Toast 提示 - 右上角毛玻璃 */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 animate-slide-in-right">
          <div className="relative px-4 py-3 rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
            {/* 毛玻璃背景层 */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" />
            {/* 文字层 - 不模糊 */}
            <div className="relative flex items-center gap-2">
              <span className="text-cyber-lime">✓</span>
              <span className="text-white text-sm font-medium">{toast}</span>
            </div>
          </div>
          <style>{`
            @keyframes slide-in-right {
              from { transform: translateX(100%); opacity: 0; }
              to { transform: translateX(0); opacity: 1; }
            }
            .animate-slide-in-right {
              animation: slide-in-right 0.3s ease-out;
            }
          `}</style>
        </div>
      )}

      {/* 添加UP主弹窗 */}
      <AddUploaderModal
        isOpen={isAddUploaderOpen}
        onClose={() => setIsAddUploaderOpen(false)}
        onSuccess={() => {
          showToast('UP主添加成功');
        }}
      />

      {/* TODO 待办事项 */}
      <TodoList
        isOpen={isTodoOpen}
        onClose={() => setIsTodoOpen(false)}
      />

      {/* 设置/个人中心 */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        onLogout={handleLogout}
        watchLaterIds={watchLaterIds}
        onToggleWatchLater={toggleWatchLater}
      />

      {/* 时间轴 */}
      {showTimeline && (
        <VideoTimeline
          videos={videos}
          onClose={() => setShowTimeline(false)}
          watchLaterIds={watchLaterIds}
          onToggleWatchLater={toggleWatchLater}
          onDelete={handleDeleteVideo}
        />
      )}

      {/* UP主选择器弹窗 */}
      {isUploaderPickerOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
          onClick={() => { setIsUploaderPickerOpen(false); setUploaderSearchTerm(''); }}
        >
          <div 
            className="w-full max-w-lg bg-[#0c0c0c] rounded-t-3xl border-t border-white/10 max-h-[70vh] flex flex-col animate-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* 标题栏 */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
              <h3 className="text-white font-bold text-lg">选择 UP主</h3>
              <button
                onClick={() => { setIsUploaderPickerOpen(false); setUploaderSearchTerm(''); }}
                className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:bg-white/20"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12"/>
                </svg>
              </button>
            </div>
            
            {/* 搜索框 */}
            <div className="px-4 py-3">
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8"/>
                  <path d="M21 21l-4.35-4.35"/>
                </svg>
                <input
                  type="text"
                  placeholder="搜索 UP主..."
                  value={uploaderSearchTerm}
                  onChange={e => setUploaderSearchTerm(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50"
                />
              </div>
            </div>
            
            {/* UP主列表 */}
            <div className="flex-1 overflow-y-auto px-4 pb-4">
              {filteredUploaders.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  {uploaderSearchTerm ? '未找到匹配的 UP主' : '暂无 UP主数据'}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUploaders.map(uploader => (
                    <button
                      key={uploader.mid}
                      onClick={() => {
                        setSelectedUploader({ mid: uploader.mid, name: uploader.name });
                        setIsUploaderPickerOpen(false);
                        setUploaderSearchTerm('');
                        mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${
                        selectedUploader?.mid === uploader.mid
                          ? 'bg-violet-500/20 border border-violet-500/30'
                          : 'bg-white/5 border border-transparent hover:bg-white/10'
                      }`}
                    >
                      {uploader.face ? (
                        <img 
                          src={uploader.face.replace('http:', 'https:')} 
                          alt=""
                          referrerPolicy="no-referrer"
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white font-bold">
                          {uploader.name[0]}
                        </div>
                      )}
                      <div className="flex-1 text-left">
                        <p className="text-white font-medium text-sm">{uploader.name}</p>
                        <p className="text-gray-500 text-xs">{uploader.count} 个视频</p>
                      </div>
                      {selectedUploader?.mid === uploader.mid && (
                        <svg className="w-5 h-5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          <style>{`
            @keyframes slide-up {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
            .animate-slide-up {
              animation: slide-up 0.3s ease-out;
            }
          `}</style>
        </div>
      )}

      {/* 时间筛选下拉框 - 使用 Portal 渲染到 body */}
      {isTimeFilterOpen && (
        <>
          {/* 透明遮罩 */}
          <div 
            className="fixed inset-0 z-[9998]"
            onClick={() => setIsTimeFilterOpen(false)}
          />
          {/* 下拉菜单 */}
          <div 
            className="fixed z-[9999] bg-[#1a1a1a] rounded-xl border border-white/20 overflow-hidden shadow-2xl"
            style={{
              top: `${timeFilterPos.top}px`,
              left: `${timeFilterPos.left}px`,
              minWidth: `${timeFilterPos.width}px`,
            }}
          >
            {[
              { id: 'today', label: '今天' },
              { id: 'week', label: '本周' },
              { id: 'month', label: '本月' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveFilter(item.id as FilterType);
                  setIsTimeFilterOpen(false);
                  mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`w-full px-5 py-2.5 text-left text-xs transition-colors flex items-center gap-2 ${
                  activeFilter === item.id 
                    ? 'bg-cyber-lime/20 text-cyber-lime' 
                    : 'text-gray-300 hover:bg-white/10'
                }`}
              >
                <span>{item.label}</span>
                {activeFilter === item.id && (
                  <svg className="w-3 h-3 ml-auto text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
    </PullToRefresh>
  );
};

export default App;
