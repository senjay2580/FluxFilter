import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// AI 模型配置
interface AIModel {
  id: string;
  name: string;
  provider: string;
  apiUrl: string;
  keyPrefix?: string;
}

const AI_MODELS: AIModel[] = [
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'DeepSeek', apiUrl: 'https://api.deepseek.com/chat/completions', keyPrefix: 'sk-' },
  { id: 'deepseek-reasoner', name: 'DeepSeek R1', provider: 'DeepSeek', apiUrl: 'https://api.deepseek.com/chat/completions', keyPrefix: 'sk-' },
  { id: 'glm-4-flash', name: 'GLM-4 Flash', provider: '智谱AI', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
  { id: 'glm-4-plus', name: 'GLM-4 Plus', provider: '智谱AI', apiUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions' },
  { id: 'qwen-turbo', name: 'Qwen Turbo', provider: '通义千问', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', keyPrefix: 'sk-' },
  { id: 'qwen-plus', name: 'Qwen Plus', provider: '通义千问', apiUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions', keyPrefix: 'sk-' },
  { id: 'moonshot-v1-8k', name: 'Moonshot v1', provider: 'Kimi', apiUrl: 'https://api.moonshot.cn/v1/chat/completions', keyPrefix: 'sk-' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'Google', apiUrl: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent', keyPrefix: 'AIza' },
];

interface TranscriptRecord {
  id: string;
  fileName: string;
  rawText: string;
  optimizedText?: string;
  createdAt: number;
}

interface CompareData {
  id: string;
  fileName: string;
  rawText: string;
  oldOptimized?: string;
  newOptimized: string;
}

const AudioTranscriber: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'transcribe' | 'history'>('transcribe');
  const [groqKey, setGroqKey] = useState(() => localStorage.getItem('groq_api_key') || '');
  const [aiApiKey, setAiApiKey] = useState(() => localStorage.getItem('ai_api_key') || '');
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem('ai_model') || 'deepseek-chat');
  const [file, setFile] = useState<File | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioCurrentTime, setAudioCurrentTime] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [optimizingId, setOptimizingId] = useState<string | null>(null);
  const [rawResult, setRawResult] = useState('');
  const [optimizedResult, setOptimizedResult] = useState('');
  const [error, setError] = useState('');
  const [progress, setProgress] = useState(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [history, setHistory] = useState<TranscriptRecord[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [viewingRecord, setViewingRecord] = useState<TranscriptRecord | null>(null);
  const [compareData, setCompareData] = useState<CompareData | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  // Settings modal temp state
  const [tempGroqKey, setTempGroqKey] = useState('');
  const [tempAiKey, setTempAiKey] = useState('');
  const [tempModel, setTempModel] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const currentModel = AI_MODELS.find(m => m.id === selectedModel) || AI_MODELS[0];

  // 加载历史记录
  useEffect(() => {
    const saved = localStorage.getItem('transcript_history');
    if (saved) {
      try {
        setHistory(JSON.parse(saved));
      } catch { /* ignore */ }
    }
  }, []);

  // 保存历史记录
  const saveToHistory = useCallback((record: TranscriptRecord) => {
    setHistory(prev => {
      const updated = [record, ...prev].slice(0, 50);
      localStorage.setItem('transcript_history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // 删除历史记录
  const deleteFromHistory = useCallback((id: string) => {
    setHistory(prev => {
      const updated = prev.filter(r => r.id !== id);
      localStorage.setItem('transcript_history', JSON.stringify(updated));
      return updated;
    });
    setDeleteConfirmId(null);
  }, []);

  const confirmDelete = useCallback((confirm: boolean) => {
    if (confirm && deleteConfirmId) {
      deleteFromHistory(deleteConfirmId);
    }
    setDeleteConfirmId(null);
  }, [deleteConfirmId, deleteFromHistory]);

  const updateHistoryRecord = useCallback((id: string, optimizedText: string) => {
    setHistory(prev => {
      const updated = prev.map(r => r.id === id ? { ...r, optimizedText } : r);
      localStorage.setItem('transcript_history', JSON.stringify(updated));
      return updated;
    });
  }, []);

  // 流式调用 AI API 进行文本优化
  const callAIApiStream = useCallback(async (
    text: string, 
    onChunk: (chunk: string) => void
  ): Promise<string> => {
    const prompt = `# 角色
你是一位资深的语音转写文本优化专家，精通中英文语言处理、技术领域术语和语义分析。

# 任务
对语音识别转写的文本进行智能纠错和优化，输出准确、流畅、易读的文本。

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

# 输出
直接输出优化后的纯文本，不要添加任何解释、标记、前缀或后缀。`;

    // Gemini 不支持流式，直接返回
    if (currentModel.provider === 'Google') {
      const response = await fetch(`${currentModel.apiUrl}?key=${aiApiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.3 }
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `AI 优化失败: ${response.status}`);
      }
      const data = await response.json();
      const result = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      onChunk(result);
      return result;
    }

    // OpenAI 兼容格式流式输出 (DeepSeek, GLM, Qwen, Moonshot)
    const response = await fetch(currentModel.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aiApiKey}`,
      },
      body: JSON.stringify({
        model: currentModel.id,
        messages: [{ role: 'user', content: prompt }],
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
            onChunk(fullText);
          }
        } catch {
          // 忽略解析错误
        }
      }
    }

    return fullText;
  }, [aiApiKey, currentModel]);

  // 对历史记录进行 AI 优化
  const optimizeHistoryRecord = useCallback(async (record: TranscriptRecord) => {
    if (!aiApiKey) {
      setError('请先配置 AI API Key');
      return;
    }

    setOptimizingId(record.id);
    setError('');

    setCompareData({
      id: record.id,
      fileName: record.fileName,
      rawText: record.rawText,
      oldOptimized: record.optimizedText,
      newOptimized: '',
    });

    try {
      await callAIApiStream(record.rawText, (chunk) => {
        setCompareData(prev => prev ? { ...prev, newOptimized: chunk } : null);
      });
    } catch (err) {
      console.error('AI 优化失败:', err);
      setError(err instanceof Error ? err.message : 'AI 优化失败，请重试');
      setCompareData(null);
    } finally {
      setOptimizingId(null);
    }
  }, [aiApiKey, callAIApiStream]);

  const confirmUseOptimized = useCallback((useNew: boolean) => {
    if (useNew && compareData) {
      updateHistoryRecord(compareData.id, compareData.newOptimized);
    }
    setCompareData(null);
  }, [compareData, updateHistoryRecord]);

  // 保存设置
  const saveSettings = useCallback(() => {
    if (tempGroqKey) {
      setGroqKey(tempGroqKey);
      localStorage.setItem('groq_api_key', tempGroqKey);
    }
    if (tempAiKey) {
      setAiApiKey(tempAiKey);
      localStorage.setItem('ai_api_key', tempAiKey);
    }
    if (tempModel) {
      setSelectedModel(tempModel);
      localStorage.setItem('ai_model', tempModel);
    }
    setShowSettingsModal(false);
  }, [tempGroqKey, tempAiKey, tempModel]);

  // 打开设置弹窗
  const openSettingsModal = useCallback(() => {
    setTempGroqKey(groqKey);
    setTempAiKey(aiApiKey);
    setTempModel(selectedModel);
    setShowSettingsModal(true);
  }, [groqKey, aiApiKey, selectedModel]);

  // 选择文件
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      const validTypes = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/m4a', 'audio/webm', 'audio/mp4', 'video/mp4', 'video/webm'];
      if (!validTypes.some(type => selectedFile.type.includes(type.split('/')[1]))) {
        setError('请选择音频文件（MP3、WAV、M4A、WebM）');
        return;
      }
      if (selectedFile.size > 25 * 1024 * 1024) {
        setError('文件大小不能超过 25MB');
        return;
      }
      if (audioUrl) {
        URL.revokeObjectURL(audioUrl);
      }
      setFile(selectedFile);
      setAudioUrl(URL.createObjectURL(selectedFile));
      setIsPlaying(false);
      setAudioCurrentTime(0);
      setAudioDuration(0);
      setError('');
      setRawResult('');
      setOptimizedResult('');
    }
  }, [audioUrl]);

  // 音频播放控制
  const togglePlay = useCallback(() => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

  const handleTimeUpdate = useCallback(() => {
    if (audioRef.current) {
      setAudioCurrentTime(audioRef.current.currentTime);
    }
  }, []);

  const handleLoadedMetadata = useCallback(() => {
    if (audioRef.current) {
      setAudioDuration(audioRef.current.duration);
    }
  }, []);

  const handleSeek = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setAudioCurrentTime(time);
    }
  }, []);

  const handleAudioEnded = useCallback(() => {
    setIsPlaying(false);
  }, []);

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 转写音频
  const transcribe = useCallback(async () => {
    if (!file || !groqKey) return;

    setTranscribing(true);
    setError('');
    setProgress(10);
    setRawResult('');
    setOptimizedResult('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'zh');
      formData.append('response_format', 'verbose_json');

      setProgress(30);

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}` },
        body: formData,
      });

      setProgress(80);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `请求失败: ${response.status}`);
      }

      const data = await response.json();
      setProgress(100);
      setRawResult(data.text || '');
    } catch (err) {
      console.error('转写失败:', err);
      setError(err instanceof Error ? err.message : '转写失败，请重试');
    } finally {
      setTranscribing(false);
      setProgress(0);
    }
  }, [file, groqKey]);

  // AI 优化
  const optimizeWithAI = useCallback(async () => {
    if (!rawResult || !aiApiKey) return;

    setOptimizing(true);
    setOptimizedResult('');
    setError('');

    try {
      await callAIApiStream(rawResult, (chunk) => {
        setOptimizedResult(chunk);
      });
    } catch (err) {
      console.error('AI 优化失败:', err);
      setError(err instanceof Error ? err.message : 'AI 优化失败，请重试');
    } finally {
      setOptimizing(false);
    }
  }, [rawResult, aiApiKey, callAIApiStream]);

  // 复制文本
  const copyText = useCallback(async (text: string, id?: string) => {
    try {
      await navigator.clipboard.writeText(text);
      if (id) {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
      }
    } catch { /* ignore */ }
  }, []);

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

  const isConfigured = groqKey && aiApiKey;

  return (
    <div className="space-y-4 pb-8">
      {/* 隐藏的 audio 元素 */}
      {audioUrl && (
        <audio
          ref={audioRef}
          src={audioUrl}
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={handleLoadedMetadata}
          onEnded={handleAudioEnded}
        />
      )}

      {/* Tab 切换 + 设置按钮 */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-2 p-1 bg-white/5 rounded-xl">
          <button
            onClick={() => setActiveTab('transcribe')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all ${
              activeTab === 'transcribe' ? 'bg-violet-500/20 text-violet-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            转写
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1.5 ${
              activeTab === 'history' ? 'bg-violet-500/20 text-violet-400' : 'text-gray-400 hover:text-white'
            }`}
          >
            历史记录
            {history.length > 0 && (
              <span className="px-1.5 py-0.5 bg-violet-500/30 rounded text-xs">{history.length}</span>
            )}
          </button>
        </div>
        {/* 设置按钮 */}
        <button
          onClick={openSettingsModal}
          className={`p-2.5 rounded-xl transition-all btn-press ${
            isConfigured 
              ? 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white' 
              : 'bg-amber-500/20 text-amber-400 animate-pulse'
          }`}
          title="API 配置"
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
            <circle cx="12" cy="12" r="3"/>
          </svg>
        </button>
      </div>

      {activeTab === 'transcribe' ? (
        <>
          {/* 配置状态提示 */}
          {!groqKey && (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 text-amber-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              <span>请先点击右上角设置按钮配置 Groq API Key</span>
            </div>
          )}

          {/* 文件上传区域 */}
          <div 
            className={`bg-[#1a2634] rounded-2xl p-6 border-2 border-dashed transition-all cursor-pointer ${
              file ? 'border-pink-500/50' : 'border-white/10 hover:border-white/30'
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
                  <svg className="w-10 h-10 text-pink-400 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/>
                  </svg>
                  <p className="text-white font-medium text-sm">{file.name}</p>
                  <p className="text-gray-500 text-xs mt-1">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                </>
              ) : (
                <>
                  <svg className="w-10 h-10 text-gray-500 mx-auto mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
                  </svg>
                  <p className="text-gray-400 text-sm">点击上传音频文件</p>
                  <p className="text-gray-600 text-xs mt-1">MP3、WAV、M4A（最大 25MB）</p>
                </>
              )}
            </div>
          </div>

          {/* 音频播放器 */}
          {audioUrl && audioDuration > 0 && (
            <div className="bg-[#1a2634] rounded-xl p-4 border border-white/10">
              <div className="flex items-center gap-3">
                {/* 播放/暂停按钮 */}
                <button
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-full bg-pink-500/20 hover:bg-pink-500/30 text-pink-400 flex items-center justify-center transition-all btn-press"
                >
                  {isPlaying ? (
                    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg>
                  ) : (
                    <svg className="w-5 h-5 ml-0.5" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  )}
                </button>
                
                {/* 进度条 */}
                <div className="flex-1">
                  <input
                    type="range"
                    min="0"
                    max={audioDuration || 0}
                    value={audioCurrentTime}
                    onChange={handleSeek}
                    className="w-full h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-pink-400"
                    style={{
                      background: `linear-gradient(to right, rgb(244 114 182) ${(audioCurrentTime / audioDuration) * 100}%, rgba(255,255,255,0.1) ${(audioCurrentTime / audioDuration) * 100}%)`
                    }}
                  />
                </div>
                
                {/* 时间显示 */}
                <span className="text-gray-400 text-xs font-mono min-w-[70px] text-right">
                  {formatDuration(audioCurrentTime)} / {formatDuration(audioDuration)}
                </span>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              <span>{error}</span>
            </div>
          )}

          {/* 转写按钮 */}
          <button 
            onClick={transcribe} 
            disabled={!file || !groqKey || transcribing}
            className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 btn-press ${
              file && groqKey && !transcribing 
                ? 'bg-gradient-to-r from-pink-500 to-rose-500 text-white' 
                : 'bg-white/5 text-gray-500 cursor-not-allowed'
            }`}
          >
            {transcribing ? (
              <>
                <svg className="w-5 h-5 animate-spin-smooth" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                </svg>
                <span>转写中... {progress}%</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
                  <line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>
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
                <button 
                  onClick={() => copyText(rawResult, 'raw')} 
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all btn-press ${
                    copiedId === 'raw' ? 'bg-green-500/20 text-green-400' : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  {copiedId === 'raw' ? '已复制' : '复制'}
                </button>
              </div>
              <div className="p-4 max-h-40 overflow-y-auto">
                <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{rawResult}</p>
              </div>
            </div>
          )}

          {/* AI 优化按钮 */}
          {rawResult && aiApiKey && (
            <button 
              onClick={optimizeWithAI} 
              disabled={optimizing}
              className={`w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 btn-press ${
                !optimizing 
                  ? 'bg-gradient-to-r from-blue-500 to-violet-500 text-white' 
                  : 'bg-white/5 text-gray-500 cursor-not-allowed'
              }`}
            >
              {optimizing ? (
                <>
                  <svg className="w-5 h-5 animate-spin-smooth" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                  </svg>
                  <span>{currentModel.name} 优化中...</span>
                </>
              ) : (
                <>
                  <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  <span>✨ AI 优化（{currentModel.name}）</span>
                </>
              )}
            </button>
          )}

          {/* 优化后结果 */}
          {optimizedResult && (
            <div className="bg-[#1a2634] rounded-2xl border border-violet-500/30 overflow-hidden animate-list-item">
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-violet-500/10">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                  </svg>
                  <span className="text-violet-400 font-medium text-sm">AI 优化结果</span>
                </div>
                <button 
                  onClick={() => copyText(optimizedResult, 'optimized')} 
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-all btn-press ${
                    copiedId === 'optimized' ? 'bg-green-500/20 text-green-400' : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white'
                  }`}
                >
                  {copiedId === 'optimized' ? '已复制' : '复制'}
                </button>
              </div>
              <div className="p-4 max-h-64 overflow-y-auto">
                <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">{optimizedResult}</p>
              </div>
            </div>
          )}

          {/* 保存按钮 */}
          {rawResult && (
            <button 
              onClick={saveResult} 
              className="w-full py-3 rounded-xl font-medium transition-all flex items-center justify-center gap-2 btn-press bg-cyber-lime/20 hover:bg-cyber-lime/30 text-cyber-lime border border-cyber-lime/30"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
              <span>保存到历史记录</span>
            </button>
          )}
        </>
      ) : (
        /* 历史记录 Tab */
        <div className="space-y-3">
          {error && activeTab === 'history' && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-red-400 text-sm flex items-center gap-2">
              <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></svg>
              <span>{error}</span>
            </div>
          )}

          {history.length === 0 ? (
            <div className="text-center py-10 text-gray-500">
              <svg className="w-12 h-12 mx-auto mb-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                <polyline points="14 2 14 8 20 8"/>
              </svg>
              <p>暂无历史记录</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {history.map((record, index) => (
                <div 
                  key={record.id} 
                  className="bg-[#1a2634] rounded-xl border border-white/10 overflow-hidden animate-list-item card-hover" 
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  <div className="p-3">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-white text-sm font-medium truncate">{record.fileName}</p>
                          <span className={`px-1.5 py-0.5 text-xs rounded ${record.optimizedText ? 'bg-violet-500/20 text-violet-400' : 'bg-gray-500/20 text-gray-400'}`}>
                            {record.optimizedText ? 'AI' : '原文'}
                          </span>
                        </div>
                        <p className="text-gray-500 text-xs">{formatTime(record.createdAt)}</p>
                      </div>
                      <button 
                        onClick={() => setDeleteConfirmId(record.id)} 
                        className="p-1.5 hover:bg-red-500/20 rounded-lg text-gray-500 hover:text-red-400 transition-all"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                    <div 
                      onClick={() => setViewingRecord(record)} 
                      className="cursor-pointer hover:bg-white/5 rounded-lg p-1 -mx-1 transition-all"
                    >
                      <p className="text-gray-400 text-xs line-clamp-3">{record.optimizedText || record.rawText}</p>
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button 
                        onClick={() => copyText(record.optimizedText || record.rawText, record.id)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition-all btn-press ${
                          copiedId === record.id ? 'bg-green-500/20 text-green-400' : 'bg-white/5 hover:bg-white/10 text-gray-400'
                        }`}
                      >
                        {copiedId === record.id ? '已复制' : '复制'}
                      </button>
                      {aiApiKey && (
                        <button 
                          onClick={() => optimizeHistoryRecord(record)}
                          disabled={optimizingId === record.id}
                          className={`px-3 py-1.5 rounded-lg text-xs transition-all btn-press flex items-center gap-1 ${
                            optimizingId === record.id 
                              ? 'bg-violet-500/10 text-violet-400 cursor-wait' 
                              : 'bg-violet-500/20 hover:bg-violet-500/30 text-violet-400'
                          }`}
                        >
                          {optimizingId === record.id ? (
                            <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                          ) : (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                            </svg>
                          )}
                          <span>{record.optimizedText ? '重新优化' : 'AI优化'}</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 设置弹窗 */}
      {showSettingsModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-backdrop-in" onClick={() => setShowSettingsModal(false)} />
          <div className="relative bg-cyber-dark border border-white/10 rounded-2xl w-full max-w-md animate-modal-in">
            {/* 头部 */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <span className="text-white font-medium">API 配置</span>
              </div>
              <button onClick={() => setShowSettingsModal(false)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            
            {/* 内容 */}
            <div className="p-5 space-y-5">
              {/* Groq API Key */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white text-sm font-medium">Groq API Key</label>
                  {groqKey && <span className="text-green-400 text-xs">✓ 已配置</span>}
                </div>
                <input 
                  type="password" 
                  value={tempGroqKey}
                  onChange={(e) => setTempGroqKey(e.target.value)}
                  placeholder="gsk_xxx..." 
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-pink-500/50"
                />
                <p className="text-gray-500 text-xs mt-1.5">
                  用于语音转写，访问 <a href="https://console.groq.com" target="_blank" rel="noopener noreferrer" className="text-cyber-lime hover:underline">console.groq.com</a> 获取
                </p>
              </div>

              {/* 分隔线 */}
              <div className="border-t border-white/10" />

              {/* AI 模型选择 */}
              <div>
                <label className="text-white text-sm font-medium mb-2 block">AI 优化模型</label>
                <select 
                  value={tempModel}
                  onChange={(e) => setTempModel(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-violet-500/50 appearance-none cursor-pointer"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%239ca3af'%3E%3Cpath stroke-linecap='round' stroke-linejoin='round' stroke-width='2' d='M19 9l-7 7-7-7'%3E%3C/path%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center', backgroundSize: '16px' }}
                >
                  {AI_MODELS.map(model => (
                    <option key={model.id} value={model.id} className="bg-cyber-dark">
                      {model.name} ({model.provider})
                    </option>
                  ))}
                </select>
              </div>

              {/* AI API Key */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white text-sm font-medium">AI API Key</label>
                  {aiApiKey && <span className="text-green-400 text-xs">✓ 已配置</span>}
                </div>
                <input 
                  type="password" 
                  value={tempAiKey}
                  onChange={(e) => setTempAiKey(e.target.value)}
                  placeholder={AI_MODELS.find(m => m.id === tempModel)?.keyPrefix ? `${AI_MODELS.find(m => m.id === tempModel)?.keyPrefix}xxx...` : 'API Key'} 
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-violet-500/50"
                />
                <div className="text-gray-500 text-xs mt-1.5">
                  <span>获取 API Key：</span>
                  <div className="flex flex-wrap gap-x-2 gap-y-1 mt-1">
                    <a href="https://platform.deepseek.com" target="_blank" rel="noopener noreferrer" className="text-cyber-lime hover:underline">DeepSeek</a>
                    <a href="https://open.bigmodel.cn" target="_blank" rel="noopener noreferrer" className="text-cyber-lime hover:underline">智谱AI</a>
                    <a href="https://dashscope.console.aliyun.com" target="_blank" rel="noopener noreferrer" className="text-cyber-lime hover:underline">通义千问</a>
                    <a href="https://platform.moonshot.cn" target="_blank" rel="noopener noreferrer" className="text-cyber-lime hover:underline">Kimi</a>
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-cyber-lime hover:underline">Gemini</a>
                  </div>
                </div>
              </div>
            </div>

            {/* 底部按钮 */}
            <div className="px-5 py-4 border-t border-white/10 flex gap-3">
              <button 
                onClick={() => setShowSettingsModal(false)} 
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 text-sm font-medium transition-all btn-press"
              >
                取消
              </button>
              <button 
                onClick={saveSettings}
                className="flex-1 py-2.5 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-sm font-medium transition-all btn-press"
              >
                保存
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 查看详情弹窗 */}
      {viewingRecord && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-backdrop-in" onClick={() => setViewingRecord(null)} />
          <div className="relative bg-cyber-dark border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col animate-modal-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-2 min-w-0">
                <svg className="w-5 h-5 text-pink-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/>
                  <polyline points="14 2 14 8 20 8"/>
                </svg>
                <span className="text-white font-medium truncate">{viewingRecord.fileName}</span>
                <span className={`px-1.5 py-0.5 text-xs rounded flex-shrink-0 ${viewingRecord.optimizedText ? 'bg-violet-500/20 text-violet-400' : 'bg-gray-500/20 text-gray-400'}`}>
                  {viewingRecord.optimizedText ? 'AI' : '原文'}
                </span>
              </div>
              <button onClick={() => setViewingRecord(null)} className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all">
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  {viewingRecord.optimizedText ? (
                    <>
                      <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
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
                <p className="text-gray-200 text-sm whitespace-pre-wrap leading-relaxed">
                  {viewingRecord.optimizedText || viewingRecord.rawText}
                </p>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex gap-3">
              {aiApiKey && (
                <button 
                  onClick={() => { optimizeHistoryRecord(viewingRecord); setViewingRecord(null); }}
                  className="flex-1 py-2.5 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-sm font-medium transition-all btn-press flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
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

      {/* AI 优化对照弹窗 */}
      {compareData && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-backdrop-in" onClick={() => !optimizingId && confirmUseOptimized(false)} />
          <div className="relative bg-cyber-dark border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col animate-modal-in">
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <svg className="w-5 h-5 text-violet-400 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                <span className="text-white font-medium flex-shrink-0">AI 优化对照</span>
                {optimizingId && (
                  <span className="flex items-center gap-1.5 text-violet-400 text-sm flex-shrink-0">
                    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                    </svg>
                    生成中...
                  </span>
                )}
              </div>
              <button 
                onClick={() => !optimizingId && confirmUseOptimized(false)} 
                disabled={!!optimizingId}
                className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all disabled:opacity-50 flex-shrink-0"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
              </button>
            </div>
            
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
                  <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
                  <span className="text-violet-400 text-sm font-medium">AI 优化结果</span>
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
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                      </svg>
                      正在生成...
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex gap-3">
              <button 
                onClick={() => confirmUseOptimized(false)} 
                disabled={!!optimizingId}
                className="flex-1 py-2.5 rounded-xl bg-white/5 hover:bg-white/10 text-gray-400 text-sm font-medium transition-all btn-press disabled:opacity-50"
              >
                取消
              </button>
              <button 
                onClick={() => confirmUseOptimized(true)}
                disabled={!!optimizingId || !compareData.newOptimized}
                className="flex-1 py-2.5 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-sm font-medium transition-all btn-press flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5"/></svg>
                {compareData.oldOptimized ? '覆盖保存' : '保存优化结果'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default AudioTranscriber;