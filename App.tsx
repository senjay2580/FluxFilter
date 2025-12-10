import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Tab, FilterType, DateFilter } from './types';
import VideoCard from './components/VideoCard';
import { HomeIcon, ClockIcon, SearchIcon, CalendarIcon, SlidersIcon } from './components/Icons';
import CustomDatePicker from './components/CustomDatePicker';
import DateFilterPicker from './components/DateFilterPicker';
import SyncButton from './components/SyncButton';
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
  const [searchTerm, setSearchTerm] = useState('');
  
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
  
  // Toggle Watch Later
  const toggleWatchLater = (id: string) => {
    setWatchLaterIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id);
      else newSet.add(id);
      return newSet;
    });
  };

  // Filter Logic
  const filteredVideos = useMemo(() => {
    let result = [...videos];

    // 1. Search
    if (searchTerm) {
      result = result.filter(v => v.title.toLowerCase().includes(searchTerm.toLowerCase()));
    }

    // 2. Tab
    if (activeTab === 'watchLater') {
      result = result.filter(v => watchLaterIds.has(v.bvid));
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

  return (
    <div className="min-h-screen bg-cyber-dark pb-24 font-sans selection:bg-cyber-lime selection:text-black">
      
      {/* Header & Sticky Filter */}
      <header className="sticky top-0 z-40 w-full transition-all duration-300">
        {/* Top Bar */}
        <div className="bg-cyber-dark/80 backdrop-blur-md px-4 py-3 border-b border-white/5">
          <div className="flex items-center gap-3">
            <img src={LogoSvg} alt="FluxFilter" className="w-9 h-9 shrink-0" />
            <div className="relative flex-1">
              <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input 
                type="text" 
                placeholder="Search neural streams..." 
                className="w-full bg-white/5 border border-white/10 rounded-full pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 transition-colors"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
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
        
        {activeTab === 'home' && !searchTerm && activeFilter === 'all' && videos.length > 0 && (
             <div className="mb-8">
                <h2 className="text-xl font-display text-white mb-4 flex items-center gap-2">
                    <span className="w-1 h-6 bg-cyber-lime rounded-full shadow-[0_0_8px_#a3e635]"></span>
                    热门推荐
                </h2>
                <div className="flex gap-4 overflow-x-auto no-scrollbar pb-4 snap-x">
                    {videos.slice(0, 3).map(v => (
                        <div key={v.bvid} className="snap-center shrink-0 w-64 aspect-[3/4] rounded-xl overflow-hidden relative group cursor-pointer"
                             onClick={() => window.open(`https://www.bilibili.com/video/${v.bvid}`, '_blank')}>
                            <img src={v.pic || ''} className="w-full h-full object-cover" />
                            <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-transparent"></div>
                            <div className="absolute bottom-3 left-3 right-3">
                                <p className="text-white font-bold text-sm line-clamp-2">{v.title}</p>
                            </div>
                        </div>
                    ))}
                </div>
             </div>
        )}

        <div className="space-y-6">
            <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-2">
                {activeTab === 'watchLater' ? '待看列表' : '最新视频'}
                {!loading && <span className="ml-2 text-cyber-lime">({filteredVideos.length})</span>}
            </h2>
            
            {/* 加载状态 */}
            {loading && (
                <div className="text-center py-20">
                    <div className="w-8 h-8 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-gray-500">加载中...</p>
                </div>
            )}

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

            {/* 筛选后无结果 */}
            {!loading && !error && videos.length > 0 && filteredVideos.length === 0 && (
                <div className="text-center py-20 text-gray-500 col-span-2">
                    <p>当前筛选条件下没有视频</p>
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
      </main>

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-cyber-dark/80 backdrop-blur-xl border-t border-white/5 pb-safe pt-2 px-6 z-50 h-[80px]">
        <div className="flex justify-around items-center h-full max-w-lg mx-auto pb-4">
          <button 
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${
              activeTab === 'home' ? 'text-cyber-lime -translate-y-2' : 'text-gray-500'
            }`}
          >
            <div className={`p-2 rounded-xl transition-all ${activeTab === 'home' ? 'bg-cyber-lime/10 shadow-[0_0_15px_rgba(163,230,53,0.2)]' : ''}`}>
               <HomeIcon className="w-6 h-6" />
            </div>
            <span className="text-[10px] font-medium">Discovery</span>
          </button>
          
          <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-cyber-lime to-cyan-400 flex items-center justify-center -translate-y-6 shadow-[0_0_20px_rgba(163,230,53,0.4)] border-4 border-cyber-dark">
             <div className="text-black font-bold text-xl">+</div>
          </div>

          <button 
            onClick={() => setActiveTab('watchLater')}
            className={`flex flex-col items-center gap-1 transition-all duration-300 ${
              activeTab === 'watchLater' ? 'text-cyber-lime -translate-y-2' : 'text-gray-500'
            }`}
          >
             <div className={`p-2 rounded-xl transition-all ${activeTab === 'watchLater' ? 'bg-cyber-lime/10 shadow-[0_0_15px_rgba(163,230,53,0.2)]' : ''}`}>
                <ClockIcon className="w-6 h-6" />
             </div>
            <span className="text-[10px] font-medium">TODO</span>
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
    </div>
  );
};

export default App;
