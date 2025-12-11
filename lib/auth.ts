/**
 * 用户认证模块
 * 管理用户登录状态和Cookie
 */

import { supabase } from './supabase';

export interface User {
  id: string;
  username: string | null;
  password?: string;
  bilibili_cookie: string | null;
  created_at: string;
  updated_at: string;
  last_login_at: string | null;
}

// 当前用户缓存
let currentUser: User | null = null;

// 用户信息存储键
const USER_ID_KEY = 'fluxfilter_user_id';
const USERNAME_KEY = 'fluxfilter_username';

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
 * 获取存储的用户名
 */
export function getStoredUsername(): string | null {
  return localStorage.getItem(USERNAME_KEY);
}

/**
 * 存储用户名
 */
export function setStoredUsername(username: string): void {
  localStorage.setItem(USERNAME_KEY, username);
}

/**
 * 清除存储的用户信息
 */
export function clearStoredUserId(): void {
  localStorage.removeItem(USER_ID_KEY);
  localStorage.removeItem(USERNAME_KEY);
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
export async function register(username: string, password: string): Promise<{ user: User | null; error: string | null }> {
  try {
    // 检查用户名是否已存在
    const { data: existingUsers } = await supabase
      .from('user')
      .select('id')
      .eq('username', username);
    
    if (existingUsers && existingUsers.length > 0) {
      return { user: null, error: '用户名已被注册' };
    }
    
    const { data, error } = await supabase
      .from('user')
      .insert({ username, password })
      .select()
      .single();
    
    if (error) {
      console.error('注册错误:', error);
      return { user: null, error: error.message || '注册失败' };
    }
    
    setStoredUserId(data.id);
    setStoredUsername(data.username || username);
    currentUser = data;
    
    return { user: data, error: null };
  } catch (err: any) {
    console.error('注册异常:', err);
    return { user: null, error: err?.message || '注册失败，请稍后重试' };
  }
}

/**
 * 用户登录（用户名+密码）
 */
export async function login(username: string, password: string): Promise<{ user: User | null; error: string | null }> {
  try {
    const { data, error } = await supabase
      .from('user')
      .select('*')
      .eq('username', username)
      .eq('password', password)
      .single();
    
    if (error || !data) {
      return { user: null, error: '用户名或密码错误' };
    }
    
    setStoredUserId(data.id);
    setStoredUsername(data.username || username);
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
