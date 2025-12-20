import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { marked } from 'marked';
import { supabase } from '../../lib/supabase';
import { getStoredUserId } from '../../lib/auth';

interface AIMarkdownProps {
  content: string;
  variant?: 'primary' | 'success' | 'info';
  title?: string;
  defaultCollapsed?: boolean;
}

/**
 * 统一的 AI 输出 Markdown 渲染组件
 * 支持完整的 GFM (GitHub Flavored Markdown) 语法
 * 包括表格、分割线、标题、列表、代码块等
 * 内置复制、导出、折叠以及智能存为笔记功能
 */
export const AIMarkdown: React.FC<AIMarkdownProps> = ({
  content,
  variant = 'primary',
  title = 'AI分析报告',
  defaultCollapsed = false
}) => {
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [saveNoteStatus, setSaveNoteStatus] = useState<'idle' | 'saving' | 'success' | 'error'>('idle');
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const prevContentLength = React.useRef(content.length);
  const [isStreaming, setIsStreaming] = useState(false);

  // 检测是否处于流式输出中（内容长度在短时间内显著增加）
  useEffect(() => {
    if (content.length > prevContentLength.current) {
      setIsStreaming(true);
      const timer = setTimeout(() => setIsStreaming(false), 800);
      prevContentLength.current = content.length;
      return () => clearTimeout(timer);
    }
    prevContentLength.current = content.length;
  }, [content]);
  const colorScheme = {
    primary: {
      accent: 'cyber-lime',
      accentRgb: '157, 255, 0',
      secondary: 'cyan',
      secondaryRgb: '34, 211, 238',
    },
    success: {
      accent: 'emerald-500',
      accentRgb: '16, 185, 129',
      secondary: 'emerald-400',
      secondaryRgb: '52, 211, 153',
    },
    info: {
      accent: 'blue-500',
      accentRgb: '59, 130, 246',
      secondary: 'blue-400',
      secondaryRgb: '96, 165, 250',
    },
  }[variant];

  // 复制到剪贴板
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('复制失败:', err);
    }
  };

  // 导出为 Markdown 文件
  const handleExport = () => {
    try {
      const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${title}_${new Date().toISOString().slice(0, 10)}.md`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 2000);
    } catch (err) {
      console.error('导出失败:', err);
    }
  };

  // 智能存为笔记
  const handleSaveAsNote = async () => {
    setSaveNoteStatus('saving');
    try {
      const userId = getStoredUserId();
      if (!userId) {
        alert('请先登录以保存笔记');
        setSaveNoteStatus('error');
        return;
      }

      // 智能提取标题：优先寻找第一个 # 或 ## 标题
      let extractedTitle = title;
      const titleMatch = content.match(/^#+\s+(.+)$/m);
      if (titleMatch && titleMatch[1]) {
        extractedTitle = titleMatch[1].trim();
      }

      // 将 Markdown 转换为适合笔记存储的 HTML 格式
      // 提取前 100 个字符作为预览（清理掉 MD 字符）
      const previewText = content.replace(/[#*`\n]/g, ' ').slice(0, 100);

      // 使用 marked 将 Markdown 源码转换成 HTML
      const htmlContent = marked.parse(content);

      const { error } = await supabase.from('notes').insert({
        user_id: userId,
        title: extractedTitle,
        content: htmlContent, // 保存转换后的 HTML 代码
        preview: previewText,
        color: 'default',
        category: null,
        is_pinned: false,
        created_at: new Date().toISOString()
      });

      if (error) throw error;

      setSaveNoteStatus('success');
      setTimeout(() => setSaveNoteStatus('idle'), 2000);
    } catch (err) {
      console.error('保存笔记失败:', err);
      setSaveNoteStatus('error');
      setTimeout(() => setSaveNoteStatus('idle'), 3000);
    }
  };

  // 渲染配置 - 使用 useMemo 缓存以防止在流式输出过程中重新创建组件实例（这是导致闪烁的主要原因）
  const markdownComponents = React.useMemo(() => ({
    h1: ({ ...props }) => (
      <h1 className={`text-2xl font-bold text-white mt-6 mb-4 border-l-4 border-${colorScheme.accent} pl-3`} {...props} />
    ),
    h2: ({ ...props }) => (
      <h2 className={`text-xl font-bold text-white mt-5 mb-3 border-l-4 border-${colorScheme.accent} pl-3`} {...props} />
    ),
    h3: ({ ...props }) => (
      <h3 className={`text-lg font-bold text-white mt-4 mb-2 border-l-4 border-${colorScheme.secondary} pl-3`} {...props} />
    ),
    h4: ({ ...props }) => (
      <h4 className={`text-base font-bold text-white mt-3 mb-2 border-l-4 border-${colorScheme.secondary} pl-3`} {...props} />
    ),
    p: ({ ...props }) => (
      <p className="text-sm text-gray-300 leading-relaxed my-2" {...props} />
    ),
    ul: ({ ...props }) => (
      <ul className="space-y-1 my-3 list-none" {...props} />
    ),
    ol: ({ ...props }) => (
      <ol className="space-y-1 my-3 list-decimal pl-6" {...props} />
    ),
    li: ({ ...props }) => (
      <li className="list-none relative pl-5 py-1 text-sm text-gray-300 leading-relaxed">
        <span className={`absolute left-0 top-3 w-1.5 h-1.5 rounded-full bg-${colorScheme.secondary}/40`} />
        <span {...props} />
      </li>
    ),
    strong: ({ ...props }) => (
      <strong className={`text-${colorScheme.secondary} font-bold`} {...props} />
    ),
    hr: ({ ...props }) => (
      <hr className="my-4 border-t border-white/10" {...props} />
    ),
    table: ({ ...props }) => (
      <div className="overflow-x-auto my-4">
        <table className="w-full border-collapse border border-white/10 rounded-lg" {...props} />
      </div>
    ),
    thead: ({ ...props }) => (
      <thead className="bg-white/5" {...props} />
    ),
    tbody: ({ ...props }) => (
      <tbody {...props} />
    ),
    tr: ({ ...props }) => (
      <tr className="border-b border-white/10 hover:bg-white/5 transition-colors" {...props} />
    ),
    th: ({ ...props }) => (
      <th className={`px-4 py-2 text-left text-xs font-bold text-${colorScheme.secondary} border-r border-white/10 last:border-r-0`} {...props} />
    ),
    td: ({ ...props }) => (
      <td className="px-4 py-2 text-sm text-gray-300 border-r border-white/10 last:border-r-0" {...props} />
    ),
    code: ({ inline, ...props }: any) =>
      inline ? (
        <code className={`bg-white/10 px-1.5 py-0.5 rounded text-xs text-${colorScheme.secondary} font-mono`} {...props} />
      ) : (
        <code className={`block bg-white/10 p-3 rounded-lg text-xs text-${colorScheme.secondary} font-mono overflow-x-auto`} {...props} />
      ),
    blockquote: ({ ...props }) => (
      <blockquote className={`border-l-4 border-${colorScheme.accent}/30 bg-white/5 pl-4 py-2 my-3 italic text-gray-400`} {...props} />
    ),
  }), [colorScheme.accent, colorScheme.secondary, colorScheme.secondaryRgb]);

  return (
    <div className="relative">
      {/* Markdown 内容 */}
      <div className="markdown-content">
        {/* 操作按钮条 */}
        <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-white/10 overflow-x-auto no-scrollbar">
          {/* 左侧：折叠按钮 */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10 shrink-0"
          >
            <svg
              className={`w-3.5 h-3.5 transition-transform duration-200 ${isCollapsed ? '' : 'rotate-90'}`}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>

          {/* 右侧：操作按钮组 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 存为笔记按钮 */}
            <button
              onClick={handleSaveAsNote}
              disabled={saveNoteStatus === 'saving'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${saveNoteStatus === 'success'
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : saveNoteStatus === 'error'
                  ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                  : 'bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-blue-300 border border-blue-500/20'
                }`}
            >
              {saveNoteStatus === 'saving' ? (
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
              ) : saveNoteStatus === 'success' ? (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M20 6L9 17l-5-5" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              )}
              <span>
                {saveNoteStatus === 'saving' ? '保存中...' :
                  saveNoteStatus === 'success' ? '已存为笔记' :
                    saveNoteStatus === 'error' ? '保存失败' : '存为笔记'}
              </span>
            </button>

            {/* 复制按钮 */}
            <button
              onClick={handleCopy}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${copySuccess
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10'
                }`}
            >
              {copySuccess ? (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </>
              )}
            </button>

            {/* 导出按钮 */}
            <button
              onClick={handleExport}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${downloadSuccess
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : 'bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10'
                }`}
            >
              {downloadSuccess ? (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 6L9 17l-5-5" />
                  </svg>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 可折叠的内容区域 - 优化移动端图层渲染稳定性 */}
        <div
          className={`relative ${isStreaming ? '' : 'transition-opacity duration-300 ease-in-out'} ${isCollapsed ? 'max-h-0 opacity-0 overflow-hidden' : 'max-h-none opacity-100'
            }`}
          style={{
            transform: 'translateZ(0)', // 强制开启独立合成层，解决滑动白块
            backfaceVisibility: 'hidden',
            perspective: '1000px',
            WebkitBackfaceVisibility: 'hidden'
          }}
        >
          <div className="pb-4">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={markdownComponents}
            >
              {content}
            </ReactMarkdown>
          </div>
        </div>

        {/* 折叠时显示的摘要提示 */}
        {isCollapsed && (
          <div className="text-center py-4 text-gray-500 text-xs">
            内容已折叠，点击"展开内容"查看完整报告
          </div>
        )}
      </div>
    </div>
  );
};
