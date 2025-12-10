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

  const handleClick = () => {
    handleVideoClick(bvid);
  };

  const handleAddToWatchlist = (e: React.MouseEvent) => {
    e.stopPropagation();
    onAddToWatchlist?.(bvid);
  };

  return (
    <div 
      className="group relative bg-cyber-card rounded-xl overflow-hidden border border-white/5 shadow-lg active:scale-[0.98] transition-all duration-200 cursor-pointer"
      onClick={handleClick}
    >
      {/* Thumbnail */}
      <div className="relative aspect-[16/10] w-full overflow-hidden">
        <img 
          src={thumbnail || ''} 
          alt={title} 
          className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-105" 
          loading="lazy"
          referrerPolicy="no-referrer"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent"></div>
        
        {/* Play Button Overlay */}
        <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-300">
            <div className="w-10 h-10 rounded-full bg-cyber-lime/90 flex items-center justify-center backdrop-blur-sm shadow-[0_0_12px_rgba(163,230,53,0.5)]">
                 <PlayIcon className="w-4 h-4 text-black ml-0.5" />
            </div>
        </div>

        {/* Duration Badge */}
        <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/80 backdrop-blur-md rounded text-[10px] font-mono text-white">
          {duration}
        </div>

        {/* Add to Watchlist Button */}
        {onAddToWatchlist && (
          <button
            onClick={handleAddToWatchlist}
            className={`absolute top-1.5 right-1.5 p-1.5 rounded-full backdrop-blur-md transition-all
              ${isInWatchlist 
                ? 'bg-cyber-lime/80 text-black' 
                : 'bg-black/50 text-white opacity-0 group-hover:opacity-100 hover:bg-black/70'
              }`}
            title={isInWatchlist ? '已加入待看' : '加入待看'}
          >
            <ClockIcon className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Content - Compact */}
      <div className="p-2.5">
        <div className="flex gap-2 items-start">
          <img 
            src={avatar} 
            alt={author} 
            className="w-7 h-7 rounded-full border border-cyber-lime/20 shrink-0" 
          />
          <div className="flex-1 min-w-0">
            <h3 className="text-white font-medium leading-tight line-clamp-2 text-xs">
              {title}
            </h3>
            <div className="flex items-center text-[10px] text-gray-400 mt-1">
              <span className="text-cyber-neon truncate">{author}</span>
              <span className="mx-1">•</span>
              <span className="shrink-0">{views}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VideoCard;
