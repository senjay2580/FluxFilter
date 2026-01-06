import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { aiSearchResourcesStream, SearchableItem, SearchResult } from '../../lib/resource-ai-search';

interface AISearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: SearchableItem[];
}

interface SearchHistory {
  id: string;
  query: string;
  results: SearchResult[];
  summary: string;
  timestamp: number;
}

const HISTORY_KEY = 'ai_search_history';
const MAX_HISTORY = 30;

// 历史记录管理
const getHistory = (): SearchHistory[] => {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
};

const saveHistory = (history: SearchHistory[]) => {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
};

const addHistory = (query: string, results: SearchResult[], summary: string) => {
  const history = getHistory();
  const newItem: SearchHistory = {
    id: Date.now().toString(),
    query,
    results,
    summary,
    timestamp: Date.now(),
  };
  // 去重：如果相同查询已存在，先删除旧的
  const filtered = history.filter(h => h.query !== query);
  saveHistory([newItem, ...filtered]);
};

const deleteHistory = (id: string) => {
  const history = getHistory();
  saveHistory(history.filter(h => h.id !== id));
};

const clearAllHistory = () => {
  localStorage.removeItem(HISTORY_KEY);
};

const AISearchModal: React.FC<AISearchModalProps> = ({ isOpen, onClose, items }) => {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [summary, setSummary] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [history, setHistory] = useState<SearchHistory[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
      setQuery('');
      setResults([]);
      setSummary('');
      setHasSearched(false);
      setIsStreaming(false);
      setShowHistory(false);
      setHistory(getHistory());
    }
  }, [isOpen]);

  const handleSearch = async () => {
    if (!query.trim() || loading) return;
    
    setLoading(true);
    setHasSearched(true);
    setResults([]);
    setSummary('');
    setIsStreaming(true);
    setShowHistory(false);
    
    await aiSearchResourcesStream(
      query,
      items,
      (partialResults) => {
        setResults([...partialResults]);
      },
      (searchResults, searchSummary) => {
        setResults([...searchResults]);
        setSummary(searchSummary);
        setIsStreaming(false);
        setLoading(false);
        if (searchResults.length > 0) {
          addHistory(query, searchResults, searchSummary);
          setHistory(getHistory());
        }
      },
      (error) => {
        setSummary(error);
        setIsStreaming(false);
        setLoading(false);
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSearch();
    }
  };

  const loadFromHistory = (item: SearchHistory) => {
    setQuery(item.query);
    setResults(item.results);
    setSummary(item.summary);
    setHasSearched(true);
    setShowHistory(false);
  };

  const handleDeleteHistory = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    deleteHistory(id);
    setHistory(getHistory());
  };

  const handleClearAll = () => {
    clearAllHistory();
    setHistory([]);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - timestamp;
    
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
    if (date.toDateString() === now.toDateString()) return '今天';
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex flex-col bg-[#0a0a0f] overflow-hidden">
      {/* 头部 */}
      <div className="flex items-center gap-2 sm:gap-3 p-3 sm:p-4 border-b border-white/10 bg-black/50 backdrop-blur-xl shrink-0">
        <button onClick={onClose} className="p-2 rounded-xl hover:bg-white/10 transition-colors">
          <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-br from-cyber-lime/20 to-emerald-500/20 flex items-center justify-center shrink-0">
          <svg className="w-4 h-4 sm:w-5 sm:h-5 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
            <path d="M11 8v6M8 11h6" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-white font-semibold text-sm sm:text-base truncate">AI 智能搜索</h3>
          <p className="text-gray-500 text-xs hidden sm:block">用自然语言描述你想找的资源</p>
        </div>
        <button 
          onClick={() => setShowHistory(!showHistory)} 
          className={`p-2 rounded-xl transition-colors ${showHistory ? 'bg-cyber-lime/20 text-cyber-lime' : 'hover:bg-white/10 text-gray-400'}`}
        >
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </button>
      </div>

      {/* 搜索输入 */}
      <div className="p-3 sm:p-4 border-b border-white/5 shrink-0">
        <div className="relative max-w-2xl mx-auto w-full">
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => !hasSearched && history.length > 0 && setShowHistory(true)}
            placeholder="例如：那个AI画图的网站、之前收藏的Redis文档..."
            className="w-full px-4 py-3 pr-12 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50 text-sm"
          />
          <button
            onClick={handleSearch}
            disabled={loading || !query.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg bg-cyber-lime text-black disabled:opacity-50 disabled:cursor-not-allowed hover:bg-cyber-lime/90 transition-colors"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
            ) : (
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden">
        <div className="max-w-2xl mx-auto p-3 sm:p-4">
          {/* 历史记录面板 */}
          {showHistory && (
            <div className="mb-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-gray-400 text-sm">搜索历史</span>
                {history.length > 0 && (
                  <button onClick={handleClearAll} className="text-xs text-red-400 hover:text-red-300">
                    清空全部
                  </button>
                )}
              </div>
              {history.length === 0 ? (
                <p className="text-gray-600 text-sm text-center py-8">暂无搜索历史</p>
              ) : (
                <div className="space-y-2">
                  {history.map(item => (
                    <div
                      key={item.id}
                      onClick={() => loadFromHistory(item)}
                      className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/5 hover:border-cyber-lime/30 hover:bg-white/10 transition-all cursor-pointer group"
                    >
                      <svg className="w-4 h-4 text-gray-500 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-sm truncate">{item.query}</p>
                        <p className="text-gray-500 text-xs">{item.results.length} 个结果 · {formatTime(item.timestamp)}</p>
                      </div>
                      <button
                        onClick={(e) => handleDeleteHistory(e, item.id)}
                        className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-red-500/20 transition-all"
                      >
                        <svg className="w-4 h-4 text-red-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 搜索结果 */}
          {hasSearched && !showHistory && (
            <div>
              {results.length > 0 ? (
                <>
                  <p className={`text-xs mb-4 flex items-center gap-2 ${isStreaming ? 'text-cyber-lime' : 'text-gray-400'}`}>
                    {isStreaming && <span className="w-2 h-2 bg-cyber-lime rounded-full animate-pulse" />}
                    {isStreaming ? `正在搜索... 已找到 ${results.length} 个结果` : summary}
                  </p>
                  <div className="grid gap-2 sm:gap-3 grid-cols-1 sm:grid-cols-2">
                    {results.map((result, index) => (
                      <a
                        key={result.id || index}
                        href={result.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 sm:gap-3 p-3 sm:p-4 rounded-xl bg-white/5 border border-white/5 hover:border-cyber-lime/30 hover:bg-white/10 transition-all group overflow-hidden"
                        style={{ animation: `slideIn 0.3s ease-out ${index * 30}ms both` }}
                      >
                        <span className="w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-cyber-lime/20 text-cyber-lime text-xs font-bold flex items-center justify-center shrink-0">
                          {index + 1}
                        </span>
                        <div className="flex-1 min-w-0 overflow-hidden">
                          <p className="text-white text-sm font-medium truncate group-hover:text-cyber-lime transition-colors">
                            {result.name}
                          </p>
                          <p className="text-gray-500 text-xs truncate mt-1">
                            {(() => { try { return new URL(result.url).hostname; } catch { return result.url; } })()}
                          </p>
                          <div className="flex items-center gap-1.5 sm:gap-2 mt-2 flex-wrap">
                            {result.folder && (
                              <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 text-[10px] truncate max-w-[100px] sm:max-w-none">
                                📁 {result.folder}
                              </span>
                            )}
                            {result.confidence && (
                              <span className={`text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full font-medium shrink-0 ${
                                result.confidence >= 80 ? 'bg-cyber-lime/20 text-cyber-lime' :
                                result.confidence >= 50 ? 'bg-amber-500/20 text-amber-400' :
                                'bg-white/10 text-gray-400'
                              }`}>
                                {result.confidence}%
                              </span>
                            )}
                            <span className="text-[10px] text-gray-500 truncate max-w-[60px] sm:max-w-24">
                              {result.relevance}
                            </span>
                          </div>
                        </div>
                        <svg className="w-4 h-4 text-gray-500 group-hover:text-cyber-lime transition-colors shrink-0 mt-0.5 hidden sm:block" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                          <polyline points="15 3 21 3 21 9" />
                          <line x1="10" y1="14" x2="21" y2="3" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </>
              ) : loading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-10 h-10 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin" />
                  <span className="ml-4 text-gray-400">AI 正在分析...</span>
                </div>
              ) : (
                <div className="text-center py-20">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <circle cx="11" cy="11" r="8" />
                      <path d="M21 21l-4.35-4.35" />
                    </svg>
                  </div>
                  <p className="text-gray-400">{summary || '未找到相关资源'}</p>
                  <p className="text-gray-600 text-sm mt-2">试试换个描述方式</p>
                </div>
              )}
            </div>
          )}

          {/* 初始提示 */}
          {!hasSearched && !showHistory && (
            <div className="py-10">
              <div className="bg-white/5 rounded-2xl p-6 max-w-md mx-auto">
                <p className="text-gray-400 text-sm mb-4">💡 搜索技巧</p>
                <div className="space-y-3 text-gray-500 text-sm">
                  <p>• 描述功能：「那个可以画图的AI」</p>
                  <p>• 描述类型：「Java相关的文档」</p>
                  <p>• 描述记忆：「之前收藏的临时邮箱」</p>
                  <p>• 模糊搜索：「免费部署网站的工具」</p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
};

export default AISearchModal;
