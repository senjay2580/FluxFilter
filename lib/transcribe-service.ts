import { AI_MODELS, getModelApiKey } from './ai-models';

// 转写任务类型
export interface TranscribeTask {
  id: string;
  fileName: string;
  status: 'pending' | 'transcribing' | 'optimizing' | 'done' | 'error';
  progress: number;
  rawText?: string;
  optimizedText?: string;
  optimizedTitle?: string;
  error?: string;
  createdAt: number;
  file?: File; // 保存文件引用
  autoOptimize?: boolean;
  // 用于保存到数据库的回调
  onComplete?: (task: TranscribeTask) => void;
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

// 全局转写服务
class TranscribeService {
  private _tasks: Map<string, TranscribeTask> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _abortControllers: Map<string, AbortController> = new Map();
  private _processingQueue: boolean = false;

  get tasks(): TranscribeTask[] {
    return Array.from(this._tasks.values());
  }

  get activeTasks(): TranscribeTask[] {
    return this.tasks.filter(t => t.status === 'pending' || t.status === 'transcribing' || t.status === 'optimizing');
  }

  get hasActiveTasks(): boolean {
    return this.activeTasks.length > 0;
  }

  // 订阅状态变化
  subscribe(listener: () => void) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private notify() {
    this._listeners.forEach(l => l());
    // 发送全局事件
    window.dispatchEvent(new CustomEvent('transcribe-status', {
      detail: {
        status: this.hasActiveTasks ? 'loading' : (this.tasks.some(t => t.status === 'done') ? 'done' : 'idle'),
        tasksCount: this.activeTasks.length
      }
    }));
  }

  private updateTask(id: string, updates: Partial<TranscribeTask>) {
    const task = this._tasks.get(id);
    if (task) {
      Object.assign(task, updates);
      this.notify();
    }
  }

  // 获取 AI 配置
  private getAIConfig() {
    const modelId = localStorage.getItem('ai_model') || 'deepseek-chat';
    const key = getModelApiKey(modelId);
    if (!key) return null;

    if (modelId === 'custom') {
      const baseUrl = localStorage.getItem('ai_base_url') || '';
      if (!baseUrl) return null;
      return {
        apiKey: key,
        model: {
          id: localStorage.getItem('ai_custom_model') || 'custom-model',
          name: '自定义模型',
          provider: 'Custom',
          apiUrl: baseUrl
        },
      };
    }

    const model = AI_MODELS.find(m => m.id === modelId) || AI_MODELS[0];
    return { apiKey: key, model };
  }

  // 转写音频文件（后台运行）
  async transcribe(file: File, autoOptimize = false, onComplete?: (task: TranscribeTask) => void): Promise<string> {
    const groqKey = (localStorage.getItem('groq_api_key') || '').trim();
    if (!groqKey) {
      throw new Error('请先配置 Groq API Key');
    }

    const taskId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const task: TranscribeTask = {
      id: taskId,
      fileName: file.name,
      status: 'transcribing',
      progress: 10,
      createdAt: Date.now(),
      file,
      autoOptimize,
      onComplete,
    };

    this._tasks.set(taskId, task);
    this.notify();

    // 在后台执行转写（不阻塞）
    this.executeTranscribe(taskId, file, groqKey, autoOptimize);

    return taskId;
  }

  // 实际执行转写的方法
  private async executeTranscribe(taskId: string, file: File, groqKey: string, autoOptimize: boolean) {
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'zh');
      formData.append('response_format', 'verbose_json');

      this.updateTask(taskId, { progress: 30 });

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}` },
        body: formData,
      });

      this.updateTask(taskId, { progress: 80 });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          throw new Error('Groq API Key 无效');
        }
        throw new Error(errorData.error?.message || `转写失败: ${response.status}`);
      }

      const data = await response.json();
      const rawText = data.text || '';

      this.updateTask(taskId, { progress: 100, rawText });

      // 自动优化
      if (autoOptimize && rawText) {
        await this.optimizeTask(taskId, rawText);
      } else {
        this.updateTask(taskId, { status: 'done' });
        // 调用完成回调
        const task = this._tasks.get(taskId);
        if (task?.onComplete) {
          task.onComplete(task);
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '转写失败';
      this.updateTask(taskId, { status: 'error', error: errorMessage });
    }
  }

  // AI 优化任务
  async optimizeTask(taskId: string, text?: string): Promise<void> {
    const task = this._tasks.get(taskId);
    if (!task) return;

    const textToOptimize = text || task.rawText;
    if (!textToOptimize) return;

    const config = this.getAIConfig();
    if (!config) {
      this.updateTask(taskId, { status: 'error', error: '请先配置 AI API Key' });
      return;
    }

    this.updateTask(taskId, { status: 'optimizing', optimizedText: '', optimizedTitle: '' });

    const abortController = new AbortController();
    this._abortControllers.set(taskId, abortController);

    try {
      const result = await this.callAIStream(textToOptimize, config, abortController.signal, (title, content) => {
        this.updateTask(taskId, { optimizedTitle: title, optimizedText: content });
      });

      this.updateTask(taskId, {
        status: 'done',
        optimizedTitle: result.title,
        optimizedText: result.content
      });

      // 调用完成回调
      const updatedTask = this._tasks.get(taskId);
      if (updatedTask?.onComplete) {
        updatedTask.onComplete(updatedTask);
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.updateTask(taskId, { status: 'done' });
        return;
      }
      const errorMessage = err instanceof Error ? err.message : 'AI 优化失败';
      this.updateTask(taskId, { status: 'error', error: errorMessage });
    } finally {
      this._abortControllers.delete(taskId);
    }
  }

  // 单独优化文本（用于历史记录优化）
  async optimizeText(
    recordId: string,
    text: string,
    fileName: string,
    onProgress?: (title: string, content: string) => void,
    onComplete?: (title: string, content: string) => void
  ): Promise<string> {
    const config = this.getAIConfig();
    if (!config) {
      throw new Error('请先配置 AI API Key');
    }

    const taskId = `opt-${recordId}-${Date.now()}`;
    const task: TranscribeTask = {
      id: taskId,
      fileName,
      status: 'optimizing',
      progress: 0,
      rawText: text,
      createdAt: Date.now(),
    };

    this._tasks.set(taskId, task);
    this.notify();

    const abortController = new AbortController();
    this._abortControllers.set(taskId, abortController);

    try {
      const result = await this.callAIStream(text, config, abortController.signal, (title, content) => {
        this.updateTask(taskId, { optimizedTitle: title, optimizedText: content });
        onProgress?.(title, content);
      });

      this.updateTask(taskId, {
        status: 'done',
        optimizedTitle: result.title,
        optimizedText: result.content
      });

      onComplete?.(result.title, result.content);
      return taskId;
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        this.updateTask(taskId, { status: 'done' });
        return taskId;
      }
      const errorMessage = err instanceof Error ? err.message : 'AI 优化失败';
      this.updateTask(taskId, { status: 'error', error: errorMessage });
      throw err;
    } finally {
      this._abortControllers.delete(taskId);
    }
  }

  // 流式调用 AI
  private async callAIStream(
    text: string,
    config: { apiKey: string; model: { id: string; apiUrl: string; provider: string } },
    signal: AbortSignal,
    onChunk: (title: string, content: string) => void
  ): Promise<{ title: string; content: string }> {
    const prompt = `# 角色
你是一位资深的语音转写文本优化专家。

# 任务
1. 为音频内容生成一个简洁的标题（10字以内）
2. 对语音识别转写的文本进行智能纠错和优化

# 输出格式
第一行：标题（不要加任何前缀）
第二行：空行
第三行开始：优化后的正文内容

# 原文
${text}`;

    const parseResponse = (fullText: string) => {
      const lines = fullText.split('\n');
      const title = lines[0]?.trim() || '';
      let contentStartIndex = 1;
      while (contentStartIndex < lines.length && lines[contentStartIndex].trim() === '') {
        contentStartIndex++;
      }
      const content = lines.slice(contentStartIndex).join('\n').trim();
      return { title, content };
    };

    const { apiKey, model } = config;

    const response = await fetch(model.apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model.id,
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `AI 优化失败: ${response.status}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error('无法读取响应流');

    const decoder = new TextDecoder();
    let fullText = '';

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
        } catch { /* ignore */ }
      }
    }

    return parseResponse(fullText);
  }

  // 取消任务
  cancelTask(taskId: string) {
    const controller = this._abortControllers.get(taskId);
    if (controller) {
      controller.abort();
    }
  }

  // 移除任务
  removeTask(taskId: string) {
    this.cancelTask(taskId);
    this._tasks.delete(taskId);
    this.notify();
  }

  // 获取任务
  getTask(taskId: string): TranscribeTask | undefined {
    return this._tasks.get(taskId);
  }
}

// 全局单例
export const transcribeService = new TranscribeService();
