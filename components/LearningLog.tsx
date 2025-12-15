import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase, isSupabaseConfigured, getLearningLogs, createLearningLog, updateLearningLog, deleteLearningLog } from '../lib/supabase';
import { getStoredUserId } from '../lib/auth';
import type { LearningLog as LearningLogType } from '../lib/database.types';

interface LearningLogProps {
  isOpen: boolean;
  onClose: () => void;
  initialVideoUrl?: string;
  initialVideoTitle?: string;
}

const LearningLog: React.FC<LearningLogProps> = ({ 
  isOpen, 
  onClose, 
  initialVideoUrl = '', 
  initialVideoTitle = '' 
}) => {
  const [entries, setEntries] = useState<LearningLogType[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editContent, setEditContent] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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

  // 初始化时添加新条目
  useEffect(() => {
    if (isOpen && initialVideoUrl && !loading) {
      const userId = getStoredUserId();
      if (!userId || !isSupabaseConfigured) return;

      const existingEntry = entries.find(e => e.video_url === initialVideoUrl);
      if (!existingEntry) {
        createLearningLog(userId, {
          video_url: initialVideoUrl,
          video_title: initialVideoTitle,
        }).then((newEntry) => {
          setEntries(prev => [newEntry, ...prev]);
        }).catch(err => {
          console.error('创建日志失败:', err);
        });
      }
    }
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
    const trimmed = editContent.trim().slice(0, 200);
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

  // 筛选条目
  const filteredEntries = entries.filter(e => 
    e.video_title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.summary.toLowerCase().includes(searchTerm.toLowerCase()) ||
    e.video_url.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex flex-col bg-[#0a0a0f] animate-page-enter">
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
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
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

      {/* 日志列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filteredEntries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <p className="text-gray-500">暂无学习记录</p>
          </div>
        ) : (
          filteredEntries.map((entry, index) => (
            <div 
              key={entry.id}
              className="bg-white/5 border border-white/10 rounded-xl p-3 hover:border-cyber-lime/30 transition-colors animate-list-item"
              style={{ animationDelay: `${index * 50}ms` }}
            >
              <div className="flex gap-3">
                <div className="shrink-0 flex flex-col items-center gap-1">
                  <a 
                    href={entry.video_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-9 h-9 rounded-full bg-cyber-lime/10 border border-cyber-lime/30 flex items-center justify-center hover:bg-cyber-lime/20 transition-colors"
                    title={entry.video_url}
                  >
                    <svg className="w-4 h-4 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                  <p className="text-[10px] text-gray-600 text-center">
                    {new Date(entry.created_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })}
                  </p>
                </div>

                <div className="flex-1">
                  <p className="text-[10px] text-gray-500 mb-1 uppercase tracking-wide">学习总结</p>
                  {editingId === entry.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value.slice(0, 200))}
                        placeholder={entry.video_title || '输入总结...'}
                        className="w-full h-20 px-3 py-2 bg-black/30 border border-cyber-lime/30 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none resize-none"
                        maxLength={200}
                        autoFocus
                      />
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-gray-500">{editContent.length}/200</span>
                        <div className="flex gap-2">
                          <button onClick={() => setEditingId(null)} className="px-3 py-1 text-xs text-gray-400 hover:text-white transition-colors">取消</button>
                          <button onClick={() => handleSaveEdit(entry.id)} className="px-3 py-1 text-xs bg-cyber-lime text-black rounded-lg hover:bg-cyber-lime/90 transition-colors">保存</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p 
                      onClick={() => startEdit(entry)}
                      className={`text-sm cursor-pointer hover:bg-white/5 rounded-lg p-2 -m-2 transition-colors ${entry.summary ? 'text-white' : 'text-gray-500 italic'}`}
                    >
                      {entry.summary || entry.video_title || '点击添加总结...'}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-3 pt-3 border-t border-white/5">
                <button onClick={() => handleClearSummary(entry.id)} className="px-3 py-1.5 text-xs text-gray-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors">清空总结</button>
                <button onClick={() => setDeleteConfirmId(entry.id)} className="px-3 py-1.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg transition-colors">删除</button>
              </div>
            </div>
          ))
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
        .animate-page-enter { animation: page-enter 0.3s ease-out; }
        .animate-slide-down { animation: slide-down 0.4s ease-out; }
        .animate-list-item { animation: list-item 0.4s ease-out both; }
        .animate-blob { animation: blob 8s ease-in-out infinite; }
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>,
    document.body
  );
};

export default LearningLog;
