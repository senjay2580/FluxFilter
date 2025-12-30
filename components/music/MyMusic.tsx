import React, { useState, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';
import { musicService } from '../../lib/music-service';
import VinylPlayer from './VinylPlayer';
import MusicLibrary from './MusicLibrary';
import MusicFloatingBall from './MusicFloatingBall';
import MusicMiniPlayer from './MusicMiniPlayer';
import type { Music } from '../../lib/music-types';

interface MyMusicProps {
  isOpen: boolean;
  onClose: () => void;
}

type ViewType = 'library' | 'player';

const MyMusic: React.FC<MyMusicProps> = ({ isOpen, onClose }) => {
  const playerState = useSyncExternalStore(
    musicService.subscribe,
    musicService.getState
  );

  const [currentView, setCurrentView] = useState<ViewType>('library');
  const [showMiniPlayer, setShowMiniPlayer] = useState(false);

  // 播放音乐
  const handlePlayMusic = (music: Music, playlist: Music[]) => {
    musicService.play(music, playlist);
    setCurrentView('player');
  };

  // 最小化播放器
  const handleMinimize = () => {
    musicService.minimize();
    setShowMiniPlayer(false);
    onClose();
  };

  // 从悬浮球展开迷你播放器
  const handleFloatingBallClick = () => {
    setShowMiniPlayer(true);
  };

  // 从迷你播放器展开完整播放器
  const handleExpandPlayer = () => {
    setShowMiniPlayer(false);
    musicService.expand();
    // 如果页面已关闭，需要重新打开
    if (!isOpen) {
      // 触发父组件打开
      window.dispatchEvent(new CustomEvent('open-music-player'));
    }
    setCurrentView('player');
  };

  // 关闭迷你播放器
  const handleCloseMiniPlayer = () => {
    setShowMiniPlayer(false);
    musicService.setShowFloatingBall(true);
  };

  if (!isOpen) {
    // 页面关闭时，显示悬浮球和迷你播放器
    return (
      <>
        <MusicFloatingBall onClick={handleFloatingBallClick} />
        <MusicMiniPlayer 
          isOpen={showMiniPlayer} 
          onClose={handleCloseMiniPlayer}
          onExpand={handleExpandPlayer}
        />
      </>
    );
  }

  return createPortal(
    <div 
      className="fixed inset-0 z-[99998] flex flex-col overflow-hidden"
      style={{ 
        background: 'linear-gradient(180deg, #1a0a1e 0%, #0d0510 50%, #050208 100%)' 
      }}
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {/* 粉紫色光晕 */}
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-pink-500/20 via-violet-500/10 to-transparent blur-3xl" />
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-pink-600/10 rounded-full blur-[100px]" />
        <div className="absolute top-1/3 -right-20 w-72 h-72 bg-violet-600/10 rounded-full blur-[80px]" />
        <div className="absolute bottom-0 left-1/3 w-[500px] h-64 bg-gradient-to-t from-pink-900/20 via-violet-900/10 to-transparent blur-[80px]" />
        
        {/* 星星装饰 */}
        <div className="absolute top-20 left-[15%] w-1 h-1 bg-white/30 rounded-full animate-twinkle" />
        <div className="absolute top-32 right-[25%] w-1.5 h-1.5 bg-pink-300/40 rounded-full animate-twinkle" style={{ animationDelay: '1s' }} />
        <div className="absolute top-48 left-[40%] w-1 h-1 bg-violet-300/30 rounded-full animate-twinkle" style={{ animationDelay: '2s' }} />
      </div>

      {/* 内容 */}
      <div className="relative z-10 flex-1 flex flex-col overflow-hidden">
        {currentView === 'library' ? (
          <MusicLibrary 
            onClose={onClose}
            onPlayMusic={handlePlayMusic}
          />
        ) : (
          <VinylPlayer 
            onMinimize={handleMinimize}
            onOpenLibrary={() => setCurrentView('library')}
          />
        )}
      </div>

      {/* 底部播放条（在音乐库视图时显示） */}
      {currentView === 'library' && playerState.currentMusic && (
        <div className="relative z-20 border-t border-white/10 bg-black/50 backdrop-blur-xl">
          <div className="flex items-center gap-3 p-3">
            <button 
              onClick={() => setCurrentView('player')}
              className="w-12 h-12 rounded-xl overflow-hidden shrink-0"
            >
              {playerState.currentMusic.cover_url ? (
                <img 
                  src={playerState.currentMusic.cover_url} 
                  alt={playerState.currentMusic.title}
                  className={`w-full h-full object-cover ${playerState.isPlaying ? 'animate-pulse' : ''}`}
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center">
                  <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
              )}
            </button>
            
            <div className="flex-1 min-w-0" onClick={() => setCurrentView('player')}>
              <h4 className="text-white text-sm font-medium truncate">{playerState.currentMusic.title}</h4>
              <p className="text-gray-400 text-xs truncate">{playerState.currentMusic.artist || '未知艺术家'}</p>
            </div>

            <button
              onClick={() => musicService.toggle()}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center"
            >
              {playerState.isPlaying ? (
                <svg className="w-5 h-5 text-black" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-black ml-0.5" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>
          </div>
        </div>
      )}

      {/* 动画样式 */}
      <style>{`
        @keyframes twinkle {
          0%, 100% { opacity: 0.3; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.5); }
        }
        .animate-twinkle { animation: twinkle 3s ease-in-out infinite; }
        
        @keyframes spin-slow {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-spin-slow { animation: spin-slow 8s linear infinite; }
      `}</style>
    </div>,
    document.body
  );
};

export default MyMusic;
