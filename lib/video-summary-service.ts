/**
 * 视频总结服务
 * 使用用户配置的 AI 模型对视频字幕进行总结
 * 支持流式输出
 */

import { AI_MODELS, type AIModel, getModelApiKey } from './ai-models';

export interface VideoSummaryResult {
  summary: string;
  keyPoints: string[];
  outline?: {
    title: string;
    timestamp?: number;
    content: string;
  }[];
}

// 生成总结的提示词
const SUMMARY_PROMPT = `你是一位专业的视频内容分析师。请根据以下视频字幕内容，生成结构化的视频总结。

要求：
1. 总结要简洁精炼，抓住核心要点
2. 提取3-5个关键要点
3. 如果内容有明显的章节结构，请列出章节大纲

请以JSON格式输出，包含以下字段：
{
  "summary": "视频核心内容总结（100-200字）",
  "keyPoints": ["要点1", "要点2", "要点3"],
  "outline": [
    {"title": "章节标题", "content": "章节内容概述"}
  ]
}

只输出JSON，不要其他内容。`;

/**
 * 获取 AI 配置
 */
function getAIConfig(): { apiKey: string; model: AIModel | { id: string; name: string; provider: string; apiUrl: string } } | null {
  const modelId = localStorage.getItem('ai_model') || 'deepseek-chat';
  const key = getModelApiKey(modelId);
  if (!key) return null;

  if (modelId === 'custom') {
    const baseUrl = localStorage.getItem('ai_base_url') || '';
    if (!baseUrl) return null;
    return {
      apiKey: key,
      model: { id: localStorage.getItem('ai_custom_model') || 'custom-model', name: '自定义模型', provider: 'Custom', apiUrl: baseUrl },
    };
  }

  const model = AI_MODELS.find(m => m.id === modelId) || AI_MODELS[0];
  return { apiKey: key, model };
}


/**
 * 检查是否为 Gemini 模型
 */
function isGeminiModel(modelId: string): boolean {
  return modelId.startsWith('gemini');
}

/**
 * 解析 AI 返回的 JSON
 */
function parseAIResponse(text: string): VideoSummaryResult {
  // 尝试提取 JSON
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        summary: parsed.summary || text,
        keyPoints: parsed.keyPoints || [],
        outline: parsed.outline || [],
      };
    } catch { /* ignore */ }
  }
  
  // 解析失败，返回原文作为总结
  return {
    summary: text,
    keyPoints: [],
    outline: [],
  };
}

/**
 * 流式生成视频总结
 * @param subtitleText 完整的字幕文本
 * @param videoTitle 视频标题
 * @param onChunk 每次收到新内容时的回调
 * @param signal AbortSignal 用于取消请求
 */
export async function generateVideoSummaryStream(
  subtitleText: string,
  videoTitle: string | undefined,
  onChunk: (text: string, done: boolean) => void,
  signal?: AbortSignal
): Promise<{ success: boolean; data?: VideoSummaryResult; error?: string }> {
  const config = getAIConfig();
  if (!config) {
    return { success: false, error: '请先在设置中配置 AI 模型和 API Key' };
  }

  const { apiKey, model } = config;
  
  // 限制字幕长度
  const maxLength = 15000;
  const truncatedText = subtitleText.length > maxLength 
    ? subtitleText.slice(0, maxLength) + '\n...(内容过长已截断)'
    : subtitleText;

  const contextPrompt = videoTitle 
    ? `视频标题：${videoTitle}\n\n${SUMMARY_PROMPT}`
    : SUMMARY_PROMPT;

  let fullContent = '';

  try {
    if (isGeminiModel(model.id)) {
      // Gemini 不支持流式，直接请求
      const response = await fetch(`${model.apiUrl}?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${contextPrompt}\n\n视频字幕内容：\n${truncatedText}` }] }],
          generationConfig: { temperature: 0.7 },
        }),
        signal,
      });

      if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
      const data = await response.json();
      fullContent = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      onChunk(fullContent, true);
    } else {
      // OpenAI 兼容 API 流式请求
      const response = await fetch(model.apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: model.id,
          messages: [
            { role: 'system', content: contextPrompt },
            { role: 'user', content: `请总结以下视频字幕内容：\n\n${truncatedText}` },
          ],
          temperature: 0.7,
          stream: true,
        }),
        signal,
      });

      if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let buffer = '';

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
                onChunk(fullContent, false);
              }
            } catch { /* ignore */ }
          }
        }
      }
      
      onChunk(fullContent, true);
    }

    const result = parseAIResponse(fullContent);
    return { success: true, data: result };
  } catch (err) {
    if ((err as Error).name === 'AbortError') {
      return { success: false, error: '已取消' };
    }
    return { success: false, error: (err as Error).message || '生成总结失败' };
  }
}

/**
 * 检查是否已配置 AI
 */
export function isAIConfigured(): boolean {
  return getAIConfig() !== null;
}
