import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { getModelApiKey, AI_MODELS, type AIModel } from '../../lib/ai-models';
import { AIMarkdown } from '../common/AIMarkdown';

interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface AIChatProps {
  embedded?: boolean;
}

const AIChat: React.FC<AIChatProps> = ({ embedded = false }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const savedModel = localStorage.getItem('ai_model') || 'deepseek-chat';
    setSelectedModel(savedModel);
  }, []);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streamingContent, scrollToBottom]);

  const adjustTextareaHeight = useCallback(() => {
    const textarea = inputRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  const getCurrentModel = useCallback((): AIModel | null => {
    return AI_MODELS.find(m => m.id === selectedModel) || null;
  }, [selectedModel]);

  const sendMessage = useCallback(async () => {
    if (!inputValue.trim() || isLoading) return;

    const model = getCurrentModel();
    const apiKey = getModelApiKey(selectedModel);
    
    if (!model || !apiKey) {
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: '❌ 请先在设置中配置 AI 模型和 API Key',
        timestamp: new Date()
      }]);
      return;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue.trim(),
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);
    setStreamingContent('');

    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    try {
      const isGemini = model.id.startsWith('gemini');
      
      if (isGemini) {
        const response = await fetch(`${model.apiUrl}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [
              ...messages.map(m => ({
                role: m.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: m.content }]
              })),
              { role: 'user', parts: [{ text: userMessage.content }] }
            ],
            generationConfig: { temperature: 0.7 }
          }),
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
        const data = await response.json();
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text || '无响应内容';
        
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content,
          timestamp: new Date()
        }]);
      } else {
        const response = await fetch(model.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: model.id,
            messages: [
              ...messages.map(m => ({ role: m.role, content: m.content })),
              { role: 'user', content: userMessage.content }
            ],
            temperature: 0.7,
            stream: true
          }),
          signal: abortControllerRef.current.signal
        });

        if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);

        const reader = response.body?.getReader();
        if (!reader) throw new Error('无法读取响应流');

        const decoder = new TextDecoder();
        let buffer = '';
        let fullContent = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              
              try {
                const parsed = JSON.parse(data);
                const content = parsed.choices?.[0]?.delta?.content || '';
                if (content) {
                  fullContent += content;
                  setStreamingContent(fullContent);
                }
              } catch { /* ignore */ }
            }
          }
        }

        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: fullContent,
          timestamp: new Date()
        }]);
        setStreamingContent('');
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `❌ 发送失败: ${(err as Error).message}`,
          timestamp: new Date()
        }]);
      }
    } finally {
      setIsLoading(false);
      setStreamingContent('');
    }
  }, [inputValue, isLoading, messages, selectedModel, getCurrentModel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  }, [sendMessage]);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
    if (streamingContent) {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: streamingContent + '\n\n[已停止生成]',
        timestamp: new Date()
      }]);
    }
    setStreamingContent('');
    setIsLoading(false);
  }, [streamingContent]);

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  };

  const currentModel = getCurrentModel();

  // 根据模型 provider 获取对应的图标和颜色
  const getModelStyle = useCallback((provider: string) => {
    switch (provider) {
      case 'DeepSeek':
        return {
          gradient: 'from-blue-500 to-blue-600',
          shadow: 'shadow-blue-500/20',
          icon: (
            <span className="text-white font-bold text-xs">De</span>
          )
        };
      case '智谱AI':
        return {
          gradient: 'from-indigo-500 to-purple-600',
          shadow: 'shadow-indigo-500/20',
          icon: (
            <span className="text-white font-bold text-xs">智谱</span>
          )
        };
      case '通义千问':
        return {
          gradient: 'from-violet-500 to-purple-600',
          shadow: 'shadow-violet-500/20',
          icon: (
            <span className="text-white font-bold text-xs">通义</span>
          )
        };
      case 'Google':
        return {
          gradient: 'from-amber-500 to-orange-500',
          shadow: 'shadow-amber-500/20',
          icon: (
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          )
        };
      case 'Custom':
        return {
          gradient: 'from-gray-500 to-gray-600',
          shadow: 'shadow-gray-500/20',
          icon: (
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          )
        };
      default:
        return {
          gradient: 'from-emerald-500 to-teal-600',
          shadow: 'shadow-emerald-500/20',
          icon: (
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
              <circle cx="7.5" cy="14.5" r="1.5" fill="currentColor" />
              <circle cx="16.5" cy="14.5" r="1.5" fill="currentColor" />
            </svg>
          )
        };
    }
  }, []);

  const modelStyle = getModelStyle(currentModel?.provider || '');

  // 模型选择器弹窗
  const ModelSelectorModal = showModelSelector ? createPortal(
    <div className="fixed inset-0 z-[99999] flex items-start justify-center pt-24">
      {/* 遮罩 */}
      <div 
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={() => setShowModelSelector(false)}
      />
      {/* 下拉框 */}
      <div 
        className="relative w-[90%] max-w-sm p-2 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/10 rounded-2xl shadow-2xl animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="max-h-72 overflow-y-auto overscroll-contain space-y-1">
          {AI_MODELS.map(model => {
            const hasKey = !!getModelApiKey(model.id);
            return (
              <button
                key={model.id}
                onClick={() => {
                  if (hasKey) {
                    setSelectedModel(model.id);
                    setShowModelSelector(false);
                  }
                }}
                disabled={!hasKey}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all text-left ${
                  selectedModel === model.id
                    ? 'bg-emerald-500/20 text-emerald-200'
                    : hasKey
                      ? 'hover:bg-white/10 text-gray-300 active:bg-white/15'
                      : 'opacity-40 cursor-not-allowed text-gray-500'
                }`}
              >
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                  model.provider === 'DeepSeek' ? 'bg-blue-500/30 text-blue-300' :
                  model.provider === '智谱AI' ? 'bg-indigo-500/30 text-indigo-300' :
                  model.provider === '通义千问' ? 'bg-violet-500/30 text-violet-300' :
                  model.provider === 'Google' ? 'bg-amber-500/30 text-amber-300' :
                  model.provider === 'Custom' ? 'bg-slate-500/30 text-slate-300' :
                  'bg-emerald-500/30 text-emerald-300'
                }`}>
                  {model.provider === 'DeepSeek' ? 'De' :
                   model.provider === '智谱AI' ? '智谱' :
                   model.provider === '通义千问' ? '通义' :
                   model.provider === 'Google' ? 'G' :
                   model.provider.slice(0, 2)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{model.name}</div>
                  <div className="text-xs text-gray-500">{model.provider}</div>
                </div>
                {selectedModel === model.id && (
                  <svg className="w-5 h-5 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                )}
                {!hasKey && (
                  <span className="text-xs text-gray-500 shrink-0">未配置</span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>,
    document.body
  ) : null;

  return (
    <div className={`relative flex flex-col h-full ${embedded ? '' : 'min-h-[500px]'} overflow-hidden`}>
      {/* 冷雾弥散背景 */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#0a0f0d] via-[#0d1210] to-[#080a09]">
        {/* 弥散光晕 */}
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-emerald-900/20 rounded-full blur-[120px]" />
        <div className="absolute top-1/3 right-0 w-80 h-80 bg-teal-900/15 rounded-full blur-[100px]" />
        <div className="absolute bottom-0 left-0 w-72 h-72 bg-cyan-900/10 rounded-full blur-[80px]" />
        {/* 细微噪点纹理 */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`
        }} />
      </div>

      {/* 头部 */}
      <div className="relative z-10 shrink-0 px-4 py-3 backdrop-blur-md bg-black/30 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <div className={`w-10 h-10 rounded-2xl bg-gradient-to-br ${modelStyle.gradient} flex items-center justify-center shadow-lg ${modelStyle.shadow}`}>
                {modelStyle.icon}
              </div>
              <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-400 rounded-full border-2 border-[#0a0f0d]" />
            </div>
            
            <div>
              <h3 className="text-white font-semibold text-sm">AI 助手</h3>
              <button
                onClick={() => setShowModelSelector(true)}
                className="flex items-center gap-1 text-xs text-gray-400 hover:text-emerald-400 transition-colors"
              >
                <span>{currentModel?.name || '选择模型'}</span>
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 消息列表 */}
      <div className="relative z-10 flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && !streamingContent && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-[#0d1210] to-[#0a0f0d] border border-white/10 flex items-center justify-center shadow-lg shadow-emerald-500/20 mb-6">
              <svg width="48" height="48" viewBox="0 0 40 40" fill="none">
                <defs>
                  <linearGradient id="welcomeLogoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#a3e635"/>
                    <stop offset="100%" stopColor="#22d3ee"/>
                  </linearGradient>
                </defs>
                <text x="8" y="30" fontFamily="Arial, sans-serif" fontSize="28" fontWeight="bold" fill="url(#welcomeLogoGrad)">F</text>
                <text x="18" y="32" fontFamily="Georgia, serif" fontSize="20" fontStyle="italic" fill="#ffffff" opacity="0.9">f</text>
              </svg>
            </div>
            
            <h3 className="text-white font-semibold text-lg mb-2">开始对话</h3>
            <p className="text-gray-400 text-sm max-w-xs">
              我是你的 AI 助手，可以帮你解答问题、编写代码、分析内容等
            </p>

            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {['写一段代码', '解释概念', '翻译文本', '头脑风暴'].map(prompt => (
                <button
                  key={prompt}
                  onClick={() => setInputValue(prompt)}
                  className="px-3 py-1.5 bg-white/5 hover:bg-emerald-500/10 border border-white/10 hover:border-emerald-500/30 rounded-full text-xs text-gray-300 hover:text-emerald-300 transition-all"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(message => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'flex-row-reverse' : ''} animate-fade-in`}
          >
            <div className={`shrink-0 w-8 h-8 rounded-xl flex items-center justify-center ${
              message.role === 'user'
                ? 'bg-gradient-to-br from-gray-600 to-gray-700'
                : 'bg-gradient-to-br from-emerald-500 to-teal-600'
            }`}>
              {message.role === 'user' ? (
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                </svg>
              )}
            </div>

            <div className={`flex-1 max-w-[85%] ${message.role === 'user' ? 'text-right' : ''}`}>
              {message.role === 'user' ? (
                <div className="inline-block px-4 py-3 rounded-2xl bg-white/10 border border-white/10 text-white">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {message.content}
                  </p>
                </div>
              ) : (
                <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-3">
                  <AIMarkdown 
                    content={message.content} 
                    variant="success" 
                    title="AI回复"
                    defaultCollapsed={false}
                  />
                </div>
              )}
              <div className={`mt-1 text-xs text-gray-500 ${message.role === 'user' ? 'text-right' : ''}`}>
                {formatTime(message.timestamp)}
              </div>
            </div>
          </div>
        ))}

        {streamingContent && (
          <div className="flex gap-3 animate-fade-in">
            <div className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
              </svg>
            </div>
            <div className="flex-1 max-w-[85%]">
              <div className="bg-emerald-500/5 border border-emerald-500/10 rounded-2xl p-3">
                <div className="flex items-center gap-2 mb-2 text-xs text-emerald-400">
                  <div className="w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />
                  <span>正在生成...</span>
                </div>
                <AIMarkdown 
                  content={streamingContent} 
                  variant="success" 
                  title="AI回复"
                  defaultCollapsed={false}
                />
              </div>
            </div>
          </div>
        )}

        {isLoading && !streamingContent && (
          <div className="flex gap-3 animate-fade-in">
            <div className="shrink-0 w-8 h-8 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
              </svg>
            </div>
            <div className="flex items-center gap-1.5 px-4 py-3 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl">
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" />
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
              <div className="w-2 h-2 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="relative z-10 shrink-0 p-4 backdrop-blur-md bg-black/30 border-t border-white/5">
        <div className="flex items-center gap-3">
          <textarea
            ref={inputRef}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value);
              adjustTextareaHeight();
            }}
            onKeyDown={handleKeyDown}
            placeholder="输入消息..."
            rows={1}
            className="flex-1 px-4 py-3 bg-white/5 border border-white/10 rounded-2xl text-white text-sm placeholder-gray-500 resize-none focus:outline-none focus:border-emerald-500/50 transition-all scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent"
            style={{ maxHeight: '120px' }}
          />

          {isLoading ? (
            <button
              onClick={stopGeneration}
              className="shrink-0 w-[46px] h-[46px] rounded-xl bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 flex items-center justify-center transition-all active:scale-95"
            >
              <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2" />
              </svg>
            </button>
          ) : (
            <button
              onClick={sendMessage}
              disabled={!inputValue.trim()}
              className={`shrink-0 w-[46px] h-[46px] rounded-xl flex items-center justify-center transition-all active:scale-95 ${
                inputValue.trim()
                  ? 'bg-gradient-to-br from-emerald-500 to-teal-600 hover:from-emerald-400 hover:to-teal-500 shadow-lg shadow-emerald-500/20'
                  : 'bg-white/5 border border-white/10 cursor-not-allowed'
              }`}
            >
              <svg className={`w-5 h-5 ${inputValue.trim() ? 'text-white' : 'text-gray-500'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {ModelSelectorModal}
    </div>
  );
};

export default AIChat;
