import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { ReminderTask, ReminderPriority, PausedState } from '../../types';

// 直接导入音频文件
import ring1 from '../../assets/ring1.mp3';
import ring2 from '../../assets/ring2.mp3';

const RING_SOUNDS = [ring1, ring2];

// 优先级配置
const PRIORITY_CONFIG: Record<ReminderPriority, { label: string; color: string; bgColor: string; borderColor: string }> = {
  low: { label: '低', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/30' },
  medium: { label: '中', color: 'text-blue-400', bgColor: 'bg-blue-500/10', borderColor: 'border-blue-500/30' },
  high: { label: '高', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/30' },
  urgent: { label: '紧急', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/30' },
};

// 默认间隔选项
const DEFAULT_INTERVALS = [2, 3, 4, 5];

// 存储键
const STORAGE_KEY = 'interval-reminder-tasks';
const PAUSED_STATE_KEY = 'interval-reminder-paused';

// 加载任务
const loadTasks = (): ReminderTask[] => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
};

// 保存任务
const saveTasks = (tasks: ReminderTask[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
};

// 加载暂停状态
const loadPausedState = (): PausedState | null => {
  try {
    const stored = localStorage.getItem(PAUSED_STATE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch {
    return null;
  }
};

// 保存暂停状态
const savePausedState = (state: PausedState | null) => {
  if (state) {
    localStorage.setItem(PAUSED_STATE_KEY, JSON.stringify(state));
  } else {
    localStorage.removeItem(PAUSED_STATE_KEY);
  }
};

// 格式化时间
const formatTime = (seconds: number): string => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
};

const IntervalReminder: React.FC = () => {
  const [tasks, setTasks] = useState<ReminderTask[]>(loadTasks);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ReminderTask | null>(null);

  // 运行状态
  const [runningTaskId, setRunningTaskId] = useState<string | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState(0);
  const [nextIntervalSeconds, setNextIntervalSeconds] = useState(0);
  const [ringCount, setRingCount] = useState(0);
  const [isRinging, setIsRinging] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [completionData, setCompletionData] = useState<{ taskName: string; ringCount: number } | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [, setAudioPermission] = useState<'unknown' | 'granted' | 'denied'>('unknown');
  const [showAudioTip, setShowAudioTip] = useState(false);

  // 暂停状态保存
  const [pausedState, setPausedState] = useState<PausedState | null>(loadPausedState);

  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const ringTimerRef = useRef<NodeJS.Timeout | null>(null);
  const tasksRef = useRef<ReminderTask[]>(tasks);
  const isPlayingRef = useRef(false);

  // 同步 tasks 到 ref
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  // 保存任务到本地存储
  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  // 检测音频播放权限（移动端需要用户交互才能播放）
  const checkAudioPermission = useCallback(async () => {
    if (RING_SOUNDS.length === 0) return;
    
    try {
      const audio = new Audio(RING_SOUNDS[0]);
      audio.volume = 0.01; // 极小音量测试
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      setAudioPermission('granted');
      setShowAudioTip(false);
    } catch (e) {
      setAudioPermission('denied');
      setShowAudioTip(true);
    }
  }, []);

  // 组件挂载时检测音频权限
  useEffect(() => {
    // 延迟检测，避免阻塞渲染
    const timer = setTimeout(() => {
      checkAudioPermission();
    }, 1000);
    return () => clearTimeout(timer);
  }, [checkAudioPermission]);  // 保存暂停状态到本地存储
  useEffect(() => {
    savePausedState(pausedState);
  }, [pausedState]);

  // 页面刷新时自动保存当前运行状态
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (runningTaskId && timerRef.current) {
        // 保存当前运行状态为暂停状态
        const state: PausedState = {
          taskId: runningTaskId,
          remainingSeconds,
          nextIntervalSeconds,
          ringCount,
          pausedAt: Date.now(),
        };
        savePausedState(state);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [runningTaskId, remainingSeconds, nextIntervalSeconds, ringCount]);

  // 清理定时器
  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (ringTimerRef.current) clearTimeout(ringTimerRef.current);
      if (currentAudioRef.current) {
        currentAudioRef.current.pause();
        currentAudioRef.current = null;
      }
    };
  }, []);

  // 获取随机间隔
  const getRandomInterval = useCallback((intervals: number[]): number => {
    const randomIndex = Math.floor(Math.random() * intervals.length);
    return intervals[randomIndex] * 60; // 转换为秒
  }, []);

  // 请求通知权限
  const requestNotificationPermission = useCallback(async () => {
    // Web Notification API
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  }, []);

  // 发送通知（适配移动端）
  const sendNotification = useCallback((title: string, body: string) => {
    // 1. 尝试 Web Notification（桌面端和部分移动端）
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        new Notification(title, {
          body,
          icon: '/favicon.ico',
          tag: 'interval-reminder',
          requireInteraction: true,
          silent: false, // 允许系统声音
        });
      } catch (e) {
        console.warn('Notification failed:', e);
      }
    }

    // 2. 移动端震动（长震动模式引起注意）
    if (navigator.vibrate) {
      navigator.vibrate([300, 100, 300, 100, 300, 100, 500]);
    }

    // 3. 尝试唤醒屏幕（部分浏览器支持）
    if ('wakeLock' in navigator) {
      (navigator as any).wakeLock.request('screen').catch(() => {});
    }

    // 4. 修改页面标题闪烁提醒
    const originalTitle = document.title;
    let isOriginal = true;
    const titleInterval = setInterval(() => {
      document.title = isOriginal ? `🔔 ${title}` : originalTitle;
      isOriginal = !isOriginal;
    }, 500);
    
    // 10秒后恢复标题
    setTimeout(() => {
      clearInterval(titleInterval);
      document.title = originalTitle;
    }, 10000);
  }, []);

  // 播放提示音 - 防止重复播放
  const playRing = useCallback(() => {
    // 防止重复触发
    if (isPlayingRef.current) return;
    isPlayingRef.current = true;

    setIsRinging(true);
    setRingCount(c => c + 1); // 增加提醒次数

    // 立即暂停计时器
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }

    // 立即弹出选择窗口
    setShowBreakModal(true);

    // 发送浏览器通知（后台也能提醒）
    const runningTask = tasksRef.current.find(t => t.id === runningTaskId);
    if (runningTask) {
      sendNotification('休息一下！', `${runningTask.name} - 该休息了`);
    }

    // 停止上一个音频
    if (currentAudioRef.current) {
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }

    // 随机选择一个音频文件播放
    try {
      if (RING_SOUNDS.length > 0) {
        const randomSound = RING_SOUNDS[Math.floor(Math.random() * RING_SOUNDS.length)];
        const audio = new Audio(randomSound);
        audio.volume = 0.7;
        currentAudioRef.current = audio;
        audio.play().catch(console.warn);

        // 最多播放5秒后停止
        setTimeout(() => {
          if (currentAudioRef.current === audio) {
            audio.pause();
            audio.currentTime = 0;
            currentAudioRef.current = null;
          }
        }, 5000);
      }
    } catch (e) {
      console.warn('Audio playback failed:', e);
    }

    // 5秒后关闭响铃状态
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
    }
    ringTimerRef.current = setTimeout(() => {
      setIsRinging(false);
      isPlayingRef.current = false;
    }, 5000);
  }, []);

  // 开始任务
  const startTask = useCallback((task: ReminderTask) => {
    // 请求通知权限
    requestNotificationPermission();

    // 检查是否有暂停的状态
    if (pausedState && pausedState.taskId === task.id) {
      // 恢复暂停状态
      setRunningTaskId(task.id);
      setRemainingSeconds(pausedState.remainingSeconds);
      setNextIntervalSeconds(pausedState.nextIntervalSeconds);
      setRingCount(pausedState.ringCount);
      setIsPaused(false);
      setPausedState(null);
    } else {
      // 新开始
      setRunningTaskId(task.id);
      setRemainingSeconds(Math.round(task.totalMinutes * 60));
      setRingCount(0);
      setIsPaused(false);
      setPausedState(null);

      const firstInterval = getRandomInterval(task.intervalOptions);
      setNextIntervalSeconds(firstInterval);
    }
  }, [getRandomInterval, pausedState, requestNotificationPermission]);

  // 暂停任务（保存状态）
  const stopTask = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    // 保存当前状态
    if (runningTaskId) {
      setPausedState({
        taskId: runningTaskId,
        remainingSeconds,
        nextIntervalSeconds,
        ringCount,
        pausedAt: Date.now(),
      });
    }
    setRunningTaskId(null);
    setIsRinging(false);
    setIsPaused(false);
  }, [runningTaskId, remainingSeconds, nextIntervalSeconds, ringCount]);

  // 重置任务（完全清除）
  const resetTask = useCallback((taskId: string) => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (ringTimerRef.current) {
      clearTimeout(ringTimerRef.current);
      ringTimerRef.current = null;
    }
    // 清除暂停状态
    if (pausedState?.taskId === taskId) {
      setPausedState(null);
    }
    setRunningTaskId(null);
    setIsRinging(false);
    setIsPaused(false);
  }, [pausedState]);

  // 继续专注
  const continueTask = useCallback(() => {
    setShowBreakModal(false);
    setIsPaused(false);
    // 重新启动计时器（通过设置 runningTaskId 触发 useEffect）
    const taskId = runningTaskId;
    setRunningTaskId(null);
    setTimeout(() => setRunningTaskId(taskId), 0);
  }, [runningTaskId]);

  // 暂停休息
  const pauseTask = useCallback(() => {
    if (runningTaskId) {
      // 保存当前状态
      setPausedState({
        taskId: runningTaskId,
        remainingSeconds,
        nextIntervalSeconds,
        ringCount,
        pausedAt: Date.now(),
      });
    }
    setShowBreakModal(false);
    setRunningTaskId(null);
    setIsPaused(false);
  }, [runningTaskId, remainingSeconds, nextIntervalSeconds, ringCount]);

  // 计时器逻辑 - 只依赖 runningTaskId
  useEffect(() => {
    if (!runningTaskId) return;

    const runningTask = tasksRef.current.find(t => t.id === runningTaskId);
    if (!runningTask) return;

    // 保存任务配置到闭包外
    const taskName = runningTask.name;
    const intervalOptions = [...runningTask.intervalOptions];

    timerRef.current = setInterval(() => {
      setRemainingSeconds(prev => {
        if (prev <= 1) {
          // 时间到，结束任务
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
          setRunningTaskId(null);
          setIsRinging(false);
          setRingCount(count => {
            setCompletionData({ taskName, ringCount: count });
            setShowCompletionModal(true);

            // 检查是否有后续任务需要启动
            const followingTask = tasksRef.current.find(t =>
              t.followTaskId === runningTaskId && t.isActive
            );
            if (followingTask) {
              const delay = (followingTask.followDelayMinutes || 0) * 60 * 1000;
              setTimeout(() => {
                // 发送通知
                if ('Notification' in window && Notification.permission === 'granted') {
                  new Notification('即将开始新任务', {
                    body: `${followingTask.name} 将在 ${followingTask.followDelayMinutes || 0} 分钟后开始`,
                    icon: '/favicon.ico',
                  });
                }
                // 启动后续任务
                setRunningTaskId(followingTask.id);
                setRemainingSeconds(Math.round(followingTask.totalMinutes * 60));
                setRingCount(0);
                const randomIndex = Math.floor(Math.random() * followingTask.intervalOptions.length);
                setNextIntervalSeconds(followingTask.intervalOptions[randomIndex] * 60);
              }, delay);
            }

            return count;
          });
          return 0;
        }
        return prev - 1;
      });

      setNextIntervalSeconds(prev => {
        if (prev <= 1) {
          // 触发响铃（ringCount 在 playRing 内部增加）
          playRing();
          // 设置下一个随机间隔
          const randomIndex = Math.floor(Math.random() * intervalOptions.length);
          return intervalOptions[randomIndex] * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [runningTaskId]); // 只依赖 runningTaskId

  // 添加任务
  const handleAddTask = (taskData: Omit<ReminderTask, 'id' | 'isActive' | 'createdAt'>) => {
    const newTask: ReminderTask = {
      ...taskData,
      id: Date.now().toString(),
      isActive: true,
      createdAt: Date.now(),
    };
    setTasks(prev => [...prev, newTask]);
    setIsAddModalOpen(false);
  };

  // 更新任务
  const handleUpdateTask = (taskData: Omit<ReminderTask, 'id' | 'isActive' | 'createdAt'>) => {
    if (!editingTask) return;
    setTasks(prev => prev.map(t =>
      t.id === editingTask.id
        ? { ...t, ...taskData }
        : t
    ));
    setEditingTask(null);
  };

  // 删除任务 - 显示确认弹窗
  const handleDeleteTask = (taskId: string) => {
    setDeleteConfirmId(taskId);
  };

  // 确认删除
  const confirmDelete = () => {
    if (deleteConfirmId) {
      if (runningTaskId === deleteConfirmId) stopTask();
      setTasks(prev => prev.filter(t => t.id !== deleteConfirmId));
      setDeleteConfirmId(null);
    }
  };

  // 切换任务启用状态
  const toggleTaskActive = (taskId: string) => {
    setTasks(prev => prev.map(t =>
      t.id === taskId ? { ...t, isActive: !t.isActive } : t
    ));
  };

  const runningTask = tasks.find(t => t.id === runningTaskId);

  return (
    <div className="max-w-2xl mx-auto pb-24">
      {/* 标题 */}
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
          <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          间歇提醒
        </h1>
        <p className="text-gray-500 text-sm">设定时间段，随机间隔提醒专注</p>
      </div>

      {/* 音频权限提示 */}
      {showAudioTip && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl flex items-start gap-3">
          <svg className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div className="flex-1">
            <p className="text-red-400 text-sm font-medium">浏览器未开启声音权限</p>
            <p className="text-red-400/70 text-xs mt-0.5">请点击任意位置或开始任务来开启声音权限</p>
          </div>
          <button
            onClick={() => setShowAudioTip(false)}
            className="text-red-400/50 hover:text-red-400 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      )}

      {/* 当前运行状态卡片 */}
      {runningTask && (
        <div className={`mb-6 p-4 rounded-2xl border ${isRinging ? 'bg-cyber-lime/20 border-cyber-lime animate-pulse' : 'bg-white/5 border-white/10'}`}>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isRinging ? 'bg-cyber-lime' : 'bg-green-500'} animate-pulse`} />
              <span className="text-white font-medium">{runningTask.name}</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${PRIORITY_CONFIG[runningTask.priority].bgColor} ${PRIORITY_CONFIG[runningTask.priority].color}`}>
                {PRIORITY_CONFIG[runningTask.priority].label}
              </span>
            </div>
            <button
              onClick={stopTask}
              className="text-red-400 text-sm hover:text-red-300 transition-colors"
            >
              停止
            </button>
          </div>

          <div className="grid grid-cols-3 gap-4 text-center">
            <div>
              <div className="text-3xl font-mono font-bold text-white">{formatTime(remainingSeconds)}</div>
              <div className="text-xs text-gray-500 mt-1">剩余时间</div>
            </div>
            <div>
              <div className="text-3xl font-mono font-bold text-cyber-lime">{formatTime(nextIntervalSeconds)}</div>
              <div className="text-xs text-gray-500 mt-1">下次提醒</div>
            </div>
            <div>
              <div className="text-3xl font-mono font-bold text-amber-400">{ringCount}</div>
              <div className="text-xs text-gray-500 mt-1">已提醒</div>
            </div>
          </div>

          {isRinging && (
            <div className="mt-4 text-center">
              <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyber-lime/30 rounded-full">
                <svg className="w-5 h-5 text-cyber-lime animate-bounce" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
                </svg>
                <span className="text-cyber-lime font-medium">休息一下！</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 添加按钮 */}
      <button
        onClick={() => setIsAddModalOpen(true)}
        className="w-full mb-4 py-3 rounded-xl border-2 border-dashed border-white/20 text-gray-400 hover:border-cyber-lime/50 hover:text-cyber-lime transition-colors flex items-center justify-center gap-2"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </svg>
        新建提醒任务
      </button>

      {/* 任务列表 */}
      <div className="space-y-3">
        {tasks.length === 0 ? (
          <div className="py-12 text-center text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            <p>暂无提醒任务</p>
            <p className="text-xs mt-1">点击上方按钮创建</p>
          </div>
        ) : (
          tasks.map(task => (
            <TaskCard
              key={task.id}
              task={task}
              isRunning={runningTaskId === task.id}
              hasPausedState={pausedState?.taskId === task.id}
              pausedSeconds={pausedState?.taskId === task.id ? pausedState.remainingSeconds : undefined}
              pausedRingCount={pausedState?.taskId === task.id ? pausedState.ringCount : undefined}
              onStart={() => startTask(task)}
              onStop={stopTask}
              onReset={() => resetTask(task.id)}
              onEdit={() => setEditingTask(task)}
              onDelete={() => handleDeleteTask(task.id)}
              onToggleActive={() => toggleTaskActive(task.id)}
            />
          ))
        )}
      </div>

      {/* 添加/编辑任务弹窗 */}
      {(isAddModalOpen || editingTask) && (
        <TaskModal
          task={editingTask}
          tasks={tasks}
          onClose={() => {
            setIsAddModalOpen(false);
            setEditingTask(null);
          }}
          onSave={editingTask ? handleUpdateTask : handleAddTask}
        />
      )}

      {/* 完成弹窗 */}
      {showCompletionModal && completionData && (
        <CompletionModal
          taskName={completionData.taskName}
          ringCount={completionData.ringCount}
          onClose={() => {
            setShowCompletionModal(false);
            setCompletionData(null);
          }}
        />
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirmId && (
        <DeleteConfirmModal
          taskName={tasks.find(t => t.id === deleteConfirmId)?.name || ''}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirmId(null)}
        />
      )}

      {/* 休息选择弹窗 */}
      {showBreakModal && (
        <BreakModal
          onContinue={continueTask}
          onPause={pauseTask}
        />
      )}
    </div>
  );
};

// 任务卡片组件
interface TaskCardProps {
  task: ReminderTask;
  isRunning: boolean;
  hasPausedState?: boolean;
  pausedSeconds?: number;
  pausedRingCount?: number;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: () => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, isRunning, hasPausedState, pausedSeconds, pausedRingCount, onStart, onStop, onReset, onEdit, onDelete, onToggleActive }) => {
  const config = PRIORITY_CONFIG[task.priority];

  return (
    <div className={`p-4 rounded-2xl border transition-all ${config.bgColor} ${config.borderColor} ${!task.isActive ? 'opacity-50' : ''}`}>
      {/* 顶部：标题 + 开关 */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <h3 className="text-white font-medium">{task.name}</h3>
          <span className={`text-xs px-2 py-0.5 rounded-full ${config.bgColor} ${config.color} border ${config.borderColor}`}>
            {config.label}
          </span>
        </div>
        {/* 启用开关 */}
        <button
          onClick={onToggleActive}
          className={`w-10 h-6 rounded-full transition-colors shrink-0 ${task.isActive ? 'bg-cyber-lime' : 'bg-gray-600'}`}
        >
          <div className={`w-4 h-4 bg-white rounded-full transition-transform ${task.isActive ? 'translate-x-5' : 'translate-x-1'}`} />
        </button>
      </div>

      {/* 描述 */}
      {task.description && (
        <p className="text-gray-400 text-sm mb-2 line-clamp-2">{task.description}</p>
      )}

      {/* 时间信息 */}
      <div className="flex items-center gap-4 text-xs text-gray-500 mb-3">
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          {task.totalMinutes} 分钟
        </span>
        <span className="flex items-center gap-1">
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 0 0 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z" />
          </svg>
          {task.intervalOptions.map(v => v < 1 ? `${Math.round(v * 60)}秒` : `${v}分钟`).join('/')}
        </span>
      </div>

      {/* 暂停状态显示 */}
      {hasPausedState && pausedSeconds !== undefined && (
        <div className="flex items-center justify-between mb-3 px-3 py-2.5 bg-orange-500/30 backdrop-blur-sm border border-orange-500/40 rounded-lg">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-orange-300" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
            <span className="text-orange-200 text-sm font-bold">已暂停</span>
            {pausedRingCount !== undefined && pausedRingCount > 0 && (
              <span className="text-orange-300/70 text-xs">· 已提醒 {pausedRingCount} 次</span>
            )}
          </div>
          <span className="text-orange-100 font-mono font-bold text-lg">
            {formatTime(pausedSeconds)}
          </span>
        </div>
      )}

      {/* 底部操作按钮 */}
      <div className="flex items-center gap-2 pt-2 border-t border-white/10">
        {isRunning ? (
          <>
            <button
              onClick={onStop}
              className="flex-1 py-2 rounded-lg bg-amber-500/20 text-amber-400 text-sm font-medium flex items-center justify-center gap-1.5 active:bg-amber-500/30 transition-colors"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
              暂停
            </button>
            <button
              onClick={onReset}
              className="p-2 rounded-lg bg-red-500/20 text-red-400 active:bg-red-500/30 transition-colors"
              title="重置"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </>
        ) : hasPausedState ? (
          <>
            <button
              onClick={onStart}
              disabled={!task.isActive}
              className="flex-1 py-2 rounded-lg bg-cyber-lime/20 text-cyber-lime text-sm font-medium flex items-center justify-center gap-1.5 active:bg-cyber-lime/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              继续
            </button>
            <button
              onClick={onReset}
              className="p-2 rounded-lg bg-red-500/20 text-red-400 active:bg-red-500/30 transition-colors"
              title="重置"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                <path d="M3 3v5h5" />
              </svg>
            </button>
          </>
        ) : (
          <button
            onClick={onStart}
            disabled={!task.isActive}
            className="flex-1 py-2 rounded-lg bg-cyber-lime/20 text-cyber-lime text-sm font-medium flex items-center justify-center gap-1.5 active:bg-cyber-lime/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            开始
          </button>
        )}

        <button
          onClick={onEdit}
          className="p-2 rounded-lg bg-white/5 text-gray-400 active:bg-white/10 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>

        <button
          onClick={onDelete}
          className="p-2 rounded-lg bg-white/5 text-gray-400 active:bg-red-500/20 active:text-red-400 transition-colors"
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// 任务编辑弹窗
interface TaskModalProps {
  task: ReminderTask | null;
  tasks: ReminderTask[];
  onClose: () => void;
  onSave: (data: Omit<ReminderTask, 'id' | 'isActive' | 'createdAt'>) => void;
}

const TaskModal: React.FC<TaskModalProps> = ({ task, tasks, onClose, onSave }) => {
  const [name, setName] = useState(task?.name || '');
  const [description, setDescription] = useState(task?.description || '');
  const [priority, setPriority] = useState<ReminderPriority>(task?.priority || 'medium');
  const [totalMinutes, setTotalMinutes] = useState(task?.totalMinutes || 30);
  // intervalOptions 现在存储秒数（兼容旧数据：如果值 >= 1 且 <= 60，认为是分钟数，转换为秒）
  const [intervalOptions, setIntervalOptions] = useState<number[]>(() => {
    const opts = task?.intervalOptions || DEFAULT_INTERVALS;
    // 兼容旧数据：如果所有值都 <= 60，认为是分钟数，转换为秒
    const needsConvert = opts.every(v => v <= 60);
    return needsConvert ? opts.map(v => v * 60) : opts;
  });
  const [customInterval, setCustomInterval] = useState('');
  const [intervalUnit, setIntervalUnit] = useState<'seconds' | 'minutes'>('minutes');
  const [followTaskId, setFollowTaskId] = useState<string | undefined>(task?.followTaskId);
  const [followDelayMinutes, setFollowDelayMinutes] = useState(task?.followDelayMinutes || 1);

  // 可选择的前置任务（排除自己）
  const availableTasks = tasks.filter(t => t.id !== task?.id);

  // 格式化间隔显示
  const formatInterval = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}秒`;
    }
    return `${seconds / 60}分钟`;
  };

  const handleSubmit = () => {
    if (!name.trim()) return;
    onSave({
      name: name.trim(),
      description: description.trim() || undefined,
      priority,
      totalMinutes,
      // 保存时转换回分钟数（兼容旧逻辑）
      intervalOptions: intervalOptions.length > 0 
        ? intervalOptions.map(s => s / 60) // 存储为分钟
        : DEFAULT_INTERVALS,
      followTaskId: followTaskId || undefined,
      followDelayMinutes: followTaskId ? followDelayMinutes : undefined,
    });
  };

  const addInterval = () => {
    const num = parseFloat(customInterval);
    if (num > 0) {
      // 根据单位转换为秒
      const seconds = intervalUnit === 'minutes' ? num * 60 : num;
      if (!intervalOptions.includes(seconds)) {
        setIntervalOptions(prev => [...prev, seconds].sort((a, b) => a - b));
        setCustomInterval('');
      }
    }
  };

  const removeInterval = (val: number) => {
    setIntervalOptions(prev => prev.filter(v => v !== val));
  };

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-end justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full max-w-lg bg-cyber-card rounded-t-3xl border-t border-white/10 animate-drawer-slide-up-stable overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部光晕背景 - 全宽渐变 */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-cyber-lime/20 to-transparent pointer-events-none" />

        {/* 拖拽条 */}
        <div className="flex justify-center pt-3 pb-2 relative z-10">
          <div className="w-10 h-1 bg-white/25 rounded-full" />
        </div>

        <div className="px-5 pb-6 max-h-[80vh] overflow-y-auto">
          <h2 className="text-lg font-bold text-white mb-4">
            {task ? '编辑任务' : '新建任务'}
          </h2>

          {/* 任务名称 */}
          <div className="mb-4">
            <label className="text-sm text-gray-400 mb-1.5 block">任务名称</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="如：专注工作"
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyber-lime/50 focus:outline-none transition-colors"
            />
          </div>

          {/* 描述 */}
          <div className="mb-4">
            <label className="text-sm text-gray-400 mb-1.5 block">描述（可选）</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="任务详情或备注..."
              rows={2}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyber-lime/50 focus:outline-none transition-colors resize-none"
            />
          </div>

          {/* 紧急程度 */}
          <div className="mb-4">
            <label className="text-sm text-gray-400 mb-1.5 block">紧急程度</label>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(PRIORITY_CONFIG) as ReminderPriority[]).map(p => (
                <button
                  key={p}
                  onClick={() => setPriority(p)}
                  className={`py-2 rounded-lg border text-sm font-medium transition-all ${priority === p
                      ? `${PRIORITY_CONFIG[p].bgColor} ${PRIORITY_CONFIG[p].borderColor} ${PRIORITY_CONFIG[p].color}`
                      : 'border-white/10 text-gray-400 hover:border-white/20'
                    }`}
                >
                  {PRIORITY_CONFIG[p].label}
                </button>
              ))}
            </div>
          </div>

          {/* 总时长 */}
          <div className="mb-4">
            <label className="text-sm text-gray-400 mb-1.5 block">总时长</label>
            {/* 快捷选项 */}
            <div className="flex flex-wrap gap-2 mb-3">
              {[5, 15, 30, 60].map(min => (
                <button
                  key={min}
                  onClick={() => setTotalMinutes(min)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${totalMinutes === min ? 'bg-cyber-lime/20 text-cyber-lime border border-cyber-lime/50' : 'bg-white/5 text-gray-400 border border-white/10 hover:border-white/20'}`}
                >
                  {min}分钟
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min="5"
                max="180"
                step="5"
                value={Math.max(5, totalMinutes)}
                onChange={e => setTotalMinutes(Number(e.target.value))}
                className="flex-1 accent-cyber-lime"
              />
              <div className="w-20 px-3 py-2 border rounded-lg text-center font-mono text-sm bg-white/5 border-white/10 text-white">
                {totalMinutes}分
              </div>
            </div>
          </div>

          {/* 随机间隔选项 */}
          <div className="mb-6">
            <label className="text-sm text-gray-400 mb-1.5 block">随机间隔</label>
            {/* 已添加的间隔 */}
            <div className="flex flex-wrap gap-2 mb-3">
              {intervalOptions.map(val => (
                <span
                  key={val}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-sm bg-cyber-lime/20 text-cyber-lime"
                >
                  {formatInterval(val)}
                  <button onClick={() => removeInterval(val)} className="hover:text-white">
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </span>
              ))}
            </div>
            {/* 添加新间隔 */}
            <div className="flex gap-2">
              <input
                type="number"
                min="1"
                value={customInterval}
                onChange={e => setCustomInterval(e.target.value)}
                placeholder="输入数值"
                className="flex-1 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-gray-500 focus:border-cyber-lime/50 focus:outline-none text-sm"
              />
              {/* 单位选择 */}
              <div className="flex rounded-lg overflow-hidden border border-white/10">
                <button
                  onClick={() => setIntervalUnit('seconds')}
                  className={`px-3 py-2 transition-colors ${intervalUnit === 'seconds' ? 'bg-cyber-lime/20 text-cyber-lime' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                  title="秒"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12" />
                  </svg>
                </button>
                <button
                  onClick={() => setIntervalUnit('minutes')}
                  className={`px-3 py-2 transition-colors ${intervalUnit === 'minutes' ? 'bg-cyber-lime/20 text-cyber-lime' : 'bg-white/5 text-gray-400 hover:text-white'}`}
                  title="分钟"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="12 6 12 12 16 14" />
                  </svg>
                </button>
              </div>
              <button
                onClick={addInterval}
                className="px-3 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-white transition-colors"
                title="添加"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </button>
            </div>
          </div>

          {/* 任务编排 */}
          {availableTasks.length > 0 && (
            <div className="mb-6">
              <label className="text-sm text-gray-400 mb-1.5 block">任务编排（可选）</label>
              <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                <select
                  value={followTaskId || ''}
                  onChange={e => setFollowTaskId(e.target.value || undefined)}
                  className="w-full px-3 py-2 bg-[#1a1a1a] border border-white/10 rounded-lg text-white focus:border-cyber-lime/50 focus:outline-none text-sm mb-2"
                >
                  <option value="" className="bg-[#1a1a1a] text-white">不设置（手动启动）</option>
                  {availableTasks.map(t => (
                    <option key={t.id} value={t.id} className="bg-[#1a1a1a] text-white">
                      在「{t.name}」结束后自动启动
                    </option>
                  ))}
                </select>
                {followTaskId && (
                  <div className="flex items-center gap-2 mt-2">
                    <span className="text-gray-400 text-xs">延迟</span>
                    <input
                      type="number"
                      min="0"
                      max="30"
                      value={followDelayMinutes}
                      onChange={e => setFollowDelayMinutes(Math.max(0, parseInt(e.target.value) || 0))}
                      className="w-16 px-2 py-1 bg-white/5 border border-white/10 rounded text-white text-center text-sm"
                    />
                    <span className="text-gray-400 text-xs">分钟后启动</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleSubmit}
              disabled={!name.trim()}
              className="flex-1 py-3 bg-cyber-lime hover:bg-cyber-lime/90 rounded-xl text-black font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {task ? '保存' : '创建'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes drawer-slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-drawer-slide-up {
          animation: drawer-slide-up 0.35s cubic-bezier(0.16, 1, 0.3, 1);
        }
        @keyframes drawer-slide-up-stable {
          from { margin-bottom: -100%; opacity: 0; }
          to { margin-bottom: 0; opacity: 1; }
        }
        .animate-drawer-slide-up-stable {
          animation: drawer-slide-up-stable 0.35s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        }
      `}</style>
    </div>,
    document.body
  );
};

// 完成弹窗
interface CompletionModalProps {
  taskName: string;
  ringCount: number;
  onClose: () => void;
}

const CompletionModal: React.FC<CompletionModalProps> = ({ taskName, ringCount, onClose }) => {
  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full max-w-sm bg-[#0c0c0c] rounded-3xl border border-white/10 p-6 text-center animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* 成功图标 */}
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-cyber-lime/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 12l2 2 4-4" />
            <circle cx="12" cy="12" r="10" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">任务完成！</h2>
        <p className="text-gray-400 mb-6">{taskName}</p>

        <div className="bg-white/5 rounded-2xl p-4 mb-6">
          <div className="text-4xl font-bold text-cyber-lime mb-1">{ringCount}</div>
          <div className="text-sm text-gray-500">次提醒</div>
        </div>

        <button
          onClick={onClose}
          className="w-full py-3 bg-cyber-lime hover:bg-cyber-lime/90 rounded-xl text-black font-medium transition-colors"
        >
          完成
        </button>
      </div>

      <style>{`
        @keyframes scale-in {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>,
    document.body
  );
};

// 删除确认弹窗
interface DeleteConfirmModalProps {
  taskName: string;
  onConfirm: () => void;
  onCancel: () => void;
}

const DeleteConfirmModal: React.FC<DeleteConfirmModalProps> = ({ taskName, onConfirm, onCancel }) => {
  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full max-w-sm bg-[#0c0c0c] rounded-2xl border border-white/10 p-5 animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* 警告图标 */}
        <div className="w-14 h-14 mx-auto mb-4 rounded-full bg-red-500/20 flex items-center justify-center">
          <svg className="w-7 h-7 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </div>

        <h2 className="text-lg font-bold text-white text-center mb-2">确认删除</h2>
        <p className="text-gray-400 text-center text-sm mb-6">
          确定要删除任务 "<span className="text-white">{taskName}</span>" 吗？<br />
          此操作无法撤销。
        </p>

        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors"
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 bg-red-500 hover:bg-red-600 rounded-xl text-white font-medium transition-colors"
          >
            删除
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scale-in {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>,
    document.body
  );
};

// 休息选择弹窗
interface BreakModalProps {
  onContinue: () => void;
  onPause: () => void;
}

const BreakModal: React.FC<BreakModalProps> = ({ onContinue, onPause }) => {
  return createPortal(
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" />
      <div
        className="relative w-full max-w-sm bg-[#0c0c0c] rounded-3xl border border-white/10 p-6 text-center animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* 休息图标 */}
        <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
          <svg className="w-10 h-10 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18.36 6.64a9 9 0 1 1-12.73 0" />
            <line x1="12" y1="2" x2="12" y2="12" />
          </svg>
        </div>

        <h2 className="text-xl font-bold text-white mb-2">休息一下？</h2>
        <p className="text-gray-400 text-sm mb-6">
          提醒时间到了，选择继续专注或暂停休息
        </p>

        <div className="space-y-3">
          <button
            onClick={onContinue}
            className="w-full py-3.5 bg-cyber-lime hover:bg-cyber-lime/90 rounded-xl text-black font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            继续专注
          </button>
          <button
            onClick={onPause}
            className="w-full py-3.5 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="4" width="4" height="16" rx="1" />
              <rect x="14" y="4" width="4" height="16" rx="1" />
            </svg>
            暂停休息
          </button>
        </div>
      </div>

      <style>{`
        @keyframes scale-in {
          from { transform: scale(0.9); opacity: 0; }
          to { transform: scale(1); opacity: 1; }
        }
        .animate-scale-in {
          animation: scale-in 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>
    </div>,
    document.body
  );
};

export default IntervalReminder;
