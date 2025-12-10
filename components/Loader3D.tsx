import React from 'react';

interface Loader3DProps {
  text?: string;
}

/**
 * Ff 碰撞加载动画
 * 大F和小f相撞，带弹性物理效果
 */
const Loader3D: React.FC<Loader3DProps> = ({ text = '加载中...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      {/* Ff 碰撞容器 */}
      <div className="relative w-40 h-24 flex items-center justify-center">
        {/* 碰撞发光效果 */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 bg-cyber-lime/30 rounded-full blur-2xl animate-collision-glow" />
        
        {/* 大 F - 从左边冲过来 */}
        <div className="absolute animate-big-f">
          <span 
            className="text-6xl font-bold bg-gradient-to-br from-cyber-lime via-lime-400 to-cyan-400 bg-clip-text text-transparent drop-shadow-[0_0_20px_rgba(163,230,53,0.6)]"
            style={{ fontFamily: 'Arial, sans-serif' }}
          >
            F
          </span>
        </div>
        
        {/* 小 f - 从右边冲过来 */}
        <div className="absolute animate-small-f">
          <span 
            className="text-4xl italic text-white/90 drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]"
            style={{ fontFamily: 'Georgia, serif' }}
          >
            f
          </span>
        </div>
        
        {/* 碰撞火花粒子 */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          {[...Array(8)].map((_, i) => (
            <div
              key={i}
              className="absolute w-1 h-1 bg-cyber-lime rounded-full animate-spark"
              style={{
                animationDelay: `${1.2 + i * 0.05}s`,
                '--angle': `${i * 45}deg`,
              } as React.CSSProperties}
            />
          ))}
        </div>
      </div>

      {/* 加载文字 */}
      <div className="mt-6 flex items-center gap-2">
        <span className="text-sm text-gray-400 font-medium">{text}</span>
        <span className="flex gap-1">
          <span className="w-1.5 h-1.5 bg-cyber-lime rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-cyber-lime rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-cyber-lime rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </span>
      </div>

      {/* 能量条 */}
      <div className="mt-4 w-32 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div className="h-full bg-gradient-to-r from-cyber-lime via-lime-300 to-cyan-400 rounded-full animate-energy-bar" />
      </div>

      {/* CSS 动画 - 物理碰撞效果 */}
      <style>{`
        /* 大F从左侧冲入，碰撞后弹回 */
        @keyframes big-f {
          0% {
            transform: translateX(-60px) scale(1);
            opacity: 0.5;
          }
          20% {
            transform: translateX(-40px) scale(1.05);
            opacity: 0.7;
          }
          40% {
            transform: translateX(-15px) scale(1.1);
            opacity: 1;
          }
          /* 碰撞点 */
          50% {
            transform: translateX(-5px) scale(0.9) rotate(-3deg);
            opacity: 1;
          }
          /* 弹回 */
          60% {
            transform: translateX(-20px) scale(1.15) rotate(2deg);
            opacity: 1;
          }
          70% {
            transform: translateX(-12px) scale(1);
            opacity: 1;
          }
          80% {
            transform: translateX(-8px) scale(1.02);
            opacity: 0.9;
          }
          100% {
            transform: translateX(-60px) scale(1);
            opacity: 0.5;
          }
        }
        .animate-big-f {
          animation: big-f 2.4s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
        }
        
        /* 小f从右侧冲入，碰撞后弹回 */
        @keyframes small-f {
          0% {
            transform: translateX(50px) scale(1) rotate(0deg);
            opacity: 0.5;
          }
          20% {
            transform: translateX(35px) scale(1.05) rotate(-2deg);
            opacity: 0.7;
          }
          40% {
            transform: translateX(15px) scale(1.1) rotate(-5deg);
            opacity: 1;
          }
          /* 碰撞点 */
          50% {
            transform: translateX(8px) scale(0.85) rotate(8deg);
            opacity: 1;
          }
          /* 弹回 */
          60% {
            transform: translateX(25px) scale(1.2) rotate(-3deg);
            opacity: 1;
          }
          70% {
            transform: translateX(18px) scale(1) rotate(0deg);
            opacity: 1;
          }
          80% {
            transform: translateX(15px) scale(1.02);
            opacity: 0.9;
          }
          100% {
            transform: translateX(50px) scale(1);
            opacity: 0.5;
          }
        }
        .animate-small-f {
          animation: small-f 2.4s cubic-bezier(0.34, 1.56, 0.64, 1) infinite;
        }
        
        /* 碰撞发光 */
        @keyframes collision-glow {
          0%, 40% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 0;
          }
          50% {
            transform: translate(-50%, -50%) scale(1.5);
            opacity: 1;
          }
          70% {
            transform: translate(-50%, -50%) scale(2);
            opacity: 0.5;
          }
          100% {
            transform: translate(-50%, -50%) scale(0);
            opacity: 0;
          }
        }
        .animate-collision-glow {
          animation: collision-glow 2.4s ease-out infinite;
        }
        
        /* 碰撞火花 */
        @keyframes spark {
          0% {
            transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0) scale(0);
            opacity: 0;
          }
          10% {
            transform: translate(-50%, -50%) rotate(var(--angle)) translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translate(-50%, -50%) rotate(var(--angle)) translateY(-30px) scale(0);
            opacity: 0;
          }
        }
        .animate-spark {
          animation: spark 2.4s ease-out infinite;
        }
        
        /* 能量条 */
        @keyframes energy-bar {
          0% {
            width: 10%;
          }
          40% {
            width: 45%;
          }
          50% {
            width: 100%;
            box-shadow: 0 0 20px rgba(163, 230, 53, 0.8);
          }
          60% {
            width: 60%;
          }
          100% {
            width: 10%;
          }
        }
        .animate-energy-bar {
          animation: energy-bar 2.4s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};

/**
 * DNA 螺旋加载动画
 */
export const LoaderDNA: React.FC<Loader3DProps> = ({ text = '正在同步...' }) => {
  const dots = Array.from({ length: 10 }, (_, i) => i);
  
  return (
    <div className="flex flex-col items-center justify-center py-20">
      {/* DNA 螺旋 */}
      <div className="relative h-16 w-24 flex items-center justify-center">
        {dots.map((i) => (
          <React.Fragment key={i}>
            <div
              className="absolute w-3 h-3 rounded-full bg-cyber-lime shadow-[0_0_10px_#a3e635]"
              style={{
                animation: `dna-strand-1 1.5s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`,
                left: `${i * 8}px`,
              }}
            />
            <div
              className="absolute w-3 h-3 rounded-full bg-cyan-400 shadow-[0_0_10px_#22d3ee]"
              style={{
                animation: `dna-strand-2 1.5s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`,
                left: `${i * 8}px`,
              }}
            />
            {/* 连接线 */}
            <div
              className="absolute w-px h-6 bg-white/20"
              style={{
                animation: `dna-line 1.5s ease-in-out infinite`,
                animationDelay: `${i * 0.1}s`,
                left: `${i * 8 + 5}px`,
              }}
            />
          </React.Fragment>
        ))}
      </div>

      {/* 加载文字 */}
      <div className="mt-8 text-sm text-gray-400 font-medium">{text}</div>

      {/* CSS 动画 */}
      <style>{`
        @keyframes dna-strand-1 {
          0%, 100% {
            transform: translateY(-12px) scale(1);
            opacity: 1;
          }
          50% {
            transform: translateY(12px) scale(0.6);
            opacity: 0.5;
          }
        }
        @keyframes dna-strand-2 {
          0%, 100% {
            transform: translateY(12px) scale(0.6);
            opacity: 0.5;
          }
          50% {
            transform: translateY(-12px) scale(1);
            opacity: 1;
          }
        }
        @keyframes dna-line {
          0%, 100% {
            transform: translateY(0) rotate(45deg);
            opacity: 0.3;
          }
          50% {
            transform: translateY(0) rotate(-45deg);
            opacity: 0.8;
          }
        }
      `}</style>
    </div>
  );
};

/**
 * 脉冲环加载动画
 */
export const LoaderPulse: React.FC<Loader3DProps> = ({ text = '数据加载中...' }) => {
  return (
    <div className="flex flex-col items-center justify-center py-20">
      {/* 脉冲环 */}
      <div className="relative w-20 h-20">
        {/* 多层环 */}
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="absolute inset-0 border-2 border-cyber-lime rounded-full"
            style={{
              animation: `pulse-ring 2s ease-out infinite`,
              animationDelay: `${i * 0.4}s`,
            }}
          />
        ))}
        
        {/* 中心图标 */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 bg-gradient-to-br from-cyber-lime to-cyan-400 rounded-lg flex items-center justify-center shadow-[0_0_20px_rgba(163,230,53,0.5)] animate-pulse">
            <svg className="w-5 h-5 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
              <path d="M16 21h5v-5" />
            </svg>
          </div>
        </div>
      </div>

      {/* 加载文字 */}
      <div className="mt-6 text-sm text-gray-400 font-medium">{text}</div>

      {/* CSS 动画 */}
      <style>{`
        @keyframes pulse-ring {
          0% {
            transform: scale(0.8);
            opacity: 1;
          }
          100% {
            transform: scale(2);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
};

export default Loader3D;
