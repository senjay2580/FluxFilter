import React from 'react';

/**
 * 解析文本中的链接并返回带有可点击链接的 React 元素
 */
export function parseLinksToElements(text: string): React.ReactNode[] {
  if (!text) return [];

  // 匹配 URL 的正则表达式
  const urlRegex = /(https?:\/\/[^\s<>"{}|\\^`\[\]]+)/gi;

  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let match;

  while ((match = urlRegex.exec(text)) !== null) {
    // 添加链接前的普通文本
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }

    // 添加链接
    const url = match[1];
    parts.push(
      <a
        key={`link-${match.index}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className="block text-blue-400 hover:text-blue-300 underline underline-offset-2 break-all my-1"
      >
        {url.length > 50 ? url.slice(0, 50) + '...' : url}
      </a>
    );

    lastIndex = match.index + match[0].length;
  }

  // 添加最后剩余的文本
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : [text];
}
