import React, { useState, useEffect, useMemo, useCallback, memo, useRef } from 'react';
import { createPortal } from 'react-dom';
import type { VideoWithUploader } from '../../lib/database.types';
import { ClockIcon } from '../shared/Icons';

interface VideoTimelineProps {
  videos: VideoWithUploader[];
  onClose: () => void;
  onVideoClick?: (bvid: string) => void;
  watchLaterIds?: Set<string>;
  onToggleWatchLater?: (bvid: string) => void;
  onDelete?: (bvid: string) => void;
}

// 解析 pubdate（可能是 ISO 字符串或 Unix 时间戳）
const parsePubdate = (pubdate: string | number | null): Date => {
  if (!pubdate) return new Date();
  if (typeof pubdate === 'number') {
    return new Date(pubdate * 1000);
  }
  // ISO 字符串或其他格式
  const parsed = new Date(pubdate);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

// 时间格式化
const formatTime = (pubdate: string | number | null): string => {
  const date = parsePubdate(pubdate);
  return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
};

// 判断是否是今天
const isToday = (pubdate: string | number | null): boolean => {
  const date = parsePubdate(pubdate);
  const today = new Date();
  return date.toDateString() === today.toDateString();
};

// 获取日期键
const getDateKey = (pubdate: string | number | null): string => {
  return parsePubdate(pubdate).toDateString();
};

// 获取日期标签
const getDateLabel = (pubdate: string | number | null): string => {
  const date = parsePubdate(pubdate);
  if (isToday(pubdate)) return '今天';
  return date.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'short' });
};

// 时间轴节点组件 - 使用 memo 优化
const TimelineNode = memo(({ 
  video, 
  isFirst, 
  isLast,
  onClick,
  onMenuClick,
  isMenuOpen
}: { 
  video: VideoWithUploader; 
  isFirst: boolean;
  isLast: boolean;
  onClick: () => void;
  onMenuClick: () => void;
  isMenuOpen: boolean;
}) => {
  const [imageLoaded, setImageLoaded] = useState(false);
  
  return (
    <div className="relative flex gap-4 group">
      {/* 时间轴线 */}
      <div className="flex flex-col items-center">
        {/* 上方线条 */}
        <div className={`w-0.5 flex-1 ${isFirst ? 'bg-transparent' : 'bg-gradient-to-b from-cyber-lime/50 to-cyber-lime'}`} />
        
        {/* 时间点 */}
        <div className="relative z-10 w-4 h-4 rounded-full bg-cyber-lime shadow-[0_0_12px_rgba(163,230,53,0.6)] flex items-center justify-center">
          <div className="w-2 h-2 rounded-full bg-white" />
        </div>
        
        {/* 下方线条 */}
        <div className={`w-0.5 flex-1 ${isLast ? 'bg-transparent' : 'bg-gradient-to-b from-cyber-lime to-cyber-lime/50'}`} />
      </div>
      
      {/* 时间标签 */}
      <div className="absolute left-0 -translate-x-full pr-3 top-1/2 -translate-y-1/2 text-right">
        <span className="text-cyber-lime font-mono text-sm font-bold">
          {formatTime(video.pubdate)}
        </span>
      </div>
      
      {/* 内容卡片 */}
      <div 
        onClick={onClick}
        className="flex-1 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-cyber-lime/30 rounded-2xl p-3 mb-4 cursor-pointer transition-all duration-300 group-hover:shadow-[0_0_20px_rgba(163,230,53,0.1)] active:scale-[0.98]"
      >
        <div className="flex gap-3">
          {/* 视频封面 */}
          <div className="relative w-28 h-16 rounded-xl overflow-hidden flex-shrink-0 bg-white/5">
            {!imageLoaded && (
              <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-white/10 animate-pulse" />
            )}
            <img
              src={video.pic?.replace('http:', 'https:')}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              onLoad={() => setImageLoaded(true)}
              className={`w-full h-full object-cover transition-opacity duration-300 ${imageLoaded ? 'opacity-100' : 'opacity-0'}`}
            />
            {/* 时长 */}
            {video.duration && (
              <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white font-mono">
                {Math.floor(video.duration / 60)}:{(video.duration % 60).toString().padStart(2, '0')}
              </span>
            )}
          </div>
          
          {/* 视频信息 */}
          <div className="flex-1 min-w-0 flex flex-col justify-between py-0.5">
            <h3 className="text-white text-sm font-medium line-clamp-2 leading-tight group-hover:text-cyber-lime transition-colors">
              {video.title}
            </h3>
            
            {/* UP主信息和三个点 */}
            <div className="flex items-center justify-between gap-2 mt-1">
              <div className="flex items-center gap-2 min-w-0">
                {video.uploader?.face && (
                  <img 
                    src={video.uploader.face.replace('http:', 'https:')} 
                    alt=""
                    referrerPolicy="no-referrer"
                    className="w-5 h-5 rounded-full object-cover"
                  />
                )}
                <span className="text-gray-400 text-xs truncate">
                  {video.uploader?.name || 'Unknown'}
                </span>
              </div>
              
              {/* 三个点按钮 */}
              <button
                onClick={(e) => { e.stopPropagation(); onMenuClick(); }}
                className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all ${
                  isMenuOpen ? 'bg-white/20' : 'hover:bg-white/10'
                }`}
              >
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="2"/>
                  <circle cx="12" cy="12" r="2"/>
                  <circle cx="19" cy="12" r="2"/>
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

TimelineNode.displayName = 'TimelineNode';

// 日期分组头
const DateHeader = memo(({ date, count }: { date: string; count: number }) => (
  <div className="flex items-center gap-3 mb-4 mt-6 first:mt-0">
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
    <span className="text-gray-400 text-sm font-medium px-3 py-1 bg-white/5 rounded-full">
      {date} · {count} 个视频
    </span>
    <div className="h-px flex-1 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
  </div>
));

DateHeader.displayName = 'DateHeader';

const VideoTimeline: React.FC<VideoTimelineProps> = ({ videos, onClose, onVideoClick, watchLaterIds, onToggleWatchLater, onDelete }) => {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [openMenuBvid, setOpenMenuBvid] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string>(getDateKey(Date.now())); // 默认今天
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const dateRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // 当前打开菜单的视频
  const menuVideo = useMemo(() => {
    if (!openMenuBvid) return null;
    return videos.find(v => v.bvid === openMenuBvid) || null;
  }, [openMenuBvid, videos]);

  // 锁定外部滚动，只允许内部容器滚动
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  // 跳转到指定日期
  const scrollToDate = useCallback((dateKey: string) => {
    setSelectedDate(dateKey);
    setShowDatePicker(false);
  }, []);

  // 按发布时间分组和排序 - 只显示所有有视频的日期
  const allGroupedVideos = useMemo(() => {
    // 按 pubdate 降序排序
    const sorted = [...videos].sort((a, b) => {
      const dateA = parsePubdate(a.pubdate);
      const dateB = parsePubdate(b.pubdate);
      return dateB.getTime() - dateA.getTime();
    });

    // 按日期分组
    const groups: { date: string; dateLabel: string; videos: VideoWithUploader[] }[] = [];
    let currentDate = '';

    sorted.forEach(video => {
      const dateKey = getDateKey(video.pubdate);
      const dateLabel = getDateLabel(video.pubdate);

      if (dateKey !== currentDate) {
        currentDate = dateKey;
        groups.push({ date: dateKey, dateLabel, videos: [video] });
      } else {
        groups[groups.length - 1].videos.push(video);
      }
    });

    return groups;
  }, [videos]);

  // 当前显示的日期组
  const currentGroup = useMemo(() => {
    return allGroupedVideos.find(g => g.date === selectedDate) || allGroupedVideos[0];
  }, [allGroupedVideos, selectedDate]);

  // 当前日期在所有日期中的索引
  const currentDateIndex = useMemo(() => {
    return allGroupedVideos.findIndex(g => g.date === selectedDate);
  }, [allGroupedVideos, selectedDate]);

  // 切换到前一天
  const gotoPrevDay = useCallback(() => {
    const prevIndex = currentDateIndex + 1;
    if (prevIndex < allGroupedVideos.length) {
      setSelectedDate(allGroupedVideos[prevIndex].date);
    }
  }, [currentDateIndex, allGroupedVideos]);

  // 切换到后一天
  const gotoNextDay = useCallback(() => {
    const nextIndex = currentDateIndex - 1;
    if (nextIndex >= 0) {
      setSelectedDate(allGroupedVideos[nextIndex].date);
    }
  }, [currentDateIndex, allGroupedVideos]);

  // 当日视频统计
  const todayStats = useMemo(() => {
    if (!currentGroup) return { count: 0, uploaders: 0 };
    const uploaders = new Set(currentGroup.videos.map(v => v.uploader?.name)).size;
    return { count: currentGroup.videos.length, uploaders };
  }, [currentGroup]);

  const handleVideoClick = useCallback((bvid: string) => {
    if (onVideoClick) {
      onVideoClick(bvid);
    } else {
      window.open(`https://www.bilibili.com/video/${bvid}`, '_blank');
    }
  }, [onVideoClick]);

  return (
    <div className="fixed inset-0 z-50 bg-[#050510] overflow-hidden">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-[#050510]/90 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center px-4 py-3">
          {/* 返回按钮 */}
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
          >
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          
          {/* 中间标题区域 */}
          <div className="flex-1 flex flex-col items-center justify-center">
            <h1 className="text-white font-bold text-base flex items-center justify-center gap-2">
              {currentGroup?.dateLabel || '时间轴'}
            </h1>
            <p className="text-gray-500 text-xs mt-0.5">
              {todayStats.count} 个视频 · {todayStats.uploaders} 位UP主
            </p>
          </div>

          {/* 左右切换和日期选择 */}
          <div className="flex items-center gap-2">
            {/* 前一天 */}
            <button
              onClick={gotoPrevDay}
              disabled={currentDateIndex >= allGroupedVideos.length - 1}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>

            {/* 日期选择 */}
            <button
              onClick={() => setShowDatePicker(!showDatePicker)}
              className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors ${
                showDatePicker ? 'bg-cyber-lime text-black' : 'bg-white/10 hover:bg-white/20 text-white'
              }`}
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
            </button>

            {/* 后一天 */}
            <button
              onClick={gotoNextDay}
              disabled={currentDateIndex <= 0}
              className="w-9 h-9 flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 日期选择器弹出层 */}
      {showDatePicker && (
        <>
          {/* 背景遮罩 */}
          <div 
            className="absolute inset-0 z-15" 
            onClick={() => setShowDatePicker(false)}
          />
          
          {/* 日期选择面板 */}
          <div className="absolute top-16 left-4 right-4 z-20 bg-[#0a0a0f]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl overflow-hidden max-h-[70vh]">
            {/* 头部 */}
            <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
              <span className="text-white font-medium">选择日期</span>
              <span className="text-gray-500 text-xs">{allGroupedVideos.length} 天</span>
            </div>

            {/* 日期网格 - 按月份分组 */}
            <div className="overflow-y-auto max-h-[calc(70vh-52px)] p-3">
              {(() => {
                // 按月份分组
                const monthGroups = new Map<string, typeof allGroupedVideos>();
                allGroupedVideos.forEach(group => {
                  const date = new Date(group.date);
                  const monthKey = `${date.getFullYear()}-${date.getMonth()}`;
                  const monthLabel = date.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long' });
                  if (!monthGroups.has(monthKey)) {
                    monthGroups.set(monthKey, []);
                  }
                  monthGroups.get(monthKey)!.push({ ...group, monthLabel });
                });

                return Array.from(monthGroups.entries()).map(([monthKey, days]) => (
                  <div key={monthKey} className="mb-4 last:mb-0">
                    {/* 月份标题 */}
                    <div className="text-xs text-gray-500 mb-2 px-1">
                      {(days[0] as any).monthLabel}
                    </div>

                    {/* 日期网格 */}
                    <div className="grid grid-cols-7 gap-1">
                      {days.map(group => {
                        const date = new Date(group.date);
                        const day = date.getDate();
                        const isCurrentDay = group.date === selectedDate;

                        return (
                          <button
                            key={group.date}
                            onClick={() => scrollToDate(group.date)}
                            className={`relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all ${
                              isCurrentDay
                                ? 'bg-cyber-lime text-black font-bold scale-105'
                                : 'bg-white/5 hover:bg-white/15 text-white'
                            }`}
                          >
                            <span className="text-sm">{day}</span>
                            <span className={`text-[10px] ${isCurrentDay ? 'text-black/70' : 'text-cyber-lime'}`}>
                              {group.videos.length}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>
        </>
      )}

      {/* 时间轴内容 */}
      <div ref={scrollContainerRef} className="h-[calc(100vh-64px)] overflow-y-auto overscroll-none">
        <div className="max-w-xl mx-auto px-4 py-6 pl-20">
          {!currentGroup ? (
            <div className="flex flex-col items-center justify-center py-20 text-gray-500">
              <svg className="w-16 h-16 mb-4 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
                <line x1="16" y1="2" x2="16" y2="6"/>
                <line x1="8" y1="2" x2="8" y2="6"/>
                <line x1="3" y1="10" x2="21" y2="10"/>
              </svg>
              <p>暂无视频数据</p>
            </div>
          ) : (
            <div>
              {currentGroup.videos.map((video, index) => (
                <TimelineNode
                  key={video.bvid}
                  video={video}
                  isFirst={index === 0}
                  isLast={index === currentGroup.videos.length - 1}
                  onClick={() => handleVideoClick(video.bvid)}
                  onMenuClick={() => setOpenMenuBvid(openMenuBvid === video.bvid ? null : video.bvid)}
                  isMenuOpen={openMenuBvid === video.bvid}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 底部抽屉菜单 */}
      {menuVideo && onToggleWatchLater && createPortal(
        <div className="fixed inset-0 z-[99999]" onClick={(e) => e.stopPropagation()}>
          {/* 遮罩层 */}
          <div 
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpenMenuBvid(null)}
            style={{ animation: 'fadeIn 0.25s ease-out' }}
          />
          
          {/* 抽屉内容 */}
          <div 
            className="absolute bottom-0 left-0 right-0"
            style={{ animation: 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <div className="bg-[#0c0c0c] border-t border-white/10 rounded-t-2xl pb-safe">
              {/* 拖拽指示条 */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-white/25 rounded-full" />
              </div>
              
              {/* 视频信息预览 */}
              <div className="px-4 pb-3 pt-1 flex gap-3 items-start border-b border-white/10">
                <img 
                  src={menuVideo.pic?.replace('http:', 'https:') || ''}
                  alt={menuVideo.title}
                  className="w-16 h-10 rounded object-cover bg-gray-800 shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-white text-sm font-medium line-clamp-2 leading-snug">{menuVideo.title}</h4>
                  <p className="text-cyber-lime text-xs mt-0.5 truncate">{menuVideo.uploader?.name}</p>
                </div>
              </div>

              {/* 操作按钮列表 */}
              <div className="py-1">
                {/* 加入/移除待看 */}
                <button
                  onClick={() => {
                    onToggleWatchLater(menuVideo.bvid);
                    setOpenMenuBvid(null);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                >
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                    watchLaterIds?.has(menuVideo.bvid) ? 'bg-red-500/15' : 'bg-white/10'
                  }`}>
                    {watchLaterIds?.has(menuVideo.bvid) ? (
                      <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/>
                        <line x1="15" y1="9" x2="9" y2="15"/>
                        <line x1="9" y1="9" x2="15" y2="15"/>
                      </svg>
                    ) : (
                      <ClockIcon className="w-5 h-5 text-cyber-lime" />
                    )}
                  </div>
                  <div className="flex-1 text-left">
                    <span className={`text-[15px] font-medium ${watchLaterIds?.has(menuVideo.bvid) ? 'text-red-400' : 'text-white'}`}>
                      {watchLaterIds?.has(menuVideo.bvid) ? '从待看移除' : '加入待看'}
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {watchLaterIds?.has(menuVideo.bvid) ? '不再显示在待看队列中' : '稍后观看，不错过精彩内容'}
                    </p>
                  </div>
                </button>

                {/* 分享 */}
                <button
                  onClick={() => {
                    const url = `https://www.bilibili.com/video/${menuVideo.bvid}`;
                    if (navigator.share) {
                      navigator.share({ title: menuVideo.title, url });
                    } else {
                      navigator.clipboard.writeText(url);
                      alert('链接已复制到剪贴板');
                    }
                    setOpenMenuBvid(null);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="18" cy="5" r="3"/>
                      <circle cx="6" cy="12" r="3"/>
                      <circle cx="18" cy="19" r="3"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-[15px] text-white font-medium">分享</span>
                    <p className="text-xs text-gray-500 mt-0.5">分享给好友或复制链接</p>
                  </div>
                </button>

                {/* 在B站打开 */}
                <button
                  onClick={() => {
                    window.open(`https://www.bilibili.com/video/${menuVideo.bvid}`, '_blank');
                    setOpenMenuBvid(null);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-[15px] text-white font-medium">在B站打开</span>
                    <p className="text-xs text-gray-500 mt-0.5">跳转到哔哩哔哩观看</p>
                  </div>
                </button>

                {/* 删除视频 */}
                {onDelete && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center">
                      <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-[15px] text-red-400 font-medium">删除视频</span>
                      <p className="text-xs text-gray-500 mt-0.5">从数据库中永久移除</p>
                    </div>
                  </button>
                )}
              </div>

              {/* 取消按钮 */}
              <div className="px-4 pb-4 pt-2">
                <button
                  onClick={() => setOpenMenuBvid(null)}
                  className="w-full py-3 bg-white/10 active:bg-white/15 rounded-xl text-white text-[15px] font-medium transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 删除确认对话框 */}
      {showDeleteConfirm && menuVideo && onDelete && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
          {/* 遮罩 */}
          <div 
            className="absolute inset-0 bg-black/80"
            onClick={() => setShowDeleteConfirm(false)}
            style={{ animation: 'fadeIn 0.2s ease-out' }}
          />
          
          {/* 对话框 */}
          <div 
            className="relative bg-[#1a1a1f] rounded-2xl p-6 max-w-sm w-full border border-white/10 shadow-2xl"
            style={{ animation: 'scaleIn 0.25s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            {/* 警告图标 */}
            <div className="flex justify-center mb-4">
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                  <line x1="12" y1="9" x2="12" y2="13"/>
                  <line x1="12" y1="17" x2="12.01" y2="17"/>
                </svg>
              </div>
            </div>
            
            {/* 标题 */}
            <h3 className="text-white text-lg font-bold text-center mb-2">确定删除？</h3>
            
            {/* 描述 */}
            <p className="text-gray-400 text-sm text-center mb-6 leading-relaxed">
              此操作将永久删除视频<br/>
              <span className="text-white font-medium">"{menuVideo.title.length > 20 ? menuVideo.title.slice(0, 20) + '...' : menuVideo.title}"</span><br/>
              删除后无法恢复
            </p>
            
            {/* 按钮 */}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  onDelete(menuVideo.bvid);
                  setShowDeleteConfirm(false);
                  setOpenMenuBvid(null);
                }}
                className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl text-white font-medium transition-colors"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes scaleIn {
          from { opacity: 0; transform: scale(0.9); }
          to { opacity: 1; transform: scale(1); }
        }
        .pb-safe {
          padding-bottom: env(safe-area-inset-bottom, 16px);
        }
      `}</style>
    </div>
  );
};

export default memo(VideoTimeline);
