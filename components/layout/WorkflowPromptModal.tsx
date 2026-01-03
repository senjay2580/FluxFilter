import React, { useState, useEffect, memo } from 'react';
import { createPortal } from 'react-dom';
import type { WorkflowOverview } from '../../lib/workflow-service';
import { getTodayWorkflowOverview } from '../../lib/workflow-service';
import { getStoredUserId } from '../../lib/auth';

interface WorkflowPromptModalProps {
  onClose: () => void;
  onEnter: () => void;
}

const WorkflowPromptModal: React.FC<WorkflowPromptModalProps> = memo(({ onClose, onEnter }) => {
  const [overview, setOverview] = useState<WorkflowOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadOverview = async () => {
      try {
        const userId = getStoredUserId();
        if (!userId) {
          setLoading(false);
          return;
        }

        const data = await getTodayWorkflowOverview();
        setOverview(data);
      } catch (err) {
        console.error('加载工作流概览失败:', err);
      } finally {
        setLoading(false);
      }
    };

    loadOverview();
  }, []);

  if (loading || !overview) return null;

  const completionPercentage = Math.round((overview.completedCount / overview.totalCount) * 100);
  const isCompleted = overview.completedCount === overview.totalCount;

  return createPortal(
    <div className="fixed inset-0 z-[99998] flex items-center justify-center p-4">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
        style={{ animation: 'fadeIn 0.3s ease-out' }}
      />

      {/* 弹窗内容 */}
      <div
        className="relative w-full max-w-sm rounded-3xl overflow-hidden"
        style={{
          backgroundColor: 'rgba(10,10,18,0.98)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(163,230,53,0.2)',
          animation: 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        {/* 关闭按钮 */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors z-10"
        >
          <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        {/* 内容 */}
        <div className="p-6">
          {/* 头部 - 完成状态 */}
          <div className="flex items-center gap-3 mb-6">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
              isCompleted
                ? 'bg-cyber-lime/20'
                : 'bg-orange-500/20'
            }`}>
              {isCompleted ? (
                <svg className="w-6 h-6 text-cyber-lime" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-orange-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              )}
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">
                {isCompleted ? '今日任务完成！' : '今日工作流'}
              </h2>
              <p className="text-xs text-gray-500">
                {isCompleted ? '继续保持！' : '继续加油！'}
              </p>
            </div>
          </div>

          {/* 进度条 */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-gray-400">完成进度</span>
              <span className="text-sm font-mono text-cyber-lime">
                {overview.completedCount}/{overview.totalCount}
              </span>
            </div>
            <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyber-lime to-lime-400 transition-all duration-500"
                style={{ width: `${completionPercentage}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {completionPercentage}% 完成
            </p>
          </div>

          {/* 节点列表 */}
          <div className="mb-6 space-y-2">
            {overview.nodes.map(node => {
              const progress = overview.progress.find(p => p.node_id === node.id);
              const isNodeCompleted = progress?.is_completed || false;

              return (
                <div
                  key={node.id}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    isNodeCompleted
                      ? 'bg-cyber-lime/10'
                      : 'bg-white/5 hover:bg-white/10'
                  }`}
                >
                  {/* 状态指示 */}
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${
                    isNodeCompleted
                      ? 'bg-cyber-lime'
                      : 'bg-white/20'
                  }`}>
                    {isNodeCompleted && (
                      <svg className="w-3 h-3 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>

                  {/* 节点信息 */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${
                      isNodeCompleted ? 'text-cyber-lime' : 'text-white'
                    }`}>
                      {node.name}
                    </p>
                    <p className="text-xs text-gray-500 truncate">
                      {node.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* CTA 按钮 */}
          <button
            onClick={onEnter}
            className="w-full py-3 bg-gradient-to-r from-cyber-lime to-lime-400 text-black font-semibold rounded-xl hover:shadow-lg hover:shadow-cyber-lime/50 transition-all active:scale-95"
          >
            进入工作流
          </button>

          {/* 关闭提示 */}
          <button
            onClick={onClose}
            className="w-full mt-2 py-2 text-gray-400 hover:text-white text-sm transition-colors"
          >
            稍后再看
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
});

WorkflowPromptModal.displayName = 'WorkflowPromptModal';

export default WorkflowPromptModal;
