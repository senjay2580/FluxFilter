import React, { useState, useEffect } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/**
 * PWA 安装提示组件
 * 监听 beforeinstallprompt 事件，提供自定义安装提示UI
 */
const PWAInstallPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  useEffect(() => {
    // 检测是否已安装为PWA
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches 
      || (window.navigator as any).standalone === true;
    
    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    // 检测iOS设备
    const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    setIsIOS(isIOSDevice);

    // 监听 beforeinstallprompt 事件（非iOS设备）
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      console.log('🎯 beforeinstallprompt 事件已捕获');
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      
      // 延迟显示提示，避免用户刚打开就弹窗
      const lastDismissed = localStorage.getItem('pwa-prompt-dismissed');
      const dismissedTime = lastDismissed ? parseInt(lastDismissed) : 0;
      const now = Date.now();
      
      // 如果用户30分钟内关闭过提示，不再显示
      if (now - dismissedTime > 30 * 60 * 1000) {
        setTimeout(() => setShowPrompt(true), 3000);
      }
    };

    // 监听安装成功事件
    const handleAppInstalled = () => {
      console.log('✅ PWA 已安装');
      setIsInstalled(true);
      setShowPrompt(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    // iOS设备显示手动安装引导
    if (isIOSDevice) {
      const iosGuideDismissed = localStorage.getItem('ios-guide-dismissed');
      const dismissedTime = iosGuideDismissed ? parseInt(iosGuideDismissed) : 0;
      const now = Date.now();
      
      // 24小时内不重复显示
      if (now - dismissedTime > 24 * 60 * 60 * 1000) {
        setTimeout(() => setShowIOSGuide(true), 5000);
      }
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  // 触发安装
  const handleInstall = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      
      console.log(`用户选择: ${outcome}`);
      
      if (outcome === 'accepted') {
        setIsInstalled(true);
      }
    } catch (err) {
      console.error('安装失败:', err);
    } finally {
      setShowPrompt(false);
      setDeferredPrompt(null);
    }
  };

  // 关闭提示
  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('pwa-prompt-dismissed', Date.now().toString());
  };

  // 关闭iOS引导
  const handleDismissIOSGuide = () => {
    setShowIOSGuide(false);
    localStorage.setItem('ios-guide-dismissed', Date.now().toString());
  };

  // 已安装或无需显示
  if (isInstalled) return null;

  // iOS 设备安装引导
  if (isIOS && showIOSGuide) {
    return (
      <div className="fixed bottom-24 left-4 right-4 z-50 animate-slide-up">
        <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16162a] rounded-2xl p-5 border border-white/10 shadow-2xl shadow-black/50">
          {/* 关闭按钮 */}
          <button 
            onClick={handleDismissIOSGuide}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>

          <div className="flex items-start gap-4">
            {/* 应用图标 */}
            <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyber-lime to-cyan-400 flex items-center justify-center shrink-0 shadow-lg shadow-cyber-lime/20">
              <span className="text-black font-bold text-lg">F</span>
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="text-white font-bold text-base mb-1">添加到主屏幕</h3>
              <p className="text-gray-400 text-sm leading-relaxed">
                点击底部 
                <span className="inline-flex items-center mx-1 px-1.5 py-0.5 bg-white/10 rounded">
                  <svg className="w-4 h-4 text-blue-400" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 2L12 14M12 2L8 6M12 2L16 6"/>
                    <rect x="4" y="10" width="16" height="12" rx="2" fill="none" stroke="currentColor" strokeWidth="2"/>
                  </svg>
                </span>
                分享按钮，然后选择「添加到主屏幕」
              </p>
            </div>
          </div>

          {/* 步骤指引 */}
          <div className="mt-4 flex items-center gap-2 text-xs text-gray-500">
            <span className="px-2 py-1 bg-white/5 rounded">1. 点击分享</span>
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
            <span className="px-2 py-1 bg-white/5 rounded">2. 添加到主屏幕</span>
          </div>
        </div>

        <style>{`
          @keyframes slide-up {
            from { transform: translateY(100%); opacity: 0; }
            to { transform: translateY(0); opacity: 1; }
          }
          .animate-slide-up {
            animation: slide-up 0.4s ease-out;
          }
        `}</style>
      </div>
    );
  }

  // 非iOS设备的标准安装提示
  if (!showPrompt || !deferredPrompt) return null;

  return (
    <div className="fixed bottom-24 left-4 right-4 z-50 animate-slide-up">
      <div className="bg-gradient-to-br from-[#1a1a2e] to-[#16162a] rounded-2xl p-5 border border-white/10 shadow-2xl shadow-black/50">
        {/* 关闭按钮 */}
        <button 
          onClick={handleDismiss}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition-colors"
        >
          <svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>

        <div className="flex items-start gap-4">
          {/* 应用图标 */}
          <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-cyber-lime to-cyan-400 flex items-center justify-center shrink-0 shadow-lg shadow-cyber-lime/20">
            <span className="text-black font-bold text-lg">F</span>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-white font-bold text-base mb-1">安装 Fluxf 应用</h3>
            <p className="text-gray-400 text-sm leading-relaxed">
              安装到桌面，享受更流畅的原生体验
            </p>
          </div>
        </div>

        {/* 功能亮点 */}
        <div className="mt-4 flex flex-wrap gap-2">
          <span className="px-2 py-1 bg-cyber-lime/10 text-cyber-lime text-xs rounded-full border border-cyber-lime/20">
            📱 离线可用
          </span>
          <span className="px-2 py-1 bg-cyan-500/10 text-cyan-400 text-xs rounded-full border border-cyan-500/20">
            ⚡ 秒速启动
          </span>
          <span className="px-2 py-1 bg-purple-500/10 text-purple-400 text-xs rounded-full border border-purple-500/20">
            🔔 消息推送
          </span>
        </div>

        {/* 操作按钮 */}
        <div className="mt-4 flex gap-3">
          <button
            onClick={handleDismiss}
            className="flex-1 py-2.5 px-4 bg-white/5 text-gray-400 text-sm font-medium rounded-xl border border-white/10 hover:bg-white/10 transition-colors"
          >
            稍后再说
          </button>
          <button
            onClick={handleInstall}
            className="flex-1 py-2.5 px-4 bg-gradient-to-r from-cyber-lime to-lime-400 text-black text-sm font-bold rounded-xl shadow-lg shadow-cyber-lime/30 hover:shadow-cyber-lime/50 transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            立即安装
          </button>
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        .animate-slide-up {
          animation: slide-up 0.4s ease-out;
        }
      `}</style>
    </div>
  );
};

export default PWAInstallPrompt;
