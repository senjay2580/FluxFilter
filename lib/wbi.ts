/**
 * B站 WBI 签名实现
 * 参考: https://github.com/SocialSisterYi/bilibili-API-collect/blob/master/docs/misc/sign/wbi.md
 */

import md5 from 'blueimp-md5';

// WBI 混淆表
const MIXIN_KEY_ENC_TAB = [
  46, 47, 18, 2, 53, 8, 23, 32, 15, 50, 10, 31, 58, 3, 45, 35,
  27, 43, 5, 49, 33, 9, 42, 19, 29, 28, 14, 39, 12, 38, 41, 13,
  37, 48, 7, 16, 24, 55, 40, 61, 26, 17, 0, 1, 60, 51, 30, 4,
  22, 25, 54, 21, 56, 59, 6, 63, 57, 62, 11, 36, 20, 34, 44, 52
];

// 缓存 WBI keys
let cachedWbiKeys: { imgKey: string; subKey: string; timestamp: number } | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1小时缓存

/**
 * 获取混淆后的 key
 */
function getMixinKey(orig: string): string {
  return MIXIN_KEY_ENC_TAB
    .map(n => orig[n])
    .join('')
    .slice(0, 32);
}

// API 基础路径（开发模式使用代理）
const API_BASE = import.meta.env.DEV ? '/bili-api' : 'https://api.bilibili.com';

/**
 * 从 B站获取 WBI keys
 */
async function getWbiKeys(): Promise<{ imgKey: string; subKey: string }> {
  // 检查缓存
  if (cachedWbiKeys && Date.now() - cachedWbiKeys.timestamp < CACHE_DURATION) {
    return { imgKey: cachedWbiKeys.imgKey, subKey: cachedWbiKeys.subKey };
  }

  const response = await fetch(`${API_BASE}/x/web-interface/nav`, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Referer': 'https://www.bilibili.com',
    }
  });

  const data = await response.json();
  
  // code: -101 表示未登录，但仍然可以获取 wbi_img
  if (data.code !== 0 && data.code !== -101) {
    throw new Error('获取 WBI keys 失败: ' + data.message);
  }

  const { img_url, sub_url } = data.data.wbi_img;
  
  // 从 URL 中提取 key
  const imgKey = img_url.slice(img_url.lastIndexOf('/') + 1, img_url.lastIndexOf('.'));
  const subKey = sub_url.slice(sub_url.lastIndexOf('/') + 1, sub_url.lastIndexOf('.'));

  // 缓存
  cachedWbiKeys = { imgKey, subKey, timestamp: Date.now() };
  console.log('✅ WBI keys 获取成功');

  return { imgKey, subKey };
}

/**
 * 对参数进行 WBI 签名
 */
export async function encWbi(params: Record<string, string | number>): Promise<string> {
  const { imgKey, subKey } = await getWbiKeys();
  const mixinKey = getMixinKey(imgKey + subKey);
  
  const currTime = Math.round(Date.now() / 1000);
  
  // 添加必需的反爬虫参数
  const newParams: Record<string, string | number> = { 
    ...params, 
    wts: currTime,
    // B站要求的额外参数
    web_location: 1550101,
    dm_img_list: '[]',
    dm_img_str: 'V2ViR0wgMS4wIChPcGVuR0wgRVMgMi4wIENocm9taXVtKQ',
    dm_cover_img_str: 'QU5HTEUgKEludGVsLCBJbnRlbChSKSBVSEQgR3JhcGhpY3MgNjMwICgweDAwMDAzRTkyKSBEaXJlY3QzRDExIHZzXzVfMCBwc181XzAsIEQzRDExKQ',
  };

  // 按 key 排序
  const sortedParams = Object.keys(newParams)
    .sort()
    .map(key => {
      // 过滤特殊字符
      const value = String(newParams[key]).replace(/[!'()*]/g, '');
      return `${encodeURIComponent(key)}=${encodeURIComponent(value)}`;
    })
    .join('&');

  // 计算 w_rid
  const wrid = md5(sortedParams + mixinKey);

  return `${sortedParams}&w_rid=${wrid}`;
}

/**
 * 构建带 WBI 签名的 URL
 */
export async function buildWbiUrl(baseUrl: string, params: Record<string, string | number>): Promise<string> {
  const signedQuery = await encWbi(params);
  return `${baseUrl}?${signedQuery}`;
}
