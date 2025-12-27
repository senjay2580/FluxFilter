import { AI_MODELS, getModelApiKey } from './ai-models';
import { groqApiPool } from './groq-api-pool';

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
  // API Key 相关
  apiKeyId?: string; // 使用的 API Key ID
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const MAX_CHUNK_SIZE = 25 * 1024 * 1024; // 25MB per chunk
const MAX_RETRIES = 3; // 最多重试 3 次
const RETRY_DELAY = 2000; // 重试延迟 2 秒

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

  // 获取特定 API Key 的活跃任务数
  getActiveTasksForApiKey(apiKeyId: string): number {
    return this.activeTasks.filter(t => (t.apiKeyId || 'default') === apiKeyId).length;
  }

  // 订阅状态变化
  subscribe(listener: () => void) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private notify() {
    this._listeners.forEach(l => l());
    
    // 按 API Key 分组统计任务
    const tasksByApiKey = new Map<string, TranscribeTask[]>();
    this.activeTasks.forEach(task => {
      const apiKeyId = task.apiKeyId || 'default';
      if (!tasksByApiKey.has(apiKeyId)) {
        tasksByApiKey.set(apiKeyId, []);
      }
      tasksByApiKey.get(apiKeyId)!.push(task);
    });

    // 发送全局事件
    window.dispatchEvent(new CustomEvent('transcribe-status', {
      detail: {
        status: this.hasActiveTasks ? 'loading' : (this.tasks.some(t => t.status === 'done') ? 'done' : 'idle'),
        tasksCount: this.activeTasks.length,
        tasksByApiKey: Object.fromEntries(tasksByApiKey)
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

  // 带重试的 API 调用
  private async fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = MAX_RETRIES
  ): Promise<Response> {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          signal: AbortSignal.timeout(60000), // 60 秒超时
        });
        
        // 处理速率限制
        if (response.status === 429) {
          const retryAfter = response.headers.get('Retry-After');
          const waitTime = retryAfter ? parseInt(retryAfter) * 1000 : 30000; // 默认等待 30 秒
          
          if (attempt < retries) {
            console.warn(`API 速率限制，${waitTime / 1000} 秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, waitTime));
            continue;
          }
        }
        
        return response;
      } catch (err) {
        const isLastAttempt = attempt === retries;
        const isNetworkError = err instanceof TypeError && 
          (err.message.includes('Failed to fetch') || 
           err.message.includes('ERR_CONNECTION'));
        
        if (isNetworkError && !isLastAttempt) {
          // 网络错误，等待后重试
          const delay = RETRY_DELAY * Math.pow(2, attempt); // 指数退避
          console.warn(`网络错误，${delay / 1000} 秒后重试...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
        
        throw err;
      }
    }
    
    throw new Error('转写请求失败，请检查网络连接');
  }

  // 转写音频文件（后台运行）
  async transcribe(file: File, autoOptimize = false, onComplete?: (task: TranscribeTask) => void, apiKeyId?: string): Promise<string> {
    // 如果没有指定 API Key ID，从池中选择
    let groqKey: string;
    let selectedApiKeyId: string;
    let modelId: string = 'whisper-large-v3'; // 默认模型

    if (apiKeyId) {
      // 使用指定的 API Key
      const apiKeyObj = groqApiPool.getAllApiKeys().find(k => k.id === apiKeyId);
      if (!apiKeyObj) {
        throw new Error('指定的 API Key 不存在');
      }
      groqKey = apiKeyObj.key;
      selectedApiKeyId = apiKeyId;
      modelId = apiKeyObj.modelId || 'whisper-large-v3';
      console.log(`[转写] 使用 API Key: ${apiKeyObj.name}, 模型: ${modelId}`);
    } else {
      // 从池中选择最空闲的 API Key
      const nextKey = groqApiPool.getNextApiKey();
      if (!nextKey) {
        // 如果没有配置 API 池，使用旧的方式（单个 key）
        groqKey = (localStorage.getItem('groq_api_key') || '').trim();
        if (!groqKey) {
          throw new Error('请先配置 Groq API Key');
        }
        selectedApiKeyId = 'default';
      } else {
        groqKey = nextKey.key;
        selectedApiKeyId = nextKey.id;
        modelId = nextKey.modelId || 'whisper-large-v3';
        console.log(`[转写] 自动选择 API Key: ${nextKey.name}, 模型: ${modelId}`);
      }
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
      apiKeyId: selectedApiKeyId,
    };

    this._tasks.set(taskId, task);
    this.notify();

    // 标记 API Key 开始使用
    if (selectedApiKeyId !== 'default') {
      groqApiPool.markApiKeyInUse(selectedApiKeyId);
    }

    // 在后台执行转写（不阻塞）
    this.executeTranscribe(taskId, file, groqKey, modelId, autoOptimize, selectedApiKeyId);

    return taskId;
  }

  // 实际执行转写的方法
  private async executeTranscribe(taskId: string, file: File, groqKey: string, modelId: string, autoOptimize: boolean, apiKeyId?: string) {
    try {
      let rawText = '';
      
      // 检查文件大小，超过 24MB 则分片处理
      if (file.size > MAX_CHUNK_SIZE) {
        rawText = await this.transcribeInChunks(taskId, file, groqKey, modelId);
      } else {
        rawText = await this.transcribeSingleFile(taskId, file, groqKey, modelId);
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
    } finally {
      // 标记 API Key 使用完成
      if (apiKeyId && apiKeyId !== 'default') {
        groqApiPool.markApiKeyDone(apiKeyId);
      }
    }
  }

  // 单文件转写
  private async transcribeSingleFile(taskId: string, file: File, groqKey: string, modelId: string): Promise<string> {
    this.updateTask(taskId, { progress: 20 });

    const formData = new FormData();
    formData.append('file', file);
    formData.append('model', modelId); // 使用传入的模型 ID
    formData.append('language', 'zh');
    formData.append('response_format', 'verbose_json');

    try {
      const response = await this.fetchWithRetry(GROQ_API_URL, {
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
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error('转写超时，请尝试更短的音频或分片处理');
      }
      throw err;
    }
  }

  // 分片转写大文件
  private async transcribeInChunks(taskId: string, file: File, groqKey: string, modelId: string): Promise<string> {
    this.updateTask(taskId, { progress: 5 });
    
    // 获取音频时长
    const duration = await this.getAudioDuration(file);
    
    console.log(`[转写] 开始分片转写，文件: ${file.name}, 大小: ${(file.size / 1024 / 1024).toFixed(2)}MB, 时长: ${(duration / 60).toFixed(1)}分钟`);
    
    // 更大的分片策略：每片最多 10 分钟（600秒），减少分片数量
    // Groq 支持最大 25MB，10分钟音频通常在 10-15MB 左右
    const maxChunkDuration = 600; // 10 分钟
    const chunkCount = Math.ceil(duration / maxChunkDuration);
    const chunkDuration = duration / chunkCount; // 均匀分配
    
    console.log(`[转写] 分片策略: ${chunkCount} 片, 每片约 ${(chunkDuration / 60).toFixed(1)} 分钟`);
    
    this.updateTask(taskId, { progress: 10, totalChunks: chunkCount });
    
    const results: string[] = new Array(chunkCount);
    const errors: string[] = [];
    let completedChunks = 0;
    
    // 串行处理分片，避免速率限制
    for (let i = 0; i < chunkCount; i++) {
      const chunkIndex = i;
      const startTime = chunkIndex * chunkDuration;
      const endTime = Math.min((chunkIndex + 1) * chunkDuration, duration);
      
      try {
        // 切分音频
        console.log(`[转写] 处理分片 ${chunkIndex + 1}/${chunkCount}, 时间: ${(startTime / 60).toFixed(1)}分 - ${(endTime / 60).toFixed(1)}分`);
        
        let chunk: Blob;
        try {
          chunk = await this.sliceAudio(file, startTime, endTime);
        } catch (sliceErr) {
          const errMsg = sliceErr instanceof Error ? sliceErr.message : '音频切分失败';
          console.error(`分片 ${chunkIndex + 1} 切分失败:`, errMsg);
          errors.push(`分片 ${chunkIndex + 1}: ${errMsg}`);
          results[chunkIndex] = '';
          continue;
        }
        
        // 检查分片大小
        if (chunk.size > 25 * 1024 * 1024) {
          const errMsg = `分片过大 (${(chunk.size / 1024 / 1024).toFixed(1)}MB > 25MB)`;
          console.warn(`分片 ${chunkIndex + 1} ${errMsg}，跳过`);
          errors.push(`分片 ${chunkIndex + 1}: ${errMsg}`);
          results[chunkIndex] = '';
          continue;
        }
        
        console.log(`[转写] 分片 ${chunkIndex + 1} 大小: ${(chunk.size / 1024 / 1024).toFixed(2)}MB`);
        
        // 转写分片
        const formData = new FormData();
        formData.append('file', chunk, `chunk_${chunkIndex}.wav`);
        formData.append('model', modelId);
        formData.append('language', 'zh');
        formData.append('response_format', 'verbose_json');

        const response = await this.fetchWithRetry(GROQ_API_URL, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${groqKey}` },
          body: formData,
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          const apiError = errorData.error?.message || `HTTP ${response.status}`;
          
          if (response.status === 401) {
            throw new Error('Groq API Key 无效');
          }
          if (response.status === 429) {
            console.warn(`分片 ${chunkIndex + 1} 遇到速率限制，等待 30 秒后重试...`);
            await new Promise(resolve => setTimeout(resolve, 30000));
            const retryResponse = await this.fetchWithRetry(GROQ_API_URL, {
              method: 'POST',
              headers: { 'Authorization': `Bearer ${groqKey}` },
              body: formData,
            });
            if (retryResponse.ok) {
              const retryData = await retryResponse.json();
              results[chunkIndex] = retryData.text || '';
              completedChunks++;
              console.log(`[转写] 分片 ${chunkIndex + 1} 重试成功`);
            } else {
              errors.push(`分片 ${chunkIndex + 1}: 速率限制重试失败`);
              results[chunkIndex] = '';
            }
            // 更新进度
            const progress = 10 + Math.round((completedChunks / chunkCount) * 80);
            this.updateTask(taskId, { progress, processedChunks: completedChunks, rawText: results.filter(r => r).join('\n') });
            continue;
          }
          
          console.error(`分片 ${chunkIndex + 1} 转写失败:`, apiError);
          errors.push(`分片 ${chunkIndex + 1}: ${apiError}`);
          results[chunkIndex] = '';
          continue;
        }

        const data = await response.json();
        results[chunkIndex] = data.text || '';
        completedChunks++;
        console.log(`[转写] 分片 ${chunkIndex + 1} 完成，文本长度: ${(data.text || '').length}`);
        
        // 实时更新进度和已转写内容
        const progress = 10 + Math.round((completedChunks / chunkCount) * 80);
        const currentText = results.filter(r => r).join('\n');
        this.updateTask(taskId, { progress, processedChunks: completedChunks, rawText: currentText });
        
        // 添加请求间隔，避免速率限制
        if (i < chunkCount - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000));
        }
      } catch (err) {
        const errMsg = err instanceof Error ? err.message : '未知错误';
        console.error(`分片 ${chunkIndex + 1} 处理失败:`, errMsg);
        errors.push(`分片 ${chunkIndex + 1}: ${errMsg}`);
        results[chunkIndex] = '';
        
        // 如果是 API Key 无效，直接抛出错误
        if (errMsg.includes('API Key 无效')) {
          throw err;
        }
      }
    }
    
    this.updateTask(taskId, { progress: 90 });
    
    const finalText = results.filter(r => r).join('\n');
    
    if (!finalText) {
      const errorDetail = errors.length > 0 
        ? `\n错误详情:\n${errors.join('\n')}`
        : '';
      throw new Error(`转写失败：所有 ${chunkCount} 个分片都未能成功转写。${errorDetail}\n\n可能原因：\n1. API 配额已用尽\n2. 音频格式不支持\n3. 网络连接问题\n\n请检查控制台日志获取更多信息。`);
    }
    
    // 如果有部分分片失败，记录警告
    if (completedChunks < chunkCount) {
      console.warn(`[转写] 完成 ${completedChunks}/${chunkCount} 个分片，${chunkCount - completedChunks} 个分片失败`);
    }
    
    return finalText;
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

  // 切分音频 - 使用 Web Audio API 按时间段切分
  private async sliceAudio(file: File, startTime: number, endTime: number): Promise<Blob> {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const arrayBuffer = await file.arrayBuffer();
      
      // 解码音频数据（使用 slice 创建副本避免 detached buffer 问题）
      let audioBuffer: AudioBuffer;
      try {
        audioBuffer = await audioContext.decodeAudioData(arrayBuffer.slice(0));
      } catch (decodeErr) {
        console.error('无法解码音频，尝试直接返回原文件:', decodeErr);
        await audioContext.close();
        // 如果无法解码，且文件小于 25MB，直接返回原文件
        if (file.size <= 25 * 1024 * 1024) {
          return file;
        }
        throw new Error('无法解码音频文件，请尝试转换为 MP3 或 WAV 格式');
      }
      
      const sampleRate = audioBuffer.sampleRate;
      const startSample = Math.floor(startTime * sampleRate);
      const endSample = Math.min(Math.floor(endTime * sampleRate), audioBuffer.length);
      const length = endSample - startSample;
      
      console.log(`[切分] 采样率: ${sampleRate}, 开始样本: ${startSample}, 结束样本: ${endSample}, 长度: ${length}`);
      
      if (length <= 0) {
        console.error('切分长度无效:', { startTime, endTime, startSample, endSample, length });
        await audioContext.close();
        throw new Error('音频切分失败：无效的时间范围');
      }
      
      const numberOfChannels = audioBuffer.numberOfChannels;
      const newBuffer = audioContext.createBuffer(numberOfChannels, length, sampleRate);
      
      for (let channel = 0; channel < numberOfChannels; channel++) {
        const oldData = audioBuffer.getChannelData(channel);
        const newData = newBuffer.getChannelData(channel);
        for (let i = 0; i < length; i++) {
          newData[i] = oldData[startSample + i];
        }
      }
      
      const wavBlob = this.audioBufferToWav(newBuffer);
      await audioContext.close();
      
      console.log(`[切分] 时间: ${(startTime / 60).toFixed(1)}分 - ${(endTime / 60).toFixed(1)}分, 切分后大小: ${(wavBlob.size / 1024 / 1024).toFixed(2)}MB`);
      return wavBlob;
    } catch (err) {
      console.error('音频切分失败:', err);
      throw err;
    }
  }

  // 将 AudioBuffer 转换为 WAV Blob（降采样到 16kHz 单声道以减小文件大小）
  private audioBufferToWav(buffer: AudioBuffer): Blob {
    // 目标：16kHz 单声道，这样 10 分钟音频约 19MB
    const targetSampleRate = 16000;
    const targetChannels = 1;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const originalSampleRate = buffer.sampleRate;
    const ratio = originalSampleRate / targetSampleRate;
    const newLength = Math.floor(buffer.length / ratio);
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = targetChannels * bytesPerSample;
    
    const dataLength = newLength * blockAlign;
    const bufferLength = 44 + dataLength;
    
    const arrayBuffer = new ArrayBuffer(bufferLength);
    const view = new DataView(arrayBuffer);
    
    // WAV 头部
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
    view.setUint16(22, targetChannels, true);
    view.setUint32(24, targetSampleRate, true);
    view.setUint32(28, targetSampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);
    
    // 获取所有声道数据，混合成单声道并降采样
    const channels: Float32Array[] = [];
    for (let i = 0; i < buffer.numberOfChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    
    let offset = 44;
    for (let i = 0; i < newLength; i++) {
      const srcIndex = Math.floor(i * ratio);
      // 混合所有声道
      let sample = 0;
      for (let ch = 0; ch < channels.length; ch++) {
        sample += channels[ch][srcIndex] || 0;
      }
      sample /= channels.length;
      
      // 转换为 16-bit PCM
      sample = Math.max(-1, Math.min(1, sample));
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

  // 获取 API 池统计信息
  getApiPoolStats() {
    return groqApiPool.getStats();
  }

  // 获取所有 API Key
  getAllApiKeys() {
    return groqApiPool.getAllApiKeys();
  }

  // 添加 API Key 到池
  async addApiKey(key: string, name: string, modelId: string = 'whisper-large-v3-turbo'): Promise<string> {
    const id = await groqApiPool.addApiKey(key, name, modelId);
    this.notify();
    return id;
  }

  // 移除 API Key
  async removeApiKey(id: string): Promise<boolean> {
    const result = await groqApiPool.removeApiKey(id);
    if (result) {
      this.notify();
    }
    return result;
  }

  // 切换 API Key 活跃状态
  async toggleApiKeyActive(id: string): Promise<boolean> {
    const result = await groqApiPool.toggleApiKeyActive(id);
    if (result) {
      this.notify();
    }
    return result;
  }

  // 初始化 API 池（从数据库加载）
  async initializeApiPool(): Promise<void> {
    await groqApiPool.initialize();
  }
}

// 全局单例
export const transcribeService = new TranscribeService();
