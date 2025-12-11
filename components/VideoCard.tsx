import React from 'react';
import { Video } from '../types';
import { PlayIcon, ClockIcon } from './Icons';
import { handleVideoClick, formatDuration } from '../lib/bilibili';
import type { VideoWithUploader } from '../lib/database.types';

// 支持两种数据格式：旧的 Video 类型和新的 VideoWithUploader 类型
interface VideoCardProps {
  video: Video | VideoWithUploader;
  onAddToWatchlist?: (bvid: string) => void;
  isInWatchlist?: boolean;
}

// 类型守卫：检查是否为数据库视频类型
function isDbVideo(video: Video | VideoWithUploader): video is VideoWithUploader {
  return 'bvid' in video && 'pic' in video;
}

const VideoCard: React.FC<VideoCardProps> = ({ video, onAddToWatchlist, isInWatchlist }) => {
  // 统一数据格式
  const bvid = isDbVideo(video) ? video.bvid : video.id;
  const thumbnail = isDbVideo(video) ? video.pic : video.thumbnail;
  const title = video.title;
  const duration = isDbVideo(video)
    ? formatDuration(video.duration)
    : video.duration;
  const author = isDbVideo(video)
    ? (video as any).uploader?.name || '未知UP主'
    : video.author;
  const avatar = isDbVideo(video)
    ? (video as any).uploader?.face || 'https://i0.hdslb.com/bfs/face/member/noface.jpg'
    : video.avatar;

  // 格式化发布时间
  const pubdate = isDbVideo(video) && video.pubdate
    ? (() => {
        const date = new Date(video.pubdate);
        const now = new Date();
        const diffHours = Math.floor((now.getTime() - date.getTime()) / 3600000);

        if (diffHours < 1) return '刚刚';
        if (diffHours < 24) return `${diffHours}小时前`;
        if (diffHours < 168) return `${Math.floor(diffHours / 24)}天前`;
        return `${date.getMonth() + 1}月${date.getDate()}日`;
      })()
    : null;

  // 长按状态
  const [longPressTriggered, setLongPressTriggered] = React.useState(false);
  const [pressing, setPressing] = React.useState(false);
  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);

  const handleClick = () => {
    if (longPressTriggered) {
      setLongPressTriggered(false);
      return;
    }
    handleVideoClick(bvid);
  };

  const handleAddToWatchlist = (e?: React.MouseEvent | React.TouchEvent) => {
    e?.stopPropagation();
    onAddToWatchlist?.(bvid);
  };

  // 长按开始
  const handleTouchStart = () => {
    if (!onAddToWatchlist) return;
    setLongPressTriggered(false);
    setPressing(true);
    longPressTimer.current = setTimeout(() => {
      setLongPressTriggered(true);
      setPressing(false);
      // 触发震动反馈
      if (navigator.vibrate) navigator.vibrate(50);
      handleAddToWatchlist();
    }, 500);
  };

  // 长按结束
  const handleTouchEnd = () => {
    setPressing(false);
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  return (
    <div 
      className="group relative rounded-2xl overflow-hidden 
                 bg-cyber-card/90
                 border border-white/[0.08] 
                 shadow-lg
                 hover:shadow-xl hover:border-white/[0.15]
                 active:scale-[0.98] transition-all duration-300 cursor-pointer
                 will-change-transform"
      onClick={handleClick}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
    >
      
      {/* Thumbnail */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-800">
        <img 
          src={thumbnail || ''} 
          alt={title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" 
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {/* 多层渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80"></div>
        <div className="absolute inset-0 bg-gradient-to-br from-cyber-lime/10 via-transparent to-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
        
        {/* Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-300 scale-75 group-hover:scale-100">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyber-lime to-lime-400 flex items-center justify-center 
                            shadow-[0_0_20px_rgba(163,230,53,0.6),inset_0_2px_4px_rgba(255,255,255,0.3)]
                            border border-white/20">
                 <PlayIcon className="w-5 h-5 text-black ml-0.5" />
            </div>
        </div>

        {/* Duration Badge - 立体感 */}
        <div className="absolute bottom-2 right-2 px-2 py-1 bg-black/70 backdrop-blur-md rounded-lg text-[10px] font-mono text-white
                        border border-white/10 shadow-lg">
          {duration}
        </div>

        {/* 已收藏星标 - 磨玻璃效果 */}
        {isInWatchlist && (
          <div className="absolute top-2 left-2 p-1.5 bg-black/30 backdrop-blur-md rounded-lg border border-white/20 shadow-lg">
            <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
        )}

        {/* 长按进度提示 */}
        {pressing && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-10">
            <div className="relative w-16 h-16">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2" />
                <circle 
                  cx="18" cy="18" r="16" fill="none" 
                  stroke="#a3e635" strokeWidth="2" 
                  strokeDasharray="100" 
                  strokeDashoffset="0"
                  className="animate-long-press"
                  strokeLinecap="round"
                />
              </svg>
              <div className="absolute inset-0 flex items-center justify-center">
                <ClockIcon className="w-6 h-6 text-cyber-lime" />
              </div>
            </div>
            <style>{`
              @keyframes long-press-progress {
                from { stroke-dashoffset: 100; }
                to { stroke-dashoffset: 0; }
              }
              .animate-long-press {
                animation: long-press-progress 0.5s linear forwards;
              }
            `}</style>
          </div>
        )}

      </div>

      {/* Content */}
      <div className="p-3 bg-cyber-card">
        <div className="flex gap-2.5 items-start">
          {/* 头像 */}
          <div className="relative shrink-0">
            <img 
              src={avatar} 
              alt={author} 
              className="relative w-9 h-9 rounded-full border-2 border-white/20 group-hover:border-cyber-lime/50 transition-all duration-300 object-cover ring-2 ring-black/20 bg-gray-700"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6 0-8 3-8 6v1h16v-1c0-3-2-6-8-6z"/></svg>';
              }}
            />
          </div>
          
          <div className="flex-1 min-w-0">
            {/* 标题 */}
            <h3 className="text-white/95 font-medium leading-tight line-clamp-2 text-[13px] group-hover:text-white transition-colors drop-shadow-sm">
              {title}
            </h3>
            
            {/* UP主和发布时间 */}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-cyber-lime/90 font-medium truncate max-w-[50%] drop-shadow-sm">
                {author}
              </span>
              {pubdate && (
                <>
                  <span className="text-white/30">·</span>
                  <span className="text-[10px] text-white/50 flex items-center gap-0.5">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {pubdate}
                  </span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* 悬停边框发光 */}
      <div className="absolute inset-0 rounded-2xl border border-cyber-lime/0 group-hover:border-cyber-lime/20 transition-colors duration-500 pointer-events-none" />
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-cyber-lime/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </div>
  );
};

export default VideoCard;
