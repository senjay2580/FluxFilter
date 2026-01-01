/**
 * YouTube 字幕代理 API
 * 
 * GET /api/youtube-transcript?videoId=xxx&lang=en
 * 
 * 服务端获取 YouTube 字幕，绕过 CORS 限制
 * 使用 YouTube 内部 API (youtubei) 获取字幕，更稳定
 */

export const config = {
  runtime: 'edge',
};

interface CaptionTrack {
  baseUrl: string;
  languageCode: string;
  name?: { simpleText?: string };
  kind?: string;
}

// 从 YouTube 页面提取字幕轨道
function extractCaptionTracks(html: string): CaptionTrack[] | null {
  // 方法1: 直接匹配 captionTracks 数组
  const patterns = [
    /"captionTracks":\s*(\[[\s\S]*?\])(?=\s*[,}])/,
    /\"captionTracks\":\s*(\[[\s\S]*?\])\s*,\s*\"audioTracks\"/,
    /\"captionTracks\":\s*(\[[\s\S]*?\])\s*,\s*\"translationLanguages\"/,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match) {
      try {
        // 处理 JSON 中的转义字符
        let jsonStr = match[1]
          .replace(/\\u0026/g, '&')
          .replace(/\\"/g, '"')
          .replace(/\\\\/g, '\\');
        
        // 尝试修复不完整的 JSON
        if (!jsonStr.endsWith(']')) {
          const lastBracket = jsonStr.lastIndexOf('}');
          if (lastBracket > 0) {
            jsonStr = jsonStr.substring(0, lastBracket + 1) + ']';
          }
        }
        
        const tracks = JSON.parse(jsonStr);
        if (Array.isArray(tracks) && tracks.length > 0) {
          return tracks;
        }
      } catch (e) {
        console.error('Parse attempt failed:', e);
        continue;
      }
    }
  }

  // 方法2: 从 ytInitialPlayerResponse 提取
  const playerResponseMatch = html.match(/ytInitialPlayerResponse\s*=\s*(\{[\s\S]*?\});/);
  if (playerResponseMatch) {
    try {
      const playerResponse = JSON.parse(playerResponseMatch[1]);
      const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
      if (Array.isArray(tracks) && tracks.length > 0) {
        return tracks;
      }
    } catch (e) {
      console.error('Player response parse failed:', e);
    }
  }

  return null;
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId');
  const lang = url.searchParams.get('lang') || 'en';

  // CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    });
  }

  if (!videoId) {
    return new Response(JSON.stringify({ error: 'videoId is required' }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  try {
    // 步骤1: 获取 YouTube 视频页面
    const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResponse = await fetch(videoPageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cache-Control': 'no-cache',
      },
    });

    if (!pageResponse.ok) {
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch video page',
        message: `YouTube 页面请求失败: ${pageResponse.status}`,
      }), {
        status: 502,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const pageHtml = await pageResponse.text();

    // 检查视频是否存在
    if (pageHtml.includes('Video unavailable') || pageHtml.includes('"playabilityStatus":{"status":"ERROR"')) {
      return new Response(JSON.stringify({ 
        error: 'Video unavailable',
        message: '视频不可用或已被删除',
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 步骤2: 提取字幕轨道信息
    const captionTracks = extractCaptionTracks(pageHtml);
    
    if (!captionTracks || captionTracks.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No captions available',
        message: '该视频没有字幕',
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 步骤3: 选择合适的字幕轨道
    // 优先级: 指定语言 > 英语 > 中文 > 第一个可用
    const selectedTrack = captionTracks.find(t => t.languageCode === lang)
      || captionTracks.find(t => t.languageCode === 'en')
      || captionTracks.find(t => t.languageCode?.startsWith('en'))
      || captionTracks.find(t => t.languageCode === 'zh-Hans')
      || captionTracks.find(t => t.languageCode === 'zh-Hant')
      || captionTracks.find(t => t.languageCode?.startsWith('zh'))
      || captionTracks[0];

    if (!selectedTrack?.baseUrl) {
      return new Response(JSON.stringify({ 
        error: 'No valid caption URL',
        message: '未找到有效的字幕 URL',
        availableLangs: captionTracks.map(t => t.languageCode),
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 步骤4: 获取字幕内容
    const captionUrl = selectedTrack.baseUrl.replace(/\\u0026/g, '&');
    const captionResponse = await fetch(captionUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': 'application/xml, text/xml, */*',
      },
    });

    if (!captionResponse.ok) {
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch caption content',
        message: `字幕内容获取失败: ${captionResponse.status}`,
      }), {
        status: 502,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    const captionXml = await captionResponse.text();

    // 验证返回的是有效的 XML
    if (!captionXml.includes('<text') && !captionXml.includes('<transcript')) {
      return new Response(JSON.stringify({ 
        error: 'Invalid caption format',
        message: '字幕格式无效',
      }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 返回 XML 格式的字幕
    return new Response(captionXml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=3600',
        'X-Caption-Language': selectedTrack.languageCode || 'unknown',
      },
    });

  } catch (error) {
    console.error('YouTube transcript error:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch transcript',
      message: error instanceof Error ? error.message : '获取字幕失败',
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
