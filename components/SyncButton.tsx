import React, { useState } from 'react';
import { formatLastSyncTime, triggerSync, markSynced } from '../lib/autoSync';

/**
 * 同步测试按钮组件
 * 用于手动触发视频同步，方便测试
 */
const SyncButton: React.FC = () => {
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
    } catch (error) {
      setMessage('同步失败: ' + String(error));
    } finally {
      setSyncing(false);
    }
  };

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
