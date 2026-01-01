/**
 * YouTube 字幕代理 API
 * 
 * GET /api/youtube-transcript?videoId=xxx&lang=en
 * 
 * 服务端获取 YouTube 字幕，绕过 CORS 限制
 */

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId');
  const lang = url.searchParams.get('lang') || 'en';

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
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!pageResponse.ok) {
      throw new Error(`Failed to fetch video page: ${pageResponse.status}`);
    }

    const pageHtml = await pageResponse.text();

    // 步骤2: 提取字幕轨道信息
    const captionMatch = pageHtml.match(/"captionTracks":\s*(\[.*?\])/);
    if (!captionMatch) {
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

    let captionTracks;
    try {
      // 需要处理转义字符
      const jsonStr = captionMatch[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"');
      captionTracks = JSON.parse(jsonStr);
    } catch (parseError) {
      // 尝试另一种解析方式
      try {
        const altMatch = pageHtml.match(/\"captions\":\{\"playerCaptionsTracklistRenderer\":\{\"captionTracks\":(\[.*?\])/);
        if (altMatch) {
          const jsonStr = altMatch[1].replace(/\\u0026/g, '&').replace(/\\"/g, '"');
          captionTracks = JSON.parse(jsonStr);
        } else {
          throw new Error('Parse failed');
        }
      } catch {
        return new Response(JSON.stringify({ 
          error: 'Failed to parse caption data',
          message: '解析字幕数据失败',
        }), {
          status: 500,
          headers: { 
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }
    }

    if (!captionTracks || captionTracks.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No caption tracks found',
        message: '未找到字幕轨道',
      }), {
        status: 404,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }

    // 步骤3: 选择合适的字幕轨道
    let selectedTrack = captionTracks.find((t: any) => t.languageCode === lang)
      || captionTracks.find((t: any) => t.languageCode === 'en')
      || captionTracks.find((t: any) => t.languageCode?.startsWith('en'))
      || captionTracks.find((t: any) => t.languageCode === 'zh-Hans')
      || captionTracks.find((t: any) => t.languageCode?.startsWith('zh'))
      || captionTracks[0];

    if (!selectedTrack?.baseUrl) {
      return new Response(JSON.stringify({ 
        error: 'No valid caption URL',
        message: '未找到有效的字幕 URL',
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
      },
    });

    if (!captionResponse.ok) {
      throw new Error(`Failed to fetch caption content: ${captionResponse.status}`);
    }

    const captionXml = await captionResponse.text();

    // 返回 XML 格式的字幕
    return new Response(captionXml, {
      headers: {
        'Content-Type': 'application/xml',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, s-maxage=3600',
      },
    });

  } catch (error) {
    console.error('YouTube transcript error:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch transcript',
      message: String(error),
    }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
}
