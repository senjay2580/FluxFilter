import React, { useState, useRef, useSyncExternalStore } from 'react';
import { musicService } from '../../lib/music-service';
import type { PlayMode } from '../../lib/music-types';

interface VinylPlayerProps {
  onMinimize: () => void;
  onOpenLibrary: () => void;
}

const VinylPlayer: React.FC<VinylPlayerProps> = ({ onMinimize, onOpenLibrary }) => {
  const state = useSyncExternalStore(
    musicService.subscribe,
    musicService.getState
  );

  const [showVolumeSlider, setShowVolumeSlider] = useState(false);
  const [showCoverPreview, setShowCoverPreview] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  if (!state.currentMusic) return null;

  const progress = state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0;

  // 点击进度条跳转
  const handleProgressClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressRef.current || !state.duration) return;
    const rect = progressRef.current.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    musicService.seek(percent * state.duration);
  };

  // 播放模式配置
  const playModeConfig: Record<PlayMode, { icon: React.ReactNode; label: string }> = {
    single: {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
          <text x="10" y="15" fontSize="8" fill="currentColor" stroke="none">1</text>
        </svg>
      ),
      label: '单曲循环',
    },
    list: {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>
      ),
      label: '列表循环',
    },
    shuffle: {
      icon: (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      ),
      label: '随机播放',
    },
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onMinimize}
          className="p-2 -ml-2 rounded-xl hover:bg-white/10 transition-colors"
        >
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <span className="text-white/60 text-sm">正在播放</span>
        <button
          onClick={onOpenLibrary}
          className="p-2 -mr-2 rounded-xl hover:bg-white/10 transition-colors"
        >
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
      </div>

      {/* 黑胶唱机区域 */}
      <div className="flex-1 flex items-center justify-center px-8 py-4">
        <div className="relative">
          {/* 唱机底座 */}
          <div className="w-72 h-72 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 shadow-2xl flex items-center justify-center">
            {/* 黑胶唱片 */}
            <div 
              className={`w-64 h-64 rounded-full bg-black shadow-inner relative ${
                state.isPlaying ? 'animate-spin-slow' : ''
              }`}
              style={{ animationDuration: '8s' }}
            >
              {/* 唱片纹理 */}
              <div className="absolute inset-0 rounded-full" style={{
                background: `repeating-radial-gradient(
                  circle at center,
                  transparent 0px,
                  transparent 2px,
                  rgba(255,255,255,0.03) 2px,
                  rgba(255,255,255,0.03) 3px
                )`
              }} />
              
              {/* 封面（中心） */}
              <button
                onClick={() => setShowCoverPreview(true)}
                className="absolute inset-[25%] rounded-full overflow-hidden shadow-lg hover:scale-105 transition-transform"
              >
                {state.currentMusic.cover_url ? (
                  <img 
                    src={state.currentMusic.cover_url} 
                    alt={state.currentMusic.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center">
                    <svg className="w-12 h-12 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                )}
              </button>
              
              {/* 中心孔 */}
              <div className="absolute inset-[47%] rounded-full bg-gray-800 border-2 border-gray-700" />
            </div>
          </div>

          {/* 唱臂 */}
          <div 
            className={`absolute -top-4 -right-8 w-32 h-4 origin-left transition-transform duration-500 ${
              state.isPlaying ? 'rotate-[25deg]' : 'rotate-[5deg]'
            }`}
          >
            <div className="absolute top-0 left-0 w-4 h-4 rounded-full bg-gray-600 shadow-lg" />
            <div className="absolute top-1 left-3 w-24 h-2 bg-gradient-to-r from-gray-500 to-gray-600 rounded-full" />
            <div className="absolute top-0 right-0 w-3 h-4 bg-gray-400 rounded-sm transform rotate-45" />
          </div>
        </div>
      </div>

      {/* 歌曲信息 */}
      <div className="px-8 text-center">
        <h2 className="text-white text-xl font-bold truncate">{state.currentMusic.title}</h2>
        <p className="text-gray-400 text-sm mt-1 truncate">{state.currentMusic.artist || '未知艺术家'}</p>
        {state.currentMusic.album && (
          <p className="text-gray-500 text-xs mt-0.5 truncate">{state.currentMusic.album}</p>
        )}
      </div>

      {/* 进度条 */}
      <div className="px-8 mt-6">
        <div 
          ref={progressRef}
          onClick={handleProgressClick}
          className="h-1.5 bg-white/10 rounded-full cursor-pointer group"
        >
          <div 
            className="h-full bg-gradient-to-r from-pink-500 to-violet-500 rounded-full relative transition-all"
            style={{ width: `${progress}%` }}
          >
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
        <div className="flex justify-between mt-2 text-xs text-gray-500">
          <span>{formatTime(state.currentTime)}</span>
          <span>{formatTime(state.duration)}</span>
        </div>
      </div>

      {/* 控制按钮 */}
      <div className="px-8 py-6 flex items-center justify-center gap-6">
        {/* 播放模式 */}
        <button
          onClick={() => musicService.togglePlayMode()}
          className="p-3 text-gray-400 hover:text-white transition-colors"
          title={playModeConfig[state.playMode].label}
        >
          <div className="w-5 h-5">{playModeConfig[state.playMode].icon}</div>
        </button>

        {/* 上一曲 */}
        <button
          onClick={() => musicService.prev()}
          className="p-3 text-white hover:scale-110 transition-transform"
        >
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        {/* 播放/暂停 */}
        <button
          onClick={() => musicService.toggle()}
          className="w-16 h-16 rounded-full bg-gradient-to-br from-pink-500 to-violet-500 flex items-center justify-center shadow-lg hover:scale-105 transition-transform"
        >
          {state.isPlaying ? (
            <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
          ) : (
            <svg className="w-8 h-8 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        {/* 下一曲 */}
        <button
          onClick={() => musicService.next()}
          className="p-3 text-white hover:scale-110 transition-transform"
        >
          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
            <path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z" />
          </svg>
        </button>

        {/* 音量 */}
        <div className="relative">
          <button
            onClick={() => setShowVolumeSlider(!showVolumeSlider)}
            className="p-3 text-gray-400 hover:text-white transition-colors"
          >
            {state.isMuted || state.volume === 0 ? (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM23 9l-6 6M17 9l6 6" />
              </svg>
            ) : (
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
              </svg>
            )}
          </button>
          
          {/* 音量滑块 */}
          {showVolumeSlider && (
            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 p-3 bg-black/90 backdrop-blur-xl rounded-xl border border-white/10">
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={state.isMuted ? 0 : state.volume}
                onChange={(e) => musicService.setVolume(parseFloat(e.target.value))}
                className="w-24 h-1 appearance-none bg-white/20 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:bg-white [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* 音质切换 */}
      <div className="px-8 pb-6 flex justify-center gap-2">
        <button
          onClick={() => musicService.setQuality('standard')}
          className={`px-3 py-1 rounded-full text-xs transition-all ${
            state.quality === 'standard' 
              ? 'bg-white/20 text-white' 
              : 'text-gray-500 hover:text-gray-300'
          }`}
        >
          标准
        </button>
        <button
          onClick={() => musicService.setQuality('high')}
          className={`px-3 py-1 rounded-full text-xs transition-all ${
            state.quality === 'high' 
              ? 'bg-gradient-to-r from-pink-500 to-violet-500 text-white' 
              : 'text-gray-500 hover:text-gray-300'
          }`}
          disabled={!state.currentMusic.file_url_hq}
        >
          高清
        </button>
      </div>

      {/* 封面预览弹窗 */}
      {showCoverPreview && state.currentMusic.cover_url && (
        <div 
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-8"
          onClick={() => setShowCoverPreview(false)}
        >
          <img 
            src={state.currentMusic.cover_url} 
            alt={state.currentMusic.title}
            className="max-w-full max-h-full rounded-2xl shadow-2xl"
          />
        </div>
      )}
    </div>
  );
};

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default VinylPlayer;
