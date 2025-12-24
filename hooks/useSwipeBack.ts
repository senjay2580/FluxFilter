import { useRef, useCallback, useState } from 'react';

interface UseSwipeBackOptions {
  onBack: () => void;
  threshold?: number; // 触发返回的最小滑动距离，默认 80px
  edgeWidth?: number; // 边缘触发区域宽度，默认 25px（从左边缘开始滑动才触发）
}

interface SwipeState {
  isActive: boolean;
  progress: number; // 0-1 滑动进度
}

/**
 * 左滑返回手势 Hook
 * 模仿 iOS 的边缘左滑返回效果
 */
export function useSwipeBack({ onBack, threshold = 80, edgeWidth = 25 }: UseSwipeBackOptions) {
  const touchStartX = useRef<number>(0);
  const touchStartY = useRef<number>(0);
  const touchEndX = useRef<number>(0);
  const touchEndY = useRef<number>(0);
  const isEdgeSwipe = useRef<boolean>(false);
  const swipeDirection = useRef<'horizontal' | 'vertical' | 'none'>('none');
  const [swipeState, setSwipeState] = useState<SwipeState>({ isActive: false, progress: 0 });

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartX.current = touch.clientX;
    touchStartY.current = touch.clientY;
    touchEndX.current = touch.clientX;
    touchEndY.current = touch.clientY;
    swipeDirection.current = 'none';
    
    // 检查是否从左边缘开始滑动
    isEdgeSwipe.current = touch.clientX <= edgeWidth;
    
    if (isEdgeSwipe.current) {
      setSwipeState({ isActive: true, progress: 0 });
    }
  }, [edgeWidth]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isEdgeSwipe.current) return;
    
    const touch = e.touches[0];
    touchEndX.current = touch.clientX;
    touchEndY.current = touch.clientY;

    const deltaX = touchEndX.current - touchStartX.current;
    const deltaY = Math.abs(touchEndY.current - touchStartY.current);

    // 首次移动时确定滑动方向
    if (swipeDirection.current === 'none' && (Math.abs(deltaX) > 10 || deltaY > 10)) {
      swipeDirection.current = Math.abs(deltaX) > deltaY * 1.2 ? 'horizontal' : 'vertical';
      
      // 如果是垂直滑动，取消边缘滑动
      if (swipeDirection.current === 'vertical') {
        isEdgeSwipe.current = false;
        setSwipeState({ isActive: false, progress: 0 });
        return;
      }
    }

    // 更新滑动进度（只有向右滑动才计算进度）
    if (swipeDirection.current === 'horizontal' && deltaX > 0) {
      const progress = Math.min(deltaX / (threshold * 1.5), 1);
      setSwipeState({ isActive: true, progress });
    }
  }, [threshold]);

  const handleTouchEnd = useCallback(() => {
    const wasActive = isEdgeSwipe.current && swipeDirection.current === 'horizontal';
    
    // 重置状态
    setSwipeState({ isActive: false, progress: 0 });
    
    // 必须是从边缘开始的水平滑动
    if (!wasActive) {
      swipeDirection.current = 'none';
      isEdgeSwipe.current = false;
      return;
    }

    const diffX = touchEndX.current - touchStartX.current;
    const diffY = Math.abs(touchEndY.current - touchStartY.current);

    // 垂直滑动过多，不触发
    if (diffY > 100) {
      swipeDirection.current = 'none';
      isEdgeSwipe.current = false;
      return;
    }

    // 向右滑动超过阈值，触发返回
    if (diffX > threshold) {
      onBack();
    }

    swipeDirection.current = 'none';
    isEdgeSwipe.current = false;
  }, [onBack, threshold]);

  return {
    onTouchStart: handleTouchStart,
    onTouchMove: handleTouchMove,
    onTouchEnd: handleTouchEnd,
    swipeState, // 可用于添加视觉反馈
  };
}

export default useSwipeBack;
