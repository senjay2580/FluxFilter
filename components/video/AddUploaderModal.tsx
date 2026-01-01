import React, { useState, useCallback, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { getUploaderInfo } from '../../lib/bilibili';
import { detectPlatform, resolveYouTubeChannel, YouTubeChannel } from '../../lib/youtube';
import { getStoredUserId } from '../../lib/auth';
import { invalidateCache, CACHE_KEYS } from '../../lib/cache';

interface AddUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface BilibiliUploaderInfo {
  mid: number;
  name: string;
  face: string;
  sign: string;
}

type Platform = 'bilibili' | 'youtube';
type UploaderInfo = (BilibiliUploaderInfo & { platform: 'bilibili' }) | (YouTubeChannel & { platform: 'youtube' });

const AddUploaderModal: React.FC<AddUploaderModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [input, setInput] = useState('');
  const [uploaderInfo, setUploaderInfo] = useState<UploaderInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [detectedPlatform, setDetectedPlatform] = useState<Platform | 'unknown'>('unknown');

  // 自动检测平台
  useEffect(() => {
    if (input.trim()) {
      const platform = detectPlatform(input);
      setDetectedPlatform(platform);
    } else {
      setDetectedPlatform('unknown');
    }
  }, [input]);

  // 获取UP主/频道信息
  const fetchUploaderInfo = useCallback(async () => {
    const trimmedInput = input.trim();
    if (!trimmedInput) {
      setError('请输入链接或ID');
      return;
    }

    setFetching(true);
    setError(null);
    setUploaderInfo(null);

    const platform = detectPlatform(trimmedInput);

    try {
      if (platform === 'bilibili') {
        // B站处理逻辑
        let mid = trimmedInput;
        
        // 支持从 "UID:367877" 或 "UID：367877" 格式提取数字
        const uidMatch = trimmedInput.match(/UID[：:]\s*(\d+)/i);
        if (uidMatch) {
          mid = uidMatch[1];
        }
        // 支持从 space.bilibili.com/367877 链接提取
        const urlMatch = trimmedInput.match(/space\.bilibili\.com\/(\d+)/);
        if (urlMatch) {
          mid = urlMatch[1];
        }

        const midNum = parseInt(mid);
        if (isNaN(midNum) || midNum <= 0) {
          setError('请输入有效的 B站 MID');
          return;
        }

        const info = await getUploaderInfo(midNum);
        setUploaderInfo({ ...info, platform: 'bilibili' });
      } else if (platform === 'youtube') {
        // YouTube 处理逻辑
        const channel = await resolveYouTubeChannel(trimmedInput);
        if (!channel) {
          setError('未找到该 YouTube 频道，请检查链接或ID是否正确');
          return;
        }
        setUploaderInfo({ ...channel, platform: 'youtube' });
      } else {
        setError('无法识别平台，请输入 B站空间链接/MID 或 YouTube 频道链接');
      }
    } catch (err: any) {
      console.error('获取信息失败:', err);
      setError(err?.message || '获取信息失败，请检查输入是否正确');
    } finally {
      setFetching(false);
    }
  }, [input]);

  // 提交添加
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!uploaderInfo) {
      setError('请先获取UP主/频道信息');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const userId = getStoredUserId();
      if (!userId) {
        setError('请先登录');
        return;
      }

      const insertData: any = {
        user_id: userId,
        platform: uploaderInfo.platform,
        is_active: true
      };

      if (uploaderInfo.platform === 'bilibili') {
        insertData.mid = uploaderInfo.mid;
        insertData.name = uploaderInfo.name;
        insertData.face = uploaderInfo.face;
        insertData.sign = uploaderInfo.sign;
      } else {
        insertData.channel_id = uploaderInfo.channelId;
        insertData.name = uploaderInfo.title;
        insertData.face = uploaderInfo.thumbnail;
        insertData.sign = uploaderInfo.description?.slice(0, 200) || '';
        insertData.mid = 0; // YouTube 不使用 mid，但字段可能有非空约束
      }

      const { error: insertError } = await supabase
        .from('uploader')
        .insert(insertData);

      if (insertError) {
        if (insertError.code === '23505') {
          setError(uploaderInfo.platform === 'bilibili' ? '该UP主已存在' : '该频道已存在');
        } else {
          throw insertError;
        }
        return;
      }

      // 成功
      setInput('');
      setUploaderInfo(null);
      setDetectedPlatform('unknown');

      // 使缓存失效
      invalidateCache(CACHE_KEYS.UPLOADERS(userId));

      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('添加失败:', err);
      setError('添加失败: ' + (err?.message || '请稍后重试'));
    } finally {
      setLoading(false);
    }
  };

  // 重置表单
  const handleClose = () => {
    setInput('');
    setUploaderInfo(null);
    setError(null);
    setDetectedPlatform('unknown');
    onClose();
  };

  if (!isOpen) return null;

  // 平台图标和颜色
  const platformConfig = {
    bilibili: {
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.659.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906L17.813 4.653zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773H5.333zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/>
        </svg>
      ),
      color: 'from-pink-500 to-pink-600',
      bgColor: 'bg-pink-500/20',
      borderColor: 'border-pink-500/30',
      textColor: 'text-pink-400',
      label: 'B站'
    },
    youtube: {
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
      color: 'from-red-500 to-red-600',
      bgColor: 'bg-red-500/20',
      borderColor: 'border-red-500/30',
      textColor: 'text-red-400',
      label: 'YouTube'
    }
  };

  const currentPlatformConfig = detectedPlatform !== 'unknown' ? platformConfig[detectedPlatform] : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={handleClose}
      style={{ WebkitFontSmoothing: 'antialiased', textRendering: 'optimizeLegibility' }}
    >
      <div
        className="w-full max-w-sm mx-4 bg-cyber-card backdrop-blur-xl border border-white/20 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        {/* 顶部光晕背景 */}
        <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-cyber-lime/20 to-transparent pointer-events-none z-0" />

        {/* 头部 */}
        <div className="px-5 py-4 border-b border-white/10 relative z-10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-cyber-lime drop-shadow-[0_0_8px_rgba(190,242,100,0.5)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            添加博主
          </h2>
          <p className="text-xs text-gray-500 mt-1">支持 B站 和 YouTube，自动识别平台</p>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* 输入框 */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5">
              链接或ID
              {currentPlatformConfig && (
                <span className={`ml-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] ${currentPlatformConfig.bgColor} ${currentPlatformConfig.textColor}`}>
                  {currentPlatformConfig.icon}
                  {currentPlatformConfig.label}
                </span>
              )}
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setUploaderInfo(null);
                  setError(null);
                }}
                placeholder="粘贴空间链接、频道链接或ID"
                className="flex-1 px-4 py-2.5 bg-white/[0.05] border border-white/20 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 focus:bg-white/[0.08] focus:ring-2 focus:ring-cyber-lime/20 transition-all"
              />
              <button
                type="button"
                onClick={fetchUploaderInfo}
                disabled={fetching || !input.trim()}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${fetching || !input.trim()
                  ? 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/10'
                  : 'bg-gradient-to-r from-cyan-500/80 to-blue-500/80 text-white hover:from-cyan-400 hover:to-blue-400 border border-cyan-400/30 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] hover:scale-105 active:scale-95'
                  }`}
              >
                {fetching ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" />
                  </svg>
                ) : '获取'}
              </button>
            </div>
            <p className="text-[10px] text-gray-500 mt-1.5">
              B站: space.bilibili.com/xxx 或 MID | YouTube: @handle 或频道链接
            </p>
          </div>

          {/* UP主/频道信息预览 */}
          {uploaderInfo && (
            <div className={`p-4 rounded-xl shadow-[0_0_20px_rgba(190,242,100,0.1)] ${
              uploaderInfo.platform === 'bilibili' 
                ? 'bg-gradient-to-br from-pink-500/10 to-pink-600/10 border border-pink-500/30'
                : 'bg-gradient-to-br from-red-500/10 to-red-600/10 border border-red-500/30'
            }`}>
              <div className="flex items-center gap-3">
                <img
                  src={uploaderInfo.platform === 'bilibili' ? uploaderInfo.face : uploaderInfo.thumbnail}
                  alt={uploaderInfo.platform === 'bilibili' ? uploaderInfo.name : uploaderInfo.title}
                  className={`w-14 h-14 rounded-full border-2 shadow-lg ${
                    uploaderInfo.platform === 'bilibili' 
                      ? 'border-pink-500/50 shadow-pink-500/30'
                      : 'border-red-500/50 shadow-red-500/30'
                  }`}
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-bold truncate text-sm">
                      {uploaderInfo.platform === 'bilibili' ? uploaderInfo.name : uploaderInfo.title}
                    </p>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                      uploaderInfo.platform === 'bilibili'
                        ? 'bg-pink-500/20 text-pink-400'
                        : 'bg-red-500/20 text-red-400'
                    }`}>
                      {uploaderInfo.platform === 'bilibili' ? 'B站' : 'YouTube'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-1">
                    <p className="text-[10px] text-gray-400 font-mono">
                      {uploaderInfo.platform === 'bilibili' 
                        ? `MID: ${uploaderInfo.mid}`
                        : `${uploaderInfo.subscriberCount?.toLocaleString() || 0} 订阅`
                      }
                    </p>
                  </div>
                  {(uploaderInfo.platform === 'bilibili' ? uploaderInfo.sign : uploaderInfo.description) && (
                    <p className="text-[10px] text-gray-500 line-clamp-1 mt-1 opacity-80">
                      {uploaderInfo.platform === 'bilibili' ? uploaderInfo.sign : uploaderInfo.description}
                    </p>
                  )}
                </div>
                <svg className={`w-5 h-5 shrink-0 ${
                  uploaderInfo.platform === 'bilibili' 
                    ? 'text-pink-400 drop-shadow-[0_0_8px_rgba(236,72,153,0.5)]'
                    : 'text-red-400 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                }`} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                </svg>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-xs text-red-400">
              {error}
            </div>
          )}

          {/* 按钮 */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-3 bg-white/5 border border-white/20 rounded-xl text-sm font-semibold text-gray-300 hover:bg-white/10 hover:border-white/30 hover:text-white active:scale-95 transition-all duration-200"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !uploaderInfo}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${loading || !uploaderInfo
                ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-600/30'
                : 'bg-gradient-to-r from-cyber-lime to-lime-400 text-black hover:from-lime-400 hover:to-cyber-lime shadow-[0_0_25px_rgba(190,242,100,0.4)] hover:shadow-[0_0_35px_rgba(190,242,100,0.6)] hover:scale-105 active:scale-95 border border-cyber-lime/50'
                }`}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" />
                  </svg>
                  添加中...
                </span>
              ) : (
                '添加博主'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddUploaderModal;
