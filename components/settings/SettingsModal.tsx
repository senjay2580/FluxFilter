import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase, isSupabaseConfigured, getAIConfigs, upsertAIConfig } from '../../lib/supabase';
import { getCurrentUser, updateBilibiliCookie, updateYouTubeApiKey, logout, getStoredUserId, type User } from '../../lib/auth';
import { clearCookieCache } from '../../lib/bilibili';
import { clearYouTubeApiKeyCache } from '../../lib/youtube';
import { invalidateCache, CACHE_KEYS } from '../../lib/cache';
import { ClockIcon } from '../shared/Icons';
import { transcribeService } from '../../lib/transcribe-service';
import { AI_MODELS, getModelApiKey, setModelApiKey } from '../../lib/ai-models';

interface Uploader {
  id: number;
  mid: number;
  name: string;
  face: string | null;
  sign: string | null;
  is_active: boolean;
  last_sync_count: number | null;
  last_sync_at: string | null;
  platform?: 'bilibili' | 'youtube';
  channel_id?: string | null;
}

interface VideoItem {
  id: number;
  bvid: string;
  title: string;
  pic: string | null;
  duration: number;
  pubdate: string;
  platform?: 'bilibili' | 'youtube';
  uploader: {
    name: string;
    face: string | null;
  } | null;
}

// UP主视频列表项
interface UploaderVideo {
  bvid: string;
  title: string;
  pic: string;
  duration: number;
  pubdate: number;
  play: number;
  comment: number;
  description: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogout?: () => void;
  watchLaterIds?: Set<string>;
  onToggleWatchLater?: (bvid: string) => void;
}

const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onLogout, watchLaterIds, onToggleWatchLater }) => {
  const [activeTab, setActiveTab] = useState<'account' | 'uploaders' | 'videos' | 'api-pool'>('account');
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);
  const [uploaders, setUploaders] = useState<Uploader[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [videoCount, setVideoCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deletingVideo, setDeletingVideo] = useState<number | null>(null);
  
  // 平台筛选状态
  const [uploaderPlatform, setUploaderPlatform] = useState<'bilibili' | 'youtube'>('bilibili');
  const [videoPlatform, setVideoPlatform] = useState<'bilibili' | 'youtube'>('bilibili');
  const [uploaderSearch, setUploaderSearch] = useState('');
  const [videoSearch, setVideoSearch] = useState('');

  // UP主视频浏览弹窗状态
  const [browseUploader, setBrowseUploader] = useState<Uploader | null>(null);
  const [uploaderVideos, setUploaderVideos] = useState<UploaderVideo[]>([]);
  const [uploaderVideosLoading, setUploaderVideosLoading] = useState(false);
  const [uploaderVideosPage, setUploaderVideosPage] = useState(1);
  const [uploaderVideosHasMore, setUploaderVideosHasMore] = useState(true);
  const [uploaderVideosSearch, setUploaderVideosSearch] = useState('');
  const [addingVideos, setAddingVideos] = useState<Set<string>>(new Set());
  const [addedVideos, setAddedVideos] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);
  const [usingFallbackApi, setUsingFallbackApi] = useState(false); // 是否使用备用接口

  // API 池配置
  const [apiPoolKeys, setApiPoolKeys] = useState<any[]>([]);
  const [newApiKey, setNewApiKey] = useState('');
  const [newApiName, setNewApiName] = useState('');
  const [newApiModel, setNewApiModel] = useState('whisper-large-v3-turbo');
  const [apiPoolLoading, setApiPoolLoading] = useState(false);

  // AI 模型配置
  const [selectedAIModel, setSelectedAIModel] = useState('deepseek-chat');
  const [aiModelKey, setAiModelKey] = useState('');
  const [aiBaseUrl, setAiBaseUrl] = useState('');
  const [customModelName, setCustomModelName] = useState('');
  const [showAIKey, setShowAIKey] = useState(false);
  const [aiConfigLoading, setAiConfigLoading] = useState(false);

  // 当前打开菜单的视频
  const menuVideo = useMemo(() => {
    if (!openMenuId) return null;
    return videos.find(v => v.id === openMenuId) || null;
  }, [openMenuId, videos]);

  // 按平台筛选的 uploaders
  const filteredUploaders = useMemo(() => {
    let result = uploaders.filter(u => (u.platform || 'bilibili') === uploaderPlatform);
    if (uploaderSearch.trim()) {
      const term = uploaderSearch.toLowerCase();
      result = result.filter(u => u.name.toLowerCase().includes(term));
    }
    return result;
  }, [uploaders, uploaderPlatform, uploaderSearch]);

  // 按平台筛选的 videos
  const filteredVideos = useMemo(() => {
    let result = videos.filter(v => (v.platform || 'bilibili') === videoPlatform);
    if (videoSearch.trim()) {
      const term = videoSearch.toLowerCase();
      result = result.filter(v => 
        v.title.toLowerCase().includes(term) || 
        v.uploader?.name?.toLowerCase().includes(term)
      );
    }
    return result;
  }, [videos, videoPlatform, videoSearch]);

  // 平台统计
  const platformStats = useMemo(() => ({
    uploaders: {
      bilibili: uploaders.filter(u => (u.platform || 'bilibili') === 'bilibili').length,
      youtube: uploaders.filter(u => u.platform === 'youtube').length,
    },
    videos: {
      bilibili: videos.filter(v => (v.platform || 'bilibili') === 'bilibili').length,
      youtube: videos.filter(v => v.platform === 'youtube').length,
    }
  }), [uploaders, videos]);

  // 用户信息
  const [user, setUser] = useState<User | null>(null);
  const [cookie, setCookie] = useState('');
  const [savingCookie, setSavingCookie] = useState(false);
  const [cookieMessage, setCookieMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // YouTube API Key
  const [youtubeApiKey, setYoutubeApiKey] = useState('');
  const [savingYoutubeKey, setSavingYoutubeKey] = useState(false);
  const [youtubeKeyMessage, setYoutubeKeyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 获取数据
  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // 获取当前用户
      const currentUser = await getCurrentUser();
      setUser(currentUser);
      setCookie(currentUser?.bilibili_cookie || '');
      setYoutubeApiKey(currentUser?.youtube_api_key || '');

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

      // 获取视频列表
      const { data: videoData, count } = await supabase
        .from('video')
        .select('id, bvid, title, pic, duration, pubdate, mid', { count: 'exact' })
        .eq('user_id', currentUser.id)
        .order('pubdate', { ascending: false })
        .limit(100);

      // 获取相关的 uploader 信息
      let processedVideos = videoData || [];
      if (videoData && videoData.length > 0) {
        const mids = [...new Set(videoData.map((v: any) => v.mid).filter(Boolean))];
        if (mids.length > 0 && uploaderData) {
          const uploaderMap = new Map(uploaderData.map((u: any) => [u.mid, u]));
          processedVideos = videoData.map((v: any) => ({
            ...v,
            uploader: uploaderMap.get(v.mid) || null
          }));
        } else {
          processedVideos = videoData.map((v: any) => ({ ...v, uploader: null }));
        }
      }
      setVideos(processedVideos as unknown as VideoItem[]);
      setVideoCount(count || 0);
    } catch (err) {
      console.error('获取数据失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 加载 API 池
  const loadApiPool = useCallback(async () => {
    try {
      setApiPoolLoading(true);
      await transcribeService.initializeApiPool();
      const keys = transcribeService.getAllApiKeys();
      setApiPoolKeys(keys);
    } catch (err) {
      console.error('加载 API 池失败:', err);
    } finally {
      setApiPoolLoading(false);
    }
  }, []);

  // 从数据库加载 AI 模型配置
  const loadAIConfig = useCallback(async () => {
    setAiConfigLoading(true);
    try {
      // 先从 localStorage 加载（作为默认值）
      const localModelId = localStorage.getItem('ai_model') || 'deepseek-chat';
      setSelectedAIModel(localModelId);
      setAiModelKey(getModelApiKey(localModelId));
      setAiBaseUrl(localStorage.getItem('ai_base_url') || '');
      setCustomModelName(localStorage.getItem('ai_custom_model') || '');

      // 然后从数据库加载（覆盖本地值）
      const userId = getStoredUserId();
      if (isSupabaseConfigured && userId) {
        const configs = await getAIConfigs(userId);
        if (configs && configs.length > 0) {
          // 找到当前选中模型的配置
          const currentConfig = configs.find(c => c.model_id === localModelId);
          if (currentConfig) {
            setAiModelKey(currentConfig.api_key);
            setModelApiKey(localModelId, currentConfig.api_key); // 同步到 localStorage
          }

          // 同步所有配置到 localStorage
          configs.forEach(config => {
            if (config.model_id !== 'groq-whisper') {
              setModelApiKey(config.model_id, config.api_key);
              if (config.model_id === 'custom') {
                if (config.base_url) {
                  setAiBaseUrl(config.base_url);
                  localStorage.setItem('ai_base_url', config.base_url);
                }
                if (config.custom_model_name) {
                  setCustomModelName(config.custom_model_name);
                  localStorage.setItem('ai_custom_model', config.custom_model_name);
                }
              }
            }
          });
        }
      }
    } catch (err) {
      console.error('加载 AI 配置失败:', err);
    } finally {
      setAiConfigLoading(false);
    }
  }, []);

  // 打开设置时加载数据
  useEffect(() => {
    if (isOpen) {
      fetchData();
      loadApiPool();
      loadAIConfig();
      setCookieMessage(null);
      setYoutubeKeyMessage(null);
    }
  }, [isOpen, fetchData, loadApiPool, loadAIConfig]);

  // 添加 API Key
  const handleAddApiKey = async () => {
    if (!newApiKey.trim()) {
      alert('请输入 API Key');
      return;
    }
    if (!newApiName.trim()) {
      alert('请输入 API Key 名称');
      return;
    }

    try {
      await transcribeService.addApiKey(newApiKey.trim(), newApiName.trim(), newApiModel);
      setNewApiKey('');
      setNewApiName('');
      setNewApiModel('whisper-large-v3-turbo');
      await loadApiPool();
    } catch (err) {
      alert('添加 API Key 失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 删除 API Key
  const handleRemoveApiKey = async (id: string) => {
    if (confirm('确定要删除这个 API Key 吗？')) {
      try {
        await transcribeService.removeApiKey(id);
        await loadApiPool();
      } catch (err) {
        alert('删除 API Key 失败: ' + (err instanceof Error ? err.message : '未知错误'));
      }
    }
  };

  // 切换 API Key 状态
  const handleToggleApiKey = async (id: string) => {
    try {
      await transcribeService.toggleApiKeyActive(id);
      await loadApiPool();
    } catch (err) {
      alert('切换 API Key 状态失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 保存 API 配置（AI 模型 + Groq）
  const handleSaveAPIConfig = async () => {
    try {
      // 1. 保存到 localStorage
      localStorage.setItem('ai_model', selectedAIModel);
      setModelApiKey(selectedAIModel, aiModelKey);
      localStorage.setItem('ai_base_url', aiBaseUrl);
      localStorage.setItem('ai_custom_model', customModelName);

      // 2. 保存到数据库
      const userId = getStoredUserId();
      if (isSupabaseConfigured && userId) {
        await upsertAIConfig(userId, {
          model_id: selectedAIModel,
          api_key: aiModelKey,
          base_url: selectedAIModel === 'custom' ? aiBaseUrl : undefined,
          custom_model_name: selectedAIModel === 'custom' ? customModelName : undefined,
        });
      }

      // 3. 触发全局存储事件
      window.dispatchEvent(new Event('storage'));
      
      alert('API 配置已保存' + (isSupabaseConfigured ? '并同步至云端' : ''));
    } catch (err) {
      console.error('保存 API 配置失败:', err);
      alert('保存失败: ' + (err instanceof Error ? err.message : '未知错误'));
    }
  };

  // 验证 Cookie 格式
  const validateCookieFormat = (cookieStr: string): { valid: boolean; message: string } => {
    const trimmed = cookieStr.trim();
    
    // 检查是否为空
    if (!trimmed) {
      return { valid: false, message: '请输入Cookie' };
    }
    
    // 检查是否包含关键字段
    const hasSessionData = /SESSDATA\s*=/.test(trimmed);
    const hasBiliJct = /bili_jct\s*=/.test(trimmed);
    const hasDedeUserID = /DedeUserID\s*=/.test(trimmed);
    
    if (!hasSessionData) {
      return { valid: false, message: 'Cookie 缺少 SESSDATA 字段，请复制完整的 Cookie' };
    }
    
    // 警告但允许保存
    if (!hasBiliJct || !hasDedeUserID) {
      return { valid: true, message: '⚠️ Cookie 可能不完整，建议包含 SESSDATA、bili_jct、DedeUserID' };
    }
    
    return { valid: true, message: '' };
  };

  // 保存Cookie
  const handleSaveCookie = async () => {
    const validation = validateCookieFormat(cookie);
    
    if (!validation.valid) {
      setCookieMessage({ type: 'error', text: validation.message });
      return;
    }

    setSavingCookie(true);
    setCookieMessage(null);

    const result = await updateBilibiliCookie(cookie.trim());

    if (result.success) {
      clearCookieCache();
      // 更新本地 user 状态，确保后续请求使用新 Cookie
      setUser(prev => prev ? { ...prev, bilibili_cookie: cookie.trim() } : prev);
      
      if (validation.message) {
        // 有警告信息
        setCookieMessage({ type: 'success', text: `Cookie 已保存。${validation.message}` });
      } else {
        setCookieMessage({ type: 'success', text: 'Cookie 保存成功！' });
      }
    } else {
      setCookieMessage({ type: 'error', text: result.error || '保存失败' });
    }

    setSavingCookie(false);
  };

  // 保存 YouTube API Key
  const handleSaveYoutubeKey = async () => {
    const trimmedKey = youtubeApiKey.trim();
    
    // 简单验证格式
    if (trimmedKey && !trimmedKey.startsWith('AIza')) {
      setYoutubeKeyMessage({ type: 'error', text: 'API Key 格式不正确，应以 AIza 开头' });
      return;
    }

    setSavingYoutubeKey(true);
    setYoutubeKeyMessage(null);

    const result = await updateYouTubeApiKey(trimmedKey);

    if (result.success) {
      clearYouTubeApiKeyCache();
      setUser(prev => prev ? { ...prev, youtube_api_key: trimmedKey } : prev);
      setYoutubeKeyMessage({ type: 'success', text: trimmedKey ? 'API Key 保存成功！' : 'API Key 已清除' });
    } else {
      setYoutubeKeyMessage({ type: 'error', text: result.error || '保存失败' });
    }

    setSavingYoutubeKey(false);
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

      // 使缓存失效，确保同步按钮列表更新
      if (user?.id) {
        invalidateCache(CACHE_KEYS.UPLOADERS(user.id));
      }
    } catch (err) {
      alert('删除失败');
    } finally {
      setDeleting(null);
    }
  };

  // 动态接口偏移量（用于分页）
  const [dynamicOffset, setDynamicOffset] = useState<string>('');

  // 解析动态接口数据
  const parseDynamicItems = (items: any[]): UploaderVideo[] => {
    const videos: UploaderVideo[] = [];
    for (const item of items) {
      if (item.type === 'DYNAMIC_TYPE_AV' && item.modules?.module_dynamic?.major?.archive) {
        const archive = item.modules.module_dynamic.major.archive;
        const durationParts = (archive.duration_text || '0:00').split(':').map(Number);
        const duration = durationParts.length === 3
          ? durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2]
          : durationParts[0] * 60 + (durationParts[1] || 0);

        videos.push({
          bvid: archive.bvid,
          title: archive.title,
          pic: archive.cover,
          duration,
          pubdate: item.modules?.module_author?.pub_ts || Math.floor(Date.now() / 1000),
          play: parseInt(archive.stat?.play || '0'),
          comment: 0,
          description: archive.desc || '',
        });
      }
    }
    return videos;
  };

  // 获取UP主视频列表 - 优先使用动态接口（限流更宽松）
  const fetchUploaderVideos = useCallback(async (mid: number, page: number, keyword?: string) => {
    setUploaderVideosLoading(true);
    try {
      const isProduction = window.location.hostname !== 'localhost';
      const userCookie = user?.bilibili_cookie || '';
      
      const headers: Record<string, string> = {};
      if (userCookie && isProduction) {
        headers['X-Bilibili-Cookie'] = userCookie;
      }

      // 如果有搜索关键词，必须用 arc/search 接口
      if (keyword) {
        const params = new URLSearchParams({
          mid: mid.toString(),
          ps: '30',
          pn: page.toString(),
          order: 'pubdate',
          tid: '0',
          keyword,
        });

        const apiUrl = isProduction
          ? `/api/bilibili?path=/x/space/arc/search&${params.toString()}`
          : `/bili-api/x/space/arc/search?${params.toString()}`;

        const res = await fetch(apiUrl, { headers });
        const data = await res.json();

        if (data.code === 0 && data.data?.list?.vlist) {
          const vlist = data.data.list.vlist as UploaderVideo[];
          if (page === 1) {
            setUploaderVideos(vlist);
          } else {
            setUploaderVideos(prev => [...prev, ...vlist]);
          }
          setUploaderVideosHasMore(vlist.length === 30);
          setUploaderVideosPage(page);
          setUsingFallbackApi(false);
          return;
        }

        // 搜索接口失败
        if (data.code === -799) {
          setToast('请求过于频繁，请等待几秒后重试');
          setTimeout(() => setToast(null), 3000);
        } else {
          setToast(`搜索失败: ${data.message || '未知错误'}`);
          setTimeout(() => setToast(null), 3000);
        }
        return;
      }

      // 无搜索关键词 - 使用动态接口（支持分页，限流更宽松）
      const params = new URLSearchParams({ host_mid: mid.toString() });
      if (page > 1 && dynamicOffset) {
        params.set('offset', dynamicOffset);
      }

      const dynamicUrl = isProduction
        ? `/api/bilibili?path=/x/polymer/web-dynamic/v1/feed/space&${params.toString()}`
        : `/bili-api/x/polymer/web-dynamic/v1/feed/space?${params.toString()}`;

      const res = await fetch(dynamicUrl, { headers });
      const data = await res.json();

      if (data.code === 0 && data.data?.items) {
        const videos = parseDynamicItems(data.data.items);
        
        if (page === 1) {
          setUploaderVideos(videos);
        } else {
          setUploaderVideos(prev => [...prev, ...videos]);
        }
        
        // 保存偏移量用于下一页
        setDynamicOffset(data.data.offset || '');
        setUploaderVideosHasMore(data.data.has_more === true && videos.length > 0);
        setUploaderVideosPage(page);
        setUsingFallbackApi(true);
        return;
      }

      // 动态接口也失败了，显示错误
      if (data.code === -799) {
        setToast('请求过于频繁，请等待 10 秒后重试');
        setTimeout(() => setToast(null), 3000);
      } else {
        console.error('获取UP主视频失败:', data);
        setToast(`获取失败: ${data.message || '未知错误'}`);
        setTimeout(() => setToast(null), 3000);
      }
      
      if (page === 1) setUploaderVideos([]);
      setUploaderVideosHasMore(false);
    } catch (err) {
      console.error('获取UP主视频失败:', err);
      if (page === 1) setUploaderVideos([]);
      setToast('网络错误，请重试');
      setTimeout(() => setToast(null), 3000);
    } finally {
      setUploaderVideosLoading(false);
    }
  }, [user?.bilibili_cookie, dynamicOffset]);

  // 打开UP主视频浏览弹窗
  const handleBrowseUploaderVideos = (uploader: Uploader) => {
    setBrowseUploader(uploader);
    setUploaderVideos([]);
    setUploaderVideosPage(1);
    setUploaderVideosSearch('');
    setAddedVideos(new Set());
    setUsingFallbackApi(false);
    setDynamicOffset(''); // 重置分页偏移量
    fetchUploaderVideos(uploader.mid, 1);
  };

  // 搜索UP主视频
  const handleSearchUploaderVideos = () => {
    if (!browseUploader) return;
    setUploaderVideosPage(1);
    fetchUploaderVideos(browseUploader.mid, 1, uploaderVideosSearch);
  };

  // 加载更多UP主视频
  const handleLoadMoreUploaderVideos = () => {
    if (!browseUploader || uploaderVideosLoading || !uploaderVideosHasMore) return;
    fetchUploaderVideos(browseUploader.mid, uploaderVideosPage + 1, uploaderVideosSearch);
  };

  // 获取视频访问限制信息
  const fetchVideoAccessRestriction = async (bvid: string): Promise<string | null> => {
    try {
      const isProduction = window.location.hostname !== 'localhost';
      const userCookie = user?.bilibili_cookie || '';
      
      const headers: Record<string, string> = {};
      if (userCookie && isProduction) {
        headers['X-Bilibili-Cookie'] = userCookie;
      }

      const url = isProduction
        ? `/api/bilibili?path=/x/web-interface/view&bvid=${bvid}`
        : `/bili-api/x/web-interface/view?bvid=${bvid}`;

      const res = await fetch(url, { headers });
      const data = await res.json();

      if (data.code !== 0) {
        return null;
      }

      const videoData = data.data;
      const rights = videoData?.rights;
      
      // 检查充电专属（顶层字段）
      if (videoData?.is_upower_exclusive === true) {
        return 'charging';
      }
      
      // 检查付费相关（rights字段）
      if (rights) {
        if (rights.arc_pay === 1) return 'arc_pay';
        if (rights.ugc_pay === 1) return 'ugc_pay';
        if (rights.pay === 1) return 'pay';
      }

      return null;
    } catch {
      return null;
    }
  };

  // 添加视频到收藏夹
  const handleAddToCollection = async (video: UploaderVideo) => {
    if (!user?.id || addingVideos.has(video.bvid)) return;

    setAddingVideos(prev => new Set(prev).add(video.bvid));
    try {
      // 处理封面URL
      let picUrl = video.pic;
      if (picUrl.startsWith('//')) picUrl = `https:${picUrl}`;

      // 获取视频访问限制信息
      const accessRestriction = await fetchVideoAccessRestriction(video.bvid);

      const { error } = await supabase
        .from('collected_video')
        .upsert({
          user_id: user.id,
          bvid: video.bvid,
          title: video.title,
          pic: picUrl,
          duration: video.duration,
          pubdate: new Date(video.pubdate * 1000).toISOString(),
          view_count: video.play,
          reply_count: video.comment,
          description: video.description,
          uploader_mid: browseUploader?.mid,
          uploader_name: browseUploader?.name,
          uploader_face: browseUploader?.face,
          access_restriction: accessRestriction,
        }, { onConflict: 'user_id,bvid' });

      if (error) throw error;

      setAddedVideos(prev => new Set(prev).add(video.bvid));
      const restrictionText = accessRestriction ? ` [${accessRestriction === 'charging' ? '充电专属' : '付费'}]` : '';
      setToast(`已添加「${video.title.slice(0, 20)}...」${restrictionText}`);
      setTimeout(() => setToast(null), 2000);
    } catch (err) {
      console.error('添加到收藏夹失败:', err);
      setToast('添加失败，请重试');
      setTimeout(() => setToast(null), 2000);
    } finally {
      setAddingVideos(prev => {
        const newSet = new Set(prev);
        newSet.delete(video.bvid);
        return newSet;
      });
    }
  };

  // 格式化时长
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // 解析时长字符串 "1:23" 或 "1:23:45" -> 秒数
  const parseDurationString = (durationStr: string): number => {
    if (typeof durationStr === 'number') return durationStr;
    const parts = String(durationStr).split(':').map(Number);
    if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    } else if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    }
    return 0;
  };

  // 格式化播放量
  const formatPlayCount = (count: number) => {
    if (count >= 10000) return `${(count / 10000).toFixed(1)}万`;
    return count.toString();
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
        className="w-full max-w-lg bg-cyber-card border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl h-[75vh] flex flex-col overflow-hidden animate-slide-up relative"
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部光晕背景 - 全宽渐变 */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-cyber-lime/20 to-transparent pointer-events-none" />
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
        <div className="flex gap-2 p-2 shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('account')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'account'
              ? 'bg-cyber-lime/20 text-cyber-lime'
              : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
              }`}
          >
            账户
          </button>
          <button
            onClick={() => setActiveTab('uploaders')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'uploaders'
              ? 'bg-cyber-lime/20 text-cyber-lime'
              : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
              }`}
          >
            关注
          </button>
          <button
            onClick={() => setActiveTab('videos')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'videos'
              ? 'bg-cyber-lime/20 text-cyber-lime'
              : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
              }`}
          >
            数据
          </button>
          <button
            onClick={() => setActiveTab('api-pool')}
            className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap ${activeTab === 'api-pool'
              ? 'bg-cyber-lime/20 text-cyber-lime'
              : 'text-gray-500 hover:bg-white/5 hover:text-gray-300'
              }`}
          >
            API 池
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

              {/* YouTube API Key 配置 */}
              <div className="p-4 bg-white/5 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-red-500" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                  </svg>
                  <p className="text-white font-medium">YouTube API Key</p>
                  <span className="text-xs text-gray-500 bg-white/10 px-2 py-0.5 rounded">可选</span>
                </div>
                <p className="text-xs text-gray-500 mb-3">
                  配置后可添加 YouTube 频道并同步视频。
                </p>
                <input
                  type="password"
                  value={youtubeApiKey}
                  onChange={(e) => setYoutubeApiKey(e.target.value)}
                  placeholder="粘贴你的 YouTube API Key..."
                  className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-red-500/50 font-mono"
                />
                {youtubeKeyMessage && (
                  <p className={`mt-2 text-xs ${youtubeKeyMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                    {youtubeKeyMessage.text}
                  </p>
                )}
                <button
                  onClick={handleSaveYoutubeKey}
                  disabled={savingYoutubeKey}
                  className="mt-3 w-full py-2 bg-red-500 text-white text-sm font-medium rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                >
                  {savingYoutubeKey ? '保存中...' : '保存 API Key'}
                </button>
              </div>

              {/* 获取 YouTube API Key 说明 - 折叠 */}
              <details className="p-4 bg-white/5 rounded-xl">
                <summary className="text-sm text-gray-400 cursor-pointer hover:text-white transition-colors">
                  如何获取 YouTube API Key？（点击展开）
                </summary>
                <ol className="text-xs text-gray-500 space-y-1 list-decimal list-inside mt-3">
                  <li>访问 <a href="https://console.cloud.google.com/" target="_blank" rel="noopener" className="text-red-400 hover:underline">Google Cloud Console</a></li>
                  <li>创建新项目或选择已有项目</li>
                  <li>在「API和服务」→「库」中搜索并启用「YouTube Data API v3」</li>
                  <li>在「API和服务」→「凭据」中点击「创建凭据」→「API 密钥」</li>
                  <li>复制生成的密钥（建议限制只能访问 YouTube Data API）</li>
                </ol>
                <p className="text-xs text-gray-500 mt-2">
                  💡 免费配额：每天 10,000 单位，个人使用完全够用
                </p>
              </details>

              <div className="h-px bg-white/5 mx-2 my-2" />



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
            <div className="p-4 space-y-3">
              {/* 平台切换 */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setUploaderPlatform('bilibili'); setUploaderSearch(''); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    uploaderPlatform === 'bilibili'
                      ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                      : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.659.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906L17.813 4.653z"/>
                  </svg>
                  B站 ({platformStats.uploaders.bilibili})
                </button>
                <button
                  onClick={() => { setUploaderPlatform('youtube'); setUploaderSearch(''); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    uploaderPlatform === 'youtube'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/>
                  </svg>
                  YouTube ({platformStats.uploaders.youtube})
                </button>
              </div>

              {/* 搜索框 */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  value={uploaderSearch}
                  onChange={(e) => setUploaderSearch(e.target.value)}
                  placeholder={`搜索${uploaderPlatform === 'bilibili' ? 'UP主' : '频道'}...`}
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50"
                />
                {uploaderSearch && (
                  <button
                    onClick={() => setUploaderSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* 列表 */}
              {filteredUploaders.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">
                  {uploaderSearch ? '没有找到匹配的博主' : `暂无关注的${uploaderPlatform === 'bilibili' ? 'UP主' : 'YouTube频道'}`}
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredUploaders.map(uploader => (
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
                        <div className="flex items-center justify-between gap-2 mt-0.5 whitespace-nowrap overflow-hidden">
                          <span className="text-[10px] text-gray-500 font-mono shrink-0">
                            {uploaderPlatform === 'bilibili' 
                              ? `MID: ${uploader.mid.toString().length > 10 ? `${uploader.mid.toString().slice(0, 10)}...` : uploader.mid}`
                              : uploader.channel_id ? `ID: ${uploader.channel_id.slice(0, 12)}...` : ''
                            }
                          </span>
                          {uploader.last_sync_count !== null && (
                            <span className={`text-[10px] font-medium shrink-0 ${uploaderPlatform === 'bilibili' ? 'text-pink-400' : 'text-red-400'}`}>
                              上次 {uploader.last_sync_count} 个视频
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 操作按钮 */}
                      <div className="flex items-center gap-2">
                        {/* 浏览视频 - 仅B站 */}
                        {uploaderPlatform === 'bilibili' && (
                          <button
                            onClick={() => handleBrowseUploaderVideos(uploader)}
                            className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center hover:bg-pink-500/20 transition-colors"
                            title="浏览视频"
                          >
                            <svg className="w-4 h-4 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <rect x="2" y="4" width="20" height="16" rx="2" />
                              <path d="M10 9l5 3-5 3V9z" />
                            </svg>
                          </button>
                        )}

                        {/* 跳转主页 */}
                        <button
                          onClick={() => {
                            if (uploaderPlatform === 'bilibili') {
                              window.open(`https://space.bilibili.com/${uploader.mid}`, '_blank');
                            } else if (uploader.channel_id) {
                              window.open(`https://www.youtube.com/channel/${uploader.channel_id}`, '_blank');
                            }
                          }}
                          className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
                          title={uploaderPlatform === 'bilibili' ? '查看B站主页' : '查看YouTube频道'}
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
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'videos' ? (
            /* 视频管理 - 视频列表 */
            <div className="p-4 space-y-3">
              {/* 平台切换 */}
              <div className="flex gap-2">
                <button
                  onClick={() => { setVideoPlatform('bilibili'); setVideoSearch(''); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    videoPlatform === 'bilibili'
                      ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                      : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.659.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906L17.813 4.653z"/>
                  </svg>
                  B站 ({platformStats.videos.bilibili})
                </button>
                <button
                  onClick={() => { setVideoPlatform('youtube'); setVideoSearch(''); }}
                  className={`flex-1 py-2 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${
                    videoPlatform === 'youtube'
                      ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                      : 'bg-white/5 text-gray-400 border border-transparent hover:bg-white/10'
                  }`}
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/>
                  </svg>
                  YouTube ({platformStats.videos.youtube})
                </button>
              </div>

              {/* 搜索框 */}
              <div className="relative">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  type="text"
                  value={videoSearch}
                  onChange={(e) => setVideoSearch(e.target.value)}
                  placeholder="搜索视频标题或UP主..."
                  className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/10 rounded-xl text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50"
                />
                {videoSearch && (
                  <button
                    onClick={() => setVideoSearch('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 hover:text-white"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>

              {/* 标题 */}
              <div className="flex items-center justify-between">
                <p className="text-sm text-gray-400">
                  共 {filteredVideos.length} 个视频
                  {videoSearch && ` (搜索结果)`}
                </p>
              </div>

              {/* 视频列表 */}
              {filteredVideos.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M10 9l5 3-5 3V9z" />
                  </svg>
                  <p>{videoSearch ? '没有找到匹配的视频' : `暂无${videoPlatform === 'bilibili' ? 'B站' : 'YouTube'}视频`}</p>
                  <p className="text-xs mt-1">同步博主后视频会出现在这里</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {filteredVideos.map(video => (
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
                            referrerPolicy="no-referrer"
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
                        <div className="flex items-center justify-between gap-2 mt-1 min-w-0">
                          {video.uploader && (
                            <span className={`text-xs truncate shrink mr-auto ${videoPlatform === 'bilibili' ? 'text-pink-400' : 'text-red-400'}`}>
                              {video.uploader.name}
                            </span>
                          )}
                          <div className="flex items-center gap-2 shrink-0 text-xs text-gray-500 font-mono whitespace-nowrap">
                            <span>{Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, '0')}</span>
                            <span className="text-gray-600">•</span>
                            <span>{new Date(video.pubdate).toLocaleDateString()}</span>
                          </div>
                        </div>
                      </div>

                      {/* 三个点按钮 */}
                      <button
                        onClick={(e) => { e.stopPropagation(); setOpenMenuId(openMenuId === video.id ? null : video.id); }}
                        className={`p-2 rounded-lg transition-all flex-shrink-0 ${openMenuId === video.id ? 'bg-white/20' : 'opacity-60 hover:opacity-100 hover:bg-white/10'
                          }`}
                      >
                        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="5" cy="12" r="2" />
                          <circle cx="12" cy="12" r="2" />
                          <circle cx="19" cy="12" r="2" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 提示 */}
              {filteredVideos.length > 0 && videoCount > 100 && (
                <p className="text-xs text-gray-500 text-center pt-2">
                  仅显示最近 100 个视频
                </p>
              )}
            </div>
          ) : activeTab === 'api-pool' ? (
            /* API 池配置 */
            <div className="p-4 space-y-4 overflow-y-auto">
              {/* AI 模型配置 */}
              <div className="p-4 bg-white/5 rounded-xl space-y-4">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 0 1 9-9" />
                  </svg>
                  <p className="text-white font-medium">AI 助手服务模型</p>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  配置用于文本优化的 AI 模型
                </p>

                <div className="grid grid-cols-1 gap-4">
                  <div className="space-y-2">
                    <span className="text-xs text-gray-400 ml-1">选择模型</span>
                    <select
                      value={selectedAIModel}
                      onChange={(e) => {
                        const modelId = e.target.value;
                        setSelectedAIModel(modelId);
                        // 切换模型时加载对应的 API Key
                        setAiModelKey(getModelApiKey(modelId));
                        localStorage.setItem('ai_model', modelId);
                      }}
                      className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white appearance-none focus:outline-none focus:border-emerald-500/50"
                    >
                      {AI_MODELS.map(m => (
                        <option key={m.id} value={m.id}>{m.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <span className="text-xs text-gray-400 ml-1">API Key</span>
                    <div className="relative">
                      <input
                        type={showAIKey ? 'text' : 'password'}
                        value={aiModelKey}
                        onChange={(e) => setAiModelKey(e.target.value)}
                        placeholder={`输入 ${AI_MODELS.find(m => m.id === selectedAIModel)?.name} 的 Key...`}
                        className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50 font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowAIKey(!showAIKey)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-500 hover:text-white transition-colors"
                      >
                        {showAIKey ? (
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                            <line x1="1" y1="1" x2="23" y2="23" />
                          </svg>
                        ) : (
                          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>

                  {selectedAIModel === 'custom' && (
                    <>
                      <div className="space-y-2">
                        <span className="text-xs text-gray-400 ml-1">Base URL</span>
                        <input
                          type="text"
                          value={aiBaseUrl}
                          onChange={(e) => setAiBaseUrl(e.target.value)}
                          placeholder="https://api.openai.com/v1"
                          className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                      <div className="space-y-2">
                        <span className="text-xs text-gray-400 ml-1">模型名称</span>
                        <input
                          type="text"
                          value={customModelName}
                          onChange={(e) => setCustomModelName(e.target.value)}
                          placeholder="gpt-4-turbo"
                          className="w-full px-4 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-emerald-500/50"
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="h-px bg-white/5" />

              {/* Groq API 池配置 */}
              <div className="p-4 bg-white/5 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <svg className="w-5 h-5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="1" />
                    <path d="M12 1v6m0 6v6M4.22 4.22l4.24 4.24m5.08 5.08l4.24 4.24M1 12h6m6 0h6M4.22 19.78l4.24-4.24m5.08-5.08l4.24-4.24" />
                  </svg>
                  <p className="text-white font-medium">Groq API 池</p>
                </div>
                <p className="text-xs text-gray-500 mb-4">
                  配置多个 Groq API Key，系统会自动负载均衡分配转写任务。
                </p>

                {/* 添加新 API Key */}
                <div className="space-y-3 mb-4">
                  <input
                    type="text"
                    value={newApiName}
                    onChange={(e) => setNewApiName(e.target.value)}
                    placeholder="API Key 名称（如：API Key 1）"
                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50"
                  />
                  <select
                    value={newApiModel}
                    onChange={(e) => setNewApiModel(e.target.value)}
                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white appearance-none focus:outline-none focus:border-violet-500/50"
                  >
                    <option value="whisper-large-v3-turbo">Whisper Large V3 Turbo (快速)</option>
                    <option value="whisper-large-v3">Whisper Large V3 (精准)</option>
                  </select>
                  <input
                    type="password"
                    value={newApiKey}
                    onChange={(e) => setNewApiKey(e.target.value)}
                    placeholder="gsk_..."
                    className="w-full px-3 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-violet-500/50 font-mono"
                  />
                  <button
                    onClick={handleAddApiKey}
                    className="w-full py-2 bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 text-sm font-medium rounded-lg transition-all"
                  >
                    添加 API Key
                  </button>
                </div>

                {/* API Key 列表 */}
                {apiPoolLoading ? (
                  <div className="text-center py-4 text-gray-500">
                    <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin mx-auto" />
                  </div>
                ) : apiPoolKeys.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 text-sm">
                    还没有配置 API Key
                  </div>
                ) : (
                  <div className="space-y-2">
                    {apiPoolKeys.map((apiKey) => (
                      <div
                        key={apiKey.id}
                        className="flex items-center justify-between p-3 bg-black/40 rounded-lg border border-white/10"
                      >
                        <div className="flex-1">
                          <p className="text-white font-medium text-sm">{apiKey.name}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            请求: {apiKey.requestCount} | 总计: {apiKey.totalRequests}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleToggleApiKey(apiKey.id)}
                            className={`px-3 py-1 rounded text-xs font-medium transition-all ${
                              apiKey.isActive
                                ? 'bg-green-500/20 text-green-400'
                                : 'bg-red-500/20 text-red-400'
                            }`}
                          >
                            {apiKey.isActive ? '启用' : '禁用'}
                          </button>
                          <button
                            onClick={() => handleRemoveApiKey(apiKey.id)}
                            className="px-3 py-1 rounded text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-all"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 保存按钮 */}
              <button
                onClick={handleSaveAPIConfig}
                className="w-full py-2.5 bg-gradient-to-r from-cyber-lime to-emerald-400 text-black text-sm font-bold rounded-xl hover:from-lime-400 hover:to-emerald-500 transition-all shadow-lg shadow-cyber-lime/10 active:scale-[0.98]"
              >
                保存 API 配置
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {/* UP主视频浏览弹窗 */}
      {browseUploader && createPortal(
        <div className="fixed inset-0 z-[99999] flex items-end sm:items-center justify-center" onClick={() => setBrowseUploader(null)}>
          <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-2xl bg-cyber-card border border-white/10 rounded-t-3xl sm:rounded-2xl shadow-2xl h-[85vh] flex flex-col overflow-hidden"
            onClick={e => e.stopPropagation()}
            style={{ animation: 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)' }}
          >
            {/* 头部 */}
            <div className="px-4 py-3 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-3">
                <img
                  src={browseUploader.face || 'https://i0.hdslb.com/bfs/face/member/noface.jpg'}
                  alt={browseUploader.name}
                  className="w-10 h-10 rounded-full"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <h3 className="text-white font-bold truncate">{browseUploader.name}</h3>
                  <p className="text-xs text-gray-500">浏览视频并添加到收藏夹</p>
                </div>
                <button
                  onClick={() => setBrowseUploader(null)}
                  className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors"
                >
                  <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 搜索框 */}
              <div className="flex gap-2 mt-3">
                <div className="flex-1 relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    value={uploaderVideosSearch}
                    onChange={(e) => setUploaderVideosSearch(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearchUploaderVideos()}
                    placeholder="搜索该UP主的视频..."
                    className="w-full pl-10 pr-4 py-2 bg-black/30 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50"
                  />
                </div>
                <button
                  onClick={handleSearchUploaderVideos}
                  className="px-4 py-2 bg-cyber-lime text-black text-sm font-medium rounded-lg hover:bg-lime-400 transition-colors"
                >
                  搜索
                </button>
              </div>
            </div>

            {/* 视频列表 */}
            <div className="flex-1 overflow-y-auto p-4">
              {uploaderVideosLoading && uploaderVideos.length === 0 ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-8 h-8 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin" />
                </div>
              ) : uploaderVideos.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <svg className="w-12 h-12 mx-auto mb-3 opacity-30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="M10 9l5 3-5 3V9z" />
                  </svg>
                  <p>暂无视频</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {uploaderVideos.map(video => (
                    <div
                      key={video.bvid}
                      className="flex gap-3 p-2 bg-white/5 rounded-xl hover:bg-white/10 transition-colors"
                    >
                      {/* 封面 */}
                      <div className="w-32 h-20 rounded-lg overflow-hidden bg-black/30 flex-shrink-0 relative">
                        <img
                          src={video.pic.startsWith('//') ? `https:${video.pic}` : video.pic}
                          alt={video.title}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                        <span className="absolute bottom-1 right-1 px-1.5 py-0.5 bg-black/70 rounded text-[10px] text-white">
                          {formatDuration(video.duration)}
                        </span>
                      </div>

                      {/* 信息 */}
                      <div className="flex-1 min-w-0 flex flex-col">
                        <h4 className="text-sm text-white line-clamp-2 leading-snug">{video.title}</h4>
                        <div className="flex items-center gap-3 mt-auto text-xs text-gray-500">
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                            {formatPlayCount(video.play)}
                          </span>
                          <span>{new Date(video.pubdate * 1000).toLocaleDateString()}</span>
                        </div>
                      </div>

                      {/* 添加按钮 */}
                      <button
                        onClick={() => handleAddToCollection(video)}
                        disabled={addingVideos.has(video.bvid) || addedVideos.has(video.bvid)}
                        className={`self-center px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex-shrink-0 ${
                          addedVideos.has(video.bvid)
                            ? 'bg-green-500/20 text-green-400'
                            : 'bg-cyber-lime/20 text-cyber-lime hover:bg-cyber-lime/30'
                        } disabled:opacity-50`}
                      >
                        {addingVideos.has(video.bvid) ? (
                          <div className="w-4 h-4 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin" />
                        ) : addedVideos.has(video.bvid) ? (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M5 12l5 5L20 7" />
                            </svg>
                            已添加
                          </span>
                        ) : (
                          <span className="flex items-center gap-1">
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 5v14M5 12h14" />
                            </svg>
                            收藏
                          </span>
                        )}
                      </button>
                    </div>
                  ))}

                  {/* 加载更多 */}
                  {uploaderVideosHasMore && (
                    <button
                      onClick={handleLoadMoreUploaderVideos}
                      disabled={uploaderVideosLoading}
                      className="w-full py-3 bg-white/5 rounded-xl text-gray-400 text-sm hover:bg-white/10 transition-colors disabled:opacity-50"
                    >
                      {uploaderVideosLoading ? (
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-4 h-4 border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                          加载中...
                        </div>
                      ) : (
                        '加载更多'
                      )}
                    </button>
                  )}

                  {/* 备用接口提示已移除，动态接口现在是主接口 */}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast 提示 */}
      {toast && createPortal(
        <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[999999] px-4 py-2 bg-black/90 border border-white/10 rounded-full text-white text-sm shadow-xl animate-fade-in">
          {toast}
        </div>,
        document.body
      )}

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
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center ${watchLaterIds?.has(menuVideo.bvid) ? 'bg-red-500/15' : 'bg-white/10'
                      }`}>
                      {watchLaterIds?.has(menuVideo.bvid) ? (
                        <svg className="w-5 h-5 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="12" cy="12" r="10" />
                          <line x1="15" y1="9" x2="9" y2="15" />
                          <line x1="9" y1="9" x2="15" y2="15" />
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
                    window.open(`https://www.bilibili.com/video/${menuVideo.bvid}`, '_blank');
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
        .animate-fade-in {
          animation: fadeIn 0.2s ease-out;
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
