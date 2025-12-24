import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { getStoredUserId } from '../../lib/auth';
import { parseLinksToElements } from '../../lib/parseLinks';

// 收藏视频类型
interface CollectedVideo {
  id: number;
  bvid: string;
  title: string;
  pic: string;
  duration: number;
  view_count: number;
  pubdate: string;
  uploader_name: string;
  uploader_face: string;
  access_restriction: string | null;
  description: string | null;
}

// 解析短链接获取BV号
const resolveShortLink = async (shortLink: string): Promise<string | null> => {
  try {
    const response = await fetch(`/api/resolve-short-link?url=${encodeURIComponent(shortLink)}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const data = await response.json();
    return data.success ? data.bvid : null;
  } catch {
    return null;
  }
};

// 智能提取B站视频链接，支持多种格式
const parseBilibiliLinks = async (text: string): Promise<string[]> => {
  const bvids: string[] = [];
  const addBvid = (bv: string) => {
    const normalized = 'BV' + bv.slice(2);
    if (!bvids.includes(normalized)) bvids.push(normalized);
  };

  // 1. 直接匹配 BV 号（不区分大小写）
  const bvMatches = text.match(/BV[a-zA-Z0-9]{10}/gi);
  bvMatches?.forEach(addBvid);

  // 2. 桌面端/移动端链接
  const urlMatches = text.matchAll(/https?:\/\/(?:www\.|m\.)?bilibili\.com\/video\/(BV[a-zA-Z0-9]{10})/gi);
  [...urlMatches].forEach(m => addBvid(m[1]));

  // 3. 短链接 b23.tv - 只有在没找到BV号时才解析
  if (bvids.length === 0) {
    const shortLinks = text.match(/https?:\/\/(b23\.tv|bili2233\.cn)\/[a-zA-Z0-9]+/gi);
    if (shortLinks) {
      const results = await Promise.all(shortLinks.map(resolveShortLink));
      results.forEach(bv => bv && addBvid(bv));
    }
  }

  return bvids;
};

// B站视频信息API
const fetchVideoInfo = async (bvid: string) => {
  const apiPath = `/x/web-interface/view?bvid=${bvid}`;
  const url = import.meta.env.DEV
    ? `/bili-api${apiPath}`
    : `/api/bilibili?path=${encodeURIComponent(apiPath)}`;

  const headers: Record<string, string> = {
    'Accept': 'application/json, text/plain, */*',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Referer': 'https://www.bilibili.com',
  };

  const response = await fetch(url, { headers });
  const data = await response.json();

  if (data.code !== 0) {
    // 常见错误码处理
    const errorMsg = data.code === -400 ? '视频不存在或已删除'
      : data.code === -404 ? '视频不存在'
        : data.message || '未知错误';
    throw new Error(errorMsg);
  }

  return data.data;
};

interface VideoCollectorProps {
  onSuccess?: () => void;
}

const VideoCollector: React.FC<VideoCollectorProps> = ({ onSuccess }) => {
  const [inputText, setInputText] = useState('');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [parsedBvids, setParsedBvids] = useState<string[]>([]);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [results, setResults] = useState<{ bvid: string; success: boolean; title?: string; error?: string }[]>([]);
  const [showResults, setShowResults] = useState(false);

  // 收藏视频列表
  const [videos, setVideos] = useState<CollectedVideo[]>([]);
  const [loading, setLoading] = useState(true);

  // 删除确认
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: number; title: string } | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // 剪贴板内容
  const [clipboardContent, setClipboardContent] = useState<string>('');

  // 视频菜单状态
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  // 组件卸载时清理菜单状态
  useEffect(() => {
    return () => {
      setOpenMenuId(null);
      setDescExpanded(false);
    };
  }, []);

  // 加载收藏视频
  const loadVideos = useCallback(async () => {
    const userId = getStoredUserId();
    if (!userId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('collected_video')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setVideos(data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    loadVideos();
  }, [loadVideos]);

  // 读取剪贴板内容
  const readClipboard = useCallback(async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text && text !== clipboardContent) {
        setClipboardContent(text);
      }
    } catch {
      // 剪贴板访问被拒绝
    }
  }, [clipboardContent]);

  // 抽屉打开时读取剪贴板
  useEffect(() => {
    if (isDrawerOpen) {
      readClipboard();
    }
  }, [isDrawerOpen, readClipboard]);

  // 格式化时长
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 格式化播放量
  const formatCount = (num: number) => {
    if (num >= 10000) return `${(num / 10000).toFixed(1)}万`;
    return num.toString();
  };

  // 请求删除（显示确认弹窗）
  const requestDelete = (id: number, title: string) => {
    setDeleteConfirm({ id, title });
  };

  // 确认删除（未看完）
  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { error } = await supabase
      .from('collected_video')
      .delete()
      .eq('id', deleteConfirm.id);

    if (!error) {
      setVideos(prev => prev.filter(v => v.id !== deleteConfirm.id));
    }
    setDeleteConfirm(null);
  };

  // 标记已看完（带纸屑动画）
  const markAsWatched = async () => {
    if (!deleteConfirm) return;
    const { error } = await supabase
      .from('collected_video')
      .delete()
      .eq('id', deleteConfirm.id);

    if (!error) {
      setVideos(prev => prev.filter(v => v.id !== deleteConfirm.id));
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 3000);
    }
    setDeleteConfirm(null);
  };

  // 打开视频
  const handleVideoClick = (bvid: string) => {
    window.open(`https://www.bilibili.com/video/${bvid}`, '_blank');
  };

  // 解析输入的链接
  const handleParse = async () => {
    setParsedBvids([]);
    setResults([]);
    setImporting(true); // 显示加载状态

    const bvids = await parseBilibiliLinks(inputText);
    setParsedBvids(bvids);
    setImporting(false);

    if (bvids.length === 0) {
      setResults([{ bvid: '', success: false, error: '未识别到有效的B站视频链接' }]);
      setShowResults(true);
    }
  };

  // 开始导入
  const handleImport = async () => {
    if (parsedBvids.length === 0) return;

    const userId = getStoredUserId();
    if (!userId) {
      alert('请先登录');
      return;
    }

    setImporting(true);
    setProgress({ current: 0, total: parsedBvids.length });
    setResults([]);
    setShowResults(true);

    const newResults: typeof results = [];

    for (let i = 0; i < parsedBvids.length; i++) {
      const bvid = parsedBvids[i];
      setProgress({ current: i + 1, total: parsedBvids.length });

      try {
        // 获取视频信息
        const info = await fetchVideoInfo(bvid);

        // 处理封面URL
        let picUrl = info.pic || '';
        if (picUrl.startsWith('//')) {
          picUrl = `https:${picUrl}`;
        }

        // 处理UP主头像URL
        let faceUrl = info.owner?.face || '';
        if (faceUrl.startsWith('//')) {
          faceUrl = `https:${faceUrl}`;
        }

        // 获取访问限制信息
        let accessRestriction: string | null = null;
        // 检查充电专属（顶层字段）
        if (info.is_upower_exclusive === true) {
          accessRestriction = 'charging';
        } else if (info.rights) {
          // 检查付费相关（rights字段）
          if (info.rights.arc_pay === 1) accessRestriction = 'arc_pay';
          else if (info.rights.ugc_pay === 1) accessRestriction = 'ugc_pay';
          else if (info.rights.pay === 1) accessRestriction = 'pay';
        }

        // 插入到收藏视频表（独立表，无外键约束）
        const { error } = await supabase
          .from('collected_video')
          .upsert({
            bvid: info.bvid,
            aid: info.aid,
            title: info.title,
            pic: picUrl,
            description: info.desc || '',
            duration: info.duration,
            pubdate: new Date(info.pubdate * 1000).toISOString(),
            view_count: info.stat?.view || 0,
            danmaku_count: info.stat?.danmaku || 0,
            reply_count: info.stat?.reply || 0,
            like_count: info.stat?.like || 0,
            coin_count: info.stat?.coin || 0,
            favorite_count: info.stat?.favorite || 0,
            share_count: info.stat?.share || 0,
            uploader_mid: info.owner?.mid,
            uploader_name: info.owner?.name,
            uploader_face: faceUrl,
            user_id: userId,
            access_restriction: accessRestriction,
          }, { onConflict: 'user_id,bvid' });

        if (error) throw error;

        newResults.push({ bvid, success: true, title: info.title });
      } catch (error: any) {
        newResults.push({ bvid, success: false, error: error.message });
      }

      setResults([...newResults]);

      // 请求间隔，避免触发限流
      if (i < parsedBvids.length - 1) {
        await new Promise(r => setTimeout(r, 500));
      }
    }

    setImporting(false);
    if (newResults.filter(r => r.success).length > 0) {
      onSuccess?.();
      loadVideos(); // 刷新列表
    }
  };

  // 清空
  const handleClear = () => {
    setInputText('');
    setParsedBvids([]);
    setResults([]);
    setShowResults(false);
  };

  return (
    <div>
      {/* 入口按钮 */}
      <button
        onClick={() => setIsDrawerOpen(true)}
        className="w-full p-4 bg-gradient-to-r from-cyber-lime/20 to-cyan-500/20 hover:from-cyber-lime/30 hover:to-cyan-500/30 border border-cyber-lime/30 rounded-2xl transition-all active:scale-[0.98]"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-cyber-lime/30 flex items-center justify-center">
            <svg className="w-6 h-6 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          </div>
          <div className="flex-1 text-left">
            <h3 className="text-white font-medium">批量导入视频</h3>
            <p className="text-gray-400 text-sm">粘贴B站链接，快速收藏</p>
          </div>
        </div>
      </button>

      {/* 导入结果展示 */}
      {showResults && results.length > 0 && (
        <div className="mt-4 p-4 bg-white/5 border border-white/10 rounded-2xl">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-white font-medium">
              导入结果 ({results.filter(r => r.success).length}/{results.length})
            </h4>
            <button
              onClick={() => setShowResults(false)}
              className="text-gray-500 hover:text-white"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {results.map((r, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                {r.success ? (
                  <svg className="w-4 h-4 text-green-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4 text-red-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                )}
                <span className={r.success ? 'text-gray-300' : 'text-red-400'}>
                  {r.success ? r.title : `${r.bvid}: ${r.error}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 收藏视频列表 */}
      <div className="mt-6">
        <h3 className="text-white font-medium mb-3 flex items-center gap-2">
          <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          我的收藏 ({videos.length})
        </h3>

        {loading ? (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        ) : videos.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <svg className="w-12 h-12 mx-auto mb-2 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <p>暂无收藏视频</p>
            <p className="text-xs mt-1">点击上方按钮导入</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {videos.map((video, index) => (
              <div
                key={video.id}
                className="bg-white/5 rounded-2xl border border-white/10 overflow-hidden hover:bg-white/10 transition-colors animate-card-enter"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                {/* 封面 */}
                <div
                  className="relative aspect-video cursor-pointer"
                  onClick={() => handleVideoClick(video.bvid)}
                >
                  <img
                    src={video.pic}
                    alt={video.title}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                  <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 bg-black/80 rounded text-[10px] text-white font-medium">
                    {formatDuration(video.duration)}
                  </div>
                  {/* 充电/付费标识 */}
                  {video.access_restriction && (
                    <div className="absolute bottom-1.5 left-1.5 px-1.5 py-0.5 bg-gradient-to-r from-amber-500 to-orange-500 rounded text-[10px] font-bold text-white flex items-center gap-0.5 shadow-lg">
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                      </svg>
                      <span>{video.access_restriction === 'charging' ? '充电' : '付费'}</span>
                    </div>
                  )}
                  {/* 删除按钮 */}
                  <button
                    onClick={(e) => { e.stopPropagation(); requestDelete(video.id, video.title); }}
                    className="absolute top-1.5 right-1.5 p-1.5 bg-black/60 hover:bg-red-500/80 rounded-lg text-white/70 hover:text-white transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                </div>

                {/* 信息 */}
                <div className="p-2.5">
                  <h4
                    className="text-white text-xs font-medium line-clamp-2 leading-tight cursor-pointer hover:text-cyber-lime"
                    onClick={() => handleVideoClick(video.bvid)}
                  >
                    {video.title}
                  </h4>
                  <div className="flex items-center justify-between gap-1.5 mt-1.5">
                    <div className="flex items-center gap-1.5 text-[10px] text-gray-500 min-w-0">
                      <span className="truncate max-w-[60px]">{video.uploader_name}</span>
                      <span>·</span>
                      <span className="shrink-0">{formatCount(video.view_count)}播放</span>
                    </div>
                    {/* 三个点按钮 */}
                    <button
                      onClick={(e) => { e.stopPropagation(); setOpenMenuId(video.id); }}
                      className="shrink-0 w-6 h-6 flex items-center justify-center rounded-lg hover:bg-white/10 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="5" cy="12" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="19" cy="12" r="2" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 视频操作抽屉 */}
      {openMenuId && (() => {
        const video = videos.find(v => v.id === openMenuId);
        if (!video) return null;
        return createPortal(
          <div className="fixed inset-0 z-[99999]" onClick={(e) => e.stopPropagation()}>
            {/* 遮罩层 */}
            <div
              className="absolute inset-0 bg-black/70 animate-drawer-overlay-in"
              onClick={() => { setDescExpanded(false); setOpenMenuId(null); }}
            />
            {/* 抽屉内容 */}
            <div className="absolute bottom-0 left-0 right-0 animate-drawer-slide-up transform-gpu">
              <div className="bg-[#0c0c0c] border-t border-white/10 rounded-t-2xl pb-safe">
                {/* 拖拽指示条 */}
                <div className="flex justify-center pt-3 pb-2">
                  <div className="w-10 h-1 bg-white/25 rounded-full" />
                </div>

                {/* 视频信息预览 */}
                <div className="px-4 pb-3 pt-1 border-b border-white/10">
                  <div className="flex gap-3 items-start">
                    <img
                      src={video.pic}
                      alt={video.title}
                      className="w-16 h-10 rounded object-cover bg-gray-800 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="flex-1 min-w-0">
                      <h4 className="text-white text-sm font-medium line-clamp-2 leading-snug">{video.title}</h4>
                      <p className="text-cyber-lime text-xs mt-0.5 truncate">{video.uploader_name}</p>
                    </div>
                  </div>
                  {/* 视频简介 */}
                  {video.description && (
                    <div className="mt-2.5">
                      <div className="flex items-start gap-2">
                        <p className={`flex-1 text-xs text-gray-400 leading-relaxed ${descExpanded ? '' : 'line-clamp-2'}`}>
                          {parseLinksToElements(video.description)}
                        </p>
                        {video.description.length > 50 && (
                          <button
                            onClick={() => setDescExpanded(!descExpanded)}
                            className="shrink-0 w-5 h-5 flex items-center justify-center text-cyber-lime hover:text-cyber-lime/80 transition-all"
                          >
                            <svg 
                              className={`w-4 h-4 transition-transform duration-200 ${descExpanded ? 'rotate-180' : ''}`} 
                              viewBox="0 0 24 24" 
                              fill="none" 
                              stroke="currentColor" 
                              strokeWidth="2"
                            >
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* 操作按钮列表 */}
                <div className="py-1">
                  {/* 分享 */}
                  <button
                    onClick={() => {
                      const url = `https://www.bilibili.com/video/${video.bvid}`;
                      if (navigator.share) {
                        navigator.share({ title: video.title, url });
                      } else {
                        navigator.clipboard.writeText(url);
                        alert('链接已复制到剪贴板');
                      }
                      setOpenMenuId(null);
                    }}
                    className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="18" cy="5" r="3" />
                        <circle cx="6" cy="12" r="3" />
                        <circle cx="18" cy="19" r="3" />
                        <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                        <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-[15px] text-white font-medium">分享</span>
                      <p className="text-xs text-gray-500 mt-0.5">分享给好友或复制链接</p>
                    </div>
                  </button>

                  {/* 在B站打开 */}
                  <button
                    onClick={() => {
                      window.open(`https://www.bilibili.com/video/${video.bvid}`, '_blank');
                      setOpenMenuId(null);
                    }}
                    className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                      <svg className="w-5 h-5 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-[15px] text-white font-medium">在B站打开</span>
                      <p className="text-xs text-gray-500 mt-0.5">跳转到哔哩哔哩观看</p>
                    </div>
                  </button>

                  {/* 下载视频 */}
                  <button
                    onClick={async () => {
                      const videoUrl = `https://www.bilibili.com/video/${video.bvid}`;
                      try {
                        await navigator.clipboard.writeText(videoUrl);
                      } catch { /* ignore */ }
                      setOpenMenuId(null);
                      // 触发自定义事件，通知父组件跳转到下载页面
                      window.dispatchEvent(new CustomEvent('navigate-to-downloader', { detail: { url: videoUrl } }));
                    }}
                    className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-gradient-to-br from-pink-500/20 to-rose-500/20 flex items-center justify-center">
                      <svg className="w-5 h-5 text-pink-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="7 10 12 15 17 10" />
                        <line x1="12" y1="15" x2="12" y2="3" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-[15px] text-white font-medium">下载视频</span>
                      <p className="text-xs text-gray-500 mt-0.5">跳转下载页面，链接已复制</p>
                    </div>
                    <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="9 18 15 12 9 6" />
                    </svg>
                  </button>

                  {/* 删除视频 */}
                  <button
                    onClick={() => {
                      setOpenMenuId(null);
                      requestDelete(video.id, video.title);
                    }}
                    className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                  >
                    <div className="w-9 h-9 rounded-full bg-red-500/15 flex items-center justify-center">
                      <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </div>
                    <div className="flex-1 text-left">
                      <span className="text-[15px] text-red-400 font-medium">删除视频</span>
                      <p className="text-xs text-gray-500 mt-0.5">从收藏夹中移除</p>
                    </div>
                  </button>
                </div>

                {/* 取消按钮 */}
                <div className="px-4 pb-4 pt-2">
                  <button
                    onClick={() => { setDescExpanded(false); setOpenMenuId(null); }}
                    className="w-full py-3 bg-white/10 active:bg-white/15 rounded-xl text-white text-[15px] font-medium transition-colors"
                  >
                    取消
                  </button>
                </div>
              </div>
            </div>
          </div>,
          document.body
        );
      })()}

      {/* 抽屉弹窗 */}
      {isDrawerOpen && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-end justify-center" onClick={() => !importing && setIsDrawerOpen(false)}>
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative w-full max-w-lg bg-[#0c0c0c] rounded-t-3xl border-t border-white/10 animate-drawer-slide-up"
            onClick={e => e.stopPropagation()}
          >
            {/* 拖拽条 */}
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-10 h-1 bg-white/25 rounded-full" />
            </div>

            <div className="px-5 pb-6 max-h-[80vh] overflow-y-auto">
              <h2 className="text-lg font-bold text-white mb-2">批量导入B站视频</h2>
              <p className="text-gray-500 text-sm mb-4">
                粘贴B站视频链接，支持多个链接（每行一个或用空格分隔）
              </p>

              {/* 剪贴板提示 - 在输入框上方 */}
              {clipboardContent && !inputText && (
                <button
                  onClick={() => {
                    setInputText(clipboardContent);
                    setParsedBvids([]);
                  }}
                  className="w-full mb-3 p-3 bg-cyber-lime/15 hover:bg-cyber-lime/25 border border-cyber-lime/30 rounded-xl transition-all text-left group"
                >
                  <div className="flex items-center gap-2 mb-1.5">
                    <svg className="w-4 h-4 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                      <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
                    </svg>
                    <span className="text-cyber-lime text-xs font-medium">点击粘贴</span>
                  </div>
                  <p className="text-gray-400 text-xs line-clamp-2 group-hover:text-gray-300 break-all">
                    {clipboardContent.length > 150 ? clipboardContent.slice(0, 150) + '...' : clipboardContent}
                  </p>
                </button>
              )}

              {/* 输入区域 */}
              <div className="mb-4">
                <textarea
                  value={inputText}
                  onChange={e => {
                    setInputText(e.target.value);
                    setParsedBvids([]);
                  }}
                  onFocus={readClipboard}
                  placeholder={`支持以下格式：
• BV1xx411c7mD (BV号)
• https://www.bilibili.com/video/BV1xx411c7mD (PC端)
• https://m.bilibili.com/video/BV1xx411c7mD (移动端)
• https://b23.tv/xxxxx (短链接)
• 【标题】 https://b23.tv/xxxxx (分享文本)

可一次粘贴多个链接或分享文本...`}
                  rows={6}
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:border-cyber-lime/50 focus:outline-none resize-none text-sm"
                  disabled={importing}
                />
              </div>

              {/* 解析按钮 */}
              {!importing && parsedBvids.length === 0 && (
                <button
                  onClick={handleParse}
                  disabled={!inputText.trim()}
                  className="w-full py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4 flex items-center justify-center gap-2"
                >
                  {importing ? (
                    <>
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      解析中...
                    </>
                  ) : (
                    '解析链接'
                  )}
                </button>
              )}

              {/* 解析结果预览 */}
              {parsedBvids.length > 0 && !importing && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-gray-400 text-sm">
                      识别到 {parsedBvids.length} 个视频
                    </span>
                    <button
                      onClick={handleClear}
                      className="text-gray-500 hover:text-white text-sm"
                    >
                      清空
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {parsedBvids.slice(0, 10).map(bvid => (
                      <span
                        key={bvid}
                        className="px-2 py-1 bg-cyber-lime/20 text-cyber-lime text-xs rounded-full"
                      >
                        {bvid}
                      </span>
                    ))}
                    {parsedBvids.length > 10 && (
                      <span className="px-2 py-1 bg-white/10 text-gray-400 text-xs rounded-full">
                        +{parsedBvids.length - 10} 更多
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 导入进度 */}
              {importing && (
                <div className="mb-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-white text-sm">
                      正在导入... {progress.current}/{progress.total}
                    </span>
                    <span className="text-cyber-lime text-sm">
                      {Math.round((progress.current / progress.total) * 100)}%
                    </span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-cyber-lime transition-all duration-300"
                      style={{ width: `${(progress.current / progress.total) * 100}%` }}
                    />
                  </div>
                </div>
              )}

              {/* 操作按钮 */}
              <div className="flex gap-3">
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  disabled={importing}
                  className="flex-1 py-3 bg-white/10 hover:bg-white/15 rounded-xl text-white font-medium transition-colors disabled:opacity-50"
                >
                  取消
                </button>
                <button
                  onClick={handleImport}
                  disabled={parsedBvids.length === 0 || importing}
                  className="flex-1 py-3 bg-cyber-lime hover:bg-cyber-lime/90 rounded-xl text-black font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {importing ? '导入中...' : `导入 ${parsedBvids.length} 个视频`}
                </button>
              </div>
            </div>

            <style>{`
              @keyframes drawer-slide-up {
                from { transform: translateY(100%); }
                to { transform: translateY(0); }
              }
              @keyframes card-enter {
                from { opacity: 0; transform: translateY(16px) scale(0.95); }
                to { opacity: 1; transform: translateY(0) scale(1); }
              }
              .animate-drawer-slide-up {
                animation: drawer-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
              }
              .animate-card-enter {
                animation: card-enter 0.4s ease-out both;
              }
            `}</style>
          </div>
        </div>,
        document.body
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirm && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4" onClick={() => setDeleteConfirm(null)}>
          <div className="absolute inset-0 bg-black/70" />
          <div
            className="relative w-full max-w-sm bg-[#0c0c0c] rounded-3xl border border-white/10 p-6 animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="text-center mb-6">
              <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-amber-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <h3 className="text-white font-bold text-lg mb-2">确认移除</h3>
              <p className="text-gray-400 text-sm line-clamp-2 mb-1">{deleteConfirm.title}</p>
              <p className="text-amber-400 text-sm">这个视频看完了吗？</p>
            </div>

            <div className="space-y-2">
              <button
                onClick={markAsWatched}
                className="w-full py-3 bg-gradient-to-r from-cyber-lime to-cyan-400 rounded-xl text-black font-bold transition-all hover:shadow-lg hover:shadow-cyber-lime/30 active:scale-[0.98]"
              >
                ✨ 看完啦！
              </button>
              <button
                onClick={confirmDelete}
                className="w-full py-3 bg-white/10 hover:bg-white/15 rounded-xl text-gray-400 font-medium transition-colors"
              >
                还没看完，先移除
              </button>
              <button
                onClick={() => setDeleteConfirm(null)}
                className="w-full py-2 text-gray-500 text-sm hover:text-white transition-colors"
              >
                取消
              </button>
            </div>
          </div>
          <style>{`
            @keyframes scale-in {
              from { transform: scale(0.9); opacity: 0; }
              to { transform: scale(1); opacity: 1; }
            }
            .animate-scale-in {
              animation: scale-in 0.2s ease-out;
            }
          `}</style>
        </div>,
        document.body
      )}

      {/* 碎玻璃庆祝动画 */}
      {showConfetti && createPortal(
        <div className="fixed inset-0 pointer-events-none z-[100000] flex items-center justify-center">
          {/* 中心闪光 */}
          <div className="absolute w-32 h-32 bg-cyber-lime/30 rounded-full animate-pulse-flash"
            style={{ animation: 'pulse-flash 0.5s ease-out forwards' }} />

          {/* 玻璃碎片 */}
          {Array.from({ length: 20 }).map((_, i) => {
            const angleRad = ((i / 20) * 360 + Math.random() * 30) * (Math.PI / 180);
            const distance = 25 + Math.random() * 45;
            const endX = Math.cos(angleRad) * distance;
            const endY = Math.sin(angleRad) * distance;
            const size = 20 + Math.random() * 30;
            const delay = Math.random() * 0.08;

            return (
              <div
                key={i}
                className="absolute"
                style={{
                  width: size,
                  height: size * (0.5 + Math.random() * 0.5),
                  background: `linear-gradient(${Math.random() * 360}deg, 
                    rgba(163,230,53,0.95) 0%, 
                    rgba(34,211,238,0.8) 50%, 
                    rgba(255,255,255,0.9) 100%)`,
                  clipPath: `polygon(
                    ${15 + Math.random() * 25}% 0%, 
                    ${65 + Math.random() * 35}% ${5 + Math.random() * 15}%, 
                    100% ${35 + Math.random() * 30}%, 
                    ${75 + Math.random() * 25}% 100%, 
                    ${5 + Math.random() * 25}% ${75 + Math.random() * 25}%, 
                    0% ${25 + Math.random() * 35}%
                  )`,
                  boxShadow: '0 0 15px rgba(163,230,53,0.6), inset 0 0 10px rgba(255,255,255,0.4)',
                  animation: `shard-fly-${i} 0.7s cubic-bezier(0.22, 0.61, 0.36, 1) ${delay}s forwards`,
                }}
              />
            );
          })}

          {/* 小钻石碎片 */}
          {Array.from({ length: 30 }).map((_, i) => {
            const angleRad = (Math.random() * 360) * (Math.PI / 180);
            const distance = 15 + Math.random() * 55;
            const endX = Math.cos(angleRad) * distance;
            const endY = Math.sin(angleRad) * distance;
            const size = 5 + Math.random() * 10;
            const delay = Math.random() * 0.12;
            const colors = ['#a3e635', '#22d3ee', '#ffffff', '#facc15', '#f472b6'];
            const color = colors[Math.floor(Math.random() * colors.length)];

            return (
              <div
                key={`diamond-${i}`}
                className="absolute"
                style={{
                  width: size,
                  height: size,
                  backgroundColor: color,
                  clipPath: 'polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%)',
                  boxShadow: `0 0 8px ${color}`,
                  animation: `diamond-fly-${i} 0.6s ease-out ${delay}s forwards`,
                }}
              />
            );
          })}

          <style>{`
            @keyframes pulse-flash {
              0% { transform: scale(0); opacity: 1; filter: blur(0); }
              40% { transform: scale(1.5); opacity: 0.9; filter: blur(2px); }
              100% { transform: scale(2.5); opacity: 0; filter: blur(8px); }
            }
            ${Array.from({ length: 20 }).map((_, i) => {
            const angleRad = ((i / 20) * 360 + Math.random() * 30) * (Math.PI / 180);
            const distance = 25 + Math.random() * 45;
            const endX = Math.cos(angleRad) * distance;
            const endY = Math.sin(angleRad) * distance;
            const midX = endX * 0.4;
            const midY = endY * 0.4;
            const rot = 90 + Math.random() * 180;
            return `
                @keyframes shard-fly-${i} {
                  0% { transform: translate(0, 0) rotate(0deg) scale(0); opacity: 0; }
                  25% { transform: translate(${midX}vmin, ${midY}vmin) rotate(${rot * 0.4}deg) scale(1.15); opacity: 1; }
                  100% { transform: translate(${endX}vmin, ${endY}vmin) rotate(${rot}deg) scale(0.2); opacity: 0; }
                }
              `;
          }).join('')}
            ${Array.from({ length: 30 }).map((_, i) => {
            const angleRad = (Math.random() * 360) * (Math.PI / 180);
            const distance = 15 + Math.random() * 55;
            const endX = Math.cos(angleRad) * distance;
            const endY = Math.sin(angleRad) * distance;
            const rot = 180 + Math.random() * 360;
            return `
                @keyframes diamond-fly-${i} {
                  0% { transform: translate(0, 0) rotate(0deg) scale(0); opacity: 0; }
                  30% { transform: translate(${endX * 0.5}vmin, ${endY * 0.5}vmin) rotate(${rot * 0.5}deg) scale(1.2); opacity: 1; }
                  100% { transform: translate(${endX}vmin, ${endY}vmin) rotate(${rot}deg) scale(0); opacity: 0; }
                }
              `;
          }).join('')}
          `}</style>
        </div>,
        document.body
      )}
    </div>
  );
};

export default VideoCollector;
