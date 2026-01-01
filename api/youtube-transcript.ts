/**
 * YouTube 字幕代理 API
 * 
 * GET /api/youtube-transcript?videoId=xxx&lang=en
 * 
 * 服务端获取 YouTube 字幕，绕过 CORS 限制
 * 使用 YouTube innertube API 获取字幕
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

// 使用 YouTube innertube API 获取视频信息
async function getVideoInfoViaInnertube(videoId: string): Promise<CaptionTrack[] | null> {
  const innertubeApiKey = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8'; // 公开的 innertube key
  
  const payload = {
    context: {
      client: {
        hl: 'en',
        gl: 'US',
        clientName: 'WEB',
        clientVersion: '2.20231219.04.00',
      },
    },
    videoId,
  };

  try {
    const response = await fetch(
      `https://www.youtube.com/youtubei/v1/player?key=${innertubeApiKey}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      console.error('Innertube API failed:', response.status);
      return null;
    }

    const data = await response.json();
    const tracks = data?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
    
    if (Array.isArray(tracks) && tracks.length > 0) {
      return tracks;
    }
    
    return null;
  } catch (error) {
    console.error('Innertube API error:', error);
    return null;
  }
}

// 从 YouTube 页面 HTML 提取字幕轨道（备用方案）
async function extractCaptionTracksFromPage(videoId: string): Promise<CaptionTrack[] | null> {
  try {
    const videoPageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const pageResponse = await fetch(videoPageUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });

    if (!pageResponse.ok) {
      return null;
    }

    const html = await pageResponse.text();

    // 方法1: 从 ytInitialPlayerResponse 提取
    const playerResponsePatterns = [
      /var\s+ytInitialPlayerResponse\s*=\s*(\{.+?\});(?:\s*var|\s*<\/script>)/s,
      /ytInitialPlayerResponse\s*=\s*(\{.+?\});/s,
    ];

    for (const pattern of playerResponsePatterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          const playerResponse = JSON.parse(match[1]);
          const tracks = playerResponse?.captions?.playerCaptionsTracklistRenderer?.captionTracks;
          if (Array.isArray(tracks) && tracks.length > 0) {
            return tracks;
          }
        } catch (e) {
          console.error('Player response parse failed:', e);
        }
      }
    }

    // 方法2: 直接匹配 captionTracks
    const captionPatterns = [
      /"captionTracks":\s*(\[[\s\S]*?\])(?=\s*,\s*")/,
      /"captionTracks":\s*(\[[\s\S]*?\])\s*,\s*"audioTracks"/,
    ];

    for (const pattern of captionPatterns) {
      const match = html.match(pattern);
      if (match) {
        try {
          let jsonStr = match[1]
            .replace(/\\u0026/g, '&')
            .replace(/\\"/g, '"')
            .replace(/\\\\/g, '\\');
          
          const tracks = JSON.parse(jsonStr);
          if (Array.isArray(tracks) && tracks.length > 0) {
            return tracks;
          }
        } catch (e) {
          console.error('Caption tracks parse failed:', e);
        }
      }
    }

    return null;
  } catch (error) {
    console.error('Page extraction error:', error);
    return null;
  }
}

export default async function handler(request: Request) {
  const url = new URL(request.url);
  const videoId = url.searchParams.get('videoId');
  const lang = url.searchParams.get('lang') || 'en';

  // CORS headers
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  // CORS 预检请求
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!videoId) {
    return new Response(JSON.stringify({ error: 'videoId is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }

  try {
    // 步骤1: 尝试使用 innertube API 获取字幕轨道
    let captionTracks = await getVideoInfoViaInnertube(videoId);
    
    // 步骤2: 如果 innertube 失败，尝试从页面提取
    if (!captionTracks) {
      console.log('Innertube failed, trying page extraction...');
      captionTracks = await extractCaptionTracksFromPage(videoId);
    }
    
    if (!captionTracks || captionTracks.length === 0) {
      return new Response(JSON.stringify({ 
        error: 'No captions available',
        message: '该视频没有字幕',
      }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 步骤3: 选择合适的字幕轨道
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
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    // 步骤4: 获取字幕内容
    const captionUrl = selectedTrack.baseUrl.replace(/\\u0026/g, '&');
    const captionResponse = await fetch(captionUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Accept': '*/*',
      },
    });

    if (!captionResponse.ok) {
      return new Response(JSON.stringify({ 
        error: 'Failed to fetch caption content',
        message: `字幕内容获取失败: ${captionResponse.status}`,
      }), {
        status: 502,
        headers: { 'Content-Type': 'application/json', ...corsHeaders },
      });
    }

    const captionText = await captionResponse.text();

    // 检查是否是有效的字幕格式（XML 或 JSON3）
    if (captionText.includes('<text') || captionText.includes('<transcript')) {
      // XML 格式，直接返回
      return new Response(captionText, {
        headers: {
          'Content-Type': 'application/xml; charset=utf-8',
          'X-Caption-Language': selectedTrack.languageCode || 'unknown',
          'Cache-Control': 'public, s-maxage=3600',
          ...corsHeaders,
        },
      });
    }

    // 尝试解析为 JSON3 格式
    try {
      const json3Data = JSON.parse(captionText);
      if (json3Data.events) {
        // 转换 JSON3 为简单 XML 格式
        const xmlParts = ['<?xml version="1.0" encoding="utf-8"?><transcript>'];
        
        for (const event of json3Data.events) {
          if (event.segs) {
            const text = event.segs.map((s: any) => s.utf8 || '').join('');
            if (text.trim()) {
              const start = (event.tStartMs || 0) / 1000;
              const dur = (event.dDurationMs || 0) / 1000;
              const escapedText = text
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;');
              xmlParts.push(`<text start="${start}" dur="${dur}">${escapedText}</text>`);
            }
          }
        }
        
        xmlParts.push('</transcript>');
        
        return new Response(xmlParts.join(''), {
          headers: {
            'Content-Type': 'application/xml; charset=utf-8',
            'X-Caption-Language': selectedTrack.languageCode || 'unknown',
            'Cache-Control': 'public, s-maxage=3600',
            ...corsHeaders,
          },
        });
      }
    } catch {
      // 不是 JSON，继续
    }

    // 无法识别的格式
    return new Response(JSON.stringify({ 
      error: 'Unknown caption format',
      message: '无法识别的字幕格式',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });

  } catch (error) {
    console.error('YouTube transcript error:', error);
    
    return new Response(JSON.stringify({ 
      error: 'Failed to fetch transcript',
      message: error instanceof Error ? error.message : '获取字幕失败',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...corsHeaders },
    });
  }
}
