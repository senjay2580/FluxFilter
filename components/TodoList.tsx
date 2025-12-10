import React, { useState, useEffect, useCallback } from 'react';

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  priority: 'low' | 'medium' | 'high';
  createdAt: number;
}

interface TodoListProps {
  isOpen: boolean;
  onClose: () => void;
}

// 纸屑动画组件
const Confetti: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  useEffect(() => {
    const timer = setTimeout(onComplete, 2000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  const confettiPieces = Array.from({ length: 50 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.5,
    duration: 1 + Math.random() * 1,
    color: ['#a3e635', '#22d3ee', '#f472b6', '#facc15', '#fb923c'][Math.floor(Math.random() * 5)],
  }));

  return (
    <div className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      {confettiPieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute w-3 h-3 animate-confetti"
          style={{
            left: `${piece.left}%`,
            top: '-20px',
            backgroundColor: piece.color,
            animationDelay: `${piece.delay}s`,
            animationDuration: `${piece.duration}s`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti {
          0% {
            transform: translateY(0) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(100vh) rotate(720deg);
            opacity: 0;
          }
        }
        .animate-confetti {
          animation: confetti linear forwards;
        }
      `}</style>
    </div>
  );
};

const TodoList: React.FC<TodoListProps> = ({ isOpen, onClose }) => {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTodo, setNewTodo] = useState('');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high'>('medium');
  const [filter, setFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [showConfetti, setShowConfetti] = useState(false);

  // 从 localStorage 加载
  useEffect(() => {
    const saved = localStorage.getItem('fluxf-todos');
    if (saved) {
      setTodos(JSON.parse(saved));
    }
  }, []);

  // 保存到 localStorage
  useEffect(() => {
    localStorage.setItem('fluxf-todos', JSON.stringify(todos));
  }, [todos]);

  // 添加任务
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

  // 切换完成状态
  const toggleTodo = (id: string) => {
    setTodos(prev => prev.map(todo => {
      if (todo.id === id) {
        const newCompleted = !todo.completed;
        // 完成时触发纸屑动画
        if (newCompleted) {
          setShowConfetti(true);
        }
        return { ...todo, completed: newCompleted };
      }
      return todo;
    }));
  };

  // 删除任务
  const deleteTodo = (id: string) => {
    setTodos(prev => prev.filter(todo => todo.id !== id));
  };

  // 清除已完成
  const clearCompleted = () => {
    setTodos(prev => prev.filter(todo => !todo.completed));
  };

  // 过滤后的任务
  const filteredTodos = todos.filter(todo => {
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  }).sort((a, b) => {
    // 未完成的排前面，然后按优先级排序
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    return priorityOrder[a.priority] - priorityOrder[b.priority];
  });

  // 统计
  const totalCount = todos.length;
  const completedCount = todos.filter(t => t.completed).length;
  const progress = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // 优先级颜色
  const priorityColors = {
    low: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    medium: 'bg-amber-500/20 text-amber-400 border-amber-500/30',
    high: 'bg-red-500/20 text-red-400 border-red-500/30',
  };

  const priorityLabels = { low: '低', medium: '中', high: '高' };

  if (!isOpen) return null;

  return (
    <>
      {showConfetti && <Confetti onComplete={() => setShowConfetti(false)} />}
      
      <div 
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      >
        <div 
          className="w-full max-w-md mx-0 sm:mx-4 bg-cyber-card border-t sm:border border-white/10 sm:rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
          onClick={e => e.stopPropagation()}
        >
          {/* 头部 */}
          <div className="px-5 py-4 bg-gradient-to-r from-cyber-lime/20 to-cyan-500/20 border-b border-white/10">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                待办事项
              </h2>
              <button onClick={onClose} className="text-gray-400 hover:text-white">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 进度条 */}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-400 mb-1">
                <span>进度 {completedCount}/{totalCount}</span>
                <span className="text-cyber-lime font-medium">{progress}%</span>
              </div>
              <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyber-lime to-cyan-400 rounded-full transition-all duration-500"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>
          </div>

          {/* 添加任务 */}
          <div className="px-4 py-3 border-b border-white/5">
            <div className="flex gap-2">
              <input
                type="text"
                value={newTodo}
                onChange={(e) => setNewTodo(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addTodo()}
                placeholder="添加新任务..."
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50"
              />
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className="px-2 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-300 focus:outline-none"
              >
                <option value="low">低</option>
                <option value="medium">中</option>
                <option value="high">高</option>
              </select>
              <button
                onClick={addTodo}
                className="px-4 py-2 bg-cyber-lime text-black rounded-xl font-medium hover:bg-lime-400 transition-colors"
              >
                添加
              </button>
            </div>
          </div>

          {/* 筛选器 */}
          <div className="px-4 py-2 flex gap-2 border-b border-white/5">
            {(['all', 'active', 'completed'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  filter === f
                    ? 'bg-cyber-lime/20 text-cyber-lime border border-cyber-lime/30'
                    : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
                }`}
              >
                {f === 'all' ? '全部' : f === 'active' ? '进行中' : '已完成'}
                {f === 'all' && ` (${totalCount})`}
                {f === 'active' && ` (${totalCount - completedCount})`}
                {f === 'completed' && ` (${completedCount})`}
              </button>
            ))}
          </div>

          {/* 任务列表 */}
          <div className="flex-1 overflow-y-auto px-4 py-2">
            {filteredTodos.length === 0 ? (
              <div className="text-center py-12">
                <svg className="w-16 h-16 mx-auto text-gray-600 mb-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1">
                  <path d="M9 11l3 3L22 4" />
                  <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                </svg>
                <p className="text-gray-500 text-sm">
                  {filter === 'all' ? '暂无任务，添加一个吧！' : 
                   filter === 'active' ? '没有进行中的任务' : '没有已完成的任务'}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredTodos.map((todo) => (
                  <div
                    key={todo.id}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      todo.completed
                        ? 'bg-white/5 border-white/5 opacity-60'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    {/* 复选框 */}
                    <button
                      onClick={() => toggleTodo(todo.id)}
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                        todo.completed
                          ? 'bg-cyber-lime border-cyber-lime'
                          : 'border-gray-500 hover:border-cyber-lime'
                      }`}
                    >
                      {todo.completed && (
                        <svg className="w-3 h-3 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                          <path d="M5 12l5 5L20 7" />
                        </svg>
                      )}
                    </button>

                    {/* 内容 */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm ${todo.completed ? 'line-through text-gray-500' : 'text-white'}`}>
                        {todo.text}
                      </p>
                    </div>

                    {/* 优先级标签 */}
                    <span className={`px-2 py-0.5 rounded text-[10px] border ${priorityColors[todo.priority]}`}>
                      {priorityLabels[todo.priority]}
                    </span>

                    {/* 删除按钮 */}
                    <button
                      onClick={() => deleteTodo(todo.id)}
                      className="text-gray-500 hover:text-red-400 transition-colors"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 底部操作 */}
          {completedCount > 0 && (
            <div className="px-4 py-3 border-t border-white/5 flex justify-between items-center">
              <span className="text-xs text-gray-500">
                {completedCount} 个任务已完成
              </span>
              <button
                onClick={clearCompleted}
                className="text-xs text-red-400 hover:text-red-300 transition-colors"
              >
                清除已完成
              </button>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default TodoList;
