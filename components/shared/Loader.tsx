import React from 'react';

interface LoaderProps {
  text?: string;
}

/**
 * Ff 碰撞加载动画
 */
const Loader: React.FC<LoaderProps> = ({ text = '加载中...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="relative w-40 h-24 flex items-center justify-center">
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-cyber-lime/30 rounded-full blur-2xl animate-collision-glow" />
        <div className="absolute animate-big-f">
          <span className="text-6xl font-bold bg-gradient-to-br from-cyber-lime via-lime-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(163,230,53,0.6)]" style={{ fontFamily: 'Arial, sans-serif' }}>F</span>
        </div>
        <div className="absolute animate-small-f">
          <span className="text-4xl italic text-white/90 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]" style={{ fontFamily: 'Georgia, serif' }}>f</span>
        </div>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="absolute w-1 h-1 bg-cyber-lime rounded-full animate-spark" style={{ animationDelay: `${1.2 + i * 0.05}s`, '--angle': `${i * 45}deg` } as React.CSSProperties} />
          ))}
        </div>
      </div>
      <div className="mt-6 flex items-center gap-2">
        <span className="text-sm text-gray-400 font-medium">{text}</span>
        <span className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-cyber-lime rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-cyber-lime rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-cyber-lime rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      </div>
      <div className="mt-4 w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-cyber-lime via-lime-300 to-cyan-400 rounded-full animate-energy-bar" />
      </div>
      <style>{`
        @keyframes big-f { 0% { transform: translateX(-60px) scale(1); opacity: 0.5; } 40% { transform: translateX(-15px) scale(1.1); opacity: 1; } 50% { transform: translateX(-5px) scale(0.9) rotate(-3deg); } 60% { transform: translateX(-20px) scale(1.15) rotate(2deg); } 100% { transform: translateX(-60px) scale(1); opacity: 0.5; } }
        .animate-big-f { animation: big-f 2.4s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
        @keyframes small-f { 0% { transform: translateX(50px) scale(1); opacity: 0.5; } 40% { transform: translateX(15px) scale(1.1) rotate(-5deg); opacity: 1; } 50% { transform: translateX(8px) scale(0.85) rotate(8deg); } 60% { transform: translateX(25px) scale(1.2) rotate(-3deg); } 100% { transform: translateX(50px) scale(1); opacity: 0.5; } }
        .animate-small-f { animation: small-f 2.4s cubic-bezier(0.34, 1.56, 0.64, 1) infinite; }
        @keyframes collision-glow { 0%, 40% { transform: translate(-50%, -50%) scale(0); opacity: 0; } 50% { transform: translate(-50%, -50%) scale(1.5); opacity: 1; } 100% { transform: translate(-50%, -50%) scale(0); opacity: 0; } }
        .animate-collision-glow { animation: collision-glow 2.4s ease-out infinite; }
        @keyframes spark { 0% { transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0) scale(0); opacity: 0; } 10% { transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0) scale(1); opacity: 1; } 100% { transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-30px) scale(0); opacity: 0; } }
        .animate-spark { animation: spark 2.4s ease-out infinite; }
        @keyframes energy-bar { 0% { width: 10%; } 50% { width: 100%; box-shadow: 0 0 20px rgba(163, 230, 53, 0.8); } 100% { width: 10%; } }
        .animate-energy-bar { animation: energy-bar 2.4s ease-in-out infinite; }
      `}</style>
    </div>
  );
};

/**
 * 简单圆形加载器 - 用于次要加载状态
 */
export const SimpleLoader: React.FC<LoaderProps> = ({ text }) => {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-white/10 border-t-cyber-lime rounded-full animate-spin" />
      {text && <span className="mt-4 text-sm text-gray-500">{text}</span>}
    </div>
  );
};

export const LoaderPulse: React.FC<LoaderProps> = ({ text = '数据加载中...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      <div className="relative w-20 h-20">
        {[0, 1, 2].map((i) => (
          <div key={i} className="absolute inset-0 border-2 border-cyber-lime rounded-full" style={{ animation: `pulse-ring 2s ease-out infinite`, animationDelay: `${i * 0.4}s` }} />
        ))}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 bg-gradient-to-br from-cyber-lime to-cyan-400 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(163,230,53,0.5)] animate-pulse">
            <svg className="w-5 h-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" /><path d="M16 21h5v-5" />
            </svg>
          </div>
        </div>
      </div>
      <div className="mt-6 text-sm text-gray-400 font-medium">{text}</div>
      <style>{`@keyframes pulse-ring { 0% { transform: scale(0.8); opacity: 1; } 100% { transform: scale(2); opacity: 0; } }`}</style>
    </div>
  );
};

export default Loader;