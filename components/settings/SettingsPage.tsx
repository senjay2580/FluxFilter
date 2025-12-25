import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import IntervalReminder from '../tools/IntervalReminder';
import TodoList from '../tools/TodoList';
import VideoCollector from '../video/VideoCollector';
import DevCommunity from '../pages/DevCommunity';
import VideoDownloader from '../tools/VideoDownloader';
import AudioTranscriber from '../tools/AudioTranscriber';
import DailyInsights from '../tools/DailyInsights';
import InsightFloatingBall from '../shared/InsightFloatingBall';

export type SettingsView = 'main' | 'todo' | 'reminder' | 'collector' | 'devcommunity' | 'downloader' | 'transcriber' | 'insights';

interface SettingsPageProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: SettingsView;
  onOpenNotes?: () => void;
  onOpenLearningLog?: () => void;
  onOpenResourceCenter?: () => void;
  onNavigate?: (page: string) => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({
  isOpen, onClose, initialView = 'main', onOpenNotes, onOpenLearningLog, onOpenResourceCenter, onNavigate
}) => {
  const [currentView, setCurrentView] = useState<SettingsView>(initialView);
  const [toast, setToast] = useState<string | null>(null);
  
  // 策展状态
  const [insightStatus, setInsightStatus] = useState<'idle' | 'loading' | 'done'>('idle');

  useEffect(() => { if (isOpen) setCurrentView(initialView); }, [isOpen, initialView]);

  // 监听策展状态
  useEffect(() => {
    const handleInsightStatus = (e: CustomEvent<{ status: 'loading' | 'done' | 'idle' }>) => {
      setInsightStatus(e.detail.status);
      // 3秒后自动隐藏完成状态
      if (e.detail.status === 'done') {
        setTimeout(() => setInsightStatus('idle'), 3000);
      }
    };
    window.addEventListener('insight-status', handleInsightStatus as EventListener);
    return () => window.removeEventListener('insight-status', handleInsightStatus as EventListener);
  }, []);

  // 监听跳转到每日信息差事件
  useEffect(() => {
    const handleNavigateToInsights = () => {
      setCurrentView('insights');
    };
    window.addEventListener('navigate-to-insights', handleNavigateToInsights);
    return () => window.removeEventListener('navigate-to-insights', handleNavigateToInsights);
  }, []);

  // 监听下载视频事件
  useEffect(() => {
    const handleNavigateToDownloader = () => {
      setCurrentView('downloader');
      showToast('链接已复制，请粘贴到下载页面');
    };
    window.addEventListener('navigate-to-downloader', handleNavigateToDownloader);
    return () => window.removeEventListener('navigate-to-downloader', handleNavigateToDownloader);
  }, []);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

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
      case 'downloader': return '视频下载';
      case 'transcriber': return '音频转写';
      case 'insights': return '每日信息差';
      default: return '设置';
    }
  };

  // 菜单项组件 - 响应式：移动端网格，PC端列表
  const MenuItem = ({
    icon, title, desc, color, gradient, onClick, external
  }: {
    icon: React.ReactNode; title: string; desc: string; color: string; gradient?: string; onClick: () => void; external?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`relative p-4 ${gradient || 'bg-[#1a2634] hover:bg-[#1f2d3d]'} border border-white/10 rounded-xl transition-all active:scale-[0.97] text-left group
        flex flex-col gap-3 min-h-[100px]`}
    >
      {external && (
        <svg className="absolute top-2 right-2 w-3.5 h-3.5 text-gray-500 md:hidden" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      )}
      <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-2 md:mb-0 transition-transform group-hover:scale-110 flex-shrink-0`}>
        {icon}
      </div>
      <div className="flex-1 flex flex-col">
        <h3 className="text-white font-medium text-sm leading-tight">{title}</h3>
        <p className="text-gray-500 text-xs mt-0.5 line-clamp-1">{desc}</p>
      </div>
      {/* 箭头仅在hover时浮现 */}
      <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          {external ? (
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3" />
          ) : (
            <path d="M9 18l6-6-6-6" />
          )}
        </svg>
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
    <div className="fixed inset-0 z-[99998] bg-cyber-dark overflow-hidden flex flex-col">
      {/* 背景 */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyber-lime/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-purple-500/5 rounded-full blur-[80px]" />
      </div>

      {/* 顶部导航栏 */}
      <div className="relative z-20 bg-cyber-dark/80 backdrop-blur-xl border-b border-white/10 shrink-0">
        <div className="flex items-center gap-3 px-4 py-4">
          <button onClick={handleBack} className="p-2 -ml-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-all active:scale-95">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
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
      <div 
        className="flex-1 overflow-y-auto"
        style={{ overscrollBehaviorX: 'none' }}
      >
        {currentView === 'main' && (
          <div className="p-4 safe-area-bottom pb-20 max-w-6xl mx-auto w-full">
            {/* 效率工具 */}
            <SectionTitle title="效率工具" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <MenuItem
                icon={<svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>}
                title="待办事项"
                desc="管理任务，提升效率"
                color="bg-blue-500/20"
                onClick={() => setCurrentView('todo')}
              />
              <MenuItem
                icon={<svg className="w-5 h-5 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
                title="间歇提醒"
                desc="专注计时，定时休息"
                color="bg-amber-500/20"
                onClick={() => setCurrentView('reminder')}
              />
            </div>

            {/* 内容管理 */}
            <SectionTitle title="内容管理" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <MenuItem
                icon={<svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>}
                title="视频收藏夹"
                desc="批量导入B站视频"
                color="bg-cyber-lime/20"
                onClick={() => setCurrentView('collector')}
              />
              <MenuItem
                icon={<svg className="w-5 h-5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>}
                title="笔记"
                desc="记录灵感，整理思路"
                color="bg-purple-500/20"
                onClick={() => { onOpenNotes?.(); onClose(); }}
              />
            </div>

            {/* 学习中心 */}
            <SectionTitle title="学习中心" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <MenuItem
                icon={<svg className="w-5 h-5 text-indigo-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
                title="学习日志"
                desc="记录视频学习总结"
                color="bg-indigo-500/20"
                onClick={() => { onOpenLearningLog?.(); onClose(); }}
              />
              <MenuItem
                icon={<svg className="w-5 h-5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>}
                title="音频转写"
                desc="Groq Whisper · AI优化"
                color="bg-violet-500/20"
                onClick={() => setCurrentView('transcriber')}
              />
              <MenuItem
                icon={<svg className="w-5 h-5 text-rose-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>}
                title="每日信息差"
                desc="AI策展硬核知识"
                color="bg-rose-500/20"
                onClick={() => setCurrentView('insights')}
              />
            </div>

            {/* 资源 & 社区 */}
            <SectionTitle title="资源 & 社区" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <MenuItem
                icon={<svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>}
                title="资源中心"
                desc="管理常用网站和书签"
                color="bg-cyan-500/20"
                onClick={() => { onOpenResourceCenter?.(); onClose(); }}
              />
              <MenuItem
                icon={<svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></svg>}
                title="开发者热点"
                desc="GitHub · Stack Overflow"
                color="bg-orange-500/20"
                onClick={() => setCurrentView('devcommunity')}
              />
            </div>

            {/* 外部工具 */}
            <SectionTitle title="外部工具" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <MenuItem
                icon={<svg className="w-5 h-5 text-pink-400" viewBox="0 0 24 24" fill="currentColor"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.659.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906L17.813 4.653zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773H5.333zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z" /></svg>}
                title="B站下载"
                desc="解析B站视频并下载"
                color="bg-pink-500/20"
                onClick={() => setCurrentView('downloader')}
              />
            </div>
          </div>
        )}

        {currentView === 'todo' && <div className="p-4"><TodoList embedded timeFilter="all" /></div>}
        {currentView === 'reminder' && <div className="p-4"><IntervalReminder /></div>}
        {currentView === 'collector' && <div className="p-4"><VideoCollector /></div>}
        {currentView === 'devcommunity' && <div className="p-4"><DevCommunity /></div>}
        {currentView === 'downloader' && <div className="p-4"><VideoDownloader onNavigate={(page) => {
          if (page === 'transcriber') {
            setCurrentView('transcriber');
          } else if (onNavigate) {
            onNavigate(page);
          }
        }} /></div>}
        {currentView === 'transcriber' && <div className="p-4"><AudioTranscriber onNavigate={(page) => {
          if (page === 'video-downloader') {
            setCurrentView('downloader');
          } else if (onNavigate) {
            onNavigate(page);
          }
        }} /></div>}
        {currentView === 'insights' && <div className="p-4" style={{ touchAction: 'pan-y pinch-zoom' }}><DailyInsights /></div>}
      </div>

      {/* 策展悬浮球 - 仅在非insights页面时显示，支持拖动 */}
      {currentView !== 'insights' && (
        <InsightFloatingBall
          isLoading={insightStatus === 'loading'}
          isDone={insightStatus === 'done'}
          onClick={() => setCurrentView('insights')}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 px-4 py-2 bg-black/90 border border-white/20 rounded-full text-white text-sm z-[99999] animate-toast-in">
          {toast}
        </div>
      )}
    </div>,
    document.body
  );
};

export default SettingsPage;
