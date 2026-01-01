import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { 
  getVideoSubtitles, 
  formatTimestamp,
  type SubtitleContent 
} from '../../lib/bilibili';
import { 
  getYouTubeTranscript, 
  type YouTubeCaption 
} from '../../lib/youtube';
import { generateVideoSummaryStream, isAIConfigured, type VideoSummaryResult } from '../../lib/video-summary-service';

interface AISummaryModalProps {
  bvid: string;
  title: string;
  onClose: () => void;
}

type TabType = 'summary' | 'subtitle';

// 检测是否为 YouTube 视频
const isYouTubeVideo = (bvid: string) => bvid.startsWith('YT_');
const getYouTubeVideoId = (bvid: string) => bvid.replace('YT_', '');

const AISummaryModal: React.FC<AISummaryModalProps> = ({ bvid, title, onClose }) => {
  const [activeTab, setActiveTab] = useState<TabType>('summary');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  
  // 平台检测
  const isYT = isYouTubeVideo(bvid);
  
  // AI总结数据
  const [summary, setSummary] = useState<VideoSummaryResult | null>(null);
  const [streamingText, setStreamingText] = useState<string>('');
  
  // 字幕数据（B站格式）
  const [subtitles, setSubtitles] = useState<SubtitleContent | null>(null);
  const [subtitleLang, setSubtitleLang] = useState<string>('');
  const [fullSubtitleText, setFullSubtitleText] = useState<string>('');
  
  // YouTube 字幕数据
  const [ytCaptions, setYtCaptions] = useState<YouTubeCaption[]>([]);
  
  // AbortController for canceling requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // 加载字幕数据
  const loadSubtitles = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      if (isYT) {
        // YouTube 视频：使用 YouTube 字幕 API
        const videoId = getYouTubeVideoId(bvid);
        const result = await getYouTubeTranscript(videoId);
        
        if (result && result.captions.length > 0) {
          setYtCaptions(result.captions);
          setFullSubtitleText(result.fullText);
          setSubtitleLang('auto');
        } else {
          setError('该 YouTube 视频暂无字幕，可尝试使用语音转文字功能');
        }
      } else {
        // B站视频：使用原有逻辑
        const data = await getVideoSubtitles(bvid);
        if (data) {
          setSubtitles(data.content);
          setSubtitleLang(data.language);
          const fullText = data.content.body.map(item => item.content).join('\n');
          setFullSubtitleText(fullText);
        } else {
          setError('该视频暂无字幕，无法生成总结');
        }
      }
    } catch (err) {
      setError('获取字幕失败，请检查网络');
    } finally {
      setLoading(false);
    }
  }, [bvid, isYT]);

  // 生成AI总结（流式）
  const generateSummary = useCallback(async () => {
    if (!fullSubtitleText) {
      setError('请先获取字幕');
      return;
    }

    if (!isAIConfigured()) {
      setError('请先在设置中配置 AI 模型和 API Key');
      return;
    }

    // 取消之前的请求
    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setGenerating(true);
    setError(null);
    setStreamingText('');
    setSummary(null);

    try {
      const result = await generateVideoSummaryStream(
        fullSubtitleText,
        title,
        (text, done) => {
          setStreamingText(text);
          if (done) {
            try {
              const jsonMatch = text.match(/\{[\s\S]*\}/);
              if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                setSummary({
                  summary: parsed.summary || text,
                  keyPoints: parsed.keyPoints || [],
                  outline: parsed.outline || [],
                });
              }
            } catch {
              setSummary({ summary: text, keyPoints: [], outline: [] });
            }
          }
        },
        abortControllerRef.current.signal
      );

      if (!result.success && result.error !== '已取消') {
        setError(result.error || '生成总结失败');
      }
    } catch (err) {
      setError('生成总结失败');
    } finally {
      setGenerating(false);
    }
  }, [fullSubtitleText, title]);

  // 组件挂载时加载字幕
  useEffect(() => {
    loadSubtitles();
    return () => {
      abortControllerRef.current?.abort();
    };
  }, [loadSubtitles]);

  // 复制全部内容
  const handleCopy = useCallback(() => {
    let text = '';
    
    if (activeTab === 'summary' && summary) {
      text = `【AI总结】${title}\n\n${summary.summary}\n\n`;
      if (summary.keyPoints?.length > 0) {
        text += '【关键要点】\n';
        summary.keyPoints.forEach((point, idx) => {
          text += `${idx + 1}. ${point}\n`;
        });
      }
      if (summary.outline?.length > 0) {
        text += '\n【章节大纲】\n';
        summary.outline.forEach(section => {
          text += `• ${section.title}: ${section.content}\n`;
        });
      }
    } else if (activeTab === 'subtitle') {
      text = `【字幕】${title}\n\n`;
      if (isYT && ytCaptions.length > 0) {
        // YouTube 字幕格式
        text += ytCaptions.map(cap => {
          const mins = Math.floor(cap.start / 60);
          const secs = Math.floor(cap.start % 60);
          return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')} ${cap.text}`;
        }).join('\n');
      } else if (subtitles) {
        // B站字幕格式
        text += subtitles.body.map(item => 
          `${formatTimestamp(item.from)} ${item.content}`
        ).join('\n');
      }
    }

    navigator.clipboard.writeText(text).then(() => {
      alert('已复制到剪贴板');
    });
  }, [activeTab, summary, subtitles, ytCaptions, title, isYT]);

  // 禁止背景滚动
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  return createPortal(
    <div className="fixed inset-0 z-[99999]" onClick={onClose}>
      {/* 遮罩 */}
      <div className="absolute inset-0 bg-black/80 animate-fade-in" />
      
      {/* 弹窗内容 */}
      <div 
        className="absolute inset-x-4 top-[10%] bottom-[10%] md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-[600px] md:max-w-[90vw]
                   bg-[#0f0f12] border border-white/10 rounded-2xl shadow-2xl flex flex-col overflow-hidden
                   animate-scale-in"
        onClick={e => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
          <div className="flex-1 min-w-0 pr-4">
            <h3 className="text-white font-semibold text-sm truncate">{title}</h3>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition-colors"
          >
            <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab切换 */}
        <div className="flex border-b border-white/10 shrink-0">
          <button
            onClick={() => setActiveTab('summary')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'summary' ? 'text-cyber-lime' : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              AI总结
            </span>
            {activeTab === 'summary' && (
              <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-cyber-lime rounded-full" />
            )}
          </button>
          <button
            onClick={() => setActiveTab('subtitle')}
            className={`flex-1 py-3 text-sm font-medium transition-colors relative ${
              activeTab === 'subtitle' ? 'text-cyber-lime' : 'text-gray-400 hover:text-white'
            }`}
          >
            <span className="flex items-center justify-center gap-2">
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="2" y="6" width="20" height="12" rx="2" />
                <path d="M6 12h4M14 12h4M8 15h8" />
              </svg>
              字幕
              {subtitleLang && activeTab === 'subtitle' && (
                <span className="text-xs text-gray-500">({subtitleLang})</span>
              )}
            </span>
            {activeTab === 'subtitle' && (
              <div className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-cyber-lime rounded-full" />
            )}
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="w-8 h-8 border-2 border-cyber-lime/30 border-t-cyber-lime rounded-full animate-spin" />
              <span className="text-gray-400 text-sm">加载中...</span>
            </div>
          ) : error ? (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                <svg className="w-8 h-8 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" />
                  <path d="M12 8v4M12 16h.01" />
                </svg>
              </div>
              <p className="text-gray-400 text-sm text-center whitespace-pre-line">{error}</p>
              <button
                onClick={loadSubtitles}
                className="px-4 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-white text-sm transition-colors"
              >
                重试
              </button>
            </div>
          ) : activeTab === 'summary' ? (
            <div className="space-y-4">
              {/* 未生成总结时显示生成按钮 */}
              {!summary && !generating && (
                <div className="flex flex-col items-center justify-center py-8 gap-4">
                  <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500/20 to-cyan-500/20 flex items-center justify-center">
                    <svg className="w-8 h-8 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                  </div>
                  <p className="text-gray-400 text-sm text-center">
                    {subtitles ? '已获取字幕，点击生成AI总结' : '正在获取字幕...'}
                  </p>
                  {subtitles && (
                    <button
                      onClick={generateSummary}
                      className="px-6 py-2.5 bg-gradient-to-r from-purple-500 to-cyan-500 text-white font-medium rounded-xl hover:opacity-90 transition-opacity flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                      </svg>
                      生成AI总结
                    </button>
                  )}
                </div>
              )}

              {/* 生成中 - 显示流式输出 */}
              {generating && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2 text-gray-400 text-sm">
                    <div className="w-4 h-4 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
                    <span>AI正在分析字幕内容...</span>
                  </div>
                  {streamingText && (
                    <div className="bg-white/5 rounded-xl p-4">
                      <pre className="text-gray-300 text-sm leading-relaxed whitespace-pre-wrap font-sans">
                        {streamingText}
                        <span className="inline-block w-2 h-4 bg-cyber-lime/70 animate-pulse ml-0.5" />
                      </pre>
                    </div>
                  )}
                </div>
              )}

              {/* 总结内容 */}
              {summary && (
                <>
                  {/* 视频摘要 - 分段渲染 */}
                  <div className="bg-gradient-to-br from-purple-500/10 to-cyan-500/10 rounded-xl p-4 border border-white/5">
                    <h4 className="text-cyber-lime text-xs font-medium mb-3 flex items-center gap-1.5">
                      <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
                      </svg>
                      视频摘要
                    </h4>
                    <div className="space-y-3">
                      {summary.summary.split('\n\n').map((paragraph, idx) => {
                        // 检查是否是标题行（以【开头）
                        if (paragraph.startsWith('【')) {
                          const titleMatch = paragraph.match(/^【(.+?)】(.*)$/s);
                          if (titleMatch) {
                            return (
                              <div key={idx}>
                                <span className="text-cyan-400 text-xs font-medium">【{titleMatch[1]}】</span>
                                <p className="text-gray-300 text-sm leading-relaxed mt-1">
                                  {titleMatch[2].trim()}
                                </p>
                              </div>
                            );
                          }
                        }
                        return (
                          <p key={idx} className="text-gray-300 text-sm leading-relaxed">
                            {paragraph}
                          </p>
                        );
                      })}
                    </div>
                  </div>

                  {/* 关键要点 - 卡片式布局 */}
                  {summary.keyPoints?.length > 0 && (
                    <div className="bg-white/5 rounded-xl p-4">
                      <h4 className="text-cyan-400 text-xs font-medium mb-3 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M9 12l2 2 4-4" />
                          <circle cx="12" cy="12" r="10" />
                        </svg>
                        关键要点
                      </h4>
                      <div className="grid gap-2">
                        {summary.keyPoints.map((point, idx) => (
                          <div 
                            key={idx} 
                            className="bg-white/5 rounded-lg px-3 py-2.5 text-gray-300 text-sm flex items-start gap-2 hover:bg-white/10 transition-colors"
                          >
                            <span className="text-base leading-5">{point.match(/^[^\s]+/)?.[0] || '•'}</span>
                            <span className="leading-relaxed">{point.replace(/^[^\s]+\s*/, '')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 章节大纲 - 时间线样式 */}
                  {summary.outline?.length > 0 && (
                    <div className="bg-white/5 rounded-xl p-4">
                      <h4 className="text-white text-xs font-medium mb-3 flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M4 6h16M4 12h16M4 18h16" />
                        </svg>
                        章节大纲
                      </h4>
                      <div className="space-y-0 relative">
                        {/* 时间线 */}
                        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-gradient-to-b from-purple-500/50 via-cyan-500/50 to-cyber-lime/50" />
                        {summary.outline.map((section, idx) => (
                          <div key={idx} className="relative pl-6 pb-3 last:pb-0">
                            {/* 节点 */}
                            <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-[#0f0f12] border-2 border-cyan-500/70 flex items-center justify-center">
                              <div className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                            </div>
                            <div className="bg-white/5 rounded-lg p-3 hover:bg-white/10 transition-colors">
                              <h5 className="text-white text-sm font-medium">{section.title}</h5>
                              {section.content && (
                                <p className="text-gray-400 text-xs mt-1 leading-relaxed">{section.content}</p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          ) : activeTab === 'subtitle' && (subtitles || ytCaptions.length > 0) ? (
            <div className="space-y-1">
              {isYT ? (
                // YouTube 字幕显示
                ytCaptions.map((cap, idx) => {
                  const mins = Math.floor(cap.start / 60);
                  const secs = Math.floor(cap.start % 60);
                  const timestamp = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                  return (
                    <div 
                      key={idx} 
                      className="flex gap-3 py-1.5 hover:bg-white/5 rounded px-2 -mx-2 transition-colors group"
                    >
                      <span className="text-red-400/70 font-mono text-xs shrink-0 pt-0.5 group-hover:text-red-400">
                        {timestamp}
                      </span>
                      <span className="text-gray-300 text-sm leading-relaxed">
                        {cap.text}
                      </span>
                    </div>
                  );
                })
              ) : subtitles ? (
                // B站字幕显示
                subtitles.body.map((item, idx) => (
                  <div 
                    key={idx} 
                    className="flex gap-3 py-1.5 hover:bg-white/5 rounded px-2 -mx-2 transition-colors group"
                  >
                    <span className="text-cyber-lime/70 font-mono text-xs shrink-0 pt-0.5 group-hover:text-cyber-lime">
                      {formatTimestamp(item.from)}
                    </span>
                    <span className="text-gray-300 text-sm leading-relaxed">
                      {item.content}
                    </span>
                  </div>
                ))
              ) : null}
            </div>
          ) : null}
        </div>

        {/* 底部操作栏 */}
        {!loading && !error && (summary || subtitles || ytCaptions.length > 0) && (
          <div className="border-t border-white/10 px-4 py-3 flex gap-3 shrink-0">
            <button
              onClick={handleCopy}
              className="flex-1 py-2.5 bg-cyber-lime text-black font-medium rounded-xl hover:bg-cyber-lime/90 transition-colors flex items-center justify-center gap-2"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
              </svg>
              复制全部
            </button>
            <button
              onClick={() => {
                const url = isYT 
                  ? `https://www.youtube.com/watch?v=${getYouTubeVideoId(bvid)}`
                  : `https://www.bilibili.com/video/${bvid}`;
                window.open(url, '_blank');
              }}
              className={`px-4 py-2.5 rounded-xl text-white transition-colors flex items-center gap-2 ${
                isYT ? 'bg-red-500/20 hover:bg-red-500/30' : 'bg-white/10 hover:bg-white/15'
              }`}
            >
              {isYT ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
                </svg>
              ) : (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
                  <polyline points="15 3 21 3 21 9" />
                  <line x1="10" y1="14" x2="21" y2="3" />
                </svg>
              )}
              {isYT ? 'YouTube' : 'B站'}
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

export default AISummaryModal;
