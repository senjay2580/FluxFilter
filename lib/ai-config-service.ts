/**
 * AI 配置统一管理服务
 * 
 * 策略：
 * 1. 数据库为主存储（Supabase）
 * 2. localStorage 作为缓存层（提高读取速度）
 * 3. 组件挂载时从数据库同步到 localStorage
 * 4. 保存时同时写入数据库和 localStorage
 * 5. 通过 storage 事件通知其他组件配置已更新
 */

import { getAIConfigs, upsertAIConfig, isSupabaseConfigured } from './supabase';
import { getStoredUserId } from './auth';
import { AI_MODELS, getModelApiKey, setModelApiKey } from './ai-models';

// 配置加载状态
let configLoaded = false;
let loadingPromise: Promise<void> | null = null;

// 配置变更回调
type ConfigChangeCallback = () => void;
const changeCallbacks: Set<ConfigChangeCallback> = new Set();

/**
 * 订阅配置变更
 */
export function subscribeConfigChange(callback: ConfigChangeCallback): () => void {
  changeCallbacks.add(callback);
  return () => changeCallbacks.delete(callback);
}

/**
 * 通知配置变更
 */
function notifyConfigChange() {
  changeCallbacks.forEach(cb => cb());
  // 同时触发 storage 事件，兼容旧代码
  window.dispatchEvent(new Event('storage'));
}

/**
 * 从数据库加载 AI 配置到 localStorage
 * 确保只加载一次，多次调用返回同一个 Promise
 */
export async function loadAIConfigFromDB(): Promise<void> {
  // 如果已加载，直接返回
  if (configLoaded) return;
  
  // 如果正在加载，返回现有的 Promise
  if (loadingPromise) return loadingPromise;
  
  loadingPromise = (async () => {
    const userId = getStoredUserId();
    if (!isSupabaseConfigured || !userId) {
      configLoaded = true;
      return;
    }

    try {
      const configs = await getAIConfigs(userId);
      if (configs && configs.length > 0) {
        configs.forEach(config => {
          // Groq Whisper 单独处理
          if (config.model_id === 'groq-whisper') {
            localStorage.setItem('groq_api_key', config.api_key);
          } else {
            // 其他 AI 模型
            setModelApiKey(config.model_id, config.api_key);
            
            // 自定义模型额外字段
            if (config.model_id === 'custom') {
              if (config.base_url) localStorage.setItem('ai_base_url', config.base_url);
              if (config.custom_model_name) localStorage.setItem('ai_custom_model', config.custom_model_name);
            }
          }
        });
        
        // 通知配置已更新
        notifyConfigChange();
      }
    } catch (err) {
      console.error('从数据库加载 AI 配置失败:', err);
    } finally {
      configLoaded = true;
      loadingPromise = null;
    }
  })();
  
  return loadingPromise;
}

/**
 * 强制重新从数据库加载配置
 */
export async function reloadAIConfigFromDB(): Promise<void> {
  configLoaded = false;
  loadingPromise = null;
  return loadAIConfigFromDB();
}

/**
 * 保存 AI 模型配置（同时写入 localStorage 和数据库）
 */
export async function saveAIModelConfig(params: {
  modelId: string;
  apiKey: string;
  baseUrl?: string;
  customModelName?: string;
}): Promise<void> {
  const { modelId, apiKey, baseUrl, customModelName } = params;
  
  // 1. 保存到 localStorage
  localStorage.setItem('ai_model', modelId);
  setModelApiKey(modelId, apiKey);
  
  if (modelId === 'custom') {
    if (baseUrl) localStorage.setItem('ai_base_url', baseUrl);
    if (customModelName) localStorage.setItem('ai_custom_model', customModelName);
  }
  
  // 2. 保存到数据库
  const userId = getStoredUserId();
  if (isSupabaseConfigured && userId) {
    await upsertAIConfig(userId, {
      model_id: modelId,
      api_key: apiKey,
      base_url: modelId === 'custom' ? baseUrl : undefined,
      custom_model_name: modelId === 'custom' ? customModelName : undefined,
    });
  }
  
  // 3. 通知变更
  notifyConfigChange();
}

/**
 * 保存 Groq API Key（语音转写服务）
 */
export async function saveGroqApiKey(apiKey: string): Promise<void> {
  // 1. 保存到 localStorage
  localStorage.setItem('groq_api_key', apiKey);
  
  // 2. 保存到数据库
  const userId = getStoredUserId();
  if (isSupabaseConfigured && userId && apiKey) {
    await upsertAIConfig(userId, {
      model_id: 'groq-whisper',
      api_key: apiKey,
    });
  }
  
  // 3. 通知变更
  notifyConfigChange();
}

/**
 * 获取当前 AI 配置
 */
export function getCurrentAIConfig(): {
  modelId: string;
  apiKey: string;
  model: typeof AI_MODELS[0] | { id: string; name: string; provider: string; apiUrl: string };
} {
  const modelId = localStorage.getItem('ai_model') || 'deepseek-chat';
  const apiKey = getModelApiKey(modelId);
  
  if (modelId === 'custom') {
    return {
      modelId,
      apiKey,
      model: {
        id: localStorage.getItem('ai_custom_model') || 'custom-model',
        name: '自定义模型',
        provider: 'Custom',
        apiUrl: localStorage.getItem('ai_base_url') || '',
      },
    };
  }
  
  const model = AI_MODELS.find(m => m.id === modelId) || AI_MODELS[0];
  return { modelId, apiKey, model };
}

/**
 * 获取 Groq API Key
 */
export function getGroqApiKey(): string {
  return localStorage.getItem('groq_api_key') || '';
}

/**
 * 检查配置是否已加载
 */
export function isConfigLoaded(): boolean {
  return configLoaded;
}

/**
 * 重置加载状态（用于登出后）
 */
export function resetConfigState(): void {
  configLoaded = false;
  loadingPromise = null;
}
