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
  const [detailCard, setDetailCard] = useState<InsightCard | null>(null);
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

  // 在卡片容器上阻止事件冒泡到 App.tsx 的 Tab 切换
  useEffect(() => {
    const stopPropagation = (e: TouchEvent) => {
      e.stopPropagation();
    };

    const container1 = cardsContainerRef.current;
    const container2 = savedCardsContainerRef.current;
    
    // 在卡片容器上阻止冒泡，这样卡片滑动正常工作，但不会触发 App.tsx 的 Tab 切换
    if (container1) {
      container1.addEventListener('touchstart', stopPropagation, { passive: true });
      container1.addEventListener('touchmove', stopPropagation, { passive: true });
      container1.addEventListener('touchend', stopPropagation, { passive: true });
    }
    if (container2) {
      container2.addEventListener('touchstart', stopPropagation, { passive: true });
      container2.addEventListener('touchmove', stopPropagation, { passive: true });
      container2.addEventListener('touchend', stopPropagation, { passive: true });
    }
    
    return () => {
      if (container1) {
        container1.removeEventListener('touchstart', stopPropagation);
        container1.removeEventListener('touchmove', stopPropagation);
        container1.removeEventListener('touchend', stopPropagation);
      }
      if (container2) {
        container2.removeEventListener('touchstart', stopPropagation);
        container2.removeEventListener('touchmove', stopPropagation);
        container2.removeEventListener('touchend', stopPropagation);
      }
    };
  }, [showSaved]);

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

  // 滑动处理
  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    setStartX(e.touches[0].clientX);
    dragStateRef.current = { isDragging: true, startX: e.touches[0].clientX };
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    // 不在这里调用 preventDefault，由原生事件监听器处理
    setOffsetX(e.touches[0].clientX - startX);
  };
  const handleTouchEnd = () => {
    if (!isDragging) return;
    setIsDragging(false);
    dragStateRef.current.isDragging = false;
    const threshold = 80;
    const displayCards = showSaved ? savedCards : cards;
    if (offsetX > threshold && currentIndex > 0) setCurrentIndex(currentIndex - 1);
    else if (offsetX < -threshold && currentIndex < displayCards.length - 1) setCurrentIndex(currentIndex + 1);
    setOffsetX(0);
  };
  const handleMouseDown = (e: React.MouseEvent) => { setIsDragging(true); setStartX(e.clientX); };
  const handleMouseMove = (e: React.MouseEvent) => { if (isDragging) setOffsetX(e.clientX - startX); };
  const handleMouseUp = () => handleTouchEnd();

  // 使用原生事件监听器来阻止默认行为（解决 passive event listener 问题）
  useEffect(() => {
    const handleNativeTouchMove = (e: TouchEvent) => {
      if (dragStateRef.current.isDragging) {
        e.preventDefault();
      }
    };

    const container1 = cardsContainerRef.current;
    const container2 = savedCardsContainerRef.current;
    
    if (container1) {
      container1.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    }
    if (container2) {
      container2.addEventListener('touchmove', handleNativeTouchMove, { passive: false });
    }
    
    return () => {
      if (container1) {
        container1.removeEventListener('touchmove', handleNativeTouchMove);
      }
      if (container2) {
        container2.removeEventListener('touchmove', handleNativeTouchMove);
      }
    };
  }, [showSaved]);


  // 渲染单张卡片
  const renderCard = (card: InsightCard, index: number, total: number, isSaved = false) => {
    const config = CATEGORY_CONFIG[card.category] || { label: card.category, icon: '📌' };
    const isActive = index === currentIndex;
    const offset = index - currentIndex;
    
    // 只显示当前卡片和相邻的两张
    if (Math.abs(offset) > 1) return null;
    
    // 计算位置：当前卡片居中，相邻卡片露出边缘
    const getTransform = () => {
      const dragOffset = isDragging ? offsetX * 0.6 : 0;
      if (isActive) {
        return `translateX(calc(-50% + ${dragOffset}px)) scale(1)`;
      }
      // 相邻卡片：露出约 40px 边缘
      const edgeOffset = offset > 0 ? 'calc(50% - 40px)' : 'calc(-150% + 40px)';
      return `translateX(calc(${edgeOffset} + ${dragOffset}px)) scale(0.92)`;
    };
    
    return (
      <div
        key={card.id}
        className="absolute left-1/2 transition-all duration-300 ease-out"
        style={{
          width: 'calc(100% - 32px)',
          transform: getTransform(),
          opacity: isActive ? 1 : 0.5,
          zIndex: isActive ? 10 : 5,
          pointerEvents: isActive ? 'auto' : 'none',
          filter: isActive ? 'none' : 'blur(0.5px)',
        }}
      >
        <div className="bg-white/5 backdrop-blur-xl rounded-2xl border border-white/10 p-5 min-h-[340px] flex flex-col relative">
          {/* 右上角操作区 */}
          <div className="absolute top-4 right-4 flex items-center gap-2">
            <button onClick={() => setDetailCard(card)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors" title="查看详情">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7Z" />
              </svg>
            </button>
            <button onClick={() => copyCard(card)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-colors" title="复制">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
          </div>

          {/* 头部 */}
          <div className="flex items-center gap-2 mb-3 pr-20">
            <span className="text-2xl">{config.icon}</span>
            <span className="text-xs font-medium text-white/60 uppercase tracking-wider">{config.label}</span>
            <span className="text-[10px] text-white/30 ml-auto">{index + 1}/{total}</span>
          </div>

          {/* 标题 */}
          <h3 className="text-lg font-bold text-white mb-2 line-clamp-2">{card.title}</h3>

          {/* 来源 */}
          <p className="text-xs text-white/40 mb-3 flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
            </svg>
            {card.source}
          </p>

          {/* 核心内容 */}
          <div className="flex-1">
            <p className="text-sm text-white/70 leading-relaxed line-clamp-4">{card.core_content}</p>
          </div>

          {/* 标签 */}
          <div className="flex flex-wrap gap-1.5 mt-3 mb-4">
            {card.tags.slice(0, 4).map((tag, i) => (
              <span key={i} className="px-2 py-0.5 bg-white/10 rounded-full text-[10px] text-white/50">#{tag}</span>
            ))}
          </div>

          {/* 底部操作栏 */}
          <div className="flex items-center justify-between pt-3 border-t border-white/5">
            {isSaved ? (
              <>
                <span className="text-[10px] text-white/30">已归档</span>
                <button onClick={() => removeSavedCard(card.id)} className="flex items-center gap-1.5 px-3 py-2 hover:bg-red-500/10 rounded-lg text-white/40 hover:text-red-400 text-xs transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  移除
                </button>
              </>
            ) : (
              <>
                <button onClick={() => deleteCard(card.id)} className="flex items-center gap-1.5 px-3 py-2 hover:bg-white/5 rounded-lg text-white/40 hover:text-white/60 text-xs transition-colors">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                  跳过
                </button>
                <button onClick={() => archiveCard(card)} className="flex items-center gap-1.5 px-5 py-2.5 bg-emerald-700 text-white rounded-xl text-xs font-medium transition-all hover:bg-emerald-600 active:scale-95">
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                  </svg>
                  归档保存
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };


  return (
    <div id="daily-insights-container" className="min-h-[500px]" style={{ touchAction: 'pan-y pinch-zoom', overscrollBehaviorX: 'none' }}>
      {/* 兴趣标签区域 */}
      <div className="mb-4 p-4 bg-white/5 rounded-2xl border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
              <line x1="7" y1="7" x2="7.01" y2="7" />
            </svg>
            <span className="text-sm font-medium text-white">我的兴趣领域</span>
          </div>
          <button onClick={() => setShowTagEditor(!showTagEditor)} className="text-xs text-cyber-lime hover:text-cyber-lime/80 transition-colors">
            {showTagEditor ? '完成' : '编辑'}
          </button>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {userTags.length === 0 && !showTagEditor && (
            <span className="text-xs text-white/40">点击编辑添加感兴趣的领域...</span>
          )}
          {userTags.map((tag, i) => (
            <div key={i} className="flex items-center gap-1 px-3 py-1.5 bg-white/10 rounded-full">
              <span className="text-xs text-white/70">{tag}</span>
              {showTagEditor && (
                <button onClick={() => removeTag(tag)} className="ml-1 text-white/40 hover:text-red-400 transition-colors">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
        
        {showTagEditor && (
          <>
            <div className="flex gap-2 mt-3">
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
          </>
        )}
      </div>

      {/* 头部切换和操作 */}
      <div className="flex flex-col gap-3 mb-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowSaved(false); setCurrentIndex(0); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${!showSaved ? 'bg-emerald-700 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
          >
            {loading && !showSaved && <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            待处理
            {cards.length > 0 && <span className={`px-1.5 py-0.5 rounded text-[10px] ${!showSaved ? 'bg-white/20' : 'bg-white/10'}`}>{cards.length}</span>}
          </button>
          <button
            onClick={() => { setShowSaved(true); setCurrentIndex(0); }}
            className={`px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-2 ${showSaved ? 'bg-emerald-700 text-white' : 'bg-white/5 text-white/60 hover:bg-white/10'}`}
          >
            已归档
            {savedCards.length > 0 && <span className={`px-1.5 py-0.5 rounded text-[10px] ${showSaved ? 'bg-white/20' : 'bg-white/10'}`}>{savedCards.length}</span>}
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
        <>
          <div
            ref={cardsContainerRef}
            className="relative h-[400px] overflow-hidden select-none"
            style={{ touchAction: 'none' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          >
            {cards.map((card, index) => renderCard(card, index, cards.length, false))}
          </div>
          {cards.length > 1 && (
            <>
              <div className="flex justify-center gap-2 mt-4">
                {cards.map((_, index) => (
                  <button key={index} onClick={() => setCurrentIndex(index)} className={`w-2 h-2 rounded-full transition-all ${index === currentIndex ? 'bg-cyber-lime w-6' : 'bg-white/30 hover:bg-white/50'}`} />
                ))}
              </div>
              <p className="text-center text-white/30 text-xs mt-3">← 左右滑动查看更多 →</p>
            </>
          )}
        </>
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
          <>
            <div
              ref={savedCardsContainerRef}
              className="relative h-[400px] overflow-hidden select-none"
              style={{ touchAction: 'none' }}
              onTouchStart={handleTouchStart}
              onTouchMove={handleTouchMove}
              onTouchEnd={handleTouchEnd}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {savedCards.map((card, index) => renderCard(card, index, savedCards.length, true))}
            </div>
            {savedCards.length > 1 && (
              <div className="flex justify-center gap-2 mt-4">
                {savedCards.map((_, index) => (
                  <button key={index} onClick={() => setCurrentIndex(index)} className={`w-2 h-2 rounded-full transition-all ${index === currentIndex ? 'bg-cyber-lime w-6' : 'bg-white/30 hover:bg-white/50'}`} />
                ))}
              </div>
            )}
          </>
        )
      )}


      {/* 详情弹窗 */}
      {detailCard && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setDetailCard(null)}>
          <div className="w-full max-w-md max-h-[80vh] overflow-y-auto bg-[#1a2634] rounded-2xl border border-white/10 p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{CATEGORY_CONFIG[detailCard.category]?.icon || '📌'}</span>
                <span className="text-xs font-medium text-white/60 uppercase tracking-wider">
                  {CATEGORY_CONFIG[detailCard.category]?.label || detailCard.category}
                </span>
              </div>
              <button onClick={() => setDetailCard(null)} className="p-1 hover:bg-white/10 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            <h2 className="text-xl font-bold text-white mb-3">{detailCard.title}</h2>
            <p className="text-sm text-white/40 mb-4 flex items-center gap-1.5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
              {detailCard.source}
            </p>
            <div className="mb-4">
              <h4 className="text-xs font-medium text-cyber-lime mb-2">💡 核心内容</h4>
              <p className="text-sm text-white/80 leading-relaxed">{detailCard.core_content}</p>
            </div>
            <div className="mb-4 p-3 bg-cyber-lime/10 rounded-xl border border-cyber-lime/20">
              <h4 className="text-xs font-medium text-cyber-lime mb-2">🎯 行动启示</h4>
              <p className="text-sm text-white/80">{detailCard.takeaway}</p>
            </div>
            <div className="flex flex-wrap gap-2 mb-5">
              {detailCard.tags.map((tag, i) => (
                <span key={i} className="px-2.5 py-1 bg-white/10 rounded-full text-xs text-white/60">#{tag}</span>
              ))}
            </div>
            <button onClick={() => { copyCard(detailCard); }} className="w-full py-2.5 bg-white/10 hover:bg-white/15 rounded-xl text-white text-sm font-medium transition-colors flex items-center justify-center gap-1.5">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              复制内容
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && createPortal(
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 bg-white/10 backdrop-blur-xl rounded-full text-white text-sm border border-white/20 animate-fade-in">
          {toast}
        </div>,
        document.body
      )}
    </div>
  );
};

export default DailyInsights;
