import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import IntervalReminder from './IntervalReminder';
import TodoList from './TodoList';
import VideoCollector from './VideoCollector';

export type SettingsView = 'main' | 'todo' | 'reminder' | 'collector';

// 外部转写系统配置
const EXTERNAL_TRANSCRIPT_SYSTEM_URL = import.meta.env.VITE_TRANSCRIPT_SYSTEM_URL || 'http://localhost:3001';

interface SettingsPageProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: SettingsView;
  onOpenNotes?: () => void;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ isOpen, onClose, initialView = 'main', onOpenNotes }) => {
  const [currentView, setCurrentView] = useState<SettingsView>(initialView);
  const [toast, setToast] = useState<string | null>(null);

  // 当 initialView 变化或打开时更新视图
  useEffect(() => {
    if (isOpen) {
      setCurrentView(initialView);
    }
  }, [isOpen, initialView]);

  // 显示 toast
  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  // 跳转到外部转写系统
  const handleNavigateToTranscriptSystem = useCallback(async (videoUrl?: string) => {
    try {
      const params = new URLSearchParams();
      if (videoUrl) {
        params.set('url', videoUrl);
      }
      
      const targetUrl = `${EXTERNAL_TRANSCRIPT_SYSTEM_URL}${params.toString() ? `?${params.toString()}` : ''}`;
      
      // 发送 HTTP 请求通知外部系统（可选）
      try {
        await fetch(`${EXTERNAL_TRANSCRIPT_SYSTEM_URL}/api/prepare`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ videoUrl }),
          mode: 'no-cors', // 避免 CORS 问题
        });
      } catch {
        // 忽略请求错误，继续跳转
      }
      
      // 在新窗口打开外部系统
      window.open(targetUrl, '_blank');
      showToast('正在跳转到转写系统...');
    } catch (error) {
      showToast('跳转失败，请稍后重试');
    }
  }, [showToast]);

  if (!isOpen) return null;

  const handleBack = () => {
    if (currentView === 'main') {
      onClose();
    } else {
      setCurrentView('main');
    }
  };

  const getTitle = () => {
    switch (currentView) {
      case 'todo': return '待办事项';
      case 'reminder': return '间歇提醒';
      case 'collector': return '视频收藏夹';
      default: return '设置';
    }
  };

  const getDescription = () => {
    switch (currentView) {
      case 'todo': return '管理你的待办任务，保持高效';
      case 'reminder': return '设定专注时段，随机间隔提醒休息';
      case 'collector': return '批量导入B站视频到你的收藏库';
      default: return '个性化你的使用体验';
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99998] bg-cyber-dark">
      {/* 顶部导航栏 */}
      <div className="sticky top-0 z-10 bg-cyber-dark/95 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3 safe-area-top mt-3">
          {/* 返回按钮 */}
          <button
            onClick={handleBack}
            className="p-2 -ml-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors"
          >
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7"/>
            </svg>
          </button>
          
          {/* 标题 */}
          <div className="flex-1">
            <h1 className="text-white font-bold text-lg">{getTitle()}</h1>
            <p className="text-gray-500 text-xs">{getDescription()}</p>
          </div>

          {/* 视频收藏夹页面 - 打开B站按钮 */}
          {currentView === 'collector' && (
            <button
              onClick={() => {
                window.open('https://www.bilibili.com', '_blank');
                showToast('在B站复制视频链接后返回粘贴');
              }}
              className="flex items-center gap-1.5 px-3 py-2 bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/30 rounded-xl transition-all active:scale-95"
            >
              <svg className="w-4 h-4 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              <span className="text-pink-400 text-sm font-medium">B站</span>
            </button>
          )}
        </div>
      </div>

      {/* 内容区域 */}
      <div className="h-[calc(100vh-60px)] overflow-y-auto">
        {currentView === 'main' && (
          <div className="p-4 space-y-3">
            {/* TODO 入口 */}
            <button
              onClick={() => setCurrentView('todo')}
              className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all active:scale-[0.98] text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium">待办事项</h3>
                  <p className="text-gray-500 text-sm">管理任务，提升效率</p>
                </div>
                <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
            </button>

            {/* 间歇提醒入口 */}
            <button
              onClick={() => setCurrentView('reminder')}
              className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all active:scale-[0.98] text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <polyline points="12 6 12 12 16 14"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium">间歇提醒</h3>
                  <p className="text-gray-500 text-sm">专注计时，定时休息</p>
                </div>
                <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
            </button>

            {/* 视频收藏夹入口 */}
            <button
              onClick={() => setCurrentView('collector')}
              className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all active:scale-[0.98] text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-cyber-lime/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium">视频收藏夹</h3>
                  <p className="text-gray-500 text-sm">批量导入B站视频</p>
                </div>
                <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
            </button>

            {/* 笔记入口 */}
            <button
              onClick={() => {
                onClose();
                onOpenNotes?.();
              }}
              className="w-full p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all active:scale-[0.98] text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-pink-500/20 flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <line x1="10" y1="9" x2="8" y2="9"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium">笔记</h3>
                  <p className="text-gray-500 text-sm">记录灵感，整理思路</p>
                </div>
                <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
            </button>

            {/* 视频下载 & 文案转写入口 - 跳转外部系统 */}
            <button
              onClick={() => handleNavigateToTranscriptSystem()}
              className="w-full p-4 bg-gradient-to-r from-purple-500/10 to-pink-500/10 hover:from-purple-500/20 hover:to-pink-500/20 border border-purple-500/20 rounded-2xl transition-all active:scale-[0.98] text-left"
            >
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/30 to-pink-500/30 flex items-center justify-center">
                  <svg className="w-6 h-6 text-purple-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                    <polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/>
                    <line x1="16" y1="17" x2="8" y2="17"/>
                    <polyline points="10 9 9 9 8 9"/>
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-white font-medium">视频下载 & 文案转写</h3>
                  <p className="text-gray-500 text-sm">跳转到专业转写系统</p>
                </div>
                <svg className="w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                  <polyline points="15 3 21 3 21 9"/>
                  <line x1="10" y1="14" x2="21" y2="3"/>
                </svg>
              </div>
            </button>

          </div>
        )}

        {currentView === 'todo' && (
          <div className="p-4">
            <TodoList embedded timeFilter="all" />
          </div>
        )}

        {currentView === 'reminder' && (
          <div className="p-4">
            <IntervalReminder />
          </div>
        )}

        {currentView === 'collector' && (
          <div className="p-4">
            <VideoCollector />
          </div>
        )}
      </div>

      {/* Toast 通知 */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/90 border border-white/20 rounded-full text-white text-sm z-[99999]" style={{ animation: 'fadeIn 0.2s ease-out' }}>
          {toast}
        </div>
      )}

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translate(-50%, 10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
      `}</style>
    </div>,
    document.body
  );
};

export default SettingsPage;
