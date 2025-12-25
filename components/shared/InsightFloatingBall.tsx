import React, { useState, useRef, useEffect } from 'react';

interface InsightFloatingBallProps {
  isLoading: boolean;
  isDone: boolean;
  onClick: () => void;
}

const InsightFloatingBall: React.FC<InsightFloatingBallProps> = ({ isLoading, isDone, onClick }) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 60, y: 80 });
  const [isDragging, setIsDragging] = useState(false);
  const [hasMoved, setHasMoved] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const ballRef = useRef<HTMLButtonElement>(null);

  // 从 localStorage 恢复位置
  useEffect(() => {
    const saved = localStorage.getItem('insight-ball-pos');
    if (saved) {
      try {
        const pos = JSON.parse(saved);
        setPosition(pos);
      } catch { /* ignore */ }
    }
  }, []);

  // 保存位置到 localStorage
  const savePosition = (pos: { x: number; y: number }) => {
    localStorage.setItem('insight-ball-pos', JSON.stringify(pos));
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

  // 触摸开始
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setHasMoved(false);
    dragStartPos.current = {
      x: e.touches[0].clientX - position.x,
      y: e.touches[0].clientY - position.y,
    };
  };

  // 触摸移动
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setHasMoved(true);
    const newPos = clampPosition(
      e.touches[0].clientX - dragStartPos.current.x,
      e.touches[0].clientY - dragStartPos.current.y
    );
    setPosition(newPos);
  };

  // 触摸结束
  const handleTouchEnd = () => {
    if (isDragging) {
      setIsDragging(false);
      savePosition(position);
      // 如果没有移动，触发点击
      if (!hasMoved) {
        onClick();
      }
    }
  };

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
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
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
      } ${
        isLoading
          ? 'bg-gradient-to-br from-cyber-lime/40 to-emerald-500/30 border border-cyber-lime/60'
          : 'bg-gradient-to-br from-green-500/40 to-emerald-500/30 border border-green-500/60'
      }`}
    >
      {isLoading ? (
        <svg
          className="w-5 h-5 text-cyber-lime animate-spin-smooth"
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
          className="w-5 h-5 text-green-400"
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
