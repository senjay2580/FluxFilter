import React from 'react';

export type Platform = 'bilibili' | 'youtube' | 'all';

interface PlatformTabsProps {
  activePlatform: Platform;
  onChange: (platform: Platform) => void;
  counts?: {
    bilibili: number;
    youtube: number;
  };
}

const PlatformTabs: React.FC<PlatformTabsProps> = ({ activePlatform, onChange, counts }) => {
  const tabs: { id: Platform; label: string; icon: React.ReactNode; color: string }[] = [
    {
      id: 'all',
      label: '全部',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <rect x="14" y="14" width="7" height="7" rx="1" />
        </svg>
      ),
      color: 'cyber-lime'
    },
    {
      id: 'bilibili',
      label: 'B站',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.813 4.653h.854c1.51.054 2.769.578 3.773 1.574 1.004.995 1.524 2.249 1.56 3.76v7.36c-.036 1.51-.556 2.769-1.56 3.773s-2.262 1.524-3.773 1.56H5.333c-1.51-.036-2.769-.556-3.773-1.56S.036 18.858 0 17.347v-7.36c.036-1.511.556-2.765 1.56-3.76 1.004-.996 2.262-1.52 3.773-1.574h.774l-1.174-1.12a1.234 1.234 0 0 1-.373-.906c0-.356.124-.659.373-.907l.027-.027c.267-.249.573-.373.92-.373.347 0 .653.124.92.373L9.653 4.44c.071.071.134.142.187.213h4.267a.836.836 0 0 1 .16-.213l2.853-2.747c.267-.249.573-.373.92-.373.347 0 .662.151.929.4.267.249.391.551.391.907 0 .355-.124.657-.373.906L17.813 4.653zM5.333 7.24c-.746.018-1.373.276-1.88.773-.506.498-.769 1.13-.786 1.894v7.52c.017.764.28 1.395.786 1.893.507.498 1.134.756 1.88.773h13.334c.746-.017 1.373-.275 1.88-.773.506-.498.769-1.129.786-1.893v-7.52c-.017-.765-.28-1.396-.786-1.894-.507-.497-1.134-.755-1.88-.773H5.333zM8 11.107c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c0-.373.129-.689.386-.947.258-.257.574-.386.947-.386zm8 0c.373 0 .684.124.933.373.25.249.383.569.4.96v1.173c-.017.391-.15.711-.4.96-.249.25-.56.374-.933.374s-.684-.125-.933-.374c-.25-.249-.383-.569-.4-.96V12.44c.017-.391.15-.711.4-.96.249-.249.56-.373.933-.373z"/>
        </svg>
      ),
      color: 'pink-500'
    },
    {
      id: 'youtube',
      label: 'YouTube',
      icon: (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
        </svg>
      ),
      color: 'red-500'
    }
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-white/5 rounded-xl border border-white/10">
      {tabs.map(tab => {
        const isActive = activePlatform === tab.id;
        const count = tab.id === 'all' 
          ? (counts?.bilibili || 0) + (counts?.youtube || 0)
          : counts?.[tab.id] || 0;

        return (
          <button
            key={tab.id}
            onClick={() => onChange(tab.id)}
            className={`
              flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all duration-200
              ${isActive 
                ? tab.id === 'bilibili'
                  ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30'
                  : tab.id === 'youtube'
                    ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                    : 'bg-cyber-lime/20 text-cyber-lime border border-cyber-lime/30'
                : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
              }
            `}
          >
            {tab.icon}
            <span>{tab.label}</span>
            {count > 0 && (
              <span className={`
                px-1.5 py-0.5 rounded-full text-[10px] font-bold
                ${isActive 
                  ? tab.id === 'bilibili'
                    ? 'bg-pink-500/30 text-pink-300'
                    : tab.id === 'youtube'
                      ? 'bg-red-500/30 text-red-300'
                      : 'bg-cyber-lime/30 text-cyber-lime'
                  : 'bg-white/10 text-gray-500'
                }
              `}>
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
};

export default PlatformTabs;
