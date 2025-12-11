# 阅读计划功能设计文档

## 一、需求分析

### 1.1 功能概述

**阅读计划 (Reading Plan)** - AI 根据当天的视频内容长度、RSS 文章和 TODO 任务，智能生成当天的时间管理计划。

### 1.2 输入数据源

| 数据源 | 存储位置 | 关键字段 | 用途 |
|--------|----------|----------|------|
| 今日视频 | Supabase `video` | `duration` (秒), `title`, `uploader` | 计算观看时长 |
| 待看列表 | Supabase `watchlist` | `bvid`, `priority` | 优先级排序 |
| RSS 文章 | API 实时获取 | `title`, `excerpt`, `link` | 阅读内容 |
| TODO 任务 | localStorage `fluxf-todos` | `text`, `priority`, `completed` | 待办事项 |
| 提醒任务 | localStorage `interval-reminder-tasks` | `name`, `totalMinutes`, `priority` | 时间块 |

### 1.3 输出内容

```
阅读计划 - 2024年12月11日
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📊 今日概览
├─ 视频待看: 5个 (共 45 分钟)
├─ RSS 文章: 12 篇 (预计 30 分钟)
├─ TODO 任务: 3 个高优先级
└─ 总预计时长: 1小时15分钟

⏰ 建议时间安排
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
09:00 - 09:15  [高优先级] 完成 TODO: 写周报
09:15 - 09:30  [视频] 《AI新闻速递》(12分钟) - 思维火种
09:30 - 09:45  [RSS] 少数派: 效率工具推荐
09:45 - 10:00  [休息] 间歇提醒: 眼保健操
...

💡 AI 建议
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
1. 短视频优先，保持专注力
2. RSS 可利用碎片时间阅读
3. 高优先级 TODO 建议上午完成
```

---

## 二、数据模型设计

### 2.1 核心类型定义

```typescript
// types/readingPlan.ts

// 计划项类型
export type PlanItemType = 'video' | 'rss' | 'todo' | 'reminder' | 'break';

// 优先级
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

// 单个计划项
export interface PlanItem {
  id: string;
  type: PlanItemType;
  title: string;
  subtitle?: string;           // UP主名称 / RSS来源 / 分类
  duration: number;            // 预计时长（分钟）
  priority: Priority;
  startTime?: string;          // HH:mm 格式
  endTime?: string;            // HH:mm 格式
  completed: boolean;
  
  // 原始数据引用
  sourceId?: string;           // bvid / article id / todo id
  sourceType?: string;         // 'video' | 'article' | 'todo'
  link?: string;               // 跳转链接
}

// 统计摘要
export interface PlanSummary {
  totalVideos: number;
  totalVideoMinutes: number;
  totalArticles: number;
  totalArticleMinutes: number;  // 按 3分钟/篇 估算
  totalTodos: number;
  highPriorityTodos: number;
  totalMinutes: number;
}

// 完整阅读计划
export interface ReadingPlan {
  id: string;
  date: string;                // YYYY-MM-DD
  createdAt: number;
  summary: PlanSummary;
  items: PlanItem[];
  aiSuggestions: string[];     // AI 建议列表
  
  // 用户可用时间设置
  availableStartTime: string;  // 默认 09:00
  availableEndTime: string;    // 默认 22:00
  breakInterval: number;       // 休息间隔（分钟），默认 45
  breakDuration: number;       // 休息时长（分钟），默认 10
}

// 用户偏好设置
export interface PlanPreferences {
  preferVideoFirst: boolean;   // 优先看视频
  preferShortContent: boolean; // 优先短内容
  includeRss: boolean;         // 是否包含 RSS
  includeTodo: boolean;        // 是否包含 TODO
  maxDailyMinutes: number;     // 每日最大时长
  defaultStartTime: string;
  defaultEndTime: string;
}
```

### 2.2 存储设计

```typescript
// 存储 Key
const STORAGE_KEYS = {
  CURRENT_PLAN: 'reading-plan-current',      // 当前计划
  PLAN_HISTORY: 'reading-plan-history',      // 历史计划
  PREFERENCES: 'reading-plan-preferences',   // 用户偏好
};

// 存储结构
interface StoredPlan {
  plan: ReadingPlan;
  version: number;
}

interface PlanHistory {
  plans: ReadingPlan[];
  maxItems: number;  // 保留最近 7 天
}
```

---

## 三、程序流程设计

### 3.1 整体流程图

```
┌─────────────────────────────────────────────────────────────────┐
│                    阅读计划生成流程                               │
└─────────────────────────────────────────────────────────────────┘

  用户点击"生成计划"
         │
         ▼
  ┌─────────────────┐
  │  1. 收集数据     │
  └────────┬────────┘
           │
    ┌──────┴──────┬──────────────┬─────────────┐
    ▼             ▼              ▼             ▼
 获取今日      获取待看       获取RSS       获取TODO
 视频列表     列表视频       文章列表       任务列表
    │             │              │             │
    └──────┬──────┴──────────────┴─────────────┘
           │
           ▼
  ┌─────────────────┐
  │  2. 数据预处理   │
  │  - 过滤已完成    │
  │  - 计算时长      │
  │  - 优先级排序    │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │  3. AI 智能排期  │  ←── Gemini API
  │  - 时间块分配    │      (可选，无API时用本地算法)
  │  - 生成建议      │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │  4. 生成计划     │
  │  - 构建时间表    │
  │  - 插入休息时间  │
  └────────┬────────┘
           │
           ▼
  ┌─────────────────┐
  │  5. 存储 & 展示  │
  │  - 保存到本地    │
  │  - 渲染 UI      │
  └─────────────────┘
```

### 3.2 数据收集模块

```typescript
// services/planDataCollector.ts

import { supabase } from '../lib/supabase';
import type { VideoWithUploader } from '../lib/database.types';

interface CollectedData {
  videos: VideoWithUploader[];
  watchlistVideos: VideoWithUploader[];
  articles: Article[];
  todos: Todo[];
  reminders: ReminderTask[];
}

export async function collectPlanData(userId: string): Promise<CollectedData> {
  // 获取今日开始时间
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  // 并行获取所有数据
  const [videosResult, watchlistResult, articles, todos, reminders] = await Promise.all([
    // 1. 今日视频
    supabase
      .from('video')
      .select('*, uploader:uploader!fk_video_uploader (name, face)')
      .eq('user_id', userId)
      .gte('pubdate', todayStart.toISOString())
      .order('pubdate', { ascending: false }),
    
    // 2. 待看列表（未观看的）
    supabase
      .from('watchlist')
      .select(`
        bvid, priority, is_watched,
        video:video!inner (*, uploader:uploader!fk_video_uploader (name, face))
      `)
      .eq('user_id', userId)
      .eq('is_watched', false)
      .order('priority', { ascending: false })
      .limit(10),
    
    // 3. RSS 文章 (从缓存或API获取)
    fetchTodayArticles(),
    
    // 4. TODO 任务
    loadTodosFromStorage(),
    
    // 5. 提醒任务
    loadRemindersFromStorage()
  ]);
  
  return {
    videos: videosResult.data || [],
    watchlistVideos: (watchlistResult.data || []).map(w => w.video).filter(Boolean),
    articles,
    todos: todos.filter(t => !t.completed),
    reminders: reminders.filter(r => r.isActive)
  };
}

// 从 localStorage 加载 TODO
function loadTodosFromStorage(): Todo[] {
  try {
    return JSON.parse(localStorage.getItem('fluxf-todos') || '[]');
  } catch {
    return [];
  }
}

// 从 localStorage 加载提醒任务
function loadRemindersFromStorage(): ReminderTask[] {
  try {
    return JSON.parse(localStorage.getItem('interval-reminder-tasks') || '[]');
  } catch {
    return [];
  }
}

// 获取今日 RSS 文章（复用 RssFeed 组件的逻辑）
async function fetchTodayArticles(): Promise<Article[]> {
  // 从缓存获取，或重新请求
  const cached = sessionStorage.getItem('rss-articles-cache');
  if (cached) {
    const { data, timestamp } = JSON.parse(cached);
    // 缓存 10 分钟有效
    if (Date.now() - timestamp < 10 * 60 * 1000) {
      return data;
    }
  }
  
  // 实际项目中调用 RSS API
  // return await fetchRssArticles();
  return [];
}
```

### 3.3 计划生成模块

```typescript
// services/planGenerator.ts

import type { ReadingPlan, PlanItem, PlanSummary, Priority } from '../types/readingPlan';

interface GeneratorOptions {
  startTime: string;      // HH:mm
  endTime: string;        // HH:mm
  breakInterval: number;  // 分钟
  breakDuration: number;  // 分钟
  preferShortFirst: boolean;
}

export function generatePlan(
  data: CollectedData,
  options: GeneratorOptions
): ReadingPlan {
  const planItems: PlanItem[] = [];
  
  // 1. 转换视频为计划项
  const videoItems = data.watchlistVideos.map(video => ({
    id: `video-${video.bvid}`,
    type: 'video' as const,
    title: video.title,
    subtitle: video.uploader?.name || '未知UP主',
    duration: Math.ceil(video.duration / 60),  // 秒转分钟
    priority: mapPriority(video.priority || 0),
    completed: false,
    sourceId: video.bvid,
    sourceType: 'video',
    link: `https://www.bilibili.com/video/${video.bvid}`
  }));
  
  // 2. 转换 TODO 为计划项
  const todoItems = data.todos.map(todo => ({
    id: `todo-${todo.id}`,
    type: 'todo' as const,
    title: todo.text,
    subtitle: todo.category || '未分类',
    duration: estimateTodoDuration(todo),  // 根据文本长度估算
    priority: todo.priority as Priority,
    completed: false,
    sourceId: todo.id,
    sourceType: 'todo'
  }));
  
  // 3. 转换 RSS 为计划项
  const rssItems = data.articles.slice(0, 5).map(article => ({
    id: `rss-${article.id}`,
    type: 'rss' as const,
    title: article.title,
    subtitle: article.author,
    duration: 3,  // RSS 文章默认 3 分钟
    priority: 'medium' as Priority,
    completed: false,
    sourceId: article.id,
    sourceType: 'article',
    link: article.link
  }));
  
  // 4. 合并并排序
  const allItems = [...videoItems, ...todoItems, ...rssItems];
  const sortedItems = sortByPriorityAndDuration(allItems, options.preferShortFirst);
  
  // 5. 分配时间
  const scheduledItems = scheduleItems(sortedItems, options);
  
  // 6. 插入休息时间
  const itemsWithBreaks = insertBreaks(scheduledItems, options);
  
  // 7. 计算摘要
  const summary = calculateSummary(data);
  
  // 8. 生成 AI 建议
  const suggestions = generateSuggestions(summary, sortedItems);
  
  return {
    id: `plan-${Date.now()}`,
    date: new Date().toISOString().split('T')[0],
    createdAt: Date.now(),
    summary,
    items: itemsWithBreaks,
    aiSuggestions: suggestions,
    availableStartTime: options.startTime,
    availableEndTime: options.endTime,
    breakInterval: options.breakInterval,
    breakDuration: options.breakDuration
  };
}

// 优先级 + 时长排序
function sortByPriorityAndDuration(items: PlanItem[], shortFirst: boolean): PlanItem[] {
  const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
  
  return items.sort((a, b) => {
    // 先按优先级
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    // 同优先级按时长
    return shortFirst ? a.duration - b.duration : b.duration - a.duration;
  });
}

// 时间分配
function scheduleItems(items: PlanItem[], options: GeneratorOptions): PlanItem[] {
  let currentTime = parseTime(options.startTime);
  const endTime = parseTime(options.endTime);
  
  return items.map(item => {
    if (currentTime + item.duration > endTime) {
      return { ...item, startTime: undefined, endTime: undefined };
    }
    
    const startTime = formatTime(currentTime);
    currentTime += item.duration;
    const end = formatTime(currentTime);
    
    return { ...item, startTime, endTime: end };
  });
}

// 插入休息时间
function insertBreaks(items: PlanItem[], options: GeneratorOptions): PlanItem[] {
  const result: PlanItem[] = [];
  let accumulatedMinutes = 0;
  
  for (const item of items) {
    if (!item.startTime) {
      result.push(item);
      continue;
    }
    
    accumulatedMinutes += item.duration;
    result.push(item);
    
    // 每隔一段时间插入休息
    if (accumulatedMinutes >= options.breakInterval) {
      result.push({
        id: `break-${Date.now()}-${Math.random()}`,
        type: 'break',
        title: '休息时间',
        subtitle: '放松眼睛，活动身体',
        duration: options.breakDuration,
        priority: 'low',
        completed: false
      });
      accumulatedMinutes = 0;
    }
  }
  
  return result;
}

// 生成建议
function generateSuggestions(summary: PlanSummary, items: PlanItem[]): string[] {
  const suggestions: string[] = [];
  
  if (summary.totalMinutes > 180) {
    suggestions.push('📌 今日内容较多，建议分散到明天处理');
  }
  
  if (summary.highPriorityTodos > 0) {
    suggestions.push('⚡ 有高优先级任务，建议优先处理');
  }
  
  const shortVideos = items.filter(i => i.type === 'video' && i.duration < 10);
  if (shortVideos.length > 3) {
    suggestions.push('💡 短视频较多，可利用碎片时间观看');
  }
  
  if (summary.totalArticles > 10) {
    suggestions.push('📚 RSS 文章较多，可选择性阅读');
  }
  
  return suggestions;
}

// 辅助函数
function parseTime(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
}

function mapPriority(num: number): Priority {
  if (num >= 3) return 'urgent';
  if (num >= 2) return 'high';
  if (num >= 1) return 'medium';
  return 'low';
}

function estimateTodoDuration(todo: Todo): number {
  // 根据文本长度估算：每 20 字符 1 分钟，最少 5 分钟
  return Math.max(5, Math.ceil(todo.text.length / 20));
}

function calculateSummary(data: CollectedData): PlanSummary {
  const totalVideoMinutes = data.watchlistVideos.reduce(
    (sum, v) => sum + Math.ceil(v.duration / 60), 0
  );
  const totalArticleMinutes = data.articles.length * 3;
  
  return {
    totalVideos: data.watchlistVideos.length,
    totalVideoMinutes,
    totalArticles: data.articles.length,
    totalArticleMinutes,
    totalTodos: data.todos.length,
    highPriorityTodos: data.todos.filter(t => t.priority === 'high').length,
    totalMinutes: totalVideoMinutes + totalArticleMinutes + data.todos.length * 10
  };
}
```

### 3.4 AI 增强模块（可选）

```typescript
// services/aiPlanEnhancer.ts

import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;

interface AIPlanInput {
  videos: { title: string; duration: number; uploader: string }[];
  todos: { text: string; priority: string }[];
  articles: { title: string }[];
  availableMinutes: number;
}

export async function enhancePlanWithAI(input: AIPlanInput): Promise<{
  scheduleSuggestion: string;
  priorityAdvice: string;
  timeBlocks: string[];
}> {
  // 无 API Key 时使用本地逻辑
  if (!GEMINI_API_KEY) {
    return getLocalSuggestions(input);
  }
  
  try {
    const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
    
    const prompt = `
你是一个时间管理专家。根据以下内容，生成一个合理的阅读计划建议。

待看视频：
${input.videos.map(v => `- ${v.title} (${v.duration}分钟) - ${v.uploader}`).join('\n')}

TODO任务：
${input.todos.map(t => `- [${t.priority}] ${t.text}`).join('\n')}

RSS文章数量：${input.articles.length} 篇

可用时间：${input.availableMinutes} 分钟

请用 JSON 格式返回：
{
  "scheduleSuggestion": "总体安排建议",
  "priorityAdvice": "优先级建议",
  "timeBlocks": ["时间块1建议", "时间块2建议", ...]
}
`;
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.0-flash',
      contents: prompt,
    });
    
    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error('AI 增强失败:', error);
    return getLocalSuggestions(input);
  }
}

// 本地建议生成（无 AI 时的降级方案）
function getLocalSuggestions(input: AIPlanInput) {
  const suggestions: string[] = [];
  
  if (input.videos.length > 0) {
    const shortVideos = input.videos.filter(v => v.duration < 15);
    if (shortVideos.length > 0) {
      suggestions.push(`先看 ${shortVideos.length} 个短视频（<15分钟）热身`);
    }
  }
  
  if (input.todos.some(t => t.priority === 'high')) {
    suggestions.push('上午精力充沛时处理高优先级任务');
  }
  
  suggestions.push('每 45 分钟休息 10 分钟');
  
  return {
    scheduleSuggestion: '建议按优先级顺序完成，穿插休息',
    priorityAdvice: '高优先级任务优先，短内容可穿插进行',
    timeBlocks: suggestions
  };
}
```

---

## 四、组件设计

### 4.1 组件结构

```
components/
├── ReadingPlan/
│   ├── index.tsx              # 主组件（入口）
│   ├── PlanSummary.tsx        # 摘要卡片
│   ├── PlanTimeline.tsx       # 时间线列表
│   ├── PlanItem.tsx           # 单个计划项
│   ├── PlanSettings.tsx       # 设置面板
│   └── PlanGenerator.tsx      # 生成按钮和加载状态
```

### 4.2 主组件设计

```tsx
// components/ReadingPlan/index.tsx

import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PlanSummary from './PlanSummary';
import PlanTimeline from './PlanTimeline';
import PlanSettings from './PlanSettings';
import { collectPlanData } from '../../services/planDataCollector';
import { generatePlan } from '../../services/planGenerator';
import type { ReadingPlan, PlanPreferences } from '../../types/readingPlan';

interface ReadingPlanProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  // 复用已有数据（避免重复查询）
  videos?: VideoWithUploader[];
  watchlistBvids?: Set<string>;
}

const ReadingPlanComponent: React.FC<ReadingPlanProps> = ({
  isOpen,
  onClose,
  userId,
  videos,
  watchlistBvids
}) => {
  const [plan, setPlan] = useState<ReadingPlan | null>(null);
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<PlanPreferences>(() => {
    const saved = localStorage.getItem('reading-plan-preferences');
    return saved ? JSON.parse(saved) : {
      preferVideoFirst: true,
      preferShortContent: true,
      includeRss: true,
      includeTodo: true,
      maxDailyMinutes: 180,
      defaultStartTime: '09:00',
      defaultEndTime: '22:00'
    };
  });
  
  // 加载已有计划
  useEffect(() => {
    if (isOpen) {
      const saved = localStorage.getItem('reading-plan-current');
      if (saved) {
        const { plan: savedPlan } = JSON.parse(saved);
        // 检查是否是今天的计划
        const today = new Date().toISOString().split('T')[0];
        if (savedPlan.date === today) {
          setPlan(savedPlan);
        }
      }
    }
  }, [isOpen]);
  
  // 生成计划
  const handleGenerate = useCallback(async () => {
    setLoading(true);
    try {
      const data = await collectPlanData(userId);
      
      // 如果父组件传入了数据，优先使用（避免重复查询）
      if (videos && watchlistBvids) {
        data.watchlistVideos = videos.filter(v => watchlistBvids.has(v.bvid));
      }
      
      const newPlan = generatePlan(data, {
        startTime: preferences.defaultStartTime,
        endTime: preferences.defaultEndTime,
        breakInterval: 45,
        breakDuration: 10,
        preferShortFirst: preferences.preferShortContent
      });
      
      setPlan(newPlan);
      
      // 保存到本地
      localStorage.setItem('reading-plan-current', JSON.stringify({
        plan: newPlan,
        version: 1
      }));
    } catch (error) {
      console.error('生成计划失败:', error);
    } finally {
      setLoading(false);
    }
  }, [userId, videos, watchlistBvids, preferences]);
  
  // 标记完成
  const handleToggleComplete = useCallback((itemId: string) => {
    setPlan(prev => {
      if (!prev) return prev;
      const updated = {
        ...prev,
        items: prev.items.map(item =>
          item.id === itemId ? { ...item, completed: !item.completed } : item
        )
      };
      localStorage.setItem('reading-plan-current', JSON.stringify({
        plan: updated,
        version: 1
      }));
      return updated;
    });
  }, []);
  
  if (!isOpen) return null;
  
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="w-full max-w-2xl max-h-[85vh] bg-[#0a0a0a] rounded-2xl border border-white/10 overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <span className="text-2xl">📅</span>
            <div>
              <h2 className="text-white font-bold text-lg">阅读计划</h2>
              <p className="text-gray-500 text-xs">
                {new Date().toLocaleDateString('zh-CN', { 
                  month: 'long', 
                  day: 'numeric',
                  weekday: 'long'
                })}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSettings(!showSettings)}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-400"
            >
              ⚙️
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white/10 text-gray-400"
            >
              ✕
            </button>
          </div>
        </div>
        
        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto p-6">
          {showSettings ? (
            <PlanSettings
              preferences={preferences}
              onChange={setPreferences}
              onClose={() => setShowSettings(false)}
            />
          ) : plan ? (
            <>
              <PlanSummary summary={plan.summary} />
              <PlanTimeline
                items={plan.items}
                onToggleComplete={handleToggleComplete}
              />
              {plan.aiSuggestions.length > 0 && (
                <div className="mt-6 p-4 bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-xl border border-blue-500/20">
                  <h3 className="text-white font-medium mb-2">💡 AI 建议</h3>
                  <ul className="space-y-1">
                    {plan.aiSuggestions.map((s, i) => (
                      <li key={i} className="text-gray-400 text-sm">{s}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12">
              <p className="text-gray-500 mb-4">还没有今日计划</p>
              <button
                onClick={handleGenerate}
                disabled={loading}
                className="px-6 py-3 bg-gradient-to-r from-cyber-lime to-emerald-400 text-black font-bold rounded-full hover:scale-105 transition-transform disabled:opacity-50"
              >
                {loading ? '生成中...' : '✨ 生成今日计划'}
              </button>
            </div>
          )}
        </div>
        
        {/* 底部操作栏 */}
        {plan && (
          <div className="px-6 py-4 border-t border-white/10 flex justify-between">
            <button
              onClick={handleGenerate}
              disabled={loading}
              className="px-4 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 disabled:opacity-50"
            >
              🔄 重新生成
            </button>
            <div className="text-gray-500 text-sm">
              已完成 {plan.items.filter(i => i.completed).length} / {plan.items.length}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default ReadingPlanComponent;
```

### 4.3 时间线组件

```tsx
// components/ReadingPlan/PlanTimeline.tsx

import React from 'react';
import type { PlanItem } from '../../types/readingPlan';

const TYPE_ICONS = {
  video: '🎬',
  rss: '📰',
  todo: '✅',
  reminder: '⏰',
  break: '☕'
};

const PRIORITY_COLORS = {
  urgent: 'border-red-500 bg-red-500/10',
  high: 'border-amber-500 bg-amber-500/10',
  medium: 'border-blue-500 bg-blue-500/10',
  low: 'border-gray-500 bg-gray-500/10'
};

interface PlanTimelineProps {
  items: PlanItem[];
  onToggleComplete: (id: string) => void;
}

const PlanTimeline: React.FC<PlanTimelineProps> = ({ items, onToggleComplete }) => {
  return (
    <div className="space-y-3 mt-6">
      {items.map((item, index) => (
        <div
          key={item.id}
          className={`flex items-start gap-4 p-4 rounded-xl border-l-4 transition-all ${
            PRIORITY_COLORS[item.priority]
          } ${item.completed ? 'opacity-50' : ''}`}
        >
          {/* 时间列 */}
          <div className="w-16 text-center">
            {item.startTime ? (
              <>
                <div className="text-white font-mono text-sm">{item.startTime}</div>
                <div className="text-gray-600 text-xs">~{item.endTime}</div>
              </>
            ) : (
              <div className="text-gray-600 text-xs">待定</div>
            )}
          </div>
          
          {/* 内容列 */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span>{TYPE_ICONS[item.type]}</span>
              <span className={`font-medium ${item.completed ? 'line-through text-gray-500' : 'text-white'}`}>
                {item.title}
              </span>
            </div>
            {item.subtitle && (
              <div className="text-gray-500 text-sm mt-1">{item.subtitle}</div>
            )}
            <div className="text-gray-600 text-xs mt-1">
              {item.duration} 分钟
            </div>
          </div>
          
          {/* 操作列 */}
          <div className="flex items-center gap-2">
            {item.link && (
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 rounded-lg hover:bg-white/10 text-gray-400"
              >
                🔗
              </a>
            )}
            <button
              onClick={() => onToggleComplete(item.id)}
              className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                item.completed
                  ? 'bg-cyber-lime border-cyber-lime text-black'
                  : 'border-gray-600 hover:border-cyber-lime'
              }`}
            >
              {item.completed && '✓'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default PlanTimeline;
```

---

## 五、复用现有代码

### 5.1 可复用的模块

| 现有代码 | 复用方式 | 复用位置 |
|----------|----------|----------|
| `App.tsx` 的 `videos` 状态 | Props 传递 | 避免重复查询 |
| `App.tsx` 的 `watchLaterIds` | Props 传递 | 筛选待看视频 |
| `TodoList` 的 `loadTodos` | 直接调用 localStorage | 获取 TODO |
| `IntervalReminder` 的 `loadTasks` | 直接调用 localStorage | 获取提醒任务 |
| `RssFeed` 的 `fetchArticles` | 缓存复用 | 获取 RSS |
| `geminiService.ts` | 扩展接口 | AI 增强 |
| `createPortal` 弹窗模式 | 相同 UI 模式 | 弹窗展示 |
| `database.types.ts` | 类型复用 | 数据类型 |

### 5.2 App.tsx 集成示例

```typescript
// App.tsx 添加阅读计划入口

import ReadingPlan from './components/ReadingPlan';

// 状态
const [isReadingPlanOpen, setIsReadingPlanOpen] = useState(false);

// 快捷入口区域添加按钮
<button
  onClick={() => setIsReadingPlanOpen(true)}
  className="w-11 h-11 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-blue-500/30 flex items-center justify-center"
>
  📅
</button>

// 弹窗组件
<ReadingPlan
  isOpen={isReadingPlanOpen}
  onClose={() => setIsReadingPlanOpen(false)}
  userId={currentUser?.id || ''}
  videos={videos}                    // 复用已有数据
  watchlistBvids={watchLaterIds}     // 复用已有数据
/>
```

---

## 六、注意事项

### 6.1 性能优化

1. **数据复用** - 优先使用父组件已有的 `videos` 和 `watchLaterIds`，避免重复查询
2. **缓存策略** - RSS 文章使用 sessionStorage 缓存，10 分钟有效
3. **懒加载** - 阅读计划组件使用动态导入 `React.lazy()`
4. **节流生成** - 生成按钮添加防抖，避免重复点击

### 6.2 边界情况

| 场景 | 处理方式 |
|------|----------|
| 无视频/无待看 | 显示空状态提示 |
| 无 Gemini API Key | 使用本地算法生成建议 |
| 计划跨天 | 每天 0 点自动清除旧计划 |
| 时间不够 | 提示内容过多，建议推迟 |

### 6.3 可扩展方向

1. **计划模板** - 预设不同场景的计划模板（工作日/周末/学习日）
2. **番茄钟集成** - 与 `IntervalReminder` 联动，自动启动专注时间
3. **完成统计** - 记录每日完成率，生成周报
4. **智能学习** - AI 学习用户习惯，优化排期算法
5. **日历集成** - 导出到系统日历或 Google Calendar
6. **多端同步** - 将计划存储到 Supabase，支持多端访问

---

## 七、最佳实践流程

### 7.1 用户使用流程

```
┌─────────────────────────────────────────────────────────────────┐
│                    用户使用流程                                   │
└─────────────────────────────────────────────────────────────────┘

 08:30  用户打开 FluxFilter
          │
          ▼
 08:31  点击「📅 阅读计划」入口
          │
          ▼
 08:31  系统检测到今日无计划，显示「生成计划」按钮
          │
          ▼
 08:31  用户点击「✨ 生成今日计划」
          │
          ├──→ 收集数据（~200ms）
          ├──→ 生成计划（~100ms）
          └──→ AI 增强（如有 API Key，~500ms）
          │
          ▼
 08:32  显示计划摘要 + 时间线 + AI 建议
          │
          ▼
 09:00  用户开始执行计划
          │
          ├──→ 观看视频时点击「完成」
          ├──→ 休息时间提醒
          └──→ TODO 完成时自动同步
          │
          ▼
 12:00  中途查看进度，已完成 50%
          │
          ▼
 18:00  计划全部完成，显示庆祝动画 🎉
```

### 7.2 开发实施顺序

```
Phase 1: 基础功能（2-3小时）
├─ 创建类型定义
├─ 实现数据收集模块
├─ 实现本地计划生成
└─ 创建基础 UI 组件

Phase 2: UI 完善（1-2小时）
├─ 时间线组件
├─ 摘要卡片
├─ 设置面板
└─ 完成状态管理

Phase 3: AI 增强（1小时）
├─ Gemini API 集成
├─ 智能建议生成
└─ 降级方案

Phase 4: 集成测试（1小时）
├─ App.tsx 集成
├─ 数据复用验证
└─ 边界情况测试
```

---

## 八、总结

### 核心价值
通过整合视频、RSS、TODO 三类信息源，利用 AI 智能排期，帮助用户高效管理每日阅读/学习时间。

### 技术亮点
1. **数据复用** - 最大化利用 App.tsx 已有数据
2. **渐进增强** - 无 AI 时降级为本地算法
3. **组件解耦** - 独立模块，易于维护扩展
4. **用户体验** - 一键生成，可视化时间线

### 后续扩展
- 计划分享功能
- 多端同步
- 智能学习用户习惯
- 与番茄钟/提醒器深度集成
