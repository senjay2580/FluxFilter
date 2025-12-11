import React, { useState, useEffect, useCallback } from 'react';
import type { FilterType } from '../types';

// RSS 源配置 - 使用 rss2json API
const RSS_SOURCES = [
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

// 使用 rss2json API 获取数据
async function fetchRssSource(source: typeof RSS_SOURCES[0]): Promise<Article[]> {
  try {
    // 使用 rss2json.com 免费 API（每天1000次请求）
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`;
    const response = await fetch(apiUrl);
    
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
  } catch (e) {
    console.warn(`Failed to fetch ${source.name}:`, e);
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
  
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;
  
  return articles.filter(article => {
    const diff = now - article.rawDate;
    switch (filter) {
      case 'today':
        return diff < dayMs;
      case 'week':
        return diff < 7 * dayMs;
      case 'month':
        return diff < 30 * dayMs;
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
  
  const categories = ['全部', 'AI科技', '技术开发', '商业科技', '深度阅读'];
  
  // 获取 RSS 数据
  const fetchRss = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      // 根据选择的源获取数据
      const sourcesToFetch = selectedSource === '全部' 
        ? RSS_SOURCES 
        : RSS_SOURCES.filter(s => s.id === selectedSource);
      
      // 并行获取所有源
      const results = await Promise.all(
        sourcesToFetch.map(source => fetchRssSource(source))
      );
      
      const allArticles = results.flat();
      
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
      
      if (allArticles.length === 0) {
        setError('暂无数据，请稍后重试');
      }
    } catch (e) {
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
        <h1 className="text-xl font-bold text-white mb-1 flex items-center gap-2">
          <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 11a9 9 0 0 1 9 9" />
            <path d="M4 4a16 16 0 0 1 16 16" />
            <circle cx="5" cy="19" r="1" fill="currentColor" />
          </svg>
          RSS 订阅
        </h1>
        <p className="text-gray-500 text-sm">发现值得阅读的优质内容</p>
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
                {RSS_SOURCES.find(s => s.id === selectedSource)?.name}
                <span className="text-gray-400 text-xs ml-2">
                  ({RSS_SOURCES.find(s => s.id === selectedSource)?.category})
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

            {/* 选项列表 - 毛玻璃效果但文字清晰 */}
            <div className="absolute top-full left-0 right-0 mt-2 rounded-xl overflow-hidden z-50 max-h-80 overflow-y-auto animate-slide-down shadow-[0_8px_32px_rgba(0,0,0,0.8)]">
              {/* 毛玻璃背景层 */}
              <div className="absolute inset-0 backdrop-blur-2xl bg-white/[0.08] border border-white/20 rounded-xl" />

              {/* 内容层 - 不受模糊影响 */}
              <div className="relative z-10">
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

                {RSS_SOURCES.map((source) => (
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
                  <span className="px-1.5 py-0.5 bg-gradient-to-r from-white/20 to-white/10 backdrop-blur-sm text-gray-300 text-[9px] rounded-full border border-white/20">
                    {article.category}
                  </span>
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
    </div>
  );
};

export default RssFeed;
