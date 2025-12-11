/**
 * 用户认证模块
 * 管理用户登录状态和Cookie
 */

import { supabase } from './supabase';

export interface User {
  id: string;
  email: string | null;
  nickname: string | null;
  avatar_url: string | null;
  bilibili_cookie: string | null;
  bilibili_mid: number | null;
  bilibili_name: string | null;
  bilibili_face: string | null;
  sync_interval: number;
  auto_sync: boolean;
  created_at: string;
}

// 当前用户缓存
let currentUser: User | null = null;

// 用户ID存储键
const USER_ID_KEY = 'fluxfilter_user_id';

/**
 * 获取存储的用户ID
 */
export function getStoredUserId(): string | null {
  return localStorage.getItem(USER_ID_KEY);
}

/**
 * 存储用户ID
 */
export function setStoredUserId(userId: string): void {
  localStorage.setItem(USER_ID_KEY, userId);
}

/**
 * 清除存储的用户ID
 */
export function clearStoredUserId(): void {
  localStorage.removeItem(USER_ID_KEY);
  currentUser = null;
}

/**
 * 获取当前用户
 */
export async function getCurrentUser(): Promise<User | null> {
  if (currentUser) return currentUser;
  
  const userId = getStoredUserId();
  if (!userId) return null;
  
  const { data, error } = await supabase
    .from('user')
    .select('*')
    .eq('id', userId)
    .single();
  
  if (error || !data) {
    clearStoredUserId();
    return null;
  }
  
  currentUser = data;
  return currentUser;
}

/**
 * 获取当前用户的B站Cookie
 */
export async function getUserBilibiliCookie(): Promise<string | null> {
  const user = await getCurrentUser();
  return user?.bilibili_cookie || null;
}

/**
 * 用户注册
 */
export async function register(nickname: string, email?: string): Promise<{ user: User | null; error: string | null }> {
  try {
    // 检查邮箱是否已存在
    if (email) {
      const { data: existing } = await supabase
        .from('user')
        .select('id')
        .eq('email', email)
        .single();
      
      if (existing) {
        return { user: null, error: '该邮箱已被注册' };
      }
    }
    
    const { data, error } = await supabase
      .from('user')
      .insert({ nickname, email })
      .select()
      .single();
    
    if (error) throw error;
    
    setStoredUserId(data.id);
    currentUser = data;
    
    return { user: data, error: null };
  } catch (err) {
    return { user: null, error: String(err) };
  }
}

/**
 * 用户登录（通过邮箱或用户ID）
 */
export async function login(identifier: string): Promise<{ user: User | null; error: string | null }> {
  try {
    // 尝试通过邮箱查找
    let query = supabase.from('user').select('*');
    
    if (identifier.includes('@')) {
      query = query.eq('email', identifier);
    } else {
      // 尝试通过ID或昵称查找
      query = query.or(`id.eq.${identifier},nickname.eq.${identifier}`);
    }
    
    const { data, error } = await query.single();
    
    if (error || !data) {
      return { user: null, error: '用户不存在' };
    }
    
    setStoredUserId(data.id);
    currentUser = data;
    
    // 更新最后登录时间
    await supabase
      .from('user')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', data.id);
    
    return { user: data, error: null };
  } catch (err) {
    return { user: null, error: String(err) };
  }
}

/**
 * 退出登录
 */
export function logout(): void {
  clearStoredUserId();
  currentUser = null;
}

/**
 * 更新用户信息
 */
export async function updateUser(updates: Partial<User>): Promise<{ success: boolean; error: string | null }> {
  const userId = getStoredUserId();
  if (!userId) return { success: false, error: '未登录' };
  
  try {
    const { error } = await supabase
      .from('user')
      .update(updates)
      .eq('id', userId);
    
    if (error) throw error;
    
    // 更新缓存
    if (currentUser) {
      currentUser = { ...currentUser, ...updates };
    }
    
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

/**
 * 更新B站Cookie
 */
export async function updateBilibiliCookie(cookie: string): Promise<{ success: boolean; error: string | null }> {
  return updateUser({ bilibili_cookie: cookie });
}
