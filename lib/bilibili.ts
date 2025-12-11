/**
 * B站 API 服务
 * 参考文档: https://github.com/SocialSisterYi/bilibili-API-collect
 * 
 * 限流策略：
 * 1. 指数退避重试（最多3次）
 * 2. 请求间隔控制（最小500ms）
 * 3. 并发限制（单次最多处理5个UP主）
 * 4. 错误码识别与处理
 */

import type { BilibiliVideoItem, BilibiliSpaceResponse, UpsertVideoParams } from './database.types';
import { encWbi } from './wbi';
import { getUserBilibiliCookie } from './auth';

// B站API基础URL
// 开发模式使用 Vite 代理，生产模式使用 Vercel Serverless Function
const BILIBILI_API_BASE = import.meta.env.DEV 
  ? '/bili-api'  // 开发模式：通过 Vite 代理
  : '/api/bilibili?path=';  // 生产模式：通过 Vercel API 代理

// ============================================
// 限流配置 - 有Cookie版（快速）
// ============================================
const RATE_LIMIT_CONFIG = {
  minInterval: 500,        // 最小请求间隔 0.5秒
  maxRetries: 2,           // 重试次数
  baseDelay: 1000,         // 重试延迟 1秒
  maxConcurrent: 1,        // 串行请求
  retryableCodes: [-799, -352, -503, -412],
};

// 请求队列（避免并发）
let requestQueue: Promise<any> = Promise.resolve();
let lastSuccessTime = 0;

// 上次请求时间（用于控制请求频率）
let lastRequestTime = 0;

// 缓存的Cookie
let cachedCookie: string | null = null;

/**
 * 获取B站Cookie（从数据库用户表读取）
 * Cookie 是可选的，没有 Cookie 也能正常使用基本功能
 */
async function getBilibiliCookie(): Promise<string> {
  if (cachedCookie !== null) return cachedCookie;
  
  const cookie = await getUserBilibiliCookie();
  cachedCookie = cookie || '';
  return cachedCookie;
}

/**
 * 清除Cookie缓存（用户切换或更新Cookie时调用）
 */
export function clearCookieCache(): void {
  cachedCookie = null;
}

// 请求头配置（Cookie 可选）
const getHeaders = async () => {
  const cookie = await getBilibiliCookie();
  const headers: Record<string, string> = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Referer': 'https://www.bilibili.com',
  };
  
  // 只在有 Cookie 时才添加
  if (cookie) {
    headers['Cookie'] = cookie;
  }
  
  return headers;
};

/**
 * 等待至少间隔时间后再请求
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  const waitTime = Math.max(0, RATE_LIMIT_CONFIG.minInterval - elapsed);
  
  if (waitTime > 0) {
    await sleep(waitTime);
  }
  lastRequestTime = Date.now();
}

/**
 * 带重试的请求封装
 */
async function fetchWithRetry<T>(
  url: string,
  retries = RATE_LIMIT_CONFIG.maxRetries
): Promise<T> {
  await waitForRateLimit();

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, { headers: await getHeaders() });
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      // B站特有错误码处理
      if (data.code !== 0) {
        const isRetryable = RATE_LIMIT_CONFIG.retryableCodes.includes(data.code);
        
        if (isRetryable && attempt < retries) {
          // 限流时等待更长时间：5s, 10s, 20s
          const delay = RATE_LIMIT_CONFIG.baseDelay * Math.pow(2, attempt);
          console.warn(`⏳ B站限流 [${data.code}]，等待 ${delay/1000}s 后重试 (${attempt + 1}/${retries})`);
          await sleep(delay);
          lastRequestTime = Date.now(); // 重置计时器
          continue;
        }
        
        throw new Error(`B站API错误 [${data.code}]: ${data.message}`);
      }
      
      // 成功后记录时间
      lastSuccessTime = Date.now();

      return data as T;
      
    } catch (error) {
      if (attempt === retries) {
        throw error;
      }
      
      const delay = RATE_LIMIT_CONFIG.baseDelay * Math.pow(2, attempt);
      console.warn(`请求失败，${delay}ms后重试:`, error);
      await sleep(delay);
    }
  }

  throw new Error('请求失败，已达最大重试次数');
}

/**
 * 获取UP主投稿视频列表
 * API: https://api.bilibili.com/x/space/wbi/arc/search
 * 
 * @param mid UP主的用户ID
 * @param page 页码（从1开始）
 * @param pageSize 每页数量（最大50）
 */
export async function getUploaderVideos(
  mid: number,
  page: number = 1,
  pageSize: number = 30
): Promise<{ videos: BilibiliVideoItem[]; total: number }> {
  // 使用动态接口（限流更宽松）
  const apiPath = `/x/polymer/web-dynamic/v1/feed/space`;
  const url = import.meta.env.DEV
    ? `${BILIBILI_API_BASE}${apiPath}?host_mid=${mid}`
    : `${BILIBILI_API_BASE}${apiPath}&host_mid=${mid}`;

  try {
    const response = await fetch(url, { headers: await getHeaders() });
    const data = await response.json();

    if (data.code !== 0) {
      throw new Error(`B站API错误 [${data.code}]: ${data.message}`);
    }

    // 从动态中提取视频
    const videos: BilibiliVideoItem[] = [];
    const items = data.data?.items || [];
    
    for (const item of items) {
      // 只处理视频类型的动态
      if (item.type !== 'DYNAMIC_TYPE_AV') continue;
      
      const archive = item.modules?.module_dynamic?.major?.archive;
      if (!archive) continue;

      // 处理图片 URL
      let picUrl = archive.cover || '';
      if (picUrl.startsWith('//')) {
        picUrl = `https:${picUrl}`;
      } else if (picUrl && !picUrl.startsWith('http')) {
        picUrl = `https://${picUrl}`;
      }

      videos.push({
        aid: parseInt(archive.aid) || 0,
        bvid: archive.bvid,
        title: archive.title,
        pic: picUrl,
        description: archive.desc || '',
        duration: parseDuration(archive.duration_text),
        pubdate: item.modules?.module_author?.pub_ts || Math.floor(Date.now() / 1000),
        stat: {
          view: parseCount(archive.stat?.play),
          danmaku: parseCount(archive.stat?.danmaku),
          reply: 0,
          favorite: 0,
          coin: 0,
          share: 0,
          like: 0,
        }
      });

      // 达到需要的数量就停止
      if (videos.length >= pageSize) break;
    }

    console.log(`✅ ${mid}: 获取到 ${videos.length} 个视频`);
    return { videos, total: videos.length };
  } catch (error) {
    console.error(`获取UP主[${mid}]视频失败:`, error);
    throw error;
  }
}

// 解析时长字符串 "12:34" -> 秒数
function parseDuration(duration: string | number): number {
  if (typeof duration === 'number') return duration;
  if (!duration) return 0;
  
  const parts = duration.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

// 解析播放量 "1.2万" -> 数字
function parseCount(count: string | number): number {
  if (typeof count === 'number') return count;
  if (!count) return 0;
  
  const str = String(count);
  if (str.includes('万')) return parseFloat(str) * 10000;
  if (str.includes('亿')) return parseFloat(str) * 100000000;
  return parseInt(str) || 0;
}

/**
 * 获取UP主最近发布的视频（今日或指定天数内）
 */
export async function getRecentVideos(
  mid: number,
  days: number = 1
): Promise<BilibiliVideoItem[]> {
  const recentVideos: BilibiliVideoItem[] = [];
  const cutoffTime = Date.now() / 1000 - days * 24 * 60 * 60;
  
  let page = 1;
  let hasMore = true;

  while (hasMore) {
    const { videos, total } = await getUploaderVideos(mid, page, 30);
    
    for (const video of videos) {
      if (video.pubdate >= cutoffTime) {
        recentVideos.push(video);
      } else {
        // 已经超出时间范围，停止遍历
        hasMore = false;
        break;
      }
    }

    // 检查是否还有更多页
    if (videos.length === 0 || page * 30 >= total) {
      hasMore = false;
    }
    
    page++;
    
    // 避免请求过快
    await sleep(300);
  }

  return recentVideos;
}

/**
 * 转换B站视频数据为数据库格式
 */
export function transformVideoToDbFormat(video: BilibiliVideoItem, mid: number): UpsertVideoParams {
  return {
    bvid: video.bvid,
    aid: video.aid,
    mid: mid,
    title: video.title,
    pic: video.pic.startsWith('//') ? `https:${video.pic}` : video.pic,
    description: video.description || '',
    duration: video.duration,
    view_count: video.stat?.view || 0,
    danmaku_count: video.stat?.danmaku || 0,
    reply_count: video.stat?.reply || 0,
    favorite_count: video.stat?.favorite || 0,
    coin_count: video.stat?.coin || 0,
    share_count: video.stat?.share || 0,
    like_count: video.stat?.like || 0,
    pubdate: new Date(video.pubdate * 1000).toISOString(),
  };
}

/**
 * 获取UP主基本信息
 * API: https://api.bilibili.com/x/space/acc/info
 */
export async function getUploaderInfo(mid: number) {
  // 使用 WBI 签名
  const signedQuery = await encWbi({ mid });
  const url = `${BILIBILI_API_BASE}/x/space/wbi/acc/info?${signedQuery}`;

  try {
    const data = await fetchWithRetry<{ code: number; message: string; data: any }>(url);

    return {
      mid: data.data.mid,
      name: data.data.name,
      face: data.data.face,
      sign: data.data.sign,
    };
  } catch (error) {
    console.error(`获取UP主[${mid}]信息失败:`, error);
    throw error;
  }
}

/**
 * 格式化视频时长（秒 -> MM:SS）
 */
export function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
  return count.toString();
}

/**
 * 生成B站视频链接
 */
export function getBilibiliVideoUrl(bvid: string): string {
  return `https://www.bilibili.com/video/${bvid}`;
}

/**
 * 生成B站APP深链接（用于移动端跳转）
 */
export function getBilibiliAppDeepLink(bvid: string): string {
  return `bilibili://video/${bvid}`;
}

/**
 * 检测是否为移动设备
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * 处理视频点击（移动端提示跳转APP）
 */
export function handleVideoClick(bvid: string): void {
  const webUrl = getBilibiliVideoUrl(bvid);
  
  if (isMobileDevice()) {
    const appUrl = getBilibiliAppDeepLink(bvid);
    
    // 尝试打开APP
    const start = Date.now();
    window.location.href = appUrl;
    
    // 如果2秒后还在页面上，说明APP未安装，跳转网页
    setTimeout(() => {
      if (Date.now() - start < 2500) {
        window.open(webUrl, '_blank');
      }
    }, 2000);
  } else {
    window.open(webUrl, '_blank');
  }
}

// 工具函数
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
