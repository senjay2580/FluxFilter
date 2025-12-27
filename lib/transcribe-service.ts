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
  // 分块处理相关
  totalChunks?: number;
  processedChunks?: number;
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MAX_CHUNK_SIZE = 20 * 1024 * 1024; // 20MB per chunk

// 全局转写服务
class TranscribeService {
  private _tasks: Map<string, TranscribeTask> = new Map();
  private _listeners: Set<() => void> = new Set();
  private _abortControllers: Map<string, AbortController> = new Map();

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
      let rawText = '';
      
      // 检查文件大小，超过 24MB 则分片处理
      if (file.size > MAX_CHUNK_SIZE) {
        rawText = await this.transcribeInChunks(taskId, file, groqKey);
      } else {
        rawText = await this.transcribeSingleFile(taskId, file, groqKey);
      }

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

  // 单文件转写
  private async transcribeSingleFile(taskId: string, file: File, groqKey: string): Promise<string> {
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
    return data.text || '';
  }

  // 分片转写大文件
  private async transcribeInChunks(taskId: string, file: File, groqKey: string): Promise<string> {
    this.updateTask(taskId, { progress: 5 });
    
    // 获取音频时长
    const duration = await this.getAudioDuration(file);
    
    // 根据文件大小和时长计算每秒字节数，然后确定分片时长
    const bytesPerSecond = file.size / duration;
    // 目标每个分片 15MB（WAV 会膨胀，所以用更小的值）
    const targetChunkSize = 15 * 1024 * 1024;
    // 计算分片时长（秒），最少30秒，最多180秒
    const chunkDuration = Math.max(30, Math.min(180, targetChunkSize / bytesPerSecond / 3)); // 除以3因为WAV膨胀
    
    const chunkCount = Math.ceil(duration / chunkDuration);
    
    this.updateTask(taskId, { progress: 10 });
    
    const results: string[] = [];
    
    for (let i = 0; i < chunkCount; i++) {
      const startTime = i * chunkDuration;
      const endTime = Math.min((i + 1) * chunkDuration, duration);
      
      // 切分音频（降采样到16kHz单声道以减小体积）
      const chunk = await this.sliceAudio(file, startTime, endTime);
      
      // 检查分片大小
      if (chunk.size > 24 * 1024 * 1024) {
        throw new Error(`分片 ${i + 1} 仍然过大 (${(chunk.size / 1024 / 1024).toFixed(1)}MB)，请尝试更短的音频`);
      }
      
      // 转写分片
      const formData = new FormData();
      formData.append('file', chunk, `chunk_${i}.wav`);
      formData.append('model', 'whisper-large-v3');
      formData.append('language', 'zh');
      formData.append('response_format', 'verbose_json');

      const response = await fetch(GROQ_API_URL, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${groqKey}` },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        if (response.status === 401) {
          throw new Error('Groq API Key 无效');
        }
        throw new Error(errorData.error?.message || `转写分片 ${i + 1} 失败`);
      }

      const data = await response.json();
      if (data.text) {
        results.push(data.text);
      }
      
      // 更新进度
      const progress = 10 + Math.round((i + 1) / chunkCount * 80);
      this.updateTask(taskId, { progress });
    }
    
    return results.join('\n');
  }

  // 获取音频时长
  private getAudioDuration(file: File): Promise<number> {
    return new Promise((resolve) => {
      const audio = new Audio();
      audio.preload = 'metadata';
      
      audio.onloadedmetadata = () => {
        URL.revokeObjectURL(audio.src);
        resolve(audio.duration);
      };
      
      audio.onerror = () => {
        URL.revokeObjectURL(audio.src);
        // 如果无法获取时长，按文件大小估算（假设 128kbps）
        const estimatedDuration = (file.size * 8) / (128 * 1024);
        resolve(estimatedDuration);
      };
      
      audio.src = URL.createObjectURL(file);
    });
  }

  // 切分音频（使用 Web Audio API，降采样到16kHz单声道）
  private async sliceAudio(file: File, startTime: number, endTime: number): Promise<Blob> {
    const arrayBuffer = await file.arrayBuffer();
    const audioContext = new AudioContext();
    
    try {
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      const originalSampleRate = audioBuffer.sampleRate;
      
      // 目标采样率 16kHz（Whisper 推荐），单声道
      const targetSampleRate = 16000;
      
      const startSample = Math.floor(startTime * originalSampleRate);
      const endSample = Math.min(Math.floor(endTime * originalSampleRate), audioBuffer.length);
      const originalLength = endSample - startSample;
      
      // 计算重采样后的长度
      const resampledLength = Math.floor(originalLength * targetSampleRate / originalSampleRate);
      
      // 创建单声道、16kHz 的 buffer（虽然不直接使用，但需要用于计算）
      new OfflineAudioContext(1, resampledLength, targetSampleRate);
      
      // 混合所有声道到单声道
      const monoData = new Float32Array(originalLength);
      const numChannels = audioBuffer.numberOfChannels;
      for (let i = 0; i < originalLength; i++) {
        let sum = 0;
        for (let ch = 0; ch < numChannels; ch++) {
          sum += audioBuffer.getChannelData(ch)[startSample + i];
        }
        monoData[i] = sum / numChannels;
      }
      
      // 简单线性重采样
      const resampledData = new Float32Array(resampledLength);
      const ratio = originalLength / resampledLength;
      for (let i = 0; i < resampledLength; i++) {
        const srcIndex = i * ratio;
        const srcIndexFloor = Math.floor(srcIndex);
        const srcIndexCeil = Math.min(srcIndexFloor + 1, originalLength - 1);
        const t = srcIndex - srcIndexFloor;
        resampledData[i] = monoData[srcIndexFloor] * (1 - t) + monoData[srcIndexCeil] * t;
      }
      
      // 编码为 WAV（16kHz 单声道 16bit）
      const wavBlob = this.float32ToWav(resampledData, targetSampleRate);
      return wavBlob;
    } finally {
      await audioContext.close();
    }
  }

  // Float32Array 转 WAV（单声道）
  private float32ToWav(samples: Float32Array, sampleRate: number): Blob {
    const format = 1; // PCM
    const bitDepth = 16;
    const numChannels = 1;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const dataLength = samples.length * blockAlign;
    const bufferLength = 44 + dataLength;
    
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);
    
    // WAV header
    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, bufferLength - 8, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    
    // Write audio data
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      const intSample = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
      view.setInt16(offset, intSample, true);
      offset += 2;
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
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

  // 流式调用 AI（单个文本）
  private async callAIStream(
    text: string,
    config: { apiKey: string; model: { id: string; apiUrl: string; provider: string } },
    signal: AbortSignal,
    onChunk: (title: string, content: string) => void
  ): Promise<{ title: string; content: string }> {
    // 检查文本长度，如果超过 2000 字符，使用并发分块处理
    if (text.length > 2000) {
      return this.callAIStreamWithConcurrentChunks(text, config, signal, onChunk);
    }

    return this.callAISingleStream(text, config, signal, onChunk);
  }

  // 单个文本的流式调用（不分块）
  private async callAISingleStream(
    text: string,
    config: { apiKey: string; model: { id: string; apiUrl: string; provider: string } },
    signal: AbortSignal,
    onChunk: (title: string, content: string) => void
  ): Promise<{ title: string; content: string }> {
    // 如果文本太长，截断到 8000 字符以避免内存溢出
    const maxLength = 8000;
    const processText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;

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
${processText}`;

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
          { role: 'user', content: processText }
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

  // 并发分块处理长文本
  private async callAIStreamWithConcurrentChunks(
    text: string,
    config: { apiKey: string; model: { id: string; apiUrl: string; provider: string } },
    signal: AbortSignal,
    onChunk: (title: string, content: string) => void
  ): Promise<{ title: string; content: string }> {
    // 分块配置
    const chunkSize = 2000;
    const chunks: string[] = [];
    
    // 分块
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }

    // 存储每个分块的结果
    const chunkResults: Map<number, { title?: string; content: string }> = new Map();
    let firstChunkTitle = '';
    let lastUpdateTime = 0;
    let completedChunksCount = 0;

    // 并发处理所有分块（最多 3 个并发）
    const maxConcurrent = 3;
    const promises: Promise<void>[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunkIndex = i;
      const chunkText = chunks[i];

      const promise = (async () => {
        try {
          const result = await this.optimizeChunkStreamWithCallback(
            chunkText,
            chunkIndex,
            chunks.length,
            config,
            signal,
            (partialContent) => {
              // 实时流式回调
              chunkResults.set(chunkIndex, {
                title: chunkIndex === 0 ? firstChunkTitle : undefined,
                content: partialContent,
              });

              // 限制更新频率（每 100ms 最多更新一次）
              const now = Date.now();
              if (now - lastUpdateTime > 100) {
                lastUpdateTime = now;
                const mergedContent = this.mergeChunkResultsInOrder(chunkResults, chunks.length);
                onChunk(firstChunkTitle, mergedContent);
              }
            }
          );

          chunkResults.set(chunkIndex, result);
          
          // 保存第一个分块的标题
          if (chunkIndex === 0) {
            firstChunkTitle = result.title || '';
          }

          // 增加已完成的分块计数
          completedChunksCount++;

          // 只有当所有分块都完成时才更新显示
          if (completedChunksCount === chunks.length) {
            const mergedContent = this.mergeChunkResultsInOrder(chunkResults, chunks.length);
            onChunk(firstChunkTitle, mergedContent);
          }
        } catch (err) {
          console.error(`分块 ${chunkIndex} 处理失败:`, err);
        }
      })();

      promises.push(promise);

      // 控制并发数
      if (promises.length >= maxConcurrent) {
        await Promise.race(promises);
        promises.splice(promises.findIndex(p => p === promise), 1);
      }
    }

    // 等待所有分块完成
    await Promise.all(promises);

    // 返回最终结果
    const finalContent = this.mergeChunkResultsInOrder(chunkResults, chunks.length);
    return {
      title: firstChunkTitle,
      content: finalContent,
    };
  }

  // 优化单个分块（流式）
  private async optimizeChunkStream(
    chunkText: string,
    chunkIndex: number,
    totalChunks: number,
    config: { apiKey: string; model: { id: string; apiUrl: string; provider: string } },
    signal: AbortSignal
  ): Promise<{ title?: string; content: string }> {
    return this.optimizeChunkStreamWithCallback(
      chunkText,
      chunkIndex,
      totalChunks,
      config,
      signal,
      () => {} // 空回调
    );
  }

  // 优化单个分块（流式，带实时回调）
  private async optimizeChunkStreamWithCallback(
    chunkText: string,
    chunkIndex: number,
    totalChunks: number,
    config: { apiKey: string; model: { id: string; apiUrl: string; provider: string } },
    signal: AbortSignal,
    onStreamChunk: (partialContent: string) => void
  ): Promise<{ title?: string; content: string }> {
    const isFirstChunk = chunkIndex === 0;

    const prompt = isFirstChunk
      ? `# 角色
你是一位资深的语音转写文本优化专家。

# 任务
1. 为音频内容生成一个简洁的标题（10字以内）
2. 对语音识别转写的文本进行智能纠错和优化

# 输出格式
第一行：标题（不要加任何前缀）
第二行：空行
第三行开始：优化后的正文内容

# 原文
${chunkText}`
      : `# 角色
你是一位资深的语音转写文本优化专家。

# 任务
对语音识别转写的文本进行智能纠错和优化。这是多部分内容的第 ${chunkIndex + 1}/${totalChunks} 部分。

# 输出格式
直接输出优化后的正文内容，不需要标题

# 原文
${chunkText}`;

    const parseResponse = (fullText: string) => {
      if (isFirstChunk) {
        const lines = fullText.split('\n');
        const title = lines[0]?.trim() || '';
        let contentStartIndex = 1;
        while (contentStartIndex < lines.length && lines[contentStartIndex].trim() === '') {
          contentStartIndex++;
        }
        const content = lines.slice(contentStartIndex).join('\n').trim();
        return { title, content };
      } else {
        return { content: fullText.trim() };
      }
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
          { role: 'user', content: chunkText }
        ],
        temperature: 0.3,
        stream: true,
      }),
      signal,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error?.message || `分块优化失败: ${response.status}`);
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
            // 实时调用回调，传递当前的完整内容
            const parsed = parseResponse(fullText);
            onStreamChunk(parsed.content);
          }
        } catch { /* ignore */ }
      }
    }

    return parseResponse(fullText);
  }

  // 按顺序合并分块结果（避免闪动）
  private mergeChunkResultsInOrder(
    results: Map<number, { title?: string; content: string }>,
    totalChunks: number
  ): string {
    const contents: string[] = [];
    
    // 只合并已完成的分块（按顺序）
    for (let i = 0; i < totalChunks; i++) {
      const result = results.get(i);
      if (result && result.content) {
        contents.push(result.content);
      } else {
        // 如果某个分块还没完成，就停止合并（避免显示不完整的内容）
        break;
      }
    }

    return contents.join('\n\n');
  }

  // 获取分块信息（用于 UI 显示）
  getChunkInfo(text: string): { chunks: string[]; totalChunks: number } {
    const chunkSize = 2000;
    const chunks: string[] = [];
    
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }

    return {
      chunks,
      totalChunks: chunks.length,
    };
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
