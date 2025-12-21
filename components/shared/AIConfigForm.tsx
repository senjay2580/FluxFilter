import React, { useState, useEffect } from 'react';
import { AI_MODELS, getModelApiKey, setModelApiKey } from '../../lib/ai-models';
import { supabase, isSupabaseConfigured, getAIConfigs, upsertAIConfig } from '../../lib/supabase';
import { getStoredUserId } from '../../lib/auth';

const AIConfigForm: React.FC = () => {
  const [groqKey, setGroqKey] = useState(() => localStorage.getItem('groq_api_key') || '');
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('ai_model') || 'deepseek-chat');
  const [aiApiKey, setAiApiKey] = useState(() => getModelApiKey(localStorage.getItem('ai_model') || 'deepseek-chat'));
  const [aiBaseUrl, setAiBaseUrl] = useState(() => localStorage.getItem('ai_base_url') || '');
  const [customModelName, setCustomModelName] = useState(() => localStorage.getItem('ai_custom_model') || '');

  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showGroqKey, setShowGroqKey] = useState(false);
  const [showAiKey, setShowAiKey] = useState(false);

  // 当模型切换时，加载对应的 API Key
  const handleModelChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const modelId = e.target.value;
    setSelectedModel(modelId);
    localStorage.setItem('ai_model', modelId);
    setAiApiKey(getModelApiKey(modelId));
  };

  // 初始化从 Supabase 加载配置
  useEffect(() => {
    const fetchConfigs = async () => {
      const userId = getStoredUserId();
      if (!isSupabaseConfigured || !userId) return;

      setLoading(true);
      try {
        const configs = await getAIConfigs(userId);
        if (configs && configs.length > 0) {
          // 更新本地状态和 localStorage
          configs.forEach(config => {
            if (config.model_id === 'groq-whisper') {
              setGroqKey(config.api_key);
              localStorage.setItem('groq_api_key', config.api_key);
            } else {
              setModelApiKey(config.model_id, config.api_key);
              if (config.model_id === selectedModel) {
                setAiApiKey(config.api_key);
              }
              if (config.model_id === 'custom') {
                if (config.base_url) {
                  setAiBaseUrl(config.base_url);
                  localStorage.setItem('ai_base_url', config.base_url);
                }
                if (config.custom_model_name) {
                  setCustomModelName(config.custom_model_name);
                  localStorage.setItem('ai_custom_model', config.custom_model_name);
                }
              }
            }
          });
        }
      } catch (err) {
        console.error('从 Supabase 加载 AI 配置失败:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchConfigs();
  }, [isSupabaseConfigured, selectedModel]);

  // 统一保存逻辑
  const handleSave = async () => {
    setLoading(true);
    setSaveStatus('正在保存...');

    try {
      // 1. 同步到 localStorage
      localStorage.setItem('groq_api_key', groqKey);
      localStorage.setItem('ai_model', selectedModel);
      setModelApiKey(selectedModel, aiApiKey);
      localStorage.setItem('ai_base_url', aiBaseUrl);
      localStorage.setItem('ai_custom_model', customModelName);

      // 2. 同步到 Supabase (如果已配置)
      const userId = getStoredUserId();
      if (isSupabaseConfigured && userId) {
        // 保存 Groq 配置 (使用特殊 model_id)
        if (groqKey) {
          await upsertAIConfig(userId, {
            model_id: 'groq-whisper',
            api_key: groqKey
          });
        }

        // 保存当前选中的模型配置
        await upsertAIConfig(userId, {
          model_id: selectedModel,
          api_key: aiApiKey,
          base_url: selectedModel === 'custom' ? aiBaseUrl : undefined,
          custom_model_name: selectedModel === 'custom' ? customModelName : undefined
        });
      }

      setSaveStatus('配置已保存并同步至云端');
      setTimeout(() => setSaveStatus(null), 3000);

      // 触发全局存储事件
      window.dispatchEvent(new Event('storage'));
    } catch (err) {
      console.error('保存配置失败:', err);
      setSaveStatus('保存失败，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* 语音服务配置 */}
      <div className="space-y-3">
        <label className="flex items-center gap-2 text-sm font-medium text-white">
          <svg className="w-4 h-4 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
          语音转写服务 (Groq)
        </label>
        <div className="relative">
          <input
            type={showGroqKey ? 'text' : 'password'}
            value={groqKey}
            onChange={(e) => setGroqKey(e.target.value)}
            placeholder="输入 Groq API Key..."
            className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 transition-all"
          />
          <button
            type="button"
            onClick={() => setShowGroqKey(!showGroqKey)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white transition-colors"
          >
            {showGroqKey ? (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                <line x1="1" y1="1" x2="23" y2="23" />
              </svg>
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </button>
        </div>
        <p className="text-[10px] text-gray-500">
          用于视频转音频后的文字提取
        </p>
      </div>

      <div className="h-px bg-white/5" />

      {/* AI 模型配置 */}
      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium text-white">
          <svg className="w-4 h-4 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9" />
          </svg>
          AI 助手服务模型
        </label>

        <div className="grid grid-cols-1 gap-4">
          <div className="space-y-2">
            <span className="text-xs text-gray-400 ml-1">选择模型</span>
            <select
              value={selectedModel}
              onChange={handleModelChange}
              className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-xl text-sm text-white appearance-none focus:outline-none focus:border-cyber-lime/50"
            >
              {AI_MODELS.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <span className="text-xs text-gray-400 ml-1">API Key</span>
            <div className="relative">
              <input
                type={showAiKey ? 'text' : 'password'}
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder={`输入 ${AI_MODELS.find(m => m.id === selectedModel)?.name} 的 Key...`}
                className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 transition-all font-mono"
              />
              <button
                type="button"
                onClick={() => setShowAiKey(!showAiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white transition-colors"
              >
                {showAiKey ? (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                    <line x1="1" y1="1" x2="23" y2="23" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {selectedModel === 'custom' && (
            <>
              <div className="space-y-2">
                <span className="text-xs text-gray-400 ml-1">Base URL</span>
                <input
                  type="text"
                  value={aiBaseUrl}
                  onChange={(e) => setAiBaseUrl(e.target.value)}
                  placeholder="https://api.openai.com/v1"
                  className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50"
                />
              </div>
              <div className="space-y-2">
                <span className="text-xs text-gray-400 ml-1">模型名称</span>
                <input
                  type="text"
                  value={customModelName}
                  onChange={(e) => setCustomModelName(e.target.value)}
                  placeholder="gpt-4-turbo"
                  className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <div className="pt-2">
        <button
          onClick={handleSave}
          className="w-full py-2.5 bg-gradient-to-r from-cyber-lime to-emerald-400 text-black text-sm font-bold rounded-xl hover:from-lime-400 hover:to-emerald-500 transition-all shadow-lg shadow-cyber-lime/10 active:scale-[0.98]"
        >
          保存 API 配置
        </button>
        {saveStatus && (
          <p className="mt-2 text-center text-xs text-cyber-lime animate-pulse">
            {saveStatus}
          </p>
        )}
      </div>
    </div>
  );
};

export default AIConfigForm;
