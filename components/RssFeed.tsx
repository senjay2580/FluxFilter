import React, { useState, useEffect, useCallback } from 'react';

// 生成模拟文章数据
const generateArticles = (count: number, startId: number) => {
  const categories = ['技术', '设计', '产品', '后端', '生活', '前端', '架构', '运维'];
  const authors = ['前端观察', '设计手记', 'PM Weekly', '码农日记', '生活实验室', '技术周刊', '架构师之路', '云原生实践'];
  const titles = [
    'React 19 新特性深度解析：Server Components 实战',
    '设计系统构建指南：从 0 到 1 的完整方案',
    'AI 产品思维革命：ChatGPT 背后的产品逻辑',
    '系统设计从入门到精通：高并发架构实战',
    '极简主义生活实践：断舍离的 100 天',
    'TypeScript 5.0 完全指南：类型体操进阶',
    '微服务架构最佳实践：服务拆分与治理',
    'Kubernetes 生产环境部署：踩坑与填坑',
    '前端性能优化技巧：Core Web Vitals 实战',
    'GraphQL vs REST API：技术选型指南',
    '数据库索引优化策略：MySQL 性能调优',
    'Docker 容器化实战：从开发到部署',
    '代码重构的艺术：让代码更优雅',
    '敏捷开发团队管理：Scrum 实践心得',
    '开源项目贡献指南：如何参与顶级项目',
  ];
  const excerpts = [
    '深入探讨最新技术趋势和最佳实践，为开发者提供有价值的见解。',
    '从实际项目出发，分享团队在技术选型和架构设计中的经验教训。',
    '结合行业案例，探讨技术与业务的结合点，帮助读者拓宽视野。',
    '详细解析核心概念和实现原理，让复杂问题变得简单易懂。',
  ];
  
  return Array.from({ length: count }, (_, i) => ({
    id: String(startId + i),
    title: titles[(startId + i) % titles.length],
    excerpt: excerpts[(startId + i) % excerpts.length],
    author: authors[(startId + i) % authors.length],
    publishedAt: `12月${10 - (i % 10)}日`,
    readTime: `${3 + (i % 12)} 分钟`,
    category: categories[(startId + i) % categories.length],
  }));
};

const RssFeed: React.FC = () => {
  const [articles, setArticles] = useState(() => generateArticles(15, 1));
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [loading, setLoading] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  
  const categories = ['全部', '技术', '设计', '产品', '后端', '生活', '前端'];
  
  const filteredArticles = selectedCategory === '全部' 
    ? articles 
    : articles.filter(a => a.category === selectedCategory);

  // 加载更多文章
  const loadMore = useCallback(() => {
    if (loading || !hasMore) return;
    
    setLoading(true);
    // 模拟网络请求延迟
    setTimeout(() => {
      const newArticles = generateArticles(10, articles.length + 1);
      setArticles(prev => [...prev, ...newArticles]);
      setLoading(false);
      // 模拟数据加载完毕
      if (articles.length >= 50) {
        setHasMore(false);
      }
    }, 800);
  }, [articles.length, loading, hasMore]);

  // 无限滚动监听
  useEffect(() => {
    const handleScroll = () => {
      if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 300) {
        loadMore();
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [loadMore]);

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

      {/* 分类标签 */}
      <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar pb-2">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1 rounded-full text-xs whitespace-nowrap transition-all duration-300 ${
              selectedCategory === cat
                ? 'bg-cyber-lime text-black font-medium'
                : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* 文章数量 */}
      <div className="mb-4 text-xs text-gray-500">
        共 {filteredArticles.length} 篇文章
      </div>

      {/* 文章列表 */}
      <div className="space-y-1">
        {filteredArticles.map((article, index) => (
          <article 
            key={article.id} 
            className="group cursor-pointer p-4 -mx-4 rounded-xl hover:bg-white/[0.03] transition-colors"
          >
            {/* 顶部元信息 */}
            <div className="flex items-center gap-2 mb-2 text-xs">
              <span className="text-cyber-lime font-medium">{article.author}</span>
              <span className="text-gray-600">·</span>
              <span className="text-gray-500">{article.publishedAt}</span>
              <span className="text-gray-600">·</span>
              <span className="text-gray-500">{article.readTime}</span>
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
              {/* 操作按钮 */}
              <button className="p-1 text-gray-600 hover:text-cyber-lime transition-colors opacity-0 group-hover:opacity-100">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M5 5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16l-7-3.5L5 21V5z" />
                </svg>
              </button>
              <button className="p-1 text-gray-600 hover:text-cyber-lime transition-colors opacity-0 group-hover:opacity-100">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16,6 12,2 8,6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </button>
            </div>
            
            {/* 分隔线 */}
            {index < filteredArticles.length - 1 && (
              <div className="mt-4 h-px bg-white/5" />
            )}
          </article>
        ))}
      </div>

      {/* 加载状态 */}
      {loading && (
        <div className="py-8 flex justify-center">
          <div className="flex items-center gap-2 text-gray-500 text-sm">
            <div className="w-4 h-4 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin" />
            加载中...
          </div>
        </div>
      )}
      
      {/* 已加载全部 */}
      {!hasMore && !loading && (
        <div className="py-8 text-center text-gray-600 text-xs">
          — 已加载全部文章 —
        </div>
      )}
    </div>
  );
};

export default RssFeed;
