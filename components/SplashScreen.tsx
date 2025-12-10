import React, { useEffect, useState } from 'react';
import LogoSvg from '../assets/logo.svg';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface SplashScreenProps {
  onComplete: () => void;
  onSync: () => Promise<void>;
}

const SplashScreen: React.FC<SplashScreenProps> = ({ onComplete, onSync }) => {
  const [status, setStatus] = useState<'loading' | 'syncing' | 'done'>('loading');
  const [progress, setProgress] = useState(0);
  const [message, setMessage] = useState('正在启动...');
  const { isInstallable, isInstalled, install } = usePWAInstall();

  useEffect(() => {
    const init = async () => {
      // 阶段1: 初始化
      setMessage('正在初始化...');
      await new Promise(r => setTimeout(r, 500));
      setProgress(20);

      // 阶段2: 同步数据
      setStatus('syncing');
      setMessage('正在同步数据...');
      setProgress(40);
      
      try {
        await onSync();
        setProgress(80);
        setMessage('同步完成');
      } catch (e) {
        setMessage('同步失败，使用缓存数据');
      }
      
      // 阶段3: 完成
      setProgress(100);
      setStatus('done');
      setMessage('准备就绪');
      
      await new Promise(r => setTimeout(r, 600));
      onComplete();
    };

    init();
  }, [onComplete, onSync]);

  return (
    <div className="fixed inset-0 z-[100] bg-[#050510] flex flex-col items-center justify-center overflow-hidden">
      {/* 背景效果 */}
      <div className="absolute inset-0">
        {/* 渐变光晕 */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-cyber-lime/10 rounded-full blur-[150px] animate-pulse" />
        <div className="absolute bottom-1/4 left-1/4 w-[400px] h-[400px] bg-cyan-500/10 rounded-full blur-[120px] animate-pulse" style={{ animationDelay: '1s' }} />
        <div className="absolute top-1/3 right-1/4 w-[300px] h-[300px] bg-purple-500/10 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '2s' }} />
        
        {/* 网格线 */}
        <div className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: `
              linear-gradient(rgba(163,230,53,0.5) 1px, transparent 1px),
              linear-gradient(90deg, rgba(163,230,53,0.5) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        />
        
        {/* 动态光线 */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-px h-1/3 bg-gradient-to-b from-cyber-lime/50 to-transparent animate-pulse" />
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-px h-1/3 bg-gradient-to-t from-cyan-400/50 to-transparent animate-pulse" style={{ animationDelay: '0.5s' }} />
        
        {/* 粒子 */}
        {[...Array(20)].map((_, i) => (
          <div
            key={i}
            className="absolute w-1 h-1 bg-cyber-lime/60 rounded-full animate-float"
            style={{
              left: `${10 + (i * 4.5)}%`,
              top: `${20 + (i % 5) * 15}%`,
              animationDelay: `${i * 0.2}s`,
              animationDuration: `${3 + (i % 3)}s`,
            }}
          />
        ))}
      </div>

      {/* 主要内容 */}
      <div className="relative z-10 flex flex-col items-center px-8">
        {/* Logo */}
        <div className="relative mb-8">
          {/* Logo 光环 */}
          <div className="absolute -inset-8 bg-cyber-lime/20 rounded-full blur-2xl animate-pulse" />
          <div className="absolute -inset-4 bg-gradient-to-br from-cyber-lime/30 to-cyan-400/30 rounded-full blur-xl" />
          
          {/* Logo 图片 */}
          <img 
            src={LogoSvg} 
            alt="FluxFilter" 
            className="relative w-24 h-24 drop-shadow-[0_0_30px_rgba(163,230,53,0.5)]"
          />
        </div>

        {/* 应用名称 */}
        <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-white via-cyber-lime to-cyan-400 bg-clip-text text-transparent">
          FluxFilter
        </h1>
        
        {/* 标语 */}
        <p className="text-gray-400 text-sm mb-12 text-center max-w-xs">
          智能追踪你关注的 UP主，永不错过精彩内容
        </p>

        {/* 功能亮点 */}
        <div className="flex gap-6 mb-12">
          {[
            { icon: '📺', text: '视频追踪' },
            { icon: '🔔', text: '智能提醒' },
            { icon: '⚡', text: '极速同步' },
          ].map((item, i) => (
            <div key={i} className="flex flex-col items-center gap-1 opacity-60">
              <span className="text-xl">{item.icon}</span>
              <span className="text-[10px] text-gray-500">{item.text}</span>
            </div>
          ))}
        </div>

        {/* 进度条 */}
        <div className="w-48 mb-4">
          <div className="h-1 bg-white/10 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-cyber-lime to-cyan-400 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* 状态文字 */}
        <div className="flex items-center gap-2 text-gray-500 text-xs mb-6">
          {status !== 'done' && (
            <div className="w-3 h-3 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin" />
          )}
          {status === 'done' && (
            <svg className="w-3 h-3 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
          <span>{message}</span>
        </div>

        {/* 安装按钮 */}
        {isInstallable && status === 'done' && (
          <button
            onClick={install}
            className="px-6 py-2.5 bg-gradient-to-r from-cyber-lime to-lime-400 text-black font-medium text-sm rounded-full
                       shadow-[0_0_20px_rgba(163,230,53,0.4)] hover:shadow-[0_0_30px_rgba(163,230,53,0.6)]
                       transition-all hover:scale-105 active:scale-95 flex items-center gap-2"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7,10 12,15 17,10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            安装应用
          </button>
        )}
        
        {isInstalled && (
          <div className="text-cyber-lime/60 text-xs flex items-center gap-1">
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 13l4 4L19 7" />
            </svg>
            已安装
          </div>
        )}
      </div>

      {/* 底部信息 */}
      <div className="absolute bottom-8 text-center">
        <p className="text-gray-600 text-[10px]">
          Made with 💚 for Bilibili
        </p>
      </div>

      {/* CSS 动画 */}
      <style>{`
        @keyframes float {
          0%, 100% {
            transform: translateY(0) scale(1);
            opacity: 0.6;
          }
          50% {
            transform: translateY(-20px) scale(1.2);
            opacity: 1;
          }
        }
        .animate-float {
          animation: float ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

export default SplashScreen;
