import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getStoredUserId } from '../../lib/auth';
import { formatDuration } from '../../lib/bilibili';
import { SimpleLoader } from '../shared/Loader';

interface DeletedVideo {
  id: number;
  bvid: string;
  title: string;
  pic: string;
  duration: number;
  deleted_at: string;
  pubdate: string;
  platform?: string;
  video_id?: string;
  uploader?: {
    name: string;
    face: string;
  };
}

interface RecycleBinProps {
  onClose: () => void;
  onRestore?: () => void; // 恢复后刷新首页
}

// 格式化发布时间分组
const formatDateGroup = (dateStr: string): string => {
  const date = new Date(dateStr);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(today.getTime() - 24 * 60 * 60 * 1000);
  const pubDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());

  if (pubDate.getTime() === today.getTime()) return '今天';
  if (pubDate.getTime() === yesterday.getTime()) return '昨天';
  
  const diffDays = Math.floor((today.getTime() - pubDate.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 7) return `${diffDays}天前`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
  
  return `${date.getMonth() + 1}月${date.getDate()}日`;
};

const RecycleBin: React.FC<RecycleBinProps> = ({ onClose, onRestore }) => {
  const [videos, setVideos] = useState<DeletedVideo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'restore' | 'delete' | 'deleteOld';
    ids?: number[];
    title: string;
    message: string;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  // 加载回收站视频
  const fetchDeletedVideos = useCallback(async () => {
    const userId = getStoredUserId();
    if (!userId || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('video')
        .select('id, bvid, title, pic, duration, deleted_at, pubdate, platform, video_id, mid')
        .eq('user_id', userId)
        .eq('is_deleted', true)
        .order('pubdate', { ascending: false });

      if (error) throw error;

      // 获取 uploader 信息
      if (data && data.length > 0) {
        const mids = [...new Set(data.map(v => v.mid).filter(Boolean))];
        let uploaderMap = new Map();
        if (mids.length > 0) {
          const { data: uploaders } = await supabase
            .from('uploader')
            .select('mid, name, face')
            .eq('user_id', userId)
            .in('mid', mids);
          uploaderMap = new Map(uploaders?.map(u => [u.mid, u]) || []);
        }

        data.forEach((video: any) => {
          const uploader = uploaderMap.get(video.mid);
          if (uploader) {
            video.uploader = { name: uploader.name, face: uploader.face };
          }
        });
      }

      setVideos(data || []);
    } catch (err) {
      console.error('加载回收站失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDeletedVideos();
  }, [fetchDeletedVideos]);

  // 按发布日期分组
  const groupedVideos = useMemo(() => {
    const groups = new Map<string, DeletedVideo[]>();
    
    videos.forEach(video => {
      const groupKey = formatDateGroup(video.pubdate);
      if (!groups.has(groupKey)) {
        groups.set(groupKey, []);
      }
      groups.get(groupKey)!.push(video);
    });

    return Array.from(groups.entries());
  }, [videos]);

  // 非今天发布的视频 IDs
  const oldVideoIds = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return videos
      .filter(v => new Date(v.pubdate) < today)
      .map(v => v.id);
  }, [videos]);

  // 恢复视频
  const restoreVideos = async (ids: number[]) => {
    const userId = getStoredUserId();
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('video')
        .update({ is_deleted: false, deleted_at: null })
        .eq('user_id', userId)
        .in('id', ids);

      if (error) throw error;

      setVideos(prev => prev.filter(v => !ids.includes(v.id)));
      setSelectedIds(new Set());
      setIsSelecting(false);
      showToast(`已恢复 ${ids.length} 个视频`);
      onRestore?.();
    } catch (err) {
      console.error('恢复失败:', err);
      showToast('恢复失败，请重试');
    }
  };

  // 永久删除视频
  const permanentlyDelete = async (ids: number[]) => {
    const userId = getStoredUserId();
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('video')
        .delete()
        .eq('user_id', userId)
        .in('id', ids);

      if (error) throw error;

      setVideos(prev => prev.filter(v => !ids.includes(v.id)));
      setSelectedIds(new Set());
      setIsSelecting(false);
      showToast(`已永久删除 ${ids.length} 个视频`);
    } catch (err) {
      console.error('删除失败:', err);
      showToast('删除失败，请重试');
    }
  };

  // 删除某个分组的所有视频
  const deleteGroup = (groupVideos: DeletedVideo[]) => {
    const ids = groupVideos.map(v => v.id);
    setConfirmAction({
      type: 'delete',
      ids,
      title: '永久删除',
      message: `确定永久删除这 ${ids.length} 个视频吗？此操作不可恢复。`
    });
  };

  // 切换选择
  const toggleSelect = (id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  // 长按开始选择
  const handleLongPress = (id: number) => {
    if (navigator.vibrate) navigator.vibrate(20);
    setIsSelecting(true);
    setSelectedIds(new Set([id]));
  };

  // 全选/取消全选
  const toggleSelectAll = () => {
    if (selectedIds.size === videos.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(videos.map(v => v.id)));
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[99998] bg-[#050510] flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-[#050510]/95 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
            >
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" />
              </svg>
            </button>
            <div>
              <h1 className="text-lg font-bold text-white">回收站</h1>
              <p className="text-xs text-gray-500">{videos.length} 个视频</p>
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            {isSelecting ? (
              <button
                onClick={() => { setIsSelecting(false); setSelectedIds(new Set()); }}
                className="px-3 py-1.5 text-sm text-gray-400 hover:text-white transition-colors"
              >
                取消
              </button>
            ) : videos.length > 0 && (
              <button
                onClick={() => setIsSelecting(true)}
                className="px-3 py-1.5 text-sm text-cyber-lime hover:bg-cyber-lime/10 rounded-lg transition-colors"
              >
                选择
              </button>
            )}
          </div>
        </div>

        {/* 选择模式工具栏 */}
        {isSelecting && (
          <div className="flex items-center justify-between px-4 py-2 bg-white/5 border-t border-white/5">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
            >
              <div className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                selectedIds.size === videos.length ? 'bg-cyber-lime border-cyber-lime' : 'border-gray-500'
              }`}>
                {selectedIds.size === videos.length && (
                  <svg className="w-3 h-3 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </div>
              <span>全选 ({selectedIds.size}/{videos.length})</span>
            </button>
          </div>
        )}
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto pb-32">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <SimpleLoader />
          </div>
        ) : videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <svg className="w-16 h-16 mb-4 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            <p className="text-sm">回收站是空的</p>
          </div>
        ) : (
          <div className="px-4 py-4 space-y-6">
            {groupedVideos.map(([groupName, groupVideos]) => (
              <div key={groupName}>
                {/* 时间分割线 */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-white/10" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-gray-400">{groupName}</span>
                    <span className="text-xs text-gray-600">({groupVideos.length})</span>
                    {!isSelecting && (
                      <button
                        onClick={() => deleteGroup(groupVideos)}
                        className="ml-2 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors group"
                        title="删除此分组"
                      >
                        <svg className="w-4 h-4 text-gray-500 group-hover:text-red-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <div className="flex-1 h-px bg-white/10" />
                </div>

                {/* 视频列表 */}
                <div className="space-y-2">
                  {groupVideos.map(video => (
                    <VideoItem
                      key={video.id}
                      video={video}
                      isSelecting={isSelecting}
                      isSelected={selectedIds.has(video.id)}
                      onSelect={() => toggleSelect(video.id)}
                      onLongPress={() => handleLongPress(video.id)}
                      onRestore={() => {
                        setConfirmAction({
                          type: 'restore',
                          ids: [video.id],
                          title: '恢复视频',
                          message: '确定要恢复这个视频吗？'
                        });
                      }}
                      onDelete={() => {
                        setConfirmAction({
                          type: 'delete',
                          ids: [video.id],
                          title: '永久删除',
                          message: '确定永久删除这个视频吗？此操作不可恢复。'
                        });
                      }}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>

      {/* 底部操作栏 */}
      {(isSelecting && selectedIds.size > 0) && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#0a0a0d]/95 backdrop-blur-xl border-t border-white/10 p-4 pb-safe">
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => {
                setConfirmAction({
                  type: 'restore',
                  ids: Array.from(selectedIds),
                  title: '恢复视频',
                  message: `确定要恢复选中的 ${selectedIds.size} 个视频吗？`
                });
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-cyber-lime/20 hover:bg-cyber-lime/30 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
              <span className="text-cyber-lime font-medium">恢复 ({selectedIds.size})</span>
            </button>
            <button
              onClick={() => {
                setConfirmAction({
                  type: 'delete',
                  ids: Array.from(selectedIds),
                  title: '永久删除',
                  message: `确定永久删除选中的 ${selectedIds.size} 个视频吗？此操作不可恢复。`
                });
              }}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-red-500/20 hover:bg-red-500/30 rounded-xl transition-colors"
            >
              <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
              <span className="text-red-400 font-medium">删除 ({selectedIds.size})</span>
            </button>
          </div>
        </div>
      )}

      {/* 非选择模式下的快捷操作 */}
      {!isSelecting && videos.length > 0 && oldVideoIds.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-[#0a0a0d]/95 backdrop-blur-xl border-t border-white/10 p-4 pb-safe">
          <button
            onClick={() => {
              setConfirmAction({
                type: 'deleteOld',
                ids: oldVideoIds,
                title: '清理旧视频',
                message: `确定永久删除 ${oldVideoIds.length} 个非今天删除的视频吗？此操作不可恢复。`
              });
            }}
            className="w-full flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 rounded-xl transition-colors border border-white/10"
          >
            <svg className="w-5 h-5 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <span className="text-gray-300 font-medium">清理非今天的视频 ({oldVideoIds.length})</span>
          </button>
        </div>
      )}

      {/* 确认弹窗 */}
      {confirmAction && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/80" onClick={() => setConfirmAction(null)} />
          <div className="relative bg-[#1a1a1f] rounded-2xl p-6 max-w-sm w-full border border-white/10 shadow-2xl animate-scale-in">
            <h3 className="text-white text-lg font-bold text-center mb-2">{confirmAction.title}</h3>
            <p className="text-gray-400 text-sm text-center mb-6">{confirmAction.message}</p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors"
              >
                取消
              </button>
              <button
                onClick={() => {
                  if (confirmAction.type === 'restore') {
                    restoreVideos(confirmAction.ids!);
                  } else {
                    permanentlyDelete(confirmAction.ids!);
                  }
                  setConfirmAction(null);
                }}
                className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                  confirmAction.type === 'restore'
                    ? 'bg-cyber-lime text-black hover:bg-cyber-lime/90'
                    : 'bg-red-500 text-white hover:bg-red-600'
                }`}
              >
                确定
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && createPortal(
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[99999] px-4 py-2 bg-black/90 backdrop-blur-xl rounded-full text-white text-sm font-medium shadow-xl border border-white/10 animate-fade-in">
          {toast}
        </div>,
        document.body
      )}

      <style>{`
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-scale-in { animation: scale-in 0.2s ease-out; }
        @keyframes fade-in {
          from { opacity: 0; transform: translate(-50%, -10px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-fade-in { animation: fade-in 0.2s ease-out; }
      `}</style>
    </div>,
    document.body
  );
};

// 视频项组件
interface VideoItemProps {
  video: DeletedVideo;
  isSelecting: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onLongPress: () => void;
  onRestore: () => void;
  onDelete: () => void;
}

const VideoItem: React.FC<VideoItemProps> = ({
  video,
  isSelecting,
  isSelected,
  onSelect,
  onLongPress,
  onRestore,
  onDelete
}) => {
  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);
  const [showActions, setShowActions] = useState(false);

  const handleTouchStart = () => {
    if (!isSelecting) {
      longPressTimer.current = setTimeout(() => {
        onLongPress();
      }, 500);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  const handleClick = () => {
    if (isSelecting) {
      onSelect();
    } else {
      setShowActions(!showActions);
    }
  };

  return (
    <div
      className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
        isSelected ? 'bg-cyber-lime/10 border border-cyber-lime/30' : 'bg-white/5 hover:bg-white/8 border border-transparent'
      }`}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
      onClick={handleClick}
    >
      {/* 选择框 */}
      {isSelecting && (
        <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
          isSelected ? 'bg-cyber-lime border-cyber-lime' : 'border-gray-500'
        }`}>
          {isSelected && (
            <svg className="w-3.5 h-3.5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          )}
        </div>
      )}

      {/* 封面 */}
      <div className="relative w-24 h-14 rounded-lg overflow-hidden bg-gray-800 shrink-0">
        <img
          src={video.pic}
          alt={video.title}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
        <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-black/80 rounded text-[10px] text-white font-medium">
          {formatDuration(video.duration)}
        </div>
      </div>

      {/* 信息 */}
      <div className="flex-1 min-w-0">
        <h4 className="text-white text-sm font-medium line-clamp-2 leading-snug">{video.title}</h4>
        <div className="flex items-center gap-2 mt-1">
          <p className="text-gray-500 text-xs truncate">
            {video.uploader?.name || '未知UP主'}
          </p>
          <span className="text-gray-600 text-xs">·</span>
          <p className="text-gray-500 text-xs shrink-0">
            {new Date(video.pubdate).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
          </p>
        </div>
      </div>

      {/* 操作按钮 */}
      {!isSelecting && (
        <div className={`flex items-center gap-1 transition-opacity ${showActions ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
          <button
            onClick={(e) => { e.stopPropagation(); onRestore(); }}
            className="p-2 rounded-lg hover:bg-cyber-lime/20 transition-colors"
            title="恢复"
          >
            <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="p-2 rounded-lg hover:bg-red-500/20 transition-colors"
            title="永久删除"
          >
            <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
};

export default RecycleBin;
