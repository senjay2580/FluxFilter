import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import type { FilterType } from '../types';

// RSS 源配置类型
interface RssSource {
  id: string;
  name: string;
  url: string;
  category: string;
  lastUpdated?: number; // 上次更新时间戳
  isCustom?: boolean;   // 是否自定义添加
}

// 本地存储 key
const RSS_STORAGE_KEY = 'custom-rss-sources';

// 加载自定义 RSS 源
const loadCustomSources = (): RssSource[] => {
  try {
    return JSON.parse(localStorage.getItem(RSS_STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

// 保存自定义 RSS 源
const saveCustomSources = (sources: RssSource[]) => {
  localStorage.setItem(RSS_STORAGE_KEY, JSON.stringify(sources));
};

// 默认 RSS 源配置
const DEFAULT_RSS_SOURCES: RssSource[] = [
  // AI & 科技
  { id: 'sspai', name: '少数派', url: 'https://sspai.com/feed', category: 'AI科技' },
  { id: '36kr', name: '36氪', url: 'https://36kr.com/feed', category: 'AI科技' },
  { id: 'hn', name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'AI科技' },
  { id: 'github-ai', name: 'GitHub AI话题', url: 'https://rsshub.rssforever.com/github/topics/ai', category: 'AI科技' },
  { id: 'ifanr', name: '爱范儿', url: 'https://www.ifanr.com/feed', category: 'AI科技' },

  // 技术开发
  { id: 'ruanyifeng', name: '阮一峰周刊', url: 'https://www.ruanyifeng.com/blog/atom.xml', category: '技术开发' },
  { id: 'oschina', name: '开源中国', url: 'https://www.oschina.net/news/rss', category: '技术开发' },
  { id: 'stackoverflow', name: 'Stack Overflow', url: 'https://stackoverflow.blog/feed/', category: '技术开发' },
  { id: 'github', name: 'GitHub Blog', url: 'https://github.blog/feed/', category: '技术开发' },
  { id: 'v2ex', name: 'V2EX', url: 'https://www.v2ex.com/feed/tab/tech.xml', category: '技术开发' },
  { id: 'juejin', name: '掘金热门', url: 'https://rsshub.rssforever.com/juejin/trending/all/weekly', category: '技术开发' },

  // 商业科技
  { id: 'huxiu', name: '虎嗅网', url: 'https://www.huxiu.com/rss/0.xml', category: '商业科技' },

  // 深度内容
  { id: 'zhihu-daily', name: '知乎日报', url: 'https://rsshub.rssforever.com/zhihu/daily', category: '深度阅读' },
  { id: 'economist', name: '经济学人', url: 'https://www.economist.com/international/rss.xml', category: '深度阅读' },
];

// 合并默认源和自定义源
const getAllSources = (): RssSource[] => {
  return [...DEFAULT_RSS_SOURCES, ...loadCustomSources()];
};

interface Article {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: string;
  rawDate: number; // 原始时间戳用于筛选
  link: string;
  category: string;
}

// 格式化相对时间
function formatTimeAgo(dateStr: string): string {
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return '未知';
  
  const now = new Date();
  const diffHours = Math.floor((now.getTime() - date.getTime()) / 3600000);
  
  if (diffHours < 1) return '刚刚';
  if (diffHours < 24) return `${diffHours}小时前`;
  if (diffHours < 168) return `${Math.floor(diffHours / 24)}天前`;
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

// 使用 rss2json API 获取数据，添加超时控制
async function fetchRssSource(source: RssSource): Promise<Article[]> {
  try {
    // 使用 rss2json.com 免费 API（每天1000次请求）
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`;

    // 创建超时控制器
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000); // 8秒超时

    const response = await fetch(apiUrl, {
      signal: controller.signal,
      // 添加缓存控制
      cache: 'no-cache'
    });

    clearTimeout(timeoutId);

    if (!response.ok) throw new Error('Fetch failed');

    const data = await response.json();

    if (data.status !== 'ok' || !data.items) {
      throw new Error('Invalid response');
    }

    return data.items.slice(0, 10).map((item: any, index: number) => {
      const pubDate = new Date(item.pubDate);
      return {
        id: `${source.id}-${index}`,
        title: item.title || '无标题',
        excerpt: (item.description || '').replace(/<[^>]*>/g, '').slice(0, 150) || '暂无摘要',
        author: item.author || source.name,
        publishedAt: formatTimeAgo(item.pubDate),
        rawDate: isNaN(pubDate.getTime()) ? Date.now() : pubDate.getTime(),
        link: item.link || '',
        category: source.category,
      };
    });
  } catch (e: any) {
    // 区分超时错误
    if (e.name === 'AbortError') {
      console.warn(`⏱️ ${source.name} 请求超时`);
    } else {
      console.warn(`❌ Failed to fetch ${source.name}:`, e);
    }
    return [];
  }
}

interface RssFeedProps {
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  timeFilter?: FilterType;
}

// 时间筛选辅助函数
function filterByTime(articles: Article[], filter: FilterType): Article[] {
  if (filter === 'all') return articles;

  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  return articles.filter(article => {
    const articleDate = new Date(article.rawDate);
    const articleDayStart = new Date(articleDate.getFullYear(), articleDate.getMonth(), articleDate.getDate());
    const daysDiff = Math.floor((dayStart.getTime() - articleDayStart.getTime()) / (24 * 60 * 60 * 1000));

    switch (filter) {
      case 'today':
        return daysDiff === 0; // 今天发布的
      case 'week':
        return daysDiff >= 0 && daysDiff < 7; // 最近7天
      case 'month':
        return daysDiff >= 0 && daysDiff < 30; // 最近30天
      default:
        return true;
    }
  });
}

const RssFeed: React.FC<RssFeedProps> = ({ scrollContainerRef, timeFilter = 'all' as FilterType }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [selectedSource, setSelectedSource] = useState<string>('全部');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  
  // RSS 导入相关状态
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [importForm, setImportForm] = useState({ name: '', url: '', category: 'AI科技' });
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [customSources, setCustomSources] = useState<RssSource[]>(loadCustomSources());
  
  const categories = ['全部', 'AI科技', '技术开发', '商业科技', '深度阅读'];

  // 验证 RSS 链接（使用与获取数据相同的 API，确保一致性）
  const validateRssUrl = async (url: string): Promise<{ valid: boolean; warning?: string; lastUpdate?: Date; errorDetail?: string }> => {
    try {
      // 使用 rss2json API 验证
      const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
      const response = await fetch(apiUrl, { 
        signal: AbortSignal.timeout(10000) // 10秒超时
      });
      
      if (!response.ok) {
        return { valid: false, errorDetail: `HTTP ${response.status}` };
      }
      
      const data = await response.json();
      
      // API 返回错误
      if (data.status === 'error') {
        return { valid: false, errorDetail: data.message || '解析失败' };
      }
      
      if (data.status !== 'ok' || !data.items) {
        return { valid: false, errorDetail: '无法解析 RSS 内容' };
      }
      
      // 没有文章但格式正确
      if (data.items.length === 0) {
        return { valid: true, warning: '该源暂无文章内容' };
      }
      
      // 检查最近更新时间
      const latestItem = data.items[0];
      const lastUpdate = new Date(latestItem.pubDate);
      
      // 检查日期是否有效
      if (isNaN(lastUpdate.getTime())) {
        return { valid: true, warning: '无法获取更新时间' };
      }
      
      const now = new Date();
      const diffDays = Math.floor((now.getTime() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
      
      if (diffDays > 30) {
        return { 
          valid: true, 
          warning: `该源已 ${diffDays} 天未更新，可能已停止维护`,
          lastUpdate 
        };
      }
      
      return { valid: true, lastUpdate };
    } catch (err: any) {
      // 区分错误类型
      if (err.name === 'TimeoutError' || err.name === 'AbortError') {
        return { valid: false, errorDetail: '请求超时，请检查链接' };
      }
      return { valid: false, errorDetail: '网络错误或链接无效' };
    }
  };

  // 导入 RSS 源
  const handleImport = async () => {
    if (!importForm.name.trim() || !importForm.url.trim()) {
      setImportError('请填写完整信息');
      return;
    }
    
    // 检查是否已存在
    const allSources = getAllSources();
    if (allSources.some(s => s.url === importForm.url)) {
      setImportError('该 RSS 源已存在');
      return;
    }
    
    setImportLoading(true);
    setImportError(null);
    setImportWarning(null);
    
    // 验证链接
    const validation = await validateRssUrl(importForm.url);
    
    if (!validation.valid) {
      setImportError(validation.errorDetail || '无法访问该 RSS 链接，请检查地址是否正确');
      setImportLoading(false);
      return;
    }
    
    if (validation.warning) {
      setImportWarning(validation.warning);
    }
    
    // 创建新源
    const newSource: RssSource = {
      id: `custom-${Date.now()}`,
      name: importForm.name.trim(),
      url: importForm.url.trim(),
      category: importForm.category,
      isCustom: true,
      lastUpdated: validation.lastUpdate?.getTime(),
    };
    
    // 保存
    const updatedSources = [...customSources, newSource];
    saveCustomSources(updatedSources);
    setCustomSources(updatedSources);
    
    setImportLoading(false);
    
    // 如果没有警告，直接关闭
    if (!validation.warning) {
      setShowImportModal(false);
      setImportForm({ name: '', url: '', category: 'AI科技' });
    }
  };

  // 删除自定义源
  const handleDeleteCustomSource = (sourceId: string) => {
    const updatedSources = customSources.filter(s => s.id !== sourceId);
    saveCustomSources(updatedSources);
    setCustomSources(updatedSources);
    if (selectedSource === sourceId) {
      setSelectedSource('全部');
    }
  };
  
  // 获取 RSS 数据
  const fetchRss = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // 根据选择的源获取数据
      const sourcesToFetch = selectedSource === '全部'
        ? getAllSources()
        : getAllSources().filter(s => s.id === selectedSource);

      // 使用 Promise.allSettled 代替 Promise.all，即使部分失败也能显示成功的
      const results = await Promise.allSettled(
        sourcesToFetch.map(source => fetchRssSource(source))
      );

      // 提取成功的结果
      const allArticles = results
        .filter((result): result is PromiseFulfilledResult<Article[]> => result.status === 'fulfilled')
        .map(result => result.value)
        .flat();

      // 按时间排序
      allArticles.sort((a, b) => {
        const order = ['刚刚', '小时', '天', '月'];
        const getOrder = (s: string) => order.findIndex(o => s.includes(o));
        const aOrder = getOrder(a.publishedAt);
        const bOrder = getOrder(b.publishedAt);
        if (aOrder !== bOrder) return aOrder - bOrder;

        // 同级别内按数字排序
        const aNum = parseInt(a.publishedAt) || 0;
        const bNum = parseInt(b.publishedAt) || 0;
        return aNum - bNum;
      });

      setArticles(allArticles);

      // 统计失败的源
      const failedCount = results.filter(r => r.status === 'rejected').length;

      if (allArticles.length === 0) {
        if (failedCount === sourcesToFetch.length) {
          setError('所有RSS源加载失败，请检查网络连接');
        } else {
          setError('暂无数据，请稍后重试');
        }
      } else if (failedCount > 0) {
        // 部分源失败，显示警告但不阻止显示
        console.warn(`⚠️ ${failedCount}/${sourcesToFetch.length} 个RSS源加载失败`);
      }
    } catch (e) {
      console.error('RSS加载异常:', e);
      setError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, [selectedSource]);

  useEffect(() => {
    fetchRss();
  }, [fetchRss]);

  // 先按时间筛选，再按分类筛选
  const timeFilteredArticles = filterByTime(articles, timeFilter);
  const filteredArticles = selectedCategory === '全部' 
    ? timeFilteredArticles 
    : timeFilteredArticles.filter(a => a.category === selectedCategory);

  return (
    <div className="max-w-2xl mx-auto">
      {/* 顶部标题 */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 11a9 9 0 0 1 9 9" />
              <path d="M4 4a16 16 0 0 1 16 16" />
              <circle cx="5" cy="19" r="1" fill="currentColor" />
            </svg>
            RSS 订阅
          </h1>
          <div className="flex items-center gap-2">
            {/* 管理订阅源按钮 */}
            <button
              onClick={() => setShowManageModal(true)}
              className="w-9 h-9 bg-white/10 border border-white/20 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/20 transition-all active:scale-[0.95]"
              title="管理订阅源"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="20" y2="6"/>
                <line x1="4" y1="12" x2="20" y2="12"/>
                <line x1="4" y1="18" x2="20" y2="18"/>
              </svg>
            </button>
            {/* 添加 RSS 源按钮 */}
            <button
              onClick={() => { setShowImportModal(true); setImportError(null); setImportWarning(null); }}
              className="w-9 h-9 bg-cyber-lime/20 border border-cyber-lime/30 rounded-xl flex items-center justify-center text-cyber-lime hover:bg-cyber-lime/30 transition-all active:scale-[0.95]"
              title="添加订阅源"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/>
                <line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
            </button>
          </div>
        </div>
        <p className="text-gray-500 text-sm mt-1">发现值得阅读的优质内容</p>
      </div>

      {/* RSS 源选择 - 自定义下拉框 */}
      <div className="mb-4 relative z-30">
        <button
          onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-full px-4 py-2.5 rounded-xl backdrop-blur-xl bg-white/10 border border-white/20 text-white text-sm hover:border-cyber-lime/50 focus:border-cyber-lime focus:outline-none transition-all duration-300 cursor-pointer shadow-lg flex items-center justify-between active:scale-[0.98]"
        >
          <span className="font-medium">
            {selectedSource === '全部' ? (
              <>📡 全部源</>
            ) : (
              <>
                {getAllSources().find(s => s.id === selectedSource)?.name}
                <span className="text-gray-400 text-xs ml-2">
                  ({getAllSources().find(s => s.id === selectedSource)?.category})
                </span>
              </>
            )}
          </span>
          <svg
            className={`w-5 h-5 text-cyber-lime transition-transform duration-300 flex-shrink-0 ml-2 ${isDropdownOpen ? 'rotate-180' : ''}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {/* 下拉选项 */}
        {isDropdownOpen && (
          <>
            {/* 背景遮罩 - 淡入动画 */}
            <div
              className="fixed inset-0 z-40 bg-black/50 animate-fade-in"
              onClick={() => setIsDropdownOpen(false)}
            />

            {/* 选项列表 - 统一的毛玻璃效果 */}
            <div className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50 max-h-80 overflow-y-auto animate-slide-down shadow-[0_8px_32px_rgba(0,0,0,0.8)] backdrop-blur-xl bg-white/[0.08] border border-white/20">
              {/* 内容层 */}
              <div className="relative">
                <button
                  onClick={() => {
                    setSelectedSource('全部');
                    setIsDropdownOpen(false);
                  }}
                  className={`w-full px-4 py-3.5 text-left text-sm transition-all duration-200 ${
                    selectedSource === '全部'
                      ? 'bg-cyber-lime/20 text-cyber-lime font-semibold border-l-4 border-cyber-lime'
                      : 'text-white hover:bg-white/10 active:bg-white/15'
                  }`}
                >
                  📡 全部源
                </button>

                {getAllSources().map((source) => (
                  <button
                    key={source.id}
                    onClick={() => {
                      setSelectedSource(source.id);
                      setIsDropdownOpen(false);
                    }}
                    className={`w-full px-4 py-3.5 text-left text-sm transition-all duration-200 border-t border-white/10 ${
                      selectedSource === source.id
                        ? 'bg-cyber-lime/20 text-cyber-lime font-semibold border-l-4 border-cyber-lime'
                        : 'text-white hover:bg-white/10 active:bg-white/15'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>{source.name}</span>
                      <span className="text-gray-400 text-xs">{source.category}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* 动画样式 */}
      <style>{`
        @keyframes fade-in {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slide-down {
          from {
            opacity: 0;
            transform: translateY(-10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fade-in {
          animation: fade-in 0.2s ease-out;
        }

        .animate-slide-down {
          animation: slide-down 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `}</style>

      {/* 分类标签 */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-all backdrop-blur-md border ${
              selectedCategory === cat
                ? 'bg-cyber-lime/20 text-cyber-lime border-cyber-lime/30 font-semibold shadow-lg'
                : 'bg-black/30 text-gray-400 border-white/10 hover:bg-black/40 hover:text-gray-300 hover:border-white/20'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 文章数量和刷新 */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-gray-500">共 {filteredArticles.length} 篇文章</span>
        <button 
          onClick={fetchRss}
          disabled={loading}
          className="text-xs text-gray-500 hover:text-cyber-lime transition-colors flex items-center gap-1"
        >
          <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
          刷新
        </button>
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="py-12 flex justify-center">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <div className="w-4 h-4 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin" />
            正在获取 RSS 源...
          </div>
        </div>
      )}

      {/* 错误状态 */}
      {error && !loading && (
        <div className="py-12 text-center">
          <p className="text-red-400 text-sm mb-4">{error}</p>
          <button 
            onClick={fetchRss}
            className="px-4 py-2 bg-cyber-lime/20 text-cyber-lime text-sm rounded-lg hover:bg-cyber-lime/30 transition-colors"
          >
            重试
          </button>
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && filteredArticles.length === 0 && (
        <div className="py-12 text-center text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M4 11a9 9 0 0 1 9 9" />
            <path d="M4 4a16 16 0 0 1 16 16" />
            <circle cx="5" cy="19" r="1" fill="currentColor" />
          </svg>
          <p>暂无文章</p>
        </div>
      )}

      {/* 文章列表 */}
      {!loading && !error && filteredArticles.length > 0 && (
        <div className="space-y-2.5">
          {filteredArticles.map((article) => (
            <article
              key={article.id}
              onClick={() => article.link && window.open(article.link, '_blank')}
              className="group relative cursor-pointer p-3.5 rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.04] backdrop-blur-sm border border-white/[0.15] hover:border-cyber-lime/50 hover:from-white/[0.12] hover:to-white/[0.06] transition-all duration-300 hover:shadow-[0_0_40px_rgba(163,230,53,0.15)] hover:-translate-y-0.5"
            >
              {/* 内部发光背景层 */}
              <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyber-lime/[0.03] via-transparent to-cyan-500/[0.02] opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* 左侧装饰条 */}
              <div className="absolute left-0 top-3 bottom-3 w-1 bg-gradient-to-b from-cyber-lime/60 via-cyber-lime/30 to-transparent rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

              {/* 内容层 - 相对定位确保在发光层上方 */}
              <div className="relative z-10">
                {/* 顶部元信息 */}
                <div className="flex items-center gap-2 mb-2">
                  <div className="flex items-center gap-1.5">
                    <div className="w-4 h-4 rounded-full bg-gradient-to-br from-cyber-lime/40 to-cyber-lime/20 flex items-center justify-center shadow-[0_0_8px_rgba(163,230,53,0.3)]">
                      <span className="text-[9px] font-bold text-cyber-lime">{article.author.charAt(0)}</span>
                    </div>
                    <span className="text-cyber-lime font-medium text-[11px]">{article.author}</span>
                  </div>
                  <span className="text-gray-600 text-xs">·</span>
                  <span className="text-gray-400 text-[11px] flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/20 backdrop-blur-sm">
                    <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    {article.publishedAt}
                  </span>
                  <div className="flex-1" />
                  {(() => {
                    const categoryStyles: Record<string, string> = {
                      'AI科技': 'from-cyan-500/30 to-cyan-600/20 border-cyan-400/30 text-cyan-300 shadow-[inset_0_1px_0_rgba(34,211,238,0.3),inset_0_-1px_2px_rgba(0,0,0,0.4)]',
                      '技术开发': 'from-violet-500/30 to-violet-600/20 border-violet-400/30 text-violet-300 shadow-[inset_0_1px_0_rgba(139,92,246,0.3),inset_0_-1px_2px_rgba(0,0,0,0.4)]',
                      '商业科技': 'from-amber-500/30 to-amber-600/20 border-amber-400/30 text-amber-300 shadow-[inset_0_1px_0_rgba(245,158,11,0.3),inset_0_-1px_2px_rgba(0,0,0,0.4)]',
                      '深度阅读': 'from-emerald-500/30 to-emerald-600/20 border-emerald-400/30 text-emerald-300 shadow-[inset_0_1px_0_rgba(16,185,129,0.3),inset_0_-1px_2px_rgba(0,0,0,0.4)]',
                    };
                    return (
                      <span className={`px-2 py-0.5 bg-gradient-to-b border rounded-full text-[9px] font-medium ${categoryStyles[article.category] || 'from-white/20 to-white/10 border-white/20 text-gray-300'}`}>
                        {article.category}
                      </span>
                    );
                  })()}
                </div>

                {/* 标题 */}
                <h3 className="text-[13px] font-semibold text-white/95 mb-1.5 group-hover:text-cyber-lime transition-colors duration-300 leading-relaxed line-clamp-2">
                  {article.title}
                </h3>

                {/* 摘要 */}
                <p className="text-gray-400/90 text-xs leading-relaxed line-clamp-2 mb-2.5">
                  {article.excerpt}
                </p>

                {/* 底部操作栏 */}
                <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
                  <div className="flex items-center gap-4">
                    {/* 阅读按钮 */}
                    <span className="text-[11px] text-gray-500 group-hover:text-cyber-lime/90 transition-colors flex items-center gap-1">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                        <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                      </svg>
                      阅读全文
                    </span>
                  </div>

                  {/* 外链图标 */}
                  <div className="flex items-center gap-1 text-gray-500 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-x-1 group-hover:translate-x-0">
                    <span className="text-[9px]">前往</span>
                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M7 17L17 7" />
                      <path d="M7 7h10v10" />
                    </svg>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* RSS 导入模态框 */}
      {showImportModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={() => !importLoading && setShowImportModal(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div 
            className="relative w-full max-w-md bg-[#0c0c0c] rounded-3xl border border-white/10 p-6 animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 11a9 9 0 0 1 9 9" />
                <path d="M4 4a16 16 0 0 1 16 16" />
                <circle cx="5" cy="19" r="1" fill="currentColor" />
              </svg>
              添加 RSS 源
            </h2>
            
            <div className="space-y-4">
              {/* 名称 */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">源名称</label>
                <input
                  type="text"
                  value={importForm.name}
                  onChange={e => setImportForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="例如：我的博客"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyber-lime/50 focus:outline-none transition-colors"
                />
              </div>
              
              {/* URL */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">RSS 链接</label>
                <input
                  type="url"
                  value={importForm.url}
                  onChange={e => setImportForm(prev => ({ ...prev, url: e.target.value }))}
                  placeholder="https://example.com/feed.xml"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyber-lime/50 focus:outline-none transition-colors"
                />
              </div>
              
              {/* 分类 */}
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">分类</label>
                <select
                  value={importForm.category}
                  onChange={e => setImportForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyber-lime/50 focus:outline-none transition-colors appearance-none cursor-pointer"
                  style={{ backgroundImage: 'none' }}
                >
                  {categories.slice(1).map(cat => (
                    <option key={cat} value={cat} className="bg-[#1a1a1a] text-white">{cat}</option>
                  ))}
                </select>
              </div>
              
              {/* 错误提示 */}
              {importError && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="15" y1="9" x2="9" y2="15"/>
                    <line x1="9" y1="9" x2="15" y2="15"/>
                  </svg>
                  {importError}
                </div>
              )}
              
              {/* 警告提示 */}
              {importWarning && (
                <div className="p-3 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-400 text-sm">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/>
                    </svg>
                    <span className="font-medium">警告</span>
                  </div>
                  <p>{importWarning}</p>
                  <p className="mt-2 text-xs text-amber-400/70">源已添加成功，但建议关注更新情况</p>
                  <button
                    onClick={() => { setShowImportModal(false); setImportForm({ name: '', url: '', category: 'AI科技' }); setImportWarning(null); }}
                    className="mt-3 w-full py-2 bg-amber-500/30 hover:bg-amber-500/40 rounded-lg text-amber-300 font-medium transition-colors"
                  >
                    我知道了
                  </button>
                </div>
              )}
              
              {/* 按钮 */}
              {!importWarning && (
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setShowImportModal(false)}
                    disabled={importLoading}
                    className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors disabled:opacity-50"
                  >
                    取消
                  </button>
                  <button
                    onClick={handleImport}
                    disabled={importLoading || !importForm.name.trim() || !importForm.url.trim()}
                    className="flex-1 py-3 bg-cyber-lime hover:bg-cyber-lime/90 rounded-xl text-black font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {importLoading ? (
                      <>
                        <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/>
                        </svg>
                        验证中...
                      </>
                    ) : '添加'}
                  </button>
                </div>
              )}
            </div>
            
            {/* 自定义源列表 */}
            {customSources.length > 0 && !importWarning && (
              <div className="mt-6 pt-4 border-t border-white/10">
                <h3 className="text-sm text-gray-400 mb-3">已添加的自定义源</h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {customSources.map(source => (
                    <div key={source.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{source.name}</p>
                        <p className="text-gray-500 text-xs truncate">{source.category}</p>
                      </div>
                      <button
                        onClick={() => handleDeleteCustomSource(source.id)}
                        className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <style>{`
            @keyframes scale-in {
              from { transform: scale(0.95); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
            .animate-scale-in {
              animation: scale-in 0.2s ease-out;
            }
          `}</style>
        </div>,
        document.body
      )}

      {/* 管理订阅源模态框 */}
      {showManageModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={() => setShowManageModal(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div 
            className="relative w-full max-w-md bg-[#0c0c0c] rounded-3xl border border-white/10 p-6 animate-scale-in max-h-[80vh] overflow-hidden flex flex-col"
            onClick={e => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="4" y1="6" x2="20" y2="6"/>
                <line x1="4" y1="12" x2="20" y2="12"/>
                <line x1="4" y1="18" x2="20" y2="18"/>
              </svg>
              管理订阅源
            </h2>
            
            <div className="flex-1 overflow-y-auto -mx-6 px-6">
              {/* 默认源 */}
              <div className="mb-4">
                <h3 className="text-sm text-gray-400 mb-2 sticky top-0 bg-[#0c0c0c] py-1">默认订阅源 ({DEFAULT_RSS_SOURCES.length})</h3>
                <div className="space-y-2">
                  {DEFAULT_RSS_SOURCES.map(source => {
                    const categoryStyles: Record<string, string> = {
                      'AI科技': 'from-cyan-500/15 to-blue-500/10 border-cyan-500/20 shadow-[inset_0_1px_0_rgba(34,211,238,0.15),inset_0_-1px_2px_rgba(0,0,0,0.3)]',
                      '技术开发': 'from-violet-500/15 to-purple-500/10 border-violet-500/20 shadow-[inset_0_1px_0_rgba(139,92,246,0.15),inset_0_-1px_2px_rgba(0,0,0,0.3)]',
                      '商业科技': 'from-amber-500/15 to-orange-500/10 border-amber-500/20 shadow-[inset_0_1px_0_rgba(245,158,11,0.15),inset_0_-1px_2px_rgba(0,0,0,0.3)]',
                      '深度阅读': 'from-emerald-500/15 to-teal-500/10 border-emerald-500/20 shadow-[inset_0_1px_0_rgba(16,185,129,0.15),inset_0_-1px_2px_rgba(0,0,0,0.3)]',
                    };
                    const categoryTextColors: Record<string, string> = {
                      'AI科技': 'text-cyan-400',
                      '技术开发': 'text-violet-400',
                      '商业科技': 'text-amber-400',
                      '深度阅读': 'text-emerald-400',
                    };
                    return (
                      <div 
                        key={source.id} 
                        className={`flex items-center justify-between p-3 bg-gradient-to-br border rounded-xl ${categoryStyles[source.category] || 'from-white/5 to-white/5 border-white/10'}`}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-sm font-medium truncate">{source.name}</p>
                          <p className={`text-xs truncate ${categoryTextColors[source.category] || 'text-gray-500'}`}>{source.category}</p>
                        </div>
                        <span className="px-2 py-0.5 bg-black/30 rounded text-gray-400 text-xs">内置</span>
                      </div>
                    );
                  })}
                </div>
              </div>
              
              {/* 自定义源 */}
              {customSources.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm text-gray-400 mb-2 sticky top-0 bg-[#0c0c0c] py-1">自定义订阅源 ({customSources.length})</h3>
                  <div className="space-y-2">
                    {customSources.map(source => {
                      const categoryStyles: Record<string, string> = {
                        'AI科技': 'from-cyan-500/15 to-blue-500/10 border-cyan-500/20 shadow-[inset_0_1px_0_rgba(34,211,238,0.15),inset_0_-1px_2px_rgba(0,0,0,0.3)]',
                        '技术开发': 'from-violet-500/15 to-purple-500/10 border-violet-500/20 shadow-[inset_0_1px_0_rgba(139,92,246,0.15),inset_0_-1px_2px_rgba(0,0,0,0.3)]',
                        '商业科技': 'from-amber-500/15 to-orange-500/10 border-amber-500/20 shadow-[inset_0_1px_0_rgba(245,158,11,0.15),inset_0_-1px_2px_rgba(0,0,0,0.3)]',
                        '深度阅读': 'from-emerald-500/15 to-teal-500/10 border-emerald-500/20 shadow-[inset_0_1px_0_rgba(16,185,129,0.15),inset_0_-1px_2px_rgba(0,0,0,0.3)]',
                      };
                      const categoryTextColors: Record<string, string> = {
                        'AI科技': 'text-cyan-400',
                        '技术开发': 'text-violet-400',
                        '商业科技': 'text-amber-400',
                        '深度阅读': 'text-emerald-400',
                      };
                      return (
                        <div 
                          key={source.id} 
                          className={`flex items-center justify-between p-3 bg-gradient-to-br border rounded-xl ${categoryStyles[source.category] || 'from-white/5 to-white/5 border-white/10'}`}
                        >
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-sm font-medium truncate">{source.name}</p>
                            <p className={`text-xs truncate ${categoryTextColors[source.category] || 'text-gray-500'}`}>{source.category}</p>
                          </div>
                          <button
                            onClick={() => handleDeleteCustomSource(source.id)}
                            className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                          >
                            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            
            <div className="flex gap-3 pt-4 border-t border-white/10 mt-4">
              <button
                onClick={() => setShowManageModal(false)}
                className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors"
              >
                关闭
              </button>
              <button
                onClick={() => { setShowManageModal(false); setShowImportModal(true); setImportError(null); }}
                className="flex-1 py-3 bg-cyber-lime hover:bg-cyber-lime/90 rounded-xl text-black font-medium transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="12" y1="5" x2="12" y2="19"/>
                  <line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                添加新源
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};

export default RssFeed;
