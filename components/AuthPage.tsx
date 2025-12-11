import React, { useState } from 'react';
import { register, login } from '../lib/auth';

interface AuthPageProps {
  onLoginSuccess: () => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [nickname, setNickname] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'register') {
        if (!nickname.trim()) {
          setError('请输入昵称');
          return;
        }
        const result = await register(nickname.trim(), email.trim() || undefined);
        if (result.error) {
          setError(result.error);
        } else {
          onLoginSuccess();
        }
      } else {
        if (!email.trim()) {
          setError('请输入邮箱或用户ID');
          return;
        }
        const result = await login(email.trim());
        if (result.error) {
          setError(result.error);
        } else {
          onLoginSuccess();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex items-center justify-center p-4">
      {/* 背景装饰 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyber-lime/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl" />
      </div>

      <div className="w-full max-w-md relative z-10">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyber-lime to-emerald-400 mb-4">
            <svg className="w-8 h-8 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-white">FluxFilter</h1>
          <p className="text-gray-500 mt-1">B站UP主视频追踪器</p>
        </div>

        {/* 登录/注册卡片 */}
        <div className="bg-[#12131a] border border-white/10 rounded-2xl p-6 shadow-2xl">
          {/* 切换标签 */}
          <div className="flex bg-white/5 rounded-xl p-1 mb-6">
            <button
              onClick={() => { setMode('login'); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'login' 
                  ? 'bg-cyber-lime text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              登录
            </button>
            <button
              onClick={() => { setMode('register'); setError(null); }}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-all ${
                mode === 'register' 
                  ? 'bg-cyber-lime text-black' 
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              注册
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">昵称 *</label>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="输入你的昵称"
                  className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 transition-colors"
                />
              </div>
            )}

            <div>
              <label className="block text-sm text-gray-400 mb-2">
                {mode === 'login' ? '邮箱 / 用户ID' : '邮箱（可选）'}
              </label>
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={mode === 'login' ? '输入邮箱或用户ID' : '输入邮箱（可选）'}
                className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 transition-colors"
              />
            </div>

            {error && (
              <div className="px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 bg-cyber-lime text-black font-medium rounded-xl hover:bg-lime-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                  处理中...
                </>
              ) : (
                mode === 'login' ? '登录' : '创建账号'
              )}
            </button>
          </form>

          {mode === 'register' && (
            <p className="mt-4 text-xs text-gray-500 text-center">
              注册后需要在设置中配置B站Cookie才能同步视频
            </p>
          )}
        </div>

        {/* 底部说明 */}
        <div className="mt-6 text-center">
          <p className="text-xs text-gray-600">
            无需密码，使用邮箱或用户ID即可登录
          </p>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
