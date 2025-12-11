import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatLastSyncTime, triggerSyncWithUploaders } from '../lib/autoSync';
import { supabase } from '../lib/supabase';
import { getStoredUserId, getStoredUsername } from '../lib/auth';
import { 
  waitForSyncLock, 
  releaseSyncLock, 
  getQueueStatus, 
  checkSyncThrottle, 
  recordSyncComplete,
  getSyncRateLimitStatus 
} from '../lib/syncQueue';
import { cachedFetch, invalidateCache, CACHE_KEYS, CACHE_TTL } from '../lib/cache';

interface Uploader {
  id: number;
  mid: number;
  name: string;
  face: string | null;
  is_active: boolean;
  last_sync_count: number | null;
  last_sync_at: string | null;
}

interface SyncButtonProps {
  compact?: boolean;
}

// 格式化时间为相对时间
function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return '刚刚';
  if (diffMins < 60) return `${diffMins}分钟前`;
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffDays < 30) return `${diffDays}天前`;
  return date.toLocaleDateString();
}

const SyncButton: React.FC<SyncButtonProps> = ({ compact = false }) => {
  const [showModal, setShowModal] = useState(false);
  const [uploaders, setUploaders] = useState<Uploader[]>([]);
  const [selectedMids, setSelectedMids] = useState<Set<number>>(new Set());
  const [loadingUploaders, setLoadingUploaders] = useState(false);
  
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState(formatLastSyncTime());
  const [progress, setProgress] = useState(0);
  const [currentUploader, setCurrentUploader] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'error'>('idle');
  
  const cancelRef = useRef(false);

  const fetchUploaders = useCallback(async (forceRefresh = false) => {
    setLoadingUploaders(true);
    try {
      const userId = getStoredUserId();
      if (!userId) {
        setUploaders([]);
        return;
      }
      
      // 使用缓存获取UP主列表
      const list = await cachedFetch<Uploader[]>(
        CACHE_KEYS.UPLOADERS(userId),
        async () => {
          const { data } = await supabase
            .from('uploader')
            .select('*')
            .eq('user_id', userId)
            .eq('is_active', true)
            .order('name');
          return data || [];
        },
        {
          memoryTTL: CACHE_TTL.UPLOADERS,
          storageTTL: CACHE_TTL.UPLOADERS,
          forceRefresh,
        }
      );
      
      setUploaders(list);
      setSelectedMids(new Set(list.map(u => u.mid)));
    } catch (err) {
      console.error('获取UP主列表失败:', err);
    } finally {
      setLoadingUploaders(false);
    }
  }, []);

  const handleOpenModal = () => {
    fetchUploaders();
    setSyncStatus('idle');
    setProgress(0);
    setMessage(null);
    setShowModal(true);
  };

  const handleCloseModal = () => {
    if (syncing) cancelRef.current = true;
    setShowModal(false);
    setSyncStatus('idle');
  };

  const toggleSelect = (mid: number) => {
    setSelectedMids(prev => {
      const newSet = new Set(prev);
      if (newSet.has(mid)) newSet.delete(mid);
      else newSet.add(mid);
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedMids.size === uploaders.length) {
      setSelectedMids(new Set());
    } else {
      setSelectedMids(new Set(uploaders.map(u => u.mid)));
    }
  };

  const handleCancelSync = () => {
    cancelRef.current = true;
    setMessage('正在取消...');
  };

  const handleStartSync = async () => {
    if (selectedMids.size === 0) return;
    
    // 0. 节流检查 - 防止频繁同步（白名单用户跳过）
    const WHITELIST_USERS = ['senjay']; // 白名单用户，跳过限流
    const username = getStoredUsername();
    const isWhitelisted = username && WHITELIST_USERS.includes(username.toLowerCase());
    
    if (!isWhitelisted) {
      const throttleCheck = checkSyncThrottle();
      if (!throttleCheck.canSync) {
        setMessage(`⏳ ${throttleCheck.reason}`);
        setSyncStatus('error');
        setTimeout(() => setSyncStatus('idle'), 3000);
        return;
      }
    }
    
    cancelRef.current = false;
    setSyncing(true);
    setSyncStatus('syncing');
    setMessage('🚀 准备同步...');
    setProgress(0);

    let lockId: string | undefined;
    const startTime = Date.now(); // 记录开始时间

    try {
      // 1. 等待获取同步锁（小任务直接跳过队列）
      const selectedUploaders = uploaders.filter(u => selectedMids.has(u.mid));
      const taskCount = selectedUploaders.length;
      
      const lockResult = await waitForSyncLock(
        (position) => {
          if (cancelRef.current) return;
          setMessage(`⏳ 排队中... 前面还有 ${position} 人`);
        },
        (jitterSeconds) => {
          if (cancelRef.current) return;
          setMessage(`🛡️ 检测到高并发，随机等待 ${jitterSeconds} 秒避免风暴...`);
        },
        taskCount  // 传递任务量，小任务会跳过队列
      );

      if (cancelRef.current) {
        setSyncStatus('idle');
        setMessage('已取消同步');
        return;
      }

      if (lockResult.timedOut) {
        setSyncStatus('error');
        setMessage('⏰ 等待超时，请稍后重试');
        setSyncing(false);
        return;
      }

      lockId = lockResult.lockId;
      setMessage('🚀 开始同步...');

      // 2. 执行同步（selectedUploaders 已在上面定义）
      const result = await triggerSyncWithUploaders(
        selectedUploaders, 
        (progressMsg) => {
          if (cancelRef.current) return;
          
          setMessage(progressMsg);
          
          const match = progressMsg.match(/\[(\d+)\/(\d+)\]\s*(.+)/);
          if (match) {
            const current = parseInt(match[1]);
            const total = parseInt(match[2]);
            setProgress(Math.round((current / total) * 100));
            setCurrentUploader(match[3]?.replace('...', '') || '');
          }
        },
        () => cancelRef.current  // 传入取消检查函数
      );
      
      if (result.cancelled || cancelRef.current) {
        setSyncStatus('idle');
        setMessage('已取消同步');
      } else {
        setProgress(100);
        
        // 计算耗时
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const successMsg = result.success 
          ? `✅ 同步完成！新增 ${result.videosAdded || 0} 个视频，耗时 ${duration}秒`
          : result.message;
        
        setMessage(successMsg);
        setSyncStatus(result.success ? 'success' : 'error');
        setLastSync(formatLastSyncTime());
        
        if (result.success && result.videosAdded && result.videosAdded > 0) {
          window.dispatchEvent(new CustomEvent('sync-complete'));
          
          // 同步成功后使视频统计缓存失效
          const userId = getStoredUserId();
          if (userId) {
            invalidateCache(CACHE_KEYS.VIDEO_COUNT_BY_DATE(userId));
          }
        }
        
        // 记录同步完成（用于节流计数）
        if (result.success) {
          recordSyncComplete();
        }
      }
    } catch (error) {
      if (!cancelRef.current) {
        setMessage('同步失败: ' + String(error));
        setSyncStatus('error');
      }
    } finally {
      // 释放同步锁
      await releaseSyncLock(lockId);
      setSyncing(false);
      cancelRef.current = false;
    }
  };

  // 渲染弹窗
  const renderModal = () => {
    if (!showModal) return null;

    return createPortal(
      <div 
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={handleCloseModal}
      >
        <div 
          className="w-full max-w-md bg-[#0c0c14] border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl h-[70vh] flex flex-col overflow-hidden relative"
          onClick={e => e.stopPropagation()}
          style={{ animation: 'slideUp 0.3s ease-out' }}
        >
          {/* 同步进度覆盖层 */}
          {syncing && (
            <div className="absolute inset-0 z-10 bg-[#0c0c14] flex flex-col items-center justify-center p-8">
              {/* 进度环 */}
              <div className="relative w-32 h-32 mb-6">
                <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="42" fill="none" stroke="#1f2937" strokeWidth="8" />
                  <circle 
                    cx="50" cy="50" r="42" 
                    fill="none" 
                    stroke="url(#progressGradient)" 
                    strokeWidth="8"
                    strokeLinecap="round"
                    strokeDasharray={`${progress * 2.64} 264`}
                    className="transition-all duration-300"
                  />
                  <defs>
                    <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                      <stop offset="0%" stopColor="#a3e635" />
                      <stop offset="100%" stopColor="#22d3ee" />
                    </linearGradient>
                  </defs>
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-3xl font-bold text-white">{progress}%</span>
                </div>
              </div>
              
              <p className="text-white font-medium mb-2">{currentUploader || '正在同步...'}</p>
              <p className="text-gray-400 text-sm text-center">{message}</p>
              
              <button
                onClick={handleCancelSync}
                className="mt-6 px-6 py-2 bg-white/10 text-white rounded-xl hover:bg-white/20 transition-colors"
              >
                取消同步
              </button>
            </div>
          )}

          {/* 完成状态覆盖层 */}
          {(syncStatus === 'success' || syncStatus === 'error') && !syncing && (
            <div className="absolute inset-0 z-10 bg-[#0c0c14] flex flex-col items-center justify-center p-8">
              <div className={`w-20 h-20 rounded-full flex items-center justify-center mb-4 ${
                syncStatus === 'success' ? 'bg-green-500/20' : 'bg-red-500/20'
              }`}>
                {syncStatus === 'success' ? (
                  <svg className="w-10 h-10 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg className="w-10 h-10 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                )}
              </div>
              <p className={`font-medium mb-2 ${syncStatus === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {syncStatus === 'success' ? '同步完成' : '同步失败'}
              </p>
              <p className="text-gray-400 text-sm text-center max-w-xs">{message}</p>
              <button
                onClick={() => { setSyncStatus('idle'); setMessage(null); }}
                className="mt-6 px-6 py-2 bg-cyber-lime text-black rounded-xl hover:bg-lime-400 transition-colors font-medium"
              >
                完成
              </button>
            </div>
          )}

          {/* 头部 */}
          <div className="px-5 py-4 border-b border-white/10 shrink-0">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">选择同步的UP主</h2>
              <button onClick={handleCloseModal} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10">
                <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>
            
            <button
              onClick={toggleSelectAll}
              disabled={syncing}
              className="mt-3 w-full py-2 bg-white/5 rounded-xl text-sm text-gray-300 hover:bg-white/10 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center transition-colors ${
                selectedMids.size === uploaders.length && uploaders.length > 0 ? 'bg-cyber-lime border-cyber-lime' : 'border-gray-500'
              }`}>
                {selectedMids.size === uploaders.length && uploaders.length > 0 && (
                  <svg className="w-3 h-3 text-black" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                  </svg>
                )}
              </div>
              {selectedMids.size === uploaders.length && uploaders.length > 0 ? '取消全选' : '全选'}
              <span className="text-gray-500">({selectedMids.size}/{uploaders.length})</span>
            </button>
          </div>

          {/* UP主列表 */}
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {loadingUploaders ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-6 h-6 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin" />
              </div>
            ) : uploaders.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm">暂无关注的UP主</div>
            ) : (
              uploaders.map(uploader => (
                <button
                  key={uploader.id}
                  onClick={() => toggleSelect(uploader.mid)}
                  disabled={syncing}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors disabled:opacity-50 ${
                    selectedMids.has(uploader.mid)
                      ? 'bg-cyber-lime/10 border border-cyber-lime/30'
                      : 'bg-white/5 border border-transparent hover:bg-white/10'
                  }`}
                >
                  <div className={`w-5 h-5 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                    selectedMids.has(uploader.mid) ? 'bg-cyber-lime border-cyber-lime' : 'border-gray-500'
                  }`}>
                    {selectedMids.has(uploader.mid) && (
                      <svg className="w-3 h-3 text-black" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                      </svg>
                    )}
                  </div>
                  <img src={uploader.face || 'https://i0.hdslb.com/bfs/face/member/noface.jpg'} alt={uploader.name} className="w-10 h-10 rounded-full" referrerPolicy="no-referrer" />
                  <div className="flex-1 min-w-0 text-left">
                    <span className="text-white font-medium truncate block">{uploader.name}</span>
                    {uploader.last_sync_at ? (
                      <span className="text-[10px] text-gray-500">
                        <span className="text-cyber-lime">{uploader.last_sync_count || 0} 个视频</span>
                        <span className="mx-1">·</span>
                        {formatTimeAgo(uploader.last_sync_at)}
                      </span>
                    ) : (
                      <span className="text-[10px] text-gray-500">暂无同步记录</span>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* 底部按钮 */}
          <div className="p-4 border-t border-white/10 shrink-0">
            <button
              onClick={handleStartSync}
              disabled={selectedMids.size === 0 || syncing}
              className={`w-full py-3 rounded-xl text-sm font-medium transition-all ${
                selectedMids.size === 0 || syncing
                  ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                  : 'bg-cyber-lime text-black hover:bg-lime-400'
              }`}
            >
              开始同步 ({selectedMids.size} 个UP主)
            </button>
          </div>
        </div>
        
        <style>{`
          @keyframes slideUp {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
        `}</style>
      </div>,
      document.body
    );
  };

  return (
    <>
      <button
        onClick={handleOpenModal}
        className={`${compact ? 'w-8 h-8 rounded-full' : 'px-4 py-2 rounded-xl'} flex items-center justify-center gap-2 transition-all bg-white/5 border border-white/10 hover:border-cyber-lime/50`}
        title={`同步视频 (${lastSync})`}
      >
        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
          <path d="M3 3v5h5" />
          <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
          <path d="M16 21h5v-5" />
        </svg>
        {!compact && <span className="text-sm text-gray-400">同步</span>}
      </button>
      {renderModal()}
    </>
  );
};

export default SyncButton;
