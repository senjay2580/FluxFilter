import React, { useState, useRef, useCallback, useEffect } from 'react';

interface PullToRefreshProps {
  onRefresh: () => Promise<void>;
  children: React.ReactNode;
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  disabled?: boolean;  // 禁用下拉刷新（如全屏弹窗打开时）
}

const PullToRefresh: React.FC<PullToRefreshProps> = ({ onRefresh, children, scrollContainerRef, disabled = false }) => {
  const [pullDistance, setPullDistance] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const threshold = 80; // 触发刷新的阈值

  // 用 ref 存储最新的 pullDistance，避免闭包问题
  const pullDistanceRef = useRef(0);
  pullDistanceRef.current = pullDistance;

  // 用 ref 存储 onRefresh，避免频繁重新注册
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // 使用原生事件监听器（非 passive）以支持 preventDefault
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let isRefreshing = false;

    const handleTouchStart = (e: TouchEvent) => {
      if (isRefreshing || disabled) return;
      const scrollTop = scrollContainerRef?.current?.scrollTop ?? window.scrollY;
      if (scrollTop <= 5) {
        startY.current = e.touches[0].clientY;
        isPulling.current = true;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (!isPulling.current || isRefreshing) return;
      
      const currentY = e.touches[0].clientY;
      const diff = currentY - startY.current;
      const scrollTop = scrollContainerRef?.current?.scrollTop ?? window.scrollY;
      
      if (diff > 0 && scrollTop <= 5) {
        e.preventDefault();
        const distance = Math.min(diff * 0.5, 120);
        setPullDistance(distance);
      } else if (diff < 0) {
        isPulling.current = false;
        setPullDistance(0);
      }
    };

    const handleTouchEnd = async () => {
      if (!isPulling.current) return;
      
      const currentPullDistance = pullDistanceRef.current;
      console.log('📱 TouchEnd, pullDistance:', currentPullDistance, 'threshold:', threshold);
      
      if (currentPullDistance >= threshold && !isRefreshing) {
        isRefreshing = true;
        setRefreshing(true);
        console.log('🔄 开始刷新...');
        try {
          await onRefreshRef.current();
          console.log('✅ 刷新完成');
        } catch (err) {
          console.error('❌ 刷新失败:', err);
        } finally {
          isRefreshing = false;
          setRefreshing(false);
        }
      }
      
      isPulling.current = false;
      setPullDistance(0);
    };

    container.addEventListener('touchstart', handleTouchStart, { passive: true });
    container.addEventListener('touchmove', handleTouchMove, { passive: false });
    container.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart);
      container.removeEventListener('touchmove', handleTouchMove);
      container.removeEventListener('touchend', handleTouchEnd);
    };
  }, [scrollContainerRef, disabled]); // 依赖 scrollContainerRef 和 disabled

  const progress = Math.min(pullDistance / threshold, 1);
  const rotation = pullDistance * 3;

  return (
    <div
      ref={containerRef}
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
