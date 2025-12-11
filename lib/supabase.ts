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
export async function getVideoCountByDate() {
  const { data, error } = await supabase
    .from('video')
    .select('pubdate');
  
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
    .select(`
      *,
      video:bvid (*)
    `)
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
