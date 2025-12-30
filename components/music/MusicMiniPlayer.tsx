import React, { useSyncExternalStore } from 'react';
import { musicService } from '../../lib/music-service';

interface MusicMiniPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  onExpand: () => void;
}

const MusicMiniPlayer: React.FC<MusicMiniPlayerProps> = ({ isOpen, onClose, onExpand }) => {
  const state = useSyncExternalStore(
    musicService.subscribe,
    musicService.getState
  );

  if (!isOpen || !state.currentMusic) return null;

  const progress = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  const playModeIcon = {
    single: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
        <path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />
        <path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
        <text x="10" y="15" fontSize="8" fill="currentColor">1</text>
      </svg>
    ),
    list: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
        <path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />
        <path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
      </svg>
    ),
    shuffle: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
        <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
      </svg>
    ),
  };

  return (
    <div className="fixed bottom-20 left-4 right-4 z-[99997] animate-slide-up">
      <div className="bg-black/90 backdrop-blur-xl rounded-2xl border border-white/10 shadow-2xl overflow-hidden">
        {/* 进度条 */}
        <div className="h-1 bg-white/10">
          <div 
            className="h-full bg-gradient-to-r from-pink-500 to-violet-500 transition-all duration-200"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="p-3 flex items-center gap-3">
          {/* 封面 */}
          <button 
            onClick={onExpand}
            className="w-12 h-12 rounded-xl overflow-hidden shrink-0 relative group"
          >
            {state.currentMusic.cover_url ? (
              <img 
                src={state.currentMusic.cover_url} 
                alt={state.currentMusic.title}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center">
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
              </div>
            )}
            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="15 3 21 3 21 9" /><polyline points="9 21 3 21 3 15" />
                <line x1="21" y1="3" x2="14" y2="10" /><line x1="3" y1="21" x2="10" y2="14" />
              </svg>
            </div>
          </button>

          {/* 信息 */}
          <div className="flex-1 min-w-0" onClick={onExpand}>
            <h4 className="text-white text-sm font-medium truncate">{state.currentMusic.title}</h4>
            <p className="text-gray-400 text-xs truncate">{state.currentMusic.artist || '未知艺术家'}</p>
          </div>

          {/* 控制按钮 */}
          <div className="flex items-center gap-1">
            {/* 播放模式 */}
            <button
              onClick={() => musicService.togglePlayMode()}
              className="p-2 text-gray-400 hover:text-white transition-colors"
              title={state.playMode === 'single' ? '单曲循环' : state.playMode === 'shuffle' ? '随机播放' : '列表循环'}
            >
              {playModeIcon[state.playMode]}
            </button>

            {/* 上一曲 */}
            <button
              onClick={() => musicService.prev()}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
              </svg>
            </button>

            {/* 播放/暂停 */}
            <button
              onClick={() => musicService.toggle()}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:scale-105 transition-transform"
            >
              {state.isPlaying ? (
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

            {/* 下一曲 */}
            <button
              onClick={() => musicService.next()}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
              </svg>
            </button>

            {/* 关闭 */}
            <button
              onClick={onClose}
              className="p-2 text-gray-400 hover:text-white transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* 时间显示 */}
        <div className="px-3 pb-2 flex justify-between text-[10px] text-gray-500">
          <span>{musicService.constructor.prototype.constructor.formatTime?.(state.currentTime) || formatTime(state.currentTime)}</span>
          <span>{formatTime(state.duration)}</span>
        </div>
      </div>
    </div>
  );
};

// 格式化时间
function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default MusicMiniPlayer;
