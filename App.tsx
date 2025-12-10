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
import SplashScreen from './components/SplashScreen';
import LogoSvg from './assets/logo.svg';
import { supabase, isSupabaseConfigured } from './lib/supabase';
import type { VideoWithUploader } from './lib/database.types';

const App = () => {
  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [watchLaterIds, setWatchLaterIds] = useState<Set<string>>(new Set());
  const [activeFilter, setActiveFilter] = useState<FilterType>('all');
  const [customDateFilter, setCustomDateFilter] = useState<DateFilter>({});
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isAddUploaderOpen, setIsAddUploaderOpen] = useState(false);
  const [isTodoOpen, setIsTodoOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSplash, setShowSplash] = useState(true);
  
  // 真实数据状态
  const [videos, setVideos] = useState<VideoWithUploader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Infinite Scroll State
  const [visibleCount, setVisibleCount] = useState(10);

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
          uploader:mid (name, face)
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

  // 初始加载
  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

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

  // Toggle Watch Later
  const toggleWatchLater = (id: string) => {
    setWatchLaterIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
        showToast('已从待看列表移除');
      } else {
        newSet.add(id);
        showToast('已加入待看列表 ✓');
      }
      return newSet;
    });
  };

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

  // Infinite Scroll Handler
  useEffect(() => {
    const handleScroll = () => {
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500) {
        setVisibleCount(prev => Math.min(prev + 5, filteredVideos.length));
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [filteredVideos.length]);

  // 下拉刷新处理
  const handlePullRefresh = useCallback(async () => {
    await fetchVideos();
    showToast('刷新成功 ✓');
  }, [fetchVideos]);

  // 启动页完成回调
  const handleSplashComplete = useCallback(() => {
    setShowSplash(false);
  }, []);

  // 显示启动页
  if (showSplash) {
    return (
      <SplashScreen 
        onComplete={handleSplashComplete}
        onSync={fetchVideos}
      />
    );
  }

  return (
    <PullToRefresh onRefresh={handlePullRefresh}>
    <div className="min-h-screen bg-cyber-dark pb-24 font-sans selection:bg-cyber-lime selection:text-black relative overflow-hidden">
      
      {/* 星空渐变背景 */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        {/* 深空渐变 */}
        <div className="absolute inset-0 bg-gradient-to-b from-[#0a0a1a] via-[#050510] to-[#0d0d20]" />
        
        {/* 星云效果 */}
        <div className="absolute top-0 left-0 w-full h-full">
          <div className="absolute top-[10%] left-[10%] w-96 h-96 bg-purple-900/20 rounded-full blur-[120px] animate-nebula" />
          <div className="absolute top-[40%] right-[5%] w-80 h-80 bg-cyber-lime/10 rounded-full blur-[100px] animate-nebula" style={{ animationDelay: '2s' }} />
          <div className="absolute bottom-[20%] left-[20%] w-72 h-72 bg-cyan-500/10 rounded-full blur-[100px] animate-nebula" style={{ animationDelay: '4s' }} />
          <div className="absolute top-[60%] right-[30%] w-64 h-64 bg-pink-500/5 rounded-full blur-[80px] animate-nebula" style={{ animationDelay: '3s' }} />
        </div>
        
        {/* 星星层 */}
        <div className="absolute inset-0">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className="absolute rounded-full bg-white animate-twinkle"
              style={{
                width: `${Math.random() * 2 + 1}px`,
                height: `${Math.random() * 2 + 1}px`,
                left: `${Math.random() * 100}%`,
                top: `${Math.random() * 100}%`,
                animationDelay: `${Math.random() * 5}s`,
                animationDuration: `${2 + Math.random() * 3}s`,
                opacity: Math.random() * 0.7 + 0.3,
              }}
            />
          ))}
        </div>
        
        {/* 大星星（带光芒） */}
        <div className="absolute inset-0">
          {[...Array(3)].map((_, i) => (
            <div
              key={`star-${i}`}
              className="absolute animate-twinkle-bright"
              style={{
                left: `${10 + i * 12}%`,
                top: `${15 + (i % 3) * 25}%`,
                animationDelay: `${i * 0.7}s`,
              }}
            >
              <div className="w-1 h-1 bg-white rounded-full shadow-[0_0_10px_2px_rgba(255,255,255,0.8)]" />
            </div>
          ))}
        </div>
        
        {/* 流星 */}
        <div className="absolute inset-0 overflow-hidden">
          {[0,].map((i) => (
            <div
              key={`meteor-${i}`}
              className="absolute animate-shooting-star"
              style={{
                top: `${10 + i * 25}%`,
                left: '0%',
                animationDelay: `${i * 4}s`,
                transform: 'rotate(15deg)',
              }}
            >
              <div 
                className="w-28 h-0.5 bg-gradient-to-l from-white via-white/60 to-transparent rounded-full"
                style={{ 
                  boxShadow: '0 0 8px 2px rgba(255,255,255,0.4)',
                }}
              />
            </div>
          ))}
        </div>
        
        {/* 极光效果 */}
        <div className="absolute bottom-0 left-0 right-0 h-64 overflow-hidden opacity-30">
          <div className="absolute inset-0 bg-gradient-to-t from-cyber-lime/20 via-cyan-500/10 to-transparent animate-aurora" />
          <div className="absolute inset-0 bg-gradient-to-t from-purple-500/10 via-pink-500/5 to-transparent animate-aurora" style={{ animationDelay: '2s' }} />
        </div>
        
        {/* 顶部渐变遮罩 */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-[#0a0a1a] to-transparent" />
        
        {/* CSS 动画 */}
        <style>{`
          @keyframes nebula {
            0%, 100% { 
              transform: scale(1) translate(0, 0);
              opacity: 0.15;
            }
            50% { 
              transform: scale(1.1) translate(10px, -10px);
              opacity: 0.25;
            }
          }
          .animate-nebula {
            animation: nebula 15s ease-in-out infinite;
          }
          
          @keyframes twinkle {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.2); }
          }
          .animate-twinkle {
            animation: twinkle ease-in-out infinite;
          }
          
          @keyframes twinkle-bright {
            0%, 100% { opacity: 0.5; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.5); }
          }
          .animate-twinkle-bright {
            animation: twinkle-bright 3s ease-in-out infinite;
          }
          
          @keyframes shooting-star {
            0% { 
              transform: rotate(35deg) translateX(-50px);
              opacity: 0;
            }
            10% { 
              opacity: 1;
            }
            70% { 
              opacity: 0.8;
            }
            100% { 
              transform: rotate(35deg) translateX(120vh);
              opacity: 0;
            }
          }
          .animate-shooting-star {
            animation: shooting-star 2s ease-out infinite;
          }
          
          @keyframes aurora {
            0%, 100% { 
              transform: translateX(-20%) skewX(-5deg);
              opacity: 0.2;
            }
            50% { 
              transform: translateX(20%) skewX(5deg);
              opacity: 0.4;
            }
          }
          .animate-aurora {
            animation: aurora 10s ease-in-out infinite;
          }
        `}</style>
      </div>
      
      {/* Header & Sticky Filter */}
      <header className="sticky top-0 z-40 w-full transition-all duration-300">
        {/* Top Bar */}
        <div className="bg-cyber-dark/80 backdrop-blur-md px-4 py-3 border-b border-white/5">
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
          </div>
        </div>

        {/* Filter Chips */}
        <div className="bg-cyber-dark/95 backdrop-blur-lg border-b border-white/5 py-2 overflow-x-auto no-scrollbar">
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
                  window.scrollTo({ top: 0, behavior: 'smooth' });
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
      <main className="px-3 py-4 max-w-4xl mx-auto">
        
        {/* RSS 阅读界面 */}
        {activeTab === 'rss' && (
          <RssFeed />
        )}
        
        {/* 视频内容 */}
        {activeTab !== 'rss' && (
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
        
        {activeTab === 'home' && !searchTerm && activeFilter === 'all' && videos.length > 0 && (
             <div className="mb-8 relative">
                {/* 装饰性插图 */}
                <div className="absolute -top-4 -right-2 w-24 h-24 opacity-20 pointer-events-none">
                  <svg viewBox="0 0 100 100" className="w-full h-full">
                    <defs>
                      <linearGradient id="decorGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" stopColor="#a3e635"/>
                        <stop offset="100%" stopColor="#22d3ee"/>
                      </linearGradient>
                    </defs>
                    <circle cx="50" cy="50" r="40" fill="none" stroke="url(#decorGrad)" strokeWidth="1" strokeDasharray="4 4"/>
                    <circle cx="50" cy="50" r="25" fill="none" stroke="url(#decorGrad)" strokeWidth="0.5"/>
                    <circle cx="50" cy="50" r="8" fill="url(#decorGrad)" opacity="0.5"/>
                  </svg>
                </div>
                
                <h2 className="text-xl font-display text-white mb-4 flex items-center gap-3">
                    <span className="w-1.5 h-7 bg-gradient-to-b from-cyber-lime to-cyan-400 rounded-full shadow-[0_0_12px_#a3e635]"></span>
                    <span className="bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">热门推荐</span>
                    <span className="ml-auto text-xs text-gray-500 font-normal flex items-center gap-1">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
                      </svg>
                      精选
                    </span>
                </h2>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 snap-x">
                    {videos.slice(0, 3).map((v, index) => (
                        <div key={v.bvid} 
                             className="snap-center shrink-0 w-56 aspect-[3/4] rounded-2xl overflow-hidden relative group cursor-pointer
                                        shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:shadow-[0_12px_40px_rgba(163,230,53,0.2)]
                                        border border-white/10 hover:border-cyber-lime/30 transition-all duration-300
                                        hover:-translate-y-2 hover:scale-[1.02]"
                             onClick={() => window.open(`https://www.bilibili.com/video/${v.bvid}`, '_blank')}>
                            <img src={v.pic || ''} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" referrerPolicy="no-referrer" />
                            
                            {/* 多层渐变 */}
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/30 to-transparent"></div>
                            <div className="absolute inset-0 bg-gradient-to-br from-cyber-lime/10 via-transparent to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                            
                            {/* Hot 图标 */}
                            <div className="absolute top-3 left-3 px-2 py-1 bg-gradient-to-r from-orange-500 to-red-500 rounded-full flex items-center gap-1 shadow-lg">
                              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
                                <path d="m12 12.9l-2.03 2c-.46.46-.82 1.03-.93 1.67C8.74 18.41 10.18 20 12 20s3.26-1.59 2.96-3.42c-.11-.64-.46-1.22-.93-1.67z"/>
                                <path d="M15.56 6.55C14.38 8.02 12 7.19 12 5.3V3.77c0-.8-.89-1.28-1.55-.84C8.12 4.49 4 7.97 4 13c0 2.92 1.56 5.47 3.89 6.86a4.86 4.86 0 0 1-.81-3.68c.19-1.04.75-1.98 1.51-2.72l2.71-2.67c.39-.38 1.01-.38 1.4 0l2.73 2.69c.74.73 1.3 1.65 1.48 2.68c.25 1.36-.07 2.64-.77 3.66c1.89-1.15 3.29-3.06 3.71-5.3c.61-3.27-.81-6.37-3.22-8.1c-.33-.25-.8-.2-1.07.13"/>
                              </svg>
                              <span className="text-white text-[10px] font-bold">HOT</span>
                            </div>
                            
                            {/* 内容 */}
                            <div className="absolute bottom-0 left-0 right-0 p-4">
                                <p className="text-white font-bold text-sm line-clamp-2 drop-shadow-lg">{v.title}</p>
                                <div className="flex items-center gap-2 mt-2">
                                  <span className="text-cyber-lime/80 text-xs truncate">{v.uploader?.name}</span>
                                </div>
                            </div>
                            
                            {/* 播放按钮 */}
                            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300">
                              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-cyber-lime to-lime-400 flex items-center justify-center shadow-[0_0_30px_rgba(163,230,53,0.6)] border-2 border-white/20">
                                <svg className="w-6 h-6 text-black ml-1" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M8 5v14l11-7z"/>
                                </svg>
                              </div>
                            </div>
                        </div>
                    ))}
                </div>
             </div>
        )}

        <div className="space-y-6 relative">
            {/* 区域装饰 */}
            <div className="absolute -left-6 top-0 w-32 h-32 opacity-10 pointer-events-none">
              <svg viewBox="0 0 100 100" className="w-full h-full">
                <path d="M10,50 Q25,25 50,10 T90,50 Q75,75 50,90 T10,50" fill="none" stroke="#a3e635" strokeWidth="0.5" strokeDasharray="2 2"/>
                <circle cx="50" cy="50" r="3" fill="#a3e635"/>
              </svg>
            </div>
            
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-cyber-lime rounded-full shadow-[0_0_8px_#a3e635] animate-pulse" />
                  <span>{activeTab === 'watchLater' ? '待看列表' : '最新视频'}</span>
                </div>
                {!loading && (
                  <span className="px-2 py-0.5 bg-cyber-lime/10 text-cyber-lime text-xs rounded-full border border-cyber-lime/20">
                    {filteredVideos.length}
                  </span>
                )}
            </h2>
            
            {/* 加载状态 - 3D 动画 */}
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
                      className="px-6 py-2.5 bg-gradient-to-r from-cyber-lime to-lime-400 text-black font-medium rounded-full 
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
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-cyber-dark/80 backdrop-blur-xl border-t border-white/5 pb-safe pt-2 px-4 z-50 h-[80px]">
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
            onClick={() => setIsTodoOpen(true)}
            className="flex flex-col items-center gap-1 transition-all duration-300 text-gray-500 hover:text-cyber-lime"
          >
            <div className="p-1.5 rounded-xl">
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

      {/* Toast 提示 */}
      {toast && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-cyber-lime text-black rounded-full text-sm font-medium shadow-lg animate-bounce">
          {toast}
        </div>
      )}

      {/* 添加UP主弹窗 */}
      <AddUploaderModal
        isOpen={isAddUploaderOpen}
        onClose={() => setIsAddUploaderOpen(false)}
        onSuccess={() => {
          showToast('UP主添加成功 ✓');
        }}
      />

      {/* TODO 待办事项 */}
      <TodoList
        isOpen={isTodoOpen}
        onClose={() => setIsTodoOpen(false)}
      />
    </div>
    </PullToRefresh>
  );
};

export default App;
