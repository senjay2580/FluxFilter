import React, { useState, useEffect, useCallback } from 'react';

// RSS 源配置 - 使用 rss2json API
const RSS_SOURCES = [
  { id: 'sspai', name: '少数派', url: 'https://sspai.com/feed', category: 'AI科技' },
  { id: '36kr', name: '36氪', url: 'https://36kr.com/feed', category: 'AI科技' },
  { id: 'hn', name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'AI科技' },
  { id: 'ruanyifeng', name: '阮一峰周刊', url: 'https://www.ruanyifeng.com/blog/atom.xml', category: '技术' },
  { id: 'oschina', name: '开源中国', url: 'https://www.oschina.net/news/rss', category: '技术' },
  { id: 'ifanr', name: '爱范儿', url: 'https://www.ifanr.com/feed', category: '科技' },
  { id: 'zhihu', name: '知乎热榜', url: 'https://rss.mifaw.com/articles/5c8bb11a3c41f61efd36683e/5c91d2e23882afa09dff4901', category: '热门' },
];

interface Article {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: string;
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
    
    return data.items.slice(0, 10).map((item: any, index: number) => ({
      id: `${source.id}-${index}`,
      title: item.title || '无标题',
      excerpt: (item.description || '').replace(/<[^>]*>/g, '').slice(0, 150) || '暂无摘要',
      author: item.author || source.name,
      publishedAt: formatTimeAgo(item.pubDate),
      link: item.link || '',
      category: source.category,
    }));
  } catch (e) {
    console.warn(`Failed to fetch ${source.name}:`, e);
    return [];
  }
}

interface RssFeedProps {
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
}

const RssFeed: React.FC<RssFeedProps> = ({ scrollContainerRef }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [selectedSource, setSelectedSource] = useState<string>('全部');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const categories = ['全部', 'AI科技', '技术', '科技', '热门'];
  
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

  const filteredArticles = selectedCategory === '全部' 
    ? articles 
    : articles.filter(a => a.category === selectedCategory);

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

      {/* RSS 源选择 */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-2">
        <button
          onClick={() => setSelectedSource('全部')}
          className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-all ${
            selectedSource === '全部'
              ? 'bg-cyber-lime text-black font-medium'
              : 'bg-white/5 text-gray-400 hover:bg-white/10'
          }`}
        >
          全部源
        </button>
        {RSS_SOURCES.map((source) => (
          <button
            key={source.id}
            onClick={() => setSelectedSource(source.id)}
            className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-all ${
              selectedSource === source.id
                ? 'bg-cyber-lime text-black font-medium'
                : 'bg-white/5 text-gray-400 hover:bg-white/10'
            }`}
          >
            {source.name}
          </button>
        ))}
      </div>

      {/* 分类标签 */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-2 py-0.5 rounded text-[10px] whitespace-nowrap transition-all ${
              selectedCategory === cat
                ? 'bg-white/20 text-white'
                : 'text-gray-500 hover:text-gray-300'
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
        <div className="space-y-1">
          {filteredArticles.map((article, index) => (
            <article 
              key={article.id} 
              onClick={() => article.link && window.open(article.link, '_blank')}
              className="group cursor-pointer p-4 -mx-4 rounded-xl hover:bg-white/[0.03] transition-colors"
            >
              {/* 顶部元信息 */}
              <div className="flex items-center gap-2 mb-2 text-xs">
                <span className="text-cyber-lime font-medium">{article.author}</span>
                <span className="text-gray-600">·</span>
                <span className="text-gray-500">{article.publishedAt}</span>
              </div>
              
              {/* 标题 */}
              <h3 className="text-base font-medium text-white mb-2 group-hover:text-cyber-lime transition-colors leading-snug">
                {article.title}
              </h3>
              
              {/* 摘要 */}
              <p className="text-gray-400 text-sm leading-relaxed line-clamp-2 mb-3">
                {article.excerpt}
              </p>
              
              {/* 底部信息 */}
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 bg-white/5 text-gray-500 text-[10px] rounded">
                  {article.category}
                </span>
                <div className="flex-1" />
                {/* 外链图标 */}
                <svg className="w-3 h-3 text-gray-600 opacity-0 group-hover:opacity-100 transition-opacity" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              </div>
              
              {/* 分隔线 */}
              {index < filteredArticles.length - 1 && (
                <div className="mt-4 h-px bg-white/5" />
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
};

export default RssFeed;
