import React from 'react';
import { createPortal } from 'react-dom';
import { Video } from '../types';
import { ClockIcon } from './Icons';
import { handleVideoClick, formatDuration } from '../lib/bilibili';
import type { VideoWithUploader } from '../lib/database.types';

// 支持两种数据格式：旧的 Video 类型和新的 VideoWithUploader 类型
interface VideoCardProps {
  video: Video | VideoWithUploader;
  onAddToWatchlist?: (bvid: string) => void;
  onRemoveFromWatchlist?: (bvid: string) => void;
  isInWatchlist?: boolean;
  openMenuId?: string | null;
  onMenuToggle?: (bvid: string | null) => void;
}

// 类型守卫：检查是否为数据库视频类型
function isDbVideo(video: Video | VideoWithUploader): video is VideoWithUploader {
  return 'bvid' in video && 'pic' in video;
}

const VideoCard: React.FC<VideoCardProps> = ({ video, onAddToWatchlist, onRemoveFromWatchlist, isInWatchlist, openMenuId, onMenuToggle }) => {
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

  // 获取统计数据（仅数据库视频有）
  const stats = isDbVideo(video) ? {
    views: video.view_count,
    danmaku: video.danmaku_count,
    replies: video.reply_count,
    likes: video.like_count,
  } : null;

  // 格式化数字（万、亿）
  const formatNumber = (num: number): string => {
    if (num >= 100000000) return `${(num / 100000000).toFixed(1)}亿`;
    if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
    return num.toString();
  };

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

  // 抽屉状态 - 使用全局控制
  const drawerOpen = openMenuId === bvid;

  const handleClick = () => {
    handleVideoClick(bvid);
  };

  const handleMoreClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    // 切换抽屉状态
    onMenuToggle?.(drawerOpen ? null : bvid);
    // 触发震动反馈
    if (navigator.vibrate) navigator.vibrate(10);
  };

  const handleAddToWatchlist = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onAddToWatchlist?.(bvid);
    onMenuToggle?.(null);
  };

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://www.bilibili.com/video/${bvid}`;
    if (navigator.share) {
      navigator.share({ title, url });
    } else {
      navigator.clipboard.writeText(url);
      alert('链接已复制到剪贴板');
    }
    onMenuToggle?.(null);
  };

  // 移除待看
  const handleRemoveFromWatchlist = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    onRemoveFromWatchlist?.(bvid);
    onMenuToggle?.(null);
  };

  // 抽屉打开时禁止背景滚动（保持滚动条宽度避免闪动）
  React.useEffect(() => {
    if (drawerOpen) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`;
      return () => {
        document.body.style.overflow = '';
        document.body.style.paddingRight = '';
      };
    }
  }, [drawerOpen]);

  return (
    <>
    <div 
      className="group relative rounded-2xl overflow-visible
                 bg-cyber-card/90
                 border border-white/[0.08] 
                 shadow-lg
                 hover:shadow-xl hover:border-white/[0.15]
                 active:scale-[0.98] transition-transform duration-200 cursor-pointer
                 transform-gpu"
      onClick={handleClick}
    >
      
      {/* Thumbnail */}
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-800 rounded-t-2xl">
        <img 
          src={thumbnail || ''} 
          alt={title} 
          className="w-full h-full object-cover transform-gpu" 
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = 'none';
          }}
        />
        {/* 渐变遮罩 */}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent opacity-80"></div>
        

        {/* Duration Badge */}
        <div className="absolute top-2 right-2 px-2 py-0.5 bg-black/70 rounded text-[11px] font-bold text-white">
          {duration}
        </div>

        {/* 底部数据展示条 - 在封面上，无模糊背景 */}
        <div className="absolute bottom-0 left-0 right-0 px-3 py-2">
          <div className="flex items-center justify-between">
            {/* 左侧：发布时间 */}
            {pubdate && (
              <div className="flex items-center gap-1 text-[11px] font-semibold text-white" 
                   style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)' }}>
                <svg className="w-3.5 h-3.5 drop-shadow-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
                <span>{pubdate}</span>
              </div>
            )}

            {/* 右侧：播放量和弹幕 */}
            {stats && (
              <div className="flex items-center gap-3">
                {/* 播放量 */}
                <div className="flex items-center gap-1 text-[11px] font-semibold text-white"
                     style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)' }}>
                  <svg className="w-3.5 h-3.5 drop-shadow-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                    <circle cx="12" cy="12" r="3"/>
                  </svg>
                  <span>{formatNumber(stats.views)}</span>
                </div>

                {/* 弹幕数 */}
                <div className="flex items-center gap-1 text-[11px] font-semibold text-white"
                     style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)' }}>
                  <svg className="w-3.5 h-3.5 drop-shadow-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span>{formatNumber(stats.danmaku)}</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* 已收藏星标 */}
        {isInWatchlist && (
          <div className="absolute top-2 left-2 p-1 bg-black/50 rounded">
            <svg className="w-4 h-4 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
            </svg>
          </div>
        )}

      </div>

      {/* Content */}
      <div className="p-3 bg-cyber-card rounded-b-2xl overflow-hidden">
        <div className="flex gap-2.5 items-start">
          {/* 头像 */}
          <div className="shrink-0">
            <img
              src={avatar}
              alt={author}
              className="w-9 h-9 rounded-full border border-white/20 object-cover bg-gray-700"
              referrerPolicy="no-referrer"
              onError={(e) => {
                (e.target as HTMLImageElement).src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%23666"><circle cx="12" cy="8" r="4"/><path d="M12 14c-6 0-8 3-8 6v1h16v-1c0-3-2-6-8-6z"/></svg>';
              }}
            />
          </div>

          <div className="flex-1 min-w-0">
            {/* 标题 */}
            <h3 className="text-white font-semibold leading-tight line-clamp-2 text-[13.5px] group-hover:text-white transition-colors" 
                style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.4)' }}>
              {title}
            </h3>

            {/* UP主和三个点按钮 */}
            <div className="flex items-center justify-between gap-2 mt-1.5">
              <span className="text-[11.5px] text-cyber-lime font-semibold truncate" 
                    style={{ textShadow: '0 1px 2px rgba(0,0,0,0.8), 0 0 6px rgba(0,0,0,0.5)' }}>
                {author}
              </span>
              
              {/* 三个点按钮 */}
              {onAddToWatchlist && (
                <button
                  onClick={handleMoreClick}
                  className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 active:scale-95 ${
                    drawerOpen ? 'bg-white/10' : 'hover:bg-white/5'
                  }`}
                  style={{ WebkitFontSmoothing: 'antialiased' }}
                >
                  <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                    <circle cx="5" cy="12" r="2"/>
                    <circle cx="12" cy="12" r="2"/>
                    <circle cx="19" cy="12" r="2"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>


      </div>
      
    </div>

    {/* 底部抽屉 - Portal 到 body */}
    {drawerOpen && onAddToWatchlist && createPortal(
      <div className="fixed inset-0 z-[99999]" onClick={(e) => e.stopPropagation()}>
        {/* 遮罩层 - 移除 backdrop-blur 提升性能 */}
        <div 
          className="absolute inset-0 bg-black/70 animate-drawer-overlay-in"
          onClick={() => onMenuToggle?.(null)}
        />
        
        {/* 抽屉内容 */}
        <div className="absolute bottom-0 left-0 right-0 animate-drawer-slide-up transform-gpu">
          {/* 抽屉面板 */}
          <div className="bg-[#0c0c0c] border-t border-white/10 rounded-t-2xl pb-safe">
            {/* 拖拽指示条 */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-white/25 rounded-full" />
            </div>
            
            {/* 视频信息预览 */}
            <div className="px-4 pb-3 pt-1 flex gap-3 items-start border-b border-white/10">
              <img 
                src={thumbnail || ''}
                alt={title}
                className="w-16 h-10 rounded object-cover bg-gray-800 shrink-0"
                referrerPolicy="no-referrer"
              />
              <div className="flex-1 min-w-0">
                <h4 className="text-white text-sm font-medium line-clamp-2 leading-snug">{title}</h4>
                <p className="text-cyber-lime text-xs mt-0.5 truncate">{author}</p>
              </div>
            </div>

            {/* 操作按钮列表 */}
            <div className="py-1">
              {/* 加入待看 */}
              {!isInWatchlist && (
                <button
                  onClick={handleAddToWatchlist}
                  className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                    <ClockIcon className="w-5 h-5 text-cyber-lime" />
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-[15px] text-white font-medium">加入待看</span>
                    <p className="text-xs text-gray-500 mt-0.5">稍后观看，不错过精彩内容</p>
                  </div>
                </button>
              )}

              {/* 从待看移除 */}
              {isInWatchlist && onRemoveFromWatchlist && (
                <button
                  onClick={handleRemoveFromWatchlist}
                  className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center">
                    <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/>
                      <line x1="15" y1="9" x2="9" y2="15"/>
                      <line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-[15px] text-red-400 font-medium">从待看移除</span>
                    <p className="text-xs text-gray-500 mt-0.5">不再显示在待看队列中</p>
                  </div>
                </button>
              )}

              {/* 分享 */}
              <button
                onClick={handleShare}
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
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`https://www.bilibili.com/video/${bvid}`, '_blank');
                  onMenuToggle?.(null);
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
            </div>

            {/* 取消按钮 */}
            <div className="px-4 pb-4 pt-2">
              <button
                onClick={() => onMenuToggle?.(null)}
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

    <style>{`
      @keyframes drawer-overlay-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      @keyframes drawer-slide-up {
        from { 
          opacity: 0;
          transform: translateY(100%);
        }
        to { 
          opacity: 1;
          transform: translateY(0);
        }
      }
      .animate-drawer-overlay-in {
        animation: drawer-overlay-in 0.25s ease-out;
      }
      .animate-drawer-slide-up {
        animation: drawer-slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1);
      }
      .pb-safe {
        padding-bottom: env(safe-area-inset-bottom, 16px);
      }
    `}</style>
    </>
  );
};

export default VideoCard;
