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
import { useSwipeBack } from '../../hooks/useSwipeBack';

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

  // 监听跳转到转写页面事件
  useEffect(() => {
    const handleNavigateToTranscriber = () => {
      setCurrentView('transcriber');
    };
    window.addEventListener('navigate-to-transcriber', handleNavigateToTranscriber);
    return () => window.removeEventListener('navigate-to-transcriber', handleNavigateToTranscriber);
  }, []);



  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleBack = useCallback(() => {
    if (currentView === 'main') onClose();
    else setCurrentView('main');
  }, [currentView, onClose]);

  // 左滑返回手势 - 在 insights 页面禁用（因为有卡片滑动）
  const { swipeState, ...swipeHandlers } = useSwipeBack({
    onBack: handleBack,
    threshold: 80,
    edgeWidth: 25
  });

  // 根据当前视图决定是否启用滑动返回
  const shouldEnableSwipeBack = currentView !== 'insights';

  if (!isOpen) return null;

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

  // 菜单项组件 - 彩色渐变卡片样式
  const MenuItem = ({
    icon, title, desc, gradient, onClick, external
  }: {
    icon: React.ReactNode; title: string; desc: string; gradient: string; onClick: () => void; external?: boolean;
  }) => (
    <button
      onClick={onClick}
      className={`relative p-4 ${gradient} rounded-2xl transition-all active:scale-[0.97] text-left group
        flex flex-col justify-between min-h-[120px] overflow-hidden shadow-lg`}
    >
      {/* 光泽效果 */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-transparent opacity-60 pointer-events-none" />

      {external && (
        <svg className="absolute top-3 right-3 w-3.5 h-3.5 text-white/50 z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      )}

      {/* 标题在上方 */}
      <div className="relative z-10">
        <h3 className="text-white font-bold text-base leading-tight drop-shadow-md">{title}</h3>
        <p className="text-white/80 text-xs mt-1 line-clamp-2 drop-shadow-sm">{desc}</p>
      </div>

      {/* 大图标在右下角 - 隐约显示 */}
      <div className="absolute -bottom-3 -right-3 w-20 h-20 opacity-30 text-white transition-all group-hover:opacity-50 group-hover:scale-110">
        {icon}
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
    <div className={`fixed inset-0 z-[99998] overflow-hidden flex flex-col ${currentView === 'insights' ? '' : ''}`}
      style={currentView === 'insights'
        ? { background: 'linear-gradient(180deg, #0a1628 0%, #0a1f3a 100%)' }
        : { background: '#080a09' }
      }
    >
      {/* 背景 - 非 insights 视图 - 仅在 PC 端启用复杂特效以节省移动端性能 */}
      {currentView !== 'insights' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden hidden lg:block">
          {/* 顶部主光源 - 深墨绿色 */}
          <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gradient-to-b from-emerald-900/40 via-emerald-950/20 to-transparent blur-3xl animate-glow-breathe" />

          {/* 左上角光斑 - 暗绿 */}
          <div className="absolute -top-20 -left-20 w-80 h-80 bg-emerald-950/50 rounded-full blur-[100px] animate-glow-float" />

          {/* 右上角光斑 - 深青绿 */}
          <div className="absolute -top-10 -right-10 w-72 h-72 bg-teal-950/40 rounded-full blur-[80px] animate-glow-float" style={{ animationDelay: '2s' }} />

          {/* 中间偏左光斑 */}
          <div className="absolute top-1/3 -left-20 w-96 h-96 bg-emerald-950/30 rounded-full blur-[120px] animate-glow-drift" />

          {/* 中间偏右光斑 */}
          <div className="absolute top-1/2 -right-32 w-80 h-80 bg-teal-950/25 rounded-full blur-[100px] animate-glow-drift" style={{ animationDelay: '3s' }} />

          {/* 底部光晕 - 移动端简化 */}
          <div className="absolute -bottom-20 left-1/3 w-[500px] h-64 bg-gradient-to-t from-emerald-950/30 via-teal-950/15 to-transparent blur-[80px] lg:animate-glow-drift" />

          {/* 装饰性光点 - 更暗淡 */}
          <div className="absolute top-1/4 left-1/4 w-1.5 h-1.5 bg-emerald-700/40 rounded-full blur-sm animate-twinkle" />
          <div className="absolute top-1/3 right-1/3 w-1 h-1 bg-teal-700/30 rounded-full blur-sm animate-twinkle" style={{ animationDelay: '1s' }} />
          <div className="absolute bottom-1/3 left-1/2 w-1.5 h-1.5 bg-emerald-800/30 rounded-full blur-sm animate-twinkle" style={{ animationDelay: '2s' }} />

          {/* 网格纹理 */}
          <div className="absolute inset-0 opacity-[0.015]" style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px)`,
            backgroundSize: '60px 60px'
          }} />
        </div>
      )}

      {/* insights 视图的水波背景 - 仅在 PC 端渲染，移动端由于波浪路径计算极其耗能且易引起闪烁，故禁用 */}
      {currentView === 'insights' && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden hidden lg:block">
          {/* 水面光斑效果 */}
          <div className="absolute inset-0 opacity-30">
            <div className="absolute top-0 left-0 right-0 h-40 bg-gradient-to-b from-cyan-500/20 to-transparent" />
          </div>

          {/* 波浪层1 - 浅青色 */}
          <div className="absolute bottom-0 left-0 right-0 h-[70%]">
            <svg className="absolute bottom-0 w-[200%] animate-wave-slow" viewBox="0 0 1440 320" preserveAspectRatio="none" style={{ height: '100%' }}>
              <path fill="url(#wave-gradient-1)" d="M0,192L48,197.3C96,203,192,213,288,229.3C384,245,480,267,576,250.7C672,235,768,181,864,181.3C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
              <defs>
                <linearGradient id="wave-gradient-1" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.15" />
                  <stop offset="100%" stopColor="#0891b2" stopOpacity="0.05" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* 波浪层2 - 深青色 */}
          <div className="absolute bottom-0 left-0 right-0 h-[55%]">
            <svg className="absolute bottom-0 w-[200%] animate-wave-medium" viewBox="0 0 1440 320" preserveAspectRatio="none" style={{ height: '100%' }}>
              <path fill="url(#wave-gradient-2)" d="M0,64L48,80C96,96,192,128,288,128C384,128,480,96,576,90.7C672,85,768,107,864,144C960,181,1056,235,1152,234.7C1248,235,1344,181,1392,154.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
              <defs>
                <linearGradient id="wave-gradient-2" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#06b6d4" stopOpacity="0.2" />
                  <stop offset="100%" stopColor="#0e7490" stopOpacity="0.08" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* 波浪层3 - 深蓝色 */}
          <div className="absolute bottom-0 left-0 right-0 h-[40%]">
            <svg className="absolute bottom-0 w-[200%] animate-wave-fast" viewBox="0 0 1440 320" preserveAspectRatio="none" style={{ height: '100%' }}>
              <path fill="url(#wave-gradient-3)" d="M0,256L48,240C96,224,192,192,288,181.3C384,171,480,181,576,208C672,235,768,277,864,277.3C960,277,1056,235,1152,208C1248,181,1344,171,1392,165.3L1440,160L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z" />
              <defs>
                <linearGradient id="wave-gradient-3" x1="0%" y1="0%" x2="0%" y2="100%">
                  <stop offset="0%" stopColor="#0284c7" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#075985" stopOpacity="0.1" />
                </linearGradient>
              </defs>
            </svg>
          </div>

          {/* 水下光晕 */}
          <div className="absolute top-20 left-1/3 w-80 h-80 bg-cyan-400/8 rounded-full blur-[120px] animate-caustic" />
          <div className="absolute top-40 right-1/4 w-60 h-60 bg-sky-400/6 rounded-full blur-[100px] animate-caustic animation-delay-1000" />
          <div className="absolute bottom-1/3 left-1/4 w-48 h-48 bg-teal-400/5 rounded-full blur-[80px] animate-caustic animation-delay-2000" />

          {/* 气泡效果 */}
          <div className="absolute bottom-20 left-[15%] w-2 h-2 bg-white/20 rounded-full animate-bubble" />
          <div className="absolute bottom-32 left-[35%] w-1.5 h-1.5 bg-white/15 rounded-full animate-bubble animation-delay-1000" />
          <div className="absolute bottom-16 right-[25%] w-1 h-1 bg-white/10 rounded-full animate-bubble animation-delay-2000" />
          <div className="absolute bottom-40 right-[40%] w-2.5 h-2.5 bg-white/15 rounded-full animate-bubble animation-delay-3000" />

          {/* 水浪动画样式 */}
          <style>{`
            @keyframes wave-slow {
              0% { transform: translateX(0); }
              100% { transform: translateX(-50%); }
            }
            @keyframes wave-medium {
              0% { transform: translateX(-50%); }
              100% { transform: translateX(0); }
            }
            @keyframes wave-fast {
              0% { transform: translateX(-25%); }
              100% { transform: translateX(-75%); }
            }
            @keyframes caustic {
              0%, 100% { opacity: 0.5; transform: scale(1) translate(0, 0); }
              25% { opacity: 0.7; transform: scale(1.1) translate(10px, -5px); }
              50% { opacity: 0.4; transform: scale(0.95) translate(-5px, 5px); }
              75% { opacity: 0.6; transform: scale(1.05) translate(5px, 10px); }
            }
            @keyframes bubble {
              0% { transform: translateY(0) scale(1); opacity: 0; }
              10% { opacity: 0.6; }
              90% { opacity: 0.3; }
              100% { transform: translateY(-400px) scale(0.5); opacity: 0; }
            }
            @keyframes glow-breathe {
              0%, 100% { opacity: 0.8; transform: translateX(-50%) scale(1); }
              50% { opacity: 1; transform: translateX(-50%) scale(1.05); }
            }
            @keyframes glow-float {
              0%, 100% { transform: translate(0, 0) scale(1); }
              33% { transform: translate(10px, -15px) scale(1.05); }
              66% { transform: translate(-5px, 10px) scale(0.98); }
            }
            @keyframes glow-drift {
              0%, 100% { transform: translate(0, 0); opacity: 0.6; }
              50% { transform: translate(20px, -10px); opacity: 0.8; }
            }
            @keyframes twinkle {
              0%, 100% { opacity: 0.3; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.5); }
            }
            .animate-wave-slow { animation: wave-slow 25s linear infinite; }
            .animate-wave-medium { animation: wave-medium 20s linear infinite; }
            .animate-wave-fast { animation: wave-fast 15s linear infinite; }
            .animate-caustic { animation: caustic 10s ease-in-out infinite; }
            .animate-bubble { animation: bubble 8s ease-in-out infinite; }
            .animate-glow-breathe { animation: glow-breathe 6s ease-in-out infinite; }
            .animate-glow-float { animation: glow-float 8s ease-in-out infinite; }
            .animate-glow-drift { animation: glow-drift 12s ease-in-out infinite; }
            .animate-twinkle { animation: twinkle 3s ease-in-out infinite; }
            .animation-delay-1000 { animation-delay: 1s; }
            .animation-delay-2000 { animation-delay: 2s; }
            .animation-delay-3000 { animation-delay: 3s; }
          `}</style>
        </div>
      )}

      {/* 顶部导航栏 - 加强背景层级以防滑动时透底闪烁 */}
      <div className={`relative z-20 backdrop-blur-xl border-b shrink-0 ${currentView === 'insights'
          ? 'bg-[#0a1628]/95 border-cyan-500/10'
          : 'bg-black/80 border-emerald-900/20'
        }`}>
        <div className="flex items-center gap-3 px-4 py-4 translate-z-0">
          <button onClick={handleBack} className="p-2 -ml-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-all active:scale-95">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-lg">{getTitle()}</h1>
            <p className={`text-xs ${currentView === 'insights' ? 'text-cyan-400/60' : 'text-emerald-600/70'}`}>个性化你的使用体验</p>
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

      {/* 内容区域 - 强制 GPU 分层 */}
      <div
        className="flex-1 overflow-y-auto"
        style={{
          overscrollBehaviorX: 'none',
          contain: 'size layout style',
          transform: 'translateZ(0)',
          WebkitBackfaceVisibility: 'hidden',
          backfaceVisibility: 'hidden'
        }}
        {...(shouldEnableSwipeBack ? swipeHandlers : {})}
      >
        {currentView === 'main' && (
          <div className="p-4 safe-area-bottom pb-20 max-w-6xl mx-auto w-full">
            {/* 效率工具 */}
            <SectionTitle title="效率工具" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <MenuItem
                icon={<svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>}
                title="待办事项"
                desc="管理任务，提升效率"
                gradient="bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600"
                onClick={() => setCurrentView('todo')}
              />
              <MenuItem
                icon={<svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>}
                title="间歇提醒"
                desc="专注计时，定时休息"
                gradient="bg-gradient-to-br from-amber-400 via-orange-500 to-red-500"
                onClick={() => setCurrentView('reminder')}
              />
            </div>

            {/* 内容管理 */}
            <SectionTitle title="内容管理" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <MenuItem
                icon={<svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" /></svg>}
                title="视频收藏夹"
                desc="批量导入B站视频"
                gradient="bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600"
                onClick={() => setCurrentView('collector')}
              />
              <MenuItem
                icon={<svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /></svg>}
                title="笔记"
                desc="记录灵感，整理思路"
                gradient="bg-gradient-to-br from-purple-400 via-violet-500 to-purple-700"
                onClick={() => { onOpenNotes?.(); onClose(); }}
              />
            </div>

            {/* 学习中心 */}
            <SectionTitle title="学习中心" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <MenuItem
                icon={<svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" /></svg>}
                title="学习日志"
                desc="记录视频学习总结"
                gradient="bg-gradient-to-br from-indigo-400 via-blue-500 to-indigo-700"
                onClick={() => { onOpenLearningLog?.(); onClose(); }}
              />
              <MenuItem
                icon={<svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" /></svg>}
                title="音频转写"
                desc="Groq Whisper · AI优化"
                gradient="bg-gradient-to-br from-violet-400 via-purple-500 to-fuchsia-600"
                onClick={() => setCurrentView('transcriber')}
              />
              <MenuItem
                icon={<svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>}
                title="每日信息差"
                desc="AI策展硬核知识"
                gradient="bg-gradient-to-br from-rose-400 via-pink-500 to-rose-600"
                onClick={() => setCurrentView('insights')}
              />
            </div>

            {/* 资源 & 社区 */}
            <SectionTitle title="资源 & 社区" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <MenuItem
                icon={<svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>}
                title="资源中心"
                desc="管理常用网站和书签"
                gradient="bg-gradient-to-br from-cyan-400 via-teal-500 to-cyan-600"
                onClick={() => { onOpenResourceCenter?.(); onClose(); }}
              />
              <MenuItem
                icon={<svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" /></svg>}
                title="开发者热点"
                desc="GitHub · Stack Overflow"
                gradient="bg-gradient-to-br from-orange-400 via-amber-500 to-yellow-500"
                onClick={() => setCurrentView('devcommunity')}
              />
            </div>

            {/* 外部工具 */}
            <SectionTitle title="外部工具" />
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
              <MenuItem
                icon={<svg className="w-full h-full" viewBox="0 0 24 24" fill="currentColor" opacity="0.8"><path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.659.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906L17.813 4.653zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773H5.333zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z" /></svg>}
                title="B站下载"
                desc="解析B站视频并下载"
                gradient="bg-gradient-to-br from-pink-400 via-rose-500 to-pink-600"
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
        {currentView === 'insights' && (
          <div className="relative z-10 p-4" style={{ touchAction: 'pan-y pinch-zoom' }}>
            <DailyInsights />
          </div>
        )}
      </div>

      {/* 策展悬浮球 - 仅在非insights页面时显示 */}
      {currentView !== 'insights' && (
        <InsightFloatingBall
          isLoading={insightStatus === 'loading'}
          isDone={insightStatus === 'done'}
          onClick={() => setCurrentView('insights')}
          color="green"
          storageKey="insight-ball-pos"
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
