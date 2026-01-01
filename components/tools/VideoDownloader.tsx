import React, { useState, useEffect, useCallback } from 'react';
import { supabase, isSupabaseConfigured } from '../../lib/supabase';
import { getCurrentUser } from '../../lib/auth';

interface VideoItem {
  id: string;
  bvid: string;
  title: string;
  pic: string;
  uploader?: { name: string }[] | { name: string };
}

// 下载服务列表
const DOWNLOAD_SERVICES = [
  { id: 'cobalt', name: 'Cobalt', url: 'https://cobalt.tools', desc: '推荐，速度快' },
  { id: 'y2b', name: 'Y2B', url: 'https://y2b.455556.xyz', desc: '备用服务' },
];

interface VideoDownloaderProps {
  onNavigate?: (page: string) => void;
}

const VideoDownloader: React.FC<VideoDownloaderProps> = ({ onNavigate }) => {
  const [showModal, setShowModal] = useState(false);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentService, setCurrentService] = useState(DOWNLOAD_SERVICES[0]);
  const [showServiceMenu, setShowServiceMenu] = useState(false);

  // 获取视频列表
  const fetchVideos = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    setLoading(true);
    try {
      const user = await getCurrentUser();
      if (!user) {
        console.log('[VideoDownloader] 用户未登录');
        return;
      }

      console.log('[VideoDownloader] 获取视频列表, userId:', user.id);
      const { data, error } = await supabase
        .from('video')
        .select('id, bvid, title, pic, mid')
        .eq('user_id', user.id)
        .order('pubdate', { ascending: false })
        .limit(100);

      if (error) {
        console.error('[VideoDownloader] 查询错误:', error);
        throw error;
      }

      // 获取 uploader 信息
      let processedVideos = data || [];
      if (data && data.length > 0) {
        const mids = [...new Set(data.map((v: any) => v.mid).filter(Boolean))];
        if (mids.length > 0) {
          const { data: uploaders } = await supabase
            .from('uploader')
            .select('mid, name')
            .eq('user_id', user.id)
            .in('mid', mids);
          const uploaderMap = new Map(uploaders?.map((u: any) => [u.mid, u]) || []);
          processedVideos = data.map((v: any) => ({
            ...v,
            uploader: uploaderMap.get(v.mid) || null
          }));
        }
      }

      console.log('[VideoDownloader] 获取到视频:', processedVideos?.length);
      setVideos((processedVideos as VideoItem[]) || []);
    } catch (err) {
      console.error('[VideoDownloader] 获取视频列表失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (showModal) {
      fetchVideos();
    }
  }, [showModal, fetchVideos]);

  // 复制链接
  const copyLink = useCallback(async (bvid: string) => {
    const url = `https://www.bilibili.com/video/${bvid}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(bvid);
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      console.error('复制失败');
    }
  }, []);

  // 获取UP主名称
  const getUploaderName = (uploader?: { name: string }[] | { name: string }) => {
    if (!uploader) return '未知UP主';
    if (Array.isArray(uploader)) return uploader[0]?.name || '未知UP主';
    return uploader.name || '未知UP主';
  };

  // 过滤视频
  const filteredVideos = videos.filter(v =>
    v.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
    getUploaderName(v.uploader).toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-[calc(100vh-120px)] -m-4 flex flex-col">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between px-4 py-2 bg-cyber-dark border-b border-white/10 relative z-20">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-3 py-2 bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/30 rounded-xl transition-all active:scale-95 btn-press"
          >
            <svg className="w-4 h-4 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-pink-400 text-sm font-medium">我的视频</span>
          </button>

          {/* 跳转到音频转写 */}
          {onNavigate && (
            <button
              onClick={() => onNavigate('transcriber')}
              className="flex items-center gap-2 px-3 py-2 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 rounded-xl transition-all active:scale-95 btn-press"
            >
              <svg className="w-4 h-4 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" y1="19" x2="12" y2="23" />
                <line x1="8" y1="23" x2="16" y2="23" />
              </svg>
              <span className="text-violet-400 text-sm font-medium">音频转写</span>
            </button>
          )}
        </div>

        {/* 服务切换 */}
        <div className="relative">
          <button
            onClick={() => setShowServiceMenu(!showServiceMenu)}
            className="flex items-center gap-1.5 px-3 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl transition-all text-gray-400 hover:text-white text-xs btn-press"
          >
            <span>{currentService.name}</span>
            <svg className={`w-3 h-3 transition-transform ${showServiceMenu ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>

          {/* 下拉菜单 */}
          {showServiceMenu && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-cyber-dark border border-white/10 rounded-xl overflow-hidden shadow-xl z-50 animate-modal-in">
              {DOWNLOAD_SERVICES.map((service) => (
                <button
                  key={service.id}
                  onClick={() => {
                    setCurrentService(service);
                    setShowServiceMenu(false);
                  }}
                  className={`w-full px-3 py-2 text-left text-sm transition-colors ${currentService.id === service.id
                      ? 'bg-pink-500/20 text-pink-400'
                      : 'text-gray-400 hover:bg-white/10 hover:text-white'
                    }`}
                >
                  <div className="font-medium">{service.name}</div>
                  <div className="text-xs opacity-60">{service.desc}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* iframe */}
      <div className="flex-1">
        <iframe
          key={currentService.id}
          src={currentService.url}
          className="w-full h-full border-0"
          title={`${currentService.name} 音视频下载`}
          allow="clipboard-read; clipboard-write"
        />
      </div>

      {/* 视频列表弹窗 */}
      {showModal && (
        <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-backdrop-in"
            onClick={() => setShowModal(false)}
          />
          <div className="relative w-full sm:w-[480px] max-h-[80vh] bg-cyber-card border border-white/10 rounded-t-2xl sm:rounded-2xl overflow-hidden animate-sheet-in sm:animate-modal-in">
            {/* 顶部光晕背景 - 全宽渐变 */}
            <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-cyber-lime/20 to-transparent pointer-events-none z-0" />
            {/* 弹窗头部 */}
            <div className="sticky top-0 z-10 bg-cyber-dark/95 backdrop-blur-xl border-b border-white/10 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-bold">我的视频</h3>
                <button
                  onClick={() => setShowModal(false)}
                  className="p-2 hover:bg-white/10 rounded-lg transition-all duration-200 btn-press"
                >
                  <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
              {/* 搜索框 */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" /><path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="搜索视频..."
                  className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-pink-500/50 transition-all duration-200"
                />
              </div>
            </div>

            {/* 视频列表 */}
            <div className="overflow-y-auto max-h-[60vh] p-4 space-y-2">
              {loading ? (
                <div className="flex items-center justify-center py-10">
                  <svg className="w-6 h-6 text-pink-400 animate-spin-smooth" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              ) : filteredVideos.length === 0 ? (
                <div className="text-center py-10 text-gray-500 animate-list-item">
                  {searchTerm ? '没有找到匹配的视频' : '暂无视频'}
                </div>
              ) : (
                filteredVideos.map((video, index) => (
                  <div
                    key={video.id}
                    className="flex items-center gap-3 p-2 bg-white/5 hover:bg-white/10 rounded-xl transition-all duration-200 card-hover animate-list-item"
                    style={{ animationDelay: `${Math.min(index * 30, 300)}ms` }}
                  >
                    {/* 缩略图 */}
                    <div className="w-20 h-12 rounded-lg overflow-hidden bg-black/50 flex-shrink-0">
                      <img
                        src={video.pic}
                        alt={video.title}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                    </div>
                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm line-clamp-1">{video.title}</p>
                      <p className="text-gray-500 text-xs">{getUploaderName(video.uploader)}</p>
                    </div>
                    {/* 复制按钮 */}
                    <button
                      onClick={() => copyLink(video.bvid)}
                      className={`p-2 rounded-lg transition-all duration-200 flex-shrink-0 btn-press ${copiedId === video.bvid
                          ? 'bg-green-500/20 text-green-400 scale-110'
                          : 'hover:bg-white/10 text-gray-400 hover:text-white'
                        }`}
                    >
                      {copiedId === video.bvid ? (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                        </svg>
                      )}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


export default VideoDownloader;
