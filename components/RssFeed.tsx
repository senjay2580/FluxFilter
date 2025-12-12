import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import type { FilterType } from '../types';

// RSS 源配置类型
interface RssSource {
  id: string;
  name: string;
  url: string;
  category: string;
  lastUpdated?: number;
  isCustom?: boolean;
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
  { id: 'sspai', name: '少数派', url: 'https://sspai.com/feed', category: 'AI科技' },
  { id: '36kr', name: '36氪', url: 'https://36kr.com/feed', category: 'AI科技' },
  { id: 'hn', name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'AI科技' },
  { id: 'github-ai', name: 'GitHub AI话题', url: 'https://rsshub.rssforever.com/github/topics/ai', category: 'AI科技' },
  { id: 'ifanr', name: '爱范儿', url: 'https://www.ifanr.com/feed', category: 'AI科技' },
  { id: 'ruanyifeng', name: '阮一峰周刊', url: 'https://www.ruanyifeng.com/blog/atom.xml', category: '技术开发' },
  { id: 'oschina', name: '开源中国', url: 'https://www.oschina.net/news/rss', category: '技术开发' },
  { id: 'stackoverflow', name: 'Stack Overflow', url: 'https://stackoverflow.blog/feed/', category: '技术开发' },
  { id: 'github', name: 'GitHub Blog', url: 'https://github.blog/feed/', category: '技术开发' },
  { id: 'v2ex', name: 'V2EX', url: 'https://www.v2ex.com/feed/tab/tech.xml', category: '技术开发' },
  { id: 'juejin', name: '掘金热门', url: 'https://rsshub.rssforever.com/juejin/trending/all/weekly', category: '技术开发' },
  { id: 'huxiu', name: '虎嗅网', url: 'https://www.huxiu.com/rss/0.xml', category: '商业科技' },
  { id: 'zhihu-daily', name: '知乎日报', url: 'https://rsshub.rssforever.com/zhihu/daily', category: '深度阅读' },
  { id: 'economist', name: '经济学人', url: 'https://www.economist.com/international/rss.xml', category: '深度阅读' },
];

interface Article {
  id: string;
  title: string;
  excerpt: string;
  author: string;
  publishedAt: string;
  rawDate: number;
  link: string;
  category: string;
}

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

async function fetchRssSource(source: RssSource): Promise<Article[]> {
  try {
    const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(source.url)}`;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const response = await fetch(apiUrl, { signal: controller.signal, cache: 'no-cache' });
    clearTimeout(timeoutId);
    if (!response.ok) throw new Error('Fetch failed');
    const data = await response.json();
    if (data.status !== 'ok' || !data.items) throw new Error('Invalid response');
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
    if (e.name === 'AbortError') console.warn(`⏱️ ${source.name} 请求超时`);
    else console.warn(`❌ Failed to fetch ${source.name}:`, e);
    return [];
  }
}

interface RssFeedProps {
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
  timeFilter?: FilterType;
}

function filterByTime(articles: Article[], filter: FilterType): Article[] {
  if (filter === 'all') return articles;
  const now = new Date();
  const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return articles.filter(article => {
    const articleDate = new Date(article.rawDate);
    const articleDayStart = new Date(articleDate.getFullYear(), articleDate.getMonth(), articleDate.getDate());
    const daysDiff = Math.floor((dayStart.getTime() - articleDayStart.getTime()) / (24 * 60 * 60 * 1000));
    switch (filter) {
      case 'today': return daysDiff === 0;
      case 'week': return daysDiff >= 0 && daysDiff < 7;
      case 'month': return daysDiff >= 0 && daysDiff < 30;
      default: return true;
    }
  });
}

const PAGE_SIZE = 20; // 每页显示数量

// 移动端缩放 iframe 组件
const IframeScaled: React.FC<{ src: string; refreshKey: number }> = ({ src, refreshKey }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = React.useState({ scale: 1, containerHeight: 0 });
  const DESKTOP_WIDTH = 1100; // 桌面版宽度

  React.useEffect(() => {
    const updateDimensions = () => {
      if (containerRef.current) {
        const containerWidth = containerRef.current.offsetWidth;
        const containerHeight = containerRef.current.offsetHeight;
        if (window.innerWidth < 768) {
          setDimensions({
            scale: containerWidth / DESKTOP_WIDTH,
            containerHeight: containerHeight,
          });
        } else {
          setDimensions({ scale: 1, containerHeight: containerHeight });
        }
      }
    };
    updateDimensions();
    window.addEventListener('resize', updateDimensions);
    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768;
  const iframeHeight = isMobile && dimensions.scale > 0 ? dimensions.containerHeight / dimensions.scale : '100%';

  return (
    <div ref={containerRef} className="flex-1 overflow-hidden">
      <iframe 
        key={refreshKey}
        src={src}
        className="border-0 origin-top-left"
        style={isMobile ? { 
          width: `${DESKTOP_WIDTH}px`,
          height: iframeHeight,
          transform: `scale(${dimensions.scale})`,
          transformOrigin: 'top left',
        } : {
          width: '100%',
          height: '100%',
        }}
        title="WeWeRSS" 
        allow="clipboard-write" 
      />
    </div>
  );
};

const RssFeed: React.FC<RssFeedProps> = ({ timeFilter = 'all' as FilterType }) => {
  const [articles, setArticles] = useState<Article[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('全部');
  const [selectedSource, setSelectedSource] = useState<string>('全部');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [showManageModal, setShowManageModal] = useState(false);
  const [importForm, setImportForm] = useState({ name: '', url: '', category: 'AI科技' });
  const [importLoading, setImportLoading] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importWarning, setImportWarning] = useState<string | null>(null);
  const [customSources, setCustomSources] = useState<RssSource[]>(loadCustomSources());
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE); // 当前显示数量
  
  // WeWeRSS 相关状态
  const [showWeweModal, setShowWeweModal] = useState(false);
  const [showWeweIframe, setShowWeweIframe] = useState(false);
  const [weweAuthCode, setWeweAuthCode] = useState(() => localStorage.getItem('wewe-auth-code') || '');
  const [weweAuthInput, setWeweAuthInput] = useState('');
  const [weweRefreshKey, setWeweRefreshKey] = useState(0);

  const allSources = useMemo(() => [...DEFAULT_RSS_SOURCES, ...customSources], [customSources]);
  const categories = ['全部', 'AI科技', '技术开发', '商业科技', '深度阅读'];

  const validateRssUrl = async (url: string): Promise<{ valid: boolean; warning?: string; lastUpdate?: Date; errorDetail?: string }> => {
    try {
      const apiUrl = `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;
      const response = await fetch(apiUrl, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) return { valid: false, errorDetail: `HTTP ${response.status}` };
      const data = await response.json();
      if (data.status === 'error') return { valid: false, errorDetail: data.message || '解析失败' };
      if (data.status !== 'ok' || !data.items) return { valid: false, errorDetail: '无法解析 RSS 内容' };
      if (data.items.length === 0) return { valid: true, warning: '该源暂无文章内容' };
      const latestItem = data.items[0];
      const lastUpdate = new Date(latestItem.pubDate);
      if (isNaN(lastUpdate.getTime())) return { valid: true, warning: '无法获取更新时间' };
      const diffDays = Math.floor((Date.now() - lastUpdate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 30) return { valid: true, warning: `该源已 ${diffDays} 天未更新`, lastUpdate };
      return { valid: true, lastUpdate };
    } catch (err: any) {
      if (err.name === 'TimeoutError' || err.name === 'AbortError') return { valid: false, errorDetail: '请求超时' };
      return { valid: false, errorDetail: '网络错误或链接无效' };
    }
  };

  const handleImport = async () => {
    if (!importForm.name.trim() || !importForm.url.trim()) { setImportError('请填写完整信息'); return; }
    if (allSources.some(s => s.url === importForm.url)) { setImportError('该 RSS 源已存在'); return; }
    setImportLoading(true); setImportError(null); setImportWarning(null);
    const validation = await validateRssUrl(importForm.url);
    if (!validation.valid) { setImportError(validation.errorDetail || '无法访问该 RSS 链接'); setImportLoading(false); return; }
    if (validation.warning) setImportWarning(validation.warning);
    const newSource: RssSource = { id: `custom-${Date.now()}`, name: importForm.name.trim(), url: importForm.url.trim(), category: importForm.category, isCustom: true, lastUpdated: validation.lastUpdate?.getTime() };
    const updatedSources = [...customSources, newSource];
    saveCustomSources(updatedSources); setCustomSources(updatedSources); setImportLoading(false);
    if (!validation.warning) { setShowImportModal(false); setImportForm({ name: '', url: '', category: 'AI科技' }); }
  };

  // WeWeRSS 处理函数
  const handleWeweClick = () => {
    if (weweAuthCode) {
      // 自动复制授权码到剪贴板
      navigator.clipboard.writeText(weweAuthCode).catch(() => {});
      setShowWeweIframe(true);
    } else {
      setWeweAuthInput('');
      setShowWeweModal(true);
    }
  };

  const handleWeweSaveAuth = () => {
    if (weweAuthInput.trim()) {
      localStorage.setItem('wewe-auth-code', weweAuthInput.trim());
      setWeweAuthCode(weweAuthInput.trim());
      setShowWeweModal(false);
      setShowWeweIframe(true);
    }
  };

  const weweUrl = weweAuthCode ? `https://fuxf2wechatarticles.zeabur.app/dash?code=${encodeURIComponent(weweAuthCode)}` : '';

  const handleDeleteCustomSource = (sourceId: string) => {
    const updatedSources = customSources.filter(s => s.id !== sourceId);
    saveCustomSources(updatedSources); setCustomSources(updatedSources);
    if (selectedSource === sourceId) setSelectedSource('全部');
  };

  const fetchRss = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const sourcesToFetch = selectedSource === '全部' ? [...allSources] : allSources.filter(s => s.id === selectedSource);
      const results = await Promise.allSettled(sourcesToFetch.map(source => fetchRssSource(source)));
      const allArticles = results.filter((r): r is PromiseFulfilledResult<Article[]> => r.status === 'fulfilled').map(r => r.value).flat();
      allArticles.sort((a, b) => b.rawDate - a.rawDate);
      setArticles(allArticles);
      const failedCount = results.filter(r => r.status === 'rejected').length;
      if (allArticles.length === 0) setError(failedCount === sourcesToFetch.length ? '所有源加载失败' : '暂无数据');
    } catch { setError('加载失败'); }
    finally { setLoading(false); }
  }, [selectedSource, allSources]);

  useEffect(() => { fetchRss(); }, [fetchRss]);

  // 筛选后的全部文章
  const filteredArticles = useMemo(() => {
    const timeFiltered = filterByTime(articles, timeFilter);
    return selectedCategory === '全部' ? timeFiltered : timeFiltered.filter(a => a.category === selectedCategory);
  }, [articles, timeFilter, selectedCategory]);

  // 当前显示的文章（分页）
  const displayedArticles = useMemo(() => filteredArticles.slice(0, displayCount), [filteredArticles, displayCount]);
  const hasMore = displayCount < filteredArticles.length;

  // 筛选条件变化时重置分页
  useEffect(() => { setDisplayCount(PAGE_SIZE); }, [selectedCategory, timeFilter, selectedSource]);

  const loadMore = () => setDisplayCount(prev => Math.min(prev + PAGE_SIZE, filteredArticles.length));


  return (
    <div className="max-w-2xl mx-auto">
      {/* 顶部标题 */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" fill="currentColor" />
            </svg>
            RSS 订阅
          </h1>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowManageModal(true)} className="w-9 h-9 bg-white/10 border border-white/20 rounded-xl flex items-center justify-center text-gray-400 hover:text-white hover:bg-white/20 transition-colors" title="管理订阅源">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
            </button>
            <button onClick={handleWeweClick} className="w-9 h-9 bg-green-500 border border-green-400 rounded-xl flex items-center justify-center text-white hover:bg-green-600 transition-colors" title="微信公众号 (WeWeRSS)">
              <svg className="w-5 h-5" viewBox="0 0 1024 1024" fill="currentColor">
                <path d="M664.250054 368.541681c10.015098 0 19.892049 0.732687 29.67281 1.795902-26.647917-122.810047-159.358451-214.077703-310.826188-214.077703-169.353083 0-308.085774 114.232694-308.085774 259.274068 0 83.708494 46.165436 152.460344 123.281791 205.78483l-30.80868 91.730191 107.688651-53.455469c38.558178 7.53665 69.459978 15.308661 107.924012 15.308661 9.66308 0 19.230993-0.470721 28.752858-1.225765-6.025227-20.36584-9.521864-41.723264-9.521864-63.862493C402.328693 476.632491 517.908058 368.541681 664.250054 368.541681zM498.62897 285.87389c23.200398 0 38.557154 15.120395 38.557154 38.061874 0 22.846334-15.356756 38.156018-38.557154 38.156018-23.107277 0-46.260603-15.309684-46.260603-38.156018C452.368366 300.994285 475.522716 285.87389 498.62897 285.87389zM283.016498 362.090758c-23.107277 0-46.402843-15.309684-46.402843-38.156018 0-22.941478 23.295566-38.061874 46.402843-38.061874 23.081695 0 38.46301 15.120395 38.46301 38.061874C321.479509 346.782098 306.098193 362.090758 283.016498 362.090758zM945.448458 606.151333c0-121.888048-123.258255-221.236753-261.683535-221.236753-146.57838 0-262.015505 99.348706-262.015505 221.236753 0 122.06508 115.437126 221.200938 262.015505 221.200938 30.66644 0 61.617359-7.609305 92.423993-15.262612l84.513836 45.786498-23.178909-76.17757C899.379213 735.776498 945.448458 674.90216 945.448458 606.151333zM598.803483 567.994292c-15.332197 0-30.807656-15.096836-30.807656-30.501688 0-15.190629 15.47546-30.477129 30.807656-30.477129 23.295566 0 38.558178 15.2865 38.558178 30.477129C637.361661 552.897456 622.099049 567.994292 598.803483 567.994292zM768.25071 567.994292c-15.213164 0-30.594479-15.096836-30.594479-30.501688 0-15.190629 15.381315-30.477129 30.594479-30.477129 23.107277 0 38.558178 15.2865 38.558178 30.477129C806.808888 552.897456 791.357987 567.994292 768.25071 567.994292z"/>
              </svg>
            </button>
            <button onClick={() => { setShowImportModal(true); setImportError(null); setImportWarning(null); }} className="w-9 h-9 bg-cyber-lime/20 border border-cyber-lime/30 rounded-xl flex items-center justify-center text-cyber-lime hover:bg-cyber-lime/30 transition-colors" title="添加订阅源">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        </div>
        <p className="text-gray-500 text-sm mt-1">发现值得阅读的优质内容</p>
      </div>

      {/* 源选择下拉框 */}
      <div className="mb-4">
        <button id="rss-dropdown-btn" onClick={() => setIsDropdownOpen(!isDropdownOpen)}
          className="w-full px-4 py-3 rounded-xl bg-[#1a1a1a] border border-white/10 text-white text-sm hover:border-cyber-lime/50 focus:border-cyber-lime focus:outline-none transition-colors cursor-pointer flex items-center justify-between">
          <span className="font-medium truncate">{selectedSource === '全部' ? '📡 全部订阅源' : allSources.find(s => s.id === selectedSource)?.name || '全部订阅源'}</span>
          <svg className={`w-4 h-4 text-cyber-lime transition-transform duration-300 flex-shrink-0 ml-2 ${isDropdownOpen ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 9l-7 7-7-7" /></svg>
        </button>
      </div>

      {/* 下拉选项 Portal */}
      {isDropdownOpen && createPortal(
        <div className="fixed inset-0 z-[9999]" onClick={() => setIsDropdownOpen(false)}>
          <div className="absolute bg-black/50 inset-0" />
          <div className="absolute rounded-xl overflow-hidden max-h-60 overflow-y-auto shadow-[0_8px_32px_rgba(0,0,0,0.8)] bg-[#1a1a1a] border border-white/10"
            style={{ top: (document.getElementById('rss-dropdown-btn')?.getBoundingClientRect().bottom || 0) + 8, left: document.getElementById('rss-dropdown-btn')?.getBoundingClientRect().left || 0, width: document.getElementById('rss-dropdown-btn')?.getBoundingClientRect().width || 'auto' }}
            onClick={e => e.stopPropagation()}>
            <button onClick={() => { setSelectedSource('全部'); setIsDropdownOpen(false); }} className={`w-full px-4 py-3 text-left text-sm transition-colors ${selectedSource === '全部' ? 'bg-cyber-lime/20 text-cyber-lime font-semibold' : 'text-white hover:bg-white/10'}`}>📡 全部订阅源</button>
            {allSources.map((source) => (
              <button key={source.id} onClick={() => { setSelectedSource(source.id); setIsDropdownOpen(false); }}
                className={`w-full px-4 py-3 text-left text-sm transition-colors border-t border-white/5 ${selectedSource === source.id ? 'bg-cyber-lime/20 text-cyber-lime font-semibold' : 'text-white hover:bg-white/10'}`}>
                <div className="flex items-center justify-between"><span className="truncate">{source.name}</span><span className="text-gray-500 text-xs ml-2">{source.category}</span></div>
              </button>
            ))}
          </div>
        </div>, document.body
      )}

      {/* 分类标签 */}
      <div className="flex gap-2 mb-4 overflow-x-auto no-scrollbar pb-2">
        {categories.map((cat) => (
          <button key={cat} onClick={() => setSelectedCategory(cat)}
            className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors border ${selectedCategory === cat ? 'bg-cyber-lime/20 text-cyber-lime border-cyber-lime/30 font-semibold' : 'bg-black/30 text-gray-400 border-white/10 hover:bg-black/40'}`}>
            {cat}
          </button>
        ))}
      </div>

      {/* 文章数量和刷新 */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-xs text-gray-500">共 {filteredArticles.length} 篇文章</span>
        <button onClick={fetchRss} disabled={loading} className="text-xs text-gray-500 hover:text-cyber-lime transition-colors flex items-center gap-1">
          <svg className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
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
          <button onClick={fetchRss} className="px-4 py-2 bg-cyber-lime/20 text-cyber-lime text-sm rounded-lg hover:bg-cyber-lime/30 transition-colors">重试</button>
        </div>
      )}

      {/* 空状态 */}
      {!loading && !error && filteredArticles.length === 0 && (
        <div className="py-12 text-center text-gray-500">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" fill="currentColor" /></svg>
          <p>暂无文章</p>
        </div>
      )}

      {/* 文章列表 */}
      {!loading && !error && filteredArticles.length > 0 && (
        <div className="space-y-2.5">
          {displayedArticles.map((article) => (
            <article key={article.id} onClick={() => article.link && window.open(article.link, '_blank')}
              className="group relative cursor-pointer p-3.5 rounded-xl bg-gradient-to-br from-white/[0.08] to-white/[0.04] border border-white/[0.15] hover:border-cyber-lime/50 transition-colors hover:shadow-[0_0_40px_rgba(163,230,53,0.15)]">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-4 rounded-full bg-gradient-to-br from-cyber-lime/40 to-cyber-lime/20 flex items-center justify-center">
                    <span className="text-[9px] font-bold text-cyber-lime">{article.author.charAt(0)}</span>
                  </div>
                  <span className="text-cyber-lime font-medium text-[11px]">{article.author}</span>
                </div>
                <span className="text-gray-600 text-xs">·</span>
                <span className="text-gray-400 text-[11px] flex items-center gap-1 px-2 py-0.5 rounded-md bg-black/20">
                  <svg className="w-2.5 h-2.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                  {article.publishedAt}
                </span>
                <div className="flex-1" />
                <span className="px-2 py-0.5 bg-white/10 border border-white/20 rounded-full text-[9px] text-gray-300">{article.category}</span>
              </div>
              <h3 className="text-[13px] font-semibold text-white/95 mb-1.5 group-hover:text-cyber-lime transition-colors line-clamp-2">{article.title}</h3>
              <p className="text-gray-400/90 text-xs leading-relaxed line-clamp-2 mb-2.5">{article.excerpt}</p>
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.08]">
                <span className="text-[11px] text-gray-500 group-hover:text-cyber-lime/90 transition-colors flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" /></svg>
                  阅读全文
                </span>
                <div className="flex items-center gap-1 text-gray-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  <span className="text-[9px]">前往</span>
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M7 17L17 7" /><path d="M7 7h10v10" /></svg>
                </div>
              </div>
            </article>
          ))}
          
          {/* 加载更多按钮 */}
          {hasMore && (
            <button onClick={loadMore}
              className="w-full py-3 mt-4 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-gray-400 hover:text-white text-sm transition-colors flex items-center justify-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12l7 7 7-7"/></svg>
              加载更多 ({filteredArticles.length - displayCount} 篇)
            </button>
          )}
          
          {/* 已加载全部提示 */}
          {!hasMore && filteredArticles.length > PAGE_SIZE && (
            <div className="text-center py-4 text-gray-500 text-xs">已加载全部 {filteredArticles.length} 篇文章</div>
          )}
        </div>
      )}


      {/* RSS 导入模态框 */}
      {showImportModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={() => !importLoading && setShowImportModal(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative w-full max-w-md bg-[#0c0c0c] rounded-3xl border border-white/10 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 11a9 9 0 0 1 9 9" /><path d="M4 4a16 16 0 0 1 16 16" /><circle cx="5" cy="19" r="1" fill="currentColor" /></svg>
              添加 RSS 源
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">源名称</label>
                <input type="text" value={importForm.name} onChange={e => setImportForm(prev => ({ ...prev, name: e.target.value }))} placeholder="例如：我的博客"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyber-lime/50 focus:outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">RSS 链接</label>
                <input type="url" value={importForm.url} onChange={e => setImportForm(prev => ({ ...prev, url: e.target.value }))} placeholder="https://example.com/feed.xml"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyber-lime/50 focus:outline-none transition-colors" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">分类</label>
                <select value={importForm.category} onChange={e => setImportForm(prev => ({ ...prev, category: e.target.value }))}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white focus:border-cyber-lime/50 focus:outline-none transition-colors">
                  {categories.slice(1).map(cat => (<option key={cat} value={cat} className="bg-[#1a1a1a] text-white">{cat}</option>))}
                </select>
              </div>
              {importError && (
                <div className="p-3 bg-red-500/20 border border-red-500/30 rounded-xl text-red-400 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                  {importError}
                </div>
              )}
              {importWarning && (
                <div className="p-3 bg-amber-500/20 border border-amber-500/30 rounded-xl text-amber-400 text-sm">
                  <p>{importWarning}</p>
                  <button onClick={() => { setShowImportModal(false); setImportForm({ name: '', url: '', category: 'AI科技' }); setImportWarning(null); }}
                    className="mt-3 w-full py-2 bg-amber-500/30 hover:bg-amber-500/40 rounded-lg text-amber-300 font-medium transition-colors">我知道了</button>
                </div>
              )}
              {!importWarning && (
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowImportModal(false)} disabled={importLoading} className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors disabled:opacity-50">取消</button>
                  <button onClick={handleImport} disabled={importLoading || !importForm.name.trim() || !importForm.url.trim()}
                    className="flex-1 py-3 bg-cyber-lime hover:bg-cyber-lime/90 rounded-xl text-black font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2">
                    {importLoading ? (<><svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"/></svg>验证中...</>) : '添加'}
                  </button>
                </div>
              )}
            </div>
            {customSources.length > 0 && !importWarning && (
              <div className="mt-6 pt-4 border-t border-white/10">
                <h3 className="text-sm text-gray-400 mb-3">已添加的自定义源</h3>
                <div className="space-y-2 max-h-32 overflow-y-auto">
                  {customSources.map(source => (
                    <div key={source.id} className="flex items-center justify-between p-2 bg-white/5 rounded-lg">
                      <div className="flex-1 min-w-0"><p className="text-white text-sm truncate">{source.name}</p><p className="text-gray-500 text-xs truncate">{source.category}</p></div>
                      <button onClick={() => handleDeleteCustomSource(source.id)} className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>, document.body
      )}

      {/* 管理订阅源模态框 */}
      {showManageModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={() => setShowManageModal(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative w-full max-w-md bg-[#0c0c0c] rounded-3xl border border-white/10 p-6 max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/></svg>
              管理订阅源
            </h2>
            <div className="flex-1 overflow-y-auto -mx-6 px-6">
              <div className="mb-4">
                <h3 className="text-sm text-gray-400 mb-2 sticky top-0 bg-[#0c0c0c] py-1">默认订阅源 ({DEFAULT_RSS_SOURCES.length})</h3>
                <div className="space-y-2">
                  {DEFAULT_RSS_SOURCES.map(source => (
                    <div key={source.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl">
                      <div className="flex-1 min-w-0"><p className="text-white text-sm font-medium truncate">{source.name}</p><p className="text-gray-500 text-xs truncate">{source.category}</p></div>
                      <span className="px-2 py-0.5 bg-black/30 rounded text-gray-400 text-xs">内置</span>
                    </div>
                  ))}
                </div>
              </div>
              {customSources.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-sm text-gray-400 mb-2 sticky top-0 bg-[#0c0c0c] py-1">自定义订阅源 ({customSources.length})</h3>
                  <div className="space-y-2">
                    {customSources.map(source => (
                      <div key={source.id} className="flex items-center justify-between p-3 bg-white/5 border border-white/10 rounded-xl">
                        <div className="flex-1 min-w-0"><p className="text-white text-sm font-medium truncate">{source.name}</p><p className="text-gray-500 text-xs truncate">{source.category}</p></div>
                        <button onClick={() => handleDeleteCustomSource(source.id)} className="p-2 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="flex gap-2 pt-4 border-t border-white/10 mt-4">
              <button onClick={() => setShowManageModal(false)} className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors text-sm">关闭</button>
              <button onClick={() => { setShowManageModal(false); setShowImportModal(true); setImportError(null); }}
                className="flex-1 py-3 bg-cyber-lime hover:bg-cyber-lime/90 rounded-xl text-black font-medium transition-colors flex items-center justify-center gap-1 text-sm">
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                添加
              </button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* WeWeRSS 授权码配置模态框 */}
      {showWeweModal && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={() => setShowWeweModal(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div className="relative w-full max-w-md bg-[#0c0c0c] rounded-3xl border border-white/10 p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <svg className="w-5 h-5 text-green-400" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8.691 2.188C3.891 2.188 0 5.476 0 9.53c0 2.212 1.17 4.203 3.002 5.55a.59.59 0 0 1 .213.665l-.39 1.48c-.019.07-.048.141-.048.213 0 .163.13.295.29.295a.326.326 0 0 0 .167-.054l1.903-1.114a.864.864 0 0 1 .717-.098 10.16 10.16 0 0 0 2.837.403c.276 0 .543-.027.811-.05-.857-2.578.157-4.972 1.932-6.446 1.703-1.415 3.882-1.98 5.853-1.838-.576-3.583-4.196-6.348-8.596-6.348z"/>
              </svg>
              配置 WeWeRSS
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1.5">授权码 (Auth Code)</label>
                <input type="text" value={weweAuthInput} onChange={e => setWeweAuthInput(e.target.value)} placeholder="请输入 WeWeRSS 授权码"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-green-500/50 focus:outline-none transition-colors" />
                <p className="text-xs text-gray-500 mt-2">授权码用于访问 WeWeRSS 服务，可从服务提供方获取</p>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowWeweModal(false)} className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors">取消</button>
                <button onClick={handleWeweSaveAuth} disabled={!weweAuthInput.trim()}
                  className="flex-1 py-3 bg-green-500 hover:bg-green-500/90 rounded-xl text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                  保存并打开
                </button>
              </div>
              {weweAuthCode && (
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-gray-500 mb-2">当前已配置授权码</p>
                  <div className="flex items-center gap-2">
                    <span className="flex-1 text-sm text-green-400 truncate">{weweAuthCode.slice(0, 20)}...</span>
                    <button onClick={() => { localStorage.removeItem('wewe-auth-code'); setWeweAuthCode(''); }}
                      className="text-xs text-red-400 hover:text-red-300">清除</button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>, document.body
      )}

      {/* WeWeRSS 全屏 iframe */}
      {showWeweIframe && createPortal(
        <div className="fixed inset-0 z-[999999] bg-[#0c0c0c] flex flex-col">
          {/* 顶部导航栏 - 移动端适配 */}
          <div className="flex items-center gap-2 px-2 py-2 bg-[#1a1a1a] border-b border-white/10">
            <button onClick={() => setShowWeweIframe(false)}
              className="flex items-center gap-1 px-2 py-1.5 bg-white/10 hover:bg-white/20 rounded-lg text-white text-xs transition-colors shrink-0">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              <span className="hidden xs:inline">返回</span>
            </button>
            {/* 授权码复制按钮 */}
            <button onClick={() => { navigator.clipboard.writeText(weweAuthCode); }}
              className="flex-1 flex items-center justify-center gap-1.5 px-2 py-1.5 bg-green-500/20 hover:bg-green-500/30 rounded-lg text-green-400 text-xs transition-colors min-w-0" title="点击复制授权码">
              <span className="truncate">{weweAuthCode}</span>
              <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            </button>
            <button onClick={() => setWeweRefreshKey(k => k + 1)}
              className="p-1.5 text-gray-400 hover:text-white transition-colors shrink-0" title="刷新页面">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M23 4v6h-6M1 20v-6h6M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            </button>
          </div>
          {/* iframe - 移动端缩放显示桌面版 */}
          <IframeScaled src="https://fuxf2wechatarticles.zeabur.app/dash" refreshKey={weweRefreshKey} />
        </div>, document.body
      )}
    </div>
  );
};

export default RssFeed;
