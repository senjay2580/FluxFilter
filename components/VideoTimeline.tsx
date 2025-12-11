import React, { useState, useEffect, useMemo, useCallback, memo } from 'react';
import type { VideoWithUploader } from '../lib/database.types';

interface VideoTimelineProps {
  videos: VideoWithUploader[];
  onClose: () => void;
  onVideoClick?: (bvid: string) => void;
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
  onClick 
}: { 
  video: VideoWithUploader; 
  isFirst: boolean;
  isLast: boolean;
  onClick: () => void;
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
            
            {/* UP主信息 */}
            <div className="flex items-center gap-2 mt-1">
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

const VideoTimeline: React.FC<VideoTimelineProps> = ({ videos, onClose, onVideoClick }) => {
  // 按发布时间分组和排序
  const groupedVideos = useMemo(() => {
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

  // 今日视频统计
  const todayStats = useMemo(() => {
    const todayVideos = videos.filter(v => isToday(v.pubdate));
    const uploaders = new Set(todayVideos.map(v => v.uploader?.name)).size;
    return { count: todayVideos.length, uploaders };
  }, [videos]);

  const handleVideoClick = useCallback((bvid: string) => {
    if (onVideoClick) {
      onVideoClick(bvid);
    } else {
      window.open(`https://www.bilibili.com/video/${bvid}`, '_blank');
    }
  }, [onVideoClick]);

  return (
    <div className="fixed inset-0 z-50 bg-[#050510]">
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
            <h1 className="text-white font-bold text-lg flex items-center justify-center gap-2">
              <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="20" x2="12" y2="10"/>
                <line x1="18" y1="20" x2="18" y2="4"/>
                <line x1="6" y1="20" x2="6" y2="16"/>
              </svg>
              发布时间轴
            </h1>
            <p className="text-gray-500 text-xs mt-0.5">
              {todayStats.count} 个视频 · {todayStats.uploaders} 位UP主
            </p>
          </div>
          
          {/* 右侧占位 */}
          <div className="w-10 h-10" />
        </div>
      </div>

      {/* 时间轴内容 */}
      <div className="h-[calc(100vh-64px)] overflow-y-auto">
        <div className="max-w-xl mx-auto px-4 py-6 pl-20">
          {groupedVideos.length === 0 ? (
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
            groupedVideos.map((group, groupIndex) => (
              <div key={group.date}>
                <DateHeader date={group.dateLabel} count={group.videos.length} />
                
                {group.videos.map((video, index) => (
                  <TimelineNode
                    key={video.bvid}
                    video={video}
                    isFirst={groupIndex === 0 && index === 0}
                    isLast={groupIndex === groupedVideos.length - 1 && index === group.videos.length - 1}
                    onClick={() => handleVideoClick(video.bvid)}
                  />
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default memo(VideoTimeline);
