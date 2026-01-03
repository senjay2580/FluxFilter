import { supabase } from './supabase';
import { getStoredUserId } from './auth';

export interface WorkflowNode {
  id: number;
  code: string;
  name: string;
  description: string;
  icon: string;
  order_index: number;
}

export interface WorkflowNodeProgress {
  id: number;
  daily_workflow_id: number;
  node_id: number;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface DailyWorkflow {
  id: number;
  user_id: string;
  workflow_date: string;
  is_completed: boolean;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowStats {
  completion_date: string;
  completed_nodes: number;
  total_nodes: number;
  completion_rate: number;
}

export interface WorkflowOverview {
  workflow: DailyWorkflow;
  nodes: WorkflowNode[];
  progress: WorkflowNodeProgress[];
  completedCount: number;
  totalCount: number;
}

/**
 * 获取所有工作流节点
 */
export async function getWorkflowNodes(): Promise<WorkflowNode[]> {
  const { data, error } = await supabase
    .from('workflow_node')
    .select('*')
    .order('order_index', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * 获取或创建今日工作流
 */
export async function getOrCreateDailyWorkflow(
  date: Date = new Date()
): Promise<DailyWorkflow> {
  const userId = getStoredUserId();
  if (!userId) throw new Error('User not authenticated');

  // 使用本地时间格式化日期
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const workflowDate = `${year}-${month}-${day}`;

  // 先尝试直接查询，避免不必要的 RPC 调用
  const { data: existing } = await supabase
    .from('daily_workflow')
    .select('*')
    .eq('user_id', userId)
    .eq('workflow_date', workflowDate)
    .single();

  if (existing) return existing;

  // 不存在则调用 RPC 创建
  const { data, error } = await supabase.rpc('get_or_create_daily_workflow', {
    p_user_id: userId,
    p_workflow_date: workflowDate,
  });

  if (error) throw error;

  // 获取完整的工作流数据
  const { data: workflow, error: fetchError } = await supabase
    .from('daily_workflow')
    .select('*')
    .eq('id', data)
    .single();

  if (fetchError) throw fetchError;
  return workflow;
}

// 缓存节点数据（节点是系统级数据，不会变化）
let cachedNodes: WorkflowNode[] | null = null;

/**
 * 获取今日工作流概览（包含节点和进度）- 极速优化版本
 * 优化策略：
 * 1. 缓存节点数据（系统级，不变）
 * 2. 单次查询获取工作流+进度（使用 JOIN）
 * 3. 仅在必要时调用 RPC
 */
export async function getTodayWorkflowOverview(): Promise<WorkflowOverview> {
  const userId = getStoredUserId();
  if (!userId) throw new Error('User not authenticated');

  // 使用本地时间格式化日期，避免时区问题
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  const workflowDate = `${year}-${month}-${day}`;

  // 1. 获取节点（使用缓存）
  if (!cachedNodes) {
    const { data, error } = await supabase
      .from('workflow_node')
      .select('*')
      .order('order_index', { ascending: true });
    if (error) throw error;
    cachedNodes = data || [];
  }
  const nodes = cachedNodes;

  // 2. 单次查询获取工作流和进度（使用 JOIN）
  const { data: workflowWithProgress, error: queryError } = await supabase
    .from('daily_workflow')
    .select(`
      *,
      workflow_node_progress (*)
    `)
    .eq('user_id', userId)
    .eq('workflow_date', workflowDate)
    .single();

  // 3. 如果工作流存在，直接返回
  if (workflowWithProgress && !queryError) {
    const progress = (workflowWithProgress.workflow_node_progress || []).sort(
      (a: WorkflowNodeProgress, b: WorkflowNodeProgress) => a.id - b.id
    );
    const completedCount = progress.filter((p: WorkflowNodeProgress) => p.is_completed).length;

    return {
      workflow: {
        id: workflowWithProgress.id,
        user_id: workflowWithProgress.user_id,
        workflow_date: workflowWithProgress.workflow_date,
        is_completed: workflowWithProgress.is_completed,
        completed_at: workflowWithProgress.completed_at,
        created_at: workflowWithProgress.created_at,
        updated_at: workflowWithProgress.updated_at,
      },
      nodes,
      progress,
      completedCount,
      totalCount: nodes.length,
    };
  }

  // 4. 工作流不存在，调用 RPC 创建（仅首次访问）
  const { data: workflowId, error: rpcError } = await supabase.rpc('get_or_create_daily_workflow', {
    p_user_id: userId,
    p_workflow_date: workflowDate,
  });
  if (rpcError) throw rpcError;

  // 5. 获取新创建的工作流和进度
  const { data: newWorkflowWithProgress, error: fetchError } = await supabase
    .from('daily_workflow')
    .select(`
      *,
      workflow_node_progress (*)
    `)
    .eq('id', workflowId)
    .single();

  if (fetchError) throw fetchError;

  const progress = (newWorkflowWithProgress.workflow_node_progress || []).sort(
    (a: WorkflowNodeProgress, b: WorkflowNodeProgress) => a.id - b.id
  );
  const completedCount = progress.filter((p: WorkflowNodeProgress) => p.is_completed).length;

  return {
    workflow: {
      id: newWorkflowWithProgress.id,
      user_id: newWorkflowWithProgress.user_id,
      workflow_date: newWorkflowWithProgress.workflow_date,
      is_completed: newWorkflowWithProgress.is_completed,
      completed_at: newWorkflowWithProgress.completed_at,
      created_at: newWorkflowWithProgress.created_at,
      updated_at: newWorkflowWithProgress.updated_at,
    },
    nodes,
    progress,
    completedCount,
    totalCount: nodes.length,
  };
}

/**
 * 标记节点完成
 */
export async function markNodeCompleted(
  dailyWorkflowId: number,
  nodeId: number
): Promise<boolean> {
  const { data, error } = await supabase.rpc('mark_node_completed', {
    p_daily_workflow_id: dailyWorkflowId,
    p_node_id: nodeId,
  });

  if (error) throw error;
  return data; // 返回是否全部完成
}

/**
 * 撤回节点完成状态
 */
export async function unmarkNodeCompleted(
  dailyWorkflowId: number,
  nodeId: number
): Promise<void> {
  const { error } = await supabase
    .from('workflow_node_progress')
    .update({ 
      is_completed: false, 
      completed_at: null 
    })
    .eq('daily_workflow_id', dailyWorkflowId)
    .eq('node_id', nodeId);

  if (error) throw error;

  // 更新完成历史
  await updateCompletionHistory(dailyWorkflowId);
}

/**
 * 更新完成历史记录
 */
async function updateCompletionHistory(dailyWorkflowId: number): Promise<void> {
  const userId = getStoredUserId();
  if (!userId) return;

  // 获取当前工作流
  const { data: workflow } = await supabase
    .from('daily_workflow')
    .select('workflow_date')
    .eq('id', dailyWorkflowId)
    .single();

  if (!workflow) return;

  // 获取完成情况
  const { data: progress } = await supabase
    .from('workflow_node_progress')
    .select('is_completed')
    .eq('daily_workflow_id', dailyWorkflowId);

  if (!progress) return;

  const completedCount = progress.filter(p => p.is_completed).length;
  const totalCount = progress.length;
  const completionRate = totalCount > 0 ? (completedCount / totalCount) * 100 : 0;

  // 更新或插入历史记录
  await supabase
    .from('workflow_completion_history')
    .upsert({
      user_id: userId,
      completion_date: workflow.workflow_date,
      completed_nodes: completedCount,
      total_nodes: totalCount,
      completion_rate: completionRate,
    }, {
      onConflict: 'user_id,completion_date'
    });
}

/**
 * 获取工作流统计数据（用于热力图）
 */
export async function getWorkflowStats(days: number = 90): Promise<WorkflowStats[]> {
  const userId = getStoredUserId();
  if (!userId) throw new Error('User not authenticated');

  const { data, error } = await supabase.rpc('get_workflow_stats', {
    p_user_id: userId,
    p_days: days,
  });

  if (error) throw error;
  return data || [];
}

/**
 * 获取指定日期的工作流
 */
export async function getDailyWorkflow(date: Date): Promise<DailyWorkflow | null> {
  const userId = getStoredUserId();
  if (!userId) throw new Error('User not authenticated');

  // 使用本地时间格式化日期，避免时区问题
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const workflowDate = `${year}-${month}-${day}`;

  const { data, error } = await supabase
    .from('daily_workflow')
    .select('*')
    .eq('user_id', userId)
    .eq('workflow_date', workflowDate)
    .maybeSingle();

  if (error) throw error;
  return data;
}

/**
 * 获取指定日期的工作流进度
 */
export async function getWorkflowProgress(
  dailyWorkflowId: number
): Promise<WorkflowNodeProgress[]> {
  const { data, error } = await supabase
    .from('workflow_node_progress')
    .select('*')
    .eq('daily_workflow_id', dailyWorkflowId)
    .order('id', { ascending: true });

  if (error) throw error;
  return data || [];
}

/**
 * 获取最近 N 天的工作流完成情况
 */
export async function getRecentWorkflowDays(days: number = 30): Promise<DailyWorkflow[]> {
  const userId = getStoredUserId();
  if (!userId) throw new Error('User not authenticated');

  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  // 使用本地时间格式化日期
  const year = startDate.getFullYear();
  const month = String(startDate.getMonth() + 1).padStart(2, '0');
  const day = String(startDate.getDate()).padStart(2, '0');
  const startDateStr = `${year}-${month}-${day}`;

  const { data, error } = await supabase
    .from('daily_workflow')
    .select('*')
    .eq('user_id', userId)
    .gte('workflow_date', startDateStr)
    .order('workflow_date', { ascending: false });

  if (error) throw error;
  return data || [];
}

/**
 * 获取工作流完成率统计
 */
export async function getWorkflowCompletionStats(days: number = 90): Promise<{
  totalDays: number;
  completedDays: number;
  completionRate: number;
  averageNodesPerDay: number;
}> {
  const stats = await getWorkflowStats(days);

  const totalDays = stats.length;
  const completedDays = stats.filter(s => s.completion_rate === 100).length;
  const completionRate = totalDays > 0 ? (completedDays / totalDays) * 100 : 0;
  const averageNodesPerDay = totalDays > 0
    ? stats.reduce((sum, s) => sum + s.completed_nodes, 0) / totalDays
    : 0;

  return {
    totalDays,
    completedDays,
    completionRate: Math.round(completionRate * 100) / 100,
    averageNodesPerDay: Math.round(averageNodesPerDay * 100) / 100,
  };
}
