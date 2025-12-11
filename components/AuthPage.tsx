import React, { useState } from 'react';
import { register, login } from '../lib/auth';
import LogoSvg from '../assets/logo.svg';

interface AuthPageProps {
  onLoginSuccess: () => void;
}

const AuthPage: React.FC<AuthPageProps> = ({ onLoginSuccess }) => {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!username.trim()) {
        setError('请输入用户名');
        return;
      }
      if (!password.trim()) {
        setError('请输入密码');
        return;
      }
      
      if (mode === 'register') {
        if (password.length < 6) {
          setError('密码长度至少6位');
          return;
        }
        const result = await register(username.trim(), password);
        if (result.error) {
          setError(result.error);
        } else {
          onLoginSuccess();
        }
      } else {
        const result = await login(username.trim(), password);
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
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* 背景装饰 */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-cyber-lime/8 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 left-0 w-[400px] h-[400px] bg-emerald-500/5 rounded-full blur-[100px]" />
        <div className="absolute bottom-1/4 right-0 w-[300px] h-[300px] bg-cyan-500/5 rounded-full blur-[80px]" />
      </div>

      {/* 固定Logo区域 */}
      <div className="pt-16 pb-8 text-center relative z-10">
        <div className="inline-block mb-4">
          <img src={LogoSvg} alt="FluxFilter" className="w-20 h-20 drop-shadow-[0_0_30px_rgba(163,230,53,0.3)]" />
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight">FluxFilter</h1>
        <p className="text-gray-500 mt-2 text-sm">B站UP主视频追踪器</p>
      </div>

      {/* 表单区域 - 可滚动 */}
      <div className="flex-1 flex items-start justify-center px-4 pb-8 relative z-10">
        <div className="w-full max-w-sm">
          {/* 登录/注册卡片 */}
          <div className="bg-[#12131a]/80 backdrop-blur-xl border border-white/10 rounded-3xl p-6 shadow-[0_0_60px_rgba(0,0,0,0.5)]">
            {/* 切换标签 */}
            <div className="flex bg-black/30 rounded-2xl p-1.5 mb-6">
              <button
                onClick={() => { setMode('login'); setError(null); }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 ${
                  mode === 'login' 
                    ? 'bg-cyber-lime text-black shadow-lg shadow-cyber-lime/20' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                登录
              </button>
              <button
                onClick={() => { setMode('register'); setError(null); }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all duration-300 ${
                  mode === 'register' 
                    ? 'bg-cyber-lime text-black shadow-lg shadow-cyber-lime/20' 
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                注册
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">用户名</label>
                <input
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="输入用户名"
                  className="w-full px-4 py-3.5 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-cyber-lime/50 focus:bg-black/40 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-400 mb-2 uppercase tracking-wider">密码</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={mode === 'register' ? '设置密码（至少6位）' : '输入密码'}
                  className="w-full px-4 py-3.5 bg-black/30 border border-white/10 rounded-xl text-white placeholder-gray-600 focus:outline-none focus:border-cyber-lime/50 focus:bg-black/40 transition-all"
                />
              </div>

              {error && (
                <div className="px-4 py-3 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm flex items-center gap-2">
                  <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10" />
                    <path d="M12 8v4m0 4h.01" />
                  </svg>
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 bg-gradient-to-r from-cyber-lime to-emerald-400 text-black font-semibold rounded-xl hover:shadow-lg hover:shadow-cyber-lime/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    处理中...
                  </>
                ) : (
                  mode === 'login' ? '登录' : '注册'
                )}
              </button>
            </form>

            {mode === 'register' && (
              <p className="mt-5 text-xs text-gray-500 text-center leading-relaxed">
                注册后需要在设置中配置B站Cookie才能同步视频
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
