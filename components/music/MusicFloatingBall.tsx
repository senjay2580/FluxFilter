import React, { useState, useRef, useEffect, useSyncExternalStore } from 'react';
import { musicService } from '../../lib/music-service';

interface MusicFloatingBallProps {
  onClick: () => void;
}

const MusicFloatingBall: React.FC<MusicFloatingBallProps> = ({ onClick }) => {
  const state = useSyncExternalStore(
    musicService.subscribe,
    musicService.getState
  );

  const [position, setPosition] = useState({ x: window.innerWidth - 60, y: window.innerHeight - 180 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const [isHidden, setIsHidden] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const ballRef = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<NodeJS.Timeout | null>(null);

  // 从 localStorage 恢复位置
  useEffect(() => {
    const saved = localStorage.getItem('music-ball-pos');
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        setPosition(pos);
      } catch { /* ignore */ }
    }
  }, []);

  // 暂停时自动半透明隐藏
  useEffect(() => {
    if (!state.isPlaying && state.showFloatingBall) {
      hideTimer.current = setTimeout(() => setIsHidden(true), 5000);
    } else {
      setIsHidden(false);
      if (hideTimer.current) clearTimeout(hideTimer.current);
    }
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, [state.isPlaying, state.showFloatingBall]);

  const savePosition = (pos: { x: number; y: number }) => {
    localStorage.setItem('music-ball-pos', JSON.stringify(pos));
  };

  const clampPosition = (x: number, y: number) => {
    const ballSize = 52;
    const padding = 8;
    return {
      x: Math.max(padding, Math.min(window.innerWidth - ballSize - padding, x)),
      y: Math.max(padding, Math.min(window.innerHeight - ballSize - padding, y)),
    };
  };

  const positionRef = useRef(position);
  const isDraggingRef = useRef(isDragging);
  const hasMovedRef = useRef(hasMoved);

  useEffect(() => { positionRef.current = position; }, [position]);
  useEffect(() => { isDraggingRef.current = isDragging; }, [isDragging]);
  useEffect(() => { hasMovedRef.current = hasMoved; }, [hasMoved]);

  // 触摸事件
  useEffect(() => {
    const ball = ballRef.current;
    if (!ball) return;

    const handleTouchStart = (e: TouchEvent) => {
      setIsDragging(true);
      setHasMoved(false);
      setIsHidden(false);
      dragStartPos.current = {
        x: e.touches[0].clientX - positionRef.current.x,
        y: e.touches[0].clientY - positionRef.current.y,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault();
      setHasMoved(true);
      const newPos = clampPosition(
        e.touches[0].clientX - dragStartPos.current.x,
        e.touches[0].clientY - dragStartPos.current.y
      );
      setPosition(newPos);
    };

    const handleTouchEnd = () => {
      if (isDraggingRef.current) {
        setIsDragging(false);
        savePosition(positionRef.current);
        if (!hasMovedRef.current) {
          onClick();
        }
      }
    };

    ball.addEventListener('touchstart', handleTouchStart, { passive: false });
    ball.addEventListener('touchmove', handleTouchMove, { passive: false });
    ball.addEventListener('touchend', handleTouchEnd, { passive: false });

    return () => {
      ball.removeEventListener('touchstart', handleTouchStart);
      ball.removeEventListener('touchmove', handleTouchMove);
      ball.removeEventListener('touchend', handleTouchEnd);
    };
  }, [onClick]);

  // 鼠标拖动
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setHasMoved(false);
    setIsHidden(false);
    dragStartPos.current = {
      x: e.clientX - position.x,
      y: e.clientY - position.y,
    };
    e.preventDefault();
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      setHasMoved(true);
      const newPos = clampPosition(
        e.clientX - dragStartPos.current.x,
        e.clientY - dragStartPos.current.y
      );
      setPosition(newPos);
    };

    const handleMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
        savePosition(position);
      }
    };

    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, position]);

  const handleClick = () => {
    if (!hasMoved) {
      onClick();
    }
  };

  if (!state.showFloatingBall || !state.currentMusic) return null;

  return (
    <button
      ref={ballRef}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 99998,
        touchAction: 'none',
      }}
      className={`w-13 h-13 rounded-full shadow-2xl flex items-center justify-center transition-all select-none overflow-hidden ${
        isDragging ? 'scale-110 cursor-grabbing' : 'cursor-grab active:scale-95'
      } ${isHidden ? 'opacity-40' : 'opacity-100'}`}
    >
      {/* 封面背景 */}
      <div 
        className={`absolute inset-0 bg-cover bg-center ${state.isPlaying ? 'animate-spin-slow' : ''}`}
        style={{ 
          backgroundImage: state.currentMusic.cover_url 
            ? `url(${state.currentMusic.cover_url})` 
            : 'linear-gradient(135deg, #ec4899, #8b5cf6)',
          animationDuration: '8s',
        }}
      />
      
      {/* 黑胶唱片效果 */}
      <div className="absolute inset-0 bg-black/30 rounded-full" />
      <div className="absolute inset-[6px] rounded-full border-2 border-white/20" />
      <div className="absolute inset-[18px] rounded-full bg-black/60" />
      
      {/* 播放/暂停图标 */}
      <div className="relative z-10 w-4 h-4 text-white">
        {state.isPlaying ? (
          <svg viewBox="0 0 24 24" fill="currentColor">
            <rect x="6" y="4" width="4" height="16" rx="1" />
            <rect x="14" y="4" width="4" height="16" rx="1" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </div>
    </button>
  );
};

export default MusicFloatingBall;
