import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Tab, FilterType, DateFilter } from './types';
import VideoCard from './components/VideoCard';
import { HomeIcon, ClockIcon, SearchIcon, CalendarIcon, SlidersIcon } from './components/Icons';
import CustomDatePicker from './components/CustomDatePicker';
import DateFilterPicker from './components/DateFilterPicker';
import SyncButton from './components/SyncButton';
import AddUploaderModal from './components/AddUploaderModal';
import TodoList from './components/TodoList';
import Loader3D, { LoaderPulse } from './components/Loader3D';
import PullToRefresh from './components/PullToRefresh';
import RssFeed from './components/RssFeed';
import HotCarousel from './components/HotCarousel';
import SettingsModal from './components/SettingsModal';
import AuthPage from './components/AuthPage';
import LogoSvg from './assets/logo.svg';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { supabase, isSupabaseConfigured, addToWatchlist, removeFromWatchlistByBvid } from './lib/supabase';
import { getStoredUserId, getCurrentUser, logout, type User } from './lib/auth';
import { clearCookieCache } from './lib/bilibili';
import type { VideoWithUploader, WatchlistItem } from './lib/database.types';

const App = () => {
  // 认证状态
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [watchLaterIds, setWatchLaterIds] = useState<Set<string>>(new Set());
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [customDateFilter, setCustomDateFilter] = useState<DateFilter>({});
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isAddUploaderOpen, setIsAddUploaderOpen] = useState(false);
  const [isTodoOpen, setIsTodoOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 检查登录状态
  useEffect(() => {
    const checkAuth = async () => {
      const userId = getStoredUserId();
      if (userId) {
        const user = await getCurrentUser();
        if (user) {
          setCurrentUser(user);
          setIsAuthenticated(true);
          return;
        }
      }
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
  
  // Infinite Scroll State
  const [visibleCount, setVisibleCount] = useState(10);
  const mainRef = React.useRef<HTMLDivElement>(null);

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

  // 从 Supabase 获取视频数据
  const fetchVideos = useCallback(async () => {
    // 未配置 Supabase 时直接返回空
    if (!isSupabaseConfigured) {
      setLoading(false);
      setVideos([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      
      const { data, error: fetchError } = await supabase
        .from('video')
        .select(`
          *,
          uploader:uploader!fk_video_uploader (name, face)
        `)
        .order('pubdate', { ascending: false });

      if (fetchError) throw fetchError;
      setVideos((data as VideoWithUploader[]) || []);
    } catch (err) {
      console.error('获取视频失败:', err);
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  // 从 Supabase 获取待看列表
  const fetchWatchlist = useCallback(async () => {
    if (!isSupabaseConfigured) return;
    
    try {
      const { data, error: fetchError } = await supabase
        .from('watchlist')
        .select('bvid');
      
      if (fetchError) throw fetchError;
      
      const bvidSet = new Set(data?.map(item => item.bvid) || []);
      setWatchLaterIds(bvidSet);
    } catch (err) {
      console.error('获取待看列表失败:', err);
    }
  }, []);

  // 初始加载
  useEffect(() => {
    fetchVideos();
    fetchWatchlist();
  }, [fetchVideos, fetchWatchlist]);

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
    if (isSupabaseConfigured) {
      try {
        setWatchlistLoading(true);
        if (isInList) {
          await removeFromWatchlistByBvid(bvid);
        } else {
          await addToWatchlist(bvid);
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

  // Filter Logic
  const filteredVideos = useMemo(() => {
    let result = [...videos];

    // 1. Tab - 先根据当前界面过滤
    if (activeTab === 'watchLater') {
      result = result.filter(v => watchLaterIds.has(v.bvid));
    }

    // 2. Search - 基于当前界面搜索（标题 + UP主名称）
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(v => 
        v.title.toLowerCase().includes(term) ||
        (v.uploader?.name || '').toLowerCase().includes(term)
      );
    }

    // 3. Time Filter
    const now = new Date();
    result = result.filter(v => {
      if (activeFilter === 'all') return true;
      if (!v.pubdate) return true;
      
      const pubDate = new Date(v.pubdate);
      const diffTime = Math.abs(now.getTime() - pubDate.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 

      if (activeFilter === 'today') return diffDays <= 1;
      if (activeFilter === 'week') return diffDays <= 7;
      if (activeFilter === 'month') return diffDays <= 30;
      
      if (activeFilter === 'custom') {
         if (!customDateFilter.year) return true;
         if (pubDate.getFullYear() !== customDateFilter.year) return false;
         if (customDateFilter.month !== undefined && pubDate.getMonth() !== customDateFilter.month) return false;
         if (customDateFilter.day !== undefined && pubDate.getDate() !== customDateFilter.day) return false;
         return true;
      }
      
      return true;
    });

    return result;
  }, [videos, activeTab, watchLaterIds, activeFilter, customDateFilter, searchTerm]);

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
    await fetchVideos();
    showToast('刷新成功');
  }, [fetchVideos]);

  // 认证检查中显示加载
  if (isAuthenticated === null) {
    return (
      <div className="h-screen bg-[#0a0a0f] flex items-center justify-center">
        <LoaderPulse size="lg" />
      </div>
    );
  }

  // 未登录显示登录页
  if (!isAuthenticated) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <PullToRefresh onRefresh={handlePullRefresh} scrollContainerRef={mainRef}>
    <div className="h-screen bg-cyber-dark font-sans selection:bg-cyber-lime selection:text-black relative overflow-hidden flex flex-col">
      
      {/* PWA 安装提示 */}
      <PWAInstallPrompt />
      
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
                placeholder={activeTab === 'watchLater' ? '搜索待看列表...' : '搜索视频或UP主...'}
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
        <div className="bg-black/30 backdrop-blur-xl border-b border-white/10 py-2 overflow-x-auto no-scrollbar">
          <div className="flex px-4 gap-2">
            {[
              { id: 'all', label: 'All' },
              { id: 'today', label: 'Today' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
            ].map((chip) => (
              <button
                key={chip.id}
                onClick={() => {
                  setActiveFilter(chip.id as FilterType);
                  mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                }}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-all border ${
                  activeFilter === chip.id 
                    ? 'bg-cyber-lime text-black border-cyber-lime shadow-[0_0_10px_rgba(163,230,53,0.3)]' 
                    : 'bg-white/5 text-gray-400 border-white/5 hover:border-gray-600'
                }`}
              >
                {chip.label}
              </button>
            ))}
            
            {/* Custom Filter Chip */}
            <button
              onClick={() => setIsFilterOpen(true)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-all border flex items-center gap-1.5 ${
                activeFilter === 'custom'
                    ? 'bg-cyber-lime text-black border-cyber-lime shadow-[0_0_10px_rgba(163,230,53,0.3)]' 
                    : 'bg-white/5 text-gray-400 border-white/5 hover:border-gray-600'
              }`}
            >
              <SlidersIcon className="w-3 h-3" />
              {activeFilter === 'custom' 
                ? `${customDateFilter.year}${customDateFilter.month !== undefined ? `/${customDateFilter.month + 1}月` : '年'}`
                : '自定义'}
            </button>
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
        {/* 页面切换动画容器 */}
        <div 
          key={activeTab}
          className="animate-page-fade-in"
        >
        
        {/* RSS 阅读界面 */}
        {activeTab === 'rss' && (
          <RssFeed scrollContainerRef={mainRef} />
        )}

        {/* TODO 待办事项界面 */}
        {activeTab === 'todo' && (
          <TodoList embedded />
        )}
        
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
          <HotCarousel videos={videos.slice(0, 5)} />
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
                            isInWatchlist={watchLaterIds.has(video.bvid)}
                        />
                    ))}
                </div>
            )}
            
            {/* Loading / End indicator */}
            {!loading && filteredVideos.length > 0 && (
                <div className="py-8 flex justify-center">
                    {visibleCount < filteredVideos.length ? (
                        <div className="w-6 h-6 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <p className="text-gray-600 text-xs font-mono">已加载全部</p>
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

          {/* TODO 待办事项 */}
          <button 
            onClick={() => setActiveTab('todo')}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${
              activeTab === 'todo' ? 'text-cyber-lime -translate-y-1' : 'text-gray-500 hover:text-cyber-lime'
            }`}
          >
            <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'todo' ? 'bg-cyber-lime/10' : ''}`}>
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <span className="text-[9px] font-medium">TODO</span>
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
      />
    </div>
    </PullToRefresh>
  );
};

export default App;
