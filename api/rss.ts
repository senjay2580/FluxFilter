import type { VercelRequest, VercelResponse } from '@vercel/node';

// 推荐的 RSS 源列表
const RSS_SOURCES = {
  // AI & 科技
  '36kr': { name: '36氪', url: 'https://36kr.com/feed', category: 'AI科技' },
  'sspai': { name: '少数派', url: 'https://sspai.com/feed', category: 'AI科技' },
  'infoq': { name: 'InfoQ', url: 'https://www.infoq.cn/feed', category: '技术' },
  'oschina': { name: '开源中国', url: 'https://www.oschina.net/news/rss', category: '技术' },
  
  // 科技新闻
  'ifanr': { name: '爱范儿', url: 'https://www.ifanr.com/feed', category: '科技' },
  'geekpark': { name: '极客公园', url: 'https://www.geekpark.net/rss', category: '科技' },
  'pingwest': { name: '品玩', url: 'https://www.pingwest.com/feed', category: '科技' },
  
  // 开发者
  'ruanyifeng': { name: '阮一峰周刊', url: 'https://www.ruanyifeng.com/blog/atom.xml', category: '技术' },
  'coolshell': { name: '酷壳', url: 'https://coolshell.cn/feed', category: '技术' },
  
  // 设计
  'uisdc': { name: '优设', url: 'https://www.uisdc.com/feed', category: '设计' },
  
  // Hacker News
  'hn': { name: 'Hacker News', url: 'https://hnrss.org/frontpage', category: 'AI科技' },
  
  // 产品
  'pmcaff': { name: '人人都是产品经理', url: 'https://www.woshipm.com/feed', category: '产品' },
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { source, url } = req.query;

  // 返回可用的 RSS 源列表
  if (req.method === 'GET' && !source && !url) {
    return res.status(200).json({ sources: RSS_SOURCES });
  }

  // 获取指定源的 RSS
  let targetUrl: string | null = null;
  
  if (source && typeof source === 'string' && RSS_SOURCES[source as keyof typeof RSS_SOURCES]) {
    targetUrl = RSS_SOURCES[source as keyof typeof RSS_SOURCES].url;
  } else if (url && typeof url === 'string') {
    targetUrl = url;
  }

  if (!targetUrl) {
    return res.status(400).json({ error: 'Invalid source or url' });
  }

  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/rss+xml, application/xml, text/xml, */*',
      },
    });

    if (!response.ok) {
      throw new Error(`RSS fetch failed: ${response.status}`);
    }

    const xml = await response.text();
    
    // 返回原始 XML，让前端解析
    res.setHeader('Content-Type', 'application/xml');
    return res.status(200).send(xml);
  } catch (error) {
    console.error('RSS fetch error:', error);
    return res.status(500).json({ error: 'Failed to fetch RSS' });
  }
}
