import { createClient, SupabaseClient } from '@supabase/supabase-js';

// 从环境变量获取 Supabase 配置
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// 检查配置是否完整
export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

if (!isSupabaseConfigured) {
  console.warn('⚠️ Supabase 配置缺失！请在 .env.local 中设置：');
  console.warn('   VITE_SUPABASE_URL=https://your-project.supabase.co');
  console.warn('   VITE_SUPABASE_ANON_KEY=your-anon-key');
}

// 创建 Supabase 客户端（如果未配置则使用占位符避免报错）
export const supabase: SupabaseClient = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : createClient('https://placeholder.supabase.co', 'placeholder-key');

// ============================================
// 视频相关操作
// ============================================

import type { Video, VideoWithUploader, WatchlistItem, Uploader } from './database.types';

/** 获取所有视频（按发布时间倒序） */
export async function getVideos(options?: {
  limit?: number;
  offset?: number;
  startDate?: Date;
  endDate?: Date;
}) {
  let query = supabase
    .from('video_with_uploader')
    .select('*')
    .order('pubdate', { ascending: false });

  if (options?.startDate) {
    query = query.gte('pubdate', options.startDate.toISOString());
  }
  if (options?.endDate) {
    query = query.lte('pubdate', options.endDate.toISOString());
  }
  if (options?.limit) {
    query = query.limit(options.limit);
  }
  if (options?.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 20) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as VideoWithUploader[];
}

/** 获取今日视频 */
export async function getTodayVideos() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return getVideos({ startDate: today });
}

/** 按日期获取视频 */
export async function getVideosByDate(date: Date) {
  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

  return getVideos({ startDate: startOfDay, endDate: endOfDay });
}

/** 获取视频统计（按日期分组） */
export async function getVideoCountByDate(userId: string) {
  const { data, error } = await supabase
    .from('video')
    .select('pubdate')
    .eq('user_id', userId);

  if (error) throw error;

  // 按日期分组统计
  const countMap: Record<string, number> = {};
  data?.forEach(v => {
    if (v.pubdate) {
      const dateKey = new Date(v.pubdate).toISOString().split('T')[0];
      countMap[dateKey] = (countMap[dateKey] || 0) + 1;
    }
  });

  return countMap;
}

// ============================================
// UP主相关操作
// ============================================

/** 获取所有启用的UP主 */
export async function getActiveUploaders(userId: string) {
  const { data, error } = await supabase
    .from('uploader')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true);

  if (error) throw error;
  return data as Uploader[];
}

/** 添加UP主 */
export async function addUploader(uploader: Omit<Uploader, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('uploader')
    .insert(uploader)
    .select()
    .single();

  if (error) throw error;
  return data as Uploader;
}

// ============================================
// 待看列表操作
// ============================================

/** 获取待看列表 */
export async function getWatchlist(userId?: string) {
  let query = supabase
    .from('watchlist')
    .select('*')
    .order('created_at', { ascending: false });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as WatchlistItem[];
}

/** 添加到待看列表 */
export async function addToWatchlist(bvid: string, userId: string, note?: string) {
  const { data, error } = await supabase
    .from('watchlist')
    .insert({
      bvid,
      note,
      user_id: userId,
    })
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('视频已在待看列表中');
    }
    throw error;
  }
  return data as WatchlistItem;
}

/** 从待看列表移除（按ID） */
export async function removeFromWatchlist(id: number) {
  const { error } = await supabase
    .from('watchlist')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/** 从待看列表移除（按bvid） */
export async function removeFromWatchlistByBvid(bvid: string, userId?: string) {
  let query = supabase
    .from('watchlist')
    .delete()
    .eq('bvid', bvid);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { error } = await query;
  if (error) throw error;
}

/** 更新待看状态 */
export async function updateWatchlistItem(id: number, updates: Partial<Pick<WatchlistItem, 'is_watched' | 'note' | 'priority'>>) {
  const { data, error } = await supabase
    .from('watchlist')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as WatchlistItem;
}

/** 标记为已看 */
export async function markAsWatched(id: number) {
  return updateWatchlistItem(id, { is_watched: true });
}

/** 检查视频是否在待看列表 */
export async function isInWatchlist(bvid: string, userId?: string) {
  let query = supabase
    .from('watchlist')
    .select('id')
    .eq('bvid', bvid);

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data && data.length > 0;
}

// ============================================
// 收藏视频操作
// ============================================

/** 获取收藏视频列表 */
export async function getCollectedVideos(userId?: string) {
  let query = supabase
    .from('collected_video')
    .select('*')
    .order('created_at', { ascending: false });

  if (userId) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}


// ============================================
// 学习日志操作
// ============================================

import type { LearningLog, CreateLearningLogParams, UpdateLearningLogParams, Resource, CreateResourceParams } from './database.types';

/** 获取学习日志列表 */
export async function getLearningLogs(userId: string) {
  const { data, error } = await supabase
    .from('learning_log')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data as LearningLog[];
}

/** 创建学习日志 */
export async function createLearningLog(userId: string, params: CreateLearningLogParams) {
  const { data, error } = await supabase
    .from('learning_log')
    .insert({
      user_id: userId,
      video_url: params.video_url,
      video_title: params.video_title || '',
      video_cover: params.video_cover || '',
      summary: params.summary || '',
    })
    .select()
    .single();

  if (error) throw error;
  return data as LearningLog;
}

/** 更新学习日志 */
export async function updateLearningLog(id: number, params: UpdateLearningLogParams) {
  const { data, error } = await supabase
    .from('learning_log')
    .update({
      ...params,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as LearningLog;
}

/** 删除学习日志 */
export async function deleteLearningLog(id: number) {
  const { error } = await supabase
    .from('learning_log')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// 资源中心操作
// ============================================

import type { ResourceFolder, CreateResourceFolderParams } from './database.types';

/** 获取文件夹列表 */
export async function getResourceFolders(userId: string) {
  const { data, error } = await supabase
    .from('resource_folder')
    .select('*')
    .eq('user_id', userId)
    .order('sort_order', { ascending: true });

  if (error) throw error;
  return data as ResourceFolder[];
}

/** 创建文件夹 */
export async function createResourceFolder(userId: string, params: CreateResourceFolderParams) {
  const { data, error } = await supabase
    .from('resource_folder')
    .insert({
      user_id: userId,
      name: params.name,
      parent_id: params.parent_id || null,
      sort_order: params.sort_order || 0,
    })
    .select()
    .single();

  if (error) throw error;
  return data as ResourceFolder;
}

/** 批量创建文件夹 */
export async function createResourceFolders(userId: string, folders: CreateResourceFolderParams[]) {
  const { data, error } = await supabase
    .from('resource_folder')
    .insert(
      folders.map(f => ({
        user_id: userId,
        name: f.name,
        parent_id: f.parent_id || null,
        sort_order: f.sort_order || 0,
      }))
    )
    .select();

  if (error) throw error;
  return data as ResourceFolder[];
}

/** 删除文件夹 */
export async function deleteResourceFolder(id: number) {
  const { error } = await supabase
    .from('resource_folder')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/** 获取资源列表 */
export async function getResources(userId: string, folderId?: number | null) {
  let query = supabase
    .from('resource')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (folderId !== undefined) {
    if (folderId === null) {
      query = query.is('folder_id', null);
    } else {
      query = query.eq('folder_id', folderId);
    }
  }

  const { data, error } = await query;
  if (error) throw error;
  return data as Resource[];
}

/** 创建资源 */
export async function createResource(userId: string, params: CreateResourceParams) {
  const { data, error } = await supabase
    .from('resource')
    .insert({
      user_id: userId,
      name: params.name,
      url: params.url,
      icon: params.icon || null,
      folder_id: params.folder_id || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as Resource;
}

/** 批量创建资源 */
export async function createResources(userId: string, resources: CreateResourceParams[]) {
  const { data, error } = await supabase
    .from('resource')
    .insert(
      resources.map(r => ({
        user_id: userId,
        name: r.name,
        url: r.url,
        icon: r.icon || null,
        folder_id: r.folder_id || null,
      }))
    )
    .select();

  if (error) throw error;
  return data as Resource[];
}

/** 删除资源 */
export async function deleteResource(id: number) {
  const { error } = await supabase
    .from('resource')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

/** 批量删除资源 */
export async function deleteResources(ids: number[]) {
  const { error } = await supabase
    .from('resource')
    .delete()
    .in('id', ids);

  if (error) throw error;
}


// ============================================
// 音频转写历史操作
// ============================================

import type { TranscriptHistory, CreateTranscriptParams, UpdateTranscriptParams } from './database.types';

/** 获取转写历史列表 */
export async function getTranscriptHistory(userId: string, limit = 50) {
  const { data, error } = await supabase
    .from('transcript_history')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw error;
  return data as TranscriptHistory[];
}

/** 创建转写记录 */
export async function createTranscript(userId: string, params: CreateTranscriptParams) {
  const { data, error } = await supabase
    .from('transcript_history')
    .insert({
      user_id: userId,
      file_name: params.file_name,
      raw_text: params.raw_text,
      optimized_text: params.optimized_text || null,
      optimized_title: params.optimized_title || null,
      ai_model: params.ai_model || null,
      duration: params.duration || null,
      file_size: params.file_size || null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as TranscriptHistory;
}

/** 更新转写记录（主要用于更新AI优化结果） */
export async function updateTranscript(id: number, params: UpdateTranscriptParams) {
  const { data, error } = await supabase
    .from('transcript_history')
    .update({
      ...params,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select()
    .single();

  if (error) throw error;
  return data as TranscriptHistory;
}

/** 删除转写记录 */
export async function deleteTranscript(id: number) {
  const { error } = await supabase
    .from('transcript_history')
    .delete()
    .eq('id', id);

  if (error) throw error;
}

// ============================================
// AI 配置相关操作 (持久化存储)
// ============================================

import type { AIConfig, UpsertAIConfigParams } from './database.types';

/** 获取用户所有 AI 配置 */
export async function getAIConfigs(userId: string) {
  const { data, error } = await supabase
    .from('ai_config')
    .select('*')
    .eq('user_id', userId);

  if (error) {
    console.error('获取 AI 配置失败:', error);
    return [] as AIConfig[];
  }
  return data as AIConfig[];
}

/** 获取特定模型的 AI 配置 */
export async function getAIConfigByModel(userId: string, modelId: string) {
  const { data, error } = await supabase
    .from('ai_config')
    .select('*')
    .eq('user_id', userId)
    .eq('model_id', modelId)
    .maybeSingle();

  if (error) {
    console.error(`获取模型 ${modelId} 配置失败:`, error);
    return null;
  }
  return data as AIConfig | null;
}

/** 插入或更新 AI 配置 */
export async function upsertAIConfig(userId: string, params: UpsertAIConfigParams) {
  // 对于非 Groq 模型，使用 custom_model_name 为 null 的约束
  // 对于 Groq 模型（多 API Key），custom_model_name 用于区分不同的 Key
  const customName = params.custom_model_name || null;
  
  const { data, error } = await supabase
    .from('ai_config')
    .upsert(
      {
        user_id: userId,
        model_id: params.model_id,
        api_key: params.api_key,
        base_url: params.base_url || null,
        custom_model_name: customName,
        settings: params.settings || null,
        // updated_at 由数据库触发器自动处理
      },
      { onConflict: 'user_id, model_id, custom_model_name' }
    )
    .select()
    .single();

  if (error) throw error;
  return data as AIConfig;
}

/** 删除特定模型的配置 */
export async function deleteAIConfig(userId: string, modelId: string) {
  const { error } = await supabase
    .from('ai_config')
    .delete()
    .eq('user_id', userId)
    .eq('model_id', modelId);

  if (error) {
    console.error('删除 AI 配置失败:', error);
    throw error;
  }
}

// ============================================
// 笔记相关操作
// ============================================

import type { Note, CreateNoteParams, UpdateNoteParams } from "./database.types";

/** 获取所有笔记 */
export async function getNotes(userId: string) {
  const { data, error } = await supabase
    .from("notes")
    .select("*")
    .eq("user_id", userId)
    .order("is_pinned", { ascending: false })
    .order("pin_order", { ascending: true })
    .order("updated_at", { ascending: false });

  if (error) throw error;
  return data as Note[];
}

/** 创建笔记 */
export async function createNote(userId: string, params: CreateNoteParams) {
  const { data, error } = await supabase
    .from("notes")
    .insert({
      user_id: userId,
      title: params.title,
      content: params.content,
      preview: params.preview || null,
      color: params.color || "default",
      category: params.category || null,
      is_pinned: params.is_pinned || false
    })
    .select()
    .single();

  if (error) throw error;
  return data as Note;
}

/** 更新笔记 */
export async function updateNote(id: number, params: UpdateNoteParams) {
  const { data, error } = await supabase
    .from("notes")
    .update({
      ...params,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data as Note;
}
