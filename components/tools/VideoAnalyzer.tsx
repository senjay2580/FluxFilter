import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AIMarkdown } from '../common/AIMarkdown';
import { getWatchlist, getCollectedVideos, getLearningLogs, supabase } from '../../lib/supabase';
import { getStoredUserId } from '../../lib/auth';
import type { VideoWithUploader } from '../../lib/database.types';
import { AI_MODELS, type AIModel } from '../../lib/ai-models';

interface VideoAnalyzerProps {
  isOpen: boolean;
  onClose: () => void;
  videos: VideoWithUploader[];
  filterName: string; // 当前筛选条件名称
}

interface AnalysisResult {
  title: string;
  date: string;
  summary: string;
  filterName?: string;
  videoCount?: number;
  totalDuration?: number;
  createdAt?: string;
  modelUsed?: string;
}

const VIDEO_ANALYSIS_STORAGE_KEY = 'fluxf_video_analysis_cache';
const TASK_ANALYSIS_STORAGE_KEY = 'fluxf_task_analysis_cache';

// 格式化时长
const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0) return `${hours}小时${minutes}分钟`;
  return `${minutes}分钟`;
};

const VideoAnalyzer: React.FC<VideoAnalyzerProps> = ({ isOpen, onClose, videos, filterName }) => {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [taskResult, setTaskResult] = useState<string>('');
  const [aiSummary, setAiSummary] = useState<Record<'github' | 'stackoverflow', string>>({ github: '', stackoverflow: '' });
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [showAIResult, setShowAIResult] = useState(false);
  const [aiItemCount, setAiItemCount] = useState<number>(-1);
  const [analysisTab, setAnalysisTab] = useState<'video' | 'task'>('video');

  // 独立的状态
  const [videoLoading, setVideoLoading] = useState(false);
  const [taskLoading, setTaskLoading] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [taskError, setTaskError] = useState<string | null>(null);

  const [showSettings, setShowSettings] = useState(false);

  // 使用音频转写的配置开关
  const [useTranscriberKey, setUseTranscriberKey] = useState(true);

  // 独立配置
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('video-analyzer-model') || 'deepseek-chat');
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('video-analyzer-api-key') || '');
  const [customBaseUrl, setCustomBaseUrl] = useState(() => localStorage.getItem('ai_base_url') || '');
  const [customModelName, setCustomModelName] = useState(() => localStorage.getItem('ai_custom_model') || '');

  const currentModel = AI_MODELS.find(m => m.id === selectedModel) || AI_MODELS[0];

  // 加载缓存的结果
  useEffect(() => {
    if (isOpen) {
      if (analysisTab === 'video') {
        const cached = localStorage.getItem(VIDEO_ANALYSIS_STORAGE_KEY);
        if (cached) {
          try {
            setResult(JSON.parse(cached));
          } catch { /* ignore */ }
        } else {
          setResult(null);
        }
      } else {
        const cached = localStorage.getItem(TASK_ANALYSIS_STORAGE_KEY);
        if (cached) {
          setTaskResult(cached);
        } else {
          setTaskResult('');
        }
      }
    }
  }, [isOpen, analysisTab]);

  // 保存配置
  const saveConfig = useCallback((model: string, key: string, baseUrl?: string, modelName?: string) => {
    setSelectedModel(model);
    setApiKey(key);
    localStorage.setItem('video-analyzer-model', model);
    localStorage.setItem('video-analyzer-api-key', key);
    if (baseUrl !== undefined) {
      setCustomBaseUrl(baseUrl);
      localStorage.setItem('ai_base_url', baseUrl);
    }
    if (modelName !== undefined) {
      setCustomModelName(modelName);
      localStorage.setItem('ai_custom_model', modelName);
    }
  }, []);

  // 获取实际使用的 API 配置
  const getEffectiveConfig = useCallback((): { apiKey: string; model: AIModel | { id: string, name: string, provider: string, apiUrl: string } } => {
    if (useTranscriberKey) {
      // 使用音频转写的配置
      const transcriberKey = localStorage.getItem('ai_api_key') || '';
      const transcriberModel = localStorage.getItem('ai_model') || 'deepseek-chat';

      if (transcriberModel === 'custom') {
        return {
          apiKey: transcriberKey,
          model: {
            id: localStorage.getItem('ai_custom_model') || 'custom-model',
            name: '自定义模型',
            provider: 'Custom',
            apiUrl: localStorage.getItem('ai_base_url') || ''
          }
        };
      }

      const model = AI_MODELS.find(m => m.id === transcriberModel) || AI_MODELS[0];
      return { apiKey: transcriberKey, model };
    }

    // 使用独立配置
    if (selectedModel === 'custom') {
      return {
        apiKey,
        model: {
          id: customModelName || 'custom-model',
          name: '自定义模型',
          provider: 'Custom',
          apiUrl: customBaseUrl
        }
      };
    }
    return { apiKey, model: currentModel };
  }, [useTranscriberKey, apiKey, currentModel, selectedModel, customBaseUrl, customModelName]);

  // 执行 AI 分析
  const runAnalysis = useCallback(async () => {
    if (analysisTab === 'video') {
      if (videos.length === 0) {
        setVideoError('当前筛选条件下没有视频');
        return;
      }

      const { apiKey: effectiveKey, model } = getEffectiveConfig();
      if (!effectiveKey) {
        setVideoError('请先配置 API Key');
        setShowSettings(true);
        return;
      }

      setVideoLoading(true);
      setVideoError(null);

      try {
        const prompt = `你是一个专业的视频内容分析专家。
请根据以下视频列表进行深度分析。你必须严格遵守以下格式要求：

视频数据：
${videos.map((v, i) => `${i + 1}. 标题: ${v.title}\n   描述: ${v.description || '无'}\n   UP主: ${v.uploader?.name || '未知'}`).join('\n')}

你的任务（严格按照以下格式输出）：

1. **生成一个吸睛的 # 级总标题**：精炼、具有洞察力的总标题。

2. **按环节组织输出**：
   - 将每个视频作为一个"环节"（用 ## 二级标题）
   - 格式：## 视频N：[视频核心主题] - [一句话洞察]
   - 在每个环节下方，用一段话（20-40字）深入阐述这个视频的核心价值或技术要点
   - 必须用双星号 ** 包裹关键技术词汇或核心概念（如 **React**、**性能优化**）
   - 结尾：- [视频链接] | [UP主] | [关键词云] 

3. **输出示例**：
\`\`\`
# AI赋能下的技术进阶之路：从编码到架构的深度洞察

## 环节1：提升编程理解与设计——从编码到编程的深度洞察

不论哪个人都了解技术不等于编程，人们想到的**不确定性**、**试错**，并且应该遵循**技术根基**与**预期类型**，其核心在于工程主导下的沉淀式工作以求"一稳为土"，已确定现实历程中需到期前提供。

## 环节2：深化自我性格闭圈！Agent 进行内部构建！

视频揭秘了**大模型 Agent**对内部性格调用的优质做法——关于未来开发AI侧，它们将塑造个人性格融会，让"关注人类心理学"在Watchlist中添加1-2个高质量的系缚课程或优化算法架构片，并让她保障实战测。

## 环节3：一次GC也！整盒"AI面试"进阶游戏合集【全流程指南】

现战斗AI术，可由利卡抽成多个中作为拆分**性能优化**向**防病毒化**，现**抗成本运营**并行重中心之万件于，一并设计制造与性建设之定制性，在劣记系统中呼救；如果是无信息，直接响除。【保持系统清净。

## 环节4：短验学习！高平你花团队AI面试大法！

本权核小看了7点，**Spec Coding**的开发体AI编程式，包括并开一发实二代试验，它们关于建对面试心理概不稳的，现在短期内AI模团队协同计！让开发者今日专题记分及一个理想时（审计总结协。
\`\`\`

约束限制：
- 严禁输出任何多余的开场白或结束语。
- 每个环节必须包含 2-4 个用 ** 包裹的核心关键词。
- 环节描述要具有洞察力，不要简单复述标题。
- 必须分析所有提供的视频。`;

        if (model.provider === 'Google') {
          const res = await fetch(`${model.apiUrl}?key=${effectiveKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
            })
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error.message);
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          const newResult = { title: '分析报告', date: new Date().toISOString(), summary: text };
          setResult(newResult);
          localStorage.setItem(VIDEO_ANALYSIS_STORAGE_KEY, JSON.stringify(newResult));
        } else {
          const response = await fetch(model.apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${effectiveKey}`
            },
            body: JSON.stringify({
              model: model.id,
              messages: [{ role: 'user', content: prompt }],
              stream: true
            })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `API 请求失败: ${response.status}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';
          let buffer = '';

          let lastUpdate = Date.now();

          while (reader) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (dataStr === '[DONE]') continue;
                try {
                  const json = JSON.parse(dataStr);
                  const delta = json.choices?.[0]?.delta?.content || '';
                  fullContent += delta;

                  // 节流更新：每 60ms 更新一次 UI，或在结束时强制更新
                  const now = Date.now();
                  if (now - lastUpdate > 60) {
                    setResult({ title: 'AI 实时分析中...', date: new Date().toISOString(), summary: fullContent });
                    lastUpdate = now;
                  }
                } catch (e) {
                  console.error('解析流数据失败', e, dataStr);
                }
              }
            }
          }
          const finalResult = { title: '视频内容分析报告', date: new Date().toISOString(), summary: fullContent };
          setResult(finalResult);
          localStorage.setItem(VIDEO_ANALYSIS_STORAGE_KEY, JSON.stringify(finalResult));
        }
      } catch (err) {
        console.error('视频分析失败:', err);
        setVideoError(`分析失败: ${err instanceof Error ? err.message : '未知错误'}`);
      } finally {
        setVideoLoading(false);
      }
    } else {
      // 任务分析模式
      const { apiKey: effectiveKey, model } = getEffectiveConfig();
      if (!effectiveKey) {
        setTaskError('请先配置 API Key');
        setShowSettings(true);
        return;
      }

      setTaskLoading(true);
      setTaskError(null);
      setTaskResult('');

      try {
        const userId = getStoredUserId();
        const [watchlist, collectedVideos, logs, notesRes] = await Promise.all([
          getWatchlist(userId || undefined),
          getCollectedVideos(userId || undefined),
          userId ? getLearningLogs(userId) : Promise.resolve([]),
          userId ? supabase.from('notes').select('*').eq('user_id', userId) : Promise.resolve({ data: [] })
        ]);

        const todos = JSON.parse(localStorage.getItem('fluxf-todos') || '[]');
        const notes = notesRes.data || [];

        const taskPrompt = `你是一个资深的决策分析师与全能生产力教练。请根据以下我当前项目中的全量数据，进行一次深度的“全维决策分析”。

我的当前数据源：
1. 待办事项 (TodoList): (共 ${todos.length} 项)
${todos.map((t: any) => `- [${t.completed ? 'x' : ' '}] ${t.text} (优先级: ${t.priority})`).join('\n')}

2. 视频待看队列 (Watchlist): (共 ${watchlist.length} 项)
${watchlist.map((w: any) => `- ${w.bvid} (${w.is_watched ? '已看' : '待看'})`).join('\n')}

3. 视频收藏夹 (Collected Videos): (共 ${collectedVideos.length} 项)
${collectedVideos.map((c: any) => `- ${c.title} by ${c.uploader_name || 'Unknown'}`).join('\n')}

4. 学习日志 (Learning Logs): (共 ${logs.length} 条)
${logs.map((l: any) => `- 记录: ${l.video_title}\n  总结: ${l.summary}`).join('\n')}

5. 个人笔记 (Notes): (共 ${notes.length} 篇)
${notes.map((n: any) => `- 标题: ${n.title}\n  预览: ${n.preview || '无'}`).join('\n')}

你的分析任务（请严格按照以下顺序输出）：

1. **📊 全维数据概览 (Overview)**：
   - 首页列出各维度数据的具体计数（TodoList、Watchlist、Logs、Notes）。
   - 用一句话高度概括当前整体状态（例如：“当前正处于技术攻坚期，任务集中在 React 优化”）。

2. **🔍 核心维度分类探讨 (Sector Analysis)**：
   - **待办板块**：分析高优先级任务的分布与完成趋势。
   - **知识输入板块（视频）**：
     - 待看队列：当前待看视频的领域分布，是否有积压。
     - 收藏夹：已收藏的精品内容反映的知识深度。
   - **学习沉淀板块**：基于学习日志分析知识消化程度。
   - **灵感沉淀板块**：基于笔记内容发现当前的知识盲区或深度思考点。

3. **🔗 跨维度联系挖掘 (Core Connections)**：
   - 深度对比不同数据源，发现隐含关联（例如：“发现你在关注 TypeScript，收藏中已有相关进阶视频，且待办中有重构任务，建议形成技术闭环”）。

4. **🚀 决策方案与细化指南 (Strategic Plan)**：
   - 制定一个包含“立即执行”、“优先关注”和“后续规划”的决策计划。
   - 提供 1-2 条具体的、以决策者视角出发的生产力优化建议。

输出要求：
- 使用 Markdown 格式，层级清晰。
- 语气专业且具有洞察力，增加适当的 Emoji 以提高可读性。
- 必须针对以上所有提供的数据源进行综合决策分析。`;

        if (model.provider === 'Google') {
          const res = await fetch(`${model.apiUrl}?key=${effectiveKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: taskPrompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 2000 }
            })
          });
          const data = await res.json();
          if (data.error) throw new Error(data.error.message);
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
          setTaskResult(text);
          localStorage.setItem(TASK_ANALYSIS_STORAGE_KEY, text);
        } else {
          const response = await fetch(model.apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${effectiveKey}` },
            body: JSON.stringify({ model: model.id, messages: [{ role: 'user', content: taskPrompt }], stream: true })
          });

          if (!response.ok) {
            const errData = await response.json().catch(() => ({}));
            throw new Error(errData.error?.message || `API 请求失败: ${response.status}`);
          }

          const reader = response.body?.getReader();
          const decoder = new TextDecoder();
          let fullContent = '';
          let buffer = '';

          let lastUpdate = Date.now();

          while (reader) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';
            for (const line of lines) {
              if (line.startsWith('data: ')) {
                const dataStr = line.slice(6).trim();
                if (dataStr === '[DONE]') continue;
                try {
                  const json = JSON.parse(dataStr);
                  const delta = json.choices?.[0]?.delta?.content || '';
                  fullContent += delta;

                  // 节流更新 UI
                  const now = Date.now();
                  if (now - lastUpdate > 60) {
                    setTaskResult(fullContent);
                    lastUpdate = now;
                  }
                } catch (e) { }
              }
            }
          }
          localStorage.setItem(TASK_ANALYSIS_STORAGE_KEY, fullContent);
        }
      } catch (err) {
        console.error('任务分析失败:', err);
        setTaskError(`任务分析失败: ${err instanceof Error ? err.message : '未知错误'}`);
      } finally {
        setTaskLoading(false);
      }
    }
  }, [videos, filterName, getEffectiveConfig, analysisTab]);

  const clearCache = useCallback(() => {
    localStorage.removeItem(VIDEO_ANALYSIS_STORAGE_KEY);
    localStorage.removeItem(TASK_ANALYSIS_STORAGE_KEY);
    setResult(null);
    setTaskResult('');
  }, []);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] bg-cyber-dark overflow-hidden flex flex-col">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-0 w-80 h-80 bg-purple-500/10 rounded-full blur-[80px]" />
      </div>

      <div className="sticky top-0 z-10 bg-cyber-dark/80 backdrop-blur-xl border-b border-white/10">
        <div className="flex items-center gap-3 px-4 py-3 safe-area-top mt-3">
          <button onClick={onClose} className="p-2 -ml-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-all active:scale-95">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="text-white font-bold text-lg flex items-center gap-2">
              <svg className="w-5 h-5 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
              </svg>
              AI 视频分析
            </h1>
            <p className="text-gray-500 text-xs">智能分析视频内容，制定观看计划</p>
          </div>
          <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-xl transition-all ${showSettings ? 'bg-white/15 text-white' : 'hover:bg-white/10 text-gray-400'}`}>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 pb-20">
        {showSettings && (
          <div className="mb-4 p-4 bg-white/5 border border-white/10 rounded-2xl space-y-4">
            <h3 className="text-white font-medium flex items-center gap-2">
              <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
              </svg>
              API 配置
            </h3>
            <label className="flex items-center gap-3 cursor-pointer" onClick={() => setUseTranscriberKey(!useTranscriberKey)}>
              <div className={`relative w-11 h-6 rounded-full transition-colors ${useTranscriberKey ? 'bg-cyber-lime' : 'bg-white/20'}`}>
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${useTranscriberKey ? 'left-6' : 'left-1'}`} />
              </div>
              <span className="text-sm text-gray-300">使用音频转写的 API 配置</span>
            </label>
            {!useTranscriberKey && (
              <>
                <div>
                  <label className="text-white text-sm font-medium mb-2 block">AI 模型</label>
                  <select
                    value={selectedModel}
                    onChange={(e) => saveConfig(e.target.value, apiKey, customBaseUrl, customModelName)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-white/30"
                  >
                    {AI_MODELS.map(model => (
                      <option key={model.id} value={model.id} className="bg-cyber-dark">{model.name} ({model.provider})</option>
                    ))}
                  </select>
                </div>
                {selectedModel === 'custom' && (
                  <>
                    <div>
                      <label className="text-white text-sm font-medium mb-2 block">Base URL</label>
                      <input type="text" value={customBaseUrl} onChange={(e) => saveConfig(selectedModel, apiKey, e.target.value, customModelName)} placeholder="https://api.openai.com/v1/chat/completions" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500" />
                    </div>
                    <div>
                      <label className="text-white text-sm font-medium mb-2 block">模型名称</label>
                      <input type="text" value={customModelName} onChange={(e) => saveConfig(selectedModel, apiKey, customBaseUrl, e.target.value)} placeholder="如 gpt-4" className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500" />
                    </div>
                  </>
                )}
                <div>
                  <label className="text-white text-sm font-medium mb-2 block">API Key</label>
                  <input type="password" value={apiKey} onChange={(e) => saveConfig(selectedModel, e.target.value, customBaseUrl, customModelName)} placeholder={currentModel.keyPrefix ? `${currentModel.keyPrefix}xxx...` : 'API Key'} className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500" />
                </div>
              </>
            )}
          </div>
        )}

        {/* 当前筛选信息 - 仅在视频分析模式显示 */}
        {analysisTab === 'video' && (
          <div className="mb-4 p-4 bg-white/5 border border-white/10 rounded-2xl">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-gray-400 text-xs mb-1">当前筛选</p>
                <p className="text-white font-medium">{filterName}</p>
              </div>
              <div className="text-right">
                <p className="text-gray-400 text-xs mb-1">视频数量</p>
                <p className="text-cyan-400 font-bold text-lg">{videos.length}</p>
              </div>
            </div>
            {videos.length > 0 && (
              <div className="mt-3 pt-3 border-t border-white/10 flex items-center justify-between text-sm">
                <span className="text-gray-400">总时长</span>
                <span className="text-white">{formatDuration(videos.reduce((sum, v) => sum + v.duration, 0))}</span>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 mb-6 p-1 bg-white/5 rounded-2xl w-fit mx-auto border border-white/5">
          <button onClick={() => setAnalysisTab('video')} className={`px-6 py-2 rounded-xl text-sm font-medium transition-all ${analysisTab === 'video' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>
            视频内容分析
          </button>
          <button onClick={() => setAnalysisTab('task')} className={`px-6 py-2 rounded-xl text-sm font-medium transition-all ${analysisTab === 'task' ? 'bg-white/10 text-white shadow-lg' : 'text-gray-500 hover:text-white'}`}>
            全能任务概览
          </button>
        </div>

        {/* 结果展示区域 */}
        {analysisTab === 'video' ? (
          <>
            {videoError && (
              <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {videoError}
              </div>
            )}

            {result ? (
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-cyber-lime/5 to-blue-500/5 rounded-2xl blur-xl transition-all group-hover:blur-2xl" />
                <div className="relative p-6 rounded-2xl bg-white/5 border border-white/10 shadow-2xl overflow-hidden backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-cyber-lime/20 rounded-lg">
                        <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-white font-bold">{result.title}</h3>
                        <p className="text-gray-500 text-[10px] mt-0.5">{new Date(result.date).toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={clearCache} className="text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white/5" title="清除缓存">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                      <button onClick={runAnalysis} className="text-gray-500 hover:text-cyber-lime transition-colors p-1.5 rounded-lg hover:bg-white/5" title="重新分析">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <AIMarkdown content={result.summary} variant="primary" title="视频内容分析" />

                  {videoLoading && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-cyber-lime/60 animate-pulse">
                      <span>AI Analysis in progress</span>
                      <span className="flex gap-1">
                        <span className="w-1 h-1 bg-cyber-lime rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-1 h-1 bg-cyber-lime rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-1 h-1 bg-cyber-lime rounded-full animate-bounce"></span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 px-6 rounded-2xl bg-white/5 border border-dashed border-white/10">
                <div className="w-16 h-16 bg-cyber-lime/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-cyber-lime/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /><path d="M3 11V3h8" /><path d="M3 3l4.64 4.64" /><path d="M16 5l4.64 4.64" />
                  </svg>
                </div>
                <h3 className="text-white font-medium mb-2">准备好开启内容洞察了吗？</h3>
                <p className="text-gray-500 text-xs mb-6 max-w-xs mx-auto">点击下方的“执行 AI 智能分析”按钮，我们将为您深度剖析当前筛选出的视频内容趋势。</p>
                <button
                  onClick={runAnalysis}
                  disabled={videoLoading}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-cyber-lime text-black font-bold rounded-xl hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(157,255,0,0.2)]"
                >
                  {videoLoading ? (
                    <div className="w-5 h-5 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                    </svg>
                  )}
                  <span>执行 AI 智能分析</span>
                </button>
              </div>
            )}
          </>
        ) : (
          <>
            {taskError && (
              <div className="mb-4 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm flex items-center gap-2">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
                {taskError}
              </div>
            )}

            {taskResult ? (
              <div className="relative group">
                <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/5 to-teal-500/5 rounded-2xl blur-xl" />
                <div className="relative p-6 rounded-2xl bg-white/5 border border-white/10 shadow-2xl backdrop-blur-sm">
                  <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-emerald-500/20 rounded-lg">
                        <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                        </svg>
                      </div>
                      <div>
                        <h3 className="text-white font-bold">任务与学习深度概览</h3>
                        <p className="text-gray-500 text-[10px] mt-0.5">已结合 Todo、笔记、视频及日志进行分析</p>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={clearCache} className="text-gray-500 hover:text-red-400 transition-colors p-1.5 rounded-lg hover:bg-white/5" title="清除缓存">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                        </svg>
                      </button>
                      <button onClick={runAnalysis} className="text-gray-500 hover:text-emerald-400 transition-colors p-1.5 rounded-lg hover:bg-white/5" title="重新分析">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M23 4v6h-6" /><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  <AIMarkdown content={taskResult} variant="success" title="全能任务概览" />

                  {taskLoading && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-xs text-emerald-400/60 animate-pulse">
                      <span>AI Analyzing your tasks...</span>
                      <span className="flex gap-1">
                        <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                        <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                        <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce"></span>
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 px-6 rounded-2xl bg-white/5 border border-dashed border-white/10">
                <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8 text-emerald-500/40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </div>
                <h3 className="text-white font-medium mb-2">生成您的全维任务地图</h3>
                <p className="text-gray-500 text-xs mb-6 max-w-xs mx-auto">我们将整合您的 Todo、个人笔记、学习日志和视频收藏，为您规划出最清晰的任务和学习路径。</p>
                <button
                  onClick={runAnalysis}
                  disabled={taskLoading}
                  className="inline-flex items-center gap-2 px-6 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-500 hover:scale-105 active:scale-95 transition-all disabled:opacity-50 shadow-[0_0_20px_rgba(16,185,129,0.2)]"
                >
                  {taskLoading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M15.5 2H8.6c-.4 0-.8.2-1.1.5-.3.3-.5.7-.5 1.1v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8c.4 0 .8-.2 1.1-.5.3-.3.5-.7.5-1.1V6.5L15.5 2z" /><path d="M3 7.6v12.8c0 .4.2.8.5 1.1.3.3.7.5 1.1.5h9.8" /><path d="M15 2v5h5" />
                    </svg>
                  )}
                  <span>开始全维任务分析</span>
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

export default VideoAnalyzer;
