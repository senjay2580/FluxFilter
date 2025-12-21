import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AI_MODELS, type AIModel, getModelApiKey } from '../../lib/ai-models';
import { AIMarkdown } from '../common/AIMarkdown';
import { getAIConfigs, isSupabaseConfigured } from '../../lib/supabase';
import { getStoredUserId } from '../../lib/auth';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  forks_count: number;
  language: string | null;
  owner: { avatar_url: string; login: string };
  topics?: string[];
  created_at: string;
  updated_at: string;
  pushed_at: string;
}

interface StackOverflowQuestion {
  question_id: number;
  title: string;
  link: string;
  score: number;
  answer_count: number;
  view_count: number;
  tags: string[];
  owner: { display_name: string; profile_image?: string };
  creation_date: number;
}

type TabType = 'github' | 'stackoverflow' | 'hellogithub' | 'v2ex' | 'linuxdo';

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: '#f1e05a', TypeScript: '#3178c6', Python: '#3572A5', Java: '#b07219',
  Go: '#00ADD8', Rust: '#dea584', C: '#555555', 'C++': '#f34b7d', 'C#': '#178600',
  Ruby: '#701516', PHP: '#4F5D95', Swift: '#F05138', Kotlin: '#A97BFF', Dart: '#00B4AB',
  Vue: '#41b883', Shell: '#89e051', HTML: '#e34c26', CSS: '#563d7c', Scala: '#c22d40',
};

const DevCommunity: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('github');
  const [githubRepos, setGithubRepos] = useState<GitHubRepo[]>([]);
  const [soQuestions, setSoQuestions] = useState<StackOverflowQuestion[]>([]);

  // 长按添加待办
  const [showTodoMenu, setShowTodoMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ x: 0, y: 0 });
  const [selectedItem, setSelectedItem] = useState<{ title: string; url: string; description: string; time?: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const longPressTriggered = useRef(false);

  const [loading, setLoading] = useState<Record<TabType, boolean>>({ github: false, stackoverflow: false, hellogithub: false, v2ex: false, linuxdo: false });
  const [error, setError] = useState<Record<TabType, string | null>>({ github: null, stackoverflow: null, hellogithub: null, v2ex: null, linuxdo: null });
  const [page, setPage] = useState<Record<TabType, number>>({ github: 1, stackoverflow: 1, hellogithub: 1, v2ex: 1, linuxdo: 1 });
  const [hasMore, setHasMore] = useState<Record<TabType, boolean>>({ github: true, stackoverflow: true, hellogithub: true, v2ex: true, linuxdo: true });

  // 数据加载与 AI 总结状态
  const AI_SUMMARY_CACHE_KEY = 'dev_community_ai_summary';
  const [aiSummary, setAiSummary] = useState<Record<'github' | 'stackoverflow', string>>(() => {
    // 从 localStorage 加载缓存
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(AI_SUMMARY_CACHE_KEY);
      if (cached) {
        try {
          return JSON.parse(cached);
        } catch { }
      }
    }
    return { github: '', stackoverflow: '' };
  });
  const [isSummarizing, setIsSummarizing] = useState<Record<'github' | 'stackoverflow', boolean>>({ github: false, stackoverflow: false });
  // 如果有缓存内容，自动显示 AI 结果区域
  const [showAIResult, setShowAIResult] = useState(() => {
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(AI_SUMMARY_CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          return !!(parsed.github || parsed.stackoverflow);
        } catch { }
      }
    }
    return false;
  });
  const [loadLimit, setLoadLimit] = useState<number>(20); // 默认加载 20 项


  // 获取全局 AI 配置 (由 SettingsModal 维护)
  // AI 相关配置 (添加监听逻辑以实时同步)
  const [configVersion, setConfigVersion] = useState(0);
  useEffect(() => {
    const handleStorageChange = () => setConfigVersion(v => v + 1);
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const getAIConfig = useCallback(() => {
    const modelId = localStorage.getItem('ai_model') || 'deepseek-chat';
    const key = getModelApiKey(modelId);

    if (modelId === 'custom') {
      return {
        apiKey: key,
        model: {
          id: localStorage.getItem('ai_custom_model') || 'custom-model',
          name: '自定义模型',
          provider: 'Custom',
          apiUrl: localStorage.getItem('ai_base_url') || ''
        }
      };
    }

    const model = AI_MODELS.find(m => m.id === modelId) || AI_MODELS[0];
    return { apiKey: key, model };
  }, []);

  // GitHub Trending (使用 search API 模拟)
  const fetchGitHub = useCallback(async (loadMore = false) => {
    const currentPage = loadMore ? page.github + 1 : 1;
    setLoading(prev => ({ ...prev, github: true }));
    setError(prev => ({ ...prev, github: null }));

    try {
      const date = new Date();
      date.setDate(date.getDate() - 30); // 扩大搜索范围到一个月，保证有足够数据排序
      const since = date.toISOString().split('T')[0];

      // 如果 loadLimit 是 -1 (全部)，则 per_page 设为 100 (API 限制)
      const perPage = loadLimit === -1 ? 100 : loadLimit;

      const res = await fetch(
        `https://api.github.com/search/repositories?q=created:>${since}&sort=stars&order=desc&per_page=${perPage}&page=${currentPage}`
      );

      if (!res.ok) throw new Error(res.status === 403 ? 'API 请求限制，请稍后再试' : '请求失败');

      const data = await res.json();
      let repos = data.items || [];

      // 多维度综合评分排序
      // 考虑因素: 1. star 数 2. 近期更新频率 3. fork 数 (反映活跃度)
      const now = Date.now();
      repos.sort((a: GitHubRepo, b: GitHubRepo) => {
        // star 分数 (对数化处理，避免头部项目占据过大权重)
        const starScoreA = Math.log10(a.stargazers_count + 1) * 30;
        const starScoreB = Math.log10(b.stargazers_count + 1) * 30;

        // 更新时间分数 (越近越高)
        const daysAgoA = (now - new Date(a.updated_at).getTime()) / (1000 * 60 * 60 * 24);
        const daysAgoB = (now - new Date(b.updated_at).getTime()) / (1000 * 60 * 60 * 24);
        const updateScoreA = Math.max(0, 40 - daysAgoA * 2);
        const updateScoreB = Math.max(0, 40 - daysAgoB * 2);

        // fork 分数 (反映社区活跃度)
        const forkScoreA = Math.log10(a.forks_count + 1) * 20;
        const forkScoreB = Math.log10(b.forks_count + 1) * 20;

        const totalA = starScoreA + updateScoreA + forkScoreA;
        const totalB = starScoreB + updateScoreB + forkScoreB;
        return totalB - totalA;
      });

      if (loadMore) {
        setGithubRepos(prev => [...prev, ...repos]);
      } else {
        setGithubRepos(repos);
      }

      setPage(prev => ({ ...prev, github: currentPage }));
      setHasMore(prev => ({ ...prev, github: repos.length === perPage && loadLimit !== -1 }));
    } catch (err) {
      setError(prev => ({ ...prev, github: String(err) }));
    } finally {
      setLoading(prev => ({ ...prev, github: false }));
    }
  }, [page.github, loadLimit]);

  // Stack Overflow Hot Questions
  const fetchStackOverflow = useCallback(async (loadMore = false) => {
    const currentPage = loadMore ? page.stackoverflow + 1 : 1;
    setLoading(prev => ({ ...prev, stackoverflow: true }));
    setError(prev => ({ ...prev, stackoverflow: null }));

    try {
      const perPage = loadLimit === -1 ? 100 : loadLimit;
      const res = await fetch(
        `https://api.stackexchange.com/2.3/questions?order=desc&sort=creation&site=stackoverflow&pagesize=${perPage}&page=${currentPage}&filter=withbody`
      );

      if (!res.ok) throw new Error('请求失败');

      const data = await res.json();
      let questions = data.items || [];

      // 显式按创建时间倒序排序
      questions.sort((a: StackOverflowQuestion, b: StackOverflowQuestion) =>
        b.creation_date - a.creation_date
      );

      if (loadMore) {
        setSoQuestions(prev => [...prev, ...questions]);
      } else {
        setSoQuestions(questions);
      }

      setPage(prev => ({ ...prev, stackoverflow: currentPage }));
      setHasMore(prev => ({ ...prev, stackoverflow: data.has_more && loadLimit !== -1 }));
    } catch (err) {
      setError(prev => ({ ...prev, stackoverflow: String(err) }));
    } finally {
      setLoading(prev => ({ ...prev, stackoverflow: false }));
    }
  }, [page.stackoverflow, loadLimit]);

  // iframe 加载状态
  const [iframeLoaded, setIframeLoaded] = useState<Record<string, boolean>>({
    hellogithub: false,
    v2ex: false,
    linuxdo: false,
  });

  const handleRefresh = () => {
    if (activeTab === 'github') fetchGitHub();
    else if (activeTab === 'stackoverflow') fetchStackOverflow();
  };

  const handleLoadMore = () => {
    if (activeTab === 'github') fetchGitHub(true);
    else if (activeTab === 'stackoverflow') fetchStackOverflow(true);
  };

  // AI 总结逻辑
  const handleAISummarize = async () => {
    const config = getAIConfig();
    if (!config.apiKey) {
      setToast('⚠️ 请先在设置中配置 AI API Key');
      return;
    }

    setIsSummarizing(prev => ({ ...prev, [activeTab]: true }));
    setShowAIResult(true);
    setAiSummary(prev => ({ ...prev, [activeTab]: '' }));

    let prompt = '';
    if (activeTab === 'github') {
      const repos = githubRepos;
      prompt = `你是一个资深的开源社区观察员和技术趋势分析专家。请分析以下 GitHub 项目 (共 ${repos.length} 个)。

项目数据：
${repos.map((r, i) => `${i + 1}. [${r.full_name}] ⭐${r.stargazers_count} �${r.forks_count} | ${r.language || '未知语言'}
   描述: ${r.description || '无描述'}`).join('\n')}

你的任务（必须严格按照以下格式输出，不得自创结构）：

# 🔥 GitHub 热门项目洞察报告

## 📊 核心趋势总结
（用 2-3 句话概括这批项目反映的技术趋势和开发者关注点）

## 🏆 重点项目推荐
（挑选所有你认为最有价值的项目，按重要程度排序）

### 项目1: [仓库全名]
- **简要描述**: 一句话说明项目是什么
- **项目概览**: 2-3 句详细介绍，包括技术栈、应用场景
- **为何推荐**: 推荐理由（创新性/实用性/学习价值）

### 项目2: [仓库全名]
...（同上格式）

## 其他项目
项目名列表
只要简要介绍即可
## ☁️ 关键词云
（提取 8-12 个核心技术关键词，用 **关键词** 格式高亮，用空格分隔）

## 💡 实践建议
- 针对开发者的 2-3 条具体可执行建议

## 📚 学习路径建议
- 针对初学者：推荐从哪个项目入手
- 针对进阶者：推荐深入研究哪些项目

---
约束：
- 使用 Markdown 格式，层级清晰
- 必须用 **双星号** 高亮技术名词
- 适当使用 Emoji 增加可读性
- 严禁输出任何开场白或结束语`;
    } else if (activeTab === 'stackoverflow') {
      const questions = soQuestions;
      prompt = `你是一个资深的全栈工程师和技术专家。请分析以下当前加载的 Stack Overflow 热门问题 (共 ${questions.length} 个)，总结出当前开发者遇到的痛点和技术难点。

问题列表：
${questions.map((q, i) => `${i + 1}. ${q.title} (标签: ${q.tags.join(', ')}, 得分: ${q.score})`).join('\n')}

要求：使用 Markdown 格式，语气干练，增加适当的 Emoji。`;
    }

    const apiKey = config.apiKey;

    if (!apiKey) {
      setToast('⚠️ 未能获取到有效的 API Key，请在设置中配置');
      setIsSummarizing(prev => ({ ...prev, [activeTab]: false }));
      return;
    }

    try {
      if (config.model.provider === 'Google') {
        const res = await fetch(`${config.model.apiUrl}?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, maxOutputTokens: 8192 }
          })
        });
        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '分析失败';
        setAiSummary(prev => ({ ...prev, [activeTab]: text }));
      } else {
        const res = await fetch(config.model.apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model: config.model.id,
            messages: [{ role: 'user', content: prompt }],
            stream: true
          })
        });

        const reader = res.body?.getReader();
        const decoder = new TextDecoder();
        let fullContent = '';

        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value);
          const lines = chunk.split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim();
              if (dataStr === '[DONE]') continue;
              try {
                const json = JSON.parse(dataStr);
                const delta = json.choices?.[0]?.delta?.content || '';
                fullContent += delta;
                setAiSummary(prev => ({ ...prev, [activeTab]: fullContent }));
              } catch (e) { }
            }
          }
        }
      }
    } catch (err) {
      console.error('AI 总结失败:', err);
      setToast('❌ AI 总结失败，请检查网路或配置');
    } finally {
      setIsSummarizing(prev => ({ ...prev, [activeTab]: false }));
      // 保存到 localStorage
      setAiSummary(prev => {
        localStorage.setItem(AI_SUMMARY_CACHE_KEY, JSON.stringify(prev));
        return prev;
      });
    }
  };

  // 监听 loadLimit 变化自动刷新
  useEffect(() => {
    if (activeTab === 'github') fetchGitHub();
    else if (activeTab === 'stackoverflow') fetchStackOverflow();
  }, [loadLimit, activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatNumber = (num: number) => {
    if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
    return num.toString();
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 24) return `${hours} 小时前`;
    return `${Math.floor(hours / 24)} 天前`;
  };

  const formatGitHubDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const days = Math.floor(diff / 86400000);
    if (days < 1) return '今天';
    if (days < 7) return `${days} 天前`;
    if (days < 30) return `${Math.floor(days / 7)} 周前`;
    return date.toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' });
  };

  // 长按开始
  const handleLongPressStart = (e: React.TouchEvent | React.MouseEvent, item: { title: string; url: string; description: string; time?: string }) => {
    longPressTriggered.current = false;
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true;
      setSelectedItem(item);
      setMenuPosition({ x: clientX, y: clientY });
      setShowTodoMenu(true);
      if (navigator.vibrate) navigator.vibrate(50);
    }, 600);
  };

  // 长按结束
  const handleLongPressEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // 点击处理 - 如果长按已触发则不跳转
  const handleCardClick = (url: string) => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    if (!showTodoMenu) {
      window.open(url, '_blank');
    }
  };

  // 阻止右键菜单
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  // 添加到待办 (使用 localStorage，与 TodoList 组件一致)
  const handleAddToTodo = () => {
    if (!selectedItem) return;

    try {
      // 读取现有待办
      const saved = localStorage.getItem('fluxf-todos');
      const todos = saved ? JSON.parse(saved) : [];

      // 创建新待办 - 只保留链接
      const newTodo = {
        id: Date.now().toString(),
        text: selectedItem.url,
        completed: false,
        priority: 'medium',
        createdAt: Date.now(),
      };

      // 添加到列表开头
      todos.unshift(newTodo);

      // 保存
      localStorage.setItem('fluxf-todos', JSON.stringify(todos));

      // 显示成功提示
      setToast(`✅ 已添加「${selectedItem.title}」到待办`);
    } catch (err) {
      console.error('添加待办失败:', err);
      setToast('❌ 添加失败');
    } finally {
      setShowTodoMenu(false);
      setTimeout(() => setToast(null), 3000);
    }
  };

  // GitHub 图标
  const GitHubIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );

  // Stack Overflow 图标
  const StackOverflowIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M15 21h-10v-2h10v2zm6-11.665l-1.621-9.335-1.993.346 1.62 9.335 1.994-.346zm-5.964 6.937l-9.746-.975-.186 2.016 9.755.879.177-1.92zm.538-2.587l-9.276-2.608-.526 1.954 9.306 2.5.496-1.846zm1.204-2.413l-8.297-4.864-1.029 1.743 8.298 4.865 1.028-1.744zm1.866-1.467l-5.339-7.829-1.672 1.14 5.339 7.829 1.672-1.14zm-2.644 4.195v8h-12v-8h-2v10h16v-10h-2z" />
    </svg>
  );

  // HelloGitHub 图标 - 大写 H 倾斜加粗
  const HelloGitHubIcon = () => (
    <span className="text-lg font-black italic">H</span>
  );

  // V2EX 图标
  const V2EXIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
    </svg>
  );

  // LINUX DO 图标
  const LinuxDoIcon = () => (
    <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139zm.529 3.405h.013c.213 0 .396.062.584.198.19.135.33.332.438.533.105.259.158.459.166.724 0-.02.006-.04.006-.06v.105a.086.086 0 01-.004-.021l-.004-.024a1.807 1.807 0 01-.15.706.953.953 0 01-.213.335.71.71 0 00-.088-.042c-.104-.045-.198-.064-.284-.133a1.312 1.312 0 00-.22-.066c.05-.06.146-.133.183-.198.053-.128.082-.264.088-.402v-.02a1.21 1.21 0 00-.061-.4c-.045-.134-.101-.2-.183-.333-.084-.066-.167-.132-.267-.132h-.016c-.093 0-.176.03-.262.132a.8.8 0 00-.205.334 1.18 1.18 0 00-.09.4v.019c.002.089.008.179.02.267-.193-.067-.438-.135-.607-.202a1.635 1.635 0 01-.018-.2v-.02a1.772 1.772 0 01.15-.768c.082-.22.232-.406.43-.533a.985.985 0 01.594-.2zm-2.962.059h.036c.142 0 .27.048.399.135.146.129.264.288.344.465.09.199.14.4.153.667v.004c.007.134.006.2-.002.266v.08c-.03.007-.056.018-.083.024-.152.055-.274.135-.393.2.012-.09.013-.18.003-.267v-.015c-.012-.133-.04-.2-.082-.333a.613.613 0 00-.166-.267.248.248 0 00-.183-.064h-.021c-.071.006-.13.04-.186.132a.552.552 0 00-.12.27.944.944 0 00-.023.33v.015c.012.135.037.2.08.334.046.134.098.2.166.268.01.009.02.018.034.024-.07.057-.117.07-.176.136a.304.304 0 01-.131.068 2.62 2.62 0 01-.275-.402 1.772 1.772 0 01-.155-.667 1.759 1.759 0 01.08-.668 1.43 1.43 0 01.283-.535c.128-.133.26-.2.418-.2zm1.37 1.706c.332 0 .733.065 1.216.399.293.2.523.269 1.052.468h.003c.255.136.405.266.478.399v-.131a.571.571 0 01.016.47c-.123.31-.516.643-1.063.842v.002c-.268.135-.501.333-.775.465-.276.135-.588.292-1.012.267a1.139 1.139 0 01-.448-.067 3.566 3.566 0 01-.322-.198c-.195-.135-.363-.332-.612-.465v-.005h-.005c-.4-.246-.616-.512-.686-.71-.07-.268-.005-.47.193-.6.224-.135.38-.271.483-.336.104-.074.143-.102.176-.131h.002v-.003c.169-.202.436-.47.839-.601.139-.036.294-.065.466-.065zm2.8 2.142c.358 1.417 1.196 3.475 1.735 4.473.286.534.855 1.659 1.102 3.024.156-.005.33.018.513.064.646-1.671-.546-3.467-1.089-3.966-.22-.2-.232-.335-.123-.335.59.534 1.365 1.572 1.646 2.757.13.535.16 1.104.021 1.67.067.028.135.06.205.067 1.032.534 1.413.938 1.23 1.537v-.043c-.06-.003-.12 0-.18 0h-.016c.151-.467-.182-.825-1.065-1.224-.915-.4-1.646-.336-1.77.465-.008.043-.013.066-.018.135-.068.023-.139.053-.209.064-.43.268-.662.669-.793 1.187-.13.533-.17 1.156-.205 1.869v.003c-.02.334-.17.838-.319 1.35-1.5 1.072-3.58 1.538-5.348.334a2.645 2.645 0 00-.402-.533 1.45 1.45 0 00-.275-.333c.182 0 .338-.03.465-.067a.615.615 0 00.314-.334c.108-.267 0-.697-.345-1.163-.345-.467-.931-.995-1.788-1.521-.63-.4-.986-.87-1.15-1.396-.165-.534-.143-1.085-.015-1.645.245-1.07.873-2.11 1.274-2.763.107-.065.037.135-.408.974-.396.751-1.14 2.497-.122 3.854a8.123 8.123 0 01.647-2.876c.564-1.278 1.743-3.504 1.836-5.268.048.036.217.135.289.202.218.133.38.333.59.465.21.201.477.335.876.335.039.003.075.006.11.006.412 0 .73-.134.997-.268.29-.134.52-.334.74-.4h.005c.467-.135.835-.402 1.044-.7zm2.185 8.958c.037.6.343 1.245.882 1.377.588.134 1.434-.333 1.791-.765l.211-.01c.315-.007.577.01.847.268l.003.003c.208.199.305.53.391.876.085.4.154.78.409 1.066.486.527.645.906.636 1.14l.003-.007v.018l-.003-.012c-.015.262-.185.396-.498.574-.63.328-1.559.6-2.136 1.325-.579.727-1.184 1.083-1.765 1.137-.581.055-1.124-.17-1.479-.678-.053-.074-.115-.262-.188-.468-.087-.251-.136-.532-.157-.544l.003.009v-.009c-.024-.065-.04-.197-.054-.253a.91.91 0 00-.039-.2v-.001l-.001-.002c-.073-.2-.186-.467-.332-.6a2.097 2.097 0 00-.39-.468c-.34-.332-.853-.6-1.333-.535a.09.09 0 00-.06.066c-.003.026-.003.05-.003.076 0 .267.106.4.3.6.19.135.467.268.71.4.24.135.46.268.6.4.14.135.21.2.21.4 0 .135-.034.264-.12.466-.09.2-.21.4-.4.601-.226.268-.392.469-.576.603-.187.134-.778.27-1.012.27-.27 0-.533-.066-.864-.135a1.77 1.77 0 01-.466-.135c-.267-.135-.6-.4-.7-.6-.1-.135-.066-.2-.033-.268.033-.066.1-.2.1-.333 0-.2-.067-.4-.2-.6-.133-.2-.333-.4-.533-.533-.2-.135-.4-.2-.6-.2-.2 0-.4.066-.533.133-.133.066-.267.2-.333.333-.067.135-.1.267-.1.4 0 .135.033.267.1.4.066.135.2.267.333.4.133.135.333.2.533.267.2.066.4.066.6.066.2 0 .4-.066.533-.133.133-.066.267-.2.333-.333.067-.135.1-.267.1-.4 0-.135-.033-.267-.1-.4-.066-.135-.2-.267-.333-.4-.133-.135-.333-.2-.533-.267-.2-.066-.4-.066-.6-.066-.2 0-.4.066-.533.133-.133.066-.267.2-.333.333-.067.135-.1.267-.1.4 0 .135.033.267.1.4.066.135.2.267.333.4.133.135.333.2.533.267.2.066.4.066.6.066z" />
    </svg>
  );

  // 判断是否为 iframe 类型的 tab（只有 hellogithub 支持 iframe）
  const isIframeTab = (tab: TabType) => tab === 'hellogithub';

  // 外链类型的 tab（V2EX 和 LINUX DO 禁止 iframe 嵌入）
  const isExternalTab = (tab: TabType) => ['v2ex', 'linuxdo'].includes(tab);

  const tabs = [
    { id: 'github' as TabType, label: 'GitHub', icon: <GitHubIcon /> },
    { id: 'stackoverflow' as TabType, label: 'Stack', icon: <StackOverflowIcon /> },
    { id: 'hellogithub' as TabType, label: 'Hello', icon: <HelloGitHubIcon /> },
    { id: 'v2ex' as TabType, label: 'V2EX', icon: <V2EXIcon />, url: 'https://v2ex.com/' },
    { id: 'linuxdo' as TabType, label: 'Linux', icon: <LinuxDoIcon />, url: 'https://linux.do/' },
  ];

  // iframe URL 映射
  const iframeUrls: Record<string, string> = {
    hellogithub: 'https://hellogithub.com/',
  };

  // 处理 tab 点击
  const handleTabClick = (tab: typeof tabs[0]) => {
    if ('url' in tab && tab.url) {
      window.open(tab.url, '_blank');
    } else {
      setActiveTab(tab.id);
    }
  };

  const currentLoading = loading[activeTab];
  const currentError = error[activeTab];
  const currentHasMore = hasMore[activeTab];
  const isEmpty = activeTab === 'github' ? githubRepos.length === 0
    : activeTab === 'stackoverflow' ? soQuestions.length === 0
      : false; // iframe 类型不需要检查空状态

  return (
    <div className="min-h-full">
      {/* Tab 切换 */}
      <div className="flex gap-2 mb-4 overflow-x-auto pb-2 scrollbar-hide">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => handleTabClick(tab)}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium whitespace-nowrap transition-all ${activeTab === tab.id && !isExternalTab(tab.id)
              ? 'bg-cyber-lime text-black'
              : 'bg-white/5 text-gray-400 hover:bg-white/10'
              }`}
          >
            {tab.icon}
            <span className="hidden sm:inline">{tab.label}</span>
            {isExternalTab(tab.id) && (
              <svg className="w-3 h-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            )}
          </button>
        ))}
      </div>

      {/* 操作与配置区域 */}
      {['github', 'stackoverflow'].includes(activeTab) && (
        <div className="space-y-3 mb-6">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">当前列表项:</span>
              <span className="text-xs font-bold text-cyber-lime bg-cyber-lime/10 px-2 py-0.5 rounded-full border border-cyber-lime/20">
                {activeTab === 'github' ? githubRepos.length : soQuestions.length} Items
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">加载:</span>
              <div className="relative group/select">
                <select
                  value={loadLimit}
                  onChange={(e) => setLoadLimit(Number(e.target.value))}
                  className="appearance-none bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 pr-8 text-[11px] font-bold text-cyber-lime hover:bg-white/10 transition-all cursor-pointer focus:outline-none focus:border-cyber-lime/40"
                >
                  {[10, 20, 50, -1].map((count) => (
                    <option key={count} value={count} className="bg-[#0c0c14] text-gray-300">
                      {count === -1 ? '全部' : `${count} 项`}
                    </option>
                  ))}
                </select>
                <div className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-500 group-hover/select:text-cyber-lime transition-colors">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M6 9l6 6 6-6" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRefresh}
              disabled={currentLoading}
              className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-gray-300 font-medium transition-all hover:bg-white/10 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {currentLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" />
                </svg>
              )}
              <span>最新刷新</span>
            </button>

            <button
              onClick={handleAISummarize}
              disabled={currentLoading || isSummarizing[activeTab as 'github' | 'stackoverflow'] || (activeTab === 'github' ? githubRepos.length === 0 : soQuestions.length === 0)}
              className="flex-[1.5] py-3 bg-gradient-to-r from-blue-600/20 to-cyan-500/20 hover:from-blue-600/30 hover:to-cyan-500/30 border border-blue-500/30 rounded-xl text-cyan-400 font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(59,130,246,0.1)] group"
            >
              {isSummarizing[activeTab as 'github' | 'stackoverflow'] ? (
                <div className="w-5 h-5 border-2 border-cyan-400/30 border-t-cyan-400 rounded-full animate-spin" />
              ) : (
                <svg className="w-5 h-5 group-hover:rotate-12 transition-transform" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                </svg>
              )}
              <span>AI 洞察 ({(activeTab === 'github' ? githubRepos.length : soQuestions.length)}项)</span>
            </button>
          </div>
        </div>
      )}

      {/* AI 总结展示区域 */}
      {showAIResult && ['github', 'stackoverflow'].includes(activeTab) && (
        <div className="mb-6 animate-fade-in">
          <div className="relative p-6 rounded-2xl bg-gradient-to-br from-blue-500/10 to-purple-500/5 border border-white/10 shadow-2xl overflow-hidden group">
            <div className="absolute top-0 right-0 p-3">
              <button
                onClick={() => setShowAIResult(false)}
                className="text-gray-500 hover:text-white transition-colors"
                title="关闭总结"
              >
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                </svg>
              </div>
              <h4 className="text-white font-bold">AI 实时洞察结果</h4>
            </div>

            {aiSummary[activeTab as 'github' | 'stackoverflow'] ? (
              <AIMarkdown
                content={aiSummary[activeTab as 'github' | 'stackoverflow']}
                variant="info"
                title={activeTab === 'github' ? 'GitHub热门项目分析' : 'StackOverflow热门问题分析'}
              />
            ) : (
              <div className="text-sm text-gray-400 text-center py-4">
                {isSummarizing[activeTab as 'github' | 'stackoverflow']
                  ? 'AI 正在思考并梳理当前热门内容，请稍候...'
                  : '暂无分析结果'}
              </div>
            )}

            {isSummarizing[activeTab as 'github' | 'stackoverflow'] && (
              <div className="mt-4 flex items-center justify-center gap-2 text-xs text-blue-400/60 animate-pulse">
                <span>AI Deep Analysis in progress</span>
                <span className="flex gap-1">
                  <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="w-1 h-1 bg-blue-400 rounded-full animate-bounce"></span>
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 错误提示 */}
      {currentError && (
        <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
          {currentError}
        </div>
      )}

      {/* 空状态 */}
      {isEmpty && !currentLoading && !currentError && (
        <div className="text-center py-12">
          <div className="w-16 h-16 mx-auto mb-4 bg-white/5 rounded-full flex items-center justify-center">
            <span className="text-3xl">{tabs.find(t => t.id === activeTab)?.icon}</span>
          </div>
          <p className="text-gray-500">点击上方按钮获取内容</p>
        </div>
      )}

      {/* GitHub 列表 */}
      {activeTab === 'github' && githubRepos.length > 0 && (
        <div className="space-y-4">
          {githubRepos.map(repo => (
            <div
              key={repo.id}
              className="block p-5 bg-[#1a2634] hover:bg-[#1f2d3d] rounded-2xl transition-all group cursor-pointer select-none shadow-lg"
              onClick={() => handleCardClick(repo.html_url)}
              onContextMenu={handleContextMenu}
              onMouseDown={(e) => handleLongPressStart(e, {
                title: repo.full_name,
                url: repo.html_url,
                description: repo.description || '',
                time: `创建于 ${formatGitHubDate(repo.created_at)} `
              })}
              onMouseUp={handleLongPressEnd}
              onMouseLeave={handleLongPressEnd}
              onTouchStart={(e) => handleLongPressStart(e, {
                title: repo.full_name,
                url: repo.html_url,
                description: repo.description || '',
                time: `创建于 ${formatGitHubDate(repo.created_at)} `
              })}
              onTouchEnd={handleLongPressEnd}
            >
              <div className="flex items-start gap-4">
                <img src={repo.owner.avatar_url} alt="" className="w-12 h-12 rounded-xl" />
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-semibold group-hover:text-amber-400 transition-colors truncate text-base">
                    {repo.full_name}
                  </h3>
                  <p className="text-gray-400 text-sm line-clamp-2 mt-1.5">{repo.description || '暂无描述'}</p>
                  <div className="flex flex-wrap items-center gap-3 mt-3 text-xs text-gray-500">
                    {repo.language && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: LANGUAGE_COLORS[repo.language] || '#888' }} />
                        {repo.language}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-amber-500/80">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                      {formatNumber(repo.stargazers_count)}
                    </span>
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 18V6h10l-5 6 5 6H7z" /></svg>
                      {formatNumber(repo.forks_count)}
                    </span>
                    <span className="flex items-center gap-1 text-amber-500/60">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
                      {formatGitHubDate(repo.created_at)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Stack Overflow 列表 */}
      {activeTab === 'stackoverflow' && soQuestions.length > 0 && (
        <div className="space-y-4">
          {soQuestions.map(q => (
            <div
              key={q.question_id}
              className="block p-5 bg-[#1a2634] hover:bg-[#1f2d3d] rounded-2xl transition-all group cursor-pointer select-none shadow-lg"
              onClick={() => handleCardClick(q.link)}
              onContextMenu={handleContextMenu}
              onMouseDown={(e) => handleLongPressStart(e, {
                title: q.title,
                url: q.link,
                description: q.tags.slice(0, 3).join(', '),
                time: formatDate(q.creation_date)
              })}
              onMouseUp={handleLongPressEnd}
              onMouseLeave={handleLongPressEnd}
              onTouchStart={(e) => handleLongPressStart(e, {
                title: q.title,
                url: q.link,
                description: q.tags.slice(0, 3).join(', '),
                time: formatDate(q.creation_date)
              })}
              onTouchEnd={handleLongPressEnd}
            >
              <h3 className="text-white font-semibold group-hover:text-amber-400 transition-colors line-clamp-2 text-base">
                {q.title}
              </h3>
              <div className="flex flex-wrap gap-2 mt-3">
                {q.tags.slice(0, 4).map(tag => (
                  <span key={tag} className="px-2.5 py-1 bg-amber-500/10 text-amber-400/80 text-xs rounded-lg">
                    {tag}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-500">
                <span className="flex items-center gap-1 text-amber-500/80">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
                  {q.score} 票
                </span>
                <span>{q.answer_count} 回答</span>
                <span>{formatNumber(q.view_count)} 浏览</span>
                <span className="text-amber-500/60">{formatDate(q.creation_date)}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* iframe 嵌入页面 - 全屏 */}
      {isIframeTab(activeTab) && (
        <div
          className="relative bg-white rounded-xl overflow-hidden"
          style={{
            height: 'calc(100vh - 180px)',
            minHeight: '400px',
          }}
        >
          {!iframeLoaded[activeTab] && (
            <div className="absolute inset-0 flex items-center justify-center bg-[#0c0c14]">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-gray-400 text-sm">加载中...</p>
              </div>
            </div>
          )}
          <iframe
            src={iframeUrls[activeTab]}
            className="w-full h-full border-0"
            onLoad={() => setIframeLoaded(prev => ({ ...prev, [activeTab]: true }))}
            sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
            title={tabs.find(t => t.id === activeTab)?.label || ''}
          />
        </div>
      )}

      {/* 加载更多 - 仅 GitHub 和 Stack Overflow */}
      {!isIframeTab(activeTab) && !isEmpty && currentHasMore && (
        <button
          onClick={handleLoadMore}
          disabled={currentLoading}
          className="w-full mt-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-400 text-sm transition-all disabled:opacity-50"
        >
          {currentLoading ? '加载中...' : '加载更多'}
        </button>
      )}

      {/* 长按提示 - 仅 GitHub 和 Stack Overflow */}
      {!isIframeTab(activeTab) && (
        <p className="text-center text-gray-600 text-xs mt-4">💡 长按卡片可添加到待办</p>
      )}

      {/* 长按菜单 */}
      {showTodoMenu && createPortal(
        <div
          className="fixed inset-0 bg-black/50"
          style={{ zIndex: 999999 }}
          onClick={() => setShowTodoMenu(false)}
        >
          <div
            className="absolute bg-[#1a1a2e] border border-white/20 rounded-xl shadow-2xl overflow-hidden min-w-[180px]"
            style={{
              left: Math.min(menuPosition.x, window.innerWidth - 200),
              top: Math.min(menuPosition.y, window.innerHeight - 100),
              zIndex: 999999,
            }}
            onClick={e => e.stopPropagation()}
          >
            <div className="px-3 py-2 border-b border-white/10">
              <p className="text-xs text-gray-500 truncate max-w-[200px]">{selectedItem?.title}</p>
            </div>
            <button
              onClick={handleAddToTodo}
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/10 transition-colors w-full text-left"
            >
              <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span className="text-white">添加到待办</span>
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && createPortal(
        <div
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 px-6 py-4 bg-[#1a1a2e] border border-cyber-lime/30 rounded-2xl text-white text-sm shadow-2xl max-w-[280px] text-center"
          style={{ zIndex: 9999999, animation: 'fadeInScale 0.2s ease-out' }}
        >
          <p className="text-base">{toast}</p>
        </div>,
        document.body
      )}

      <style>{`
      @keyframes fadeInScale {
          from { opacity: 0; transform: translate(-50 %, -50 %) scale(0.9); }
          to { opacity: 1; transform: translate(-50 %, -50 %) scale(1); }
      }
      `}</style>
    </div>
  );
};

export default DevCommunity;
