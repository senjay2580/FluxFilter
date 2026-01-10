import React from 'react';
import { createPortal } from 'react-dom';

interface EmbeddedPlayerProps {
  bvid: string;
  title: string;
  onClose: () => void;
  platform?: 'bilibili' | 'youtube';
  videoId?: string; // YouTube video ID
}

// 检测是否为移动端
const isMobile = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    (window.innerWidth <= 768);
};

const EmbeddedPlayer: React.FC<EmbeddedPlayerProps> = ({ bvid, title, onClose, platform = 'bilibili', videoId }) => {
  const isYouTube = platform === 'youtube';
  
  // B站嵌入播放器URL（使用官方嵌入方式）
  const embedUrl = isYouTube
    ? `https://www.youtube.com/embed/${videoId}?autoplay=1&rel=0`
    : `https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&autoplay=1`;
  // 完整页面URL（备用）
  const fullUrl = isYouTube
    ? `https://www.youtube.com/watch?v=${videoId}`
    : `https://www.bilibili.com/video/${bvid}`;

  // 移动端直接跳转到原站
  React.useEffect(() => {
    if (isMobile()) {
      window.open(fullUrl, '_blank');
      onClose();
    }
  }, [fullUrl, onClose]);

  // 移动端不渲染播放器
  if (isMobile()) {
    return null;
  }

  // 禁止背景滚动
  React.useEffect(() => {
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = 'hidden';
    document.body.style.paddingRight = `${scrollbarWidth}px`;
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[999999] bg-black flex flex-col animate-player-enter">
      {/* 顶部导航栏 */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#0c0c0c] border-b border-white/10 shrink-0 animate-header-slide">
        {/* 返回按钮 */}
        <button
          onClick={onClose}
          className="flex items-center gap-2 text-white hover:text-cyber-lime active:scale-95 transition-all"
        >
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
          <span className="text-[15px] font-medium">返回</span>
        </button>

        {/* 标题 */}
        <h1 className="flex-1 text-white text-[14px] font-medium truncate mx-4 text-center">
          {title}
        </h1>

        {/* 在原站打开 */}
        <button
          onClick={() => window.open(fullUrl, '_blank')}
          className={`flex items-center gap-1.5 ${isYouTube ? 'text-red-400 hover:text-red-300' : 'text-pink-400 hover:text-pink-300'} active:scale-95 transition-all`}
        >
          {isYouTube ? (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
            </svg>
          ) : (
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
              <polyline points="15 3 21 3 21 9"/>
              <line x1="10" y1="14" x2="21" y2="3"/>
            </svg>
          )}
          <span className="text-[13px] font-medium hidden sm:inline">{isYouTube ? 'YouTube' : 'B站'}</span>
        </button>
      </div>

      {/* iframe 嵌入区域 */}
      <div className="flex-1 relative bg-black animate-content-fade">
        <iframe
          src={embedUrl}
          className="absolute inset-0 w-full h-full border-0"
          allowFullScreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="no-referrer-when-downgrade"
        />
      </div>
      {/* 动画样式 */}
      <style>{`
        @keyframes player-enter { from { opacity: 0; } to { opacity: 1; } }
        @keyframes header-slide { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes content-fade { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        .animate-player-enter { animation: player-enter 0.25s ease-out; }
        .animate-header-slide { animation: header-slide 0.3s ease-out; }
        .animate-content-fade { animation: content-fade 0.35s ease-out; }
      `}</style>
    </div>,
    document.body
  );
};

export default EmbeddedPlayer;
