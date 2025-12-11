import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import IntervalReminder from './IntervalReminder';
import TodoList from './TodoList';
import VideoCollector from './VideoCollector';

type SettingsView = 'main' | 'todo' | 'reminder' | 'collector';

interface SettingsPageProps {
  isOpen: boolean;
  onClose: () => void;
  initialView?: SettingsView;
}

const SettingsPage: React.FC<SettingsPageProps> = ({ isOpen, onClose, initialView = 'main' }) => {
  const [currentView, setCurrentView] = useState<SettingsView>(initialView);

  // 当 initialView 变化或打开时更新视图
  useEffect(() => {
    if (isOpen) {
      setCurrentView(initialView);
    }
  }, [isOpen, initialView]);

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
        <div className="flex items-center gap-3 px-4 py-3 safe-area-top">
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

            {/* 分割线 */}
            <div className="py-2">
              <div className="h-px bg-white/10" />
            </div>

            {/* 其他设置项 */}
            <div className="p-4 bg-white/5 border border-white/10 rounded-2xl">
              <h4 className="text-gray-400 text-xs font-medium mb-3">关于</h4>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">版本</span>
                  <span className="text-white text-sm">1.0.0</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-400 text-sm">开发者</span>
                  <span className="text-white text-sm">Senjay</span>
                </div>
              </div>
            </div>
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
    </div>,
    document.body
  );
};

export default SettingsPage;
