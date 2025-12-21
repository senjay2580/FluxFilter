export interface AIModel {
  id: string;
  name: string;
  provider: string;
  apiUrl: string;
  keyPrefix?: string;
}

export const AI_MODELS: AIModel[] = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', apiUrl: 'https://api.deepseek.com/chat/completions', keyPrefix: 'sk-' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'DeepSeek', apiUrl: 'https://api.deepseek.com/chat/completions', keyPrefix: 'sk-' },
  { id: 'glm-4.5', name: 'GLM-4.5', provider: '智谱AI', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
  { id: 'qwen3-max', name: 'Qwen3 Max', provider: '通义千问', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', keyPrefix: 'sk-' },
  { id: 'qwen-plus', name: 'Qwen Plus', provider: '通义千问', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', keyPrefix: 'sk-' },

  { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash', provider: 'Google', apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', keyPrefix: 'AIza' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro', provider: 'Google', apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent', keyPrefix: 'AIza' },
  { id: 'custom', name: '自定义模型', provider: 'Custom', apiUrl: '' },
];

// ============ API Key 按模型隔离存储 ============

const API_KEY_PREFIX = 'ai_api_key_';

/**
 * 获取指定模型的 API Key
 * @param modelId 模型ID
 * @returns API Key 字符串，未配置时返回空字符串
 */
export function getModelApiKey(modelId: string): string {
  return localStorage.getItem(`${API_KEY_PREFIX}${modelId}`) || '';
}

/**
 * 保存指定模型的 API Key
 * @param modelId 模型ID
 * @param apiKey API Key 字符串
 */
export function setModelApiKey(modelId: string, apiKey: string): void {
  if (apiKey) {
    localStorage.setItem(`${API_KEY_PREFIX}${modelId}`, apiKey);
  } else {
    localStorage.removeItem(`${API_KEY_PREFIX}${modelId}`);
  }
}

/**
 * 获取当前选中模型的 API Key（便捷函数）
 * @param storageKey 存储选中模型ID的localStorage key，默认 'ai_model'
 * @returns API Key 字符串
 */
export function getSelectedModelKey(storageKey = 'ai_model'): string {
  const selectedModel = localStorage.getItem(storageKey) || 'deepseek-chat';
  return getModelApiKey(selectedModel);
}

/**
 * 检查指定模型是否已配置 API Key
 * @param modelId 模型ID
 * @returns 是否已配置
 */
export function hasModelApiKey(modelId: string): boolean {
  return !!getModelApiKey(modelId);
}
