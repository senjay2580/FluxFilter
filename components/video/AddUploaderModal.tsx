import React, { useState, useCallback } from 'react';
import { supabase } from '../../lib/supabase';
import { getUploaderInfo } from '../../lib/bilibili';
import { getStoredUserId } from '../../lib/auth';

interface AddUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

interface UploaderInfo {
  mid: number;
  name: string;
  face: string;
  sign: string;
}

const AddUploaderModal: React.FC<AddUploaderModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mid, setMid] = useState('');
  const [uploaderInfo, setUploaderInfo] = useState<UploaderInfo | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 获取UP主信息
  const fetchUploaderInfo = useCallback(async () => {
    const midNum = parseInt(mid);
    if (isNaN(midNum) || midNum <= 0) {
      setError('请输入有效的 MID');
      return;
    }

    setFetching(true);
    setError(null);
    setUploaderInfo(null);

    try {
      const info = await getUploaderInfo(midNum);
      setUploaderInfo(info);
    } catch (err) {
      setError('获取UP主信息失败，请检查MID是否正确');
    } finally {
      setFetching(false);
    }
  }, [mid]);

  // 提交添加
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!uploaderInfo) {
      setError('请先获取UP主信息');
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

      const { error: insertError } = await supabase
        .from('uploader')
        .insert({
          user_id: userId,
          mid: uploaderInfo.mid,
          name: uploaderInfo.name,
          face: uploaderInfo.face,
          sign: uploaderInfo.sign,
          is_active: true
        });

      if (insertError) {
        if (insertError.code === '23505') {
          setError('该UP主已存在');
        } else {
          throw insertError;
        }
        return;
      }

      // 成功
      setMid('');
      setUploaderInfo(null);
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('添加UP主失败:', err);
      setError('添加失败: ' + (err?.message || '请稍后重试'));
    } finally {
      setLoading(false);
    }
  };

  // 重置表单
  const handleClose = () => {
    setMid('');
    setUploaderInfo(null);
    setError(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-md"
      onClick={handleClose}
      style={{ WebkitFontSmoothing: 'antialiased', textRendering: 'optimizeLegibility' }}
    >
      <div
        className="w-full max-w-sm mx-4 bg-[#0a0a0a]/95 backdrop-blur-xl border border-white/20 rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.8)] overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-5 py-4 bg-gradient-to-r from-cyber-lime/10 to-cyan-500/10 border-b border-white/10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2" style={{ WebkitFontSmoothing: 'antialiased' }}>
            <svg className="w-5 h-5 text-cyber-lime drop-shadow-[0_0_8px_rgba(190,242,100,0.5)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            添加UP主
          </h2>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* MID 输入 */}
          <div>
            <label className="block text-xs font-semibold text-gray-300 mb-1.5" style={{ WebkitFontSmoothing: 'antialiased' }}>MID</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={mid}
                onChange={(e) => {
                  let value = e.target.value;
                  // 支持从 "UID:367877" 或 "UID：367877" 格式提取数字
                  const uidMatch = value.match(/UID[：:]\s*(\d+)/i);
                  if (uidMatch) {
                    value = uidMatch[1];
                  }
                  // 支持从 space.bilibili.com/367877 链接提取
                  const urlMatch = value.match(/space\.bilibili\.com\/(\d+)/);
                  if (urlMatch) {
                    value = urlMatch[1];
                  }
                  setMid(value);
                  setUploaderInfo(null);
                  setError(null);
                }}
                placeholder="粘贴空间链接或输入数字"
                className="flex-1 px-4 py-2.5 bg-white/[0.05] border border-white/20 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 focus:bg-white/[0.08] focus:ring-2 focus:ring-cyber-lime/20 transition-all"
                style={{ WebkitFontSmoothing: 'antialiased' }}
              />
              <button
                type="button"
                onClick={fetchUploaderInfo}
                disabled={fetching || !mid.trim()}
                className={`px-5 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  fetching || !mid.trim()
                    ? 'bg-white/5 text-gray-500 cursor-not-allowed border border-white/10'
                    : 'bg-gradient-to-r from-cyan-500/80 to-blue-500/80 text-white hover:from-cyan-400 hover:to-blue-400 border border-cyan-400/30 shadow-[0_0_20px_rgba(6,182,212,0.3)] hover:shadow-[0_0_25px_rgba(6,182,212,0.5)] hover:scale-105 active:scale-95'
                }`}
                style={{ WebkitFontSmoothing: 'antialiased' }}
              >
                {fetching ? (
                  <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
                    <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" />
                  </svg>
                ) : '获取'}
              </button>
            </div>
          </div>

          {/* UP主信息预览 */}
          {uploaderInfo && (
            <div className="p-4 bg-gradient-to-br from-cyber-lime/10 to-cyan-500/10 border border-cyber-lime/30 rounded-xl shadow-[0_0_20px_rgba(190,242,100,0.1)]">
              <div className="flex items-center gap-3">
                <img 
                  src={uploaderInfo.face} 
                  alt={uploaderInfo.name}
                  className="w-14 h-14 rounded-full border-2 border-cyber-lime/50 shadow-[0_0_15px_rgba(190,242,100,0.3)]"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold truncate" style={{ WebkitFontSmoothing: 'antialiased' }}>{uploaderInfo.name}</p>
                  <p className="text-xs text-gray-400" style={{ WebkitFontSmoothing: 'antialiased' }}>MID: {uploaderInfo.mid}</p>
                  {uploaderInfo.sign && (
                    <p className="text-[10px] text-gray-500 line-clamp-2 mt-1" style={{ WebkitFontSmoothing: 'antialiased' }}>{uploaderInfo.sign}</p>
                  )}
                </div>
                <svg className="w-5 h-5 text-cyber-lime shrink-0 drop-shadow-[0_0_8px_rgba(190,242,100,0.5)]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                </svg>
              </div>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <div className="px-3 py-2 bg-red-500/20 border border-red-500/30 rounded-lg text-xs text-red-400" style={{ WebkitFontSmoothing: 'antialiased' }}>
              {error}
            </div>
          )}

          {/* 按钮 */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 py-3 bg-white/5 border border-white/20 rounded-xl text-sm font-semibold text-gray-300 hover:bg-white/10 hover:border-white/30 hover:text-white active:scale-95 transition-all duration-200"
              style={{ WebkitFontSmoothing: 'antialiased' }}
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !uploaderInfo}
              className={`flex-1 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
                loading || !uploaderInfo
                  ? 'bg-gray-700/50 text-gray-500 cursor-not-allowed border border-gray-600/30'
                  : 'bg-gradient-to-r from-cyber-lime to-lime-400 text-black hover:from-lime-400 hover:to-cyber-lime shadow-[0_0_25px_rgba(190,242,100,0.4)] hover:shadow-[0_0_35px_rgba(190,242,100,0.6)] hover:scale-105 active:scale-95 border border-cyber-lime/50'
              }`}
              style={{ WebkitFontSmoothing: 'antialiased' }}
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
                '添加UP主'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddUploaderModal;
