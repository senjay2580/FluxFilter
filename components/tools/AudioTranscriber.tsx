import React, { useState, useCallback, useRef, useEffect } from 'react';
import { AI_MODELS, type AIModel, getModelApiKey, setModelApiKey } from '../../lib/ai-models';
import { createPortal } from 'react-dom';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import {
  isSupabaseConfigured,
  getTranscriptHistory,
  createTranscript,
  updateTranscript,
  deleteTranscript,
  getAIConfigs,
  upsertAIConfig
} from '../../lib/supabase';
import { getStoredUserId } from '../../lib/auth';
import { transcribeService, type TranscribeTask } from '../../lib/transcribe-service';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';


// 本地记录类型（兼容旧数据）
interface TranscriptRecord {
  id: string;
  fileName: string;
  rawText: string;
  optimizedText?: string;
  optimizedTitle?: string;
  createdAt: number;
  // 数据库记录的额外字段
  dbId?: number;
}

interface CompareData {
  id: string;
  dbId?: number;
  fileName: string;
  rawText: string;
  oldOptimized?: string;
  oldTitle?: string;
  newOptimized: string;
  newTitle: string;
}

interface TaskData {
  status: 'optimizing' | 'done' | 'error';
  compareData: CompareData;
  error?: string;
}

interface AudioTranscriberProps {
  onNavigate?: (page: string) => void;
  apiKeyId?: string; // 指定使用的 API Key ID
}

const AudioTranscriber: React.FC<AudioTranscriberProps> = ({ onNavigate, apiKeyId }) => {
  const [activeTab, setActiveTab] = useState<'transcribe' | 'history'>('transcribe');
  const [apiKeys, setApiKeys] = useState<any[]>([]);
  const [selectedApiKeyIndex, setSelectedApiKeyIndex] = useState(0);
  const [showApiManager, setShowApiManager] = useState(false);

  // 每个 API Key 的独立转写状态类型
  interface ApiKeyTranscribeState {
    file: File | null;
    isVideoFile: boolean;
    mediaUrl: string | null;
    isPlaying: boolean;
    mediaDuration: number;
    mediaCurrentTime: number;
    transcribing: boolean;
    optimizing: boolean;
    rawResult: string;
    optimizedResult: string;
    optimizedChunks: Array<{ content: string; isChunkEnd: boolean }>;
    error: string;
    progress: number;
    copiedId: string | null;
    currentTaskId: string | null;
  }

  // 默认状态
  const getDefaultApiKeyState = (): ApiKeyTranscribeState => ({
    file: null,
    isVideoFile: false,
    mediaUrl: null,
    isPlaying: false,
    mediaDuration: 0,
    mediaCurrentTime: 0,
    transcribing: false,
    optimizing: false,
    rawResult: '',
    optimizedResult: '',
    optimizedChunks: [],
    error: '',
    progress: 0,
    copiedId: null,
    currentTaskId: null,
  });

  // 为每个 API Key 维护独立的转写状态
  const [transcribeStateByApiKey, setTranscribeStateByApiKey] = useState<Record<string, ApiKeyTranscribeState>>({});

  // 初始化 API 池
  useEffect(() => {
    const initializePool = async () => {
      await transcribeService.initializeApiPool();
      const keys = transcribeService.getAllApiKeys();
      setApiKeys(keys);
      
      // 如果指定了 apiKeyId，找到对应的索引
      if (apiKeyId && keys.length > 0) {
        const index = keys.findIndex(k => k.id === apiKeyId);
        if (index >= 0) {
          setSelectedApiKeyIndex(index);
        }
      }
    };
    initializePool();
  }, [apiKeyId]);

  // 获取当前 API Key 的状态
  // 使用 selectedApiKeyIndex 作为 fallback key，确保在 apiKeys 加载前后状态一致
  const currentApiKeyId = apiKeys.length > 0 
    ? (apiKeys[selectedApiKeyIndex]?.id || `index-${selectedApiKeyIndex}`)
    : `index-${selectedApiKeyIndex}`;
  const currentState = transcribeStateByApiKey[currentApiKeyId] || getDefaultApiKeyState();

  // 更新当前 API Key 状态的辅助函数
  const updateCurrentState = useCallback((updates: Partial<ApiKeyTranscribeState>) => {
    setTranscribeStateByApiKey(prev => ({
      ...prev,
      [currentApiKeyId]: {
        ...(prev[currentApiKeyId] || getDefaultApiKeyState()),
        ...updates,
      },
    }));
  }, [currentApiKeyId]);

  // AI 相关配置 (由全局 SettingsModal 管理，这里引入监听逻辑)
  const [configVersion, setConfigVersion] = useState(0);

  // 监听 storage 事件，当在 SettingsModal 中保存配置时触发更新
  useEffect(() => {
    const handleStorageChange = () => setConfigVersion(v => v + 1);
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const groqKey = localStorage.getItem('groq_api_key') || '';
  const selectedModel = localStorage.getItem('ai_model') || 'deepseek-chat';
  const aiApiKey = getModelApiKey(selectedModel);
  const aiBaseUrl = localStorage.getItem('ai_base_url') || '';
  const customModelName = localStorage.getItem('ai_custom_model') || '';

  // 从 currentState 解构当前 API Key 的状态
  const {
    file,
    isVideoFile,
    mediaUrl,
    isPlaying,
    mediaDuration,
    mediaCurrentTime,
    transcribing,
    optimizing,
    rawResult,
    optimizedResult,
    optimizedChunks,
    error,
    progress,
    copiedId,
    currentTaskId,
  } = currentState;

  // 状态更新函数（使用 updateCurrentState）
  const setFile = useCallback((f: File | null) => updateCurrentState({ file: f }), [updateCurrentState]);
  const setIsVideoFile = useCallback((v: boolean) => updateCurrentState({ isVideoFile: v }), [updateCurrentState]);
  const setMediaUrl = useCallback((url: string | null) => updateCurrentState({ mediaUrl: url }), [updateCurrentState]);
  const setIsPlaying = useCallback((v: boolean) => updateCurrentState({ isPlaying: v }), [updateCurrentState]);
  const setMediaDuration = useCallback((d: number) => updateCurrentState({ mediaDuration: d }), [updateCurrentState]);
  const setMediaCurrentTime = useCallback((t: number) => updateCurrentState({ mediaCurrentTime: t }), [updateCurrentState]);
  const setTranscribing = useCallback((v: boolean) => updateCurrentState({ transcribing: v }), [updateCurrentState]);
  const setOptimizing = useCallback((v: boolean) => updateCurrentState({ optimizing: v }), [updateCurrentState]);
  const setRawResult = useCallback((r: string) => updateCurrentState({ rawResult: r }), [updateCurrentState]);
  const setOptimizedResult = useCallback((r: string) => updateCurrentState({ optimizedResult: r }), [updateCurrentState]);
  const setOptimizedChunks = useCallback((c: Array<{ content: string; isChunkEnd: boolean }>) => updateCurrentState({ optimizedChunks: c }), [updateCurrentState]);
  const setError = useCallback((e: string) => updateCurrentState({ error: e }), [updateCurrentState]);
  const setProgress = useCallback((p: number) => updateCurrentState({ progress: p }), [updateCurrentState]);
  const setCopiedId = useCallback((id: string | null) => updateCurrentState({ copiedId: id }), [updateCurrentState]);
  const setCurrentTaskId = useCallback((id: string | null) => updateCurrentState({ currentTaskId: id }), [updateCurrentState]);

  // 共享状态（历史记录等不按 API Key 分开）
  const [history, setHistory] = useState<TranscriptRecord[]>([]);
  const [viewingRecord, setViewingRecord] = useState<TranscriptRecord | null>(null);

  // 多任务优化状态管理
  const [optimizationTasks, setOptimizationTasks] = useState<Record<string, TaskData>>({});
  const [viewingTaskId, setViewingTaskId] = useState<string | null>(null);

  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const timeUpdateIntervalRef = useRef<number | null>(null);
  const isPlayingRef = useRef(false);

  const currentModel = AI_MODELS.find(m => m.id === selectedModel) || AI_MODELS[0];

  // 加载历史记录（从 Supabase）
  useEffect(() => {
    const loadHistory = async () => {
      const userId = getStoredUserId();
      if (!isSupabaseConfigured || !userId) {
        console.warn('Supabase 未配置或用户未登录');
        return;
      }

      try {
        const data = await getTranscriptHistory(userId);
        // 转换为本地格式
        const records: TranscriptRecord[] = data.map(item => ({
          id: item.id.toString(),
          dbId: item.id,
          fileName: item.file_name,
          rawText: item.raw_text,
          optimizedText: item.optimized_text || undefined,
          optimizedTitle: item.optimized_title || undefined,
          createdAt: new Date(item.created_at).getTime(),
        }));
        setHistory(records);
      } catch (err) {
        console.error('加载历史记录失败:', err);
        setError('加载历史记录失败');
      }
    };
    loadHistory();
  }, []);

  // 保存历史记录
  const saveToHistory = useCallback(async (record: TranscriptRecord) => {
    const userId = getStoredUserId();
    if (!isSupabaseConfigured || !userId) {
      setError('请先登录');
      return;
    }

    try {
      const created = await createTranscript(userId, {
        file_name: record.fileName,
        raw_text: record.rawText,
        optimized_text: record.optimizedText,
        optimized_title: record.optimizedTitle,
        ai_model: record.optimizedText ? selectedModel : undefined,
        file_size: file?.size,
      });
      // 更新本地状态
      const newRecord: TranscriptRecord = {
        ...record,
        id: created.id.toString(),
        dbId: created.id,
      };
      setHistory(prev => [newRecord, ...prev].slice(0, 50));
    } catch (err) {
      console.error('保存到数据库失败:', err);
      setError('保存失败，请重试');
    }
  }, [selectedModel, file]);

  // 删除历史记录
  const deleteFromHistory = useCallback(async (id: string) => {
    const record = history.find(r => r.id === id);
    if (!record?.dbId) return;

    try {
      await deleteTranscript(record.dbId);
      setHistory(prev => prev.filter(r => r.id !== id));
    } catch (err) {
      console.error('删除失败:', err);
      setError('删除失败');
    }
    setDeleteConfirmId(null);
  }, [history]);

  const confirmDelete = useCallback((confirm: boolean) => {
    if (confirm && deleteConfirmId) {
      deleteFromHistory(deleteConfirmId);
    }
    setDeleteConfirmId(null);
  }, [deleteConfirmId, deleteFromHistory]);

  const updateHistoryRecord = useCallback(async (id: string, optimizedText: string, optimizedTitle?: string) => {
    const record = history.find(r => r.id === id);
    if (!record?.dbId) return;

    try {
      await updateTranscript(record.dbId, {
        optimized_text: optimizedText,
        optimized_title: optimizedTitle,
        ai_model: selectedModel,
      });
      setHistory(prev => prev.map(r => r.id === id ? { ...r, optimizedText, optimizedTitle } : r));
    } catch (err) {
      console.error('更新失败:', err);
      setError('更新失败');
    }
  }, [history, selectedModel]);

  // 修改标题
  const handleEditTitle = useCallback(async (record: TranscriptRecord, newTitle: string) => {
    if (!newTitle.trim() || newTitle === (record.optimizedTitle || record.fileName)) {
      setEditingId(null);
      return;
    }

    try {
      // 1. 更新本地状态
      setHistory(prev => prev.map(r =>
        r.id === record.id ? { ...r, optimizedTitle: newTitle.trim() } : r
      ));

      // 2. 更新数据库
      if (isSupabaseConfigured && record.dbId) {
        await updateTranscript(record.dbId, {
          optimized_title: newTitle.trim()
        });
      }
    } catch (err) {
      console.error('更新标题失败:', err);
      setError('更新标题失败，请重试');
    } finally {
      setEditingId(null);
    }
  }, [history]);

  // 流式调用 AI API 进行文本优化
  const callAIApiStream = useCallback(async (
    text: string,
    onChunk: (title: string, content: string) => void
  ): Promise<{ title: string; content: string }> => {
    const prompt = `# 角色
你是一位资深的语音转写文本优化专家，精通中英文语言处理、技术领域术语和语义分析。

# 任务
1. 为音频内容生成一个犀利、简洁、干练的标题，符合内容的语气风格
2. 对语音识别转写的文本进行智能纠错和优化，输出准确、流畅、易读的文本

# 输出格式（严格遵守）
第一行：标题（不要加任何前缀如"标题："）
第二行：空行
第三行开始：优化后的正文内容

# 标题要求
- 简洁有力，10字以内为佳
- 抓住核心主题或亮点
- 符合内容的语气和风格
- 不要使用引号或其他标点包裹

# 核心优化规则

## 1. 智能语义纠错（最重要）
基于上下文语义推断最可能的正确词汇：

### 技术/编程领域常见误识别：
- "web coding" / "webcoding" → "vibe coding"（氛围编程）
- "cursor" → "Cursor"（AI编程工具）
- "kiro" / "kero" → "Kiro"（AI编程工具）
- "copilot" → "Copilot"（GitHub Copilot）
- "chat gpt" / "chatgpt" → "ChatGPT"
- "deepseek" → "DeepSeek"
- "claude" → "Claude"
- "react" → "React"，"vue" → "Vue"，"next" → "Next.js"
- "api" → "API"，"sdk" → "SDK"，"ide" → "IDE"
- "github" → "GitHub"，"gitlab" → "GitLab"
- "vs code" / "vscode" → "VS Code"
- "npm" → "npm"，"yarn" → "Yarn"
- "typescript" → "TypeScript"，"javascript" → "JavaScript"

### 中文同音字/近音字纠错：
- 根据上下文判断：的/地/得、在/再、做/作、以/已 等
- 专业术语：编程/变成、代码/带码、函数/含数 等

### 英文发音相似词纠错：
- 根据技术语境判断最合理的词汇
- 注意大小写规范（专有名词首字母大写）

## 2. 标点符号优化
- 添加逗号、句号、问号、感叹号等
- 使用顿号分隔并列词语
- 引用内容使用引号
- 技术术语可用反引号或保持原样

## 3. 段落结构优化
- 按话题/语义自然分段
- 每段保持主题统一
- 适当使用空行分隔不同话题

## 4. 保真原则
- 保留原文的核心意思和表达风格
- 不添加原文没有的观点或信息
- 不删除有意义的内容
- 口语化表达可适当保留，保持自然

# 原文
${text}

# 输出`;

    // 解析标题和内容
    const parseResponse = (fullText: string): { title: string; content: string } => {
      const lines = fullText.split('\n');
      const title = lines[0]?.trim() || '';
      // 跳过第一行（标题）和可能的空行
      let contentStartIndex = 1;
      while (contentStartIndex < lines.length && lines[contentStartIndex].trim() === '') {
        contentStartIndex++;
      }
      const content = lines.slice(contentStartIndex).join('\n').trim();
      return { title, content };
    };

    const effectiveApiKey = aiApiKey;
    const modelCfg = selectedModel === 'custom' ? {
      id: customModelName || 'custom-model',
      apiUrl: aiBaseUrl,
      provider: 'Custom'
    } : currentModel;

    try {
      // Gemini 流式优化实现
      if (modelCfg.provider === 'Google') {
        // 使用 streamGenerateContent 实现流式
        const streamUrl = `${modelCfg.apiUrl.replace(':generateContent', ':streamGenerateContent')}?alt=sse&key=${effectiveApiKey}`;

        const response = await fetch(streamUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: `标题要求：简洁有力，10字以内为佳
正文要求：智能纠错和优化，输出准确、流畅、易读的文本

转写文本：
${text}`
              }],
            }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error?.message || `Gemini 流式请求失败: ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';

        if (!reader) throw new Error('无法读取响应流');

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          // Gemini SSE 格式通常是 "data: {...}"
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const json = JSON.parse(line.slice(6));
                const delta = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
                if (delta) {
                  fullText += delta;
                  const parsed = parseResponse(fullText);
                  onChunk(parsed.title, parsed.content);
                }
              } catch (e) { /* 忽略不完整的 JSON 块 */ }
            }
          }
        }
        return parseResponse(fullText);
      }

      // OpenAI 兼容格式流式输出
      const response = await fetch(modelCfg.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${effectiveApiKey}`,
        },
        body: JSON.stringify({
          model: modelCfg.id,
          messages: [
            { role: 'system', content: prompt },
            { role: 'user', content: text }
          ],
          temperature: 0.3,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `AI 优化失败: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      if (!reader) {
        throw new Error('无法读取响应流');
      }

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.trim().startsWith('data:'));

        for (const line of lines) {
          const data = line.replace('data:', '').trim();
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content || '';
            if (content) {
              fullText += content;
              const parsed = parseResponse(fullText);
              onChunk(parsed.title, parsed.content);
            }
          } catch {
            // 忽略解析错误
          }
        }
      }

      return parseResponse(fullText);
    } catch (err) {
      console.error('AI 优化请求失败:', err);
      throw err;
    }
  }, [aiApiKey, currentModel, selectedModel, aiBaseUrl, customModelName]);

  // 对历史记录进行 AI 优化（支持多任务并发，后台运行）
  const optimizeHistoryRecord = useCallback(async (record: TranscriptRecord) => {
    if (!aiApiKey) {
      setError('请先配置 AI API Key');
      return;
    }

    // 初始化任务数据
    const initialCompareData: CompareData = {
      id: record.id,
      dbId: record.dbId,
      fileName: record.fileName,
      rawText: record.rawText,
      oldOptimized: record.optimizedText,
      oldTitle: record.optimizedTitle,
      newOptimized: '',
      newTitle: '',
    };

    setOptimizationTasks(prev => ({
      ...prev,
      [record.id]: {
        status: 'optimizing',
        compareData: initialCompareData
      }
    }));

    // 自动打开当前任务的查看窗口
    setViewingTaskId(record.id);
    setError('');

    try {
      // 使用全局转写服务进行优化（后台运行）
      await transcribeService.optimizeText(
        record.id,
        record.rawText,
        record.fileName,
        (title, content) => {
          // 进度回调
          setOptimizationTasks(prev => {
            const currentTask = prev[record.id];
            if (!currentTask) return prev;

            return {
              ...prev,
              [record.id]: {
                ...currentTask,
                compareData: {
                  ...currentTask.compareData,
                  newTitle: title,
                  newOptimized: content
                }
              }
            };
          });
        },
        (title, content) => {
          // 完成回调
          setOptimizationTasks(prev => ({
            ...prev,
            [record.id]: {
              ...prev[record.id],
              status: 'done',
              compareData: {
                ...prev[record.id].compareData,
                newTitle: title,
                newOptimized: content
              }
            }
          }));
        }
      );
    } catch (err) {
      console.error('AI 优化失败:', err);
      const errorMessage = err instanceof Error ? err.message : 'AI 优化失败，请重试';

      setOptimizationTasks(prev => ({
        ...prev,
        [record.id]: {
          ...prev[record.id],
          status: 'error',
          error: errorMessage
        }
      }));

      // 如果当前正在查看该任务，显示全局错误
      if (viewingTaskId === record.id) {
        setError(errorMessage);
      }
    }
  }, [aiApiKey, viewingTaskId]);

  const confirmUseOptimized = useCallback((useNew: boolean) => {
    if (viewingTaskId && optimizationTasks[viewingTaskId]) {
      const task = optimizationTasks[viewingTaskId];
      if (useNew) {
        updateHistoryRecord(task.compareData.id, task.compareData.newOptimized, task.compareData.newTitle);
      }

      // 移除任务或保留（这里选择移除任务状态，结束流程）
      // 如果要保留“已完成”状态供查看，可以不从 state 中删除，只关闭 modal
      const newTasks = { ...optimizationTasks };
      delete newTasks[viewingTaskId];
      setOptimizationTasks(newTasks);
    }
    setViewingTaskId(null);
  }, [viewingTaskId, optimizationTasks, updateHistoryRecord]);

  // 最小化对照窗口（后台继续优化）
  const minimizeCompareModal = useCallback(() => {
    setViewingTaskId(null);
  }, []);

  // 重新打开对照窗口
  const reopenCompareModal = useCallback((id: string) => {
    if (optimizationTasks[id]) {
      setViewingTaskId(id);
    }
  }, [optimizationTasks]);



  // 选择文件（支持音频和视频，Groq 会自动提取音轨）
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      // Groq Whisper 支持的格式：音频(mp3, mp4, mpeg, mpga, m4a, wav, webm) 和视频(mp4, webm, mpeg)
      const validExtensions = ['mp3', 'mp4', 'mpeg', 'mpga', 'm4a', 'wav', 'webm', 'ogg', 'flac'];
      const videoExtensions = ['mp4', 'webm', 'mpeg'];
      const fileExt = selectedFile.name.split('.').pop()?.toLowerCase();

      if (!fileExt || !validExtensions.includes(fileExt)) {
        updateCurrentState({ error: '请选择音频或视频文件（MP3、MP4、WAV、M4A、WebM 等）' });
        return;
      }
      if (selectedFile.size > 500 * 1024 * 1024) {
        updateCurrentState({ error: '文件大小不能超过 500MB' });
        return;
      }
      if (mediaUrl) {
        URL.revokeObjectURL(mediaUrl);
      }
      const isVideo = videoExtensions.includes(fileExt) || selectedFile.type.startsWith('video/');
      // 一次性更新所有状态
      updateCurrentState({
        file: selectedFile,
        isVideoFile: isVideo,
        mediaUrl: URL.createObjectURL(selectedFile),
        isPlaying: false,
        mediaCurrentTime: 0,
        mediaDuration: 0,
        error: '',
        rawResult: '',
        optimizedResult: '',
      });
    }
  }, [mediaUrl, updateCurrentState]);

  // 媒体播放控制
  const togglePlay = useCallback(() => {
    const media = isVideoFile ? videoRef.current : audioRef.current;
    if (media) {
      if (isPlayingRef.current) {
        media.pause();
      } else {
        media.play().catch(err => {
          console.error('播放失败:', err);
          updateCurrentState({ error: '播放失败，请重试' });
        });
      }
    }
  }, [isVideoFile, updateCurrentState]);

  // 每500ms更新一次时间显示，避免频繁渲染
  const startTimeUpdate = useCallback(() => {
    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current);
    }
    const media = isVideoFile ? videoRef.current : audioRef.current;
    if (media) {
      updateCurrentState({ mediaCurrentTime: media.currentTime });
    }
    timeUpdateIntervalRef.current = window.setInterval(() => {
      const media = isVideoFile ? videoRef.current : audioRef.current;
      if (media && isPlayingRef.current) {
        updateCurrentState({ mediaCurrentTime: media.currentTime });
      }
    }, 500);
  }, [isVideoFile, updateCurrentState]);

  const stopTimeUpdate = useCallback(() => {
    if (timeUpdateIntervalRef.current) {
      clearInterval(timeUpdateIntervalRef.current);
      timeUpdateIntervalRef.current = null;
    }
    // 更新最终时间
    const media = isVideoFile ? videoRef.current : audioRef.current;
    if (media) {
      updateCurrentState({ mediaCurrentTime: media.currentTime });
    }
  }, [isVideoFile, updateCurrentState]);

  const handleVideoPlay = useCallback(() => {
    isPlayingRef.current = true;
    updateCurrentState({ isPlaying: true });
    startTimeUpdate();
  }, [startTimeUpdate, updateCurrentState]);

  const handleVideoPause = useCallback(() => {
    isPlayingRef.current = false;
    updateCurrentState({ isPlaying: false });
    stopTimeUpdate();
  }, [stopTimeUpdate, updateCurrentState]);

  const handleAudioPlay = useCallback(() => {
    isPlayingRef.current = true;
    updateCurrentState({ isPlaying: true });
    startTimeUpdate();
  }, [startTimeUpdate, updateCurrentState]);

  const handleAudioPause = useCallback(() => {
    isPlayingRef.current = false;
    updateCurrentState({ isPlaying: false });
    stopTimeUpdate();
  }, [stopTimeUpdate, updateCurrentState]);

  const handleVideoLoadedMetadata = useCallback(() => {
    if (videoRef.current) {
      updateCurrentState({ mediaDuration: videoRef.current.duration });
    }
  }, [updateCurrentState]);

  const handleAudioLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      updateCurrentState({ mediaDuration: audioRef.current.duration });
    }
  }, [updateCurrentState]);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    const media = isVideoFile ? videoRef.current : audioRef.current;
    if (media) {
      media.currentTime = time;
      updateCurrentState({ mediaCurrentTime: time });
    }
  }, [isVideoFile, updateCurrentState]);

  const handleMediaEnded = useCallback(() => {
    isPlayingRef.current = false;
    updateCurrentState({ isPlaying: false, mediaCurrentTime: 0 });
    stopTimeUpdate();
  }, [stopTimeUpdate, updateCurrentState]);

  // 组件卸载时清理
  useEffect(() => {
    return () => {
      if (timeUpdateIntervalRef.current) {
        clearInterval(timeUpdateIntervalRef.current);
      }
    };
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 组件挂载时恢复正在进行的任务状态（按 API Key 隔离）
  useEffect(() => {
    // 获取当前选中的 API Key ID
    const selectedApiKey = apiKeys[selectedApiKeyIndex];
    const matchApiKeyId = selectedApiKey?.id;
    
    const activeTasks = transcribeService.activeTasks;
    if (activeTasks.length > 0) {
      // 只恢复当前 API Key 的转写任务
      const myTasks = activeTasks.filter(t => 
        !t.id.startsWith('opt-') && t.apiKeyId === matchApiKeyId
      );
      
      if (myTasks.length > 0) {
        const latestTask = myTasks[myTasks.length - 1];
        
        const updates: Partial<ApiKeyTranscribeState> = {
          currentTaskId: latestTask.id,
        };
        
        if (latestTask.status === 'transcribing') {
          updates.transcribing = true;
          updates.progress = latestTask.progress;
        } else if (latestTask.status === 'optimizing') {
          updates.optimizing = true;
          if (latestTask.rawText) {
            updates.rawResult = latestTask.rawText;
          }
        }
        
        if (latestTask.rawText) {
          updates.rawResult = latestTask.rawText;
        }
        if (latestTask.optimizedText) {
          updates.optimizedResult = latestTask.optimizedText;
        }
        
        updateCurrentState(updates);
      }
      
      // 恢复历史记录优化任务（这个是共享的，不按 API Key 分）
      const historyOptTasks = activeTasks.filter(t => t.id.startsWith('opt-'));
      historyOptTasks.forEach(task => {
        const parts = task.id.split('-');
        if (parts.length >= 2) {
          const recordId = parts[1];
          setOptimizationTasks(prev => ({
            ...prev,
            [recordId]: {
              status: task.status === 'optimizing' ? 'optimizing' : (task.status === 'done' ? 'done' : 'error'),
              compareData: {
                id: recordId,
                fileName: task.fileName,
                rawText: task.rawText || '',
                newOptimized: task.optimizedText || '',
                newTitle: task.optimizedTitle || '',
              },
              error: task.error
            }
          }));
        }
      });
    }
    
    // 恢复当前 API Key 已完成的任务结果
    const allTasks = transcribeService.tasks;
    const myDoneTasks = allTasks.filter(t => 
      t.status === 'done' && 
      t.rawText && 
      !t.id.startsWith('opt-') &&
      t.apiKeyId === matchApiKeyId
    );
    
    if (myDoneTasks.length > 0 && !rawResult) {
      const latestDone = myDoneTasks[myDoneTasks.length - 1];
      const updates: Partial<ApiKeyTranscribeState> = {};
      if (latestDone.rawText) {
        updates.rawResult = latestDone.rawText;
      }
      if (latestDone.optimizedText) {
        updates.optimizedResult = latestDone.optimizedText;
      }
      if (Object.keys(updates).length > 0) {
        updateCurrentState(updates);
      }
    }
  }, [apiKeys, selectedApiKeyIndex, updateCurrentState, rawResult]);

  // 监听后台转写服务的状态变化（按 API Key 隔离）
  useEffect(() => {
    // 获取当前选中的 API Key ID（用于匹配任务）
    const selectedApiKey = apiKeys[selectedApiKeyIndex];
    const matchApiKeyId = selectedApiKey?.id;
    
    const unsubscribe = transcribeService.subscribe(() => {
      // 只处理当前 API Key 的转写任务
      const myActiveTasks = transcribeService.activeTasks.filter(t => 
        !t.id.startsWith('opt-') && t.apiKeyId === matchApiKeyId
      );
      
      if (myActiveTasks.length > 0) {
        const latestTask = myActiveTasks[myActiveTasks.length - 1];
        
        const updates: Partial<ApiKeyTranscribeState> = {
          progress: latestTask.progress,
        };
        
        // 更新当前任务 ID
        if (!currentTaskId || currentTaskId !== latestTask.id) {
          updates.currentTaskId = latestTask.id;
        }
        
        if (latestTask.rawText) {
          updates.rawResult = latestTask.rawText;
        }
        if (latestTask.optimizedText) {
          updates.optimizedResult = latestTask.optimizedText;
        }
        
        // 更新加载状态
        if (latestTask.status === 'transcribing') {
          updates.transcribing = true;
          updates.optimizing = false;
        } else if (latestTask.status === 'optimizing') {
          updates.transcribing = false;
          updates.optimizing = true;
        }
        
        updateCurrentState(updates);
      }
      
      // 检查当前任务是否完成（只检查当前 API Key 的任务）
      if (currentTaskId && !currentTaskId.startsWith('opt-')) {
        const task = transcribeService.getTask(currentTaskId);
        // 确保任务属于当前 API Key
        if (task && task.apiKeyId === matchApiKeyId) {
          const updates: Partial<ApiKeyTranscribeState> = {};
          if (task.rawText) {
            updates.rawResult = task.rawText;
          }
          if (task.optimizedText) {
            updates.optimizedResult = task.optimizedText;
          }
          if (task.status === 'done' || task.status === 'error') {
            updates.transcribing = false;
            updates.optimizing = false;
            updates.progress = 0;
            if (task.error) {
              updates.error = task.error;
            }
          }
          if (Object.keys(updates).length > 0) {
            updateCurrentState(updates);
          }
        }
      }
      
      // 同步历史记录优化任务状态（共享）
      const allTasks = transcribeService.tasks;
      const historyOptTasks = allTasks.filter(t => t.id.startsWith('opt-'));
      historyOptTasks.forEach(task => {
        const parts = task.id.split('-');
        if (parts.length >= 2) {
          const recordId = parts[1];
          if (task.status === 'optimizing' || task.status === 'done' || task.status === 'error') {
            setOptimizationTasks(prev => {
              const existing = prev[recordId];
              const newStatus = task.status === 'optimizing' ? 'optimizing' : (task.status === 'done' ? 'done' : 'error');
              if (existing && existing.status === newStatus && 
                  existing.compareData.newOptimized === (task.optimizedText || '') &&
                  existing.compareData.newTitle === (task.optimizedTitle || '')) {
                return prev;
              }
              return {
                ...prev,
                [recordId]: {
                  status: newStatus,
                  compareData: {
                    ...existing?.compareData,
                    id: recordId,
                    fileName: task.fileName,
                    rawText: task.rawText || existing?.compareData?.rawText || '',
                    newOptimized: task.optimizedText || '',
                    newTitle: task.optimizedTitle || '',
                  },
                  error: task.error
                }
              };
            });
          }
        }
      });
    });
    return () => { unsubscribe(); };
  }, [apiKeys, selectedApiKeyIndex, currentTaskId, updateCurrentState]);

  // 转写音频（使用后台服务）
  const transcribe = useCallback(async () => {
    if (!file || !groqKey) return;

    updateCurrentState({
      transcribing: true,
      error: '',
      progress: 10,
      rawResult: '',
      optimizedResult: '',
    });

    try {
      // 使用全局转写服务（后台运行）
      const selectedApiKey = apiKeys[selectedApiKeyIndex];
      const taskId = await transcribeService.transcribe(file, false, (task) => {
        // 转写完成后的回调
        updateCurrentState({
          rawResult: task.rawText || '',
          transcribing: false,
          progress: 0,
        });
      }, selectedApiKey?.id);
      updateCurrentState({ currentTaskId: taskId });
    } catch (err) {
      console.error('转写失败:', err);
      updateCurrentState({
        error: err instanceof Error ? err.message : '转写失败，请重试',
        transcribing: false,
        progress: 0,
      });
    }
  }, [file, groqKey, apiKeys, selectedApiKeyIndex, updateCurrentState]);

  // AI 优化（使用后台服务）
  const optimizeWithAI = useCallback(async () => {
    if (!rawResult || !aiApiKey) return;

    updateCurrentState({
      optimizing: true,
      optimizedResult: '',
      error: '',
    });

    try {
      // 使用全局转写服务进行优化（后台运行）
      await transcribeService.optimizeText(
        `current-${Date.now()}`,
        rawResult,
        file?.name || '未知文件',
        (title, content) => {
          // 进度回调 - 实时显示
          updateCurrentState({ optimizedResult: content });
        },
        (title, content) => {
          // 完成回调
          updateCurrentState({
            optimizedResult: content,
            optimizing: false,
          });
        }
      );
    } catch (err) {
      console.error('AI 优化失败:', err);
      updateCurrentState({
        error: err instanceof Error ? err.message : 'AI 优化失败，请重试',
        optimizing: false,
      });
    }
  }, [rawResult, aiApiKey, file, updateCurrentState]);

  // 复制文本
  const copyText = useCallback(async (text: string, id?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (id) {
        updateCurrentState({ copiedId: id });
        setTimeout(() => updateCurrentState({ copiedId: null }), 2000);
      }
    } catch { /* ignore */ }
  }, [updateCurrentState]);

  // 保存结果
  const saveResult = useCallback(() => {
    if (!rawResult) return;
    const record: TranscriptRecord = {
      id: Date.now().toString(),
      fileName: file?.name || '未知文件',
      rawText: rawResult,
      optimizedText: optimizedResult || undefined,
      createdAt: Date.now(),
    };
    saveToHistory(record);
    setActiveTab('history');
  }, [rawResult, optimizedResult, file, saveToHistory]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${d.getMinutes().toString().padStart(2, '0')}`;
  };

  // 配置状态：有API Key=green，有AI模型=amber，都没有=red
  const configStatus = apiKeys.length > 0 && aiApiKey ? 'full' : (apiKeys.length > 0 || aiApiKey ? 'partial' : 'none');

  return (
    <div className="space-y-4 pb-8 max-w-7xl mx-auto">
      {/* 隐藏的音频元素 */}
      {mediaUrl && !isVideoFile && (
        <audio
          ref={audioRef}
          src={mediaUrl}
          onLoadedMetadata={handleAudioLoadedMetadata}
          onEnded={handleMediaEnded}
          onPlay={handleAudioPlay}
          onPause={handleAudioPause}
          className="hidden"
        />
      )}

      {/* API Key 选择 Tab 栏 */}
      {apiKeys.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 border-b border-white/10 overflow-x-auto scrollbar-hide" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {apiKeys.map((apiKey, index) => (
            <button
              key={apiKey.id}
              onClick={() => setSelectedApiKeyIndex(index)}
              className={`px-4 py-2 rounded-lg font-medium transition-all whitespace-nowrap flex items-center gap-2 ${
                selectedApiKeyIndex === index
                  ? 'bg-cyber-lime/20 text-cyber-lime'
                  : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
            >
              <span>{apiKey.name}</span>
              {/* 显示模型类型 */}
              <span className={`text-xs px-1.5 py-0.5 rounded ${
                apiKey.modelId?.includes('turbo') 
                  ? 'bg-amber-500/20 text-amber-400' 
                  : 'bg-blue-500/20 text-blue-400'
              }`}>
                {apiKey.modelId?.includes('turbo') ? 'Turbo' : 'V3'}
              </span>
              {!apiKey.isActive && <span className="text-xs text-red-400">(禁用)</span>}
            </button>
          ))}
        </div>
      )}

      {/* Tab 切换 + 设置按钮 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-2 p-1 bg-white/5 rounded-xl">
          <button
            onClick={() => setActiveTab('transcribe')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${activeTab === 'transcribe' ? 'bg-violet-500/20 text-violet-400' : 'text-gray-400 hover:text-white'
              }`}
          >
            转写
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${activeTab === 'history' ? 'bg-violet-500/20 text-violet-400' : 'text-gray-400 hover:text-white'
              }`}
          >
            历史记录
            {history.length > 0 && (
              <span className="px-1.5 py-0.5 bg-violet-500/30 rounded text-xs">{history.length}</span>
            )}
          </button>
        </div>
        {/* 视频下载跳转按钮 */}
        {onNavigate && (
          <button
            onClick={() => onNavigate('video-downloader')}
            className="p-2.5 rounded-xl transition-all btn-press bg-pink-500/20 hover:bg-pink-500/30 text-pink-400"
            title="视频下载"
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
          </button>
        )}
        {/* 设置状态提示 */}
        <div
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border transition-all ${configStatus === 'full'
            ? ' border-none text-green-400'
            : configStatus === 'partial'
              ? ' border-none text-amber-400'
              : ' border-none text-red-400 animate-pulse'
            }`}
          title={configStatus === 'full' ? 'Groq API 已配置' : configStatus === 'partial' ? '部分 API 已配置' : 'API 未配置'}
        >
          <div className={`w-2 h-2 rounded-full ${configStatus === 'full' ? 'bg-green-500' : configStatus === 'partial' ? 'bg-amber-500' : 'bg-red-500'}`} />

        </div>
      </div>

      {activeTab === 'transcribe' ? (
        <>
          {/* 配置状态提示 */}
          {!groqKey && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-amber-400 text-sm flex items-center gap-3">
              <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
              <div className="flex-1">
                <p className="font-bold">未检测到语音转写配置</p>
                <p className="text-xs opacity-80">请前往首页右上角“设置”中的“AI 服务配置”填写 Groq API Key。</p>
              </div>
            </div>
          )}

          {/* 文件上传区域 */}
          <div
            className={`bg-[#1a2634] rounded-2xl p-6 border-2 border-dashed transition-all cursor-pointer ${file ? 'border-pink-500/50' : 'border-white/10 hover:border-white/30'
              }`}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept="audio/*,video/*"
              onChange={handleFileSelect}
              className="hidden"
            />
            <div className="text-center">
              {file ? (
                <>
                  {file.type.startsWith('video/') ? (
                    <svg className="w-10 h-10 text-pink-400 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18" /><line x1="7" y1="2" x2="7" y2="22" /><line x1="17" y1="2" x2="17" y2="22" /><line x1="2" y1="12" x2="22" y2="12" /><line x1="2" y1="7" x2="7" y2="7" /><line x1="2" y1="17" x2="7" y2="17" /><line x1="17" y1="17" x2="22" y2="17" /><line x1="17" y1="7" x2="22" y2="7" />
                    </svg>
                  ) : (
                    <svg className="w-10 h-10 text-pink-400 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                    </svg>
                  )}
                  <p className="text-white font-medium text-sm">{file.name}</p>
                  <p className="text-gray-500 text-xs mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </>
              ) : (
                <>
                  <svg className="w-10 h-10 text-gray-500 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <p className="text-gray-400 text-sm">点击上传音频或视频文件</p>
                  <p className="text-gray-600 text-xs mt-1">MP3、MP4、WAV、M4A、WebM（最大 500MB）</p>
                </>
              )}
            </div>
          </div>

          {/* 媒体播放器 */}
          {mediaUrl && (
            <div className="bg-[#1a2634] rounded-xl border border-white/10 overflow-hidden">
              {/* 视频预览 */}
              {isVideoFile && (
                <div className="relative aspect-video bg-black">
                  <video
                    ref={videoRef}
                    src={mediaUrl}
                    className="w-full h-full object-contain"
                    onLoadedMetadata={handleVideoLoadedMetadata}
                    onEnded={handleMediaEnded}
                    onPlay={handleVideoPlay}
                    onPause={handleVideoPause}
                    onClick={togglePlay}
                    playsInline
                  />
                  {/* 播放按钮覆盖层 - 使用 opacity 过渡避免闪烁 */}
                  <div
                    className={`absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer transition-opacity duration-200 ${isPlaying ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}
                    onClick={togglePlay}
                  >
                    <div className="w-16 h-16 rounded-full bg-pink-500/80 flex items-center justify-center">
                      <svg className="w-8 h-8 text-white ml-1" viewBox="0 0 24 24" fill="currentColor">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                  </div>
                </div>
              )}

              {/* 控制条 */}
              <div className="p-4">
                <div className="flex items-center gap-3">
                  {/* 播放/暂停按钮 */}
                  <button
                    onClick={togglePlay}
                    className="w-10 h-10 rounded-full bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 flex items-center justify-center transition-all btn-press"
                  >
                    {isPlaying ? (
                      <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg>
                    ) : (
                      <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                    )}
                  </button>

                  {/* 进度条 */}
                  <div className="flex-1">
                    <input
                      type="range"
                      min="0"
                      max={mediaDuration || 100}
                      value={mediaCurrentTime}
                      onChange={handleSeek}
                      className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-400"
                      style={{
                        background: mediaDuration > 0
                          ? `linear-gradient(to right, rgb(244 114 182) ${(mediaCurrentTime / mediaDuration) * 100}%, rgba(255,255,255,0.1) ${(mediaCurrentTime / mediaDuration) * 100}%)`
                          : 'rgba(255,255,255,0.1)'
                      }}
                    />
                  </div>

                  {/* 时间显示 */}
                  <span className="text-gray-400 text-xs font-mono min-w-[70px] text-right">
                    {formatDuration(mediaCurrentTime)} / {mediaDuration > 0 ? formatDuration(mediaDuration) : '--:--'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
              <span>{error}</span>
            </div>
          )}

          {/* 转写按钮 */}
          <button
            onClick={transcribe}
            disabled={!file || !groqKey || transcribing}
            className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 btn-press ${file && groqKey && !transcribing
              ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white'
              : 'bg-white/5 text-gray-500 cursor-not-allowed'
              }`}
          >
            {transcribing ? (
              <>
                <svg className="w-5 h-5 animate-spin-smooth" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span>转写中... {progress}%</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
                </svg>
                <span>开始转写</span>
              </>
            )}
          </button>

          {/* 转写结果 */}
          {rawResult && (
            <div className="bg-[#1a2634] rounded-2xl border border-white/10 overflow-hidden animate-list-item">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <span className="text-white font-medium text-sm">原始转写</span>
                <div className="flex items-center gap-2">
                  {/* AI 优化图标按钮 */}
                  {aiApiKey && (
                    <button
                      onClick={optimizeWithAI}
                      disabled={optimizing}
                      className={`p-2 rounded-lg transition-all btn-press ${optimizing ? 'text-gray-500 cursor-not-allowed' : 'text-violet-400 hover:bg-violet-500/20'}`}
                      title={optimizing ? `${currentModel.name} 优化中...` : `AI 优化（${currentModel.name}）`}
                    >
                      {optimizing ? (
                        <svg className="w-4 h-4 animate-spin-smooth" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                      ) : (
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                        </svg>
                      )}
                    </button>
                  )}
                  {/* 保存图标按钮 */}
                  <button
                    onClick={saveResult}
                    className="p-2 rounded-lg text-cyber-lime hover:bg-cyber-lime/20 transition-all btn-press"
                    title="保存到历史记录"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                      <polyline points="17 21 17 13 7 13 7 21" /><polyline points="7 3 7 8 15 8" />
                    </svg>
                  </button>
                  {/* 复制按钮 */}
                  <button
                    onClick={() => copyText(rawResult, 'raw')}
                    className={`p-2 rounded-lg transition-all btn-press ${copiedId === 'raw' ? 'bg-green-500/20 text-green-400' : 'text-gray-400 hover:bg-white/10 hover:text-white'}`}
                    title={copiedId === 'raw' ? '已复制' : '复制'}
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="p-4 max-h-40 overflow-y-auto">
                <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{rawResult}</p>
              </div>
            </div>
          )}

          {/* 优化后结果 */}
          {optimizedResult && (
            <div className="bg-[#1a2634] rounded-2xl border border-violet-500/30 overflow-hidden animate-list-item">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-violet-500/10">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                  <span className="text-violet-400 font-medium text-sm">AI 优化结果</span>
                </div>
                <button
                  onClick={() => copyText(optimizedResult, 'optimized')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all btn-press ${copiedId === 'optimized' ? 'bg-green-500/20 text-green-400' : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                    }`}
                >
                  {copiedId === 'optimized' ? '已复制' : '复制'}
                </button>
              </div>
              <div className="p-4 max-h-64 overflow-y-auto optimized-content">
                <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {optimizedResult}
                </div>
              </div>
            </div>
          )}
        </>
      ) : (
        /* 历史记录 Tab */
        <div className="space-y-3">
          {error && activeTab === 'history' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
              <span>{error}</span>
            </div>
          )}

          {history.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
              </svg>
              <p>暂无历史记录</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {history.map((record, index) => {
                const task = optimizationTasks[record.id];
                const isOptimizingThis = task && task.status === 'optimizing';
                const hasTask = !!task;

                // 是否显示顶部状态条：任务正在进行，或者任务已完成且有结果
                const hasBackgroundOptimization = hasTask && (isOptimizingThis || (task.status === 'done'));

                return (
                  <div
                    key={record.id}
                    className={`bg-[#1a2634] rounded-xl border overflow-hidden animate-list-item card-hover ${hasBackgroundOptimization ? 'border-violet-500/50' : 'border-white/10'
                      }`}
                    style={{ animationDelay: `${index * 50}ms` }}
                  >
                    {/* 后台优化状态条 */}
                    {hasBackgroundOptimization && (
                      <div
                        onClick={() => reopenCompareModal(record.id)}
                        className="px-3 py-2 bg-violet-500/10 border-b border-violet-500/30 flex items-center justify-between cursor-pointer hover:bg-violet-500/20 transition-all"
                      >
                        <div className="flex items-center gap-2">
                          {isOptimizingThis ? (
                            <>
                              <svg className="w-3.5 h-3.5 animate-spin text-violet-400" viewBox="0 0 24 24" fill="none">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                              <span className="text-violet-400 text-xs">AI 优化中...</span>
                            </>
                          ) : task.status === 'error' ? (
                            <>
                              <svg className="w-3.5 h-3.5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                              <span className="text-red-400 text-xs">优化失败: {task.error}</span>
                            </>
                          ) : (
                            <>
                              <svg className="w-3.5 h-3.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M20 6L9 17l-5-5" />
                              </svg>
                              <span className="text-green-400 text-xs">优化完成，点击查看</span>
                            </>
                          )}
                        </div>
                        <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </div>
                    )}

                    <div className="p-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 group">
                            {editingId === record.id ? (
                              <input
                                autoFocus
                                type="text"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onBlur={() => handleEditTitle(record, editingTitle)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleEditTitle(record, editingTitle);
                                  if (e.key === 'Escape') setEditingId(null);
                                }}
                                className="bg-black/40 border border-cyber-lime/50 rounded px-2 py-0.5 text-sm text-white focus:outline-none w-full"
                                onClick={(e) => e.stopPropagation()}
                              />
                            ) : (
                              <div
                                className="flex items-center gap-1.5 cursor-pointer hover:text-cyber-lime transition-colors truncate"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingId(record.id);
                                  setEditingTitle(record.optimizedTitle || record.fileName);
                                }}
                              >
                                <p className="text-white text-sm font-medium truncate inherit-color">
                                  {record.optimizedTitle || record.fileName}
                                </p>
                                <svg className="w-3 h-3 text-gray-400 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                </svg>
                              </div>
                            )}
                            <span className={`px-1.5 py-0.5 text-xs rounded flex-shrink-0 ${record.optimizedText ? 'bg-violet-500/20 text-violet-400' : 'bg-gray-500/20 text-gray-400'}`}>
                              {record.optimizedText ? 'AI' : '原文'}
                            </span>
                          </div>
                          <p className="text-gray-500 text-[10px] mt-0.5">{formatTime(record.createdAt)}</p>
                        </div>
                        <button
                          onClick={() => setDeleteConfirmId(record.id)}
                          className="p-1.5 hover:bg-red-500/20 rounded-lg text-gray-500 hover:text-red-400 transition-all"
                        >
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                      <div
                        onClick={() => hasBackgroundOptimization ? reopenCompareModal(record.id) : setViewingRecord(record)}
                        className="cursor-pointer hover:bg-white/5 rounded-lg p-1 -mx-1 transition-all"
                      >
                        <p className="text-gray-400 text-xs line-clamp-3">{record.optimizedText || record.rawText}</p>
                      </div>
                      <div className="flex gap-2 mt-3">
                        <button
                          onClick={() => copyText(record.optimizedText || record.rawText, record.id)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all btn-press ${copiedId === record.id ? 'bg-green-500/20 text-green-400' : 'bg-white/5 hover:bg-white/10 text-gray-400'
                            }`}
                        >
                          {copiedId === record.id ? '已复制' : '复制'}
                        </button>
                        {aiApiKey && !hasBackgroundOptimization && (
                          <button
                            onClick={() => optimizeHistoryRecord(record)}
                            disabled={isOptimizingThis}
                            className={`px-3 py-1.5 rounded-lg text-xs transition-all btn-press flex items-center gap-1 ${isOptimizingThis
                              ? 'bg-gray-500/10 text-gray-500 cursor-not-allowed'
                              : 'bg-violet-500/20 hover:bg-violet-500/30 text-violet-400'
                              }`}
                          >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                            </svg>
                            <span>{record.optimizedText ? '重新优化' : 'AI优化'}</span>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 查看详情弹窗 */}
      {viewingRecord && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-backdrop-in" onClick={() => setViewingRecord(null)} />
          <div className="relative bg-cyber-dark border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-modal-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-5 h-5 text-pink-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="text-white font-medium truncate">
                  {viewingRecord.optimizedTitle || viewingRecord.fileName}
                </span>
                <span className={`px-1.5 py-0.5 text-xs rounded flex-shrink-0 ${viewingRecord.optimizedText ? 'bg-violet-500/20 text-violet-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  {viewingRecord.optimizedText ? 'AI' : '原文'}
                </span>
              </div>
              <button onClick={() => setViewingRecord(null)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5">
              {/* 显示文件名（如果有AI标题则显示原文件名） */}
              {viewingRecord.optimizedTitle && (
                <p className="text-gray-500 text-xs mb-3">原文件：{viewingRecord.fileName}</p>
              )}

              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {viewingRecord.optimizedText ? (
                    <>
                      <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                      <span className="text-violet-400 text-sm font-medium">AI 优化内容</span>
                    </>
                  ) : (
                    <span className="text-gray-400 text-sm font-medium">原始转写</span>
                  )}
                </div>
                <button
                  onClick={() => copyText(viewingRecord.optimizedText || viewingRecord.rawText, viewingRecord.id + '-view')}
                  className={`px-2.5 py-1 rounded-lg text-xs transition-all btn-press ${copiedId === viewingRecord.id + '-view' ? 'bg-green-500/20 text-green-400' : 'bg-white/5 hover:bg-white/10 text-gray-400'}`}
                >
                  {copiedId === viewingRecord.id + '-view' ? '已复制' : '复制'}
                </button>
              </div>
              <div className={`rounded-xl p-4 ${viewingRecord.optimizedText ? 'bg-violet-500/5 border border-violet-500/20' : 'bg-white/5 border border-white/10'}`}>
                <div className="text-gray-200 text-sm leading-relaxed whitespace-pre-wrap">
                  {viewingRecord.optimizedText || viewingRecord.rawText}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex gap-3">
              {aiApiKey && (
                <button
                  onClick={() => { optimizeHistoryRecord(viewingRecord); setViewingRecord(null); }}
                  className="flex-1 py-2.5 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-sm font-medium transition-all btn-press flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                  {viewingRecord.optimizedText ? '重新优化' : 'AI 优化'}
                </button>
              )}
              <button
                onClick={() => { setDeleteConfirmId(viewingRecord.id); setViewingRecord(null); }}
                className="px-4 py-2.5 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium transition-all btn-press"
              >
                删除
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirmId && (
        <DeleteConfirmModal
          onConfirm={() => confirmDelete(true)}
          onCancel={() => confirmDelete(false)}
        />
      )}

      {/* AI 优化对照弹窗 - 基于 viewingTaskId 显示内容 */}
      {viewingTaskId && optimizationTasks[viewingTaskId] && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-backdrop-in" onClick={minimizeCompareModal} />
          <div className="relative bg-cyber-dark border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-modal-in">
            {(() => {
              const task = optimizationTasks[viewingTaskId];
              const { compareData, status } = task;
              const isOptimizing = status === 'optimizing';

              return (
                <>
                  <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <svg className="w-5 h-5 text-violet-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                      <span className="text-white font-medium flex-shrink-0">AI 优化对照</span>
                      {isOptimizing && (
                        <span className="flex items-center gap-1.5 text-violet-400 text-sm flex-shrink-0">
                          <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                          生成中...
                        </span>
                      )}
                      {task.error && (
                        <span className="flex items-center gap-1.5 text-red-400 text-sm flex-shrink-0">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></svg>
                          {task.error}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {/* 最小化按钮 */}
                      <button
                        onClick={minimizeCompareModal}
                        className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all"
                        title="最小化到后台"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                        </svg>
                      </button>
                      {/* 关闭按钮 */}
                      <button
                        onClick={() => confirmUseOptimized(false)}
                        className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all"
                        title="关闭并放弃"
                      >
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* AI 生成的标题 */}
                  {compareData.newTitle && (
                    <div className="px-5 py-3 border-b border-white/10 bg-violet-500/5">
                      <div className="flex items-center gap-2 mb-1">
                        <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 7V4h16v3M9 20h6M12 4v16" />
                        </svg>
                        <span className="text-violet-400 text-xs">AI 生成标题</span>
                      </div>
                      <p className="text-white font-medium">{compareData.newTitle}</p>
                    </div>
                  )}

                  <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-2 gap-0 md:gap-4 p-4">
                    <div className="flex flex-col min-h-0 mb-4 md:mb-0">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <span className="text-gray-400 text-sm font-medium">原文</span>
                      </div>
                      <div className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4 overflow-y-auto">
                        <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{compareData.rawText}</p>
                      </div>
                    </div>

                    <div className="flex flex-col min-h-0">
                      <div className="flex items-center gap-2 mb-2 px-1">
                        <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                        <span className="text-violet-400 text-sm font-medium">AI 优化内容</span>
                        {compareData.oldOptimized && (
                          <span className="text-amber-400 text-xs bg-amber-500/10 px-2 py-0.5 rounded">将覆盖旧版本</span>
                        )}
                      </div>
                      <div className="flex-1 bg-violet-500/5 border border-violet-500/20 rounded-xl p-4 overflow-y-auto">
                        {compareData.newOptimized ? (
                          <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">{compareData.newOptimized}</p>
                        ) : (
                          <div className="flex items-center justify-center h-full text-gray-500">
                            <svg className="w-6 h-6 animate-spin mr-2" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            正在生成...
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="px-5 py-4 border-t border-white/10 flex gap-3">
                    <button
                      onClick={minimizeCompareModal}
                      className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 text-sm font-medium transition-all btn-press flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M8 3v3a2 2 0 0 1-2 2H3m18 0h-3a2 2 0 0 1-2-2V3m0 18v-3a2 2 0 0 1 2-2h3M3 16h3a2 2 0 0 1 2 2v3" />
                      </svg>
                      后台运行
                    </button>
                    <button
                      onClick={() => confirmUseOptimized(true)}
                      disabled={isOptimizing || !compareData.newOptimized}
                      className="flex-1 py-2.5 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-sm font-medium transition-all btn-press flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
                      {compareData.oldOptimized ? '覆盖保存' : '保存优化结果'}
                    </button>
                  </div>
                </>
              )
            })()}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AudioTranscriber;