import type { VercelRequest, VercelResponse } from '@vercel/node';

/**
 * 解析B站短链接(b23.tv)到完整URL
 * 用于解决浏览器端CORS限制
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  // 验证是否是B站短链接
  if (!url.match(/^https?:\/\/(b23\.tv|bili2233\.cn)\//)) {
    return res.status(400).json({ error: 'Invalid short link domain' });
  }

  try {
    // 禁用缓存
    res.setHeader('Cache-Control', 'no-store');
    
    // 使用fetch跟随重定向
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });

    // 从最终URL中提取BV号
    const finalUrl = response.url;
    const bvMatch = finalUrl.match(/BV[a-zA-Z0-9]{10}/i);

    if (bvMatch) {
      return res.status(200).json({
        success: true,
        finalUrl,
        bvid: bvMatch[0],
      });
    } else {
      return res.status(200).json({
        success: false,
        finalUrl,
        error: 'No BV ID found in resolved URL',
      });
    }
  } catch (error) {
    console.error('Short link resolution error:', error);
    return res.status(500).json({
      success: false,
      error: 'Failed to resolve short link',
    });
  }
}
