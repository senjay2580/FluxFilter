import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

interface AddUploaderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AddUploaderModal: React.FC<AddUploaderModalProps> = ({ isOpen, onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [mid, setMid] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !mid.trim()) {
      setError('请填写完整信息');
      return;
    }

    const midNum = parseInt(mid);
    if (isNaN(midNum)) {
      setError('MID 必须是数字');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const { error: insertError } = await supabase
        .from('uploader')
        .insert({
          mid: midNum,
          name: name.trim(),
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
      setName('');
      setMid('');
      onSuccess();
      onClose();
    } catch (err) {
      setError('添加失败: ' + String(err));
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
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
          <p className="text-xs text-gray-400 mt-1">关注你喜欢的B站创作者</p>
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* UP主名称 */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">UP主名称</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="如: 影视飓风"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 transition-colors"
            />
          </div>

          {/* MID */}
          <div>
            <label className="block text-xs text-gray-400 mb-1.5">
              MID <span className="text-gray-600">(空间链接中的数字)</span>
            </label>
            <input
              type="text"
              value={mid}
              onChange={(e) => setMid(e.target.value)}
              placeholder="如: 946974"
              className="w-full px-4 py-2.5 bg-white/5 border border-white/10 rounded-xl text-white text-sm placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 transition-colors"
            />
            <p className="mt-1.5 text-[10px] text-gray-500">
              💡 打开UP主空间，URL中 space.bilibili.com/ 后面的数字就是 MID
            </p>
          </div>

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
              onClick={onClose}
              className="flex-1 py-2.5 bg-white/5 border border-white/10 rounded-xl text-sm text-gray-400 hover:bg-white/10 transition-colors"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={loading}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-all ${
                loading
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
                '添加'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddUploaderModal;
