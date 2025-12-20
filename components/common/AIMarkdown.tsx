import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

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
 * 内置复制、导出和折叠功能
 */
export const AIMarkdown: React.FC<AIMarkdownProps> = ({
  content,
  variant = 'primary',
  title = 'AI分析报告',
  defaultCollapsed = false
}) => {
  const [copySuccess, setCopySuccess] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  // 根据变体选择颜色主题
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

  return (
    <div className="relative">
      {/* Markdown 内容 */}
      <div className="markdown-content">
        {/* 操作按钮条 */}
        <div className="flex items-center justify-between gap-2 mb-4 pb-3 border-b border-white/10">
          {/* 折叠按钮 */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white border border-white/10"
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

          {/* 右侧操作按钮 */}
          <div className="flex items-center gap-2">
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

        {/* 可折叠的内容区域 */}
        <div
          className={`overflow-hidden transition-all duration-300 ease-in-out ${isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[5000px] opacity-100'
            }`}
        >
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              h1: ({ node, ...props }) => (
                <h1 className={`text-2xl font-bold text-white mt-6 mb-4 border-l-4 border-${colorScheme.accent} pl-3`} {...props} />
              ),
              h2: ({ node, ...props }) => (
                <h2 className={`text-xl font-bold text-white mt-5 mb-3 border-l-4 border-${colorScheme.accent} pl-3`} {...props} />
              ),
              h3: ({ node, ...props }) => (
                <h3 className={`text-lg font-bold text-white mt-4 mb-2 border-l-4 border-${colorScheme.secondary} pl-3`} {...props} />
              ),
              h4: ({ node, ...props }) => (
                <h4 className={`text-base font-bold text-white mt-3 mb-2 border-l-4 border-${colorScheme.secondary} pl-3`} {...props} />
              ),
              p: ({ node, ...props }) => (
                <p className="text-sm text-gray-300 leading-relaxed my-2" {...props} />
              ),
              ul: ({ node, ...props }) => (
                <ul className="space-y-2 my-3" {...props} />
              ),
              ol: ({ node, ...props }) => (
                <ol className="space-y-2 my-3 list-decimal list-inside" {...props} />
              ),
              li: ({ node, ...props }) => (
                <li className="flex gap-2 pl-2 text-sm text-gray-300">
                  <span className={`text-${colorScheme.secondary} flex-shrink-0 mt-1.5 w-1.5 h-1.5 rounded-full bg-${colorScheme.secondary}/50`} style={{ boxShadow: `0 0 8px rgba(${colorScheme.secondaryRgb}, 0.5)` }} />
                  <span className="flex-1" {...props} />
                </li>
              ),
              strong: ({ node, ...props }) => (
                <strong className={`text-${colorScheme.secondary} font-bold bg-${colorScheme.secondary}/20 border border-${colorScheme.secondary}/20 px-1.5 py-0.5 rounded mx-0.5`} style={{ boxShadow: `0 0 10px rgba(${colorScheme.secondaryRgb}, 0.1)` }} {...props} />
              ),
              hr: ({ node, ...props }) => (
                <hr className="my-4 border-t border-white/10" {...props} />
              ),
              table: ({ node, ...props }) => (
                <div className="overflow-x-auto my-4">
                  <table className="w-full border-collapse border border-white/10 rounded-lg" {...props} />
                </div>
              ),
              thead: ({ node, ...props }) => (
                <thead className="bg-white/5" {...props} />
              ),
              tbody: ({ node, ...props }) => (
                <tbody {...props} />
              ),
              tr: ({ node, ...props }) => (
                <tr className="border-b border-white/10 hover:bg-white/5 transition-colors" {...props} />
              ),
              th: ({ node, ...props }) => (
                <th className={`px-4 py-2 text-left text-xs font-bold text-${colorScheme.secondary} border-r border-white/10 last:border-r-0`} {...props} />
              ),
              td: ({ node, ...props }) => (
                <td className="px-4 py-2 text-sm text-gray-300 border-r border-white/10 last:border-r-0" {...props} />
              ),
              code: ({ node, inline, ...props }: any) =>
                inline ? (
                  <code className={`bg-white/10 px-1.5 py-0.5 rounded text-xs text-${colorScheme.secondary} font-mono`} {...props} />
                ) : (
                  <code className={`block bg-white/10 p-3 rounded-lg text-xs text-${colorScheme.secondary} font-mono overflow-x-auto`} {...props} />
                ),
              blockquote: ({ node, ...props }) => (
                <blockquote className={`border-l-4 border-${colorScheme.accent}/30 bg-white/5 pl-4 py-2 my-3 italic text-gray-400`} {...props} />
              ),
            }}
          >
            {content}
          </ReactMarkdown>
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
