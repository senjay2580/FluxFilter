import React, { memo, useMemo, useCallback, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Video } from '../../types';
import { ClockIcon } from '../shared/Icons';
import { formatDuration } from '../../lib/bilibili';
import type { VideoWithUploader } from '../../lib/database.types';
import EmbeddedPlayer from './EmbeddedPlayer';

// 支持两种数据格式：旧的 Video 类型和新的 VideoWithUploader 类型
interface VideoCardProps {
  video: Video | VideoWithUploader;
  onAddToWatchlist?: (bvid: string) => void;
  onRemoveFromWatchlist?: (bvid: string) => void;
  isInWatchlist?: boolean;
  openMenuId?: string | null;
  onMenuToggle?: (bvid: string | null) => void;
  onDelete?: (bvid: string) => void;
  onDeleteWithLog?: (bvid: string, title: string) => void;
  onTranscript?: (videoUrl: string) => void;
}

// 类型守卫：检查是否为数据库视频类型
function isDbVideo(video: Video | VideoWithUploader): video is VideoWithUploader {
  return 'bvid' in video && 'pic' in video;
}

// 格式化数字（万、亿）- 移到组件外避免重复创建
const formatNumber = (num: number): string => {
  if (num >= 100000000) return `${(num / 100000000).toFixed(1)}亿`;
  if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
  return num.toString();
};

// 格式化发布时间 - 移到组件外
const formatPubdate = (pubdate: string | number): string => {
  const date = new Date(pubdate);
  const now = new Date();
  const diffHours = Math.floor((now.getTime() - date.getTime()) / 3600000);

  if (diffHours < 1) return '刚刚';
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffHours < 168) return `${Math.floor(diffHours / 24)}天前`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const VideoCard: React.FC<VideoCardProps> = ({ video, onAddToWatchlist, onRemoveFromWatchlist, isInWatchlist, openMenuId, onMenuToggle, onDelete, onDeleteWithLog, onTranscript }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmbeddedPlayer, setShowEmbeddedPlayer] = useState(false);
  const [showTitleTooltip, setShowTitleTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const titleRef = useRef<HTMLHeadingElement>(null);
  
  // 使用 useMemo 缓存计算结果，避免每次渲染都重新计算
  const videoData = useMemo(() => {
    const isDb = isDbVideo(video);
    return {
      bvid: isDb ? video.bvid : video.id,
      thumbnail: isDb ? video.pic : video.thumbnail,
      title: video.title,
      duration: isDb ? formatDuration(video.duration) : video.duration,
      author: isDb ? (video as any).uploader?.name || '未知UP主' : video.author,
      avatar: isDb ? (video as any).uploader?.face || 'https://i0.hdslb.com/bfs/face/member/noface.jpg' : video.avatar,
      stats: isDb ? {
        views: video.view_count,
        danmaku: video.danmaku_count,
        replies: video.reply_count,
        likes: video.like_count,
      } : null,
      pubdate: isDb && video.pubdate ? formatPubdate(video.pubdate) : null,
    };
  }, [video]);

  const { bvid, thumbnail, title, duration, author, avatar, stats, pubdate } = videoData;

  // 抽屉状态 - 使用全局控制
  const drawerOpen = openMenuId === bvid;

  // 使用 useCallback 缓存事件处理函数
  const handleClick = useCallback(() => {
    setShowEmbeddedPlayer(true);
  }, []);

  const handleMoreClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onMenuToggle?.(drawerOpen ? null : bvid);
    if (navigator.vibrate) navigator.vibrate(10);
  }, [bvid, drawerOpen, onMenuToggle]);

  const handleAddToWatchlistClick = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    onAddToWatchlist?.(bvid);
    onMenuToggle?.(null);
  }, [bvid, onAddToWatchlist, onMenuToggle]);

  const handleShare = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `https://www.bilibili.com/video/${bvid}`;
    if (navigator.share) {
      navigator.share({ title, url });
    } else {
      navigator.clipboard.writeText(url);
      alert('链接已复制到剪贴板');
    }
    onMenuToggle?.(null);
  }, [bvid, title, onMenuToggle]);

  const handleRemoveFromWatchlistClick = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    onRemoveFromWatchlist?.(bvid);
    onMenuToggle?.(null);
  }, [bvid, onRemoveFromWatchlist, onMenuToggle]);

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
            <h3 
              ref={titleRef}
              className="text-white font-semibold leading-tight line-clamp-2 text-[13.5px] group-hover:text-white transition-colors cursor-default" 
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.8), 0 0 8px rgba(0,0,0,0.4)' }}
              onMouseEnter={(e) => {
                // 只有标题被截断时才显示 tooltip
                const el = e.currentTarget;
                if (el.scrollHeight > el.clientHeight || title.length > 30) {
                  const rect = el.getBoundingClientRect();
                  setTooltipPos({ x: rect.left + rect.width / 2, y: rect.top - 8 });
                  setShowTitleTooltip(true);
                }
              }}
              onMouseLeave={() => setShowTitleTooltip(false)}
            >
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
                  onClick={handleAddToWatchlistClick}
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
                  onClick={handleRemoveFromWatchlistClick}
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

              {/* 转写文案 - 跳转外部系统 */}
              {onTranscript && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    const videoUrl = `https://www.bilibili.com/video/${bvid}`;
                    // 跳转到外部转写系统，携带视频元数据
                    const transcriptSystemUrl = (import.meta as any).env?.VITE_TRANSCRIPT_SYSTEM_URL || 'http://localhost:3001';
                    const params = new URLSearchParams({
                      url: videoUrl,
                      title: title,
                      author: author,
                      bvid: bvid,
                    });
                    window.open(`${transcriptSystemUrl}?${params.toString()}`, '_blank');
                    onMenuToggle?.(null);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                    <svg className="w-5 h-5 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                      <polyline points="14 2 14 8 20 8"/>
                      <line x1="16" y1="13" x2="8" y2="13"/>
                      <line x1="16" y1="17" x2="8" y2="17"/>
                      <polyline points="10 9 9 9 8 9"/>
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-[15px] text-white font-medium">转写文案</span>
                    <p className="text-xs text-gray-500 mt-0.5">跳转到转写系统处理</p>
                  </div>
                  <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                    <polyline points="15 3 21 3 21 9"/>
                    <line x1="10" y1="14" x2="21" y2="3"/>
                  </svg>
                </button>
              )}

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

              {/* 删除视频 */}
              {onDelete && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowDeleteConfirm(true);
                  }}
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

    {/* 删除确认对话框 */}
    {showDeleteConfirm && onDelete && createPortal(
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
          {/* 右上角关闭按钮 */}
          <button
            onClick={() => setShowDeleteConfirm(false)}
            className="absolute top-3 right-3 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors"
          >
            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          
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
          <h3 className="text-white text-lg font-bold text-center mb-2">删除视频</h3>
          
          {/* 描述 */}
          <p className="text-gray-400 text-sm text-center mb-1 leading-relaxed">
            <span className="text-white font-medium">"{title.length > 25 ? title.slice(0, 25) + '...' : title}"</span>
          </p>
          <p className="text-gray-500 text-xs text-center mb-5">是否记录到学习日志？</p>
          
          {/* 按钮 */}
          <div className="space-y-2">
            {/* 记录并删除 */}
            {onDeleteWithLog && (
              <button
                onClick={() => {
                  onDeleteWithLog(bvid, title);
                  setShowDeleteConfirm(false);
                  onMenuToggle?.(null);
                }}
                className="w-full py-3 bg-cyber-lime text-black font-medium rounded-xl hover:bg-cyber-lime/90 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                </svg>
                记录到学习日志
              </button>
            )}
            
            {/* 直接删除 - 红色 */}
            <button
              onClick={() => {
                onDelete?.(bvid);
                setShowDeleteConfirm(false);
                onMenuToggle?.(null);
              }}
              className="w-full py-3 bg-red-500 hover:bg-red-600 rounded-xl text-white font-medium transition-colors"
            >
              直接删除
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* 嵌入式播放器 */}
    {showEmbeddedPlayer && (
      <EmbeddedPlayer
        bvid={bvid}
        title={title}
        onClose={() => setShowEmbeddedPlayer(false)}
      />
    )}

    {/* 标题 Tooltip */}
    {showTitleTooltip && createPortal(
      <>
        <style>{`
          @keyframes tooltipFadeIn {
            from { opacity: 0; transform: translate(-50%, -100%) translateY(4px); }
            to { opacity: 1; transform: translate(-50%, -100%) translateY(0); }
          }
        `}</style>
        <div 
          className="fixed z-[99999] max-w-xs px-3 py-2 bg-black/95 border border-white/20 rounded-lg shadow-xl pointer-events-none"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translate(-50%, -100%)',
            animation: 'tooltipFadeIn 0.15s ease-out',
          }}
        >
          <p className="text-white text-xs leading-relaxed">{title}</p>
          {/* 小三角 */}
          <div 
            className="absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-3 h-3 bg-black/95 border-r border-b border-white/20 rotate-45"
          />
        </div>
      </>,
      document.body
    )}
    </>
  );
};

// 使用 memo 避免不必
export default memo(VideoCard, (prevProps, nextProps) => {
  // 只有这些属性变化时才重新渲染
  const prevVideo = prevProps.video;
  const nextVideo = nextProps.video;
  const prevBvid = 'bvid' in prevVideo ? prevVideo.bvid : prevVideo.id;
  const nextBvid = 'bvid' in nextVideo ? nextVideo.bvid : nextVideo.id;
  
  return (
    prevBvid === nextBvid &&
    prevProps.isInWatchlist === nextProps.isInWatchlist &&
    prevProps.openMenuId === nextProps.openMenuId &&
    prevProps.onTranscript === nextProps.onTranscript
  );
});
