import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { isSupabaseConfigured, getLearningLogs, createLearningLog, updateLearningLog, deleteLearningLog, createNote } from '../../lib/supabase';
import { getStoredUserId } from '../../lib/auth';
import type { LearningLog as LearningLogType } from '../../lib/database.types';
import CustomDatePicker from '../layout/CustomDatePicker';
import { DateFilter } from '../../types';
import { useSwipeBack } from '../../hooks/useSwipeBack';

interface LearningLogProps {
  isOpen: boolean;
  onClose: () => void;
  initialVideoUrl?: string;
  initialVideoTitle?: string;
  initialVideoCover?: string;
}

const LearningLog: React.FC<LearningLogProps> = ({
  isOpen,
  onClose,
  initialVideoUrl = '',
  initialVideoTitle = '',
  initialVideoCover = ''
}) => {
  const [entries, setEntries] = useState<LearningLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null); // 新增日期筛选
  const [selectionMode, setSelectionMode] = useState(false); // 批量选择模式
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set()); // 选中的 ID
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [dateFilter, setDateFilter] = useState<DateFilter>({});
  const [flippedIds, setFlippedIds] = useState<Set<number>>(new Set()); // 翻转的卡片 ID
  const longPressTimer = React.useRef<NodeJS.Timeout | null>(null);

  // 左滑返回手势
  const swipeHandlers = useSwipeBack({ onBack: onClose });

  // 翻转卡片
  const toggleFlip = (id: number) => {
    setFlippedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  };

  // 从数据库加载数据
  const loadEntries = useCallback(async () => {
    const userId = getStoredUserId();
    if (!userId || !isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    try {
      const data = await getLearningLogs(userId);
      setEntries(data);
    } catch (err) {
      console.error('加载学习日志失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      loadEntries();
    }
  }, [isOpen, loadEntries]);

  // 初始化时添加新条目 - 使用 ref 避免重复创建
  const creatingRef = React.useRef(false);
  const createdUrlRef = React.useRef<string | null>(null);

  useEffect(() => {
    // 条件检查
    if (!isOpen || !initialVideoUrl || loading) return;

    // 防止重复创建：同一个 URL 只创建一次
    if (creatingRef.current || createdUrlRef.current === initialVideoUrl) return;

    // 检查是否已存在于列表中
    if (entries.some(e => e.video_url === initialVideoUrl)) {
      createdUrlRef.current = initialVideoUrl;
      return;
    }

    const userId = getStoredUserId();
    if (!userId || !isSupabaseConfigured) return;

    // 标记正在创建
    creatingRef.current = true;

    createLearningLog(userId, {
      video_url: initialVideoUrl,
      video_title: initialVideoTitle,
      video_cover: initialVideoCover,
    }).then((newEntry) => {
      createdUrlRef.current = initialVideoUrl;
      setEntries(prev => {
        // 再次检查避免重复
        if (prev.some(e => e.id === newEntry.id || e.video_url === initialVideoUrl)) {
          return prev;
        }
        return [newEntry, ...prev];
      });
    }).catch(err => {
      console.error('创建日志失败:', err);
    }).finally(() => {
      creatingRef.current = false;
    });
  }, [isOpen, initialVideoUrl, initialVideoTitle, loading, entries]);

  // 确认删除条目
  const confirmDelete = async (id: number) => {
    try {
      await deleteLearningLog(id);
      setEntries(prev => prev.filter(e => e.id !== id));
      showToast('已删除');
    } catch (err) {
      console.error('删除失败:', err);
      showToast('删除失败');
    }
    setDeleteConfirmId(null);
  };

  // 清空总结
  const handleClearSummary = async (id: number) => {
    try {
      await updateLearningLog(id, { summary: '' });
      setEntries(prev => prev.map(e => e.id === id ? { ...e, summary: '' } : e));
    } catch (err) {
      console.error('清空失败:', err);
    }
  };

  // 保存编辑
  const handleSaveEdit = async (id: number) => {
    const trimmed = editContent.trim().slice(0, 500);
    try {
      await updateLearningLog(id, { summary: trimmed });
      setEntries(prev => prev.map(e => e.id === id ? { ...e, summary: trimmed } : e));
      showToast('已保存');
    } catch (err) {
      console.error('保存失败:', err);
      showToast('保存失败');
    }
    setEditingId(null);
    setEditContent('');
  };

  // 开始编辑
  const startEdit = (entry: LearningLogType) => {
    setEditingId(entry.id);
    setEditContent(entry.summary);
  };

  // 批量删除
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`确定要删除选中的 ${selectedIds.size} 条记录吗？`)) return;

    try {
      showToast('正在删除...');
      const idsToDelete = Array.from(selectedIds);
      await Promise.all(idsToDelete.map(id => deleteLearningLog(id)));

      setEntries(prev => prev.filter(e => !selectedIds.has(e.id)));
      setSelectionMode(false);
      setSelectedIds(new Set());
      showToast(`已成功删除 ${idsToDelete.length} 条记录`);
    } catch (err) {
      console.error('批量删除失败:', err);
      showToast('删除过程中出错');
    }
  };

  const handleToggleSelect = (id: number) => {
    const newSelected = new Set(selectedIds);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedIds(newSelected);
  };

  const handleSelectAll = (records: LearningLogType[]) => {
    const allVisibleIds = records.map(r => r.id);
    const areAllSelected = allVisibleIds.every(id => selectedIds.has(id));

    const newSelected = new Set(selectedIds);
    if (areAllSelected) {
      allVisibleIds.forEach(id => newSelected.delete(id));
    } else {
      allVisibleIds.forEach(id => newSelected.add(id));
    }
    setSelectedIds(newSelected);
  };

  const handleLongPress = (id: number) => {
    if (selectionMode) return;
    setSelectionMode(true);
    setSelectedIds(new Set([id]));
  };

  const startLongPressTimer = (id: number) => {
    longPressTimer.current = setTimeout(() => handleLongPress(id), 600);
  };

  const clearLongPressTimer = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // 导出 JSON
  const handleExport = () => {
    const exportData = entries.map(e => ({
      video_url: e.video_url,
      video_title: e.video_title,
      summary: e.summary,
      created_at: e.created_at,
    }));

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `learning-log-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('导出成功');
  };

  // 一键归档至笔记
  const handleArchiveToNote = useCallback(async (date: string, records: LearningLogType[]) => {
    const userId = getStoredUserId();
    if (!userId || !isSupabaseConfigured) return;

    try {
      showToast('正在归档...');
      const title = `【${date}】今日学习足迹汇总`;

      // 构建 HTML 内容
      let htmlContent = `<div style="font-family: sans-serif; line-height: 1.6; color: #333;">`;
      records.forEach((record, idx) => {
        const titleText = record.summary || record.video_title || '未命名记录';
        htmlContent += `
          <div style="margin-bottom: 24px; padding: 16px; border-radius: 12px; background: rgba(0,0,0,0.02); border: 1px solid rgba(0,0,0,0.05);">
            <p style="margin: 0 0 10px 0; font-size: 17px; color: #1a1a1a;"><strong>${idx + 1}. ${titleText}</strong></p>
            <div style="margin: 0; padding: 10px; background: #fff; border-radius: 8px; border: 1px solid #eee;">
              <p style="margin: 0; font-size: 13px; color: #666; margin-bottom: 4px;">视频地址：</p>
              <a href="${record.video_url}" target="_blank" style="color: #007AFF; background: #eef7ff; padding: 2px 6px; border-radius: 4px; text-decoration: none; font-size: 14px; font-weight: 500; word-break: break-all; border: 1px solid #d0e8ff;">${record.video_url}</a>
            </div>
          </div>
        `;
      });
      htmlContent += `</div>`;

      // 提取预览
      const preview = records.map(r => r.video_title || '学习记录').join(' | ').slice(0, 150);

      await createNote(userId, {
        title,
        content: htmlContent,
        preview,
        color: 'green',
        category: '学习日志'
      });

      showToast('已同步至笔记中心');
    } catch (err) {
      console.error('归档失败:', err);
      showToast('归档失败');
    }
  }, []);

  // 应用日期筛选
  const handleDateApply = (filter: DateFilter) => {
    setDateFilter(filter);
    if (filter.year !== undefined && filter.month !== undefined && filter.day !== undefined) {
      const d = new Date(filter.year, filter.month, filter.day);
      setSelectedDate(d.toLocaleDateString());
    }
  };

  // 筛选条目
  const filteredEntries = entries.filter(e => {
    const matchesSearch =
      e.video_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
      e.video_url.toLowerCase().includes(searchTerm.toLowerCase());

    const entryDate = new Date(e.created_at).toLocaleDateString();
    const matchesDate = !selectedDate || entryDate === selectedDate;

    return matchesSearch && matchesDate;
  });

  // 按日期分组
  const groupedEntries = filteredEntries.reduce((groups: Record<string, LearningLogType[]>, entry) => {
    const date = new Date(entry.created_at).toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(entry);
    return groups;
  }, {});

  // 获取所有唯一日期用于筛选
  const allDates = Array.from(new Set(entries.map(e =>
    new Date(e.created_at).toLocaleDateString()
  ))).sort((a, b) => new Date(b).getTime() - new Date(a).getTime());

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-[99999] flex flex-col bg-[#0a0a0f] animate-page-enter"
      {...swipeHandlers}
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-cyber-lime/5 rounded-full blur-3xl animate-blob" />
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-cyan-500/5 rounded-full blur-3xl animate-blob animation-delay-2000" />
      </div>

      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-xl border-b border-white/10 animate-slide-down">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={onClose} className="p-2 -ml-2 rounded-xl hover:bg-white/10 transition-colors">
            <svg className="w-6 h-6 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="font-bold text-xl text-white">学习日志</h1>
            <p className="text-xs text-gray-500">{entries.length} 条记录</p>
          </div>
          {/* 导出按钮 */}
          <button
            onClick={handleExport}
            className="p-2 rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors"
            title="导出 JSON"
          >
            <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        </div>

        {/* 搜索栏 */}
        <div className="px-4 pb-3">
          <div className="relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="搜索日志..."
              className="w-full pl-11 pr-4 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50"
            />
          </div>
        </div>
      </div>

      {/* 批量操作工具栏 */}
      {selectionMode && (
        <div className="mx-4 mb-3 p-2 bg-cyber-lime/10 border border-cyber-lime/30 rounded-xl flex items-center justify-between animate-slide-down">
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectionMode(false);
                setSelectedIds(new Set());
              }}
              className="px-3 py-1 text-xs text-gray-400 hover:text-white transition-colors"
            >
              取消
            </button>
            <span className="text-xs font-mono text-cyber-lime">已选中 {selectedIds.size}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleSelectAll(filteredEntries)}
              className="px-3 py-1 text-xs bg-white/5 hover:bg-white/10 text-white rounded-lg transition-colors border border-white/10"
            >
              全选
            </button>
            <button
              onClick={handleBatchDelete}
              disabled={selectedIds.size === 0}
              className="px-3 py-1 text-xs bg-red-500/80 hover:bg-red-500 text-white rounded-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_0_10px_rgba(239,68,68,0.2)]"
            >
              批量删除
            </button>
          </div>
        </div>
      )}

      {/* 日期筛选工具栏 */}
      <div className="px-4 pb-3 pt-2 flex items-center gap-2">
        <button
          onClick={() => setIsDatePickerOpen(true)}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all ${selectedDate
            ? 'bg-cyber-lime text-black shadow-[0_0_15px_rgba(186,255,41,0.3)]'
            : 'bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10'
            }`}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          {selectedDate ? selectedDate : '按日期筛选'}
        </button>

        {selectedDate && (
          <button
            onClick={() => {
              setSelectedDate(null);
              setDateFilter({});
            }}
            className="p-2 rounded-xl bg-white/5 text-gray-400 hover:text-white hover:bg-white/10 border border-white/10 transition-colors"
            title="清除筛选"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        )}
      </div>

      {/* 日志列表 (时间轴模式) */}
      <div className="flex-1 overflow-y-auto p-4 relative custom-scrollbar">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin" />
          </div>
        ) : Object.keys(groupedEntries).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-gray-500">暂无学习记录</p>
          </div>
        ) : (
          <div className="relative pl-8">
            {/* 时间轴中间线 */}
            <div className="absolute left-[11px] top-0 bottom-0 w-[2px] bg-gradient-to-b from-cyber-lime/50 via-cyber-lime/20 to-transparent" />

            {Object.entries(groupedEntries).map(([date, dateEntries], groupIndex) => (
              <div key={date} className="mb-8 last:mb-4 relative">
                {/* 日期标题 */}
                <div className="relative flex items-center justify-between mb-4">
                  {/* 时间轴节点 */}
                  <div className="absolute -left-8 top-1/2 -translate-y-1/2 flex items-center">
                    <div className="w-6 h-6 rounded-full bg-cyber-dark border-2 border-cyber-lime flex items-center justify-center z-10">
                      <div className="w-2 h-2 rounded-full bg-cyber-lime" />
                    </div>
                  </div>
                  <span className="text-xs font-bold text-cyber-lime bg-cyber-dark/80 backdrop-blur-md px-3 py-1 rounded-full border border-cyber-lime/20 ml-1">
                    {date}
                  </span>
                  <button
                    onClick={() => handleArchiveToNote(date, dateEntries)}
                    className="text-[10px] px-2 py-1 bg-cyber-lime/10 hover:bg-cyber-lime/20 text-cyber-lime border border-cyber-lime/20 rounded-lg transition-all flex items-center gap-1 group/btn"
                  >
                    <svg className="w-3 h-3 group-hover/btn:scale-110 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    归档至笔记
                  </button>
                </div>

                {/* 条目列表 */}
                <div className="space-y-3 ml-1">
                  {dateEntries.map((entry, index) => (
                    <div
                      key={entry.id}
                      className={`relative group transition-all duration-300 ${selectionMode ? 'pl-2' : ''}`}
                      style={{ animationDelay: `${(groupIndex * 3 + index) * 50}ms` }}
                      onMouseDown={() => startLongPressTimer(entry.id)}
                      onMouseUp={clearLongPressTimer}
                      onMouseLeave={clearLongPressTimer}
                      onTouchStart={() => startLongPressTimer(entry.id)}
                      onTouchEnd={clearLongPressTimer}
                    >
                      {/* 时间轴连接线 */}
                      <div className="absolute -left-[29px] top-0 bottom-0 w-[2px] bg-cyber-lime/10" />
                      
                      {/* 选择框 */}
                      {selectionMode && (
                        <div
                          className="absolute -left-[5px] top-1/2 -translate-y-1/2 z-10 cursor-pointer p-2"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleSelect(entry.id);
                          }}
                        >
                          <div className={`w-5 h-5 rounded-full border-2 transition-all flex items-center justify-center ${selectedIds.has(entry.id)
                            ? 'bg-cyber-lime border-cyber-lime shadow-[0_0_10px_rgba(186,255,41,0.4)]'
                            : 'bg-black/40 border-gray-600 hover:border-cyber-lime/50'
                            }`}>
                            {selectedIds.has(entry.id) && (
                              <svg className="w-3.5 h-3.5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </div>
                        </div>
                      )}

                      {/* 翻转卡片容器 */}
                      <div className="relative h-[180px]" style={{ perspective: '1000px' }}>
                        <div 
                          className={`relative w-full h-full transition-transform duration-500 ${flippedIds.has(entry.id) ? '[transform:rotateY(180deg)]' : ''}`}
                          style={{ transformStyle: 'preserve-3d' }}
                        >
                          {/* 正面 - 学习笔记 */}
                          <div 
                            className={`absolute inset-0 bg-[#1a1a1a] border rounded-2xl overflow-hidden ${selectionMode && selectedIds.has(entry.id)
                              ? 'border-cyber-lime/60 shadow-[0_0_15px_rgba(186,255,41,0.1)]'
                              : 'border-white/5'
                              }`}
                            style={{ backfaceVisibility: 'hidden' }}
                          >
                            {/* 内容区域 */}
                            <div className="p-4 h-full flex flex-col">
                              {editingId === entry.id ? (
                                <div className="flex-1 flex flex-col" onClick={e => e.stopPropagation()}>
                                  <textarea
                                    value={editContent}
                                    onChange={(e) => setEditContent(e.target.value.slice(0, 500))}
                                    placeholder={entry.video_title || '输入学习心得...'}
                                    className="flex-1 w-full px-3 py-2 bg-black/40 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/30 transition-all resize-none"
                                    autoFocus
                                  />
                                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                                    <span className="text-[10px] font-mono text-gray-600">{editContent.length}/500</span>
                                    <div className="flex gap-2">
                                      <button onClick={() => setEditingId(null)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-white transition-colors">放弃</button>
                                      <button onClick={() => handleSaveEdit(entry.id)} className="px-4 py-1.5 text-xs bg-cyber-lime text-black font-bold rounded-lg transition-all">保存</button>
                                    </div>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div
                                    onClick={(e) => {
                                      if (selectionMode) {
                                        e.stopPropagation();
                                        handleToggleSelect(entry.id);
                                      } else {
                                        startEdit(entry);
                                      }
                                    }}
                                    className={`flex-1 text-sm leading-relaxed line-clamp-4 cursor-pointer ${entry.summary ? 'text-gray-300' : 'text-gray-500 italic'}`}
                                  >
                                    {entry.summary || entry.video_title || '点击记录学习心得...'}
                                  </div>
                            
                                  {/* 底部信息栏 */}
                                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[10px] text-gray-500 font-mono">
                                        {new Date(entry.created_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      {!selectionMode && (
                                        <>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleClearSummary(entry.id); }}
                                            className="text-[10px] text-gray-500 hover:text-white transition-colors"
                                          >
                                            清空
                                          </button>
                                          <button
                                            onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(entry.id); }}
                                            className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
                                          >
                                            删除
                                          </button>
                                        </>
                                      )}
                                      {/* 翻转按钮 */}
                                      {(entry.video_cover || entry.video_title) && (
                                        <button
                                          onClick={(e) => { e.stopPropagation(); toggleFlip(entry.id); }}
                                          className="p-1 rounded hover:bg-white/5 transition-colors ml-1"
                                          title="查看视频信息"
                                        >
                                          <svg className="w-4 h-4 text-gray-500 hover:text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <rect x="2" y="3" width="20" height="14" rx="2" />
                                            <polygon points="10 8 16 11 10 14 10 8" fill="currentColor" />
                                          </svg>
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </>
                              )}
                            </div>
                          </div>

                          {/* 背面 - 视频信息 */}
                          <div 
                            className="absolute inset-0 bg-[#1a1a1a] border border-white/5 rounded-2xl overflow-hidden cursor-pointer"
                            style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
                            onClick={() => entry.video_url && window.open(entry.video_url, '_blank')}
                          >
                            {/* 视频封面 */}
                            {entry.video_cover ? (
                              <div className="relative h-[120px] overflow-hidden">
                                <img 
                                  src={entry.video_cover} 
                                  alt={entry.video_title}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-[#1a1a1a] via-transparent to-transparent" />
                                {/* 播放图标 */}
                                <div className="absolute inset-0 flex items-center justify-center">
                                  <div className="w-12 h-12 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center">
                                    <svg className="w-5 h-5 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                                      <polygon points="5 3 19 12 5 21 5 3" />
                                    </svg>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="h-[120px] bg-gradient-to-br from-gray-800 to-gray-900 flex items-center justify-center">
                                <svg className="w-12 h-12 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                  <rect x="2" y="3" width="20" height="14" rx="2" />
                                  <polygon points="10 8 16 11 10 14 10 8" fill="currentColor" />
                                </svg>
                              </div>
                            )}
                            
                            {/* 视频标题 */}
                            <div className="p-3">
                              <p className="text-sm text-white font-medium line-clamp-2 leading-tight">
                                {entry.video_title || '未知视频'}
                              </p>
                            </div>

                            {/* 翻转回去按钮 */}
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleFlip(entry.id); }}
                              className="absolute top-2 right-2 p-1.5 rounded-full bg-black/50 backdrop-blur-sm hover:bg-black/70 transition-colors"
                              title="返回笔记"
                            >
                              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M19 12H5M12 19l-7-7 7-7" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/90 border border-white/20 rounded-full text-white text-sm z-[999999]">
          {toast}
        </div>
      )}

      {/* 删除确认框 */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-6" onClick={(e) => e.stopPropagation()}>
          <div className="absolute inset-0 bg-black/80" onClick={() => setDeleteConfirmId(null)} />
          <div className="relative bg-[#1a1a1f] rounded-2xl p-6 max-w-xs w-full border border-white/10 shadow-2xl">
            <button onClick={() => setDeleteConfirmId(null)} className="absolute top-3 right-3 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors">
              <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
            <h3 className="text-white text-lg font-bold text-center mb-2">删除日志</h3>
            <p className="text-gray-400 text-sm text-center mb-5">确定要删除这条学习记录吗？</p>
            <button onClick={() => confirmDelete(deleteConfirmId)} className="w-full py-3 bg-red-500 hover:bg-red-600 rounded-xl text-white font-medium transition-colors">确认删除</button>
          </div>
        </div>
      )}

      {/* 动画样式 */}
      <style>{`
        @keyframes page-enter {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slide-down {
          from { opacity: 0; transform: translateY(-20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes list-item {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes blob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.1); }
          66% { transform: translate(-20px, 20px) scale(0.9); }
        }
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { bg: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.05); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(186, 255, 41, 0.2); }
      `}</style>
      <CustomDatePicker
        isOpen={isDatePickerOpen}
        onClose={() => setIsDatePickerOpen(false)}
        onApply={handleDateApply}
        currentFilter={dateFilter}
        videos={entries}
      />
    </div>,
    document.body
  );
};

export default LearningLog;
