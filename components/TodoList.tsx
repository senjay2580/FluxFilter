import React, { useState, useEffect } from 'react';
import type { FilterType } from '../types';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
  category?: string;
}

interface TodoListProps {
  isOpen?: boolean;
  onClose?: () => void;
  embedded?: boolean;
  timeFilter?: FilterType;
}

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

// 时间筛选辅助函数
function filterTodosByTime(todos: Todo[], filter: FilterType): Todo[] {
  if (filter === 'all') return todos;
  
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  return todos.filter(todo => {
    const diff = now - todo.createdAt;
    switch (filter) {
      case 'today':
        return diff < dayMs;
      case 'week':
        return diff < 7 * dayMs;
      case 'month':
        return diff < 30 * dayMs;
      default:
        return true;
    }
  });
}

const TodoList: React.FC<TodoListProps> = ({ isOpen, onClose, embedded = false, timeFilter = 'all' as FilterType }) => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [showConfetti, setShowConfetti] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [editPriority, setEditPriority] = useState<'low' | 'medium' | 'high'>('medium');

  useEffect(() => {
    const saved = localStorage.getItem('fluxf-todos');
    if (saved) setTodos(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem('fluxf-todos', JSON.stringify(todos));
  }, [todos]);

  const addTodo = () => {
    if (!newTodo.trim()) return;
    setTodos(prev => [...prev, {
      id: Date.now().toString(),
      text: newTodo.trim(),
      completed: false,
      priority,
      createdAt: Date.now(),
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

  const clearCompleted = () => {
    setTodos(prev => prev.filter(todo => !todo.completed));
  };

  // 开始编辑
  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setEditText(todo.text);
    setEditPriority(todo.priority);
  };

  // 保存编辑
  const saveEdit = () => {
    if (!editingId || !editText.trim()) {
      setEditingId(null);
      return;
    }
    setTodos(prev => prev.map(todo => 
      todo.id === editingId 
        ? { ...todo, text: editText.trim(), priority: editPriority }
        : todo
    ));
    setEditingId(null);
    setEditText('');
  };

  // 取消编辑
  const cancelEdit = () => {
    setEditingId(null);
    setEditText('');
  };

  // 先按时间筛选，再按状态筛选
  const timeFilteredTodos = filterTodosByTime(todos, timeFilter);
  const filteredTodos = timeFilteredTodos.filter(todo => {
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  }).sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  const totalCount = todos.length;
  const completedCount = todos.filter(t => t.completed).length;
  const activeCount = totalCount - completedCount;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const priorityConfig = {
    low: { color: 'from-blue-500 to-blue-400', bg: 'bg-blue-500/10', text: 'text-blue-400', label: '低优先级', icon: '○' },
    medium: { color: 'from-amber-500 to-orange-400', bg: 'bg-amber-500/10', text: 'text-amber-400', label: '中优先级', icon: '◐' },
    high: { color: 'from-rose-500 to-pink-500', bg: 'bg-rose-500/10', text: 'text-rose-400', label: '高优先级', icon: '●' },
  };

  if (!embedded && !isOpen) return null;

  const content = (
    <div className={`flex flex-col ${embedded ? 'h-full' : 'w-full max-w-lg bg-[#0c0c14] border border-white/10 rounded-3xl shadow-2xl max-h-[90vh]'}`}>
      
      {/* 头部区域 */}
      <div className="px-6 pt-6 pb-5">
        {/* 标题行 */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-cyber-lime to-emerald-400 flex items-center justify-center">
              <svg className="w-5 h-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M9 11l3 3L22 4" />
                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
              </svg>
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">待办事项</h2>
              <p className="text-xs text-gray-400">管理你的日常任务</p>
            </div>
          </div>
          {!embedded && onClose && (
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors">
              <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* 统计卡片 - 简洁风格 */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center">
            <p className="text-3xl font-bold text-white">{totalCount}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">总任务</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-cyber-lime">{activeCount}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">进行中</p>
          </div>
          <div className="text-center">
            <p className="text-3xl font-bold text-emerald-400">{completedCount}</p>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mt-1">已完成</p>
          </div>
        </div>

        {/* 进度条 */}
        <div className="mt-4">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-gray-400">完成进度</span>
            <span className="text-sm font-bold text-cyber-lime">{progress}%</span>
          </div>
          <div className="h-2 bg-white/5 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-cyber-lime via-emerald-400 to-cyan-400 rounded-full transition-all duration-700 ease-out relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent animate-shimmer" />
            </div>
          </div>
        </div>
      </div>

      {/* 添加任务区域 */}
      <div className="px-5 py-4">
        <div className="flex gap-2 items-center">
          <div className="flex-1 relative">
            <input
              type="text"
              value={newTodo}
              onChange={(e) => setNewTodo(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTodo()}
              placeholder="添加新任务..."
              className="w-full px-4 py-3.5 bg-white/5 border border-white/10 rounded-2xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 focus:bg-white/[0.07] transition-all"
            />
          </div>
          
          {/* 优先级选择器 */}
          <div className="flex gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
            {(['low', 'medium', 'high'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPriority(p)}
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition-all ${
                  priority === p 
                    ? `bg-gradient-to-br ${priorityConfig[p].color} text-white shadow-lg` 
                    : 'text-gray-500 hover:text-gray-300'
                }`}
                title={priorityConfig[p].label}
              >
                <span className="text-sm">{priorityConfig[p].icon}</span>
              </button>
            ))}
          </div>

          <button
            onClick={addTodo}
            disabled={!newTodo.trim()}
            className="h-11 px-5 bg-gradient-to-r from-cyber-lime to-emerald-400 text-black rounded-2xl font-semibold text-sm hover:shadow-lg hover:shadow-cyber-lime/30 transition-all disabled:opacity-40 disabled:cursor-not-allowed active:scale-95"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" />
            </svg>
          </button>
        </div>
      </div>

      {/* 筛选标签 */}
      <div className="px-5 pb-3">
        <div className="flex gap-2 p-1 bg-white/5 rounded-2xl">
          {(['all', 'active', 'completed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex-1 py-2 px-3 rounded-xl text-xs font-medium transition-all ${
                filter === f
                  ? 'bg-white/10 text-white shadow-sm'
                  : 'text-gray-500 hover:text-gray-300'
              }`}
            >
              {f === 'all' ? `全部 ${totalCount}` : f === 'active' ? `进行中 ${activeCount}` : `已完成 ${completedCount}`}
            </button>
          ))}
        </div>
      </div>

      {/* 任务列表 */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">
        {filteredTodos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-white/5 to-white/[0.02] flex items-center justify-center mb-6">
              <svg className="w-12 h-12 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" />
                <rect x="9" y="3" width="6" height="4" rx="1" />
                <path d="M9 14l2 2 4-4" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">
              {filter === 'all' ? '开始添加任务' : filter === 'active' ? '没有进行中的任务' : '没有已完成的任务'}
            </h3>
            <p className="text-sm text-gray-500 text-center max-w-[200px]">
              {filter === 'all' ? '创建你的第一个待办事项，开始高效管理时间' : '切换筛选查看其他任务'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {filteredTodos.map((todo, index) => (
              <div
                key={todo.id}
                className={`group relative overflow-hidden rounded-2xl border transition-all duration-300 ${
                  todo.completed
                    ? 'bg-white/[0.02] border-white/5'
                    : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/[0.07]'
                }`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* 优先级指示条 */}
                <div className={`absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b ${priorityConfig[todo.priority].color} ${todo.completed ? 'opacity-30' : ''}`} />
                
                <div className="flex items-center gap-3 p-4 pl-5">
                  {/* 复选框 */}
                  <button
                    onClick={() => editingId !== todo.id && toggleTodo(todo.id)}
                    disabled={editingId === todo.id}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-all shrink-0 ${
                      todo.completed
                        ? 'bg-gradient-to-br from-cyber-lime to-emerald-400 border-transparent'
                        : 'border-gray-600 hover:border-cyber-lime hover:bg-cyber-lime/10'
                    } ${editingId === todo.id ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    {todo.completed && (
                      <svg className="w-3.5 h-3.5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M5 12l5 5L20 7" />
                      </svg>
                    )}
                  </button>

                  {/* 内容 - 编辑模式 */}
                  {editingId === todo.id ? (
                    <div className="flex-1 min-w-0 space-y-2">
                      <input
                        type="text"
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveEdit();
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        autoFocus
                        className="w-full px-3 py-2 bg-white/10 border border-cyber-lime/50 rounded-xl text-white text-sm focus:outline-none focus:border-cyber-lime"
                        placeholder="输入任务内容..."
                      />
                      <div className="flex items-center gap-2">
                        {/* 编辑优先级 */}
                        <div className="flex gap-1">
                          {(['low', 'medium', 'high'] as const).map((p) => (
                            <button
                              key={p}
                              onClick={() => setEditPriority(p)}
                              className={`px-2 py-1 rounded-lg text-[10px] font-medium transition-all ${
                                editPriority === p 
                                  ? `${priorityConfig[p].bg} ${priorityConfig[p].text} ring-1 ring-current` 
                                  : 'bg-white/5 text-gray-500 hover:bg-white/10'
                              }`}
                            >
                              {priorityConfig[p].label}
                            </button>
                          ))}
                        </div>
                        {/* 保存/取消按钮 */}
                        <div className="flex-1" />
                        <button
                          onClick={cancelEdit}
                          className="px-3 py-1 text-xs text-gray-400 hover:text-white transition-colors"
                        >
                          取消
                        </button>
                        <button
                          onClick={saveEdit}
                          className="px-3 py-1 bg-cyber-lime/20 text-cyber-lime text-xs font-medium rounded-lg hover:bg-cyber-lime/30 transition-colors"
                        >
                          保存
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* 内容 - 显示模式 */
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-relaxed transition-all ${
                        todo.completed ? 'line-through text-gray-500' : 'text-white'
                      }`}>
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

                  {/* 编辑按钮 */}
                  {editingId !== todo.id && !todo.completed && (
                    <button
                      onClick={() => startEdit(todo)}
                      className="w-8 h-8 rounded-xl bg-white/0 hover:bg-cyber-lime/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <svg className="w-4 h-4 text-gray-500 hover:text-cyber-lime transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  )}

                  {/* 删除按钮 */}
                  {editingId !== todo.id && (
                    <button
                      onClick={() => deleteTodo(todo.id)}
                      className="w-8 h-8 rounded-xl bg-white/0 hover:bg-red-500/10 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all"
                    >
                      <svg className="w-4 h-4 text-gray-500 hover:text-red-400 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 底部操作栏 */}
      {completedCount > 0 && (
        <div className="px-5 py-3 border-t border-white/5 flex justify-between items-center bg-white/[0.02]">
          <span className="text-xs text-gray-500">
            🎉 {completedCount} 个任务已完成
          </span>
          <button
            onClick={clearCompleted}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors flex items-center gap-1"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
            </svg>
            清除已完成
          </button>
        </div>
      )}

      {/* 动画样式 */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );

  if (embedded) {
    return (
      <>
        {showConfetti && <Confetti onComplete={() => setShowConfetti(false)} />}
        {content}
      </>
    );
  }

  return (
    <>
      {showConfetti && <Confetti onComplete={() => setShowConfetti(false)} />}
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
