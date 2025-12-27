// Groq API 池管理器 - 负载均衡
// 使用 Supabase ai_config 表存储 API Key

import { supabase } from './supabase';
import { getStoredUserId } from './auth';

export interface GroqApiKey {
  id: string;
  key: string;
  name: string;
  modelId: string; // 使用的模型 ID
  isActive: boolean;
  requestCount: number; // 当前请求数
  totalRequests: number; // 总请求数
  lastUsed: number; // 最后使用时间
  dbId?: number; // 数据库 ID
}

class GroqApiPool {
  private apiKeys: Map<string, GroqApiKey> = new Map();
  private currentIndex = 0;
  private isInitialized = false;

  // 初始化：从数据库加载 API Key
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      const userId = getStoredUserId();
      if (!userId) {
        console.warn('用户未登录，无法加载 API Key');
        return;
      }

      // 从数据库加载所有 Groq API Key（model_id 为 whisper-large-v3 或 whisper-large-v3-turbo）
      const { data, error } = await supabase
        .from('ai_config')
        .select('*')
        .eq('user_id', userId)
        .in('model_id', ['whisper-large-v3', 'whisper-large-v3-turbo']);

      if (error) {
        console.error('加载 API Key 失败:', error);
        return;
      }

      if (data) {
        data.forEach((item: any) => {
          const id = `groq_${item.id}`;
          this.apiKeys.set(id, {
            id,
            key: item.api_key,
            name: item.custom_model_name || `Groq API ${item.id}`,
            modelId: item.model_id || 'whisper-large-v3', // 保存模型 ID
            isActive: true,
            requestCount: 0,
            totalRequests: 0,
            lastUsed: 0,
            dbId: item.id,
          });
        });
      }

      this.isInitialized = true;
    } catch (err) {
      console.error('初始化 API 池失败:', err);
    }
  }

  // 添加 API Key 到数据库
  async addApiKey(key: string, name: string, modelId: string = 'whisper-large-v3-turbo'): Promise<string> {
    try {
      const userId = getStoredUserId();
      if (!userId) {
        throw new Error('用户未登录');
      }

      const { data, error } = await supabase
        .from('ai_config')
        .insert({
          user_id: userId,
          model_id: modelId,
          api_key: key,
          custom_model_name: name,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      const id = `groq_${data.id}`;
      this.apiKeys.set(id, {
        id,
        key: data.api_key,
        name: data.custom_model_name || `Groq API ${data.id}`,
        modelId: modelId, // 保存模型 ID
        isActive: true,
        requestCount: 0,
        totalRequests: 0,
        lastUsed: 0,
        dbId: data.id,
      });

      return id;
    } catch (err) {
      console.error('添加 API Key 失败:', err);
      throw err;
    }
  }

  // 从数据库移除 API Key
  async removeApiKey(id: string): Promise<boolean> {
    try {
      const apiKey = this.apiKeys.get(id);
      if (!apiKey || !apiKey.dbId) {
        return false;
      }

      const { error } = await supabase
        .from('ai_config')
        .delete()
        .eq('id', apiKey.dbId);

      if (error) {
        throw error;
      }

      this.apiKeys.delete(id);
      return true;
    } catch (err) {
      console.error('删除 API Key 失败:', err);
      return false;
    }
  }

  // 获取所有 API Key
  getAllApiKeys(): GroqApiKey[] {
    return Array.from(this.apiKeys.values());
  }

  // 获取活跃的 API Key
  getActiveApiKeys(): GroqApiKey[] {
    return Array.from(this.apiKeys.values()).filter(k => k.isActive);
  }

  // 获取 API Key 数量
  getApiKeyCount(): number {
    return this.apiKeys.size;
  }

  // 获取活跃 API Key 数量
  getActiveApiKeyCount(): number {
    return this.getActiveApiKeys().length;
  }

  // 负载均衡：获取下一个最空闲的 API Key
  getNextApiKey(): GroqApiKey | null {
    const activeKeys = this.getActiveApiKeys();
    if (activeKeys.length === 0) return null;

    // 按请求数排序，选择请求数最少的
    activeKeys.sort((a, b) => a.requestCount - b.requestCount);
    return activeKeys[0];
  }

  // 获取指定索引的 API Key
  getApiKeyByIndex(index: number): GroqApiKey | null {
    const activeKeys = this.getActiveApiKeys();
    if (index < 0 || index >= activeKeys.length) return null;
    return activeKeys[index];
  }

  // 标记 API Key 开始使用
  markApiKeyInUse(id: string): void {
    const apiKey = this.apiKeys.get(id);
    if (apiKey) {
      apiKey.requestCount++;
      apiKey.lastUsed = Date.now();
    }
  }

  // 标记 API Key 使用完成
  markApiKeyDone(id: string): void {
    const apiKey = this.apiKeys.get(id);
    if (apiKey) {
      apiKey.requestCount = Math.max(0, apiKey.requestCount - 1);
      apiKey.totalRequests++;
    }
  }

  // 切换 API Key 活跃状态
  async toggleApiKeyActive(id: string): Promise<boolean> {
    try {
      const apiKey = this.apiKeys.get(id);
      if (!apiKey || !apiKey.dbId) {
        return false;
      }

      apiKey.isActive = !apiKey.isActive;

      // 更新数据库中的 settings 字段
      const { error } = await supabase
        .from('ai_config')
        .update({
          settings: { isActive: apiKey.isActive },
        })
        .eq('id', apiKey.dbId);

      if (error) {
        throw error;
      }

      return true;
    } catch (err) {
      console.error('切换 API Key 状态失败:', err);
      return false;
    }
  }

  // 获取统计信息
  getStats() {
    const allKeys = Array.from(this.apiKeys.values());
    return {
      totalKeys: allKeys.length,
      activeKeys: allKeys.filter(k => k.isActive).length,
      totalRequests: allKeys.reduce((sum, k) => sum + k.totalRequests, 0),
      currentLoad: allKeys.reduce((sum, k) => sum + k.requestCount, 0),
      keyStats: allKeys.map(k => ({
        id: k.id,
        name: k.name,
        isActive: k.isActive,
        requestCount: k.requestCount,
        totalRequests: k.totalRequests,
      })),
    };
  }

  // 清空所有 API Key
  clear(): void {
    this.apiKeys.clear();
    this.currentIndex = 0;
    this.isInitialized = false;
  }
}

// 全局单例
export const groqApiPool = new GroqApiPool();
