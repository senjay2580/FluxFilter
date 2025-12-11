import React, { useState, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getUploaderInfo } from '../lib/bilibili';

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
      const { error: insertError } = await supabase
        .from('uploader')
        .insert({
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
    } catch (err) {
      setError('添加失败: ' + String(err));
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={handleClose}
    >
      <div 
        className="w-full max-w-sm mx-4 bg-cyber-card border border-white/10 rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="px-5 py-4 bg-gradient-to-r from-cyber-lime/20 to-cyan-500/20 border-b border-white/10">
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <svg className="w-5 h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <line x1="19" y1="8" x2="19" y2="14" />
              <line x1="22" y1="11" x2="16" y2="11" />
            </svg>
            添加UP主
          </h2>
          <p className="text-xs text-gray-400 mt-1">输入MID自动获取UP主信息</p>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* MID 输入 */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              MID <span className="text-gray-600">(空间链接中的数字)</span>
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={mid}
                onChange={(e) => {
                  setMid(e.target.value);
                  setUploaderInfo(null);
                  setError(null);
                }}
                placeholder="如: 946974"
                className="flex-1 px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 transition-colors"
              />
              <button
                type="button"
                onClick={fetchUploaderInfo}
                disabled={fetching || !mid.trim()}
                className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-all ${
                  fetching || !mid.trim()
                    ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-white/10 text-white hover:bg-white/20 border border-white/10'
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
            <p className="mt-1.5 text-[10px] text-gray-500">
              💡 打开UP主空间，URL中 space.bilibili.com/ 后面的数字就是 MID
            </p>
          </div>

          {/* UP主信息预览 */}
          {uploaderInfo && (
            <div className="p-4 bg-white/5 border border-cyber-lime/30 rounded-xl">
              <div className="flex items-center gap-3">
                <img 
                  src={uploaderInfo.face} 
                  alt={uploaderInfo.name}
                  className="w-14 h-14 rounded-full border-2 border-cyber-lime/50"
                  referrerPolicy="no-referrer"
                />
                <div className="flex-1 min-w-0">
                  <p className="text-white font-bold truncate">{uploaderInfo.name}</p>
                  <p className="text-xs text-gray-400">MID: {uploaderInfo.mid}</p>
                  {uploaderInfo.sign && (
                    <p className="text-[10px] text-gray-500 line-clamp-2 mt-1">{uploaderInfo.sign}</p>
                  )}
                </div>
                <svg className="w-5 h-5 text-cyber-lime shrink-0" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
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
              className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-400 hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading || !uploaderInfo}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                loading || !uploaderInfo
                  ? 'bg-gray-600 text-gray-400 cursor-not-allowed'
                  : 'bg-cyber-lime text-black hover:bg-lime-400'
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
