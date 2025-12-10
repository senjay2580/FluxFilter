import React, { useState } from 'react';
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

  const handleSync = async () => {
    setSyncing(true);
    setMessage(null);

    try {
      const result = await triggerSync((progress) => {
        setMessage(progress);
      });
      setMessage(result.message);
      setLastSync(formatLastSyncTime());
      
      // 同步成功后触发刷新事件
      if (result.success && result.videosAdded && result.videosAdded > 0) {
        window.dispatchEvent(new CustomEvent('sync-complete'));
      }
      
      // 3秒后自动关闭弹窗
      setTimeout(() => {
        setMessage(null);
      }, 3000);
    } catch (error) {
      setMessage('同步失败: ' + String(error));
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

        {/* 点击外部关闭 */}
        {(syncing || message) && (
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => {
              if (!syncing) {
                setMessage(null);
              }
            }}
          />
        )}

        {/* 进度弹窗 */}
        {(syncing || message) && (
          <div className="absolute top-12 right-0 w-64 bg-cyber-card border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50">
            {/* 头部 */}
            <div className={`px-4 py-2.5 flex items-center justify-between ${
              message?.includes('失败') || message?.includes('错误')
                ? 'bg-red-500/20' 
                : message?.includes('成功') || message?.includes('完成')
                  ? 'bg-green-500/20'
                  : 'bg-cyber-lime/10'
            }`}>
              <span className="text-sm font-medium text-white flex items-center gap-2">
                {syncing ? (
                  <>
                    <svg className="w-4 h-4 animate-spin text-cyber-lime" viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="opacity-25" />
                      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
                    </svg>
                    同步中...
                  </>
                ) : message?.includes('失败') || message?.includes('错误') ? (
                  <>
                    <span className="text-red-400">✕</span>
                    同步失败
                  </>
                ) : (
                  <>
                    <span className="text-green-400">✓</span>
                    同步完成
                  </>
                )}
              </span>
              {/* 关闭/取消按钮 */}
              <button 
                onClick={() => {
                  setSyncing(false);
                  setMessage(null);
                }}
                className="text-gray-400 hover:text-white transition-colors"
                title={syncing ? '取消同步' : '关闭'}
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

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
