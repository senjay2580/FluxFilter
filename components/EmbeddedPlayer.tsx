import React from 'react';
import { createPortal } from 'react-dom';

interface EmbeddedPlayerProps {
  bvid: string;
  title: string;
  onClose: () => void;
}

const EmbeddedPlayer: React.FC<EmbeddedPlayerProps> = ({ bvid, title, onClose }) => {
  // B站嵌入播放器URL（使用官方嵌入方式）
  const embedUrl = `https://player.bilibili.com/player.html?bvid=${bvid}&high_quality=1&autoplay=1`;
  // 完整页面URL（备用）
  const fullUrl = `https://www.bilibili.com/video/${bvid}`;

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

        {/* 在B站打开 */}
        <button
          onClick={() => window.open(fullUrl, '_blank')}
          className="flex items-center gap-1.5 text-pink-400 hover:text-pink-300 active:scale-95 transition-all"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          <span className="text-[13px] font-medium hidden sm:inline">B站</span>
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
