import React, { useState, useEffect, useMemo, useCallback, useSyncExternalStore, Suspense, lazy } from 'react';
import { createPortal, flushSync } from 'react-dom';
import { Tab, FilterType, DateFilter } from './types';
import VideoCard from './components/video/VideoCard';
import { HomeIcon, ClockIcon, SearchIcon, CalendarIcon, SlidersIcon, SettingsIcon, RssIcon, PlusIcon } from './components/shared/Icons';
import CustomDatePicker from './components/layout/CustomDatePicker';
import DateFilterPicker from './components/layout/DateFilterPicker';
import SyncButton from './components/layout/SyncButton';
import Loader, { SimpleLoader } from './components/shared/Loader';
import SplashScreen from './components/layout/SplashScreen';
import PullToRefresh from './components/layout/PullToRefresh';
import LogoSvg from './assets/logo.svg';
import { supabase, isSupabaseConfigured, addToWatchlist, removeFromWatchlistByBvid, getAIConfigs } from './lib/supabase';
import { getStoredUserId, getCurrentUser, logout, type User } from './lib/auth';
import { clearCookieCache } from './lib/bilibili';
import type { VideoWithUploader, WatchlistItem } from './lib/database.types';
import { insightService } from './lib/insight-service';
import { setModelApiKey } from './lib/ai-models';

// 按需加载重量级组件/页面，减小首屏包体积
const AISummaryModal = lazy(() => import('./components/video/AISummaryModal'));
const AddUploaderModal = lazy(() => import('./components/video/AddUploaderModal'));
const TodoList = lazy(() => import('./components/tools/TodoList'));
const RssFeed = lazy(() => import('./components/tools/RssFeed'));
const SettingsPage = lazy(() => import('./components/settings/SettingsPage'));
const HotCarousel = lazy(() => import('./components/video/HotCarousel'));
const SettingsModal = lazy(() => import('./components/settings/SettingsModal'));
const AuthPage = lazy(() => import('./components/pages/AuthPage'));
const VideoTimeline = lazy(() => import('./components/video/VideoTimeline'));
const PWAInstallPrompt = lazy(() => import('./components/layout/PWAInstallPrompt'));
const HighPriorityTodoReminder = lazy(() => import('./components/tools/HighPriorityTodoReminder'));
const NotesPage = lazy(() => import('./components/pages/NotesPage'));
const LearningLog = lazy(() => import('./components/pages/LearningLog'));
const ResourceCenter = lazy(() => import('./components/pages/ResourceCenter'));
const VideoAnalyzer = lazy(() => import('./components/tools/VideoAnalyzer'));
const InsightFloatingBall = lazy(() => import('./components/shared/InsightFloatingBall'));
const RecycleBin = lazy(() => import('./components/pages/RecycleBin'));
const DailyWorkflow = lazy(() => import('./components/pages/DailyWorkflow'));
const WorkflowPromptModal = lazy(() => import('./components/layout/WorkflowPromptModal'));
const App = () => {
  // 全局策展状态
  const insightLoading = useSyncExternalStore(
    insightService.subscribe.bind(insightService),
    () => insightService.isLoading
  );
  const [insightDone, setInsightDone] = useState(false);

  // 监听策展完成
  useEffect(() => {
    const handleStatus = (e: CustomEvent<{ status: string }>) => {
      if (e.detail.status === 'done') {
        setInsightDone(true);
        setTimeout(() => setInsightDone(false), 3000);
      }
    };
    window.addEventListener('insight-status', handleStatus as EventListener);
    return () => window.removeEventListener('insight-status', handleStatus as EventListener);
  }, []);

  // 认证状态 - null=检查中, true=已登录, false=游客模式
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authExpired, setAuthExpired] = useState(false); // 认证过期标记
  const [networkError, setNetworkError] = useState<string | null>(null); // 网络错误

  const [activeTab, setActiveTab] = useState<Tab>('home');
  const [watchLaterIds, setWatchLaterIds] = useState<Set<string>>(new Set());
  const [watchlistLoading, setWatchlistLoading] = useState(false);
  const [activeFilter, setActiveFilter] = useState<FilterType>('all'); // 默认全部
  const [customDateFilter, setCustomDateFilter] = useState<DateFilter>({});
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isAddUploaderOpen, setIsAddUploaderOpen] = useState(false);
  const [isTodoOpen, setIsTodoOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [settingsInitialView, setSettingsInitialView] = useState<'main' | 'todo' | 'reminder' | 'collector' | 'downloader' | 'transcriber' | 'insights' | 'devcommunity'>('main');
  const [searchTerm, setSearchTerm] = useState('');
  const [isNotesOpen, setIsNotesOpen] = useState(false);
  const [isAppsModalOpen, setIsAppsModalOpen] = useState(false);
  const [isLearningLogOpen, setIsLearningLogOpen] = useState(false);
  const [learningLogInitialData, setLearningLogInitialData] = useState<{ url: string; title: string; cover: string }>({ url: '', title: '', cover: '' });
  const [isResourceCenterOpen, setIsResourceCenterOpen] = useState(false);
  const [isVideoAnalyzerOpen, setIsVideoAnalyzerOpen] = useState(false);
  const [isRecycleBinOpen, setIsRecycleBinOpen] = useState(false);
  const [recycleBinCount, setRecycleBinCount] = useState(0);
  const [deleteConfirmVideo, setDeleteConfirmVideo] = useState<{ bvid: string; title: string; url: string } | null>(null);

  // 工作流状态
  const [isDailyWorkflowOpen, setIsDailyWorkflowOpen] = useState(false);
  const [showWorkflowPrompt, setShowWorkflowPrompt] = useState(false);
  const [workflowPromptShownToday, setWorkflowPromptShownToday] = useState(false);

  // AI总结弹窗状态 - 全局单例
  const [aiSummaryVideo, setAiSummaryVideo] = useState<{ bvid: string; title: string } | null>(null);

  // 记录子页面打开时的来源 Tab，用于返回（使用 ref 避免闭包问题）
  const subPageSourceRef = React.useRef<Tab>('home');
  // 记录设置页面打开前的来源，用于从设置返回
  const settingsSourceRef = React.useRef<Tab>('home');

  // UP主筛选
  const [selectedUploader, setSelectedUploader] = useState<{ mid: number; name: string } | null>(null);
  const [isUploaderPickerOpen, setIsUploaderPickerOpen] = useState(false);
  const [uploaderSearchTerm, setUploaderSearchTerm] = useState('');
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [isTimeFilterOpen, setIsTimeFilterOpen] = useState(false);
  const timeFilterBtnRef = React.useRef<HTMLButtonElement>(null);
  const [timeFilterPos, setTimeFilterPos] = useState({ top: 0, left: 0, width: 0 });

  // 保存当前 tab 到 localStorage
  useEffect(() => {
    localStorage.setItem('activeTab', activeTab);
  }, [activeTab]);

  // 从数据库加载 AI 配置到 localStorage（全局统一加载）
  const loadAIConfigFromDB = useCallback(async () => {
    const userId = getStoredUserId();
    if (!isSupabaseConfigured || !userId) return;

    try {
      const configs = await getAIConfigs(userId);
      if (configs && configs.length > 0) {
        configs.forEach(config => {
          if (config.model_id === 'groq-whisper') {
            localStorage.setItem('groq_api_key', config.api_key);
          } else {
            setModelApiKey(config.model_id, config.api_key);
            if (config.model_id === 'custom') {
              if (config.base_url) localStorage.setItem('ai_base_url', config.base_url);
              if (config.custom_model_name) localStorage.setItem('ai_custom_model', config.custom_model_name);
            }
          }
        });
        // 通知其他组件配置已更新
        window.dispatchEvent(new Event('storage'));
      }
    } catch (err) {
      console.error('加载 AI 配置失败:', err);
    }
  }, []);

  // 检查登录状态 - 支持游客模式
  useEffect(() => {
    const checkAuth = async () => {
      // 最小延迟让加载动画显示
      const minDelay = new Promise(r => setTimeout(r, 800));

      const userId = getStoredUserId();
      if (userId) {
        try {
          const user = await getCurrentUser();
          await minDelay;
          if (user) {
            setCurrentUser(user);
            setIsAuthenticated(true);
            // 加载 AI 配置
            loadAIConfigFromDB();
            return;
          }
        } catch (err) {
          console.error('认证检查失败:', err);
          // 网络错误时仍允许进入游客模式
        }
      }
      await minDelay;
      // 游客模式 - 允许访问但无数据功能
      setIsAuthenticated(false);
    };
    checkAuth();
  }, [loadAIConfigFromDB]);

  // 登录成功回调
  const handleLoginSuccess = async () => {
    const user = await getCurrentUser();
    setCurrentUser(user);
    setIsAuthenticated(true);
    clearCookieCache(); // 清除Cookie缓存，使用新用户的Cookie
    // 加载 AI 配置
    await loadAIConfigFromDB();
    // 显示工作流提示
    setShowWorkflowPrompt(true);
    setWorkflowPromptShownToday(true);
  };

  // 退出登录
  const handleLogout = () => {
    logout();
    clearCookieCache();
    setCurrentUser(null);
    setIsAuthenticated(false);
  };

  // 真实数据状态
  const [videos, setVideos] = useState<VideoWithUploader[]>([]);
  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true); // 首次加载标记
  const [error, setError] = useState<string | null>(null);

  // 快捷入口数量
  const [collectedCount, setCollectedCount] = useState(0);
  const [todoCount, setTodoCount] = useState(0);
  const [reminderCount, setReminderCount] = useState(0);
  const [notesCount, setNotesCount] = useState(0);

  // 时间轴
  const [showTimeline, setShowTimeline] = useState(false);

  // 未读通知数量
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  // 加载未读通知数量
  useEffect(() => {
    const loadUnreadCount = async () => {
      const userId = getStoredUserId();
      if (!userId) return;

      const { count } = await supabase
        .from('notification')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false);

      setUnreadNotificationCount(count || 0);
    };

    loadUnreadCount();
    // 每分钟刷新一次
    const interval = setInterval(loadUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [currentUser?.id]); // 用户登录后重新加载

  // 监听通知状态变化事件，刷新未读数量
  useEffect(() => {
    const handleNotificationChange = () => {
      const userId = getStoredUserId();
      if (!userId) return;

      supabase
        .from('notification')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_read', false)
        .then(({ count }) => setUnreadNotificationCount(count || 0));
    };

    window.addEventListener('notification-change', handleNotificationChange);
    return () => window.removeEventListener('notification-change', handleNotificationChange);
  }, []);

  // 加载快捷入口数量
  useEffect(() => {
    const loadCounts = async () => {
      const userId = getStoredUserId();
      if (!userId) return;

      // 收藏夹数量
      const { count: cCount } = await supabase
        .from('collected_video')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      setCollectedCount(cCount || 0);

      // TODO数量（从 localStorage 读取）
      try {
        const todos = JSON.parse(localStorage.getItem('fluxf-todos') || '[]');
        setTodoCount(todos.filter((t: any) => !t.completed).length);
      } catch { setTodoCount(0); }

      // 提醒任务数量
      try {
        const tasks = JSON.parse(localStorage.getItem('interval-reminder-tasks') || '[]');
        setReminderCount(tasks.filter((t: any) => t.isActive).length);
      } catch { setReminderCount(0); }

      // 笔记数量
      const { count: nCount } = await supabase
        .from('notes')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);
      setNotesCount(nCount || 0);

      // 回收站数量
      const { count: rCount } = await supabase
        .from('video')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('is_deleted', true);
      setRecycleBinCount(rCount || 0);
    };

    loadCounts();
    // 每次切换到首页时刷新
    if (activeTab === 'home') loadCounts();
  }, [activeTab]);

  // Infinite Scroll State
  const [visibleCount, setVisibleCount] = useState(48); // 初始渲染 48 个，配合虚拟化占位实现极致流畅
  const mainRef = React.useRef<HTMLDivElement>(null);


  // 筛选条件变化时重置 visibleCount
  useEffect(() => {
    setVisibleCount(48);
  }, [activeFilter, selectedUploader, searchTerm, activeTab]);

  // 滑动切换Tab - B站式交互体验
  const touchStartX = React.useRef<number>(0);
  const touchStartY = React.useRef<number>(0);
  const touchEndX = React.useRef<number>(0);
  const touchEndY = React.useRef<number>(0);
  const touchStartTime = React.useRef<number>(0);
  const isSwiping = React.useRef<boolean>(false);
  const swipeDirection = React.useRef<'horizontal' | 'vertical' | 'none'>('none');
  const tabs: Tab[] = ['home', 'watchLater', 'rss', 'settings'];

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    isSwiping.current = false;
    swipeDirection.current = 'none';
  }, []);

  const lastTouchTime = React.useRef<number>(0);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    // 节流处理：控制手势位移状态更新频率
    const now = Date.now();
    if (now - lastTouchTime.current < 32) return; // ~30fps 限制
    lastTouchTime.current = now;

    touchEndX.current = e.touches[0].clientX;
    touchEndY.current = e.touches[0].clientY;

    const deltaX = Math.abs(touchEndX.current - touchStartX.current);
    const deltaY = Math.abs(touchEndY.current - touchStartY.current);

    // 首次移动时确定滑动方向
    if (swipeDirection.current === 'none' && (deltaX > 10 || deltaY > 10)) {
      swipeDirection.current = deltaX > deltaY * 1.5 ? 'horizontal' : 'vertical';
    }

    if (swipeDirection.current === 'horizontal' && deltaX > 50) {
      isSwiping.current = true;
    }
  }, []);

  const handleTouchEnd = useCallback(() => {
    // 不是水平滑动，或没有发生滑动，则不处理
    if (swipeDirection.current !== 'horizontal' || !isSwiping.current) {
      swipeDirection.current = 'none';
      return;
    }

    const diffX = touchStartX.current - touchEndX.current;
    const diffY = Math.abs(touchEndY.current - touchStartY.current);
    const duration = Date.now() - touchStartTime.current;

    // 计算滑动速度 (px/ms)
    const velocity = Math.abs(diffX) / duration;

    // 动态阈值：快速滑动(velocity > 0.5)降低阈值到80px，慢速滑动提高到120px
    const threshold = velocity > 0.5 ? 80 : 120;

    // 垂直滑动过多，可能是斜向滑动，不触发切换
    if (diffY > 50) {
      swipeDirection.current = 'none';
      return;
    }

    // 水平滑动距离不够
    if (Math.abs(diffX) < threshold) {
      swipeDirection.current = 'none';
      return;
    }

    const currentIndex = tabs.indexOf(activeTab);

    if (diffX > 0 && currentIndex < tabs.length - 1) {
      // 左滑 -> 下一个tab
      setActiveTab(tabs[currentIndex + 1]);
    } else if (diffX < 0 && currentIndex > 0) {
      // 右滑 -> 上一个tab
      setActiveTab(tabs[currentIndex - 1]);
    }

    swipeDirection.current = 'none';
  }, [activeTab, tabs]);

  // 处理 API 错误 - 检测认证过期和网络问题
  const handleApiError = useCallback((err: any, context: string) => {
    console.error(`${context}:`, err);

    // 检测认证过期 (401/403)
    if (err?.code === 'PGRST301' || err?.message?.includes('JWT') || err?.status === 401 || err?.status === 403) {
      setAuthExpired(true);
      setNetworkError('登录已过期，请重新登录');
      return '登录已过期';
    }

    // 检测网络错误
    if (err?.message?.includes('network') || err?.message?.includes('fetch') || !navigator.onLine) {
      setNetworkError('网络连接失败，请检查网络后重试');
      return '网络连接失败';
    }

    // 其他错误
    const message = err instanceof Error ? err.message : '操作失败';
    setNetworkError(message);
    return message;
  }, []);

  // 从 Supabase 获取视频数据
  const fetchVideos = useCallback(async () => {
    // 未配置 Supabase 或游客模式时直接返回空
    if (!isSupabaseConfigured || !currentUser?.id) {
      setLoading(false);
      setInitialLoading(false);
      setVideos([]);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      setNetworkError(null);

      // 确保最小加载时间，避免闪烁
      const minLoadTime = initialLoading ? 500 : 0;
      const startTime = Date.now();

      // 查询视频列表（排除已删除的视频）
      const { data, error: fetchError } = await supabase
        .from('video')
        .select('*')
        .eq('user_id', currentUser.id)
        .or('is_deleted.is.null,is_deleted.eq.false')
        .order('pubdate', { ascending: false });

      if (fetchError) throw fetchError;
      
      // 获取相关的 uploader 信息（分别处理 B站和 YouTube）
      if (data && data.length > 0) {
        // 分别处理 B站和 YouTube 视频
        const biliVideos = data.filter((v: any) => v.platform !== 'youtube');
        const ytVideos = data.filter((v: any) => v.platform === 'youtube');

        // B站视频通过 mid 关联
        const mids = [...new Set(biliVideos.map(v => v.mid).filter(Boolean))];
        let biliUploaderMap = new Map();
        if (mids.length > 0) {
          const { data: uploaders } = await supabase
            .from('uploader')
            .select('mid, name, face')
            .eq('user_id', currentUser.id)
            .eq('platform', 'bilibili')
            .in('mid', mids);
          biliUploaderMap = new Map(uploaders?.map(u => [u.mid, u]) || []);
        }

        // YouTube 视频通过 channel_id 关联
        const channelIds = [...new Set(ytVideos.map((v: any) => v.channel_id).filter(Boolean))];
        let ytUploaderMap = new Map();
        if (channelIds.length > 0) {
          const { data: uploaders } = await supabase
            .from('uploader')
            .select('channel_id, name, face')
            .eq('user_id', currentUser.id)
            .eq('platform', 'youtube')
            .in('channel_id', channelIds);
          ytUploaderMap = new Map(uploaders?.map((u: any) => [u.channel_id, u]) || []);
        }

        data.forEach((video: any) => {
          let uploader = null;
          if (video.platform === 'youtube') {
            uploader = ytUploaderMap.get(video.channel_id);
          } else {
            uploader = biliUploaderMap.get(video.mid);
          }
          if (uploader) {
            video.uploader = {
              name: uploader.name,
              face: uploader.face
            };
          }
        });
      }

      // 等待最小加载时间
      const elapsed = Date.now() - startTime;
      if (elapsed < minLoadTime) {
        await new Promise(resolve => setTimeout(resolve, minLoadTime - elapsed));
      }

      setVideos((data as VideoWithUploader[]) || []);
    } catch (err) {
      const message = handleApiError(err, '获取视频失败');
      setError(message);
    } finally {
      setLoading(false);
      setInitialLoading(false);
    }
  }, [currentUser?.id, handleApiError, initialLoading]);

  // 从 Supabase 获取待看列表
  const fetchWatchlist = useCallback(async () => {
    if (!isSupabaseConfigured) return;

    const userId = currentUser?.id;
    if (!userId) return;

    try {
      const { data, error: fetchError } = await supabase
        .from('watchlist')
        .select('bvid')
        .eq('user_id', userId);

      if (fetchError) throw fetchError;

      const bvidSet = new Set(data?.map(item => item.bvid) || []);
      setWatchLaterIds(bvidSet);
    } catch (err) {
      console.error('获取待看列表失败:', err);
    }
  }, [currentUser?.id]);

  // 用户登录后加载数据
  useEffect(() => {
    if (currentUser?.id) {
      console.log('👤 用户已登录，加载数据...', currentUser.id);
      fetchVideos();
      fetchWatchlist();
    }
  }, [currentUser?.id]); // 只在用户ID变化时触发

  // 切换到首页时检查是否需要重新加载
  useEffect(() => {
    if (activeTab === 'home' && videos.length === 0 && !loading && !error && currentUser?.id) {
      console.log('🏠 回到首页，重新加载...');
      fetchVideos();
    }
  }, [activeTab, videos.length, loading, error, currentUser?.id]);

  // 监听同步完成事件，刷新数据
  useEffect(() => {
    const handleSyncComplete = () => {
      console.log('🔄 同步完成，刷新数据...');
      fetchVideos();
    };
    window.addEventListener('sync-complete', handleSyncComplete);
    return () => window.removeEventListener('sync-complete', handleSyncComplete);
  }, [fetchVideos]);

  // Toast 提示
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 2000);
  };

  // Toggle Watch Later - 同步到 Supabase
  const toggleWatchLater = useCallback(async (bvid: string) => {
    if (watchlistLoading) return;

    const isInList = watchLaterIds.has(bvid);

    // 乐观更新UI
    setWatchLaterIds(prev => {
      const newSet = new Set(prev);
      if (isInList) {
        newSet.delete(bvid);
      } else {
        newSet.add(bvid);
      }
      return newSet;
    });

    showToast(isInList ? '已从待看列表移除' : '已加入待看列表');

    // 同步到 Supabase
    if (isSupabaseConfigured && currentUser?.id) {
      try {
        setWatchlistLoading(true);
        if (isInList) {
          await removeFromWatchlistByBvid(bvid, currentUser.id);
        } else {
          await addToWatchlist(bvid, currentUser.id);
        }
      } catch (err) {
        console.error('待看列表操作失败:', err);
        // 回滚UI状态
        setWatchLaterIds(prev => {
          const newSet = new Set(prev);
          if (isInList) {
            newSet.add(bvid);
          } else {
            newSet.delete(bvid);
          }
          return newSet;
        });
        showToast('操作失败，请重试');
      } finally {
        setWatchlistLoading(false);
      }
    }
  }, [watchLaterIds, watchlistLoading]);

  // 显示删除确认框
  const showDeleteConfirm = useCallback((bvid: string, title: string) => {
    const videoUrl = `https://www.bilibili.com/video/${bvid}`;
    setDeleteConfirmVideo({ bvid, title, url: videoUrl });
  }, []);

  // 执行删除视频
  const executeDeleteVideo = useCallback(async (bvid: string, shouldLog: boolean = false) => {
    if (!currentUser?.id || !isSupabaseConfigured) {
      showToast('请先登录');
      return;
    }

    const video = videos.find(v => v.bvid === bvid);

    // 如果需要记录，跳转到学习日志
    if (shouldLog && video) {
      setLearningLogInitialData({
        url: `https://www.bilibili.com/video/${bvid}`,
        title: video.title,
        cover: video.pic || ''
      });
      subPageSourceRef.current = activeTab; // 记录当前页面作为来源
      setIsLearningLogOpen(true);
    }

    // 软删除视频（移到回收站）
    try {
      setVideos(prev => prev.filter(v => v.bvid !== bvid));

      const { error } = await supabase
        .from('video')
        .update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('bvid', bvid)
        .eq('user_id', currentUser.id);

      if (error) throw error;

      // 更新回收站数量
      setRecycleBinCount(prev => prev + 1);

      showToast('已移到回收站');
    } catch (err) {
      console.error('删除视频失败:', err);
      fetchVideos();
      showToast('删除失败，请重试');
    }

    setDeleteConfirmVideo(null);
  }, [currentUser?.id, fetchVideos, videos, activeTab]);

  // 兼容旧的删除方法（直接删除不确认）
  const handleDeleteVideo = useCallback(async (bvid: string) => {
    const video = videos.find(v => v.bvid === bvid);
    showDeleteConfirm(bvid, video?.title || '');
  }, [videos, showDeleteConfirm]);

  // 处理视频下载 - 跳转到设置页面的视频下载页面
  const handleTranscript = useCallback((videoUrl: string) => {
    // 链接已在 VideoCard 中复制到剪贴板
    setSettingsInitialView('downloader');
    setActiveTab('settings');
  }, []);

  // 获取所有UP主列表（去重，按视频数量排序）
  const uploaders = useMemo(() => {
    const uploaderMap = new Map<number, { mid: number; name: string; face: string | null; count: number; latestTime: string }>();

    videos.forEach(v => {
      if (v.mid && v.uploader?.name) {
        const existing = uploaderMap.get(v.mid);
        if (existing) {
          existing.count++;
          if (v.created_at > existing.latestTime) {
            existing.latestTime = v.created_at;
          }
        } else {
          uploaderMap.set(v.mid, {
            mid: v.mid,
            name: v.uploader.name,
            face: v.uploader.face || null,
            count: 1,
            latestTime: v.created_at,
          });
        }
      }
    });

    // 按最新插入时间排序
    return Array.from(uploaderMap.values()).sort((a, b) =>
      new Date(b.latestTime).getTime() - new Date(a.latestTime).getTime()
    );
  }, [videos]);

  // 筛选后的UP主列表（支持搜索）
  const filteredUploaders = useMemo(() => {
    if (!uploaderSearchTerm) return uploaders;
    const term = uploaderSearchTerm.toLowerCase();
    return uploaders.filter(u => u.name.toLowerCase().includes(term));
  }, [uploaders, uploaderSearchTerm]);

  // Filter Logic
  const filteredVideos = useMemo(() => {
    let result = [...videos];

    // 1. Tab - 先根据当前界面过滤
    if (activeTab === 'watchLater') {
      result = result.filter(v => watchLaterIds.has(v.bvid));
    }

    // 2. UP主筛选
    if (selectedUploader) {
      result = result.filter(v => v.mid === selectedUploader.mid);
    }

    // 3. Search - 基于当前界面搜索（标题 + UP主名称）
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter(v =>
        v.title.toLowerCase().includes(term) ||
        (v.uploader?.name || '').toLowerCase().includes(term)
      );
    }

    // 4. Time Filter - 基于插入时间 (created_at)
    const now = new Date();
    result = result.filter(v => {
      if (activeFilter === 'all') return true;

      const insertDate = new Date(v.created_at);
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const timeDiff = dayStart.getTime() - new Date(insertDate.getFullYear(), insertDate.getMonth(), insertDate.getDate()).getTime();
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

      if (activeFilter === 'today') return daysDiff === 0; // 今天插入的
      if (activeFilter === 'week') return daysDiff >= 0 && daysDiff < 7; // 最近7天
      if (activeFilter === 'month') return daysDiff >= 0 && daysDiff < 30; // 最近30天

      if (activeFilter === 'custom') {
        if (!customDateFilter.year) return true;
        const pubDate = new Date(v.pubdate || v.created_at);
        if (pubDate.getFullYear() !== customDateFilter.year) return false;
        if (customDateFilter.month !== undefined && pubDate.getMonth() !== customDateFilter.month) return false;
        if (customDateFilter.day !== undefined && pubDate.getDate() !== customDateFilter.day) return false;
        return true;
      }

      return true;
    });

    // 按插入时间排序（最新的在前）
    result.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return result;
  }, [videos, activeTab, watchLaterIds, activeFilter, customDateFilter, searchTerm, selectedUploader]);

  // 热门视频排序 - 根据热度分数排序
  const hotVideos = useMemo(() => {
    return [...videos]
      .sort((a, b) => {
        // 热度计算：播放量50% + 点赞数30% + 收藏数20%
        const scoreA = (a.view_count || 0) * 0.5 + (a.like_count || 0) * 0.3 + (a.favorite_count || 0) * 0.2;
        const scoreB = (b.view_count || 0) * 0.5 + (b.like_count || 0) * 0.3 + (b.favorite_count || 0) * 0.2;
        return scoreB - scoreA;
      })
      .slice(0, 5);
  }, [videos]);



  // Infinite Scroll Handler - 节流优化 + 固定功能栏显示
  useEffect(() => {
    const mainElement = mainRef.current;
    if (!mainElement) return;

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const { scrollTop, scrollHeight, clientHeight } = mainElement;
          // 无限滚动加载 - 增加触发距离到 1500px，极致超前加载
          if (scrollTop + clientHeight >= scrollHeight - 1500) {
            setVisibleCount(prev => {
              if (prev >= filteredVideos.length) return prev;
              return Math.min(prev + 36, filteredVideos.length); // 每次追加 3 组
            });
          }
          ticking = false;
        });
        ticking = true;
      }
    };
    mainElement.addEventListener('scroll', handleScroll, { passive: true });
    return () => mainElement.removeEventListener('scroll', handleScroll);
  }, [filteredVideos.length]);

  // 下拉刷新处理
  const handlePullRefresh = useCallback(async () => {
    console.log('🔃 下拉刷新触发');
    if (!currentUser?.id) {
      console.log('⚠️ 未登录，跳过刷新');
      showToast('请先登录');
      return;
    }
    await fetchVideos();
    await fetchWatchlist();
    showToast('刷新成功');
  }, [fetchVideos, fetchWatchlist, currentUser?.id]);

  // 认证检查中显示加载动画
  if (isAuthenticated === null) {
    return (
      <div className="h-screen bg-[#050510] flex items-center justify-center">
        <Loader text="正在加载..." />
      </div>
    );
  }

  // 认证过期时显示登录页
  if (authExpired) {
    return (
      <Suspense fallback={<SimpleLoader />}>
        <AuthPage onLoginSuccess={() => { setAuthExpired(false); handleLoginSuccess(); }} />
      </Suspense>
    );
  }

  return (
    <>
      {/* 每日工作流 - 独立页面，在最外层 */}
      <Suspense fallback={null}>
        <DailyWorkflow
          isOpen={isDailyWorkflowOpen}
          onClose={() => setIsDailyWorkflowOpen(false)}
          onNodeClick={(nodeCode) => {
            // 根据节点代码跳转到相应页面
            switch (nodeCode) {
              case 'daily_info':
                subPageSourceRef.current = activeTab;
                // 使用 flushSync 确保状态同步更新，避免闪现
                flushSync(() => {
                  setSettingsInitialView('insights');
                });
                setIsDailyWorkflowOpen(false);
                setActiveTab('settings');
                break;
              case 'dev_hotspot':
                subPageSourceRef.current = activeTab;
                flushSync(() => {
                  setSettingsInitialView('devcommunity');
                });
                setIsDailyWorkflowOpen(false);
                setActiveTab('settings');
                break;
              case 'video_collection':
                subPageSourceRef.current = activeTab;
                flushSync(() => {
                  setSettingsInitialView('collector');
                });
                setIsDailyWorkflowOpen(false);
                setActiveTab('settings');
                break;
              case 'notes':
                subPageSourceRef.current = activeTab;
                setIsDailyWorkflowOpen(false);
                setIsNotesOpen(true);
                break;
            }
          }}
        />
      </Suspense>

      <PullToRefresh onRefresh={handlePullRefresh} scrollContainerRef={mainRef} disabled={showTimeline}>
        <div className="h-screen bg-cyber-dark font-sans selection:bg-cyber-lime selection:text-black relative overflow-hidden flex flex-col">

        {/* PWA 安装提示 */}
        <Suspense fallback={null}>
          <PWAInstallPrompt />
        </Suspense>

        {/* 高优先级待办提醒弹窗 */}
        <Suspense fallback={null}>
          <HighPriorityTodoReminder
            onNavigateToTodo={() => setActiveTab('todo')}
          />
        </Suspense>

        {/* 网络错误提示 */}
        {networkError && (
          <div className="fixed top-4 left-4 right-4 z-[9999] animate-slide-down">
            <div className="bg-red-500/90 backdrop-blur-xl rounded-2xl p-4 shadow-2xl border border-red-400/30">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium">{networkError}</p>
                  <p className="text-white/70 text-sm mt-0.5">
                    {!navigator.onLine ? '请检查您的网络连接' : '请稍后重试或联系支持'}
                  </p>
                </div>
                <button
                  onClick={() => setNetworkError(null)}
                  className="p-1 hover:bg-white/20 rounded-lg transition-colors"
                >
                  <svg className="w-5 h-5 text-white/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 游客模式提示 - 未登录时显示 */}
        {!isAuthenticated && !authExpired && (
          <div className="fixed bottom-20 left-4 right-4 lg:left-60 z-50">
            <div className="bg-gradient-to-r from-cyber-lime/20 to-cyan-500/20 backdrop-blur-xl rounded-2xl p-4 border border-cyber-lime/30">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-cyber-lime/20 flex items-center justify-center shrink-0">
                  <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-medium text-sm">游客模式</p>
                  <p className="text-gray-400 text-xs">登录后可同步视频数据</p>
                </div>
                <button
                  onClick={() => setAuthExpired(true)}
                  className="px-4 py-2 bg-cyber-lime text-black text-sm font-medium rounded-xl hover:bg-cyber-lime/90 transition-colors"
                >
                  登录
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 绿色渐变灯光弥散背景 - 与顶栏融为一体 */}
        <div className="fixed inset-0 pointer-events-none overflow-hidden">
          {/* 基础深色 */}
          <div className="absolute inset-0 bg-[#050a08]" />

          {/* 顶部绿色弥散光 - 与顶栏融合 */}
          <div className="absolute -top-20 left-0 right-0 h-[400px]">
            {/* 主绿色光晕 */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[120%] h-full bg-gradient-to-b from-emerald-500/40 via-emerald-600/20 to-transparent blur-3xl" />
            {/* 左侧青绿光斑 */}
            <div className="absolute -top-10 -left-20 w-80 h-80 bg-emerald-400/30 rounded-full blur-[100px] animate-glow-pulse" />
            {/* 右侧翠绿光斑 */}
            <div className="absolute -top-10 -right-10 w-72 h-72 bg-lime-500/25 rounded-full blur-[80px] animate-glow-pulse" style={{ animationDelay: '2s' }} />
            {/* 中间亮点 */}
            <div className="absolute top-10 left-1/2 -translate-x-1/2 w-96 h-48 bg-emerald-300/20 rounded-full blur-[60px] animate-glow-pulse" style={{ animationDelay: '1s' }} />
          </div>

          {/* 噪点纹理 - 仅在 PC 端渲染以节省移动端 GPU 资源 */}
          <div className="hidden lg:block absolute inset-0 opacity-[0.02]" style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E")`,
          }} />
        </div>

        {/* 绿色光晕动画样式 */}
        <style>{`
          @keyframes glow-pulse {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.1); }
          }
          .animate-glow-pulse {
            animation: glow-pulse 6s ease-in-out infinite;
          }
        `}</style>

        {/* 主内容区域容器 - PC端在侧边栏右侧 */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 lg:ml-56 overflow-hidden">

          {/* Header & Sticky Filter */}
          <header className="sticky top-0 z-40 w-full transition-all duration-300">
            {/* 整体彩色弥散背景容器 - 与页面背景融合 */}
            <div className="relative overflow-hidden">
              {/* 彩色弥散背景 - 透明渐变，与背景融为一体 */}
              <div className="absolute inset-0 bg-gradient-to-b from-emerald-500/15 via-emerald-600/5 to-transparent" />
              <div className="absolute -top-20 left-1/4 w-60 h-40 bg-emerald-400/20 rounded-full blur-3xl" />
              <div className="absolute -top-10 right-1/3 w-48 h-32 bg-lime-500/15 rounded-full blur-3xl" />

              {/* Top Bar 内容层 - 移动端降低模糊半径提升性能 */}
              <div className="relative bg-black/10 backdrop-blur-md lg:backdrop-blur-xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <img src={LogoSvg} alt="FluxF" className="w-9 h-9 shrink-0" />
                  <div className="relative flex-1">
                    <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input
                      type="text"
                      placeholder={activeTab === 'watchLater' ? '搜索待看列表...' : '搜索视频或UP...'}
                      className="w-full bg-white/10 border border-white/20 rounded-full pl-10 pr-10 py-2 text-sm text-white placeholder-gray-400 focus:outline-none focus:border-cyber-lime/50 transition-colors"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    {/* 清除按钮 */}
                    {searchTerm && (
                      <button
                        onClick={() => setSearchTerm('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                      >
                        <svg className="w-3 h-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    )}
                  </div>
                  <SyncButton compact />
                  {/* 通知按钮 */}
                  <button
                    onClick={() => setShowTimeline(true)}
                    className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:border-cyber-lime/50 hover:bg-cyber-lime/10 transition-colors relative"
                    title="通知"
                  >
                    <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    {unreadNotificationCount > 0 && (
                      <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 bg-red-500 rounded-full text-[10px] text-white flex items-center justify-center font-bold">
                        {unreadNotificationCount > 99 ? '99+' : unreadNotificationCount}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => setIsCalendarOpen(true)}
                    className="w-8 h-8 rounded-full bg-white/5 border border-white/10 flex items-center justify-center hover:border-cyber-lime/50 transition-colors"
                    title="视频日历"
                  >
                    <CalendarIcon className="w-4 h-4 text-gray-400" />
                  </button>
                  {/* 个人头像/设置 */}
                  <button
                    onClick={() => setIsSettingsOpen(true)}
                    className="w-8 h-8 rounded-full bg-gradient-to-br from-cyber-lime to-emerald-400 flex items-center justify-center text-black font-bold text-xs hover:scale-110 transition-transform"
                    title="设置"
                  >
                    {currentUser?.username?.[0]?.toUpperCase() || 'U'}
                  </button>
                </div>
              </div>

              {/* Filter Chips - 融入彩色弥散背景 (RSS页面隐藏) - 移动端降低模糊半径提升性能 */}
              {activeTab !== 'rss' && (
                <div className="relative bg-black/10 backdrop-blur-sm lg:backdrop-blur-md py-2 overflow-x-auto no-scrollbar touch-pan-x">
                  <div className="flex px-4 gap-2 w-max">
                    {/* All 按钮 */}
                    <button
                      onClick={() => {
                        setActiveFilter('all');
                        mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                      }}
                      className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-all border ${activeFilter === 'all'
                        ? 'bg-cyber-lime text-black border-cyber-lime shadow-[0_0_10px_rgba(163,230,53,0.3)]'
                        : 'bg-white/5 text-gray-400 border-white/5 hover:border-gray-600'
                        }`}
                    >
                      All
                    </button>

                    {/* 时间筛选按钮 */}
                    <button
                      ref={timeFilterBtnRef}
                      onClick={() => {
                        if (timeFilterBtnRef.current) {
                          const rect = timeFilterBtnRef.current.getBoundingClientRect();
                          setTimeFilterPos({ top: rect.bottom + 4, left: rect.left, width: rect.width });
                        }
                        setIsTimeFilterOpen(true);
                      }}
                      className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-medium transition-all border flex items-center gap-1.5 ${['today', 'week', 'month'].includes(activeFilter)
                        ? 'bg-cyber-lime text-black border-cyber-lime shadow-[0_0_10px_rgba(163,230,53,0.3)]'
                        : 'bg-white/5 text-gray-400 border-white/5 hover:border-gray-600'
                        }`}
                    >
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                        <line x1="16" y1="2" x2="16" y2="6" />
                        <line x1="8" y1="2" x2="8" y2="6" />
                        <line x1="3" y1="10" x2="21" y2="10" />
                      </svg>
                      {activeFilter === 'today' ? '今天' : activeFilter === 'week' ? '本周' : activeFilter === 'month' ? '本月' : '时间'}
                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {/* 高级筛选组合按钮 */}
                    <div className={`flex items-center rounded-full border overflow-hidden ${activeFilter === 'custom' || selectedUploader
                      ? 'border-cyber-lime/50 bg-white/5'
                      : 'border-white/10 bg-white/5'
                      }`}>
                      {/* 自定义日期 */}
                      <button
                        onClick={() => setIsFilterOpen(true)}
                        className={`whitespace-nowrap px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 ${activeFilter === 'custom'
                          ? 'bg-cyber-lime text-black'
                          : 'text-gray-400 hover:text-white hover:bg-white/10'
                          }`}
                      >
                        <SlidersIcon className="w-3 h-3" />
                        {activeFilter === 'custom'
                          ? `${customDateFilter.year}${customDateFilter.month !== undefined ? `/${customDateFilter.month + 1}` : ''}${customDateFilter.day !== undefined ? `/${customDateFilter.day}` : ''}`
                          : '日期'}
                      </button>

                      {/* 分隔线 */}
                      <div className="w-px h-4 bg-white/20" />

                      {/* UP主筛选 */}
                      <button
                        onClick={() => setIsUploaderPickerOpen(true)}
                        className={`whitespace-nowrap px-3 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 ${selectedUploader
                          ? 'bg-violet-500 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-white/10'
                          }`}
                      >
                        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        {selectedUploader ? selectedUploader.name : '关注'}
                      </button>

                      {/* 清除按钮 */}
                      {(selectedUploader || activeFilter === 'custom') && (
                        <>
                          <div className="w-px h-4 bg-white/20" />
                          <button
                            onClick={() => {
                              setSelectedUploader(null);
                              if (activeFilter === 'custom') setActiveFilter('today');
                            }}
                            className="px-2 py-1.5 text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                            title="清除筛选"
                          >
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        </>
                      )}
                    </div>

                    {/* AI 分析按钮 */}
                    <button
                      onClick={() => setIsVideoAnalyzerOpen(true)}
                      className="whitespace-nowrap px-3 py-1.5 rounded-full text-xs font-medium transition-all border flex items-center gap-1.5 bg-white/5 border-white/10 text-gray-300 hover:bg-white/10 hover:border-white/20 hover:text-white"
                    >
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h1a7 7 0 0 1 7 7h1a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-1v1a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-1H2a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h1a7 7 0 0 1 7-7h1V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2z" />
                      </svg>
                      AI
                    </button>

                  </div>
                </div>
              )}
            </div>
          </header>


          {/* Main Content Feed - 仿B站虚拟化容器逻辑 */}
          <main
            ref={mainRef}
            className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar px-3 lg:px-6 xl:px-8 py-4 pb-24 lg:pb-6"
            style={{
              willChange: 'scroll-position',
              WebkitOverflowScrolling: 'touch',
              contain: 'layout size style',
              transform: 'translateZ(0)'
            }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {/* 页面内容容器 */}
            <div>

              {/* RSS 阅读界面 */}
              {activeTab === 'rss' && (
                <Suspense fallback={<SimpleLoader />}>
                  <RssFeed scrollContainerRef={mainRef} timeFilter={activeFilter} />
                </Suspense>
              )}

              {/* TODO 待办事项界面 */}
              {activeTab === 'todo' && (
                <Suspense fallback={<SimpleLoader />}>
                  <TodoList embedded timeFilter={activeFilter} />
                </Suspense>
              )}

              {/* 设置页面 */}
              <Suspense fallback={<SimpleLoader />}>
                <SettingsPage
                  isOpen={activeTab === 'settings'}
                  onClose={() => setActiveTab(subPageSourceRef.current)}
                  initialView={settingsInitialView}
                  onOpenNotes={() => { subPageSourceRef.current = 'settings'; setIsNotesOpen(true); }}
                  onOpenLearningLog={() => { subPageSourceRef.current = 'settings'; setLearningLogInitialData({ url: '', title: '', cover: '' }); setIsLearningLogOpen(true); }}
                  onOpenResourceCenter={() => { subPageSourceRef.current = 'settings'; setIsResourceCenterOpen(true); }}
                />
              </Suspense>

              {/* 笔记页面 */}
              <Suspense fallback={<SimpleLoader />}>
                <NotesPage
                  isOpen={isNotesOpen}
                  onClose={() => {
                    setIsNotesOpen(false);
                    // 返回到打开时的来源页面
                    setActiveTab(subPageSourceRef.current);
                    // 如果是从设置返回，恢复设置页面的来源
                    if (subPageSourceRef.current === 'settings') {
                      subPageSourceRef.current = settingsSourceRef.current;
                    }
                  }}
                />
              </Suspense>

              {/* 学习日志页面 */}
              <Suspense fallback={<SimpleLoader />}>
                <LearningLog
                  isOpen={isLearningLogOpen}
                  onClose={() => {
                    setIsLearningLogOpen(false);
                    // 返回到打开时的来源页面
                    setActiveTab(subPageSourceRef.current);
                    // 如果是从设置返回，恢复设置页面的来源
                    if (subPageSourceRef.current === 'settings') {
                      subPageSourceRef.current = settingsSourceRef.current;
                    }
                  }}
                  initialVideoUrl={learningLogInitialData.url}
                  initialVideoTitle={learningLogInitialData.title}
                  initialVideoCover={learningLogInitialData.cover}
                />
              </Suspense>

              {/* 资源中心 */}
              <Suspense fallback={<SimpleLoader />}>
                <ResourceCenter
                  isOpen={isResourceCenterOpen}
                  onClose={() => {
                    setIsResourceCenterOpen(false);
                    // 返回到打开时的来源页面
                    setActiveTab(subPageSourceRef.current);
                    // 如果是从设置返回，恢复设置页面的来源
                    if (subPageSourceRef.current === 'settings') {
                      subPageSourceRef.current = settingsSourceRef.current;
                    }
                  }}
                />
              </Suspense>

              {/* 回收站 */}
              {isRecycleBinOpen && (
                <Suspense fallback={<SimpleLoader />}>
                  <RecycleBin
                    onClose={() => setIsRecycleBinOpen(false)}
                    onRestore={() => {
                      fetchVideos();
                      // 刷新回收站数量
                      const userId = getStoredUserId();
                      if (userId) {
                        supabase
                          .from('video')
                          .select('*', { count: 'exact', head: true })
                          .eq('user_id', userId)
                          .eq('is_deleted', true)
                          .then(({ count }) => setRecycleBinCount(count || 0));
                      }
                    }}
                  />
                </Suspense>
              )}

              {/* 工作流提示弹窗 - 仅在登录后首次显示 */}
              {showWorkflowPrompt && !workflowPromptShownToday && (
                <Suspense fallback={null}>
                  <WorkflowPromptModal
                    onClose={() => setShowWorkflowPrompt(false)}
                    onEnter={() => {
                      setShowWorkflowPrompt(false);
                      setIsDailyWorkflowOpen(true);
                    }}
                  />
                </Suspense>
              )}

              {/* 全局 AI总结弹窗 - 单例 */}
              {aiSummaryVideo && (
                <Suspense fallback={null}>
                  <AISummaryModal
                    key={aiSummaryVideo.bvid}
                    bvid={aiSummaryVideo.bvid}
                    title={aiSummaryVideo.title}
                    onClose={() => setAiSummaryVideo(null)}
                  />
                </Suspense>
              )}

              {/* AI 视频分析 */}
              <Suspense fallback={<SimpleLoader />}>
                <VideoAnalyzer
                  isOpen={isVideoAnalyzerOpen}
                  onClose={() => setIsVideoAnalyzerOpen(false)}
                  videos={filteredVideos}
                  filterName={
                    selectedUploader ? `UP主: ${selectedUploader.name}` :
                      activeFilter === 'today' ? '今天' :
                        activeFilter === 'week' ? '本周' :
                          activeFilter === 'month' ? '本月' :
                            activeFilter === 'custom' ? `${customDateFilter.year}${customDateFilter.month !== undefined ? `/${customDateFilter.month + 1}` : ''}` :
                              activeTab === 'watchLater' ? '待看列表' :
                                '全部视频'
                  }
                />
              </Suspense>

              {/* 删除确认框 */}
              {deleteConfirmVideo && createPortal(
                <div
                  className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
                  onClick={(e) => { if (e.target === e.currentTarget) setDeleteConfirmVideo(null); }}
                >
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
                  <div
                    className="relative w-full max-w-sm rounded-2xl overflow-hidden p-6"
                    style={{
                      backgroundColor: 'rgba(30,30,35,0.98)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      animation: 'scaleIn 0.2s ease-out'
                    }}
                  >
                    {/* 右上角关闭按钮 */}
                    <button
                      onClick={() => setDeleteConfirmVideo(null)}
                      className="absolute top-3 right-3 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center hover:bg-red-600 transition-colors"
                    >
                      <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>

                    <h3 className="text-lg font-semibold text-white mb-2">删除视频</h3>
                    <p className="text-sm text-gray-400 mb-1 line-clamp-2">{deleteConfirmVideo.title}</p>
                    <p className="text-xs text-gray-500 mb-6">确定要删除这个视频吗？</p>

                    <div className="space-y-3">
                      {/* 记录并删除 */}
                      <button
                        onClick={() => executeDeleteVideo(deleteConfirmVideo.bvid, true)}
                        className="w-full py-3 bg-cyber-lime text-black font-medium rounded-xl hover:bg-cyber-lime/90 transition-colors flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                        </svg>
                        记录到学习日志
                      </button>

                      {/* 直接删除 - 红色 */}
                      <button
                        onClick={() => executeDeleteVideo(deleteConfirmVideo.bvid, false)}
                        className="w-full py-3 bg-red-500 text-white font-medium rounded-xl hover:bg-red-600 transition-colors"
                      >
                        直接删除
                      </button>
                    </div>
                  </div>
                </div>,
                document.body
              )}

              {/* 应用九宫格模态框 - Portal到body确保居中 */}
              {isAppsModalOpen && createPortal(
                <div
                  className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
                  onClick={(e) => { if (e.target === e.currentTarget) setIsAppsModalOpen(false); }}
                >
                  {/* 背景遮罩 */}
                  <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

                  {/* 模态框内容 */}
                  <div
                    className="relative w-full max-w-sm rounded-3xl overflow-hidden"
                    style={{
                      backgroundColor: 'rgba(20,20,25,0.95)',
                      backdropFilter: 'blur(20px)',
                      border: '1px solid rgba(163,230,53,0.2)',
                      animation: 'scaleIn 0.25s ease-out'
                    }}
                  >

                    {/* 标题 */}
                    <div className="px-6 pt-5 pb-4 flex items-center justify-between">
                      <h2 className="text-lg font-semibold text-white">应用</h2>
                      <button
                        onClick={() => setIsAppsModalOpen(false)}
                        className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
                      >
                        <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>

                    {/* 应用网格 */}
                    <div className="px-6 pb-8 grid grid-cols-3 gap-5">
                      {/* Reddit - 官方图标 */}
                      <button className="flex flex-col items-center gap-2 group" onClick={() => window.open('https://www.reddit.com', '_blank')}>
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform" style={{ backgroundColor: '#FF4500' }}>
                          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="white">
                            <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.34.34 0 0 1 .414-.261l2.92.615a1.248 1.248 0 0 1 1.057-.177z" />
                          </svg>
                        </div>
                        <span className="text-xs text-gray-400 group-hover:text-white transition-colors">Reddit</span>
                      </button>

                      {/* 知乎 - 官方图标 */}
                      <button className="flex flex-col items-center gap-2 group" onClick={() => window.open('https://www.zhihu.com', '_blank')}>
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform" style={{ backgroundColor: '#0066FF' }}>
                          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="white">
                            <path d="M5.378 15.503c.854 0 1.708.068 2.562.138.614.05 1.229.1 1.776.15l1.639 4.743c.273.819.341 1.092.682 1.092.41 0 .615-.41.615-.887 0-.341-.069-.683-.205-1.024l-1.57-4.232c1.432.069 2.865.137 4.298.137 1.706 0 2.593-.683 2.593-2.048V5.326c0-1.843-1.092-2.799-3.208-2.799H5.992C3.809 2.527 2.717 3.483 2.717 5.326v8.125c0 1.365.887 2.052 2.661 2.052zm0-10.72h8.739v8.601H5.378V4.783zm13.109 8.601c0 .41.341.683.751.683.41 0 .683-.341.683-.751V4.783c0-.41.273-.683.682-.683.41 0 .683.273.683.683v8.601c0 1.57-1.161 2.799-2.799 2.799-.41 0-.683-.273-.683-.683v-.068c.205 0 .41-.068.614-.205.069-.068.069-.136.069-.205v-1.638z" />
                          </svg>
                        </div>
                        <span className="text-xs text-gray-400 group-hover:text-white transition-colors">知乎</span>
                      </button>

                      {/* 小红书 - 官方图标 */}
                      <button className="flex flex-col items-center gap-2 group" onClick={() => window.open('https://www.xiaohongshu.com', '_blank')}>
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform" style={{ backgroundColor: '#FE2C55' }}>
                          <svg className="w-10 h-10" viewBox="0 0 1024 1024" fill="white">
                            <path d="M211.5 358.5c0 0 49-65 149-65 59 0 71.5 28.5 71.5 28.5s-5.5-23-45.5-62.5c-44-43.5-31-89-31-89s32-9 66.5 23c22.5 21 39 52 46.5 86.5 6-39.5 26.5-121 82.5-142 66-24.5 96.5 2 96.5 2s-31.5 13-43 64c-11 48.5 1 106 1 106s82-27.5 130 19c62 60 41 155.5 41 155.5s92.5 12 119 72.5c24 55 10 103 10 103s-8.5 17-27 20c-15.5 2.5-19.5-6-27.5-25-10.5-24.5-54-46.5-54-46.5s-23 105.5-64 163c-39 54.5-98.5 72.5-131.5 76-85.5 9-106-44.5-106-44.5s-24 55-108 50.5c-97-5-115.5-70-115.5-70S77 826.5 64 772.5c-7-29.5 18-36.5 36.5-36 19 .5 21.5 13 22 20.5 1.5 29.5 23 75.5 75.5 84.5 48.5 8 72-13.5 76-32.5 3-13.5-10-27-24.5-35-51.5-28.5-88-82.5-89-142.5-.5-30.5 7-60.5 18.5-86.5-30.5 8.5-67 29.5-80.5 67-15 41.5-9.5 54-9.5 54s-26.5 1-35.5-22.5c-5.5-14-3.5-29-3.5-29s-4.5-75.5 48.5-138c41.5-49 112.5-118 112.5-118zm320.5 107c0 0-33-8-47.5 34.5-20.5 60.5 5 137.5 5 137.5s38-16 57.5-65.5c15-38.5-15-106.5-15-106.5z" />
                          </svg>
                        </div>
                        <span className="text-xs text-gray-400 group-hover:text-white transition-colors">小红书</span>
                      </button>

                      {/* 百度贴吧 - 官方图标 */}
                      <button className="flex flex-col items-center gap-2 group" onClick={() => window.open('https://tieba.baidu.com', '_blank')}>
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform" style={{ backgroundColor: '#4A90E2' }}>
                          <svg className="w-10 h-10" viewBox="0 0 1024 1024" fill="white">
                            <path d="M497.6 150.4c-97.6 0-185.6 30.4-230.4 75.2v25.6h52.8c115.2 0 166.4 56 166.4 121.6 0 54.4-44.8 113.6-136 123.2-12.8 1.6-14.4 3.2-14.4 4.8 0 1.6 3.2 4.8 9.6 4.8 24 0 76.8 0 108.8 3.2 44.8 4.8 73.6 20.8 91.2 51.2 12.8 22.4 17.6 51.2 16 86.4h112v-104c0-22.4 17.6-40 40-40h96V193.6c-67.2-27.2-184-43.2-312-43.2zM216 289.6V560h80c75.2 0 120 28.8 120 73.6 0 19.2-9.6 35.2-40 56-27.2 19.2-80 30.4-150.4 30.4H176C78.4 720 0 641.6 0 544V292.8c30.4-14.4 76.8-24 128-24 35.2 0 65.6 3.2 88 20.8z m564.8 0V464h206.4c19.2-25.6 33.6-59.2 33.6-100.8 0-41.6-9.6-76.8-28.8-100.8-27.2-36.8-84.8-59.2-156.8-59.2-19.2 0-36.8 1.6-54.4 4.8V289.6z m-126.4 73.6v96h62.4c65.6 0 104-32 104-81.6 0-33.6-20.8-57.6-67.2-57.6h-59.2c-22.4 0-40 19.2-40 43.2z m206.4 196.8h-72v160h176c12.8 0 25.6-3.2 36.8-8-1.6-38.4-12.8-67.2-32-88-25.6-27.2-64-46.4-108.8-64z" />
                          </svg>
                        </div>
                        <span className="text-xs text-gray-400 group-hover:text-white transition-colors">贴吧</span>
                      </button>

                      {/* Obsidian - 官方图标 */}
                      <button className="flex flex-col items-center gap-2 group" onClick={() => window.open('https://obsidian.md', '_blank')}>
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform" style={{ backgroundColor: '#7C3AED' }}>
                          <svg className="w-9 h-9" viewBox="0 0 500 500" fill="white">
                            <path d="M 218.667 0 C 218.667 0 167.318 64.922 138.646 117.812 C 109.974 170.703 68.646 226.042 35.833 286.979 C 2.99 347.917 0.005 353.125 0.005 353.125 L 75.005 470.833 L 138.026 500 L 297.385 464.583 L 386.411 381.25 L 366.667 186.458 L 294.021 78.646 L 218.667 0 Z" />
                          </svg>
                        </div>
                        <span className="text-xs text-gray-400 group-hover:text-white transition-colors">Obsidian</span>
                      </button>

                      {/* LinuxDo - Linux Penguin 图标 */}
                      <button className="flex flex-col items-center gap-2 group" onClick={() => window.open('https://linux.do', '_blank')}>
                        <div className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg group-hover:scale-110 transition-transform" style={{ backgroundColor: '#F1592A' }}>
                          <svg className="w-10 h-10" viewBox="0 0 24 24" fill="white">
                            <path d="M12 0c-4.97 0-9 4.03-9 9 0 2.27.85 4.34 2.25 5.92-.48 2.05-1.57 3.55-3.08 4.35 1.48 2.12 4.19 3.73 7.82 3.73s6.34-1.61 7.82-3.73c-1.51-.8-2.6-2.3-3.08-4.35C19.15 13.34 20 11.27 20 9c0-4.97-4.03-9-9-9zM7.5 7c.83 0 1.5.67 1.5 1.5S8.33 10 7.5 10 6 9.33 6 8.5 6.67 7 7.5 7zm9 0c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5-1.5-.67-1.5-1.5.67-1.5 1.5-1.5z" />
                          </svg>
                        </div>
                        <span className="text-xs text-gray-400 group-hover:text-white transition-colors">LinuxDo</span>
                      </button>
                    </div>
                  </div>

                  <style>{`
              @keyframes scaleIn {
                from { transform: scale(0.9); opacity: 0; }
                to { transform: scale(1); opacity: 1; }
              }
            `}</style>
                </div>,
                document.body
              )}

              {/* 视频内容 */}
              {(activeTab === 'home' || activeTab === 'watchLater') && (
                <>
                  {/* 搜索结果提示 */}
                  {searchTerm && (
                    <div className="mb-4 flex items-center justify-between">
                      <p className="text-sm text-gray-400">
                        {activeTab === 'watchLater' ? '待看列表中' : ''}搜索 "<span className="text-cyber-lime">{searchTerm}</span>"
                        <span className="ml-1">找到 <span className="text-white font-medium">{filteredVideos.length}</span> 个结果</span>
                      </p>
                      <button
                        onClick={() => setSearchTerm('')}
                        className="text-xs text-gray-500 hover:text-white transition-colors"
                      >
                        清除搜索
                      </button>
                    </div>
                  )}

                  {/* PC端：轮播图和快捷入口左右排布 */}
                  {activeTab === 'home' && !searchTerm && (
                    <div className="flex flex-col lg:flex-row lg:gap-6 mb-6">
                      {/* 热门轮播图 - PC端占 70% */}
                      {activeFilter === 'all' && videos.length > 0 && (
                        <div className="lg:w-[70%] lg:shrink-0">
                          <Suspense fallback={<SimpleLoader />}>
                            <HotCarousel videos={hotVideos} />
                          </Suspense>
                        </div>
                      )}

                      {/* 快捷入口 - PC端占 30%，网格布局 */}
                      <div className="mt-4 lg:mt-0 lg:flex-1">
                        {/* 标题 - 仅PC端显示，用于对齐 */}
                        <div className="hidden lg:flex items-center gap-2 mb-3">
                          <svg className="w-4 h-4 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="3" y="3" width="7" height="7" rx="1" />
                            <rect x="14" y="3" width="7" height="7" rx="1" />
                            <rect x="3" y="14" width="7" height="7" rx="1" />
                            <rect x="14" y="14" width="7" height="7" rx="1" />
                          </svg>
                          <span className="text-sm font-semibold text-white">快捷访问</span>
                        </div>

                        <div className="flex overflow-x-auto snap-x snap-mandatory gap-4 pb-1 -mx-4 px-4 [&::-webkit-scrollbar]:hidden [scrollbar-width:none] lg:grid lg:grid-cols-2 lg:gap-x-4 lg:gap-y-1 lg:content-start lg:overflow-visible lg:mx-0 lg:px-0 lg:snap-none">
                          {/* 收藏夹 */}
                          <button
                            onClick={() => { subPageSourceRef.current = 'home'; setSettingsInitialView('collector'); setActiveTab('settings'); }}
                            className="group relative flex flex-col items-center gap-1.5 py-1 shrink-0 snap-start min-w-[64px] active:scale-95 transition-transform
                                       lg:flex-row lg:items-center lg:gap-2 lg:min-w-0 lg:shrink lg:py-0 lg:h-9 lg:px-3 lg:rounded-md lg:hover:bg-white/[0.04] lg:active:scale-[0.98] lg:transition-colors"
                          >
                            <span className="relative w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 shadow-lg shadow-cyan-500/25 flex items-center justify-center
                                             lg:w-auto lg:h-auto lg:rounded-none lg:bg-none lg:shadow-none">
                              <svg className="w-5 h-5 text-white lg:w-[18px] lg:h-[18px] lg:text-gray-400 lg:group-hover:text-cyan-400 lg:transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                              </svg>
                              {collectedCount > 0 && (
                                <span className="lg:hidden absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-cyber-dark">
                                  {collectedCount > 99 ? '99+' : collectedCount}
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] font-medium text-gray-300 lg:text-sm lg:font-semibold lg:group-hover:text-cyan-400 lg:transition-colors">收藏</span>
                            {collectedCount > 0 && (
                              <span className="hidden lg:inline-flex items-center justify-center ml-auto min-w-[18px] h-[18px] px-1 bg-cyan-500/15 text-cyan-300 rounded-full text-[10px] font-bold">
                                {collectedCount > 99 ? '99+' : collectedCount}
                              </span>
                            )}
                          </button>

                          {/* 提醒 */}
                          <button
                            onClick={() => { subPageSourceRef.current = 'home'; setSettingsInitialView('reminder'); setActiveTab('settings'); }}
                            className="group relative flex flex-col items-center gap-1.5 py-1 shrink-0 snap-start min-w-[64px] active:scale-95 transition-transform
                                       lg:flex-row lg:items-center lg:gap-2 lg:min-w-0 lg:shrink lg:py-0 lg:h-9 lg:px-3 lg:rounded-md lg:hover:bg-white/[0.04] lg:active:scale-[0.98] lg:transition-colors"
                          >
                            <span className="relative w-12 h-12 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 shadow-lg shadow-amber-500/25 flex items-center justify-center
                                             lg:w-auto lg:h-auto lg:rounded-none lg:bg-none lg:shadow-none">
                              <svg className="w-5 h-5 text-white lg:w-[18px] lg:h-[18px] lg:text-gray-400 lg:group-hover:text-amber-400 lg:transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              {reminderCount > 0 && (
                                <span className="lg:hidden absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-cyber-dark">
                                  {reminderCount > 99 ? '99+' : reminderCount}
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] font-medium text-gray-300 lg:text-sm lg:font-semibold lg:group-hover:text-amber-400 lg:transition-colors">提醒</span>
                            {reminderCount > 0 && (
                              <span className="hidden lg:inline-flex items-center justify-center ml-auto min-w-[18px] h-[18px] px-1 bg-amber-500/15 text-amber-300 rounded-full text-[10px] font-bold">
                                {reminderCount > 99 ? '99+' : reminderCount}
                              </span>
                            )}
                          </button>

                          {/* TODO */}
                          <button
                            onClick={() => { subPageSourceRef.current = 'home'; setSettingsInitialView('todo'); setActiveTab('settings'); }}
                            className="group relative flex flex-col items-center gap-1.5 py-1 shrink-0 snap-start min-w-[64px] active:scale-95 transition-transform
                                       lg:flex-row lg:items-center lg:gap-2 lg:min-w-0 lg:shrink lg:py-0 lg:h-9 lg:px-3 lg:rounded-md lg:hover:bg-white/[0.04] lg:active:scale-[0.98] lg:transition-colors"
                          >
                            <span className="relative w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25 flex items-center justify-center
                                             lg:w-auto lg:h-auto lg:rounded-none lg:bg-none lg:shadow-none">
                              <svg className="w-5 h-5 text-white lg:w-[18px] lg:h-[18px] lg:text-gray-400 lg:group-hover:text-blue-400 lg:transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M9 11l3 3L22 4" />
                                <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
                              </svg>
                              {todoCount > 0 && (
                                <span className="lg:hidden absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-cyber-dark">
                                  {todoCount > 99 ? '99+' : todoCount}
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] font-medium text-gray-300 lg:text-sm lg:font-semibold lg:group-hover:text-blue-400 lg:transition-colors">待办</span>
                            {todoCount > 0 && (
                              <span className="hidden lg:inline-flex items-center justify-center ml-auto min-w-[18px] h-[18px] px-1 bg-blue-500/15 text-blue-300 rounded-full text-[10px] font-bold">
                                {todoCount > 99 ? '99+' : todoCount}
                              </span>
                            )}
                          </button>

                          {/* 笔记 */}
                          <button
                            onClick={() => { subPageSourceRef.current = 'home'; setIsNotesOpen(true); }}
                            className="group relative flex flex-col items-center gap-1.5 py-1 shrink-0 snap-start min-w-[64px] active:scale-95 transition-transform
                                       lg:flex-row lg:items-center lg:gap-2 lg:min-w-0 lg:shrink lg:py-0 lg:h-9 lg:px-3 lg:rounded-md lg:hover:bg-white/[0.04] lg:active:scale-[0.98] lg:transition-colors"
                            title="笔记"
                          >
                            <span className="relative w-12 h-12 rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-600 shadow-lg shadow-purple-500/25 flex items-center justify-center
                                             lg:w-auto lg:h-auto lg:rounded-none lg:bg-none lg:shadow-none">
                              <svg className="w-5 h-5 text-white lg:w-[18px] lg:h-[18px] lg:text-gray-400 lg:group-hover:text-purple-300 lg:transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                                <polyline points="14 2 14 8 20 8" />
                                <line x1="16" y1="13" x2="8" y2="13" />
                                <line x1="16" y1="17" x2="8" y2="17" />
                              </svg>
                              {notesCount > 0 && (
                                <span className="lg:hidden absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-cyber-dark">
                                  {notesCount > 99 ? '99+' : notesCount}
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] font-medium text-gray-300 lg:text-sm lg:font-semibold lg:group-hover:text-purple-300 lg:transition-colors">笔记</span>
                            {notesCount > 0 && (
                              <span className="hidden lg:inline-flex items-center justify-center ml-auto min-w-[18px] h-[18px] px-1 bg-purple-500/15 text-purple-300 rounded-full text-[10px] font-bold">
                                {notesCount > 99 ? '99+' : notesCount}
                              </span>
                            )}
                          </button>

                          {/* 音频转写 */}
                          <button
                            onClick={() => {
                              subPageSourceRef.current = 'home';
                              setSettingsInitialView('transcriber');
                              setActiveTab('settings');
                            }}
                            className="group relative flex flex-col items-center gap-1.5 py-1 shrink-0 snap-start min-w-[64px] active:scale-95 transition-transform
                                       lg:flex-row lg:items-center lg:gap-2 lg:min-w-0 lg:shrink lg:py-0 lg:h-9 lg:px-3 lg:rounded-md lg:hover:bg-white/[0.04] lg:active:scale-[0.98] lg:transition-colors"
                            title="音频转写"
                          >
                            <span className="relative w-12 h-12 rounded-full bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/25 flex items-center justify-center
                                             lg:w-auto lg:h-auto lg:rounded-none lg:bg-none lg:shadow-none">
                              <svg className="w-5 h-5 text-white lg:w-[18px] lg:h-[18px] lg:text-gray-400 lg:group-hover:text-violet-400 lg:transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                                <line x1="12" y1="19" x2="12" y2="23" />
                                <line x1="8" y1="23" x2="16" y2="23" />
                              </svg>
                            </span>
                            <span className="text-[11px] font-medium text-gray-300 lg:text-sm lg:font-semibold lg:group-hover:text-violet-400 lg:transition-colors">转写</span>
                          </button>

                          {/* 回收站 */}
                          <button
                            onClick={() => setIsRecycleBinOpen(true)}
                            className="group relative flex flex-col items-center gap-1.5 py-1 shrink-0 snap-start min-w-[64px] active:scale-95 transition-transform
                                       lg:flex-row lg:items-center lg:gap-2 lg:min-w-0 lg:shrink lg:py-0 lg:h-9 lg:px-3 lg:rounded-md lg:hover:bg-white/[0.04] lg:active:scale-[0.98] lg:transition-colors"
                            title="回收站"
                          >
                            <span className="relative w-12 h-12 rounded-full bg-gradient-to-br from-rose-400 to-pink-600 shadow-lg shadow-rose-500/25 flex items-center justify-center
                                             lg:w-auto lg:h-auto lg:rounded-none lg:bg-none lg:shadow-none">
                              <svg className="w-5 h-5 text-white lg:w-[18px] lg:h-[18px] lg:text-gray-400 lg:group-hover:text-rose-400 lg:transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <polyline points="3 6 5 6 21 6" />
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                                <line x1="10" y1="11" x2="10" y2="17" />
                                <line x1="14" y1="11" x2="14" y2="17" />
                              </svg>
                              {recycleBinCount > 0 && (
                                <span className="lg:hidden absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 bg-red-500 rounded-full text-[10px] font-bold text-white flex items-center justify-center ring-2 ring-cyber-dark">
                                  {recycleBinCount > 99 ? '99+' : recycleBinCount}
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] font-medium text-gray-300 lg:text-sm lg:font-semibold lg:group-hover:text-rose-400 lg:transition-colors">回收站</span>
                            {recycleBinCount > 0 && (
                              <span className="hidden lg:inline-flex items-center justify-center ml-auto min-w-[18px] h-[18px] px-1 bg-rose-500/15 text-rose-300 rounded-full text-[10px] font-bold">
                                {recycleBinCount > 99 ? '99+' : recycleBinCount}
                              </span>
                            )}
                          </button>

                          {/* 工作流 */}
                          <button
                            onClick={() => setIsDailyWorkflowOpen(true)}
                            className="group relative flex flex-col items-center gap-1.5 py-1 shrink-0 snap-start min-w-[64px] active:scale-95 transition-transform
                                       lg:flex-row lg:items-center lg:gap-2 lg:min-w-0 lg:shrink lg:py-0 lg:h-9 lg:px-3 lg:rounded-md lg:hover:bg-white/[0.04] lg:active:scale-[0.98] lg:transition-colors"
                            title="每日工作流"
                          >
                            <span className="relative w-12 h-12 rounded-full bg-gradient-to-br from-lime-400 to-emerald-500 shadow-lg shadow-lime-500/25 flex items-center justify-center
                                             lg:w-auto lg:h-auto lg:rounded-none lg:bg-none lg:shadow-none">
                              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className="w-5 h-5 text-white lg:w-[18px] lg:h-[18px] lg:text-gray-400 lg:group-hover:text-lime-400 lg:transition-colors">
                                <g fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">
                                  <path d="M3.375 7.5a3 3 0 1 0 6 0a3 3 0 0 0-6 0m11.25 11a3 3 0 1 0 6 0a3 3 0 0 0-6 0m-8.25-14V.75m0 9.75v12.75"/>
                                  <path d="M9.375 7.5h5.25a3 3 0 0 1 3 3v5"/>
                                </g>
                              </svg>
                            </span>
                            <span className="text-[11px] font-medium text-gray-300 lg:text-sm lg:font-semibold lg:group-hover:text-lime-400 lg:transition-colors">工作流</span>
                          </button>

                          {/* 应用 */}
                          <button
                            onClick={() => setIsAppsModalOpen(true)}
                            className="group relative flex flex-col items-center gap-1.5 py-1 shrink-0 snap-start min-w-[64px] active:scale-95 transition-transform
                                       lg:flex-row lg:items-center lg:gap-2 lg:min-w-0 lg:shrink lg:py-0 lg:h-9 lg:px-3 lg:rounded-md lg:hover:bg-white/[0.04] lg:active:scale-[0.98] lg:transition-colors"
                            title="应用"
                          >
                            <span className="relative w-12 h-12 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 shadow-lg shadow-emerald-500/25 flex items-center justify-center
                                             lg:w-auto lg:h-auto lg:rounded-none lg:bg-none lg:shadow-none">
                              <svg className="w-5 h-5 text-white lg:w-[18px] lg:h-[18px] lg:text-gray-400 lg:group-hover:text-cyber-lime lg:transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="3" y="3" width="7" height="7" rx="1.5" />
                                <rect x="14" y="3" width="7" height="7" rx="1.5" />
                                <rect x="3" y="14" width="7" height="7" rx="1.5" />
                                <rect x="14" y="14" width="7" height="7" rx="1.5" />
                              </svg>
                            </span>
                            <span className="text-[11px] font-medium text-gray-300 lg:text-sm lg:font-semibold lg:group-hover:text-cyber-lime lg:transition-colors">应用</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="space-y-3">
                    {/* 区块标题 */}
                    <h2 className="text-sm font-medium text-gray-400 flex items-center gap-2 mb-3">
                      <div className="w-1.5 h-1.5 bg-cyber-lime rounded-full" />
                      <span>{activeTab === 'watchLater' ? '待看列表' : '最新视频'}</span>
                      {!loading && (
                        <span className="text-cyber-lime text-xs">{filteredVideos.length}</span>
                      )}
                    </h2>

                    {/* 加载状态 - 仅在已登录时显示 */}
                    {loading && currentUser && <Loader text="正在加载视频..." />}

                    {/* 错误提示 */}
                    {error && (
                      <div className="text-center py-10 text-red-400">
                        <p>加载失败: {error}</p>
                        <button onClick={fetchVideos} className="mt-2 text-cyber-lime underline">重试</button>
                      </div>
                    )}

                    {/* 未登录CTA - 精美的登录提示 (仅在无视频缓存时显示) */}
                    {!loading && !currentUser && videos.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-20 px-6">
                        {/* 动画背景 */}
                        <div className="relative w-full max-w-sm">
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-64 h-64 rounded-full bg-gradient-to-br from-cyber-lime/20 to-cyan-500/10 blur-3xl animate-pulse"></div>
                          </div>

                          {/* 主要插画 */}
                          <div className="relative z-10 mb-8">
                            <svg viewBox="0 0 200 150" className="w-full h-48">
                              {/* 视频播放器框架 */}
                              <rect x="30" y="25" width="140" height="90" rx="12"
                                fill="none" stroke="url(#loginGrad)" strokeWidth="2" opacity="0.6">
                                <animate attributeName="opacity" values="0.6;1;0.6" dur="3s" repeatCount="indefinite" />
                              </rect>

                              {/* 播放按钮 */}
                              <circle cx="100" cy="70" r="25" fill="none" stroke="#a3e635" strokeWidth="2.5" opacity="0.5" />
                              <polygon points="92,60 92,80 112,70" fill="#a3e635" opacity="0.7">
                                <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
                              </polygon>

                              {/* 用户图标 */}
                              <circle cx="100" cy="120" r="15" fill="none" stroke="#22d3ee" strokeWidth="2" opacity="0.4" />
                              <path d="M100 115 Q100 110, 105 110 Q110 110, 110 115" stroke="#22d3ee" strokeWidth="2" fill="none" opacity="0.4" />
                              <circle cx="100" cy="108" r="3" fill="#22d3ee" opacity="0.4" />

                              {/* 浮动装饰 */}
                              <circle cx="50" cy="50" r="4" fill="#a3e635" opacity="0.5">
                                <animate attributeName="cy" values="50;45;50" dur="2s" repeatCount="indefinite" />
                              </circle>
                              <circle cx="150" cy="60" r="5" fill="#22d3ee" opacity="0.4">
                                <animate attributeName="cy" values="60;55;60" dur="2.5s" repeatCount="indefinite" />
                              </circle>
                              <rect x="160" y="90" width="8" height="8" rx="2" fill="#f472b6" opacity="0.3">
                                <animate attributeName="y" values="90;85;90" dur="2s" repeatCount="indefinite" />
                              </rect>

                              <defs>
                                <linearGradient id="loginGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                  <stop offset="0%" stopColor="#a3e635" />
                                  <stop offset="100%" stopColor="#22d3ee" />
                                </linearGradient>
                              </defs>
                            </svg>
                          </div>

                          {/* 文字内容 */}
                          <div className="relative z-10 text-center">
                            <h3 className="text-2xl font-bold text-white mb-3 bg-gradient-to-r from-cyber-lime via-cyan-400 to-blue-400 bg-clip-text text-transparent">
                              开始你的视频之旅
                            </h3>
                            <p className="text-gray-400 text-sm mb-8 leading-relaxed max-w-xs mx-auto">
                              登录后可以同步追踪你喜欢的 UP主，
                              <br />
                              永不错过精彩内容
                            </p>

                            {/* CTA按钮 */}
                            <button
                              onClick={() => setAuthExpired(true)}
                              className="group relative px-8 py-4 bg-gradient-to-r from-cyber-lime via-lime-400 to-cyan-400 rounded-2xl font-bold text-black
                                   shadow-[0_0_40px_rgba(163,230,53,0.5)] hover:shadow-[0_0_60px_rgba(163,230,53,0.7)]
                                   transition-all duration-300 hover:scale-105 active:scale-100
                                   overflow-hidden"
                            >
                              {/* 按钮内发光动画 */}
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent
                                      translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-1000" />

                              <span className="relative flex items-center gap-2 text-base">
                                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" />
                                  <polyline points="10 17 15 12 10 7" />
                                  <line x1="15" y1="12" x2="3" y2="12" />
                                </svg>
                                立即登录
                              </span>
                            </button>

                            {/* 特性列表 */}
                            <div className="mt-8 flex items-center justify-center gap-6 text-xs text-gray-500">
                              <div className="flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                                  <polyline points="22 4 12 14.01 9 11.01" />
                                </svg>
                                <span>云端同步</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-cyan-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
                                </svg>
                                <span>完全免费</span>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <svg className="w-4 h-4 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                                </svg>
                                <span>安全可靠</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* 空状态提示 - 已登录但无视频数据 */}
                    {!loading && !error && currentUser && videos.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 px-6">
                        {/* 插画 SVG */}
                        <div className="relative w-64 h-48 mb-8">
                          {/* 背景装饰圆 */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-40 h-40 rounded-full bg-gradient-to-br from-cyber-lime/10 to-cyan-500/10 blur-2xl"></div>
                          </div>

                          {/* 主体插画 */}
                          <svg viewBox="0 0 200 150" className="w-full h-full relative z-10">
                            {/* 视频播放器外框 */}
                            <rect x="40" y="30" width="120" height="80" rx="8"
                              fill="none" stroke="url(#emptyGrad)" strokeWidth="2" opacity="0.6" />

                            {/* 播放按钮 */}
                            <circle cx="100" cy="70" r="20" fill="none" stroke="#a3e635" strokeWidth="2" opacity="0.4" />
                            <polygon points="95,62 95,78 108,70" fill="#a3e635" opacity="0.6" />

                            {/* 装饰线条 */}
                            <line x1="50" y1="120" x2="150" y2="120" stroke="#374151" strokeWidth="2" strokeDasharray="8 4" />

                            {/* 浮动的小方块 */}
                            <rect x="25" y="50" width="12" height="12" rx="2" fill="#22d3ee" opacity="0.3">
                              <animate attributeName="y" values="50;45;50" dur="3s" repeatCount="indefinite" />
                            </rect>
                            <rect x="165" y="60" width="10" height="10" rx="2" fill="#a3e635" opacity="0.4">
                              <animate attributeName="y" values="60;55;60" dur="2.5s" repeatCount="indefinite" />
                            </rect>
                            <circle cx="30" cy="90" r="5" fill="#f472b6" opacity="0.3">
                              <animate attributeName="cy" values="90;85;90" dur="2s" repeatCount="indefinite" />
                            </circle>

                            {/* 渐变定义 */}
                            <defs>
                              <linearGradient id="emptyGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#a3e635" />
                                <stop offset="100%" stopColor="#22d3ee" />
                              </linearGradient>
                            </defs>
                          </svg>
                        </div>

                        {/* 文字内容 */}
                        <h3 className="text-xl font-bold text-white mb-2">开始你的视频之旅</h3>
                        <p className="text-gray-400 text-sm mb-6 text-center max-w-xs">
                          添加你喜欢的 UP主，我们会帮你追踪他们的最新更新
                        </p>



                      </div>
                    )}

                    {/* 筛选后无结果 / 待看列表为空 */}
                    {!loading && !error && videos.length > 0 && filteredVideos.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 px-6">
                        {/* 动态插画 */}
                        <div className="relative w-72 h-56 mb-6">
                          {/* 背景光晕 */}
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-48 h-48 rounded-full bg-gradient-to-br from-cyber-lime/10 to-cyan-500/5 blur-3xl animate-pulse"></div>
                          </div>

                          <svg viewBox="0 0 280 220" className="w-full h-full relative z-10">
                            <defs>
                              <linearGradient id="emptyGrad2" x1="0%" y1="0%" x2="100%" y2="100%">
                                <stop offset="0%" stopColor="#a3e635" />
                                <stop offset="100%" stopColor="#22d3ee" />
                              </linearGradient>
                              <filter id="glow2">
                                <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                <feMerge>
                                  <feMergeNode in="coloredBlur" />
                                  <feMergeNode in="SourceGraphic" />
                                </feMerge>
                              </filter>
                            </defs>

                            {activeTab === 'watchLater' ? (
                              <>
                                {/* 待看列表空状态 - 时钟主题 */}
                                <circle cx="140" cy="100" r="50" fill="none" stroke="url(#emptyGrad2)" strokeWidth="3" opacity="0.6" />
                                <circle cx="140" cy="100" r="42" fill="none" stroke="#374151" strokeWidth="1" strokeDasharray="4 4" />

                                {/* 时钟指针 */}
                                <line x1="140" y1="100" x2="140" y2="70" stroke="#a3e635" strokeWidth="3" strokeLinecap="round" filter="url(#glow2)">
                                  <animateTransform attributeName="transform" type="rotate" from="0 140 100" to="360 140 100" dur="10s" repeatCount="indefinite" />
                                </line>
                                <line x1="140" y1="100" x2="160" y2="100" stroke="#22d3ee" strokeWidth="2" strokeLinecap="round">
                                  <animateTransform attributeName="transform" type="rotate" from="0 140 100" to="360 140 100" dur="60s" repeatCount="indefinite" />
                                </line>
                                <circle cx="140" cy="100" r="5" fill="#a3e635" filter="url(#glow2)" />

                                {/* 书签装饰 */}
                                <path d="M200 60 L200 100 L215 85 L230 100 L230 60 Z" fill="none" stroke="#a3e635" strokeWidth="2" opacity="0.4">
                                  <animate attributeName="opacity" values="0.4;0.8;0.4" dur="2s" repeatCount="indefinite" />
                                </path>

                                {/* 浮动元素 */}
                                <rect x="60" y="70" width="16" height="16" rx="4" fill="#22d3ee" opacity="0.3">
                                  <animate attributeName="y" values="70;60;70" dur="3s" repeatCount="indefinite" />
                                </rect>
                                <circle cx="80" cy="140" r="6" fill="#f472b6" opacity="0.25">
                                  <animate attributeName="cy" values="140;130;140" dur="2.5s" repeatCount="indefinite" />
                                </circle>
                                <rect x="210" y="130" width="12" height="12" rx="2" fill="#a3e635" opacity="0.35">
                                  <animate attributeName="y" values="130;120;130" dur="2s" repeatCount="indefinite" />
                                </rect>
                              </>
                            ) : (
                              <>
                                {/* 搜索无结果 - 放大镜主题 */}
                                <circle cx="130" cy="90" r="40" fill="none" stroke="url(#emptyGrad2)" strokeWidth="3" opacity="0.6" />
                                <line x1="158" y1="118" x2="190" y2="150" stroke="url(#emptyGrad2)" strokeWidth="4" strokeLinecap="round" />

                                {/* 问号 */}
                                <text x="130" y="100" textAnchor="middle" fill="#a3e635" fontSize="32" fontWeight="bold" opacity="0.6">?</text>

                                {/* 浮动元素 */}
                                <rect x="70" y="50" width="14" height="14" rx="3" fill="#22d3ee" opacity="0.3">
                                  <animate attributeName="y" values="50;40;50" dur="2.5s" repeatCount="indefinite" />
                                </rect>
                                <circle cx="200" cy="70" r="8" fill="#f472b6" opacity="0.25">
                                  <animate attributeName="cy" values="70;60;70" dur="3s" repeatCount="indefinite" />
                                </circle>
                                <rect x="180" y="140" width="10" height="10" rx="2" fill="#a3e635" opacity="0.35">
                                  <animate attributeName="y" values="140;130;140" dur="2s" repeatCount="indefinite" />
                                </rect>
                              </>
                            )}

                            {/* 底部装饰线 */}
                            <line x1="80" y1="190" x2="200" y2="190" stroke="#374151" strokeWidth="2" strokeDasharray="8 4" opacity="0.5" />
                            <circle cx="90" cy="190" r="3" fill="#a3e635" opacity="0.6" />
                            <circle cx="190" cy="190" r="3" fill="#22d3ee" opacity="0.6" />
                          </svg>
                        </div>

                        {/* 文字内容 */}
                        <h3 className="text-xl font-bold text-white mb-2">
                          {activeTab === 'watchLater'
                            ? '暂无待看视频'
                            : searchTerm
                              ? '没有找到相关视频'
                              : '当前筛选无结果'}
                        </h3>
                        <p className="text-gray-400 text-sm mb-6 text-center max-w-xs leading-relaxed">
                          {activeTab === 'watchLater'
                            ? '长按视频卡片可以快速添加到待看列表，开始收藏你感兴趣的内容吧'
                            : searchTerm
                              ? `未找到与"${searchTerm}"相关的视频，试试其他关键词`
                              : '调整筛选条件或切换时间范围查看更多'}
                        </p>

                        {/* 操作按钮 */}
                        {activeTab === 'watchLater' ? (
                          <button
                            onClick={() => setActiveTab('home')}
                            className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-400 text-white font-medium rounded-full 
                                 shadow-[0_0_20px_rgba(37,99,235,0.4)] hover:shadow-[0_0_30px_rgba(37,99,235,0.6)]
                                 transition-all hover:scale-105 active:scale-95"
                          >
                            去发现视频
                          </button>
                        ) : searchTerm ? (
                          <button
                            onClick={() => setSearchTerm('')}
                            className="px-6 py-2.5 bg-white/10 text-white font-medium rounded-full border border-white/20
                                 hover:bg-white/20 transition-all"
                          >
                            清除搜索
                          </button>
                        ) : (
                          <button
                            onClick={() => setActiveFilter('all')}
                            className="px-6 py-2.5 bg-white/10 text-white font-medium rounded-full border border-white/20
                                 hover:bg-white/20 transition-all"
                          >
                            查看全部
                          </button>
                        )}
                      </div>
                    )}

                    {/* 视频列表 */}
                    {!loading && filteredVideos.length > 0 && (
                      <div>
                        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-4 gap-x-2 gap-y-4 md:gap-x-3 md:gap-y-5 lg:gap-x-4 lg:gap-y-6">
                          {filteredVideos.slice(0, visibleCount).map((video) => (
                            <VideoCard
                              key={video.bvid}
                              video={video}
                              onAddToWatchlist={toggleWatchLater}
                              onRemoveFromWatchlist={toggleWatchLater}
                              isInWatchlist={watchLaterIds.has(video.bvid)}
                              openMenuId={openMenuId}
                              onMenuToggle={setOpenMenuId}
                              onDelete={(bvid) => executeDeleteVideo(bvid, false)}
                              onDeleteWithLog={(bvid, title) => executeDeleteVideo(bvid, true)}
                              onTranscript={handleTranscript}
                              onAISummary={(bvid, title) => setAiSummaryVideo({ bvid, title })}
                            />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Loading / End indicator */}
                    {!loading && filteredVideos.length > 0 && (
                      <div className="pt-8 pb-24 flex justify-center">
                        {visibleCount < filteredVideos.length ? (
                          <div className="w-6 h-6 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                          <div className="flex flex-col items-center gap-3">
                            <p className="text-gray-500 text-sm">没有更多视频了，去看看 RSS 吧 ✨</p>
                            <button
                              onClick={() => setActiveTab('rss')}
                              className="px-4 py-2 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-blue-500/30 rounded-full text-blue-400 text-sm font-medium hover:from-blue-500/30 hover:to-cyan-500/30 transition-all flex items-center gap-2"
                            >
                              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M4 11a9 9 0 0 1 9 9" />
                                <path d="M4 4a16 16 0 0 1 16 16" />
                                <circle cx="5" cy="19" r="1" fill="currentColor" />
                              </svg>
                              去看 RSS 订阅
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          </main>
        </div>

        {/* 页面切换动画样式 */}
        <style>{`
        @keyframes page-fade-in {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
        .animate-page-fade-in {
          animation: page-fade-in 0.3s ease-out;
        }
      `}</style>

        {/* PC 侧边栏导航 - YouTube 风格 */}
        <nav className="hidden lg:flex fixed left-0 top-0 bottom-0 w-56 bg-[#0f0f0f] border-r border-white/5 flex-col py-3 z-50 overflow-y-auto no-scrollbar">
          {/* Logo */}
          <div className="px-4 py-2 mb-2">
            <div className="flex items-center gap-2">
              <img src={LogoSvg} alt="FluxF" className="w-8 h-8" />
              <span className="text-white font-bold text-lg">FluxF</span>
            </div>
          </div>

          {/* 主导航 */}
          <div className="px-2 space-y-1">
            {/* 首页 */}
            <button
              onClick={() => setActiveTab('home')}
              className={`w-full flex items-center gap-5 px-3 py-2.5 rounded-xl transition-all ${activeTab === 'home' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                }`}
            >
              <HomeIcon className="w-5 h-5" />
              <span className="text-sm font-medium">首页</span>
            </button>

            {/* 待看 */}
            <button
              onClick={() => setActiveTab('watchLater')}
              className={`w-full flex items-center gap-5 px-3 py-2.5 rounded-xl transition-all ${activeTab === 'watchLater' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                }`}
            >
              <ClockIcon className="w-5 h-5" />
              <span className="text-sm font-medium">待看列表</span>
            </button>

            {/* RSS */}
            <button
              onClick={() => setActiveTab('rss')}
              className={`w-full flex items-center gap-5 px-3 py-2.5 rounded-xl transition-all ${activeTab === 'rss' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 11a9 9 0 0 1 9 9" />
                <path d="M4 4a16 16 0 0 1 16 16" />
                <circle cx="5" cy="19" r="1" fill="currentColor" />
              </svg>
              <span className="text-sm font-medium">RSS 订阅</span>
            </button>
          </div>

          {/* 分隔线 */}
          <div className="my-3 mx-4 border-t border-white/10" />

          {/* 工具区 */}
          <div className="px-2 space-y-1">
            <p className="px-3 py-2 text-xs text-gray-500 font-medium">工具</p>

            {/* 添加UP主 */}
            <button
              onClick={() => setIsAddUploaderOpen(true)}
              className="w-full flex items-center gap-5 px-3 py-2.5 rounded-xl text-gray-400 hover:bg-white/5 transition-all"
            >
              <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="16" />
                <line x1="8" y1="12" x2="16" y2="12" />
              </svg>
              <span className="text-sm font-medium">添加 UP主</span>
            </button>

            {/* 设置 */}
            <button
              onClick={() => { settingsSourceRef.current = activeTab !== 'settings' ? activeTab : 'home'; subPageSourceRef.current = settingsSourceRef.current; setSettingsInitialView('main'); setActiveTab('settings'); }}
              className={`w-full flex items-center gap-5 px-3 py-2.5 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-white/10 text-white' : 'text-gray-400 hover:bg-white/5'
                }`}
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
              <span className="text-sm font-medium">设置</span>
            </button>
          </div>
        </nav>

        {/* 移动端底部导航 - lg 以下显示 */}
        <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-[#0a0a0f] border-t border-white/10 pb-safe pt-2 px-4 z-50 h-[80px]">
          <div className="flex justify-around items-center h-full max-w-lg mx-auto pb-4">
            {/* Discovery */}
            <button
              onClick={() => setActiveTab('home')}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'home' ? 'text-cyber-lime -translate-y-1' : 'text-gray-500'
                }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'home' ? 'bg-cyber-lime/10' : ''}`}>
                <HomeIcon className="w-5 h-5" />
              </div>
              <span className="text-[9px] font-medium">Discovery</span>
            </button>

            {/* Pending (待看视频) */}
            <button
              onClick={() => setActiveTab('watchLater')}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'watchLater' ? 'text-cyber-lime -translate-y-1' : 'text-gray-500'
                }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'watchLater' ? 'bg-cyber-lime/10' : ''}`}>
                <ClockIcon className="w-5 h-5" />
              </div>
              <span className="text-[9px] font-medium">Pending</span>
            </button>

            {/* 中间加号按钮 */}
            <button
              onClick={() => setIsAddUploaderOpen(true)}
              className="w-12 h-12 rounded-full bg-gradient-to-tr from-cyber-lime to-cyan-400 flex items-center justify-center -translate-y-4 shadow-[0_0_20px_rgba(163,230,53,0.4)] border-4 border-cyber-dark hover:scale-110 active:scale-95 transition-transform"
            >
              <div className="text-black font-bold text-xl">+</div>
            </button>

            {/* RSS 订阅 */}
            <button
              onClick={() => setActiveTab('rss')}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'rss' ? 'text-cyber-lime -translate-y-1' : 'text-gray-500'
                }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'rss' ? 'bg-cyber-lime/10' : ''}`}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 11a9 9 0 0 1 9 9" />
                  <path d="M4 4a16 16 0 0 1 16 16" />
                  <circle cx="5" cy="19" r="1" fill="currentColor" />
                </svg>
              </div>
              <span className="text-[9px] font-medium">RSS</span>
            </button>

            {/* 设置 */}
            <button
              onClick={() => { settingsSourceRef.current = activeTab !== 'settings' ? activeTab : 'home'; subPageSourceRef.current = settingsSourceRef.current; setSettingsInitialView('main'); setActiveTab('settings'); }}
              className={`flex flex-col items-center gap-1 transition-all duration-300 ${activeTab === 'settings' ? 'text-cyber-lime -translate-y-1' : 'text-gray-500'
                }`}
            >
              <div className={`p-1.5 rounded-xl transition-all ${activeTab === 'settings' ? 'bg-cyber-lime/10' : ''}`}>
                <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
                </svg>
              </div>
              <span className="text-[9px] font-medium">Setting</span>
            </button>
          </div>
        </nav>

        {/* 热力图日历 - 查看视频分布 */}
        <CustomDatePicker
          isOpen={isCalendarOpen}
          onClose={() => setIsCalendarOpen(false)}
          currentFilter={customDateFilter}
          videos={videos}
          onApply={(filter) => {
            setCustomDateFilter(filter);
            setActiveFilter('custom');
          }}
        />

        {/* 时间筛选器 */}
        <DateFilterPicker
          isOpen={isFilterOpen}
          onClose={() => setIsFilterOpen(false)}
          currentFilter={customDateFilter}
          onApply={(filter) => {
            setCustomDateFilter(filter);
            setActiveFilter('custom');
          }}
        />

        {/* 策展悬浮球 - 全局显示，支持拖动 */}
        {activeTab !== 'settings' && (
          <Suspense fallback={null}>
            <InsightFloatingBall
              isLoading={insightLoading}
              isDone={insightDone}
              onClick={() => {
                setSettingsInitialView('main');
                setActiveTab('settings');
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent('navigate-to-insights'));
                }, 100);
              }}
              color="green"
              storageKey="insight-ball-pos"
            />
          </Suspense>
        )}

        {/* Toast 提示 - 右上角毛玻璃 macOS 风格 */}
        {toast && (
          <div className="fixed top-4 right-4 z-50 animate-notify-in">
            <div className="relative px-4 py-3 rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
              {/* 毛玻璃背景层 */}
              <div className="absolute inset-0 bg-black/60 backdrop-blur-xl" />
              {/* 文字层 - 不模糊 */}
              <div className="relative flex items-center gap-2">
                <span className="text-cyber-lime">✓</span>
                <span className="text-white text-sm font-medium">{toast}</span>
              </div>
            </div>
          </div>
        )}

        {/* 添加UP主弹窗 */}
        <Suspense fallback={null}>
          <AddUploaderModal
            isOpen={isAddUploaderOpen}
            onClose={() => setIsAddUploaderOpen(false)}
            onSuccess={() => {
              showToast('UP主添加成功');
            }}
          />
        </Suspense>

        {/* TODO 待办事项 */}
        <Suspense fallback={null}>
          <TodoList
            isOpen={isTodoOpen}
            onClose={() => setIsTodoOpen(false)}
          />
        </Suspense>

        {/* 设置/个人中心 */}
        <Suspense fallback={null}>
          <SettingsModal
            isOpen={isSettingsOpen}
            onClose={() => setIsSettingsOpen(false)}
            onLogout={handleLogout}
            watchLaterIds={watchLaterIds}
            onToggleWatchLater={toggleWatchLater}
          />
        </Suspense>

        {/* 时间轴 */}
        {showTimeline && (
          <Suspense fallback={<SimpleLoader />}>
            <VideoTimeline
              videos={videos}
              onClose={() => setShowTimeline(false)}
              watchLaterIds={watchLaterIds}
              onToggleWatchLater={toggleWatchLater}
              onDelete={handleDeleteVideo}
            />
          </Suspense>
        )}

        {/* UP主选择器弹窗 */}
        {isUploaderPickerOpen && (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
            onClick={() => { setIsUploaderPickerOpen(false); setUploaderSearchTerm(''); }}
          >
            <div
              className="w-full max-w-lg bg-cyber-card rounded-t-3xl border-t border-white/10 max-h-[70vh] flex flex-col animate-slide-up relative overflow-hidden"
              onClick={e => e.stopPropagation()}
            >
              {/* 顶部光晕背景 - 全宽渐变 */}
              <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-cyber-lime/20 to-transparent pointer-events-none" />
              {/* 标题栏 */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
                <h3 className="text-white font-bold text-lg">选择 UP主</h3>
                <button
                  onClick={() => { setIsUploaderPickerOpen(false); setUploaderSearchTerm(''); }}
                  className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-gray-400 hover:bg-white/20"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>

              {/* 搜索框 */}
              <div className="px-4 py-3">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.35-4.35" />
                  </svg>
                  <input
                    type="text"
                    placeholder="搜索 UP主..."
                    value={uploaderSearchTerm}
                    onChange={e => setUploaderSearchTerm(e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50"
                  />
                </div>
              </div>

              {/* UP主列表 */}
              <div className="flex-1 overflow-y-auto px-4 pb-4">
                {filteredUploaders.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    {uploaderSearchTerm ? '未找到匹配的 UP主' : '暂无 UP主数据'}
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredUploaders.map(uploader => (
                      <button
                        key={uploader.mid}
                        onClick={() => {
                          setSelectedUploader({ mid: uploader.mid, name: uploader.name });
                          setIsUploaderPickerOpen(false);
                          setUploaderSearchTerm('');
                          mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all ${selectedUploader?.mid === uploader.mid
                          ? 'bg-violet-500/20 border border-violet-500/30'
                          : 'bg-white/5 border border-transparent hover:bg-white/10'
                          }`}
                      >
                        {uploader.face ? (
                          <img
                            src={uploader.face.replace('http:', 'https:')}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="w-10 h-10 rounded-full object-cover"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-violet-500 to-purple-500 flex items-center justify-center text-white font-bold">
                            {uploader.name[0]}
                          </div>
                        )}
                        <div className="flex-1 text-left min-w-0">
                          <p className="text-white font-medium text-sm truncate">{uploader.name}</p>
                          <div className="flex items-center justify-between gap-2 mt-0.5 whitespace-nowrap overflow-hidden">
                            <p className="text-gray-500 text-[10px] font-mono shrink-0">
                              MID: {uploader.mid.toString().length > 10
                                ? `${uploader.mid.toString().slice(0, 10)}...`
                                : uploader.mid}
                            </p>
                            <p className="text-gray-500 text-[10px] shrink-0">{uploader.count} 个视频</p>
                          </div>
                        </div>
                        {selectedUploader?.mid === uploader.mid && (
                          <svg className="w-5 h-5 text-violet-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <style>{`
            @keyframes slide-up {
              from { transform: translateY(100%); }
              to { transform: translateY(0); }
            }
            .animate-slide-up {
              animation: slide-up 0.3s ease-out;
            }
          `}</style>
          </div>
        )}

        {/* 时间筛选下拉框 - 使用 Portal 渲染到 body */}
        {isTimeFilterOpen && (
          <>
            {/* 透明遮罩 */}
            <div
              className="fixed inset-0 z-[9998]"
              onClick={() => setIsTimeFilterOpen(false)}
            />
            {/* 下拉菜单 */}
            <div
              className="fixed z-[9999] bg-[#1a1a1a] rounded-xl border border-white/20 overflow-hidden shadow-2xl"
              style={{
                top: `${timeFilterPos.top}px`,
                left: `${timeFilterPos.left}px`,
                minWidth: `${timeFilterPos.width}px`,
              }}
            >
              {[
                { id: 'today', label: '今天' },
                { id: 'week', label: '本周' },
                { id: 'month', label: '本月' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setActiveFilter(item.id as FilterType);
                    setIsTimeFilterOpen(false);
                    mainRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                  className={`w-full px-5 py-2.5 text-left text-xs transition-colors flex items-center gap-2 ${activeFilter === item.id
                    ? 'bg-cyber-lime/20 text-cyber-lime'
                    : 'text-gray-300 hover:bg-white/10'
                    }`}
                >
                  <span>{item.label}</span>
                  {activeFilter === item.id && (
                    <svg className="w-3 h-3 ml-auto text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </PullToRefresh>
    </>
  );
};

export default App;
