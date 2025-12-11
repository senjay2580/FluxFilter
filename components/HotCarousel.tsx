import React, { useState, useEffect, useCallback } from 'react';
import type { VideoWithUploader } from '../lib/database.types';

interface HotCarouselProps {
  videos: VideoWithUploader[];
}

const HotCarousel: React.FC<HotCarouselProps> = ({ videos }) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // 自动轮播
  useEffect(() => {
    if (videos.length <= 1) return;
    
    const timer = setInterval(() => {
      setCurrentIndex(prev => (prev + 1) % videos.length);
    }, 4000); // 4秒切换

    return () => clearInterval(timer);
  }, [videos.length]);

  const goToSlide = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const handleClick = useCallback(() => {
    const video = videos[currentIndex];
    if (video) {
      window.open(`https://www.bilibili.com/video/${video.bvid}`, '_blank');
    }
  }, [videos, currentIndex]);

  if (videos.length === 0) return null;

  const currentVideo = videos[currentIndex];

  return (
    <div className="mb-6">
      {/* 标题 */}
      <div className="flex items-center gap-2 mb-3">
        <svg className="w-4 h-4 text-orange-400" viewBox="0 0 24 24" fill="currentColor">
          <path d="m12 12.9l-2.03 2c-.46.46-.82 1.03-.93 1.67C8.74 18.41 10.18 20 12 20s3.26-1.59 2.96-3.42c-.11-.64-.46-1.22-.93-1.67z"/>
          <path d="M15.56 6.55C14.38 8.02 12 7.19 12 5.3V3.77c0-.8-.89-1.28-1.55-.84C8.12 4.49 4 7.97 4 13c0 2.92 1.56 5.47 3.89 6.86-.5-1.04-.74-2.37-.49-3.68.19-1.04.75-1.98 1.51-2.72l2.71-2.67c.39-.38 1.01-.38 1.4 0l2.73 2.69c.74.73 1.3 1.65 1.48 2.68.25 1.36-.07 2.64-.77 3.66 1.89-1.15 3.29-3.06 3.71-5.3.61-3.27-.81-6.37-3.22-8.1-.33-.25-.8-.2-1.07.13"/>
        </svg>
        <span className="text-sm font-semibold text-white">热门</span>
      </div>

      {/* 轮播图 */}
      <div 
        className="relative rounded-2xl overflow-hidden cursor-pointer group"
        onClick={handleClick}
      >
        {/* 图片容器 */}
        <div className="aspect-[2/1] relative overflow-hidden">
          {videos.map((video, index) => (
            <div
              key={video.bvid}
              className={`absolute inset-0 transition-all duration-500 ease-out ${
                index === currentIndex 
                  ? 'opacity-100 scale-100' 
                  : 'opacity-0 scale-105'
              }`}
            >
              <img 
                src={video.pic || ''} 
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
                alt={video.title}
              />
            </div>
          ))}
          
          {/* 渐变遮罩 */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
        </div>

        {/* 内容 */}
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <p className="text-white font-bold text-base line-clamp-2 mb-2 transition-all">
            {currentVideo?.title}
          </p>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img 
                src={currentVideo?.uploader?.face || ''} 
                className="w-5 h-5 rounded-full"
                referrerPolicy="no-referrer"
              />
              <span className="text-cyber-lime text-xs">{currentVideo?.uploader?.name}</span>
            </div>
            
            {/* 指示器 */}
            <div className="flex items-center gap-1.5">
              {videos.map((_, index) => (
                <button
                  key={index}
                  onClick={(e) => {
                    e.stopPropagation();
                    goToSlide(index);
                  }}
                  className={`h-1 rounded-full transition-all ${
                    index === currentIndex 
                      ? 'w-4 bg-cyber-lime' 
                      : 'w-1 bg-white/40 hover:bg-white/60'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>

       
      </div>
    </div>
  );
};

export default HotCarousel;
