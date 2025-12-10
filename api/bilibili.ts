import type { VercelRequest, VercelResponse } from '@vercel/node';

// B站 Cookie（从环境变量获取）
const BILIBILI_COOKIE = process.env.BILIBILI_COOKIE || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { path } = req.query;
  
  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  // 构建 B站 API URL
  const biliUrl = `https://api.bilibili.com${path.startsWith('/') ? path : '/' + path}`;
  
  // 转发查询参数
  const url = new URL(biliUrl);
  Object.entries(req.query).forEach(([key, value]) => {
    if (key !== 'path' && typeof value === 'string') {
      url.searchParams.set(key, value);
    }
  });

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        'Origin': 'https://www.bilibili.com',
        'Cookie': BILIBILI_COOKIE,
      },
    });

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Bilibili API error:', error);
    return res.status(500).json({ error: 'Failed to fetch from Bilibili' });
  }
}
