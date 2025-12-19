import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { FilterType } from '../../types';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
  category?: string;
  order?: number;
}

interface TodoListProps {
  isOpen?: boolean;
  onClose?: () => void;
  embedded?: boolean;
  timeFilter?: FilterType;
}

// 优先级配置
const priorityConfig = {
  low: { 
    gradient: 'from-blue-500/20 to-cyan-500/10', 
    ring: 'ring-blue-500/30',
    text: 'text-blue-400', 
    label: '低优先级', 
    icon: '○',
    bg: 'bg-blue-500/15'
  },
  medium: { 
    gradient: 'from-amber-500/20 to-orange-500/10', 
    ring: 'ring-amber-500/30',
    text: 'text-amber-400', 
    label: '中优先级', 
    icon: '◐',
    bg: 'bg-amber-500/15'
  },
  high: { 
    gradient: 'from-rose-500/20 to-pink-500/10', 
    ring: 'ring-rose-500/30',
    text: 'text-rose-400', 
    label: '高优先级', 
    icon: '●',
    bg: 'bg-rose-500/15'
  },
};

// 纸屑动画组件
const Confetti: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2500);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const confettiPieces = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.3,
    duration: 1.5 + Math.random() * 1,
    color: ['#a3e635', '#22d3ee', '#f472b6', '#facc15', '#818cf8'][Math.floor(Math.random() * 5)],
    size: 6 + Math.random() * 6,
    rotation: Math.random() * 360,
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute animate-confetti"
          style={{
            left: `${piece.left}%`,
            top: '-20px',
            width: piece.size,
            height: piece.size,
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            transform: `rotate(${piece.rotation}deg)`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti {
          0% { transform: translateY(0) rotate(0deg) scale(1); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg) scale(0.5); opacity: 0; }
        }
        .animate-confetti { animation: confetti ease-out forwards; }
      `}</style>
    </div>
  );
};

// 长按操作菜单
interface ActionMenuProps {
  todo: Todo;
  position: { x: number; y: number };
  onClose: () => void;
  onEdit: () => void;
  onChangePriority: (priority: 'low' | 'medium' | 'high') => void;
  onDelete: () => void;
}

const ActionMenu: React.FC<ActionMenuProps> = ({ todo, position, onClose, onEdit, onChangePriority, onDelete }) => {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 调整菜单位置，确保不超出屏幕
    if (menuRef.current) {
      const rect = menuRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      if (rect.right > viewportWidth) {
        menuRef.current.style.left = `${viewportWidth - rect.width - 16}px`;
      }
      if (rect.bottom > viewportHeight) {
        menuRef.current.style.top = `${viewportHeight - rect.height - 16}px`;
      }
    }
  }, [position]);

  return createPortal(
    <div className="fixed inset-0 z-[99999]" onClick={onClose}>
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/60" style={{ animation: 'fadeIn 0.15s ease-out' }} />
      
      {/* 菜单 */}
      <div
        ref={menuRef}
        className="absolute bg-[#1a1a1f] rounded-2xl border border-white/10 shadow-2xl overflow-hidden min-w-[200px]"
        style={{ 
          left: position.x, 
          top: position.y,
          animation: 'scaleIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 任务预览 */}
        <div className="px-4 py-3 border-b border-white/10 bg-white/5">
          <p className="text-sm text-white font-medium line-clamp-2">{todo.text}</p>
          <span className={`text-[10px] ${priorityConfig[todo.priority].text} mt-1 inline-block`}>
            {priorityConfig[todo.priority].label}
          </span>
        </div>

        {/* 操作列表 */}
        <div className="py-1">
          {/* 编辑 */}
          <button
            onClick={() => { onEdit(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/5 active:bg-white/10 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-cyber-lime/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </div>
            <span className="text-sm text-white">编辑内容</span>
          </button>

          {/* 修改优先级 */}
          <div className="px-4 py-2">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">修改优先级</p>
            <div className="flex gap-2">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => { onChangePriority(p); onClose(); }}
                  className={`flex-1 py-2 rounded-xl text-xs font-medium transition-all ${
                    todo.priority === p 
                      ? `${priorityConfig[p].bg} ${priorityConfig[p].text} ring-1 ${priorityConfig[p].ring}` 
                      : 'bg-white/5 text-gray-400 hover:bg-white/10'
                  }`}
                >
                  {priorityConfig[p].icon}
                </button>
              ))}
            </div>
          </div>

          {/* 分隔线 */}
          <div className="h-px bg-white/10 my-1" />

          {/* 删除 */}
          <button
            onClick={() => { onDelete(); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-red-500/10 active:bg-red-500/20 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center">
              <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
              </svg>
            </div>
            <span className="text-sm text-red-400">删除任务</span>
          </button>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes scaleIn { from { opacity: 0; transform: scale(0.9); } to { opacity: 1; transform: scale(1); } }
        @keyframes modal-enter { from { opacity: 0; transform: scale(0.95) translateY(20px); } to { opacity: 1; transform: scale(1) translateY(0); } }
        @keyframes pulse-slow { 0%, 100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 0.8; transform: scale(1.1); } }
        .animate-modal-enter { animation: modal-enter 0.35s cubic-bezier(0.16, 1, 0.3, 1); }
        .animate-pulse-slow { animation: pulse-slow 4s ease-in-out infinite; }
        .animation-delay-1000 { animation-delay: 1s; }
      `}</style>
    </div>,
    document.body
  );
};

// 时间筛选辅助函数
function filterTodosByTime(todos: Todo[], filter: FilterType): Todo[] {
  if (filter === 'all') return todos;

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return todos.filter(todo => {
    const todoDate = new Date(todo.createdAt);
    const todoDayStart = new Date(todoDate.getFullYear(), todoDate.getMonth(), todoDate.getDate());
    const daysDiff = Math.floor((dayStart.getTime() - todoDayStart.getTime()) / (24 * 60 * 60 * 1000));

    switch (filter) {
      case 'today': return daysDiff === 0;
      case 'week': return daysDiff >= 0 && daysDiff < 7;
      case 'month': return daysDiff >= 0 && daysDiff < 30;
      default: return true;
    }
  });
}

const TodoList: React.FC<TodoListProps> = ({ isOpen, onClose, embedded = false, timeFilter = 'all' as FilterType }) => {
  const [todos, setTodos] = useState<Todo[]>(() => {
    try {
      const saved = localStorage.getItem('fluxf-todos');
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  const [newTodo, setNewTodo] = useState('');
  const [filter, setFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showConfetti, setShowConfetti] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  
  // 长按菜单状态
  const [actionMenu, setActionMenu] = useState<{ todo: Todo; position: { x: number; y: number } } | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = useRef(false);

  // 拖拽状态
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('fluxf-todos', JSON.stringify(todos));
    } catch (error) {
      console.error('保存待办事项失败:', error);
    }
  }, [todos]);

  const addTodo = () => {
    if (!newTodo.trim()) return;
    // 根据当前筛选的优先级自动设置，如果是全部则默认中优先级
    const newPriority = filter === 'all' ? 'medium' : filter;
    setTodos(prev => [...prev, {
      id: Date.now().toString(),
      text: newTodo.trim(),
      completed: false,
      priority: newPriority,
      createdAt: Date.now(),
      order: prev.length,
    }]);
    setNewTodo('');
  };

  const toggleTodo = (id: string) => {
    setTodos(prev => prev.map(todo => {
      if (todo.id === id) {
        const newCompleted = !todo.completed;
        if (newCompleted) setShowConfetti(true);
        return { ...todo, completed: newCompleted };
      }
      return todo;
    }));
  };

  const deleteTodo = (id: string) => {
    setTodos(prev => prev.filter(todo => todo.id !== id));
  };

  const updatePriority = (id: string, newPriority: 'low' | 'medium' | 'high') => {
    setTodos(prev => prev.map(todo => 
      todo.id === id ? { ...todo, priority: newPriority } : todo
    ));
  };

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditText(todo.text);
  };

  const saveEdit = () => {
    if (!editingId || !editText.trim()) {
      setEditingId(null);
      return;
    }
    setTodos(prev => prev.map(todo => 
      todo.id === editingId ? { ...todo, text: editText.trim() } : todo
    ));
    setEditingId(null);
    setEditText('');
  };

  const clearCompleted = () => {
    setTodos(prev => prev.filter(todo => !todo.completed));
  };

  // 长按处理
  const handleLongPressStart = useCallback((e: React.TouchEvent | React.MouseEvent, todo: Todo) => {
    longPressTriggered.current = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      if (navigator.vibrate) navigator.vibrate(30);
      setActionMenu({ todo, position: { x: clientX - 100, y: clientY - 20 } });
    }, 500);
  }, []);

  const handleLongPressEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  // 拖拽处理
  const handleDragStart = (e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, id: string) => {
    e.preventDefault();
    if (id !== draggedId) setDragOverId(id);
  };

  const handleDragEnd = () => {
    if (draggedId && dragOverId && draggedId !== dragOverId) {
      setTodos(prev => {
        const newTodos = [...prev];
        const draggedIndex = newTodos.findIndex(t => t.id === draggedId);
        const targetIndex = newTodos.findIndex(t => t.id === dragOverId);
        const [removed] = newTodos.splice(draggedIndex, 1);
        newTodos.splice(targetIndex, 0, removed);
        return newTodos.map((t, i) => ({ ...t, order: i }));
      });
    }
    setDraggedId(null);
    setDragOverId(null);
  };

  // 筛选和排序
  const timeFilteredTodos = filterTodosByTime(todos, timeFilter);
  const filteredTodos = timeFilteredTodos.filter(todo => {
    if (filter === 'all') return true;
    return todo.priority === filter;
  }).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const totalCount = todos.length;
  const highCount = todos.filter(t => t.priority === 'high' && !t.completed).length;
  const mediumCount = todos.filter(t => t.priority === 'medium' && !t.completed).length;
  const lowCount = todos.filter(t => t.priority === 'low' && !t.completed).length;
  const completedCount = todos.filter(t => t.completed).length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  if (!embedded && !isOpen) return null;

  const content = (
    <div className={`flex flex-col ${embedded ? 'h-full' : 'w-full max-w-lg bg-[#0c0c14] rounded-3xl shadow-2xl max-h-[90vh]'} ${!embedded ? 'animate-modal-enter' : ''}`}>
      {/* 背景装饰 */}
      {!embedded && (
        <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-3xl">
          <div className="absolute -top-20 -right-20 w-40 h-40 bg-cyber-lime/10 rounded-full blur-3xl animate-pulse-slow" />
          <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-emerald-500/10 rounded-full blur-3xl animate-pulse-slow animation-delay-1000" />
        </div>
      )}

      {/* 头部区域 */}
      <div className="px-5 pt-5 pb-4 relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-cyber-lime to-emerald-400 flex items-center justify-center shadow-lg shadow-cyber-lime/20">
              <svg className="w-5 h-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">待办事项</h2>
              <p className="text-[11px] text-gray-500">管理你的日常任务</p>
            </div>
          </div>
          {!embedded && onClose && (
            <button onClick={onClose} className="w-9 h-9 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
              <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 统计 */}
        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center py-3 rounded-2xl bg-gradient-to-br from-white/5 to-white/[0.02]">
            <p className="text-2xl font-bold text-white">{totalCount}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">总任务</p>
          </div>
          <div className="text-center py-3 rounded-2xl bg-gradient-to-br from-cyber-lime/10 to-emerald-500/5">
            <p className="text-2xl font-bold text-cyber-lime">{totalCount - completedCount}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">进行中</p>
          </div>
          <div className="text-center py-3 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-cyan-500/5">
            <p className="text-2xl font-bold text-emerald-400">{completedCount}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">已完成</p>
          </div>
        </div>

        {/* 进度条 */}
        <div>
          <div className="flex justify-between items-center mb-1.5">
            <span className="text-[11px] text-gray-500">完成进度</span>
            <span className="text-sm font-bold text-cyber-lime">{progress}%</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-cyber-lime via-emerald-400 to-cyan-400 rounded-full transition-all duration-700"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      {/* 添加任务 */}
      <div className="px-5 py-3">
        <div className="flex gap-2 items-center">
          <input
            type="text"
            value={newTodo}
            onChange={(e) => setNewTodo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addTodo()}
            placeholder={filter === 'all' ? '添加新任务...' : `添加${priorityConfig[filter].label}任务...`}
            className="flex-1 px-4 py-3 bg-white/5 rounded-2xl text-white text-sm placeholder-gray-500 focus:outline-none focus:bg-white/[0.07] focus:ring-1 focus:ring-cyber-lime/30 transition-all"
          />

          <button
            onClick={addTodo}
            disabled={!newTodo.trim()}
            className="h-10 w-10 bg-gradient-to-r from-cyber-lime to-emerald-400 text-black rounded-xl flex items-center justify-center hover:shadow-lg hover:shadow-cyber-lime/30 transition-all disabled:opacity-40 active:scale-95"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/* 筛选 - 按优先级分类 */}
      <div className="px-5 pb-2">
        <div className="flex gap-1 p-1 bg-white/5 rounded-2xl overflow-x-auto">
          <button
            onClick={() => setFilter('all')}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              filter === 'all' ? 'bg-white/10 text-white' : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            全部 {totalCount}
          </button>
          <button
            onClick={() => setFilter('high')}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              filter === 'high' ? `${priorityConfig.high.bg} ${priorityConfig.high.text}` : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            ● 高 {highCount}
          </button>
          <button
            onClick={() => setFilter('medium')}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              filter === 'medium' ? `${priorityConfig.medium.bg} ${priorityConfig.medium.text}` : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            ◐ 中 {mediumCount}
          </button>
          <button
            onClick={() => setFilter('low')}
            className={`shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-all ${
              filter === 'low' ? `${priorityConfig.low.bg} ${priorityConfig.low.text}` : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            ○ 低 {lowCount}
          </button>
        </div>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {filteredTodos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-white/5 to-transparent flex items-center justify-center mb-4">
              <svg className="w-10 h-10 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
              </svg>
            </div>
            <p className="text-sm text-gray-500">暂无任务</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTodos.map((todo) => (
              <div
                key={todo.id}
                draggable={!editingId}
                onDragStart={(e) => handleDragStart(e, todo.id)}
                onDragOver={(e) => handleDragOver(e, todo.id)}
                onDragEnd={handleDragEnd}
                onTouchStart={(e) => handleLongPressStart(e, todo)}
                onTouchEnd={handleLongPressEnd}
                onMouseDown={(e) => handleLongPressStart(e, todo)}
                onMouseUp={handleLongPressEnd}
                onMouseLeave={handleLongPressEnd}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setActionMenu({ todo, position: { x: e.clientX - 100, y: e.clientY - 20 } });
                }}
                className={`group relative overflow-hidden rounded-2xl transition-all duration-200 cursor-grab active:cursor-grabbing select-none ${
                  dragOverId === todo.id ? 'ring-2 ring-cyber-lime/50 scale-[1.02]' : ''
                } ${draggedId === todo.id ? 'opacity-50 scale-95' : ''} ${
                  todo.completed
                    ? 'bg-gradient-to-r from-white/[0.02] to-transparent'
                    : `bg-gradient-to-r ${priorityConfig[todo.priority].gradient}`
                }`}
              >
                <div className="flex items-center gap-3 p-4">
                  {/* 拖拽手柄 */}
                  <div className="text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity hidden sm:block">
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="9" cy="6" r="1.5" />
                      <circle cx="15" cy="6" r="1.5" />
                      <circle cx="9" cy="12" r="1.5" />
                      <circle cx="15" cy="12" r="1.5" />
                      <circle cx="9" cy="18" r="1.5" />
                      <circle cx="15" cy="18" r="1.5" />
                    </svg>
                  </div>

                  {/* 复选框 */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!longPressTriggered.current && editingId !== todo.id) {
                        toggleTodo(todo.id);
                      }
                    }}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                      todo.completed
                        ? 'bg-gradient-to-br from-cyber-lime to-emerald-400 border-transparent'
                        : `border-gray-600 hover:border-cyber-lime hover:bg-cyber-lime/10`
                    }`}
                  >
                    {todo.completed && (
                      <svg className="w-3.5 h-3.5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </button>

                  {/* 内容 */}
                  {editingId === todo.id ? (
                    <div className="flex-1 flex gap-2">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        autoFocus
                        className="flex-1 px-3 py-1.5 bg-white/10 border border-cyber-lime/50 rounded-xl text-white text-sm focus:outline-none"
                      />
                      <button onClick={saveEdit} className="px-3 py-1.5 bg-cyber-lime/20 text-cyber-lime text-xs rounded-lg">
                        保存
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-relaxed ${todo.completed ? 'line-through text-gray-500' : 'text-white'}`}>
                        {todo.text}
                      </p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full ${priorityConfig[todo.priority].bg} ${priorityConfig[todo.priority].text}`}>
                          {priorityConfig[todo.priority].label}
                        </span>
                        <span className="text-[10px] text-gray-600">
                          {new Date(todo.createdAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部 */}
      {completedCount > 0 && (
        <div className="px-5 py-3 flex justify-between items-center bg-white/[0.02]">
          <span className="text-xs text-gray-500">🎉 {completedCount} 个任务已完成</span>
          <button onClick={clearCompleted} className="text-xs text-gray-500 hover:text-red-400 transition-colors">
            清除已完成
          </button>
        </div>
      )}
    </div>
  );

  if (embedded) {
    return (
      <>
        {showConfetti && <Confetti onComplete={() => setShowConfetti(false)} />}
        {actionMenu && (
          <ActionMenu
            todo={actionMenu.todo}
            position={actionMenu.position}
            onClose={() => setActionMenu(null)}
            onEdit={() => startEdit(actionMenu.todo)}
            onChangePriority={(p) => updatePriority(actionMenu.todo.id, p)}
            onDelete={() => deleteTodo(actionMenu.todo.id)}
          />
        )}
        {content}
      </>
    );
  }

  return (
    <>
      {showConfetti && <Confetti onComplete={() => setShowConfetti(false)} />}
      {actionMenu && (
        <ActionMenu
          todo={actionMenu.todo}
          position={actionMenu.position}
          onClose={() => setActionMenu(null)}
          onEdit={() => startEdit(actionMenu.todo)}
          onChangePriority={(p) => updatePriority(actionMenu.todo.id, p)}
          onDelete={() => deleteTodo(actionMenu.todo.id)}
        />
      )}
      <div 
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <div onClick={e => e.stopPropagation()}>
          {content}
        </div>
      </div>
    </>
  );
};

export default TodoList;
