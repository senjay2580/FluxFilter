import React, { useState, useEffect, useCallback, useSyncExternalStore, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { getStoredUserId } from '../../lib/auth';
import { insightService, type InsightCard } from '../../lib/insight-service';

// 分类配置
const CATEGORY_CONFIG: Record<string, { label: string; icon: string }> = {
  Industry_Insight: { label: '行业透视', icon: '🏭' },
  Cognitive_Upgrade: { label: '认知升级', icon: '🧠' },
  Life_Heuristics: { label: '生活法则', icon: '⚡' },
  Global_Perspective: { label: '全球视野', icon: '🌍' },
  Golden_Quote: { label: '金句', icon: '💎' },
};

const SAVED_KEY = 'daily_insights_saved';

const DailyInsights: React.FC = () => {
  // 使用全局服务的状态
  const cards = useSyncExternalStore(
    insightService.subscribe.bind(insightService),
    () => insightService.cards
  );
  const loading = useSyncExternalStore(
    insightService.subscribe.bind(insightService),
    () => insightService.isLoading
  );

  // 已归档的卡片（本地状态）
  const [savedCards, setSavedCards] = useState<InsightCard[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const [showSaved, setShowSaved] = useState(false);
  
  // 用户标签
  const [userTags, setUserTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [showTagEditor, setShowTagEditor] = useState(false);
  
  // 滑动相关
  const [isDragging, setIsDragging] = useState(false);
  const [startX, setStartX] = useState(0);
  const [offsetX, setOffsetX] = useState(0);
  
  // 卡片容器 ref
  const cardsContainerRef = useRef<HTMLDivElement>(null);
  const savedCardsContainerRef = useRef<HTMLDivElement>(null);
  // 用于存储滑动状态的 ref（避免闭包问题）
  const dragStateRef = useRef({ isDragging: false, startX: 0 });
  // 用于存储 currentIndex 和 offsetX 的 ref
  const currentIndexRef = useRef(currentIndex);
  const offsetXRef = useRef(offsetX);
  
  // 同步 ref 值
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);
  
  useEffect(() => {
    offsetXRef.current = offsetX;
  }, [offsetX]);

  // 加载已归档卡片
  useEffect(() => {
    const saved = localStorage.getItem(SAVED_KEY);
    if (saved) {
      try { setSavedCards(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  // 加载用户标签
  useEffect(() => {
    const loadTags = async () => {
      const userId = getStoredUserId();
      if (!userId) return;
      
      const { data, error } = await supabase
        .from('insight_tags')
        .select('tag')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      
      if (!error && data) setUserTags(data.map(d => d.tag));
    };
    loadTags();
  }, []);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  // 添加标签
  const addTag = async () => {
    const tag = newTag.trim();
    if (!tag || userTags.includes(tag)) { setNewTag(''); return; }
    
    const userId = getStoredUserId();
    if (!userId) return;
    
    const { error } = await supabase.from('insight_tags').insert({ user_id: userId, tag });
    if (!error) {
      setUserTags([...userTags, tag]);
      setNewTag('');
      showToast('标签已添加');
    }
  };

  // 删除标签
  const removeTag = async (tag: string) => {
    const userId = getStoredUserId();
    if (!userId) return;
    
    const { error } = await supabase.from('insight_tags').delete().eq('user_id', userId).eq('tag', tag);
    if (!error) {
      setUserTags(userTags.filter(t => t !== tag));
      showToast('标签已删除');
    }
  };

  // 生成知识卡片
  const generateInsights = useCallback(async (append = false) => {
    setError(null);
    if (!append) setCurrentIndex(0);
    
    const result = await insightService.generate(userTags, append);
    if (!result.success && result.error) {
      setError(result.error);
    }
  }, [userTags]);

  // 删除卡片
  const deleteCard = useCallback((id: string) => {
    insightService.deleteCard(id);
    if (currentIndex >= cards.length - 1 && cards.length > 1) {
      setCurrentIndex(cards.length - 2);
    }
    showToast('已跳过');
  }, [cards.length, currentIndex, showToast]);

  // 归档卡片
  const archiveCard = useCallback((card: InsightCard) => {
    setSavedCards(prev => {
      const exists = prev.some(c => c.title === card.title);
      if (exists) { showToast('已归档过该卡片'); return prev; }
      const updated = [...prev, card];
      localStorage.setItem(SAVED_KEY, JSON.stringify(updated));
      return updated;
    });
    insightService.deleteCard(card.id);
    if (currentIndex >= cards.length - 1 && cards.length > 1) {
      setCurrentIndex(cards.length - 2);
    }
    showToast('已归档');
  }, [cards.length, currentIndex, showToast]);

  // 删除已归档的卡片
  const removeSavedCard = useCallback((id: string) => {
    setSavedCards(prev => {
      const updated = prev.filter(c => c.id !== id);
      localStorage.setItem(SAVED_KEY, JSON.stringify(updated));
      return updated;
    });
    showToast('已移除');
  }, [showToast]);

  // 复制卡片内容
  const copyCard = useCallback((card: InsightCard) => {
    const text = `【${CATEGORY_CONFIG[card.category]?.label || card.category}】${card.title}\n\n📚 来源：${card.source}\n\n💡 核心内容：\n${card.core_content}\n\n🎯 行动启示：\n${card.takeaway}\n\n🏷️ 标签：${card.tags.join(' | ')}`;
    navigator.clipboard.writeText(text);
    showToast('已复制到剪贴板');
  }, [showToast]);

  // 处理卡片按钮点击（事件委托）
  const handleCardButtonClick = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const target = e.target as HTMLElement;
    const button = target.closest('button[data-action]') as HTMLButtonElement;
    if (!button) return;
    
    const action = button.dataset.action;
    const cardId = button.dataset.cardId;
    if (!action || !cardId) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const allCards = showSaved ? savedCards : cards;
    const card = allCards.find(c => c.id === cardId);
    if (!card) return;
    
    if (action === 'copy') {
      copyCard(card);
    } else if (action === 'skip') {
      deleteCard(cardId);
    } else if (action === 'archive') {
      archiveCard(card);
    } else if (action === 'remove') {
      removeSavedCard(cardId);
    }
  }, [showSaved, savedCards, cards, copyCard, deleteCard, archiveCard, removeSavedCard]);

  // 滑动处理 - 使用原生事件监听器处理移动端滑动
  const touchStartPos = useRef({ x: 0, y: 0, time: 0 });
  const swipeDirectionRef = useRef<'none' | 'horizontal' | 'vertical'>('none');
  const touchTargetRef = useRef<HTMLElement | null>(null);
  
  // 用 ref 存储最新的 cards 和 savedCards，避免闭包问题
  const cardsRef = useRef(cards);
  const savedCardsRef = useRef(savedCards);
  const showSavedRef = useRef(showSaved);
  
  useEffect(() => {
    cardsRef.current = cards;
    savedCardsRef.current = savedCards;
    showSavedRef.current = showSaved;
  }, [cards, savedCards, showSaved]);
  
  // 使用原生事件监听器处理触摸事件
  useEffect(() => {
    const container1 = cardsContainerRef.current;
    const container2 = savedCardsContainerRef.current;
    
    // 处理按钮点击
    const executeButtonAction = (button: HTMLElement) => {
      const action = button.dataset.action;
      const cardId = button.dataset.cardId;
      if (!action || !cardId) return;
      
      const allCards = showSavedRef.current ? savedCardsRef.current : cardsRef.current;
      const card = allCards.find(c => c.id === cardId);
      if (!card) return;
      
      if (action === 'copy') {
        copyCard(card);
      } else if (action === 'skip') {
        deleteCard(cardId);
      } else if (action === 'archive') {
        archiveCard(card);
      } else if (action === 'remove') {
        removeSavedCard(cardId);
      }
    };
    
    const handleNativeTouchStart = (e: TouchEvent) => {
      // 检查是否点击了按钮
      const target = e.target as HTMLElement;
      const button = target.closest('button[data-action]') as HTMLElement;
      if (button) {
        touchTargetRef.current = button;
        return; // 不处理滑动，等待 touchend 处理按钮点击
      }
      touchTargetRef.current = null;
      
      const touch = e.touches[0];
      touchStartPos.current = { x: touch.clientX, y: touch.clientY, time: Date.now() };
      swipeDirectionRef.current = 'none';
      setStartX(touch.clientX);
      setIsDragging(false);
      dragStateRef.current.isDragging = false;
      dragStateRef.current.startX = touch.clientX;
    };
    
    const handleNativeTouchMove = (e: TouchEvent) => {
      // 如果是按钮点击，不处理滑动
      if (touchTargetRef.current) return;
      
      const touch = e.touches[0];
      const deltaX = touch.clientX - touchStartPos.current.x;
      const deltaY = touch.clientY - touchStartPos.current.y;
      const absDeltaX = Math.abs(deltaX);
      const absDeltaY = Math.abs(deltaY);
      
      // 首次移动时确定方向
      if (swipeDirectionRef.current === 'none' && (absDeltaX > 10 || absDeltaY > 10)) {
        swipeDirectionRef.current = absDeltaX > absDeltaY ? 'horizontal' : 'vertical';
      }
      
      // 水平滑动时阻止默认行为并更新状态
      if (swipeDirectionRef.current === 'horizontal') {
        const displayCards = showSavedRef.current ? savedCardsRef.current : cardsRef.current;
        // 第一页不能向右滑，最后一页不能向左滑
        const isFirstPage = currentIndexRef.current === 0;
        const isLastPage = currentIndexRef.current >= displayCards.length - 1;
        
        // 如果是边界情况，限制滑动
        if ((isFirstPage && deltaX > 0) || (isLastPage && deltaX < 0)) {
          // 边界时只允许小幅度滑动作为反馈
          const limitedDelta = deltaX * 0.2;
          setOffsetX(limitedDelta);
        } else {
          setOffsetX(deltaX);
        }
        
        e.preventDefault();
        e.stopPropagation(); // 只在水平滑动时阻止冒泡
        if (!dragStateRef.current.isDragging) {
          setIsDragging(true);
          dragStateRef.current.isDragging = true;
        }
      }
    };
    
    const handleNativeTouchEnd = () => {
      // 如果是按钮点击，执行按钮操作
      if (touchTargetRef.current) {
        executeButtonAction(touchTargetRef.current);
        touchTargetRef.current = null;
        return;
      }
      // 只有在实际滑动时才处理
      if (dragStateRef.current.isDragging) {
        setIsDragging(false);
        dragStateRef.current.isDragging = false;
        
        const threshold = 80;
        const displayCards = showSavedRef.current ? savedCardsRef.current : cardsRef.current;
        const currentOffset = offsetXRef.current;
        const idx = currentIndexRef.current;
        
        if (currentOffset > threshold && idx > 0) {
          setCurrentIndex(idx - 1);
        } else if (currentOffset < -threshold && idx < displayCards.length - 1) {
          setCurrentIndex(idx + 1);
        }
        
        setOffsetX(0);
      }
      
      swipeDirectionRef.current = 'none';
    };
    
    // 绑定事件
    if (container1) {
      container1.addEventListener('touchstart', handleNativeTouchStart, { passive: true });
      container1.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
      container1.addEventListener('touchend', handleNativeTouchEnd, { passive: true });
    }
    if (container2) {
      container2.addEventListener('touchstart', handleNativeTouchStart, { passive: true });
      container2.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
      container2.addEventListener('touchend', handleNativeTouchEnd, { passive: true });
    }
    
    return () => {
      if (container1) {
        container1.removeEventListener('touchstart', handleNativeTouchStart);
        container1.removeEventListener('touchmove', handleNativeTouchMove);
        container1.removeEventListener('touchend', handleNativeTouchEnd);
      }
      if (container2) {
        container2.removeEventListener('touchstart', handleNativeTouchStart);
        container2.removeEventListener('touchmove', handleNativeTouchMove);
        container2.removeEventListener('touchend', handleNativeTouchEnd);
      }
    };
  }, [copyCard, deleteCard, archiveCard, removeSavedCard, showSaved, cards.length, savedCards.length]);
  
  // PC 端鼠标事件处理
  const handleMouseDown = (e: React.MouseEvent) => { 
    touchStartPos.current = { x: e.clientX, y: e.clientY, time: Date.now() };
    setStartX(e.clientX);
    setIsDragging(true);
  };
  const handleMouseMove = (e: React.MouseEvent) => { 
    if (!isDragging || e.buttons !== 1) return;
    const deltaX = e.clientX - startX;
    const displayCards = showSaved ? savedCards : cards;
    const isFirstPage = currentIndex === 0;
    const isLastPage = currentIndex >= displayCards.length - 1;
    
    // 边界限制
    if ((isFirstPage && deltaX > 0) || (isLastPage && deltaX < 0)) {
      setOffsetX(deltaX * 0.2);
    } else {
      setOffsetX(deltaX);
    }
  };
  const handleMouseUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    const threshold = 80;
    const displayCards = showSaved ? savedCards : cards;
    if (offsetX > threshold && currentIndex > 0) setCurrentIndex(currentIndex - 1);
    else if (offsetX < -threshold && currentIndex < displayCards.length - 1) setCurrentIndex(currentIndex + 1);
    setOffsetX(0);
  };


  // 渲染单张卡片 - 简单流畅的滑动动画
  const renderCard = (card: InsightCard, index: number, total: number, isSaved = false) => {
    const config = CATEGORY_CONFIG[card.category] || { label: card.category, icon: '📌' };
    const isActive = index === currentIndex;
    const offset = index - currentIndex;
    
    // 只显示当前卡片和前后各一张
    if (Math.abs(offset) > 1) return null;
    
    // 计算拖动偏移
    const dragOffset = isDragging ? offsetX : 0;
    
    // 简单的滑动效果
    const getCardStyle = () => {
      // 基础位置：每张卡片相对于当前卡片的偏移
      const baseTranslateX = offset * 100; // 百分比
      
      // 拖动时的额外偏移（转换为百分比）
      const dragPercent = (dragOffset / (window.innerWidth || 375)) * 100;
      
      // 最终位置
      const translateX = baseTranslateX + dragPercent;
      
      // 缩放：非当前卡片稍微缩小
      const scale = isActive ? 1 : 0.92;
      
      // 透明度
      const opacity = Math.abs(offset) === 0 ? 1 : (Math.abs(offset) === 1 ? 0.6 : 0);
      
      return {
        transform: `translateX(calc(-50% + ${translateX}%)) scale(${scale})`,
        opacity,
        zIndex: isActive ? 10 : 5,
      };
    };
    
    const cardStyle = getCardStyle();
    
    return (
      <div
        key={card.id}
        className="absolute left-1/2 top-1/2 will-change-transform"
        style={{
          width: 'calc(100% - 32px)',
          ...cardStyle,
          transform: `${cardStyle.transform} translateY(-50%)`,
          pointerEvents: isActive ? 'auto' : 'none',
          transition: isDragging ? 'none' : 'all 0.3s cubic-bezier(0.25, 0.1, 0.25, 1)',
        }}
      >
        {/* 主卡片 - 简洁深色样式 */}
        <div 
          className="relative min-h-[420px] flex flex-col rounded-2xl overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, #1E2530 0%, #252D3A 50%, #1A202C 100%)',
            boxShadow: '0 4px 20px rgba(0, 0, 0, 0.3)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
          }}
        >
          {/* 装饰边框 */}
          <div className="absolute top-3 left-3 right-3 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
          <div className="absolute bottom-3 left-3 right-3 h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent" />
          
          <div className="relative p-6 flex flex-col flex-1">
            {/* 右上角操作区 - 只保留复制按钮 */}
            <div className="absolute top-4 right-4 z-[100]">
              <button 
                type="button"
                data-action="copy"
                data-card-id={card.id}
                className="p-2 hover:bg-white/10 active:bg-white/20 rounded-lg text-white/40 hover:text-white/70 transition-colors" 
                title="复制"
              >
                <svg className="w-4 h-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              </button>
            </div>

            {/* 头部 - 分类标签 */}
            <div className="flex items-center gap-2.5 mb-4 pr-20">
              <span className="text-2xl drop-shadow-sm">{config.icon}</span>
              <span 
                className="text-[11px] font-bold uppercase tracking-widest"
                style={{
                  background: 'linear-gradient(135deg, #22D3EE 0%, #67E8F9 30%, #22D3EE 50%, #06B6D4 100%)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                }}
              >
                {config.label}
              </span>
              <span className="text-[11px] text-white/40 ml-auto font-serif italic">{index + 1}/{total}</span>
            </div>

            {/* 标题 */}
            <h3 
              className="text-[18px] font-bold mb-3 line-clamp-2 leading-snug text-white"
              style={{ fontFamily: 'Georgia, serif', letterSpacing: '-0.02em' }}
            >
              {card.title}
            </h3>

            {/* 来源 - 出版信息风格 */}
            <p className="text-[11px] text-white/50 mb-4 flex items-center gap-1.5 font-medium italic">
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {card.source}
            </p>

            {/* 核心内容 - 支持滚动 */}
            <div className="flex-1 overflow-y-auto max-h-[200px]" style={{ touchAction: 'pan-y' }}>
              <p className="text-[15px] leading-[1.8] text-white/80" style={{ fontFamily: 'Georgia, serif' }}>
                {card.core_content}
              </p>
            </div>

            {/* 标签 */}
            <div className="flex flex-wrap gap-2 mt-4 mb-4">
              {card.tags.slice(0, 4).map((tag, i) => (
                <span 
                  key={i} 
                  className="px-2.5 py-1 rounded text-[10px] font-medium"
                  style={{ background: 'rgba(255, 255, 255, 0.1)', color: 'rgba(255, 255, 255, 0.7)', border: '1px solid rgba(255, 255, 255, 0.15)' }}
                >
                  #{tag}
                </span>
              ))}
            </div>

            {/* 底部操作栏 */}
            <div className="flex items-center justify-between pt-4 relative z-[100]" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
              {isSaved ? (
                <>
                  <span className="text-[10px] text-white/40 italic">已归档</span>
                  <button 
                    type="button"
                    data-action="remove"
                    data-card-id={card.id}
                    className="flex items-center gap-1.5 px-3 py-2 hover:bg-red-500/20 active:bg-red-500/30 rounded-lg text-white/40 hover:text-red-400 text-xs transition-colors"
                  >
                    <svg className="w-4 h-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    移除
                  </button>
                </>
              ) : (
                <>
                  <button 
                    type="button"
                    data-action="skip"
                    data-card-id={card.id}
                    className="flex items-center gap-1.5 px-3 py-2 hover:bg-white/10 active:bg-white/20 rounded-lg text-white/40 hover:text-white/70 text-xs transition-colors"
                  >
                    <svg className="w-4 h-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                    跳过
                  </button>
                  <button 
                    type="button"
                    data-action="archive"
                    data-card-id={card.id}
                    className="flex items-center gap-1.5 px-5 py-2.5 rounded-lg text-xs font-medium transition-all active:scale-95"
                    style={{ background: 'linear-gradient(135deg, #059669 0%, #047857 100%)', color: '#fff', boxShadow: '0 2px 8px rgba(5, 150, 105, 0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}
                  >
                    <svg className="w-4 h-4 pointer-events-none" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    归档保存
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };


  return (
    <div id="daily-insights-container" className="min-h-[500px]" style={{ touchAction: 'pan-y pinch-zoom', overscrollBehaviorX: 'none' }}>
      {/* 头部切换和操作 */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowSaved(false); setCurrentIndex(0); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${!showSaved ? 'bg-emerald-700 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
          >
            {loading && !showSaved && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            待处理
            {cards.length > 0 && <span className="text-[11px] opacity-80">{cards.length}</span>}
          </button>
          <button
            onClick={() => { setShowSaved(true); setCurrentIndex(0); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${showSaved ? 'bg-emerald-700 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
          >
            已归档
            {savedCards.length > 0 && <span className="text-[11px] opacity-80">{savedCards.length}</span>}
          </button>
          
          {/* 兴趣配置按钮 */}
          <button
            onClick={() => setShowTagEditor(!showTagEditor)}
            className={`ml-auto p-2 rounded-xl transition-all ${showTagEditor ? 'bg-cyber-lime/20 text-cyber-lime' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
            title="兴趣领域配置"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
          </button>
        </div>
        
        {!showSaved && cards.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => generateInsights(true)}
              disabled={loading}
              className="flex-1 px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-white text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
              )}
              Continue
            </button>
            <button
              onClick={() => generateInsights(false)}
              disabled={loading}
              className="px-4 py-2.5 bg-white/5 hover:bg-red-500/10 border border-white/10 hover:border-red-500/30 rounded-xl text-white/60 hover:text-red-400 text-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 4v6h6M23 20v-6h-6" /><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15" />
              </svg>
            </button>
          </div>
        )}
      </div>

      {/* 兴趣标签配置面板 - 可折叠 */}
      {showTagEditor && (
        <div className="mb-4 p-4 bg-white/5 rounded-2xl border border-white/10 animate-fade-in">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
                <line x1="7" y1="7" x2="7.01" y2="7" />
              </svg>
              <span className="text-sm font-medium text-white">我的兴趣领域</span>
            </div>
            <button onClick={() => setShowTagEditor(false)} className="text-xs text-white/40 hover:text-white/60 transition-colors">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="flex flex-wrap gap-2 mb-3">
            {userTags.length === 0 && (
              <span className="text-xs text-white/40">暂无标签，添加感兴趣的领域...</span>
            )}
            {userTags.map((tag, i) => (
              <div key={i} className="flex items-center gap-1 px-3 py-1.5 bg-white/10 rounded-full">
                <span className="text-xs text-white/70">{tag}</span>
                <button onClick={() => removeTag(tag)} className="ml-1 text-white/40 hover:text-red-400 transition-colors">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
          
          <div className="flex gap-2">
            <input
              type="text"
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
              placeholder="输入标签，如：科技、心理学..."
              className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:border-cyber-lime/50"
            />
            <button onClick={addTag} disabled={!newTag.trim()} className="px-4 py-2 bg-emerald-700 hover:bg-emerald-600 disabled:bg-white/10 disabled:text-white/30 rounded-xl text-white text-sm font-medium transition-colors">
              添加
            </button>
          </div>
          <div className="mt-3">
            <p className="text-[10px] text-white/30 mb-2">推荐标签：</p>
            <div className="flex flex-wrap gap-1.5">
              {['科技', '心理学', '经济学', '哲学', '商业', '逻辑学', '神经科学', '历史', '物理学', '社会学'].filter(t => !userTags.includes(t)).slice(0, 6).map((tag, i) => (
                <button key={i} onClick={() => setNewTag(tag)} className="px-2 py-1 bg-white/5 hover:bg-white/10 rounded-full text-[10px] text-white/50 transition-colors">
                  +{tag}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 错误状态 */}
      {error && !loading && (
        <div className="flex flex-col items-center justify-center py-12 bg-white/5 rounded-2xl border border-white/10">
          <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center mb-3">
            <svg className="w-6 h-6 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <p className="text-red-400 text-sm mb-3">{error}</p>
          <button onClick={() => generateInsights(false)} className="px-4 py-2 bg-white/10 hover:bg-white/15 rounded-xl text-white text-sm transition-colors">重试</button>
        </div>
      )}

      {/* 空状态 */}
      {!showSaved && cards.length === 0 && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 bg-white/5 rounded-2xl border border-white/10">
          <div className="w-16 h-16 rounded-full bg-cyber-lime/10 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          </div>
          <h3 className="text-white font-medium mb-2">开始你的知识策展</h3>
          <p className="text-white/50 text-sm text-center mb-4 max-w-xs">AI 将根据你的兴趣领域，从权威来源提取高价值知识</p>
          <button onClick={() => generateInsights(false)} className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-600 rounded-xl text-white font-medium transition-colors">
            开始策展
          </button>
        </div>
      )}

      {/* 加载中 */}
      {!showSaved && loading && cards.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 bg-white/5 rounded-2xl border border-white/10">
          <div className="w-12 h-12 rounded-full border-4 border-cyber-lime/30 border-t-cyber-lime animate-spin mb-4" />
          <p className="text-white/70 text-sm">AI 正在策展知识...</p>
          <p className="text-white/40 text-xs mt-1">卡片将逐张呈现</p>
        </div>
      )}

      {/* 卡片轮播 - 待处理 */}
      {!showSaved && cards.length > 0 && (
        <div className="relative pb-16">
          <div
            ref={cardsContainerRef}
            className="relative h-[480px] overflow-hidden select-none"
            style={{ perspective: '1200px', perspectiveOrigin: 'center center', touchAction: 'none' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={handleCardButtonClick}
          >
            {cards.map((card, index) => renderCard(card, index, cards.length, false))}
          </div>
          {cards.length > 1 && (
            <div className="absolute bottom-0 left-0 right-0">
              <div className="flex justify-center gap-2">
                {cards.map((_, index) => (
                  <button key={index} onClick={() => setCurrentIndex(index)} className={`w-2 h-2 rounded-full transition-all ${index === currentIndex ? 'bg-cyber-lime w-6' : 'bg-white/30 hover:bg-white/50'}`} />
                ))}
              </div>
              <p className="text-center text-white/30 text-xs mt-2">← 左右滑动翻页 →</p>
            </div>
          )}
        </div>
      )}

      {/* 已归档列表 */}
      {showSaved && (
        savedCards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 bg-white/5 rounded-2xl border border-white/10">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-white/30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <p className="text-white/50 text-sm">暂无归档的卡片</p>
            <p className="text-white/30 text-xs mt-1">在待处理中点击"归档保存"</p>
          </div>
        ) : (
          <div className="relative pb-16">
            <div
              ref={savedCardsContainerRef}
              className="relative h-[480px] overflow-hidden select-none"
              style={{ perspective: '1200px', perspectiveOrigin: 'center center', touchAction: 'none' }}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              onClick={handleCardButtonClick}
            >
              {savedCards.map((card, index) => renderCard(card, index, savedCards.length, true))}
            </div>
            {savedCards.length > 1 && (
              <div className="absolute bottom-0 left-0 right-0">
                <div className="flex justify-center gap-2">
                  {savedCards.map((_, index) => (
                    <button key={index} onClick={() => setCurrentIndex(index)} className={`w-2 h-2 rounded-full transition-all ${index === currentIndex ? 'bg-cyber-lime w-6' : 'bg-white/30 hover:bg-white/50'}`} />
                  ))}
                </div>
                <p className="text-center text-white/30 text-xs mt-2">← 左右滑动翻页 →</p>
              </div>
            )}
          </div>
        )
      )}


      {/* Toast */}
      {toast && createPortal(
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[9999] px-4 py-2 bg-white/10 backdrop-blur-xl rounded-full text-white text-sm border border-white/20 animate-fade-in">
          {toast}
        </div>,
        document.body
      )}
    </div>
  );
};

export default DailyInsights;
