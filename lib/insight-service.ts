import { AI_MODELS, type AIModel, getModelApiKey } from './ai-models';

// 知识卡片类型
export interface InsightCard {
  id: string;
  category: string;
  title: string;
  source: string;
  core_content: string;
  takeaway: string;
  tags: string[];
  createdAt: number;
}

// 生成唯一ID
const generateId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

// 生成动态提示词
const generatePrompt = (userTags: string[]) => {
  const tagsStr = userTags.length > 0 ? userTags.join('、') : '科技、心理学、经济学、哲学、商业';
  
  return `# Role
你是一位拥有跨学科视角的"深度知识策展人"。

# 用户兴趣领域
${tagsStr}

# Goal
根据用户兴趣领域，生成【知识萃取日报】。要求：
1. 紧密围绕用户感兴趣的领域
2. 避免陈词滥调，侧重"底层逻辑"、"认知偏差"、"行业内幕"和"实操法则"
3. 从权威来源提取（TED演讲、Nature/Science论文、经典著作等）

# Categories （下面每个分类随机生成 2-5个）
1. Industry_Insight: 行业透视 - 不为人知的底层逻辑或最新趋势
2. Cognitive_Upgrade: 认知升级 - 思维模型或认知偏差
3. Life_Heuristics: 生活法则 - 黄金法则或高效方法论
4. Global_Perspective: 全球视野 - 前沿突破或深度洞察
5. Golden_Quote: 金句 - 经典名言（附出处）

# Output
只输出 JSON 数组，每个对象包含：
- category: 分类
- title: 标题（<20字）
- source: 来源
- core_content: 核心内容（<100字）
- takeaway: 行动启示（<50字）
- tags: 标签数组（3-5个）`;
};

const STORAGE_KEY = 'daily_insights_cards';

// 全局策展服务状态
class InsightService {
  private _isLoading = false;
  private _cards: InsightCard[] = [];
  private _listeners: Set<() => void> = new Set();
  private _abortController: AbortController | null = null;

  constructor() {
    // 从 localStorage 加载已有卡片
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { this._cards = JSON.parse(stored); } catch { /* ignore */ }
    }
  }

  get isLoading() { return this._isLoading; }
  get cards() { return this._cards; }

  // 订阅状态变化
  subscribe(listener: () => void) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  private notify() {
    this._listeners.forEach(l => l());
    // 发送全局事件
    window.dispatchEvent(new CustomEvent('insight-status', { 
      detail: { status: this._isLoading ? 'loading' : 'done', cardsCount: this._cards.length } 
    }));
  }

  private saveCards() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._cards));
  }

  // 解析单个完整的JSON对象
  private parseCompleteObjects(content: string): Omit<InsightCard, 'id' | 'createdAt'>[] {
    const results: Omit<InsightCard, 'id' | 'createdAt'>[] = [];
    const objectRegex = /\{[^{}]*"category"[^{}]*"title"[^{}]*"source"[^{}]*"core_content"[^{}]*"takeaway"[^{}]*"tags"\s*:\s*\[[^\]]*\][^{}]*\}/g;
    let match;
    while ((match = objectRegex.exec(content)) !== null) {
      try {
        const obj = JSON.parse(match[0]);
        if (obj.category && obj.title && obj.tags) {
          results.push(obj);
        }
      } catch { /* 忽略解析失败的 */ }
    }
    return results;
  }

  // 获取 AI 配置
  private getAIConfig(): { apiKey: string; model: AIModel | { id: string; name: string; provider: string; apiUrl: string } } | null {
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

  // 开始生成
  async generate(userTags: string[], append = false): Promise<{ success: boolean; error?: string }> {
    if (this._isLoading) return { success: false, error: '正在生成中' };

    const config = this.getAIConfig();
    if (!config) return { success: false, error: '请先在设置中配置 AI 模型' };

    this._isLoading = true;
    this._abortController = new AbortController();
    
    if (!append) {
      this._cards = [];
    }
    this.notify();

    const addedTitles = new Set(this._cards.map(c => c.title));

    try {
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
            { role: 'system', content: generatePrompt(userTags) },
            { role: 'user', content: `请生成今日的知识萃取日报，日期：${new Date().toLocaleDateString('zh-CN')}` },
          ],
          temperature: 0.8,
          stream: true,
        }),
        signal: this._abortController.signal,
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
              fullContent += content;

              // 实时解析已完成的单个卡片对象
              const parsedCards = this.parseCompleteObjects(fullContent);
              
              for (const card of parsedCards) {
                if (!addedTitles.has(card.title)) {
                  addedTitles.add(card.title);
                  this._cards.push({
                    ...card,
                    id: generateId(),
                    createdAt: Date.now(),
                  });
                  this.saveCards();
                  this.notify();
                }
              }
            } catch { /* ignore parse errors */ }
          }
        }
      }

      // 最终解析
      const finalParsed = this.parseCompleteObjects(fullContent);
      for (const card of finalParsed) {
        if (!addedTitles.has(card.title)) {
          addedTitles.add(card.title);
          this._cards.push({
            ...card,
            id: generateId(),
            createdAt: Date.now(),
          });
        }
      }
      this.saveCards();
      
      return { success: true };
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        return { success: false, error: '已取消' };
      }
      
      // 尝试非流式
      try {
        const { apiKey, model } = config;
        const response = await fetch(model.apiUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
          body: JSON.stringify({
            model: model.id,
            messages: [
              { role: 'system', content: generatePrompt(userTags) },
              { role: 'user', content: `请生成今日的知识萃取日报，日期：${new Date().toLocaleDateString('zh-CN')}` },
            ],
            temperature: 0.8,
          }),
        });
        
        if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
        
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Omit<InsightCard, 'id' | 'createdAt'>[];
          for (const card of parsed) {
            if (!addedTitles.has(card.title)) {
              addedTitles.add(card.title);
              this._cards.push({ ...card, id: generateId(), createdAt: Date.now() });
            }
          }
          this.saveCards();
        }
        return { success: true };
      } catch (fallbackErr: unknown) {
        return { success: false, error: (fallbackErr as Error).message || '生成失败' };
      }
    } finally {
      this._isLoading = false;
      this._abortController = null;
      this.notify();
    }
  }

  // 删除卡片
  deleteCard(id: string) {
    this._cards = this._cards.filter(c => c.id !== id);
    this.saveCards();
    this.notify();
  }

  // 设置卡片（用于归档后更新）
  setCards(cards: InsightCard[]) {
    this._cards = cards;
    this.saveCards();
    this.notify();
  }

  // 取消生成
  cancel() {
    this._abortController?.abort();
  }
}

// 全局单例
export const insightService = new InsightService();
