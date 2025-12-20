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
  { id: 'glm-4-flash', name: 'GLM-4 Flash', provider: '智谱AI', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
  { id: 'glm-4-plus', name: 'GLM-4 Plus', provider: '智谱AI', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
  { id: 'qwen-turbo', name: 'Qwen Turbo', provider: '通义千问', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', keyPrefix: 'sk-' },
  { id: 'qwen-plus', name: 'Qwen Plus', provider: '通义千问', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', keyPrefix: 'sk-' },
  { id: 'moonshot-v1-8k', name: 'Moonshot v1', provider: 'Kimi', apiUrl: 'https://api.moonshot.cn/v1/chat/completions', keyPrefix: 'sk-' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', keyPrefix: 'AIza' },
  { id: 'custom', name: '自定义模型', provider: 'Custom', apiUrl: '' },
];
