import React, { useState, useRef, useCallback } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children }) => {
  const [pulling, setPulling] = useState(false);
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const containerRef = useRef<HTMLDivElement>(null);

  const threshold = 80; // 触发刷新的阈值

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (window.scrollY === 0) {
      startY.current = e.touches[0].clientY;
      setPulling(true);
    }
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!pulling || refreshing) return;
    
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    
    if (diff > 0 && window.scrollY === 0) {
      // 阻尼效果
      const distance = Math.min(diff * 0.4, 120);
      setPullDistance(distance);
    }
  }, [pulling, refreshing]);

  const handleTouchEnd = useCallback(async () => {
    if (!pulling) return;
    
    if (pullDistance >= threshold && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    
    setPulling(false);
    setPullDistance(0);
  }, [pulling, pullDistance, refreshing, onRefresh]);

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = pullDistance * 3;

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      className="relative"
    >
      {/* 刷新指示器 */}
      <div 
        className="absolute left-0 right-0 flex items-center justify-center overflow-hidden transition-all duration-300 z-30"
        style={{ 
          height: refreshing ? 60 : pullDistance,
          top: 0,
        }}
      >
        <div 
          className={`flex flex-col items-center gap-2 transition-all duration-200 ${
            pullDistance > 0 || refreshing ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            transform: `scale(${0.5 + progress * 0.5})`,
          }}
        >
          {/* Logo 动画 */}
          <div 
            className="relative w-10 h-10 flex items-center justify-center"
            style={{ transform: `rotate(${rotation}deg)` }}
          >
            {refreshing ? (
              // 刷新中的动画
              <div className="w-8 h-8 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin" />
            ) : (
              // 下拉指示
              <div className="relative">
                <span 
                  className="text-2xl font-bold bg-gradient-to-br from-cyber-lime to-cyan-400 bg-clip-text text-transparent"
                  style={{ fontFamily: 'Arial, sans-serif' }}
                >
                  F
                </span>
                <span 
                  className="absolute -right-1 top-1 text-lg italic text-white/80"
                  style={{ fontFamily: 'Georgia, serif' }}
                >
                  f
                </span>
              </div>
            )}
          </div>
          
          {/* 提示文字 */}
          <span className="text-xs text-gray-400">
            {refreshing 
              ? '正在刷新...' 
              : pullDistance >= threshold 
                ? '松开刷新' 
                : '下拉刷新'}
          </span>
        </div>
      </div>

      {/* 主内容 */}
      <div 
        className="transition-transform duration-300"
        style={{ 
          transform: `translateY(${refreshing ? 60 : pullDistance}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default PullToRefresh;
