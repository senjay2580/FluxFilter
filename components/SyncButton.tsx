import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { formatLastSyncTime, triggerSync, markSynced } from '../lib/autoSync';

interface SyncButtonProps {
  compact?: boolean; // 紧凑模式（只显示图标）
}

/**
 * 同步按钮组件
 */
const SyncButton: React.FC<SyncButtonProps> = ({ compact = false }) => {
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState(formatLastSyncTime());
  const [progress, setProgress] = useState(0); // 进度百分比
  const [totalSteps, setTotalSteps] = useState(0);
  const [currentStep, setCurrentStep] = useState(0);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');

  const handleSync = async () => {
    setSyncing(true);
    setSyncStatus('syncing');
    setMessage(null);
    setProgress(0);
    setCurrentStep(0);

    try {
      const result = await triggerSync((progressMsg) => {
        setMessage(progressMsg);
        
        // 解析进度信息 "[1/5] UP主名..."
        const match = progressMsg.match(/\[(\d+)\/(\d+)\]/);
        if (match) {
          const current = parseInt(match[1]);
          const total = parseInt(match[2]);
          setCurrentStep(current);
          setTotalSteps(total);
          setProgress(Math.round((current / total) * 100));
        } else if (progressMsg.includes('获取UP主')) {
          setProgress(5);
        }
      });
      
      // 同步完成，设置100%
      setProgress(100);
      setMessage(result.message);
      setSyncStatus(result.success ? 'success' : 'error');
      setLastSync(formatLastSyncTime());
      
      // 同步成功后触发刷新事件
      if (result.success && result.videosAdded && result.videosAdded > 0) {
        window.dispatchEvent(new CustomEvent('sync-complete'));
      }
      
      // 3秒后自动关闭弹窗
      setTimeout(() => {
        setMessage(null);
        setSyncStatus('idle');
        setProgress(0);
      }, 3000);
    } catch (error) {
      setMessage('同步失败: ' + String(error));
      setSyncStatus('error');
    } finally {
      setSyncing(false);
    }
  };

  // 紧凑模式 - 显示图标 + 弹出进度窗口
  if (compact) {
    return (
      <div className="relative">
        {/* 同步按钮 */}
        <button
          onClick={handleSync}
          disabled={syncing}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
            syncing 
              ? 'bg-cyber-lime/20 border border-cyber-lime/50' 
              : 'bg-white/5 border border-white/10 hover:border-cyber-lime/50'
          }`}
          title={syncing ? '同步中...' : `同步视频 (${lastSync})`}
        >
          {syncing ? (
            <svg className="w-4 h-4 animate-spin text-cyber-lime" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          )}
        </button>

        {/* 弹窗使用 Portal 渲染到 body */}
        {(syncing || message) && createPortal(
          <>
            <style>{`
              @keyframes slideUp {
                from { transform: translateY(100%); opacity: 0; }
                to { transform: translateY(0); opacity: 1; }
              }
            `}</style>
            {/* 点击外部关闭 */}
            <div 
              className="fixed inset-0 z-[59] bg-black/20" 
              onClick={() => {
                if (!syncing) {
                  setMessage(null);
                }
              }}
            />
            {/* 进度弹窗 - 底部抽屉 */}
            <div 
              className="fixed bottom-0 left-0 right-0 bg-[#0f101a] border-t border-white/10 shadow-2xl z-[60] rounded-t-2xl pb-safe"
              style={{
                animation: 'slideUp 0.3s ease-out'
              }}
            >
              {/* 拖动指示器 */}
              <div className="flex justify-center pt-2 pb-1">
                <div className="w-10 h-1 bg-white/20 rounded-full" />
              </div>
              
            {/* 头部 */}
            <div className={`px-4 py-2.5 flex items-center justify-between ${
              syncStatus === 'error' ? 'bg-red-500/20' 
              : syncStatus === 'success' ? 'bg-green-500/20'
              : 'bg-cyber-lime/10'
            }`}>
              <span className="text-sm font-medium text-white flex items-center gap-2">
                {syncStatus === 'syncing' ? (
                  <>
                    <svg className="w-4 h-4 animate-spin text-cyber-lime" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    同步中 {progress > 0 ? `${progress}%` : ''}
                  </>
                ) : syncStatus === 'error' ? (
                  <>
                    <span className="text-red-400">✕</span>
                    同步失败
                  </>
                ) : syncStatus === 'success' ? (
                  <>
                    <span className="text-green-400">✓</span>
                    同步完成
                  </>
                ) : (
                  <>同步</>
                )}
              </span>
              {/* 关闭按钮 */}
              <button 
                onClick={() => {
                  setSyncing(false);
                  setMessage(null);
                  setSyncStatus('idle');
                  setProgress(0);
                }}
                className="p-1 rounded-lg text-gray-400 hover:text-white hover:bg-white/10 transition-all active:scale-95"
                title="关闭"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 进度条 */}
            {syncStatus === 'syncing' && (
              <div className="px-4 pt-3">
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-cyber-lime to-emerald-400 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                {totalSteps > 0 && (
                  <p className="text-[10px] text-gray-500 mt-1 text-right">
                    {currentStep} / {totalSteps} UP主
                  </p>
                )}
              </div>
            )}

            {/* 内容 */}
            <div className="px-4 py-3">
              <p className="text-xs text-gray-300 leading-relaxed">
                {message || '正在连接...'}
              </p>
            </div>

            {/* 底部 */}
            <div className="px-4 py-2 bg-white/5 border-t border-white/5">
              <p className="text-[10px] text-gray-500">
                上次同步: {lastSync}
              </p>
            </div>
            </div>
          </>,
          document.body
        )}
      </div>
    );
  }

  // 完整模式
  return (
    <div className="fixed bottom-24 right-4 z-50">
      {/* 消息提示 */}
      {message && (
        <div className={`mb-2 px-3 py-2 rounded-lg text-xs max-w-[200px] ${
          message.includes('失败') ? 'bg-red-500/90' : 'bg-green-500/90'
        } text-white shadow-lg`}>
          {message}
          <button 
            onClick={() => setMessage(null)}
            className="ml-2 opacity-70 hover:opacity-100"
          >
            ✕
          </button>
        </div>
      )}

      {/* 同步按钮 */}
      <button
        onClick={handleSync}
        disabled={syncing}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-full shadow-lg transition-all ${
          syncing 
            ? 'bg-gray-600 cursor-not-allowed' 
            : 'bg-cyber-lime text-black hover:bg-lime-400 active:scale-95'
        }`}
      >
        {syncing ? (
          <>
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
              <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span className="text-sm font-medium">同步中...</span>
          </>
        ) : (
          <>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
            <span className="text-sm font-medium">同步视频</span>
          </>
        )}
      </button>

      {/* 上次同步时间 */}
      <div className="mt-1 text-[10px] text-gray-500 text-center">
        {lastSync}
      </div>
    </div>
  );
};

export default SyncButton;
