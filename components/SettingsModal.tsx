import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { getCurrentUser, updateBilibiliCookie, logout, type User } from '../lib/auth';
import { clearCookieCache } from '../lib/bilibili';
import { ClockIcon } from './Icons';

interface Uploader {
  id: number;
  mid: number;
  name: string;
  face: string | null;
  sign: string | null;
  is_active: boolean;
  last_sync_count: number | null;
  last_sync_at: string | null;
}

interface VideoItem {
  id: number;
  bvid: string;
  title: string;
  pic: string | null;
  duration: number;
  pubdate: string;
  uploader: {
    name: string;
    face: string | null;
  } | null;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
  watchLaterIds?: Set<string>;
  onToggleWatchLater?: (bvid: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onLogout, watchLaterIds, onToggleWatchLater }) => {
  const [activeTab, setActiveTab] = useState<'account' | 'uploaders' | 'videos'>('account');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [uploaders, setUploaders] = useState<Uploader[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoCount, setVideoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<number | null>(null);

  // 当前打开菜单的视频
  const menuVideo = useMemo(() => {
    if (!openMenuId) return null;
    return videos.find(v => v.id === openMenuId) || null;
  }, [openMenuId, videos]);
  
  // 用户信息
  const [user, setUser] = useState<User | null>(null);
  const [cookie, setCookie] = useState('');
  const [savingCookie, setSavingCookie] = useState(false);
  const [cookieMessage, setCookieMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 获取数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 获取当前用户
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      setCookie(currentUser?.bilibili_cookie || '');
      
      if (!currentUser?.id) {
        setUploaders([]);
        setVideoCount(0);
        return;
      }
      
      // 获取UP主列表（按用户过滤）
      const { data: uploaderData } = await supabase
        .from('uploader')
        .select('*')
        .eq('user_id', currentUser.id)
        .order('created_at', { ascending: false });
      
      setUploaders(uploaderData || []);

      // 获取视频列表（含UP主信息）
      const { data: videoData, count } = await supabase
        .from('video')
        .select(`
          id, bvid, title, pic, duration, pubdate,
          uploader:uploader!fk_video_uploader (name, face)
        `, { count: 'exact' })
        .eq('user_id', currentUser.id)
        .order('pubdate', { ascending: false })
        .limit(100);
      
      // 处理 uploader 数据（Supabase 返回数组，取第一个）
      const processedVideos = (videoData || []).map((v: any) => ({
        ...v,
        uploader: Array.isArray(v.uploader) ? v.uploader[0] || null : v.uploader
      }));
      setVideos(processedVideos as VideoItem[]);
      setVideoCount(count || 0);
    } catch (err) {
      console.error('获取数据失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      fetchData();
      setCookieMessage(null);
    }
  }, [isOpen, fetchData]);
  
  // 保存Cookie
  const handleSaveCookie = async () => {
    if (!cookie.trim()) {
      setCookieMessage({ type: 'error', text: '请输入Cookie' });
      return;
    }
    
    setSavingCookie(true);
    setCookieMessage(null);
    
    const result = await updateBilibiliCookie(cookie.trim());
    
    if (result.success) {
      clearCookieCache();
      setCookieMessage({ type: 'success', text: 'Cookie保存成功！' });
    } else {
      setCookieMessage({ type: 'error', text: result.error || '保存失败' });
    }
    
    setSavingCookie(false);
  };
  
  // 退出登录
  const handleLogout = () => {
    if (confirm('确定要退出登录吗？')) {
      logout();
      clearCookieCache();
      onClose();
      onLogout?.();
    }
  };

  // 删除UP主
  const handleDeleteUploader = async (id: number, name: string) => {
    if (!confirm(`确定要取消关注「${name}」吗？`)) return;
    
    setDeleting(id);
    try {
      await supabase.from('uploader').delete().eq('id', id);
      setUploaders(prev => prev.filter(u => u.id !== id));
    } catch (err) {
      alert('删除失败');
    } finally {
      setDeleting(null);
    }
  };

  // 删除单个视频
  const handleDeleteVideo = async (id: number, bvid: string) => {
    if (!confirm('确定要删除这个视频吗？')) return;
    
    if (!user?.id) return;
    
    setDeletingVideo(id);
    try {
      // 先删除待看列表中的引用
      await supabase.from('watchlist').delete().eq('user_id', user.id).eq('bvid', bvid);
      // 再删除视频
      await supabase.from('video').delete().eq('id', id);
      setVideos(prev => prev.filter(v => v.id !== id));
      setVideoCount(prev => prev - 1);
    } catch (err) {
      console.error('删除失败:', err);
      alert('删除失败');
    } finally {
      setDeletingVideo(null);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div 
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-lg bg-[#0c0c14] border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl h-[75vh] flex flex-col overflow-hidden animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-gradient-to-br from-cyber-lime to-emerald-400 flex items-center justify-center text-black font-bold text-lg">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div>
                <h2 className="text-lg font-bold text-white">{user?.username || '用户'}</h2>
                <p className="text-xs text-gray-400">ID: {user?.id?.slice(0, 8) || '-'}</p>
              </div>
            </div>
            <button 
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* 统计 */}
          <div className="flex gap-4 mt-4">
            <div className="flex-1 p-3 bg-white/5 rounded-xl text-center">
              <p className="text-2xl font-bold text-cyber-lime">{uploaders.length}</p>
              <p className="text-[10px] text-gray-500 uppercase">关注UP主</p>
            </div>
            <div className="flex-1 p-3 bg-white/5 rounded-xl text-center">
              <p className="text-2xl font-bold text-white">{videoCount}</p>
              <p className="text-[10px] text-gray-500 uppercase">视频总数</p>
            </div>
          </div>
        </div>

        {/* Tab切换 */}
        <div className="flex gap-2 p-2 shrink-0">
          <button
            onClick={() => setActiveTab('account')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'account' 
                ? 'bg-cyber-lime/20 text-cyber-lime' 
                : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
            }`}
          >
            账户
          </button>
          <button
            onClick={() => setActiveTab('uploaders')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'uploaders' 
                ? 'bg-cyber-lime/20 text-cyber-lime' 
                : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
            }`}
          >
            关注
          </button>
          <button
            onClick={() => setActiveTab('videos')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
              activeTab === 'videos' 
                ? 'bg-cyber-lime/20 text-cyber-lime' 
                : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
            }`}
          >
            数据
          </button>
        </div>

        {/* 内容区 */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === 'account' ? (
            /* 账户设置 */
            <div className="p-4 space-y-4">
              {/* Cookie配置 */}
              <div className="p-4 bg-white/5 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                  <p className="text-white font-medium">B站 Cookie</p>
                  <span className="text-xs text-gray-500 bg-white/10 px-2 py-0.5 rounded">可选</span>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  不配置也能正常使用。配置后可降低被B站限流的风险。
                </p>
                <textarea
                  value={cookie}
                  onChange={(e) => setCookie(e.target.value)}
                  placeholder="粘贴你的B站Cookie..."
                  className="w-full h-24 px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 resize-none font-mono"
                />
                {cookieMessage && (
                  <p className={`mt-2 text-xs ${cookieMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {cookieMessage.text}
                  </p>
                )}
                <button
                  onClick={handleSaveCookie}
                  disabled={savingCookie}
                  className="mt-3 w-full py-2 bg-cyber-lime text-black text-sm font-medium rounded-lg hover:bg-lime-400 transition-colors disabled:opacity-50"
                >
                  {savingCookie ? '保存中...' : '保存 Cookie'}
                </button>
              </div>

              {/* 获取Cookie说明 - 折叠 */}
              <details className="p-4 bg-white/5 rounded-xl">
                <summary className="text-sm text-gray-400 cursor-pointer hover:text-white transition-colors">
                  如何获取 Cookie？（点击展开）
                </summary>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside mt-3">
                  <li>在浏览器中登录 bilibili.com</li>
                  <li>按 F12 打开开发者工具</li>
                  <li>切换到 Network (网络) 标签</li>
                  <li>刷新页面，点击任意请求</li>
                  <li>在 Headers 中找到 Cookie 并复制</li>
                </ol>
              </details>

              {/* 退出登录 */}
              <button
                onClick={handleLogout}
                className="w-full py-3 bg-red-500/10 text-red-400 text-sm font-medium rounded-xl hover:bg-red-500/20 transition-colors"
              >
                退出登录
              </button>
            </div>
          ) : activeTab === 'uploaders' ? (
            /* UP主列表 */
            <div className="p-4 space-y-2">
              {uploaders.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  暂无关注的UP主
                </div>
              ) : (
                uploaders.map(uploader => (
                  <div 
                    key={uploader.id}
                    className="flex items-center gap-3 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
                  >
                    {/* 头像 */}
                    <img 
                      src={uploader.face || 'https://i0.hdslb.com/bfs/face/member/noface.jpg'} 
                      alt={uploader.name}
                      className="w-10 h-10 rounded-full"
                      referrerPolicy="no-referrer"
                    />
                    
                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <p className="text-white font-medium truncate">{uploader.name}</p>
                      <div className="flex items-center gap-2 text-[10px] text-gray-500">
                        <span>MID: {uploader.mid}</span>
                        {uploader.last_sync_count !== null && (
                          <>
                            <span>•</span>
                            <span className="text-cyber-lime">上次 {uploader.last_sync_count} 个视频</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2">
                      {/* 跳转B站 */}
                      <button
                        onClick={() => window.open(`https://space.bilibili.com/${uploader.mid}`, '_blank')}
                        className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
                        title="查看B站主页"
                      >
                        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </button>
                      
                      {/* 删除 */}
                      <button
                        onClick={() => handleDeleteUploader(uploader.id, uploader.name)}
                        disabled={deleting === uploader.id}
                        className="w-8 h-8 rounded-lg bg-red-500/10 flex items-center justify-center hover:bg-red-500/20 transition-colors"
                        title="取消关注"
                      >
                        {deleting === uploader.id ? (
                          <div className="w-3 h-3 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          ) : (
            /* 视频管理 - 视频列表 */
            <div className="p-4 space-y-3">
              {/* 标题 */}
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-400">共 {videoCount} 个视频</p>
              </div>

              {/* 视频列表 */}
              {videos.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M10 9l5 3-5 3V9z" />
                  </svg>
                  <p>暂无视频</p>
                  <p className="text-xs mt-1">同步UP主后视频会出现在这里</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {videos.map(video => (
                    <div
                      key={video.id}
                      className="flex items-center gap-3 p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors group"
                    >
                      {/* 封面 */}
                      <div className="w-20 h-12 rounded-lg overflow-hidden bg-black/30 flex-shrink-0">
                        {video.pic ? (
                          <img
                            src={video.pic.startsWith('//') ? `https:${video.pic}` : video.pic}
                            alt={video.title}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600">
                            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="2" y="4" width="20" height="16" rx="2" />
                              <path d="M10 9l5 3-5 3V9z" />
                            </svg>
                          </div>
                        )}
                      </div>

                      {/* 标题、UP主和时长 */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{video.title}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {video.uploader && (
                            <>
                              <span className="text-xs text-cyber-lime">{video.uploader.name}</span>
                              <span className="text-xs text-gray-600">•</span>
                            </>
                          )}
                          <span className="text-xs text-gray-500">
                            {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')}
                          </span>
                          <span className="text-xs text-gray-600">•</span>
                          <span className="text-xs text-gray-500">
                            {new Date(video.pubdate).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* 三个点按钮 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === video.id ? null : video.id); }}
                        className={`p-2 rounded-lg transition-all flex-shrink-0 ${
                          openMenuId === video.id ? 'bg-white/20' : 'opacity-60 hover:opacity-100 hover:bg-white/10'
                        }`}
                      >
                        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="5" cy="12" r="2"/>
                          <circle cx="12" cy="12" r="2"/>
                          <circle cx="19" cy="12" r="2"/>
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 提示 */}
              {videos.length > 0 && videoCount > 100 && (
                <p className="text-xs text-gray-500 text-center pt-2">
                  仅显示最近 100 个视频
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 底部抽屉菜单 */}
      {menuVideo && (
        <div className="fixed inset-0 z-[99999]" onClick={(e) => e.stopPropagation()}>
          {/* 遮罩层 */}
          <div 
            className="absolute inset-0 bg-black/70"
            onClick={() => setOpenMenuId(null)}
            style={{ animation: 'fadeIn 0.25s ease-out' }}
          />
          
          {/* 抽屉内容 */}
          <div 
            className="absolute bottom-0 left-0 right-0"
            style={{ animation: 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            <div className="bg-[#0c0c0c] border-t border-white/10 rounded-t-2xl pb-safe">
              {/* 拖拽指示条 */}
              <div className="flex justify-center pt-3 pb-2">
                <div className="w-10 h-1 bg-white/25 rounded-full" />
              </div>
              
              {/* 视频信息预览 */}
              <div className="px-4 pb-3 pt-1 flex gap-3 items-start border-b border-white/10">
                <img 
                  src={menuVideo.pic?.startsWith('//') ? `https:${menuVideo.pic}` : menuVideo.pic || ''}
                  alt={menuVideo.title}
                  className="w-16 h-10 rounded object-cover bg-gray-800 shrink-0"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <h4 className="text-white text-sm font-medium line-clamp-2 leading-snug">{menuVideo.title}</h4>
                  <p className="text-cyber-lime text-xs mt-0.5 truncate">{menuVideo.uploader?.name}</p>
                </div>
              </div>

              {/* 操作按钮列表 */}
              <div className="py-1">
                {/* 加入/移除待看 */}
                {onToggleWatchLater && (
                  <button
                    onClick={() => {
                      onToggleWatchLater(menuVideo.bvid);
                      setOpenMenuId(null);
                    }}
                    className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                  >
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                      watchLaterIds?.has(menuVideo.bvid) ? 'bg-red-500/15' : 'bg-white/10'
                    }`}>
                      {watchLaterIds?.has(menuVideo.bvid) ? (
                        <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10"/>
                          <line x1="15" y1="9" x2="9" y2="15"/>
                          <line x1="9" y1="9" x2="15" y2="15"/>
                        </svg>
                      ) : (
                        <ClockIcon className="w-5 h-5 text-cyber-lime" />
                      )}
                    </div>
                    <div className="flex-1 text-left">
                      <span className={`text-[15px] font-medium ${watchLaterIds?.has(menuVideo.bvid) ? 'text-red-400' : 'text-white'}`}>
                        {watchLaterIds?.has(menuVideo.bvid) ? '从待看移除' : '加入待看'}
                      </span>
                      <p className="text-xs text-gray-500 mt-0.5">
                        {watchLaterIds?.has(menuVideo.bvid) ? '不再显示在待看队列中' : '稍后观看，不错过精彩内容'}
                      </p>
                    </div>
                  </button>
                )}

                {/* 分享 */}
                <button
                  onClick={() => {
                    const url = `https://www.bilibili.com/video/${menuVideo.bvid}`;
                    if (navigator.share) {
                      navigator.share({ title: menuVideo.title, url });
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
                      <circle cx="18" cy="5" r="3"/>
                      <circle cx="6" cy="12" r="3"/>
                      <circle cx="18" cy="19" r="3"/>
                      <line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/>
                      <line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/>
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
                    window.open(`https://www.bilibili.com/video/${menuVideo.bvid}`, '_blank');
                    setOpenMenuId(null);
                  }}
                  className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-white/5 transition-colors"
                >
                  <div className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                      <polyline points="15 3 21 3 21 9"/>
                      <line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </div>
                  <div className="flex-1 text-left">
                    <span className="text-[15px] text-white font-medium">在B站打开</span>
                    <p className="text-xs text-gray-500 mt-0.5">跳转到哔哩哔哩观看</p>
                  </div>
                </button>

                {/* 删除视频 */}
                <button
                  onClick={() => {
                    handleDeleteVideo(menuVideo.id, menuVideo.bvid);
                    setOpenMenuId(null);
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
                    <p className="text-xs text-gray-500 mt-0.5">从数据库中移除此视频</p>
                  </div>
                </button>
              </div>

              {/* 取消按钮 */}
              <div className="px-4 pb-4 pt-2">
                <button
                  onClick={() => setOpenMenuId(null)}
                  className="w-full py-3 bg-white/10 active:bg-white/15 rounded-xl text-white text-[15px] font-medium transition-colors"
                >
                  取消
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.3s ease-out;
        }
        .pb-safe {
          padding-bottom: env(safe-area-inset-bottom, 16px);
        }
      `}</style>
    </div>,
    document.body
  );
};

export default SettingsModal;
