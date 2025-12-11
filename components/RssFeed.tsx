import React, { useState, useEffect, useCallback } from 'react';

// RSS 源配置
const RSS_SOURCES = [
  { id: '36kr', name: '36氪', category: 'AI科技' },
  { id: 'sspai', name: '少数派', category: 'AI科技' },
  { id: 'hn', name: 'Hacker News', category: 'AI科技' },
  { id: 'infoq', name: 'InfoQ', category: '技术' },
  { id: 'ruanyifeng', name: '阮一峰周刊', category: '技术' },
  { id: 'ifanr', name: '爱范儿', category: '科技' },
  { id: 'geekpark', name: '极客公园', category: '科技' },
  { id: 'uisdc', name: '优设', category: '设计' },
  { id: 'pmcaff', name: '人人都是PM', category: '产品' },
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

// 解析 RSS XML
function parseRssXml(xml: string, sourceName: string, category: string): Article[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xml, 'text/xml');
  const items = doc.querySelectorAll('item, entry');
  
  const articles: Article[] = [];
  items.forEach((item, index) => {
    if (index >= 10) return; // 每个源最多10条
    
    const title = item.querySelector('title')?.textContent || '';
    const description = item.querySelector('description, summary, content')?.textContent || '';
    const link = item.querySelector('link')?.textContent || item.querySelector('link')?.getAttribute('href') || '';
    const pubDate = item.querySelector('pubDate, published, updated')?.textContent || '';
    
    // 清理 HTML 标签
    const cleanExcerpt = description.replace(/<[^>]*>/g, '').slice(0, 150);
    
    // 格式化日期
    let formattedDate = '未知';
    if (pubDate) {
      const date = new Date(pubDate);
      if (!isNaN(date.getTime())) {
        const now = new Date();
        const diffHours = Math.floor((now.getTime() - date.getTime()) / 3600000);
        if (diffHours < 1) formattedDate = '刚刚';
        else if (diffHours < 24) formattedDate = `${diffHours}小时前`;
        else if (diffHours < 168) formattedDate = `${Math.floor(diffHours / 24)}天前`;
        else formattedDate = `${date.getMonth() + 1}月${date.getDate()}日`;
      }
    }
    
    articles.push({
      id: `${sourceName}-${index}`,
      title: title.trim(),
      excerpt: cleanExcerpt.trim() || '暂无摘要',
      author: sourceName,
      publishedAt: formattedDate,
      link,
      category,
    });
  });
  
  return articles;
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
  
  const categories = ['全部', 'AI科技', '技术', '科技', '设计', '产品'];
  
  // 获取 RSS 数据
  const fetchRss = useCallback(async () => {
    setLoading(true);
    setError(null);
    
    try {
      const allArticles: Article[] = [];
      
      // 根据选择的源获取数据
      const sourcesToFetch = selectedSource === '全部' 
        ? RSS_SOURCES 
        : RSS_SOURCES.filter(s => s.id === selectedSource);
      
      for (const source of sourcesToFetch) {
        try {
          const response = await fetch(`/api/rss?source=${source.id}`);
          if (response.ok) {
            const xml = await response.text();
            const parsed = parseRssXml(xml, source.name, source.category);
            allArticles.push(...parsed);
          }
        } catch (e) {
          console.warn(`Failed to fetch ${source.name}:`, e);
        }
      }
      
      // 按时间排序（简单排序）
      allArticles.sort((a, b) => {
        if (a.publishedAt.includes('刚刚')) return -1;
        if (b.publishedAt.includes('刚刚')) return 1;
        if (a.publishedAt.includes('小时')) return -1;
        if (b.publishedAt.includes('小时')) return 1;
        return 0;
      });
      
      setArticles(allArticles);
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
