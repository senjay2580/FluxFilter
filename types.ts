export interface Video {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  views: string;
  author: string;
  avatar: string;
  createdAt: Date;
  tags: string[];
  description: string;
}

export type FilterType = 'all' | 'today' | 'week' | 'month' | 'custom';

export interface DateFilter {
  year?: number;
  month?: number;
  day?: number;
}

export type Tab = 'home' | 'watchLater' | 'rss' | 'todo' | 'settings';

// 间歇提醒器类型
export type ReminderPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface ReminderTask {
  id: string;
  name: string;
  description?: string;
  priority: ReminderPriority;
  totalMinutes: number; // 总时长（分钟）
  intervalOptions: number[]; // 可选间隔时间（分钟），如 [2, 3, 4, 5]
  isActive: boolean;
  createdAt: number;
  // 任务编排
  followTaskId?: string; // 在哪个任务后执行
  followDelayMinutes?: number; // 延迟几分钟后执行
}

// 暂停状态类型
export interface PausedState {
  taskId: string;
  remainingSeconds: number;
  nextIntervalSeconds: number;
  ringCount: number;
  pausedAt: number; // 暂停时间戳
}
