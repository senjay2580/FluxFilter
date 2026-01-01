/**
 * YouTube API 代理
 * 
 * 代理 YouTube Data API v3 请求
 * 优先使用用户自定义的 API Key，否则使用环境变量
 */

import type { VercelRequest, VercelResponse } from '@vercel/node';

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';
const DEFAULT_API_KEY = process.env.YOUTUBE_API_KEY || '';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // 设置 CORS 头
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-YouTube-Api-Key');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // 优先使用请求头中的用户 API Key，否则使用环境变量
  const userApiKey = req.headers['x-youtube-api-key'] as string || '';
  const apiKey = userApiKey || DEFAULT_API_KEY;

  if (!apiKey) {
    return res.status(400).json({ 
      error: { 
        code: 400, 
        message: '请先配置 YouTube API Key' 
      } 
    });
  }

  const { path } = req.query;

  if (!path || typeof path !== 'string') {
    return res.status(400).json({ error: { code: 400, message: 'Missing path parameter' } });
  }

  // 解码 path 参数
  const decodedPath = decodeURIComponent(path);

  // 构建完整的 URL
  const targetUrl = new URL(`${YOUTUBE_API_BASE}${decodedPath.startsWith('/') ? decodedPath : '/' + decodedPath}`);
  
  // 添加 API Key
  targetUrl.searchParams.set('key', apiKey);

  try {
    const response = await fetch(targetUrl.toString(), {
      headers: {
        'Accept': 'application/json',
      },
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json(data);
  } catch (error) {
    console.error('YouTube Proxy error:', error);
    return res.status(500).json({ 
      error: { 
        code: 500, 
        message: 'Failed to fetch from YouTube API' 
      } 
    });
  }
}
