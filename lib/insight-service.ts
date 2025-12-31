import { AI_MODELS, type AIModel, getModelApiKey } from './ai-models';
import { isSupabaseConfigured, getInsightHistoryTitles, saveInsightHistory } from './supabase';
import { getStoredUserId } from './auth';

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
const generatePrompt = (userTags: string[], existingTitles: string[] = []) => {
  const tagsStr = userTags.length > 0 ? userTags.join('、') : '科技、心理学、经济学、哲学、商业';
  
  // 如果有已存在的标题，添加到提示词中避免重复
  const avoidSection = existingTitles.length > 0 
    ? `\n# 避免重复
以下主题已经生成过，请避免生成相似内容：
${existingTitles.slice(0, 20).map(t => `- ${t}`).join('\n')}\n`
    : '';
  
  return `# Role
你是一位拥有跨学科视角的"深度知识策展人"。

# 用户兴趣领域
${tagsStr}
${avoidSection}
# Goal
根据用户兴趣领域，生成【知识萃取日报】。要求：
1. 紧密围绕用户感兴趣的领域
2. 避免陈词滥调，侧重"底层逻辑"、"认知偏差"、"行业内幕"和"实操法则"
3. 从权威来源提取（TED演讲、Nature/Science论文、经典著作等）
4. 每次生成的内容必须是全新的，不要重复之前的主题

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
const MEMORY_TITLES_KEY = 'insight_memory_titles'; // 本地缓存的历史标题

// 全局策展服务状态
class InsightService {
  private _isLoading = false;
  private _cards: InsightCard[] = [];
  private _listeners: Set<() => void> = new Set();
  private _abortController: AbortController | null = null;
  private _memoryTitles: Set<string> = new Set(); // 记忆中的历史标题
  private _memoryLoaded = false;

  constructor() {
    // 从 localStorage 加载已有卡片
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try { this._cards = JSON.parse(stored); } catch { /* ignore */ }
    }
    // 从本地缓存加载历史标题
    const memoryTitles = localStorage.getItem(MEMORY_TITLES_KEY);
    if (memoryTitles) {
      try { 
        const titles = JSON.parse(memoryTitles);
        this._memoryTitles = new Set(titles);
      } catch { /* ignore */ }
    }
  }

  get isLoading() { return this._isLoading; }
  get cards() { return this._cards; }
  get memorySize() { return this._memoryTitles.size; }

  // 从数据库加载历史记忆
  async loadMemory(): Promise<void> {
    if (this._memoryLoaded) return;
    
    const userId = getStoredUserId();
    if (!isSupabaseConfigured || !userId) {
      this._memoryLoaded = true;
      return;
    }

    try {
      const titles = await getInsightHistoryTitles(userId, 500);
      titles.forEach(t => this._memoryTitles.add(t));
      // 缓存到本地
      localStorage.setItem(MEMORY_TITLES_KEY, JSON.stringify([...this._memoryTitles]));
      this._memoryLoaded = true;
    } catch (err) {
      console.error('加载信息差记忆失败:', err);
      this._memoryLoaded = true;
    }
  }

  // 保存新卡片到记忆
  private async saveToMemory(cards: InsightCard[]): Promise<void> {
    const userId = getStoredUserId();
    if (!isSupabaseConfigured || !userId || cards.length === 0) return;

    try {
      await saveInsightHistory(userId, cards.map(c => ({
        title: c.title,
        category: c.category,
        source: c.source,
        core_content: c.core_content,
        tags: c.tags,
      })));
      // 更新本地记忆
      cards.forEach(c => this._memoryTitles.add(c.title));
      localStorage.setItem(MEMORY_TITLES_KEY, JSON.stringify([...this._memoryTitles]));
    } catch (err) {
      console.error('保存到记忆失败:', err);
    }
  }

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

  // 检查标题是否相似（简单的相似度检测）
  private isSimilarTitle(newTitle: string, existingTitles: Set<string>): boolean {
    const normalizedNew = newTitle.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
    
    // 合并当前会话标题和记忆中的标题
    const allTitles = new Set([...existingTitles, ...this._memoryTitles]);
    
    for (const existing of allTitles) {
      const normalizedExisting = existing.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
      // 如果标题完全相同或者有 70% 以上的字符重叠，认为是相似的
      if (normalizedNew === normalizedExisting) return true;
      
      // 检查是否有大量重叠的关键词
      const newChars = new Set(normalizedNew.split(''));
      const existingChars = new Set(normalizedExisting.split(''));
      const intersection = [...newChars].filter(c => existingChars.has(c));
      const similarity = intersection.length / Math.max(newChars.size, existingChars.size);
      if (similarity > 0.7) return true;
    }
    return false;
  }

  // 开始生成
  async generate(userTags: string[], append = false): Promise<{ success: boolean; error?: string }> {
    if (this._isLoading) return { success: false, error: '正在生成中' };

    const config = this.getAIConfig();
    if (!config) return { success: false, error: '请先在设置中配置 AI 模型' };

    // 先加载历史记忆
    await this.loadMemory();

    this._isLoading = true;
    this._abortController = new AbortController();
    
    // 获取已存在的标题用于去重（包括记忆中的标题）
    const existingTitles = [...this._cards.map(c => c.title), ...this._memoryTitles];
    
    if (!append) {
      this._cards = [];
    }
    this.notify();

    const addedTitles = new Set(this._cards.map(c => c.title));
    const newlyGeneratedCards: InsightCard[] = []; // 记录本次新生成的卡片

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
            { role: 'system', content: generatePrompt(userTags, existingTitles) },
            { role: 'user', content: `请生成今日的知识萃取日报，日期：${new Date().toLocaleDateString('zh-CN')}，时间戳：${Date.now()}` },
          ],
          temperature: 0.9, // 提高温度增加多样性
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
                // 使用相似度检测避免重复
                if (!this.isSimilarTitle(card.title, addedTitles)) {
                  addedTitles.add(card.title);
                  const newCard: InsightCard = {
                    ...card,
                    id: generateId(),
                    createdAt: Date.now(),
                  };
                  this._cards.push(newCard);
                  newlyGeneratedCards.push(newCard);
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
        if (!this.isSimilarTitle(card.title, addedTitles)) {
          addedTitles.add(card.title);
          const newCard: InsightCard = {
            ...card,
            id: generateId(),
            createdAt: Date.now(),
          };
          this._cards.push(newCard);
          newlyGeneratedCards.push(newCard);
        }
      }
      this.saveCards();
      
      // 保存新生成的卡片到记忆
      if (newlyGeneratedCards.length > 0) {
        await this.saveToMemory(newlyGeneratedCards);
      }
      
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
              { role: 'system', content: generatePrompt(userTags, existingTitles) },
              { role: 'user', content: `请生成今日的知识萃取日报，日期：${new Date().toLocaleDateString('zh-CN')}，时间戳：${Date.now()}` },
            ],
            temperature: 0.9,
          }),
        });
        
        if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);
        
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content || '';
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]) as Omit<InsightCard, 'id' | 'createdAt'>[];
          for (const card of parsed) {
            if (!this.isSimilarTitle(card.title, addedTitles)) {
              addedTitles.add(card.title);
              const newCard: InsightCard = { ...card, id: generateId(), createdAt: Date.now() };
              this._cards.push(newCard);
              newlyGeneratedCards.push(newCard);
            }
          }
          this.saveCards();
          
          // 保存新生成的卡片到记忆
          if (newlyGeneratedCards.length > 0) {
            await this.saveToMemory(newlyGeneratedCards);
          }
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
