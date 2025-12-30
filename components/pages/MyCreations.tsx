import React, { useState, useEffect } from 'react';
import MyMusic from '../music/MyMusic';

type CreationType = 'prompts' | 'music' | 'articles' | 'images' | 'videos' | 'projects' | 'ideas';

interface MyCreationsProps {
  isOpen: boolean;
  onClose: () => void;
}

const MyCreations: React.FC<MyCreationsProps> = ({ isOpen, onClose }) => {
  const [activeType, setActiveType] = useState<CreationType | null>(null);
  const [isMusicOpen, setIsMusicOpen] = useState(false);

  useEffect(() => {
    const handleOpenMusicPlayer = () => {
      setIsMusicOpen(true);
      setActiveType('music');
    };
    window.addEventListener('open-music-player', handleOpenMusicPlayer);
    return () => window.removeEventListener('open-music-player', handleOpenMusicPlayer);
  }, []);

  if (!isOpen) {
    return <MyMusic isOpen={false} onClose={() => setIsMusicOpen(false)} />;
  }

  // 创作类型配置
  const creationTypes: {
    id: CreationType;
    title: string;
    desc: string;
  }[] = [
    { id: 'prompts', title: '我的提示词', desc: 'AI Prompts 收藏' },
    { id: 'music', title: '我的音乐', desc: '创作 & 收藏' },
    { id: 'articles', title: '我的文章', desc: '博客 & 笔记' },
    { id: 'images', title: '我的图片', desc: 'AI 生成 & 设计' },
    { id: 'videos', title: '我的视频', desc: '作品 & 剪辑' },
    { id: 'projects', title: '我的项目', desc: '代码 & 作品集' },
    { id: 'ideas', title: '我的灵感', desc: '创意 & 想法' },
  ];

  // 卡片配色方案 - 高级渐变色（与墨绿背景融合）
  const cardThemes: Record<CreationType, { gradient: string; glow: string; iconColor: string; icon: React.ReactNode }> = {
    prompts: { 
      gradient: 'linear-gradient(135deg, rgba(251,191,36,0.12) 0%, rgba(245,158,11,0.06) 40%, transparent 100%)',
      glow: 'rgba(251,191,36,0.15)',
      iconColor: '#fbbf24',
      icon: (
        <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M7 8h10M7 12h6m-6 4h8" strokeLinecap="round" />
          <path d="M12 3c-1.2 0-2.4.6-3 1.5A3.5 3.5 0 0 0 5 8v10a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3V8a3.5 3.5 0 0 0-4-3.5c-.6-.9-1.8-1.5-3-1.5z" />
        </svg>
      )
    },
    music: { 
      gradient: 'linear-gradient(135deg, rgba(236,72,153,0.15) 0%, rgba(168,85,247,0.08) 40%, transparent 100%)',
      glow: 'rgba(236,72,153,0.2)',
      iconColor: '#ec4899',
      icon: (
        <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
          <path d="M9 18V5l12-2v13" />
        </svg>
      )
    },
    articles: { 
      gradient: 'linear-gradient(135deg, rgba(6,182,212,0.12) 0%, rgba(20,184,166,0.06) 40%, transparent 100%)',
      glow: 'rgba(6,182,212,0.15)',
      iconColor: '#06b6d4',
      icon: (
        <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z" />
          <path d="M6 8h12M6 12h12M6 16h8" strokeLinecap="round" />
        </svg>
      )
    },
    images: { 
      gradient: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(168,85,247,0.08) 40%, transparent 100%)',
      glow: 'rgba(139,92,246,0.15)',
      iconColor: '#8b5cf6',
      icon: (
        <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="8.5" cy="8.5" r="1.5" />
          <path d="M21 15l-5-5L5 21" />
        </svg>
      )
    },
    videos: { 
      gradient: 'linear-gradient(135deg, rgba(239,68,68,0.12) 0%, rgba(249,115,22,0.06) 40%, transparent 100%)',
      glow: 'rgba(239,68,68,0.15)',
      iconColor: '#ef4444',
      icon: (
        <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="2" y="4" width="20" height="16" rx="3" />
          <path d="M10 9l5 3-5 3V9z" fill="currentColor" opacity="0.3" />
          <path d="M10 9l5 3-5 3V9z" />
        </svg>
      )
    },
    projects: { 
      gradient: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(52,211,153,0.06) 40%, transparent 100%)',
      glow: 'rgba(16,185,129,0.15)',
      iconColor: '#10b981',
      icon: (
        <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 3h7l2 2h9a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
          <path d="M12 11v6M9 14h6" strokeLinecap="round" />
        </svg>
      )
    },
    ideas: { 
      gradient: 'linear-gradient(135deg, rgba(14,165,233,0.12) 0%, rgba(56,189,248,0.06) 40%, transparent 100%)',
      glow: 'rgba(14,165,233,0.15)',
      iconColor: '#0ea5e9',
      icon: (
        <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M9 21h6M12 3a6 6 0 0 0-6 6c0 2.22 1.21 4.16 3 5.19V17a1 1 0 0 0 1 1h4a1 1 0 0 0 1-1v-2.81c1.79-1.03 3-2.97 3-5.19a6 6 0 0 0-6-6z" />
          <path d="M12 3v1M4.22 10H3M5.64 5.64l-.7-.7M18.36 5.64l.7-.7M21 10h-1.22" strokeLinecap="round" />
        </svg>
      )
    },
  };

  // 创作卡片组件 - 高级渐变玻璃风格
  const CreationCard = ({
    item,
    className = '',
    layout = 'bottom-left',
  }: {
    item: typeof creationTypes[0];
    className?: string;
    layout?: 'bottom-left' | 'center' | 'left-center';
  }) => {
    const theme = cardThemes[item.id];
    
    return (
      <button
        onClick={() => {
          if (item.id === 'music') {
            setIsMusicOpen(true);
          }
          setActiveType(item.id);
        }}
        className={`relative overflow-hidden rounded-2xl transition-all duration-300 active:scale-[0.98] group ${className}`}
        style={{
          background: theme.gradient,
          boxShadow: `
            0 4px 20px rgba(0,0,0,0.3),
            0 0 40px ${theme.glow},
            inset 0 1px 0 rgba(255,255,255,0.08)
          `,
          border: '1px solid rgba(255,255,255,0.08)',
        }}
      >
        {/* 顶部高光 */}
        <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
        
        {/* hover 光晕增强 */}
        <div 
          className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{ 
            background: `radial-gradient(circle at 30% 30%, ${theme.glow}, transparent 60%)`,
          }}
        />

        {/* 内容布局 */}
        <div className={`relative z-10 h-full flex ${
          layout === 'center' ? 'flex-col items-center justify-center text-center' :
          layout === 'left-center' ? 'items-center justify-between' :
          'flex-col justify-end'
        } p-4`}>
          {layout === 'left-center' ? (
            <>
              <div>
                <h3 className="text-white font-semibold text-base tracking-wide">{item.title}</h3>
                <p className="text-white/50 text-xs mt-0.5">{item.desc}</p>
              </div>
              <div 
                className="w-9 h-9 opacity-60 group-hover:opacity-80 transition-all duration-300 group-hover:scale-110 shrink-0"
                style={{ color: theme.iconColor }}
              >
                {theme.icon}
              </div>
            </>
          ) : layout === 'center' ? (
            <>
              <div 
                className="w-11 h-11 mb-2 opacity-70 group-hover:opacity-90 transition-all duration-300 group-hover:scale-110"
                style={{ color: theme.iconColor }}
              >
                {theme.icon}
              </div>
              <h3 className="text-white font-semibold text-base tracking-wide">{item.title}</h3>
              <p className="text-white/50 text-xs mt-0.5">{item.desc}</p>
            </>
          ) : (
            <>
              <div 
                className="absolute top-3 right-3 w-7 h-7 opacity-50 group-hover:opacity-70 transition-all duration-300"
                style={{ color: theme.iconColor }}
              >
                {theme.icon}
              </div>
              <div>
                <h3 className="text-white font-semibold text-base tracking-wide">{item.title}</h3>
                <p className="text-white/50 text-xs mt-0.5">{item.desc}</p>
              </div>
            </>
          )}
        </div>
      </button>
    );
  };

  // 子页面内容
  const renderSubPage = () => {
    if (activeType === 'music') {
      return (
        <MyMusic 
          isOpen={isMusicOpen} 
          onClose={() => {
            setIsMusicOpen(false);
            setActiveType(null);
          }} 
        />
      );
    }

    const currentType = creationTypes.find(t => t.id === activeType);
    if (!currentType) return null;
    const theme = cardThemes[activeType];

    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div 
          className="w-20 h-20 rounded-3xl flex items-center justify-center mb-4 relative overflow-hidden"
          style={{ 
            background: 'linear-gradient(135deg, rgba(30,30,45,0.9) 0%, rgba(20,20,30,0.95) 100%)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          <div 
            className="absolute inset-0 opacity-30"
            style={{ background: `radial-gradient(circle at 30% 30%, ${theme.glow}, transparent 70%)` }}
          />
          <span className="text-3xl relative z-10">📁</span>
        </div>
        <h2 className="text-white/90 text-xl font-semibold mb-2 tracking-wide">{currentType.title}</h2>
        <p className="text-white/40 text-sm mb-6">功能开发中，敬请期待...</p>
        <button
          onClick={() => setActiveType(null)}
          className="px-6 py-2.5 rounded-2xl text-white/80 text-sm transition-all hover:text-white"
          style={{
            background: 'linear-gradient(135deg, rgba(30,30,45,0.9) 0%, rgba(20,20,30,0.95) 100%)',
            boxShadow: '0 2px 12px rgba(0,0,0,0.3)',
            border: '1px solid rgba(255,255,255,0.06)',
          }}
        >
          返回
        </button>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto relative z-10">
        {activeType ? (
          renderSubPage()
        ) : (
          <div className="p-4 pb-20">
            {/* 不规则艺术化布局 */}
            <div className="flex flex-col gap-4">
              {/* Row 1: 提示词 - 横向布局 */}
              <CreationCard item={creationTypes[0]} className="h-20 w-full" layout="left-center" />
              
              {/* Row 2: 左边音乐（高），右边文章+图片 */}
              <div className="flex gap-4">
                <div className="flex-1">
                  <CreationCard item={creationTypes[1]} className="h-48 w-full" layout="center" />
                </div>
                <div className="flex-1 flex flex-col gap-3">
                  <CreationCard item={creationTypes[2]} className="h-[90px] w-full" layout="left-center" />
                  <CreationCard item={creationTypes[3]} className="h-[90px] w-full" layout="left-center" />
                </div>
              </div>
              
              {/* Row 3: 视频 - 横向布局 */}
              <CreationCard item={creationTypes[4]} className="h-24 w-full" layout="left-center" />
              
              {/* Row 4: 项目 + 灵感 */}
              <div className="flex gap-4">
                <div className="flex-[1.2]">
                  <CreationCard item={creationTypes[5]} className="h-32 w-full" layout="center" />
                </div>
                <div className="flex-1">
                  <CreationCard item={creationTypes[6]} className="h-28 w-full mt-2" layout="center" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default MyCreations;
