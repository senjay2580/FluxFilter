/**
 * YouTube API 服务
 * 
 * 支持获取 YouTube 频道信息和视频列表
 * 用户需要在设置中配置自己的 YouTube API Key
 */

import { getUserYouTubeApiKey } from './auth';

// 缓存的 API Key
let cachedApiKey: string | null = null;

/**
 * 获取 YouTube API Key（从数据库用户表读取）
 */
async function getYouTubeApiKey(): Promise<string> {
  if (cachedApiKey !== null) return cachedApiKey;
  const apiKey = await getUserYouTubeApiKey();
  cachedApiKey = apiKey || '';
  return cachedApiKey;
}

/**
 * 清除 API Key 缓存（用户更新配置时调用）
 */
export function clearYouTubeApiKeyCache(): void {
  cachedApiKey = null;
}

export interface YouTubeChannel {
  channelId: string;
  title: string;
  description: string;
  thumbnail: string;
  subscriberCount?: number;
  videoCount?: number;
}

export interface YouTubeVideoItem {
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  duration?: number;
  viewCount?: number;
  likeCount?: number;
  commentCount?: number;
}

/**
 * 从各种 YouTube URL 格式中提取频道 ID 或用户名
 */
export function parseYouTubeUrl(url: string): { type: 'channel' | 'user' | 'handle' | 'video'; id: string } | null {
  // 频道 ID 格式: youtube.com/channel/UCxxxxxx
  const channelMatch = url.match(/youtube\.com\/channel\/(UC[\w-]+)/i);
  if (channelMatch) {
    return { type: 'channel', id: channelMatch[1] };
  }

  // 用户名格式: youtube.com/user/username
  const userMatch = url.match(/youtube\.com\/user\/([\w-]+)/i);
  if (userMatch) {
    return { type: 'user', id: userMatch[1] };
  }

  // Handle 格式: youtube.com/@handle
  const handleMatch = url.match(/youtube\.com\/@([\w-]+)/i);
  if (handleMatch) {
    return { type: 'handle', id: handleMatch[1] };
  }

  // 视频链接格式: youtube.com/watch?v=xxxxx 或 youtu.be/xxxxx
  const videoMatch = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([\w-]+)/i);
  if (videoMatch) {
    return { type: 'video', id: videoMatch[1] };
  }

  // 直接是频道 ID
  if (/^UC[\w-]{22}$/.test(url)) {
    return { type: 'channel', id: url };
  }

  // 直接是 handle（以 @ 开头）
  if (url.startsWith('@')) {
    return { type: 'handle', id: url.slice(1) };
  }

  return null;
}

/**
 * 检测输入是 B站还是 YouTube
 */
export function detectPlatform(input: string): 'bilibili' | 'youtube' | 'unknown' {
  const trimmed = input.trim();
  
  // B站检测
  if (
    /bilibili\.com/.test(trimmed) ||
    /b23\.tv/.test(trimmed) ||
    /^BV[\w]+$/i.test(trimmed) ||
    /^av\d+$/i.test(trimmed) ||
    /space\.bilibili\.com/.test(trimmed) ||
    /^UID[：:]\s*\d+$/i.test(trimmed) ||
    /^\d{5,}$/.test(trimmed) // 纯数字且长度>=5，可能是B站MID
  ) {
    return 'bilibili';
  }

  // YouTube 检测
  if (
    /youtube\.com/.test(trimmed) ||
    /youtu\.be/.test(trimmed) ||
    /^UC[\w-]{22}$/.test(trimmed) ||
    /^@[\w-]+$/.test(trimmed)
  ) {
    return 'youtube';
  }

  return 'unknown';
}

/**
 * 获取 YouTube 频道信息
 */
export async function getYouTubeChannelInfo(channelId: string): Promise<YouTubeChannel | null> {
  const apiKey = await getYouTubeApiKey();
  if (!apiKey) {
    throw new Error('请先在设置中配置 YouTube API Key');
  }

  // 开发模式下直接调用 YouTube API（避免代理问题）
  const baseUrl = import.meta.env.DEV
    ? 'https://www.googleapis.com/youtube/v3'
    : '/api/youtube?path=';
  
  const apiPath = `/channels?part=snippet,statistics&id=${channelId}&key=${apiKey}`;
  const url = import.meta.env.DEV
    ? `${baseUrl}${apiPath}`
    : `${baseUrl}${encodeURIComponent(apiPath)}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        console.error('YouTube API 原始错误响应:', errorText);
      }
      console.error('YouTube API 响应错误:', response.status, errorData);
      if (response.status === 400) {
        throw new Error((errorData as any)?.error?.message || 'API 请求参数错误');
      }
      if (response.status === 403) {
        throw new Error('API Key 无效或已超出配额限制');
      }
      throw new Error(`YouTube API 请求失败: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      console.error('YouTube API 错误:', data.error);
      throw new Error(data.error.message || 'YouTube API 错误');
    }

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const channel = data.items[0];
    return {
      channelId: channel.id,
      title: channel.snippet.title,
      description: channel.snippet.description,
      thumbnail: channel.snippet.thumbnails?.medium?.url || channel.snippet.thumbnails?.default?.url,
      subscriberCount: parseInt(channel.statistics?.subscriberCount) || 0,
      videoCount: parseInt(channel.statistics?.videoCount) || 0,
    };
  } catch (error) {
    console.error('获取 YouTube 频道信息失败:', error);
    throw error;
  }
}

/**
 * 通过 handle 获取频道信息
 */
export async function getYouTubeChannelByHandle(handle: string): Promise<YouTubeChannel | null> {
  const apiKey = await getYouTubeApiKey();
  if (!apiKey) {
    throw new Error('请先在设置中配置 YouTube API Key');
  }

  // 开发模式下直接调用 YouTube API（避免代理问题）
  const baseUrl = import.meta.env.DEV
    ? 'https://www.googleapis.com/youtube/v3'
    : '/api/youtube?path=';
  
  const apiPath = `/channels?part=snippet,statistics&forHandle=${handle}&key=${apiKey}`;
  const url = import.meta.env.DEV
    ? `${baseUrl}${apiPath}`
    : `${baseUrl}${encodeURIComponent(apiPath)}`;

  console.log('🎬 YouTube API 请求:', url.replace(apiKey, 'API_KEY_HIDDEN'));

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        console.error('YouTube API 原始错误响应:', errorText);
      }
      console.error('YouTube API 响应错误:', response.status, errorData);
      
      if (response.status === 400) {
        const message = (errorData as any)?.error?.message || 'API 请求参数错误';
        throw new Error(message);
      }
      if (response.status === 403) {
        throw new Error('API Key 无效或已超出配额限制');
      }
      throw new Error(`YouTube API 请求失败: ${response.status}`);
    }

    const data = await response.json();
    console.log('🎬 YouTube API 响应:', data);

    if (data.error) {
      console.error('YouTube API 错误:', data.error);
      throw new Error(data.error.message || 'YouTube API 错误');
    }

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const channel = data.items[0];
    return {
      channelId: channel.id,
      title: channel.snippet.title,
      description: channel.snippet.description,
      thumbnail: channel.snippet.thumbnails?.medium?.url || channel.snippet.thumbnails?.default?.url,
      subscriberCount: parseInt(channel.statistics?.subscriberCount) || 0,
      videoCount: parseInt(channel.statistics?.videoCount) || 0,
    };
  } catch (error) {
    console.error('获取 YouTube 频道信息失败:', error);
    throw error;
  }
}

/**
 * 通过用户名获取频道信息
 */
export async function getYouTubeChannelByUsername(username: string): Promise<YouTubeChannel | null> {
  const apiKey = await getYouTubeApiKey();
  if (!apiKey) {
    throw new Error('请先在设置中配置 YouTube API Key');
  }

  // 开发模式下直接调用 YouTube API
  const baseUrl = import.meta.env.DEV
    ? 'https://www.googleapis.com/youtube/v3'
    : '/api/youtube?path=';
  
  const apiPath = `/channels?part=snippet,statistics&forUsername=${username}&key=${apiKey}`;
  const url = import.meta.env.DEV
    ? `${baseUrl}${apiPath}`
    : `${baseUrl}${encodeURIComponent(apiPath)}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        console.error('YouTube API 原始错误响应:', errorText);
      }
      console.error('YouTube API 响应错误:', response.status, errorData);
      if (response.status === 400) {
        throw new Error((errorData as any)?.error?.message || 'API 请求参数错误');
      }
      if (response.status === 403) {
        throw new Error('API Key 无效或已超出配额限制');
      }
      throw new Error(`YouTube API 请求失败: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      console.error('YouTube API 错误:', data.error);
      return null;
    }

    if (!data.items || data.items.length === 0) {
      return null;
    }

    const channel = data.items[0];
    return {
      channelId: channel.id,
      title: channel.snippet.title,
      description: channel.snippet.description,
      thumbnail: channel.snippet.thumbnails?.medium?.url || channel.snippet.thumbnails?.default?.url,
      subscriberCount: parseInt(channel.statistics?.subscriberCount) || 0,
      videoCount: parseInt(channel.statistics?.videoCount) || 0,
    };
  } catch (error) {
    console.error('获取 YouTube 频道信息失败:', error);
    throw error;
  }
}

/**
 * 从视频 ID 获取频道信息
 */
export async function getYouTubeChannelFromVideo(videoId: string): Promise<YouTubeChannel | null> {
  const apiKey = await getYouTubeApiKey();
  if (!apiKey) {
    throw new Error('请先在设置中配置 YouTube API Key');
  }

  // 开发模式下直接调用 YouTube API
  const baseUrl = import.meta.env.DEV
    ? 'https://www.googleapis.com/youtube/v3'
    : '/api/youtube?path=';
  
  const apiPath = `/videos?part=snippet&id=${videoId}&key=${apiKey}`;
  const url = import.meta.env.DEV
    ? `${baseUrl}${apiPath}`
    : `${baseUrl}${encodeURIComponent(apiPath)}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        console.error('YouTube API 原始错误响应:', errorText);
      }
      console.error('YouTube API 响应错误:', response.status, errorData);
      if (response.status === 400) {
        throw new Error((errorData as any)?.error?.message || 'API 请求参数错误');
      }
      if (response.status === 403) {
        throw new Error('API Key 无效或已超出配额限制');
      }
      throw new Error(`YouTube API 请求失败: ${response.status}`);
    }

    const data = await response.json();

    if (data.error || !data.items || data.items.length === 0) {
      return null;
    }

    const channelId = data.items[0].snippet.channelId;
    return await getYouTubeChannelInfo(channelId);
  } catch (error) {
    console.error('获取视频频道信息失败:', error);
    throw error;
  }
}

/**
 * 智能获取 YouTube 频道信息（支持多种输入格式）
 */
export async function resolveYouTubeChannel(input: string): Promise<YouTubeChannel | null> {
  const parsed = parseYouTubeUrl(input);
  
  if (!parsed) {
    // 尝试作为 handle 处理
    if (/^[\w-]+$/.test(input)) {
      return await getYouTubeChannelByHandle(input);
    }
    return null;
  }

  switch (parsed.type) {
    case 'channel':
      return await getYouTubeChannelInfo(parsed.id);
    case 'handle':
      return await getYouTubeChannelByHandle(parsed.id);
    case 'user':
      return await getYouTubeChannelByUsername(parsed.id);
    case 'video':
      return await getYouTubeChannelFromVideo(parsed.id);
    default:
      return null;
  }
}

/**
 * 获取频道的上传播放列表 ID
 */
function getUploadsPlaylistId(channelId: string): string {
  // YouTube 频道的上传播放列表 ID 是将 UC 替换为 UU
  return channelId.replace(/^UC/, 'UU');
}

/**
 * 获取 YouTube 频道的视频列表
 */
export async function getYouTubeChannelVideos(
  channelId: string,
  maxResults: number = 30
): Promise<YouTubeVideoItem[]> {
  const apiKey = await getYouTubeApiKey();
  if (!apiKey) {
    throw new Error('请先在设置中配置 YouTube API Key');
  }

  // 开发模式下直接调用 YouTube API
  const baseUrl = import.meta.env.DEV
    ? 'https://www.googleapis.com/youtube/v3'
    : '/api/youtube?path=';

  const uploadsPlaylistId = getUploadsPlaylistId(channelId);
  const apiPath = `/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=${maxResults}&key=${apiKey}`;
  const url = import.meta.env.DEV
    ? `${baseUrl}${apiPath}`
    : `${baseUrl}${encodeURIComponent(apiPath)}`;

  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorText = await response.text();
      let errorData = {};
      try {
        errorData = JSON.parse(errorText);
      } catch {
        console.error('YouTube API 原始错误响应:', errorText);
      }
      console.error('YouTube API 响应错误:', response.status, errorData);
      if (response.status === 400) {
        throw new Error((errorData as any)?.error?.message || 'API 请求参数错误');
      }
      if (response.status === 403) {
        throw new Error('API Key 无效或已超出配额限制');
      }
      throw new Error(`YouTube API 请求失败: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      console.error('YouTube API 错误:', data.error);
      return [];
    }

    if (!data.items || data.items.length === 0) {
      return [];
    }

    const videos: YouTubeVideoItem[] = data.items.map((item: any) => ({
      videoId: item.contentDetails.videoId,
      title: item.snippet.title,
      description: item.snippet.description,
      thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
      channelId: item.snippet.channelId,
      channelTitle: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
    }));

    // 获取视频详细信息（时长、播放量等）
    const videoIds = videos.map(v => v.videoId).join(',');
    const detailsPath = `/videos?part=contentDetails,statistics&id=${videoIds}&key=${apiKey}`;
    const detailsUrl = import.meta.env.DEV
      ? `${baseUrl}${detailsPath}`
      : `${baseUrl}${encodeURIComponent(detailsPath)}`;

    const detailsResponse = await fetch(detailsUrl);
    
    if (detailsResponse.ok) {
      const detailsData = await detailsResponse.json();

      if (detailsData.items) {
        const detailsMap = new Map(
          detailsData.items.map((item: any) => [item.id, item])
        );

        videos.forEach(video => {
          const details = detailsMap.get(video.videoId) as any;
          if (details) {
            video.duration = parseDuration(details.contentDetails?.duration);
            video.viewCount = parseInt(details.statistics?.viewCount) || 0;
            video.likeCount = parseInt(details.statistics?.likeCount) || 0;
            video.commentCount = parseInt(details.statistics?.commentCount) || 0;
          }
        });
      }
    }

    return videos;
  } catch (error) {
    console.error('获取 YouTube 频道视频失败:', error);
    throw error;
  }
}

/**
 * 解析 ISO 8601 时长格式为秒数
 * 例如: PT1H2M3S -> 3723
 */
function parseDuration(duration: string): number {
  if (!duration) return 0;
  
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;

  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * 格式化视频时长（秒 -> MM:SS 或 HH:MM:SS）
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * 格式化播放量
 */
export function formatViewCount(count: number): string {
  if (count >= 100000000) {
    return `${(count / 100000000).toFixed(1)}亿`;
  }
  if (count >= 10000) {
    return `${(count / 10000).toFixed(1)}万`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
}

/**
 * 生成 YouTube 视频链接
 */
export function getYouTubeVideoUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

/**
 * 生成 YouTube 频道链接
 */
export function getYouTubeChannelUrl(channelId: string): string {
  return `https://www.youtube.com/channel/${channelId}`;
}


// ============================================
// YouTube 字幕获取功能
// 使用免费的公开 API 代理
// ============================================

export interface YouTubeCaption {
  text: string;
  start: number;
  duration: number;
}

export interface YouTubeCaptionTrack {
  languageCode: string;
  languageName: string;
  isAutoGenerated: boolean;
}

/**
 * 获取 YouTube 视频的可用字幕轨道列表
 */
export async function getYouTubeCaptionTracks(videoId: string): Promise<YouTubeCaptionTrack[]> {
  try {
    // 使用免费的 API 代理获取字幕信息
    const response = await fetch(
      `https://yt.lemnoslife.com/noKey/captions?part=snippet&videoId=${videoId}`
    );
    
    if (!response.ok) {
      console.error('获取字幕轨道失败:', response.status);
      return [];
    }
    
    const data = await response.json();
    
    if (!data.items || data.items.length === 0) {
      return [];
    }
    
    return data.items.map((item: any) => ({
      languageCode: item.snippet?.language || 'unknown',
      languageName: item.snippet?.name || item.snippet?.language || '未知语言',
      isAutoGenerated: item.snippet?.trackKind === 'ASR',
    }));
  } catch (error) {
    console.error('获取 YouTube 字幕轨道失败:', error);
    return [];
  }
}

/**
 * 获取 YouTube 视频字幕内容
 * @param videoId - YouTube 视频 ID
 * @param lang - 语言代码（默认 'en'，可选 'zh-Hans', 'zh-Hant', 'ja' 等）
 */
export async function getYouTubeTranscript(
  videoId: string, 
  lang: string = 'en'
): Promise<{ captions: YouTubeCaption[]; fullText: string } | null> {
  try {
    // 统一使用 Vercel API（开发和生产环境都用）
    const apiUrl = `/api/youtube-transcript?videoId=${videoId}&lang=${lang}`;
    
    const response = await fetch(apiUrl);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error('YouTube 字幕 API 错误:', response.status, errorText);
      return null;
    }
    
    const contentType = response.headers.get('content-type') || '';
    
    // 如果返回 JSON 错误
    if (contentType.includes('application/json')) {
      const data = await response.json();
      if (data.error) {
        console.error('YouTube 字幕不可用:', data.error);
        return null;
      }
      // 如果 API 直接返回解析好的 JSON 格式
      if (data.captions) {
        return data;
      }
    }
    
    const text = await response.text();
    
    // 解析 XML 格式的字幕
    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(text, 'text/xml');
    const textElements = xmlDoc.querySelectorAll('text');
    
    if (textElements.length === 0) {
      console.error('字幕 XML 解析失败或无内容');
      return null;
    }
    
    const captions: YouTubeCaption[] = [];
    let fullText = '';
    
    textElements.forEach((el) => {
      const content = el.textContent
        ?.replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/\n/g, ' ')
        .trim() || '';
      
      const start = parseFloat(el.getAttribute('start') || '0');
      const dur = parseFloat(el.getAttribute('dur') || '0');
      
      if (content) {
        captions.push({
          text: content,
          start,
          duration: dur,
        });
        
        fullText += content + ' ';
      }
    });
    
    return {
      captions,
      fullText: fullText.trim(),
    };
  } catch (error) {
    console.error('获取 YouTube 字幕失败:', error);
    return null;
  }
}

/**
 * 格式化字幕为带时间戳的文本
 */
export function formatCaptionsWithTimestamp(captions: YouTubeCaption[]): string {
  return captions.map(cap => {
    const mins = Math.floor(cap.start / 60);
    const secs = Math.floor(cap.start % 60);
    const timestamp = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    return `[${timestamp}] ${cap.text}`;
  }).join('\n');
}

/**
 * 格式化字幕为纯文本（无时间戳）
 */
export function formatCaptionsPlainText(captions: YouTubeCaption[]): string {
  return captions.map(cap => cap.text).join(' ');
}
