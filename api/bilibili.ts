import type { VercelRequest, VercelResponse } from '@vercel/node';

// B站 Cookie（从环境变量获取，作为默认值）
const DEFAULT_COOKIE = process.env.BILIBILI_COOKIE || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Bilibili-Cookie');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { path } = req.query;

  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: 'Missing path parameter' });
  }

  // 解码 path 参数（可能被 encodeURIComponent 编码过）
  const decodedPath = decodeURIComponent(path);

  // 构建完整的 URL
  let targetUrl = '';
  if (decodedPath.startsWith('http')) {
    // 如果 path 是完整 URL (如字幕链接)，直接使用
    targetUrl = decodedPath;
  } else {
    // 否则拼装标准的 B站 API 域名
    targetUrl = `https://api.bilibili.com${decodedPath.startsWith('/') ? decodedPath : '/' + decodedPath}`;
  }

  // 转发所有非控制类查询参数
  const url = new URL(targetUrl);
  Object.entries(req.query).forEach(([key, value]) => {
    if (key !== 'path' && typeof value === 'string') {
      url.searchParams.set(key, value);
    }
  });

  // 优先使用请求头中的用户 Cookie，否则使用环境变量 (作为可选凭据)
  const userCookie = req.headers['x-bilibili-cookie'] as string || '';
  const cookie = userCookie || DEFAULT_COOKIE;

  try {
    const response = await fetch(url.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://www.bilibili.com',
        'Origin': 'https://www.bilibili.com',
        ...(cookie ? { 'Cookie': cookie } : {}),
      },
    });

    if (!response.ok) {
      return res.status(response.status).json({ error: `Bilibili proxy error: ${response.statusText}` });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error('Bilibili Proxy error:', error);
    return res.status(500).json({ error: 'Failed to fetch from Bilibili' });
  }
}
