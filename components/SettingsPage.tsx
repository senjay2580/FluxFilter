import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import IntervalReminder from './IntervalReminder';
import TodoList from './TodoList';
import VideoCollector from './VideoCollector';
import DevCommunity from './DevCommunity';

export type SettingsView = 'main' | 'todo' | 'reminder' | 'collector' | 'devcommunity';

const EXTERNAL_TRANSCRIPT_SYSTEM_URL = import.meta.env.VITE_TRANSCRIPT_SYSTEM_URL || 'http://localhost:3001';

interface SettingsPageProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: SettingsView;
  onOpenNotes?: () => void;
  onOpenLearningLog?: () => void;
  onOpenResourceCenter?: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ 
  isOpen, onClose, initialView = 'main', onOpenNotes, onOpenLearningLog, onOpenResourceCenter 
}) => {
  const [currentView, setCurrentView] = useState<SettingsView>(initialView);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => { if (isOpen) setCurrentView(initialView); }, [isOpen, initialView]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleNavigateToTranscriptSystem = useCallback(async () => {
    window.open(EXTERNAL_TRANSCRIPT_SYSTEM_URL, '_blank');
    showToast('正在跳转...');
  }, [showToast]);

  if (!isOpen) return null;

  const handleBack = () => {
    if (currentView === 'main') onClose();
    else setCurrentView('main');
  };

  const getTitle = () => {
    switch (currentView) {
      case 'todo': return '待办事项';
      case 'reminder': return '间歇提醒';
      case 'collector': return '视频收藏夹';
      case 'devcommunity': return '开发者社区';
      default: return '设置';
    }
  };

  // 菜单项组件
  const MenuItem = ({ 
    icon, title, desc, color, gradient, onClick, external 
  }: { 
    icon: React.ReactNode; title: string; desc: string; color: string; gradient?: string; onClick: () => void; external?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`w-full p-4 ${gradient || 'bg-white/5 hover:bg-white/10'} border border-white/10 rounded-2xl transition-all active:scale-[0.98] text-left group`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center transition-transform group-hover:scale-110`}>
          {icon}
        </div>
        <div className="flex-1">
          <h3 className="text-white font-medium">{title}</h3>
          <p className="text-gray-500 text-sm">{desc}</p>
        </div>
        {external ? (
          <svg className="w-5 h-5 text-gray-500 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
        ) : (
          <svg className="w-5 h-5 text-gray-500 transition-transform group-hover:translate-x-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        )}
      </div>
    </button>
  );

  // 分类标题
  const SectionTitle = ({ title }: { title: string }) => (
    <div className="flex items-center gap-3 px-1 pt-4 pb-2">
      <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{title}</span>
      <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
    </div>
  );

  return createPortal(
    <div className="fixed inset-0 z-[99998] bg-cyber-dark overflow-hidden">
      {/* 背景 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyber-lime/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-purple-500/5 rounded-full blur-[80px]" />
      </div>

      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 bg-cyber-dark/80 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3 safe-area-top mt-3">
          <button onClick={handleBack} className="p-2 -ml-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-all active:scale-95">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-lg">{getTitle()}</h1>
            <p className="text-gray-500 text-xs">个性化你的使用体验</p>
          </div>
          {currentView === 'collector' && (
            <button
              onClick={() => { window.open('https://www.bilibili.com', '_blank'); showToast('在B站复制视频链接后返回粘贴'); }}
              className="flex items-center gap-1.5 px-3 py-2 bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/30 rounded-xl transition-all active:scale-95"
            >
              <span className="text-pink-400 text-sm font-medium">B站</span>
            </button>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="h-[calc(100vh-60px)] overflow-y-auto">
        {currentView === 'main' && (
          <div className="p-4 space-y-1">
            {/* 效率工具 */}
            <SectionTitle title="效率工具" />
            
            <MenuItem
              icon={<svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>}
              title="待办事项"
              desc="管理任务，提升效率"
              color="bg-blue-500/20"
              onClick={() => setCurrentView('todo')}
            />
            
            <MenuItem
              icon={<svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>}
              title="间歇提醒"
              desc="专注计时，定时休息"
              color="bg-amber-500/20"
              onClick={() => setCurrentView('reminder')}
            />

            {/* 内容管理 */}
            <SectionTitle title="内容管理" />
            
            <MenuItem
              icon={<svg className="w-6 h-6 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>}
              title="视频收藏夹"
              desc="批量导入B站视频"
              color="bg-cyber-lime/20"
              onClick={() => setCurrentView('collector')}
            />
            
            <MenuItem
              icon={<svg className="w-6 h-6 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>}
              title="笔记"
              desc="记录灵感，整理思路"
              color="bg-gradient-to-br from-purple-500/20 to-pink-500/20"
              onClick={() => { onClose(); onOpenNotes?.(); }}
            />

            {/* 学习中心 */}
            <SectionTitle title="学习中心" />
            
            <MenuItem
              icon={<svg className="w-6 h-6 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"/></svg>}
              title="学习日志"
              desc="记录视频学习总结"
              color="bg-gradient-to-br from-purple-500/30 to-indigo-500/30"
              gradient="bg-gradient-to-r from-purple-500/10 to-indigo-500/10 hover:from-purple-500/20 hover:to-indigo-500/20 border-purple-500/20"
              onClick={() => { onOpenLearningLog?.(); onClose(); }}
            />
            
            <MenuItem
              icon={<svg className="w-6 h-6 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><circle cx="11" cy="11" r="2"/></svg>}
              title="视频下载 & 文案转写"
              desc="跳转到专业转写系统"
              color="bg-gradient-to-br from-cyber-lime/30 to-emerald-500/30"
              gradient="bg-gradient-to-r from-cyber-lime/10 to-emerald-500/10 hover:from-cyber-lime/20 hover:to-emerald-500/20 border-cyber-lime/20"
              onClick={handleNavigateToTranscriptSystem}
              external
            />

            {/* 资源库 */}
            <SectionTitle title="资源库" />
            
            <MenuItem
              icon={<svg className="w-6 h-6 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>}
              title="资源中心"
              desc="管理常用网站和书签"
              color="bg-gradient-to-br from-cyan-500/30 to-blue-500/30"
              gradient="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 hover:from-cyan-500/20 hover:to-blue-500/20 border-cyan-500/20"
              onClick={() => { onOpenResourceCenter?.(); onClose(); }}
            />

            {/* 开发者社区 */}
            <SectionTitle title="开发者社区" />
            
            <MenuItem
              icon={<svg className="w-6 h-6 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>}
              title="开发者热点"
              desc="GitHub 热门 · Stack Overflow · HelloGitHub"
              color="bg-gradient-to-br from-orange-500/30 to-red-500/30"
              gradient="bg-gradient-to-r from-orange-500/10 to-red-500/10 hover:from-orange-500/20 hover:to-red-500/20 border-orange-500/20"
              onClick={() => setCurrentView('devcommunity')}
            />
          </div>
        )}

        {currentView === 'todo' && <div className="p-4"><TodoList embedded timeFilter="all" /></div>}
        {currentView === 'reminder' && <div className="p-4"><IntervalReminder /></div>}
        {currentView === 'collector' && <div className="p-4"><VideoCollector /></div>}
        {currentView === 'devcommunity' && <div className="p-4"><DevCommunity /></div>}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/90 border border-white/20 rounded-full text-white text-sm z-[99999]" style={{ animation: 'slideUp 0.3s ease-out' }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
};

export default SettingsPage;
