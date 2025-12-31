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
const SUMMARY_PROMPT = `你是一位专业的视频内容分析师。我会给你一段视频的字幕文本（可能是离散的、碎片化的口语内容），请你：

## 任务
1. 首先理解并整合这些离散的字幕片段，还原完整的内容逻辑
2. 生成结构化的视频总结

## 输出格式要求（严格按此JSON格式输出）
{
  "summary": "【一句话概括】用1-2句话概括视频的核心主题和价值（30字以内）\n\n【内容摘要】将视频的主要内容整理成流畅、连贯的段落（150-250字），要求：\n- 消除口语化表达，转为书面语\n- 按逻辑顺序组织内容\n- 保留关键信息和数据",
  "keyPoints": [
    "💡 要点1：简洁描述（控制在20字以内）",
    "🔑 要点2：简洁描述",
    "⭐ 要点3：简洁描述",
    "📌 要点4：简洁描述（如有）",
    "🎯 要点5：简洁描述（如有）"
  ],
  "outline": [
    {"title": "章节1标题", "content": "该部分讲述的核心内容（1-2句话）"},
    {"title": "章节2标题", "content": "该部分讲述的核心内容"}
  ]
}

## 注意事项
- keyPoints 提取3-5个最重要的要点，每个要点前加上合适的emoji图标
- outline 根据内容自然分段，如果视频内容较短或结构不明显，可以省略
- 所有内容使用中文
- 只输出JSON，不要其他任何内容`;

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
