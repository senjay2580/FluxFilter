import React, { memo, useMemo, useCallback, useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Video } from '../../types';
import { ClockIcon } from '../shared/Icons';
import { formatDuration } from '../../lib/bilibili';
import type { VideoWithUploader } from '../../lib/database.types';
import EmbeddedPlayer from './EmbeddedPlayer';
import { parseLinksToElements } from '../../lib/parseLinks';

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
  onAISummary?: (bvid: string, title: string) => void;
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

// 视频卡片占位骨架屏
const VideoCardSkeleton = () => (
  <div className="aspect-[16/10] w-full bg-white/5 rounded-2xl animate-pulse"
    style={{ minHeight: '220px' }} />
);

const VideoCard: React.FC<VideoCardProps> = ({ video, onAddToWatchlist, onRemoveFromWatchlist, isInWatchlist, openMenuId, onMenuToggle, onDelete, onDeleteWithLog, onTranscript, onAISummary }) => {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showEmbeddedPlayer, setShowEmbeddedPlayer] = useState(false);
  const [showTitleTooltip, setShowTitleTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });
  const [descExpanded, setDescExpanded] = useState(false);
  const [isVisible, setIsVisible] = useState(true); // 初始设为 true，确保首屏可见
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);

  // 虚拟化：使用 IntersectionObserver 监听卡片是否在视口内
  React.useEffect(() => {
    if (!containerRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // 增加更积极的判定，且一旦变为可见，在一定时间内保持可见状态以减少闪烁
        setIsVisible(entry.isIntersecting);
      },
      { rootMargin: '800px 0px' } // 增加到 800px，尤其是针对回滚时的超前渲染
    );

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

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
      accessRestriction: isDb ? (video as any).access_restriction : null,
      description: isDb ? (video as any).description || '' : (video as any).description || '',
    };
  }, [video]);

  const { bvid, thumbnail, title, duration, author, avatar, stats, pubdate, accessRestriction, description } = videoData;

  const drawerOpen = openMenuId === bvid;

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
        ref={containerRef}
        className="group relative rounded-2xl overflow-hidden
                 bg-cyber-card/90
                 border border-white/[0.08] 
                 shadow-lg
                 active:scale-[0.98] transition-transform duration-200 cursor-pointer
                 transform-gpu"
        style={{
          contentVisibility: 'auto',
          containIntrinsicSize: '0 260px',
          minHeight: '220px'
        }}
        onClick={handleClick}
      >
        {!isVisible ? (
          <VideoCardSkeleton />
        ) : (
          <>
            {/* Thumbnail */}
            <div className="relative aspect-[16/10] w-full overflow-hidden bg-gray-800 rounded-t-2xl">
              <img
                src={thumbnail || ''}
                alt={title}
                className="w-full h-full object-cover transform-gpu"
                loading="eager"
                decoding="async"
                fetchPriority="high"
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

              {/* 充电/付费标识 */}
              {accessRestriction && (
                <div className="absolute top-2 left-2 px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded text-[10px] font-bold text-white flex items-center gap-0.5 shadow-lg">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                  <span>{accessRestriction === 'charging' ? '充电' : '付费'}</span>
                </div>
              )}

              {/* 底部数据展示条 */}
              <div className="absolute bottom-0 left-0 right-0 px-3 py-2">
                <div className="flex items-center justify-between">
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
                  {stats && (
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-white"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)' }}>
                        <svg className="w-3.5 h-3.5 drop-shadow-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        <span>{formatNumber(stats.views)}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] font-semibold text-white"
                        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.6)' }}>
                        <svg className="w-3.5 h-3.5 drop-shadow-lg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
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
                    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                  </svg>
                </div>
              )}
            </div>

            {/* Content Section */}
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
                    className="text-white font-semibold leading-tight line-clamp-2 text-[13.5px] cursor-default"
                    onMouseEnter={(e) => {
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
                    <span className="text-[11.5px] text-cyber-lime font-semibold truncate">
                      {author}
                    </span>

                    {/* 三个点按钮 */}
                    {onAddToWatchlist && (
                      <button
                        onClick={handleMoreClick}
                        className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-lg transition-all duration-200 active:scale-95 ${drawerOpen ? 'bg-white/10' : 'hover:bg-white/5'}`}
                      >
                        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="5" cy="12" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="19" cy="12" r="2" />
                        </svg>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* 底部抽屉 - Portal */}
      {drawerOpen && onAddToWatchlist && createPortal(
        <div className="fixed inset-0 z-[99999]" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/70 animate-drawer-overlay-in" onClick={() => { setDescExpanded(false); onMenuToggle?.(null); }} />
          <div className="absolute bottom-0 left-0 right-0 animate-drawer-slide-up transform-gpu">
            <div className="bg-[#0c0c0c] border-t border-white/10 rounded-t-2xl pb-safe">
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-white/25 rounded-full" />
              </div>
              <div className="px-4 pb-3 pt-1 border-b border-white/10">
                <div className="flex gap-3 items-start">
                  <img src={thumbnail || ''} alt={title} className="w-16 h-10 rounded object-cover bg-gray-800 shrink-0" referrerPolicy="no-referrer" />
                  <div className="flex-1 min-w-0">
                    <h4 className="text-white text-sm font-medium line-clamp-2 leading-snug">{title}</h4>
                    <p className="text-cyber-lime text-xs mt-0.5 truncate">{author}</p>
                  </div>
                </div>
                {description && (
                  <div className="mt-2.5 flex items-start gap-2">
                    <p className={`flex-1 text-xs text-gray-400 leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>
                      {parseLinksToElements(description)}
                    </p>
                    {description.length > 50 && (
                      <button onClick={() => setDescExpanded(!descExpanded)} className="shrink-0 w-5 h-5 flex items-center justify-center text-cyber-lime">
                        <svg className={`w-4 h-4 transition-transform ${descExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                      </button>
                    )}
                  </div>
                )}
              </div>
              <div className="py-1">
                {!isInWatchlist && (
                  <button onClick={handleAddToWatchlistClick} className="w-full flex items-center gap-4 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><ClockIcon className="w-5 h-5 text-cyber-lime" /></div>
                    <div className="flex-1 text-left"><span className="text-[15px] text-white font-medium">加入待看</span><p className="text-xs text-gray-500 mt-0.5">稍后观看内容</p></div>
                  </button>
                )}
                {isInWatchlist && onRemoveFromWatchlist && (
                  <button onClick={handleRemoveFromWatchlistClick} className="w-full flex items-center gap-4 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center"><svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg></div>
                    <div className="flex-1 text-left"><span className="text-[15px] text-red-400 font-medium">从待看移除</span></div>
                  </button>
                )}
                <button onClick={handleShare} className="w-full flex items-center gap-4 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" /></svg></div>
                  <div className="flex-1 text-left"><span className="text-[15px] text-white font-medium">分享</span></div>
                </button>
                <button onClick={(e) => { e.stopPropagation(); onAISummary?.(bvid, title); onMenuToggle?.(null); }} className="w-full flex items-center gap-4 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center"><svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /><path d="M9 12h6M9 16h6" /></svg></div>
                  <span className="text-[15px] text-white font-medium">AI总结 & 字幕</span>
                </button>
                {onTranscript && (
                  <button onClick={async (e) => { e.stopPropagation(); const videoUrl = `https://www.bilibili.com/video/${bvid}`; try { await navigator.clipboard.writeText(videoUrl); } catch { } onTranscript(videoUrl); onMenuToggle?.(null); }} className="w-full flex items-center gap-4 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center"><svg className="w-5 h-5 text-pink-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></div>
                    <span className="text-[15px] text-white font-medium">下载视频</span>
                  </button>
                )}
                <button onClick={(e) => { e.stopPropagation(); window.open(`https://www.bilibili.com/video/${bvid}`, '_blank'); onMenuToggle?.(null); }} className="w-full flex items-center gap-4 px-4 py-3.5">
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><svg className="w-5 h-5 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg></div>
                  <span className="text-[15px] text-white font-medium">在B站打开</span>
                </button>
                {onDelete && (
                  <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(true); }} className="w-full flex items-center gap-4 px-4 py-3.5">
                    <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center"><svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg></div>
                    <span className="text-[15px] text-red-400 font-medium">删除视频</span>
                  </button>
                )}
              </div>
              <div className="px-4 pb-4 pt-2">
                <button onClick={() => onMenuToggle?.(null)} className="w-full py-3 bg-white/10 rounded-xl text-white text-[15px] font-medium">取消</button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 删除确认 */}
      {showDeleteConfirm && onDelete && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/80" onClick={() => setShowDeleteConfirm(false)} />
          <div className="relative bg-[#1a1a1f] rounded-2xl p-6 max-w-sm w-full border border-white/10 shadow-2xl">
            <h3 className="text-white text-lg font-bold text-center mb-2">删除视频</h3>
            <p className="text-gray-400 text-sm text-center mb-5 leading-relaxed truncate px-4">{title}</p>
            <div className="space-y-2">
              {onDeleteWithLog && (
                <button onClick={() => { onDeleteWithLog(bvid, title); setShowDeleteConfirm(false); onMenuToggle?.(null); }} className="w-full py-3 bg-cyber-lime text-black font-medium rounded-xl flex items-center justify-center gap-2 text-sm uppercase">记录到学习日志</button>
              )}
              <button onClick={() => { onDelete?.(bvid); setShowDeleteConfirm(false); onMenuToggle?.(null); }} className="w-full py-3 bg-red-500 rounded-xl text-white font-medium text-sm">直接删除</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 嵌入式播放器 */}
      {showEmbeddedPlayer && (
        <EmbeddedPlayer bvid={bvid} title={title} onClose={() => setShowEmbeddedPlayer(false)} />
      )}

      {/* 标题 Tooltip */}
      {showTitleTooltip && createPortal(
        <div className="fixed z-[99999] max-w-xs px-3 py-2 bg-black/95 border border-white/20 rounded-lg shadow-xl pointer-events-none text-white text-xs" style={{ left: tooltipPos.x, top: tooltipPos.y, transform: 'translate(-50%, -100%)' }}>
          {title}
        </div>,
        document.body
      )}
    </>
  );
};

export default memo(VideoCard, (prevProps, nextProps) => {
  const prevVideo = prevProps.video;
  const nextVideo = nextProps.video;
  const prevBvid = isDbVideo(prevVideo) ? prevVideo.bvid : (prevVideo as any).id;
  const nextBvid = isDbVideo(nextVideo) ? nextVideo.bvid : (nextVideo as any).id;

  return (
    prevBvid === nextBvid &&
    prevProps.isInWatchlist === nextProps.isInWatchlist &&
    prevProps.openMenuId === nextProps.openMenuId
  );
});
