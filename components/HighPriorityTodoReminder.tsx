import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
}

interface HighPriorityTodoReminderProps {
  onNavigateToTodo?: () => void;
}

const STORAGE_KEY = 'fluxf-todos';
const DISMISS_KEY = 'fluxf-todo-reminder-dismiss';

/**
 * 检查今日是否已关闭提醒
 */
function isDismissedToday(): boolean {
  const dismissDate = localStorage.getItem(DISMISS_KEY);
  if (!dismissDate) return false;
  
  const today = new Date().toDateString();
  return dismissDate === today;
}

/**
 * 设置今日不再提醒
 */
function setDismissToday(): void {
  localStorage.setItem(DISMISS_KEY, new Date().toDateString());
}

const HighPriorityTodoReminder: React.FC<HighPriorityTodoReminderProps> = ({ onNavigateToTodo }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [highPriorityTodos, setHighPriorityTodos] = useState<Todo[]>([]);
  const [isAnimatingOut, setIsAnimatingOut] = useState(false);

  // 加载高优先级待办
  useEffect(() => {
    // 延迟显示，等待应用加载完成
    const timer = setTimeout(() => {
      // 检查是否今日已关闭
      if (isDismissedToday()) return;

      try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (!saved) return;

        const todos: Todo[] = JSON.parse(saved);
        // 筛选未完成的高优先级任务
        const highPriority = todos
          .filter(t => t.priority === 'high' && !t.completed)
          .slice(0, 5); // 最多5个

        if (highPriority.length > 0) {
          setHighPriorityTodos(highPriority);
          setIsVisible(true);
        }
      } catch (e) {
        console.error('加载待办失败:', e);
      }
    }, 1500); // 延迟1.5秒显示

    return () => clearTimeout(timer);
  }, []);

  // 关闭弹窗（带动画）
  const handleClose = useCallback(() => {
    setIsAnimatingOut(true);
    setTimeout(() => {
      setIsVisible(false);
      setIsAnimatingOut(false);
    }, 300);
  }, []);

  // 今日不再提醒
  const handleDismissToday = useCallback(() => {
    setDismissToday();
    handleClose();
  }, [handleClose]);

  // 跳转到待办
  const handleNavigate = useCallback(() => {
    handleClose();
    setTimeout(() => {
      onNavigateToTodo?.();
    }, 350);
  }, [handleClose, onNavigateToTodo]);

  // 完成任务
  const handleCompleteTodo = useCallback((id: string) => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) return;

      const todos: Todo[] = JSON.parse(saved);
      const updated = todos.map(t => t.id === id ? { ...t, completed: true } : t);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));

      // 更新本地状态
      setHighPriorityTodos(prev => prev.filter(t => t.id !== id));

      // 如果没有剩余任务，关闭弹窗
      if (highPriorityTodos.length <= 1) {
        handleClose();
      }
    } catch (e) {
      console.error('更新待办失败:', e);
    }
  }, [highPriorityTodos.length, handleClose]);

  if (!isVisible) return null;

  return createPortal(
    <div 
      className={`fixed inset-0 z-[99998] flex items-center justify-center p-4 ${
        isAnimatingOut ? 'animate-fade-out' : 'animate-fade-in'
      }`}
      onClick={handleClose}
    >
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      {/* 弹窗内容 */}
      <div 
        className={`relative w-full max-w-md bg-gradient-to-b from-[#1a1a24] to-[#0c0c14] border border-white/10 rounded-3xl shadow-2xl overflow-hidden ${
          isAnimatingOut ? 'animate-scale-out' : 'animate-scale-in'
        }`}
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部装饰 */}
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-rose-500 via-pink-500 to-rose-500" />

        {/* 头部 */}
        <div className="px-6 pt-6 pb-4">
          <div className="flex items-center gap-3">
            {/* 图标 */}
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 9v4M12 17h.01" />
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-white">重要任务提醒</h2>
              <p className="text-sm text-gray-400 mt-0.5">
                你有 <span className="text-rose-400 font-semibold">{highPriorityTodos.length}</span> 个高优先级任务待处理
              </p>
            </div>
          </div>
        </div>

        {/* 任务列表 */}
        <div className="px-4 pb-4 max-h-[320px] overflow-y-auto">
          <div className="space-y-2">
            {highPriorityTodos.map((todo, index) => (
              <div
                key={todo.id}
                className="group flex items-center gap-3 p-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-2xl transition-all"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                {/* 完成按钮 */}
                <button
                  onClick={() => handleCompleteTodo(todo.id)}
                  className="w-6 h-6 rounded-full border-2 border-rose-400/50 hover:border-rose-400 hover:bg-rose-400/20 flex items-center justify-center transition-all shrink-0 group-hover:scale-110"
                  title="标记完成"
                >
                  <svg className="w-3 h-3 text-rose-400 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M5 12l5 5L20 7" />
                  </svg>
                </button>

                {/* 任务内容 */}
                <div className="flex-1 min-w-0">
                  <p className="text-white text-sm font-medium leading-relaxed line-clamp-2">
                    {todo.text}
                  </p>
                  <p className="text-[10px] text-gray-500 mt-1">
                    创建于 {new Date(todo.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                  </p>
                </div>

                {/* 优先级标签 */}
                <span className="px-2 py-1 text-[10px] font-semibold bg-rose-500/20 text-rose-400 rounded-full shrink-0">
                  高优先级
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 底部操作区 */}
        <div className="px-6 py-4 bg-white/[0.02] border-t border-white/5">
          <div className="flex gap-3">
            {/* 今日不再提醒 */}
            <button
              onClick={handleDismissToday}
              className="flex-1 py-3 px-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-400 text-sm font-medium transition-all active:scale-[0.98]"
            >
              今日不再提醒
            </button>

            {/* 查看全部 */}
            <button
              onClick={handleNavigate}
              className="flex-1 py-3 px-4 bg-gradient-to-r from-rose-500 to-pink-600 hover:from-rose-600 hover:to-pink-700 rounded-xl text-white text-sm font-semibold shadow-lg shadow-rose-500/30 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              <span>查看全部</span>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>
        </div>

        {/* 关闭按钮 */}
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors"
        >
          <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* 动画样式 */}
      <style>{`
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes fade-out {
          from { opacity: 1; }
          to { opacity: 0; }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.9) translateY(20px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
        @keyframes scale-out {
          from { opacity: 1; transform: scale(1) translateY(0); }
          to { opacity: 0; transform: scale(0.9) translateY(20px); }
        }
        .animate-fade-in { animation: fade-in 0.3s ease-out; }
        .animate-fade-out { animation: fade-out 0.3s ease-out forwards; }
        .animate-scale-in { animation: scale-in 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-scale-out { animation: scale-out 0.3s ease-out forwards; }
      `}</style>
    </div>,
    document.body
  );
};

export default HighPriorityTodoReminder;
