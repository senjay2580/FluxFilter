import React from 'react';
import { Video } from '../types';
import { PlayIcon, ClockIcon } from './Icons';
import { handleVideoClick, formatDuration, formatViewCount } from '../lib/bilibili';
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
  const views = isDbVideo(video)
    ? formatViewCount(video.view_count)
    : video.views;

  // 长按状态
  const [longPressTriggered, setLongPressTriggered] = React.useState(false);
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
    setLongPressTriggered(false);
    longPressTimer.current = setTimeout(() => {
      setLongPressTriggered(true);
      // 触发震动反馈（如果支持）
      if (navigator.vibrate) navigator.vibrate(50);
      handleAddToWatchlist();
    }, 500); // 500ms 长按
  };

  // 长按结束
  const handleTouchEnd = () => {
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

        {/* 已收藏星标 */}
        {isInWatchlist && (
          <div className="absolute top-2 left-2 p-1.5 bg-gradient-to-br from-yellow-400 to-orange-500 rounded-lg shadow-[0_0_12px_rgba(251,191,36,0.5)]">
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="m16.7 14.5l3.8-3.25l3 .25l-4.4 3.825L20.4 21l-2.55-1.55zm-2.35-7.3L13.3 4.75L14.45 2l2.3 5.425zM4.325 21l1.625-7.025L.5 9.25l7.2-.625L10.5 2l2.8 6.625l7.2.625l-5.45 4.725L16.675 21L10.5 17.275z"/>
            </svg>
          </div>
        )}

        {/* Add to Watchlist Button */}
        {onAddToWatchlist && (
          <button
            onClick={handleAddToWatchlist}
            className={`absolute top-2 right-2 p-2 rounded-xl backdrop-blur-md transition-all border
              ${isInWatchlist 
                ? 'bg-white/20 text-cyber-lime border-cyber-lime/30 shadow-lg' 
                : 'bg-black/50 text-white border-white/10 opacity-0 group-hover:opacity-100 hover:bg-black/70 hover:border-white/20'
              }`}
            title={isInWatchlist ? '移除待看' : '加入待看'}
          >
            <ClockIcon className="w-4 h-4" />
          </button>
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
            
            {/* UP主和播放量 */}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-[11px] text-cyber-lime/90 font-medium truncate max-w-[55%] drop-shadow-sm">
                {author}
              </span>
              <span className="flex items-center gap-1 text-[10px] text-white/50">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/>
                </svg>
                {views}
              </span>
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
