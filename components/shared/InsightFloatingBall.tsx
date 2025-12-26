import React, { useState, useRef, useEffect } from 'react';

type ColorVariant = 'green' | 'violet';

interface InsightFloatingBallProps {
  isLoading: boolean;
  isDone: boolean;
  onClick: () => void;
  color?: ColorVariant;
  storageKey?: string; // 不同悬浮球使用不同的位置存储 key
}

const colorConfig = {
  green: {
    loading: 'bg-gradient-to-br from-cyber-lime/40 to-emerald-500/30 border border-cyber-lime/60',
    done: 'bg-gradient-to-br from-green-500/40 to-emerald-500/30 border border-green-500/60',
    loadingIcon: 'text-cyber-lime',
    doneIcon: 'text-green-400',
  },
  violet: {
    loading: 'bg-gradient-to-br from-violet-500/40 to-purple-500/30 border border-violet-500/60',
    done: 'bg-gradient-to-br from-violet-500/40 to-purple-500/30 border border-violet-500/60',
    loadingIcon: 'text-violet-400',
    doneIcon: 'text-violet-400',
  },
};

const InsightFloatingBall: React.FC<InsightFloatingBallProps> = ({
  isLoading,
  isDone,
  onClick,
  color = 'green',
  storageKey = 'insight-ball-pos'
}) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 60, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const ballRef = useRef<HTMLButtonElement>(null);

  const colors = colorConfig[color];

  // 从 localStorage 恢复位置
  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        setPosition(pos);
      } catch { /* ignore */ }
    }
  }, [storageKey]);

  // 保存位置到 localStorage
  const savePosition = (pos: { x: number; y: number }) => {
    localStorage.setItem(storageKey, JSON.stringify(pos));
  };

  // 限制位置在屏幕内
  const clampPosition = (x: number, y: number) => {
    const ballSize = 44;
    const padding = 8;
    return {
      x: Math.max(padding, Math.min(window.innerWidth - ballSize - padding, x)),
      y: Math.max(padding, Math.min(window.innerHeight - ballSize - padding, y)),
    };
  };

  // 使用 ref 来存储最新的状态，避免闭包问题
  const positionRef = useRef(position);
  const isDraggingRef = useRef(isDragging);
  const hasMovedRef = useRef(hasMoved);
  
  useEffect(() => {
    positionRef.current = position;
  }, [position]);
  
  useEffect(() => {
    isDraggingRef.current = isDragging;
  }, [isDragging]);
  
  useEffect(() => {
    hasMovedRef.current = hasMoved;
  }, [hasMoved]);

  // 使用 useEffect 添加 non-passive 触摸事件监听器
  useEffect(() => {
    const ball = ballRef.current;
    if (!ball) return;

    const handleTouchStart = (e: TouchEvent) => {
      setIsDragging(true);
      setHasMoved(false);
      dragStartPos.current = {
        x: e.touches[0].clientX - positionRef.current.x,
        y: e.touches[0].clientY - positionRef.current.y,
      };
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isDraggingRef.current) return;
      e.preventDefault(); // 现在可以正常工作了
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

    // 添加 non-passive 事件监听器
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

  if (!isLoading && !isDone) return null;

  return (
    <button
      ref={ballRef}
      onClick={handleClick}
      onMouseDown={handleMouseDown}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 99999,
        touchAction: 'none',
      }}
      className={`w-11 h-11 rounded-full shadow-xl flex items-center justify-center transition-transform select-none ${
        isDragging ? 'scale-110 cursor-grabbing' : 'cursor-grab active:scale-95'
      } ${isLoading ? colors.loading : colors.done}`}
    >
      {isLoading ? (
        <svg
          className={`w-5 h-5 ${colors.loadingIcon} animate-spin-smooth`}
          style={{ transformOrigin: 'center center' }}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      ) : (
        <svg
          className={`w-5 h-5 ${colors.doneIcon}`}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
        >
          <path d="M20 6L9 17l-5-5" />
        </svg>
      )}
    </button>
  );
};

export default InsightFloatingBall;
