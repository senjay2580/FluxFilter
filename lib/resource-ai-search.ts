// AI智能搜索资源服务
import { getCurrentAIConfig } from './ai-config-service';

interface SearchableItem {
  id: number;
  name: string;
  url: string;
  folder?: string;
}

interface SearchResult {
  id: number;
  name: string;
  url: string;
  folder?: string;
  relevance: string;
  confidence?: number;
}

// 构建搜索提示词
const buildSearchPrompt = (query: string, items: SearchableItem[]): string => {
  const itemsList = items.map((item, i) => 
    `${i + 1}. [${item.name}](${item.url})${item.folder ? ` - 📁${item.folder}` : ''}`
  ).join('\n');

  return `你是一个智能书签/资源搜索助手，擅长理解用户意图并进行精准和广泛的匹配。

## 用户查询
"${query}"

## 资源列表（格式：序号. [名称](链接) - 📁文件夹路径）
${itemsList}

## 搜索策略（按优先级排序）

### 1. 文件夹匹配（最高优先级！）
- **文件夹名称完全匹配**：如果用户搜索"vibe coding"，必须返回所有文件夹名包含"vibe coding"、"vibe-coding"、"vibecoding"的资源
- **文件夹路径匹配**：检查完整路径，如"收藏夹栏 > Vibe coding"也算匹配
- **文件夹名模糊匹配**：忽略大小写、空格、连字符的差异

### 2. 名称和URL匹配
- 资源名称包含查询关键词
- URL中包含查询关键词

### 3. 同领域扩展
- 搜"Java" → Spring、Maven、Redis、MySQL、微服务等
- 搜"前端" → React、Vue、CSS、TypeScript等
- 搜"AI" → ChatGPT、Claude、LLM、Prompt等
- 搜"vibe coding" → AI编程、Cursor、Copilot、代码生成等

### 4. 功能联想
- 搜"画图" → Midjourney、DALL-E、Canva等
- 搜"写代码" → GitHub、IDE、编程文档等

## 特别注意
- **文件夹名称是重要的分类信息**，用户搜索某个词时，该词对应的文件夹下的所有资源都应该返回
- 即使资源名称不包含关键词，只要它在匹配的文件夹下，也要返回
- 多级文件夹路径中任何一级匹配都算

## 输出要求
- 返回 **8-20个** 相关资源
- 文件夹匹配的资源 confidence 给 90-100
- 名称匹配的资源 confidence 给 70-90
- 关联推荐的资源 confidence 给 50-70
- 按 confidence 从高到低排序

## 输出格式（严格JSON）
{
  "results": [
    {
      "id": 资源ID数字,
      "name": "资源名称",
      "url": "资源链接",
      "folder": "所属文件夹",
      "confidence": 95,
      "relevance": "文件夹匹配/名称匹配/关联推荐"
    }
  ],
  "summary": "找到X个相关资源"
}

只返回JSON，不要其他内容。`;
};

// 尝试从不完整的JSON中提取已完成的结果
const extractPartialResults = (content: string): SearchResult[] => {
  const results: SearchResult[] = [];
  
  // 方法1：尝试找到完整的 results 数组并解析
  const resultsArrayMatch = content.match(/"results"\s*:\s*\[([\s\S]*?)\]/);
  if (resultsArrayMatch) {
    try {
      const arrayContent = `[${resultsArrayMatch[1]}]`;
      const parsed = JSON.parse(arrayContent);
      if (Array.isArray(parsed)) {
        for (const obj of parsed) {
          if (obj.id !== undefined && obj.name && obj.url) {
            results.push({
              id: typeof obj.id === 'number' ? obj.id : parseInt(obj.id) || 0,
              name: obj.name,
              url: obj.url,
              folder: obj.folder || undefined,
              confidence: obj.confidence || 0,
              relevance: obj.relevance || ''
            });
          }
        }
        if (results.length > 0) return results;
      }
    } catch {
      // 数组不完整，继续用其他方法
    }
  }
  
  // 方法2：逐个匹配完整的对象（通过计数花括号）
  let depth = 0;
  let objStart = -1;
  
  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '{') {
      if (depth === 0) objStart = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && objStart !== -1) {
        const objStr = content.slice(objStart, i + 1);
        // 检查是否包含必要字段
        if (objStr.includes('"id"') && objStr.includes('"name"') && objStr.includes('"url"')) {
          try {
            const obj = JSON.parse(objStr);
            if (obj.id !== undefined && obj.name && obj.url && !obj.results) {
              results.push({
                id: typeof obj.id === 'number' ? obj.id : parseInt(obj.id) || 0,
                name: obj.name,
                url: obj.url,
                folder: obj.folder || undefined,
                confidence: obj.confidence || 0,
                relevance: obj.relevance || ''
              });
            }
          } catch {
            // 解析失败，跳过
          }
        }
        objStart = -1;
      }
    }
  }
  
  // 去重（按 id）
  const seen = new Set<number>();
  return results.filter(r => {
    if (seen.has(r.id)) return false;
    seen.add(r.id);
    return true;
  });
};

// 流式AI搜索 - 带回调
export const aiSearchResourcesStream = async (
  query: string,
  items: SearchableItem[],
  onPartialResults: (results: SearchResult[]) => void,
  onComplete: (results: SearchResult[], summary: string) => void,
  onError: (error: string) => void
): Promise<void> => {
  if (!query.trim() || items.length === 0) {
    onError('请输入搜索内容');
    return;
  }

  const config = getCurrentAIConfig();
  if (!config?.apiKey) {
    const { results, summary } = localFuzzySearch(query, items);
    onComplete(results, summary);
    return;
  }

  const prompt = buildSearchPrompt(query, items);
  const apiUrl = config.model.apiUrl || 'https://api.deepseek.com/chat/completions';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.modelId || 'deepseek-chat',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        max_tokens: 2000,
        stream: true,
      }),
    });

    if (!response.ok) {
      console.error('AI搜索请求失败:', response.status);
      const { results, summary } = localFuzzySearch(query, items);
      onComplete(results, summary);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      const { results, summary } = localFuzzySearch(query, items);
      onComplete(results, summary);
      return;
    }

    const decoder = new TextDecoder();
    let fullContent = '';
    let lastResultCount = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.choices?.[0]?.delta?.content || '';
            if (content) {
              fullContent += content;
              
              const partialResults = extractPartialResults(fullContent);
              if (partialResults.length > lastResultCount) {
                lastResultCount = partialResults.length;
                onPartialResults(partialResults);
              }
            }
          } catch {
            // 忽略解析错误
          }
        }
      }
    }

    // 解析完整响应
    const jsonMatch = fullContent.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        const results = parsed.results || [];
        if (results.length > 0) {
          onComplete(results, parsed.summary || '搜索完成');
        } else {
          const local = localFuzzySearch(query, items);
          onComplete(local.results, local.summary);
        }
      } catch {
        const { results, summary } = localFuzzySearch(query, items);
        onComplete(results, summary);
      }
    } else {
      const { results, summary } = localFuzzySearch(query, items);
      onComplete(results, summary);
    }
  } catch (error) {
    console.error('AI搜索出错:', error);
    const { results, summary } = localFuzzySearch(query, items);
    onComplete(results, summary);
  }
};

// 非流式调用（保留兼容）
export const aiSearchResources = async (
  query: string,
  items: SearchableItem[]
): Promise<{ results: SearchResult[]; summary: string }> => {
  return new Promise((resolve) => {
    aiSearchResourcesStream(
      query,
      items,
      () => {}, // 忽略流式输出
      (results, summary) => resolve({ results, summary }),
      () => resolve(localFuzzySearch(query, items))
    );
  });
};

// 本地模糊搜索（降级方案）
const localFuzzySearch = (
  query: string,
  items: SearchableItem[]
): { results: SearchResult[]; summary: string } => {
  const queryLower = query.toLowerCase().replace(/[-_\s]/g, ''); // 标准化查询
  const keywords = query.toLowerCase().split(/\s+/).filter(k => k.length > 0);

  const scored = items.map(item => {
    let score = 0;
    const nameLower = item.name.toLowerCase();
    const urlLower = item.url.toLowerCase();
    const folderLower = (item.folder || '').toLowerCase();
    const folderNormalized = folderLower.replace(/[-_\s]/g, '');

    // 文件夹匹配（最高优先级）
    if (folderNormalized.includes(queryLower) || folderLower.includes(query.toLowerCase())) {
      score += 100;
    }
    
    // 文件夹路径中的任何部分匹配
    const folderParts = folderLower.split(/[>\s\/\\]+/);
    for (const part of folderParts) {
      const partNormalized = part.replace(/[-_\s]/g, '');
      if (partNormalized.includes(queryLower) || queryLower.includes(partNormalized)) {
        score += 80;
        break;
      }
    }

    // 名称完全匹配
    if (nameLower === query.toLowerCase()) score += 100;
    else if (nameLower.includes(query.toLowerCase())) score += 50;
    
    // 关键词匹配
    keywords.forEach(kw => {
      if (nameLower.includes(kw)) score += 20;
      if (urlLower.includes(kw)) score += 10;
      if (folderLower.includes(kw)) score += 30;
    });

    return { ...item, score, confidence: Math.min(score, 100), relevance: score >= 80 ? '文件夹匹配' : '关键词匹配' };
  });

  const results = scored
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20)
    .map(({ id, name, url, folder, relevance, confidence }) => ({ id, name, url, folder, relevance, confidence }));

  return {
    results,
    summary: results.length > 0 ? `找到 ${results.length} 个相关资源（本地搜索）` : '未找到相关资源',
  };
};

export type { SearchableItem, SearchResult };
