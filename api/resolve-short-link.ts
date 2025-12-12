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
  res.setHeader('Cache-Control', 'no-store');

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
    // 手动跟随重定向，获取 Location 头
    let currentUrl = url;
    let finalUrl = url;
    
    for (let i = 0; i < 5; i++) { // 最多跟随5次重定向
      const response = await fetch(currentUrl, {
        method: 'HEAD',
        redirect: 'manual', // 不自动跟随重定向
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      });

      // 检查是否是重定向响应
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          // 处理相对路径
          currentUrl = location.startsWith('http') ? location : new URL(location, currentUrl).href;
          finalUrl = currentUrl;
          continue;
        }
      }
      
      // 不是重定向，结束循环
      finalUrl = currentUrl;
      break;
    }

    // 从最终URL中提取BV号
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
