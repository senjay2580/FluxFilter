import React, { useState, useEffect, useMemo, useCallback, memo, Suspense, lazy } from 'react';
import { motion } from 'motion/react';
import confetti from 'canvas-confetti';
import type { WorkflowNode, WorkflowOverview, WorkflowStats } from '../../lib/workflow-service';
import {
  getTodayWorkflowOverview,
  markNodeCompleted,
  unmarkNodeCompleted,
  getWorkflowStats,
  getDailyWorkflow,
  getWorkflowProgress,
} from '../../lib/workflow-service';
import { generateAISuggestion } from '../../lib/workflow-ai-service';
import CustomDatePicker, { WorkflowCompletionData } from '../layout/CustomDatePicker';
import { DateFilter } from '../../types';

// 懒加载 AIMarkdown 组件
const AIMarkdown = lazy(() => import('../common/AIMarkdown').then(m => ({ default: m.AIMarkdown })));

interface DailyWorkflowProps {
  isOpen: boolean;
  onClose: () => void;
  onNodeClick?: (nodeCode: string) => void;
}

// 电流脉冲动画组件（保留但未使用）
const PulseLine = memo(({ isActive, index }: { isActive: boolean; index: number }) => {
  if (!isActive) return null;
  
  return (
    <motion.div
      className="absolute left-0 right-0 h-full overflow-hidden"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <motion.div
        className="absolute w-2 h-2 rounded-full bg-cyber-lime shadow-lg shadow-cyber-lime/80"
        style={{ left: '50%', transform: 'translateX(-50%)' }}
        animate={{
          top: ['-10%', '110%'],
          opacity: [0, 1, 1, 0],
          scale: [0.5, 1, 1, 0.5],
        }}
        transition={{
          duration: 1.5,
          repeat: Infinity,
          delay: index * 0.3,
          ease: 'easeInOut',
        }}
      />
    </motion.div>
  );
});

PulseLine.displayName = 'PulseLine';

// 流程节点卡片 - 彩色渐变卡片样式（与设置页面一致）
const FlowNodeCard = memo(({
  node,
  isCompleted,
  isLocked,
  onNodeClick,
  isLeft,
}: {
  node: WorkflowNode;
  isCompleted: boolean;
  isLocked: boolean;
  onNodeClick: (nodeCode: string) => void;
  isLeft: boolean;
}) => {
  // 获取节点对应的渐变色和图标
  const getNodeStyle = (code: string) => {
    switch (code) {
      case 'daily_info':
        return {
          gradient: 'bg-gradient-to-br from-rose-400 via-pink-500 to-rose-600',
          icon: (
            <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
            </svg>
          ),
        };
      case 'dev_hotspot':
        return {
          gradient: 'bg-gradient-to-br from-orange-400 via-amber-500 to-yellow-500',
          icon: (
            <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
            </svg>
          ),
        };
      case 'video_collection':
        return {
          gradient: 'bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600',
          icon: (
            <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
          ),
        };
      case 'notes':
        return {
          gradient: 'bg-gradient-to-br from-purple-400 via-violet-500 to-purple-700',
          icon: (
            <svg className="w-full h-full" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
          ),
        };
      default:
        return {
          gradient: 'bg-gradient-to-br from-gray-400 via-gray-500 to-gray-600',
          icon: null,
        };
    }
  };

  const { gradient, icon } = getNodeStyle(node.code);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, x: isLeft ? -20 : 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      whileTap={{ scale: 0.97 }}
      onClick={() => !isLocked && onNodeClick(node.code)}
      disabled={isLocked}
      className={`relative ${gradient} rounded-2xl transition-all text-left group overflow-hidden ${
        isLocked ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer active:scale-[0.97]'
      } ${isCompleted ? 'shadow-[0_0_30px_rgba(163,230,53,0.6),0_0_60px_rgba(163,230,53,0.3)]' : 'shadow-lg'}`}
      style={{ minWidth: '140px', padding: '12px 16px' }}
    >
      {/* 光泽效果 */}
      <div className="absolute inset-0 bg-gradient-to-br from-white/25 via-transparent to-transparent opacity-60 pointer-events-none" />

      {/* 标题 */}
      <div className="relative z-10">
        <h3 className="text-white font-bold text-sm leading-tight drop-shadow-md">{node.name}</h3>
      </div>

      {/* 大图标在右下角 - 隐约显示 */}
      <div className="absolute -bottom-2 -right-2 w-12 h-12 opacity-30 text-white transition-all group-hover:opacity-50 group-hover:scale-110">
        {icon}
      </div>
    </motion.button>
  );
});

FlowNodeCard.displayName = 'FlowNodeCard';

// 触发纸屑动画 - 优化版
const fireConfetti = () => {
  const colors = ['#a3e635', '#60a5fa', '#f472b6', '#fbbf24', '#34d399'];

  // 一次性从中间底部喷射
  confetti({
    particleCount: 80,
    spread: 70,
    origin: { x: 0.5, y: 0.9 },
    colors: colors,
    startVelocity: 45,
    gravity: 1.2,
    decay: 0.92,
    scalar: 1,
    ticks: 150,
  });
};

// 主组件
const DailyWorkflow: React.FC<DailyWorkflowProps> = ({ isOpen, onClose, onNodeClick }) => {
  const [todayOverview, setTodayOverview] = useState<WorkflowOverview | null>(null);
  const [selectedDateOverview, setSelectedDateOverview] = useState<WorkflowOverview | null>(null);
  const [stats, setStats] = useState<WorkflowStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [isMarking, setIsMarking] = useState(false);
  const [isDatePickerOpen, setIsDatePickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<DateFilter>({});
  const [viewMode, setViewMode] = useState<'today' | 'selected'>('today');
  const [toast, setToast] = useState<string | null>(null);
  
  // AI 建议状态
  const [aiSuggestion, setAiSuggestion] = useState<string>('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  // 加载今日工作流数据和统计数据
  useEffect(() => {
    if (!isOpen) return;

    const loadData = async () => {
      try {
        setLoading(true);
        const [overviewData, statsData] = await Promise.all([
          getTodayWorkflowOverview(),
          getWorkflowStats(90)
        ]);
        setTodayOverview(overviewData);
        setStats(statsData || []);
        setViewMode('today');
      } catch (err) {
        console.error('加载工作流数据失败:', err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [isOpen]);

  // 生成 AI 建议
  const handleGenerateAISuggestion = useCallback(async () => {
    setAiLoading(true);
    setAiError(null);
    setAiSuggestion('');
    
    try {
      await generateAISuggestion((content) => {
        setAiSuggestion(content);
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : '生成失败');
    } finally {
      setAiLoading(false);
    }
  }, []);

  // 将 stats 转换为日历组件需要的格式
  const workflowData = useMemo<WorkflowCompletionData>(() => {
    const data: WorkflowCompletionData = {};
    stats.forEach(stat => {
      data[stat.completion_date] = stat.completion_rate;
    });
    return data;
  }, [stats]);

  // 加载选中日期的工作流
  const loadSelectedDateWorkflow = useCallback(async (filter: DateFilter) => {
    if (filter.year === undefined || filter.month === undefined || filter.day === undefined) {
      return;
    }

    try {
      const selectedDateObj = new Date(filter.year, filter.month, filter.day);
      const workflow = await getDailyWorkflow(selectedDateObj);

      if (!workflow) {
        // 没有该日期的工作流记录
        setSelectedDateOverview(null);
        setViewMode('selected');
        return;
      }

      // 获取该工作流的节点进度
      const nodes = todayOverview?.nodes || [];
      const progress = await getWorkflowProgress(workflow.id);
      const completedCount = progress.filter(p => p.is_completed).length;

      setSelectedDateOverview({
        workflow,
        nodes,
        progress,
        completedCount,
        totalCount: nodes.length,
      });
      setViewMode('selected');
    } catch (err) {
      console.error('加载选中日期工作流失败:', err);
      setSelectedDateOverview(null);
      setViewMode('selected');
    }
  }, [todayOverview?.nodes]);

  // 标记节点完成
  const handleMarkComplete = useCallback(async (nodeId: number) => {
    const currentOverview = viewMode === 'today' ? todayOverview : selectedDateOverview;
    if (!currentOverview || isMarking) return;

    // 先更新 UI（乐观更新）
    const updateFn = (prev: WorkflowOverview | null) => {
      if (!prev) return prev;
      const newProgress = prev.progress.map(p =>
        p.node_id === nodeId ? { ...p, is_completed: true, completed_at: new Date().toISOString() } : p
      );
      const newCompletedCount = newProgress.filter(p => p.is_completed).length;
      return { ...prev, progress: newProgress, completedCount: newCompletedCount };
    };

    if (viewMode === 'today') {
      setTodayOverview(updateFn);
    } else {
      setSelectedDateOverview(updateFn);
    }

    // 异步更新数据库
    try {
      setIsMarking(true);
      const isAllCompleted = await markNodeCompleted(currentOverview.workflow.id, nodeId);
      if (isAllCompleted) {
        // 触发纸屑动画和鼓励通知
        fireConfetti();
        setToast('🎉 太棒了！今日工作流已全部完成！');
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err) {
      console.error('标记节点完成失败:', err);
      // 回滚 UI
      if (viewMode === 'today') {
        setTodayOverview(currentOverview);
      } else {
        setSelectedDateOverview(currentOverview);
      }
    } finally {
      setIsMarking(false);
    }
  }, [todayOverview, selectedDateOverview, viewMode, isMarking]);

  // 撤回节点完成
  const handleUnmarkComplete = useCallback(async (nodeId: number) => {
    const currentOverview = viewMode === 'today' ? todayOverview : selectedDateOverview;
    if (!currentOverview || isMarking) return;

    // 先更新 UI（乐观更新）
    const updateFn = (prev: WorkflowOverview | null) => {
      if (!prev) return prev;
      const newProgress = prev.progress.map(p =>
        p.node_id === nodeId ? { ...p, is_completed: false, completed_at: null } : p
      );
      const newCompletedCount = newProgress.filter(p => p.is_completed).length;
      return { ...prev, progress: newProgress, completedCount: newCompletedCount };
    };

    if (viewMode === 'today') {
      setTodayOverview(updateFn);
    } else {
      setSelectedDateOverview(updateFn);
    }

    // 异步更新数据库
    try {
      setIsMarking(true);
      await unmarkNodeCompleted(currentOverview.workflow.id, nodeId);
    } catch (err) {
      console.error('撤回节点完成失败:', err);
      // 回滚 UI
      if (viewMode === 'today') {
        setTodayOverview(currentOverview);
      } else {
        setSelectedDateOverview(currentOverview);
      }
    } finally {
      setIsMarking(false);
    }
  }, [todayOverview, selectedDateOverview, viewMode, isMarking]);

  // 处理节点点击
  const handleNodeClick = useCallback((nodeCode: string) => {
    if (onNodeClick) {
      onNodeClick(nodeCode);
    }
  }, [onNodeClick]);

  // 获取当前显示的工作流
  const currentOverview = viewMode === 'today' ? todayOverview : selectedDateOverview;

  // 计算当前显示的日期字符串
  const currentDateStr = useMemo(() => {
    if (viewMode === 'today') {
      return '今天';
    }
    if (selectedDate.year !== undefined && selectedDate.month !== undefined && selectedDate.day !== undefined) {
      return `${selectedDate.year}年${selectedDate.month + 1}月${selectedDate.day}日`;
    }
    return '';
  }, [viewMode, selectedDate]);

  // 计算最新完成的节点ID（用于限制撤回）
  const latestCompletedNodeId = useMemo(() => {
    if (!currentOverview) return null;
    const completedProgress = currentOverview.progress
      .filter(p => p.is_completed && p.completed_at)
      .sort((a, b) => new Date(b.completed_at!).getTime() - new Date(a.completed_at!).getTime());
    return completedProgress.length > 0 ? completedProgress[0].node_id : null;
  }, [currentOverview]);

  // 如果不打开，不渲染
  if (!isOpen) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 bg-[#050510] flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-400">加载中...</p>
        </div>
      </div>
    );
  }

  if (!todayOverview) {
    return (
      <div className="fixed inset-0 z-50 bg-[#050510] flex items-center justify-center">
        <p className="text-gray-400">加载失败</p>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 bg-[#050510] overflow-hidden flex flex-col">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-[#050510]/90 backdrop-blur-xl border-b border-white/10 px-4 py-3">
        <div className="flex items-center justify-between max-w-3xl mx-auto">
          <button
            onClick={() => {
              if (viewMode === 'selected') {
                setViewMode('today');
                setSelectedDate({});
              } else {
                onClose();
              }
            }}
            className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
          >
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>

          {/* 日期标题 - 带过渡动画 */}
          <div className="text-center overflow-hidden">
            <motion.h1
              key={currentDateStr}
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
              className="text-xl font-bold text-white"
            >
              {currentDateStr}
            </motion.h1>
            {viewMode === 'selected' && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
                className="text-xs text-gray-400"
              >
                工作流记录
              </motion.p>
            )}
          </div>

          {/* 右侧按钮组 */}
          <div className="flex items-center gap-2">
            {/* 返回今天按钮 - 仅在非今天视图时显示 */}
            {viewMode === 'selected' && (
              <button
                onClick={() => {
                  setViewMode('today');
                  setSelectedDate({});
                }}
                className="w-10 h-10 flex items-center justify-center rounded-xl bg-cyber-lime/20 hover:bg-cyber-lime/30 transition-colors"
                title="返回今天"
              >
                <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </button>
            )}

            {/* 日历按钮 */}
            <button
              onClick={() => setIsDatePickerOpen(true)}
              className="w-10 h-10 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors"
              title="选择日期"
            >
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
          {/* 顶部：统计信息 */}
          {currentOverview && (
            <div className="mb-8 bg-gradient-to-br from-white/10 to-white/5 border border-white/20 rounded-3xl p-8 relative overflow-hidden">
              {/* 背景装饰 */}
              <div className="absolute inset-0 opacity-5">
                <div className="absolute top-0 right-0 w-40 h-40 bg-cyber-lime rounded-full blur-3xl" />
              </div>

              <div className="relative flex items-center justify-between">
                {/* 左侧：完成率信息 */}
                <div className="flex-1">
                  <p className="text-sm text-gray-400 mb-2">总完成度</p>
                  <div className="flex items-baseline gap-2">
                    <p className="text-5xl font-bold text-white">
                      {Math.round((currentOverview.completedCount / currentOverview.totalCount) * 100)}
                    </p>
                    <p className="text-2xl text-gray-400">%</p>
                  </div>
                  
                  {/* 标签 */}
                  <div className="flex gap-2 mt-4">
                    <span className="px-3 py-1 bg-cyber-lime/20 text-cyber-lime text-xs font-semibold rounded-full">
                      {viewMode === 'today' ? 'TODAY' : 'SELECTED'}
                    </span>
                    <span className="px-3 py-1 bg-white/10 text-gray-400 text-xs font-semibold rounded-full">
                      {currentOverview.completedCount}/{currentOverview.totalCount}
                    </span>
                  </div>
                </div>

                {/* 右侧：圆形进度指示器 */}
                <div className="flex-shrink-0 ml-8">
                  <div className="relative w-32 h-32">
                    {/* 背景圆 */}
                    <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
                      <circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        className="text-white/10"
                      />
                      {/* 进度圆 */}
                      <motion.circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="8"
                        strokeLinecap="round"
                        className="text-cyber-lime"
                        strokeDasharray={`${2 * Math.PI * 54}`}
                        initial={{ strokeDashoffset: 2 * Math.PI * 54 }}
                        animate={{
                          strokeDashoffset: 2 * Math.PI * 54 * (1 - (currentOverview.completedCount / currentOverview.totalCount)),
                        }}
                        transition={{ duration: 0.8, ease: 'easeOut' }}
                      />
                    </svg>
                    
                    {/* 中心图标 */}
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg className="w-12 h-12 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M6 2a2 2 0 0 0-2 2v15a3 3 0 0 0 3 3h12a1 1 0 1 0 0-2h-2v-2h2a1 1 0 0 0 1-1V4a2 2 0 0 0-2-2h-8v16h5v2H7a1 1 0 1 1 0-2h1V2z" clipRule="evenodd"/>
                      </svg>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 工作流内容 */}
          {currentOverview ? (
            <div className="mb-8">
              {/* 时间线布局 - 贯穿式，圆球在中间 */}
              <div className="relative">
                {/* 贯穿整个流程的垂直时间线 */}
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 -translate-x-1/2 overflow-hidden">
                  {/* 背景线 */}
                  <div className="absolute inset-0 bg-white/10" />
                  {/* 完成进度线 - 带动画 */}
                  <motion.div 
                    className="absolute top-0 left-0 right-0 bg-cyber-lime"
                    initial={{ height: 0 }}
                    animate={{ 
                      height: `${(currentOverview.completedCount / currentOverview.totalCount) * 100}%` 
                    }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
                  />
                </div>

                {/* 节点列表 */}
                <div className="relative flex flex-col gap-6">
                  {currentOverview.nodes.map((node, index) => {
                    const progress = currentOverview.progress.find(p => p.node_id === node.id);
                    const isCompleted = progress?.is_completed || false;
                    const isLeft = index % 2 === 0;
                    const canUnmark = latestCompletedNodeId === node.id;

                    return (
                      <div key={node.id} className="relative">
                        {/* 节点行 - 使用grid确保圆球在正中间 */}
                        <div className="grid grid-cols-[1fr_auto_1fr] items-center">
                          {/* 左侧区域 */}
                          <div className="flex justify-end items-center">
                            {isLeft ? (
                              <>
                                <FlowNodeCard
                                  node={node}
                                  isCompleted={isCompleted}
                                  isLocked={false}
                                  onNodeClick={handleNodeClick}
                                  isLeft={true}
                                />
                                {/* 左侧连接线 */}
                                <div className={`w-4 h-0.5 ${isCompleted ? 'bg-cyber-lime' : 'bg-white/20'}`} />
                              </>
                            ) : (
                              <div />
                            )}
                          </div>

                          {/* 中心圆点 - 可点击完成/撤回 */}
                          <motion.button
                            onClick={() => {
                              if (isCompleted && canUnmark) {
                                handleUnmarkComplete(node.id);
                              } else if (!isCompleted) {
                                handleMarkComplete(node.id);
                              }
                            }}
                            disabled={isCompleted && !canUnmark}
                            className={`relative z-10 w-7 h-7 rounded-full border-2 flex items-center justify-center shrink-0 transition-all duration-300 ${
                              isCompleted
                                ? canUnmark
                                  ? 'bg-cyber-lime border-cyber-lime shadow-lg shadow-cyber-lime/50 cursor-pointer hover:scale-110'
                                  : 'bg-cyber-lime border-cyber-lime shadow-lg shadow-cyber-lime/50 cursor-default'
                                : 'bg-[#0a0a12] border-white/30 hover:border-cyber-lime/50 hover:scale-110 cursor-pointer'
                            }`}
                            whileTap={{ scale: 0.9 }}
                          >
                            {/* 完成时显示勾 */}
                            {isCompleted && (
                              <svg className="w-4 h-4 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            )}
                          </motion.button>

                          {/* 右侧区域 */}
                          <div className="flex justify-start items-center">
                            {!isLeft ? (
                              <>
                                {/* 右侧连接线 */}
                                <div className={`w-4 h-0.5 ${isCompleted ? 'bg-cyber-lime' : 'bg-white/20'}`} />
                                <FlowNodeCard
                                  node={node}
                                  isCompleted={isCompleted}
                                  isLocked={false}
                                  onNodeClick={handleNodeClick}
                                  isLeft={false}
                                />
                              </>
                            ) : (
                              <div />
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : (
            // 空状态 - 选中日期没有工作流记录
            <div className="flex flex-col items-center justify-center py-16">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
                <svg className="w-8 h-8 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 12h6m-6 4h6M9 8h6m-9-4h12a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" />
                </svg>
              </div>
              <p className="text-gray-400 text-center">
                {selectedDate.year ? '该日期暂无工作流记录' : '选择日期查看工作流'}
              </p>
              {selectedDate.year && (
                <button
                  onClick={() => {
                    setViewMode('today');
                    setSelectedDate({});
                  }}
                  className="mt-4 px-4 py-2 bg-cyber-lime/20 hover:bg-cyber-lime/30 text-cyber-lime rounded-lg transition-colors text-sm"
                >
                  返回今日
                </button>
              )}
            </div>
          )}

          {/* AI 学习建议 */}
          <div className="mt-8 mb-8">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                  <circle cx="7.5" cy="14.5" r="1.5" />
                  <circle cx="16.5" cy="14.5" r="1.5" />
                </svg>
                AI 学习建议
              </h3>
              <button
                onClick={handleGenerateAISuggestion}
                disabled={aiLoading}
                className="px-4 py-2 bg-cyber-lime/20 hover:bg-cyber-lime/30 text-cyber-lime rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {aiLoading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin" />
                    生成中...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2v4m0 12v4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83M2 12h4m12 0h4M4.93 19.07l2.83-2.83m8.48-8.48l2.83-2.83" />
                    </svg>
                    生成建议
                  </>
                )}
              </button>
            </div>

            {/* AI 建议内容 */}
            {aiError && (
              <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {aiError}
              </div>
            )}

            {aiSuggestion && (
              <Suspense fallback={<div className="p-4 text-gray-400">加载中...</div>}>
                <AIMarkdown content={aiSuggestion} variant="success" title="今日学习建议" />
              </Suspense>
            )}

            {!aiSuggestion && !aiError && !aiLoading && (
              <div className="p-6 bg-white/5 border border-white/10 rounded-xl text-center">
                <p className="text-gray-400 text-sm">
                  点击「生成建议」，AI 将分析你的所有学习数据，提醒待完成任务
                </p>
                <p className="text-gray-500 text-xs mt-2">
                  包括：拖欠视频提醒、艾宾浩斯复习、笔记整理建议
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 日期选择器 */}
      <Suspense fallback={null}>
        <CustomDatePicker
          isOpen={isDatePickerOpen}
          onClose={() => setIsDatePickerOpen(false)}
          onApply={(filter) => {
            setSelectedDate(filter);
            loadSelectedDateWorkflow(filter);
          }}
          currentFilter={selectedDate}
          videos={[]}
          workflowData={workflowData}
          mode="workflow"
        />
      </Suspense>

      {/* Toast 通知 */}
      {toast && (
        <div className="fixed top-20 inset-x-0 z-[100000] flex justify-center">
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10 }}
            className="px-6 py-3 bg-cyber-lime text-black font-semibold rounded-full shadow-lg shadow-cyber-lime/30"
          >
            {toast}
          </motion.div>
        </div>
      )}
    </div>
  );
};

export default DailyWorkflow;
