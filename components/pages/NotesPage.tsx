import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../lib/supabase';
import { getStoredUserId } from '../../lib/auth';
import type { Note, NoteColor, NoteCategory, CreateNoteParams, UpdateNoteParams } from '../../lib/database.types';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import Placeholder from '@tiptap/extension-placeholder';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { marked } from 'marked';
import DeleteConfirmModal from '../shared/DeleteConfirmModal';
import { useSwipeBack } from '../../hooks/useSwipeBack';

// Apple 风格浅色颜色配置
const lightColorConfig: Record<NoteColor, { bg: string; border: string; card: string; text: string }> = {
  default: { bg: '#FFFFFF', border: '#E5E5EA', card: '#FFFFFF', text: '#1C1C1E' },
  red: { bg: '#FFEFEF', border: '#FFD5D5', card: '#FFF5F5', text: '#D70015' },
  orange: { bg: '#FFF4E6', border: '#FFE0B2', card: '#FFF8F0', text: '#FF9500' },
  yellow: { bg: '#FFFDE7', border: '#FFF59D', card: '#FFFEF5', text: '#FFCC00' },
  green: { bg: '#E8F5E9', border: '#C8E6C9', card: '#F1F8F2', text: '#34C759' },
  blue: { bg: '#E3F2FD', border: '#BBDEFB', card: '#F0F7FF', text: '#007AFF' },
  purple: { bg: '#F3E5F5', border: '#E1BEE7', card: '#F9F0FA', text: '#AF52DE' },
  pink: { bg: '#FCE4EC', border: '#F8BBD9', card: '#FEF0F5', text: '#FF2D55' },
};

// Apple 风格深色颜色配置
const darkColorConfig: Record<NoteColor, { bg: string; border: string; card: string; text: string }> = {
  default: { bg: '#1C1C1E', border: '#38383A', card: '#2C2C2E', text: '#FFFFFF' },
  red: { bg: '#3A1A1A', border: '#5C2A2A', card: '#4A2020', text: '#FF6B6B' },
  orange: { bg: '#3A2A1A', border: '#5C4020', card: '#4A3520', text: '#FFB366' },
  yellow: { bg: '#3A3A1A', border: '#5C5C20', card: '#4A4A20', text: '#FFE066' },
  green: { bg: '#1A3A1A', border: '#2A5C2A', card: '#204A20', text: '#69DB7C' },
  blue: { bg: '#1A2A3A', border: '#2A405C', card: '#20354A', text: '#74C0FC' },
  purple: { bg: '#2A1A3A', border: '#402A5C', card: '#35204A', text: '#DA77F2' },
  pink: { bg: '#3A1A2A', border: '#5C2A40', card: '#4A2035', text: '#F783AC' },
};

// 主题类型
type ThemeMode = 'auto' | 'light' | 'dark';

// 判断是否为夜间时间（18:00 - 06:00）
const isNightTime = (): boolean => {
  const hour = new Date().getHours();
  return hour >= 18 || hour < 6;
};

// 获取实际主题
const getActualTheme = (mode: ThemeMode): 'light' | 'dark' => {
  if (mode === 'auto') {
    return isNightTime() ? 'dark' : 'light';
  }
  return mode;
};

// 主题配置
const getThemeColors = (isDark: boolean) => ({
  bg: isDark ? '#000000' : '#F2F2F7',
  cardBg: isDark ? '#1C1C1E' : '#FFFFFF',
  headerBg: isDark ? 'rgba(0,0,0,0.9)' : 'rgba(242,242,247,0.9)',
  border: isDark ? '#38383A' : '#C7C7CC',
  text: isDark ? '#FFFFFF' : '#1C1C1E',
  textSecondary: isDark ? '#8E8E93' : '#8E8E93',
  inputBg: isDark ? 'rgba(118,118,128,0.24)' : 'rgba(118,118,128,0.12)',
  accent: '#007AFF',
});

interface NotesPageProps {
  isOpen: boolean;
  onClose: () => void;
}

// 富文本编辑器组件 - 使用 Tiptap
interface RichEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
}

const RichEditor: React.FC<RichEditorProps> = ({ content, onChange, placeholder }) => {
  const [showHeadingMenu, setShowHeadingMenu] = useState(false);
  const [showColorMenu, setShowColorMenu] = useState(false);
  const [toolbarExpanded, setToolbarExpanded] = useState(false);
  const [selectionMenu, setSelectionMenu] = useState<{ x: number; y: number; text: string } | null>(null);
  const [aiProcessing, setAiProcessing] = useState<string | null>(null);
  const [diffModal, setDiffModal] = useState<{ original: string; modified: string; action: string; from: number; to: number } | null>(null);
  const headingMenuRef = useRef<HTMLDivElement>(null);
  const colorMenuRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectionRangeRef = useRef<{ from: number; to: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        bulletList: {
          keepMarks: true,
          keepAttributes: false,
        },
        orderedList: {
          keepMarks: true,
          keepAttributes: false,
        },
      }),
      Underline,
      TextStyle,
      Color,
      Image.configure({ inline: true }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-500 underline',
        },
      }),
      Table.configure({
        resizable: true,
        HTMLAttributes: {
          class: 'border-collapse w-full',
        },
      }),
      TableRow,
      TableHeader,
      TableCell,
      Placeholder.configure({ placeholder: placeholder || '开始写笔记...' }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: 'prose prose-sm sm:prose focus:outline-none min-h-[150px] p-3 sm:p-4',
        style: 'font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif; color: #1C1C1E;',
      },
    },
  });

  // 监听粘贴事件，解析 Markdown
  useEffect(() => {
    if (!editor) return;

    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;

      // 检测 Markdown 语法
      const hasMarkdown = 
        /^#{1,6}\s/m.test(text) ||           // 标题
        /^\s*[-*+]\s/m.test(text) ||         // 无序列表
        /^\s*\d+\.\s/m.test(text) ||         // 有序列表
        /^\s*>/m.test(text) ||               // 引用
        /\*\*[^*]+\*\*/.test(text) ||        // 粗体
        /\*[^*]+\*/.test(text) ||            // 斜体
        /`[^`]+`/.test(text) ||              // 行内代码
        /```[\s\S]+```/.test(text) ||        // 代码块
        /\[.+\]\(.+\)/.test(text);           // 链接

      if (hasMarkdown) {
        e.preventDefault();
        e.stopPropagation();

        // 使用 marked 解析 Markdown
        const html = marked.parse(text, { 
          async: false, 
          breaks: true,
          gfm: true,
        }) as string;

        // 直接设置内容（替换当前内容或追加）
        const currentHtml = editor.getHTML();
        const isEmpty = currentHtml === '<p></p>' || !currentHtml;

        if (isEmpty) {
          editor.commands.setContent(html);
        } else {
          // 在当前位置插入
          editor.commands.setContent(currentHtml + html);
          editor.commands.focus('end');
        }
      }
    };

    // 在 capture 阶段监听，确保优先处理
    document.addEventListener('paste', handlePaste, true);
    
    return () => {
      document.removeEventListener('paste', handlePaste, true);
    };
  }, [editor]);

  // 监听选中文字，显示 AI 操作菜单
  useEffect(() => {
    if (!editor) return;

    const handleSelectionChange = () => {
      const { from, to } = editor.state.selection;
      const selectedText = editor.state.doc.textBetween(from, to, ' ');
      
      if (selectedText.trim().length > 5) {
        // 获取选区位置
        const { view } = editor;
        const coords = view.coordsAtPos(from);
        
        selectionRangeRef.current = { from, to };
        setSelectionMenu({
          x: coords.left,
          y: coords.top - 50,
          text: selectedText,
        });
      } else {
        setSelectionMenu(null);
        selectionRangeRef.current = null;
      }
    };

    editor.on('selectionUpdate', handleSelectionChange);
    
    return () => {
      editor.off('selectionUpdate', handleSelectionChange);
    };
  }, [editor]);

  // AI 流式处理选中文字 - 弹窗对比模式
  const handleAIAction = async (action: 'format' | 'translate' | 'summarize') => {
    if (!editor || !selectionMenu || !selectionRangeRef.current) return;

    const modelId = localStorage.getItem('ai_model') || 'deepseek-chat';
    const apiKey = localStorage.getItem(`ai_api_key_${modelId}`) || '';
    
    if (!apiKey) {
      alert('请先在设置中配置 AI 模型的 API Key');
      return;
    }

    setAiProcessing(action);
    setSelectionMenu(null);

    const { from, to } = selectionRangeRef.current;
    const selectedText = selectionMenu.text;

    // 构建 prompt
    const prompts: Record<string, string> = {
      format: `你是一个 Markdown 排版专家。请将以下文本排版成美观易读的格式。

⚠️ 【绝对禁止】
- 绝对不能删除原文的任何内容！
- 绝对不能丢失原文的任何序号（一、二、三 或 1、2、3）！
- 如果原文有"一、xxx"和"二、xxx"，输出必须也有！

【允许的操作】
✅ 添加换行和空行（段落之间必须空行）
✅ 添加 Markdown 格式（**加粗**、列表、引用、分割线）
✅ 修复明显错别字和标点

【排版要求】
- 每个主题/段落之间空一行
- 关键词 **加粗**
- 重要观点用 > 引用
- 主题切换用 ---

原文（必须完整保留所有内容和序号）：
${selectedText}

输出排版后的 Markdown：`,
      translate: `请将以下文本翻译成中文（如果已是中文则翻译成英文）。保持原意，翻译要自然流畅：

${selectedText}

直接输出翻译结果，不要任何解释。`,
      summarize: `请对以下文本进行精炼总结，提取核心要点，使其更加简洁：

${selectedText}

直接输出总结内容，不要任何解释。`,
    };

    try {
      const models: Record<string, string> = {
        'deepseek-chat': 'https://api.deepseek.com/chat/completions',
        'deepseek-reasoner': 'https://api.deepseek.com/chat/completions',
        'glm-4.5': 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        'qwen3-max': 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        'qwen-plus': 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      };
      
      const apiUrl = models[modelId] || localStorage.getItem('ai_base_url') || models['deepseek-chat'];
      const customModel = localStorage.getItem('ai_custom_model');
      const modelName = modelId === 'custom' ? customModel : modelId;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompts[action] }],
          stream: true,
        }),
      });

      if (!response.ok) throw new Error(`API 请求失败: ${response.status}`);

      const reader = response.body?.getReader();
      if (!reader) throw new Error('无法读取响应流');

      const decoder = new TextDecoder();
      let result = '';

      // 先弹出弹窗，显示原文和空的 AI 生成区域
      setDiffModal({
        original: selectedText,
        modified: '',
        action,
        from,
        to,
      });
      setAiProcessing(null);

      // 流式更新弹窗内容
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

        for (const line of lines) {
          const data = line.slice(6);
          if (data === '[DONE]') continue;

          try {
            const json = JSON.parse(data);
            const content = json.choices?.[0]?.delta?.content || '';
            if (content) {
              result += content;
              // 流式更新弹窗
              setDiffModal(prev => prev ? { ...prev, modified: result } : null);
            }
          } catch {}
        }
      }
    } catch (error) {
      console.error('AI 处理失败:', error);
      alert('AI 处理失败，请重试');
      setDiffModal(null);
    } finally {
      setAiProcessing(null);
    }
  };

  // 确认替换 - 将 AI 生成的内容解析为 HTML 后插入
  const handleAcceptDiff = () => {
    if (!editor || !diffModal) return;
    const { from, to, modified } = diffModal;
    
    // 使用 marked 将文本解析为 HTML
    const html = marked.parse(modified, { 
      async: false, 
      breaks: true,
      gfm: true,
    }) as string;
    
    editor.chain().focus().deleteRange({ from, to }).insertContentAt(from, html).run();
    setDiffModal(null);
    selectionRangeRef.current = null;
  };

  // 取消替换
  const handleRejectDiff = () => {
    setDiffModal(null);
    selectionRangeRef.current = null;
  };

  // 插入图片
  const insertImage = () => {
    fileInputRef.current?.click();
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !editor) return;

    const reader = new FileReader();
    reader.onload = () => {
      editor.chain().focus().setImage({ src: reader.result as string }).run();
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  if (!editor) return null;

  return (
    <div className="flex flex-col h-full bg-white rounded-none sm:rounded-2xl overflow-hidden shadow-sm">
      {/* 工具栏 - Apple 风格，移动端横向滚动 */}
      <div className="px-1 sm:px-2 py-1.5 sm:py-2 bg-[#F2F2F7] border-b border-[#E5E5EA]">
        {/* 主工具栏 - 移动端可滚动 */}
        <div className="flex items-center gap-0.5 overflow-x-auto no-scrollbar">
          {/* 撤销/重做 */}
          <button onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} className="shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 disabled:opacity-30 transition-colors" title="撤销">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#007AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 10h10a5 5 0 0 1 5 5v2M3 10l4-4M3 10l4 4" />
            </svg>
          </button>
          <button onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} className="shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 disabled:opacity-30 transition-colors" title="重做">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#007AFF]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 10H11a5 5 0 0 0-5 5v2M21 10l-4-4M21 10l-4 4" />
            </svg>
          </button>

          <div className="shrink-0 w-px h-5 sm:h-6 bg-[#C7C7CC] mx-0.5 sm:mx-1" />

          {/* 标题选择 */}
          <div className="relative shrink-0" ref={headingMenuRef}>
            <button
              onClick={() => { setShowHeadingMenu(!showHeadingMenu); setShowColorMenu(false); }}
              className="px-2 sm:px-3 py-1 sm:py-1.5 bg-white border border-[#C7C7CC] rounded-lg text-xs sm:text-sm text-[#1C1C1E] hover:bg-[#E5E5EA] transition-colors flex items-center gap-0.5 sm:gap-1 font-medium"
            >
              <span>Aa</span>
              <svg className={`w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#8E8E93] transition-transform ${showHeadingMenu ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            {showHeadingMenu && createPortal(
              <div
                className="fixed inset-0 z-[99999999]"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) {
                    setShowHeadingMenu(false);
                  }
                }}
              >
                <div
                  className="absolute bg-white border border-[#E5E5EA] rounded-xl shadow-lg min-w-[110px] sm:min-w-[130px] py-1 overflow-hidden"
                  style={{
                    top: (headingMenuRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                    left: headingMenuRef.current?.getBoundingClientRect().left ?? 0
                  }}
                >
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setShowHeadingMenu(false); editor.chain().focus().setParagraph().run(); }}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-left text-sm text-[#1C1C1E] hover:bg-[#F2F2F7] transition-colors"
                  >正文</button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setShowHeadingMenu(false); editor.chain().focus().toggleHeading({ level: 1 }).run(); }}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-left text-lg sm:text-xl font-bold text-[#1C1C1E] hover:bg-[#F2F2F7] transition-colors"
                  >标题</button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setShowHeadingMenu(false); editor.chain().focus().toggleHeading({ level: 2 }).run(); }}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-left text-base sm:text-lg font-semibold text-[#1C1C1E] hover:bg-[#F2F2F7] transition-colors"
                  >副标题</button>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => { setShowHeadingMenu(false); editor.chain().focus().toggleHeading({ level: 3 }).run(); }}
                    className="w-full px-3 sm:px-4 py-2 sm:py-2.5 text-left text-sm sm:text-base font-medium text-[#1C1C1E] hover:bg-[#F2F2F7] transition-colors"
                  >小标题</button>
                </div>
              </div>,
              document.body
            )}
          </div>

          <div className="shrink-0 w-px h-5 sm:h-6 bg-[#C7C7CC] mx-0.5 sm:mx-1" />

          {/* 格式化 */}
          <button onClick={() => editor.chain().focus().toggleBold().run()} className={`shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors ${editor.isActive('bold') ? 'bg-black/10' : ''}`} title="粗体">
            <span className="text-[#1C1C1E] font-bold text-sm sm:text-base">B</span>
          </button>
          <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors ${editor.isActive('italic') ? 'bg-black/10' : ''}`} title="斜体">
            <span className="text-[#1C1C1E] italic text-sm sm:text-base font-serif">I</span>
          </button>
          <button onClick={() => editor.chain().focus().toggleUnderline().run()} className={`shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors ${editor.isActive('underline') ? 'bg-black/10' : ''}`} title="下划线">
            <span className="text-[#1C1C1E] underline text-sm sm:text-base">U</span>
          </button>
          <button onClick={() => editor.chain().focus().toggleStrike().run()} className={`shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors ${editor.isActive('strike') ? 'bg-black/10' : ''}`} title="删除线">
            <span className="text-[#1C1C1E] line-through text-sm sm:text-base">S</span>
          </button>

          <div className="shrink-0 w-px h-5 sm:h-6 bg-[#C7C7CC] mx-0.5 sm:mx-1" />

          {/* 颜色选择 */}
          <div className="relative shrink-0" ref={colorMenuRef}>
            <button
              onClick={() => { setShowColorMenu(!showColorMenu); setShowHeadingMenu(false); }}
              className="shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors flex items-center"
              title="文字颜色"
            >
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#1C1C1E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 20h16M6 16l6-12 6 12M8.5 12h7" />
              </svg>
              <svg className={`w-2.5 h-2.5 sm:w-3 sm:h-3 text-[#8E8E93] transition-transform ${showColorMenu ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="currentColor">
                <path d="M7 10l5 5 5-5z" />
              </svg>
            </button>
            {showColorMenu && createPortal(
              <div
                className="fixed inset-0 z-[99999999]"
                onMouseDown={(e) => {
                  if (e.target === e.currentTarget) {
                    setShowColorMenu(false);
                  }
                }}
              >
                <div
                  className="absolute p-2 sm:p-3 bg-white border border-[#E5E5EA] rounded-xl shadow-lg grid grid-cols-4 gap-1.5 sm:gap-2"
                  style={{
                    top: (colorMenuRef.current?.getBoundingClientRect().bottom ?? 0) + 4,
                    left: colorMenuRef.current?.getBoundingClientRect().left ?? 0
                  }}
                >
                  {['#1C1C1E', '#FF3B30', '#FF9500', '#FFCC00', '#34C759', '#007AFF', '#AF52DE', '#FF2D55'].map(c => (
                    <button
                      key={c}
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { setShowColorMenu(false); editor.chain().focus().setColor(c).run(); }}
                      className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border-2 border-white shadow-md hover:scale-110 transition-transform"
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>,
              document.body
            )}
          </div>

          <div className="shrink-0 w-px h-5 sm:h-6 bg-[#C7C7CC] mx-0.5 sm:mx-1" />

          {/* 列表 */}
          <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors ${editor.isActive('bulletList') ? 'bg-black/10' : ''}`} title="无序列表">
            <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#1C1C1E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
              <circle cx="5" cy="6" r="1.5" fill="currentColor" /><circle cx="5" cy="12" r="1.5" fill="currentColor" /><circle cx="5" cy="18" r="1.5" fill="currentColor" />
            </svg>
          </button>

          {/* 展开/收起更多工具 */}
          <button
            onClick={() => setToolbarExpanded(!toolbarExpanded)}
            className="shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors ml-auto"
            title={toolbarExpanded ? '收起' : '更多'}
          >
            <svg className={`w-4 h-4 sm:w-5 sm:h-5 text-[#007AFF] transition-transform ${toolbarExpanded ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* 扩展工具栏 - 移动端可滚动 */}
        {toolbarExpanded && (
          <div className="flex items-center gap-0.5 mt-1.5 sm:mt-2 pt-1.5 sm:pt-2 border-t border-[#E5E5EA] overflow-x-auto no-scrollbar">
            {/* 有序列表 */}
            <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors ${editor.isActive('orderedList') ? 'bg-black/10' : ''}`} title="有序列表">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#1C1C1E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" />
                <text x="4" y="8" fontSize="8" fill="currentColor" fontWeight="bold">1</text>
                <text x="4" y="14" fontSize="8" fill="currentColor" fontWeight="bold">2</text>
                <text x="4" y="20" fontSize="8" fill="currentColor" fontWeight="bold">3</text>
              </svg>
            </button>

            <div className="shrink-0 w-px h-5 sm:h-6 bg-[#C7C7CC] mx-0.5 sm:mx-1" />

            {/* 引用块 */}
            <button onClick={() => editor.chain().focus().toggleBlockquote().run()} className={`shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors ${editor.isActive('blockquote') ? 'bg-black/10' : ''}`} title="引用">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#1C1C1E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z" />
                <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z" />
              </svg>
            </button>

            <div className="shrink-0 w-px h-5 sm:h-6 bg-[#C7C7CC] mx-0.5 sm:mx-1" />

            {/* 插入图片 */}
            <button onClick={insertImage} className="shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors" title="插入图片">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#1C1C1E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <path d="M21 15l-5-5L5 21" />
              </svg>
            </button>

            {/* 分割线 */}
            <button onClick={() => editor.chain().focus().setHorizontalRule().run()} className="shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors" title="分割线">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#1C1C1E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="3" y1="12" x2="21" y2="12" />
              </svg>
            </button>

            {/* 代码块 */}
            <button onClick={() => editor.chain().focus().toggleCodeBlock().run()} className={`shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors ${editor.isActive('codeBlock') ? 'bg-black/10' : ''}`} title="代码块">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#1C1C1E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" />
              </svg>
            </button>

            {/* 清除格式 */}
            <button onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()} className="shrink-0 p-1.5 sm:p-2 rounded-lg hover:bg-black/5 transition-colors" title="清除格式">
              <svg className="w-4 h-4 sm:w-5 sm:h-5 text-[#1C1C1E]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />

      {/* 编辑区域 - Tiptap EditorContent */}
      <div
        className="flex-1 overflow-y-auto bg-white relative"
        onClick={() => { setShowHeadingMenu(false); setShowColorMenu(false); }}
      >
        <EditorContent editor={editor} className="h-full" />
      </div>

      {/* AI 选中文字操作菜单 */}
      {selectionMenu && !aiProcessing && createPortal(
        <div
          className="fixed z-[99999999] bg-[#1C1C1E] rounded-xl shadow-2xl border border-white/10 p-1 flex gap-1 animate-fade-in"
          style={{
            left: Math.max(10, Math.min(selectionMenu.x, window.innerWidth - 280)),
            top: Math.max(10, selectionMenu.y),
          }}
          onMouseDown={(e) => e.preventDefault()}
        >
          {/* 复制按钮 */}
          <button
            onClick={() => {
              navigator.clipboard.writeText(selectionMenu.text);
              setSelectionMenu(null);
            }}
            className="px-3 py-2 rounded-lg text-white text-xs font-medium hover:bg-white/10 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
            复制
          </button>
          <div className="w-px h-6 bg-white/10 self-center" />
          <button
            onClick={() => handleAIAction('format')}
            className="px-3 py-2 rounded-lg text-white text-xs font-medium hover:bg-white/10 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 text-purple-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 7h16M4 12h16M4 17h10" />
            </svg>
            格式化
          </button>
          <button
            onClick={() => handleAIAction('translate')}
            className="px-3 py-2 rounded-lg text-white text-xs font-medium hover:bg-white/10 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 text-blue-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M5 8l6 6M4 14l6-6 2-3M2 5h12M7 2v3M22 22l-5-10-5 10M14 18h6" />
            </svg>
            翻译
          </button>
          <button
            onClick={() => handleAIAction('summarize')}
            className="px-3 py-2 rounded-lg text-white text-xs font-medium hover:bg-white/10 transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5 text-green-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
            </svg>
            总结
          </button>
        </div>,
        document.body
      )}

      {/* AI 处理中提示 */}
      {aiProcessing && createPortal(
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[99999999] bg-[#1C1C1E] rounded-full px-4 py-2 shadow-2xl border border-white/10 flex items-center gap-2 animate-fade-in">
          <svg className="w-4 h-4 text-purple-400 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
          </svg>
          <span className="text-white text-xs font-medium">
            {aiProcessing === 'format' && 'AI 格式化中...'}
            {aiProcessing === 'translate' && 'AI 翻译中...'}
            {aiProcessing === 'summarize' && 'AI 总结中...'}
          </span>
        </div>,
        document.body
      )}

      {/* AI 对比弹窗 */}
      {diffModal && createPortal(
        <div className="fixed inset-0 z-[99999999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden">
            {/* 弹窗头部 */}
            <div className="px-5 py-4 border-b border-[#E5E5EA] flex items-center justify-between bg-[#F9F9F9]">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center">
                  <svg className="w-4 h-4 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                  </svg>
                </div>
                <span className="font-semibold text-[#1C1C1E]">
                  {diffModal.action === 'format' && 'AI 格式化'}
                  {diffModal.action === 'translate' && 'AI 翻译'}
                  {diffModal.action === 'summarize' && 'AI 总结'}
                </span>
              </div>
              <button
                onClick={handleRejectDiff}
                className="w-8 h-8 rounded-full hover:bg-black/5 flex items-center justify-center transition-colors"
              >
                <svg className="w-5 h-5 text-[#8E8E93]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            {/* 对比内容 */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* 原文 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-red-400" />
                  <span className="text-xs font-medium text-[#8E8E93]">原文</span>
                </div>
                <div className="p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-[#1C1C1E] leading-relaxed whitespace-pre-wrap">
                  {diffModal.original}
                </div>
              </div>

              {/* 箭头 */}
              <div className="flex justify-center">
                <svg className="w-6 h-6 text-[#C7C7CC]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M19 12l-7 7-7-7" />
                </svg>
              </div>

              {/* AI 生成 */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-2 h-2 rounded-full bg-green-400" />
                  <span className="text-xs font-medium text-[#8E8E93]">AI 生成</span>
                  {!diffModal.modified && (
                    <svg className="w-3 h-3 text-green-500 animate-spin ml-1" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                      <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                    </svg>
                  )}
                </div>
                <div className="p-4 bg-green-50 border border-green-100 rounded-xl text-sm text-[#1C1C1E] leading-relaxed whitespace-pre-wrap min-h-[60px]">
                  {diffModal.modified || (
                    <span className="text-[#8E8E93] italic">正在生成...</span>
                  )}
                </div>
              </div>
            </div>

            {/* 操作按钮 */}
            <div className="px-5 py-4 border-t border-[#E5E5EA] flex gap-3 bg-[#F9F9F9]">
              <button
                onClick={handleRejectDiff}
                className="flex-1 py-3 rounded-xl text-[#1C1C1E] text-sm font-medium bg-[#E5E5EA] hover:bg-[#D1D1D6] transition-colors"
              >
                取消
              </button>
              <button
                onClick={handleAcceptDiff}
                disabled={!diffModal.modified}
                className="flex-1 py-3 rounded-xl text-white text-sm font-medium transition-colors disabled:opacity-50"
                style={{ background: 'linear-gradient(135deg, #007AFF 0%, #5856D6 100%)' }}
              >
                替换原文
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Tiptap 编辑器样式 */}
      <style>{`
        .ProseMirror {
          min-height: 150px;
          padding: 12px 16px;
          outline: none;
          font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", "Helvetica Neue", sans-serif;
          color: #1C1C1E;
          font-size: 14px;
          line-height: 1.6;
        }
        @media (min-width: 640px) {
          .ProseMirror {
            padding: 16px;
            font-size: 16px;
          }
        }
        .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: #8E8E93;
          pointer-events: none;
          height: 0;
        }
        .ProseMirror h1 { font-size: 1.75em; font-weight: 700; margin: 0.5em 0; }
        .ProseMirror h2 { font-size: 1.5em; font-weight: 600; margin: 0.5em 0; }
        .ProseMirror h3 { font-size: 1.25em; font-weight: 600; margin: 0.5em 0; }
        .ProseMirror ul { padding-left: 1.5em; margin: 0.5em 0; list-style-type: disc; }
        .ProseMirror ol { padding-left: 1.5em; margin: 0.5em 0; list-style-type: decimal; }
        .ProseMirror ul li, .ProseMirror ol li { display: list-item; margin: 0.25em 0; }
        .ProseMirror ul ul { list-style-type: circle; }
        .ProseMirror ul ul ul { list-style-type: square; }
        .ProseMirror blockquote { border-left: 3px solid #007AFF; padding-left: 1em; margin: 0.5em 0; color: #666; }
        .ProseMirror pre { background: #F2F2F7; padding: 0.75em 1em; border-radius: 8px; overflow-x: auto; }
        .ProseMirror code { background: #F2F2F7; padding: 0.2em 0.4em; border-radius: 4px; font-size: 0.9em; }
        .ProseMirror hr { border: none; border-top: 1px solid #E5E5EA; margin: 1em 0; }
        .ProseMirror img { max-width: 100%; border-radius: 8px; margin: 8px 0; }
        .ProseMirror table { border-collapse: collapse; width: 100%; margin: 1em 0; overflow: hidden; border-radius: 8px; }
        .ProseMirror th, .ProseMirror td { border: 1px solid #E5E5EA; padding: 8px 12px; text-align: left; min-width: 80px; }
        .ProseMirror th { background: #F2F2F7; font-weight: 600; }
        .ProseMirror tr:nth-child(even) td { background: #FAFAFA; }
        .ProseMirror .selectedCell { background: rgba(0, 122, 255, 0.1); }
      `}</style>
    </div>
  );
};


// 笔记卡片组件
interface NoteCardProps {
  note: Note;
  onClick: () => void;
  onLongPress: () => void;
  isDark?: boolean;
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelect?: () => void;
  animationIndex?: number;
  isDeleting?: boolean;
}

const NoteCard: React.FC<NoteCardProps> = ({
  note, onClick, onLongPress, isDark = false,
  selectionMode = false, isSelected = false, onToggleSelect,
  animationIndex = 0, isDeleting = false
}) => {
  const colorConfig = isDark ? darkColorConfig : lightColorConfig;
  const config = colorConfig[note.color];

  // 从 content (HTML) 提取纯文本计算实际字数
  const getTextFromHtml = (html: string): string => {
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = html;
    return tempDiv.textContent || '';
  };

  // 使用 content 字段计算实际字数
  const actualText = note.content ? getTextFromHtml(note.content) : '';
  const contentLength = actualText.length;

  // 根据实际内容长度动态设置行数 (0-100, 100-300, 300-500, 500-1000, 1000+)
  const getLineClamp = () => {
    if (contentLength === 0) return 2;
    if (contentLength < 100) return 3;
    if (contentLength < 300) return 5;
    if (contentLength < 500) return 8;
    if (contentLength < 1000) return 12;
    return 18; // 1000+ 字显示更多
  };

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);

  // 长按开始
  const handleTouchStart = () => {
    if (selectionMode) return; // 选择模式下不触发长按
    longPressTimer.current = setTimeout(() => {
      onLongPress();
      if ('vibrate' in navigator) navigator.vibrate(50);
    }, 500);
  };

  // 长按结束
  const handleTouchEnd = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };

  // 点击卡片
  const handleClick = () => {
    if (selectionMode && onToggleSelect) {
      onToggleSelect();
    } else {
      onClick();
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      onMouseDown={handleTouchStart}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
      onClick={handleClick}
      className={`relative p-4 rounded-2xl cursor-pointer transition-all duration-300 ${note.is_pinned ? 'z-10' : ''} ${isDeleting ? 'note-card-delete' : 'note-card-enter'}`}
      style={{
        backgroundColor: config.card,
        border: `1px solid ${config.border}`,
        boxShadow: isSelected
          ? '0 0 0 3px rgba(0,122,255,0.3), 0 4px 12px rgba(0,0,0,0.1)'
          : note.is_pinned
            ? '0 10px 40px rgba(0,0,0,0.15), 0 4px 12px rgba(0,0,0,0.1)'
            : '0 2px 8px rgba(0,0,0,0.06)',
        transform: isSelected ? 'scale(0.98)' : note.is_pinned ? 'translateY(-4px) scale(1.02)' : 'none',
        opacity: isSelected ? 0.9 : 1,
        fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif',
        animationDelay: `${animationIndex * 50}ms`,
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* 选择槽位 - 选择模式下显示，放在卡片内部 */}
      {selectionMode && (
        <div
          className="absolute top-3 right-3 w-5 h-5 rounded-full flex items-center justify-center z-20 transition-all"
          style={{
            backgroundColor: isSelected ? '#007AFF' : 'transparent',
            border: isSelected ? 'none' : `2px solid ${isDark ? '#48484A' : '#C7C7CC'}`,
          }}
        >
          {isSelected && (
            <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
              <path d="M5 12l5 5L20 7" />
            </svg>
          )}
        </div>
      )}

      {/* 置顶图钉 - 右上角简洁图标 */}
      {note.is_pinned && !selectionMode && (
        <div className="absolute top-3 right-3 z-20">
          <svg className="w-4 h-4" style={{ color: '#FF9F0A' }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 4v8l2 2v2h-6v6l-1 1-1-1v-6H4v-2l2-2V4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2z" />
          </svg>
        </div>
      )}

      {/* 标题 */}
      {note.title && (
        <h3
          className={`text-sm mb-2 line-clamp-1 ${note.is_pinned ? 'font-bold' : 'font-semibold'}`}
          style={{ color: isDark ? '#FFFFFF' : '#1C1C1E' }}
        >
          {note.title}
        </h3>
      )}

      {/* 内容预览 - 直接从 content 动态生成，根据实际内容长度显示 */}
      <p
        className="text-xs leading-relaxed"
        style={{
          color: isDark ? '#98989D' : '#8E8E93',
          display: '-webkit-box',
          WebkitBoxOrient: 'vertical',
          overflow: 'hidden',
          WebkitLineClamp: getLineClamp(),
        }}
      >
        {actualText || '无内容'}
      </p>

      {/* 底部信息 */}
      <div className="flex items-center justify-between mt-3 pt-2" style={{ borderTop: isDark ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(0,0,0,0.05)' }}>
        <div className="flex items-center gap-2">
          {/* 字数显示 */}
          <span className="text-[10px]" style={{ color: isDark ? '#636366' : '#AEAEB2' }}>
            {contentLength > 0 ? `${contentLength}字` : ''}
          </span>
          {note.category && (
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)', color: config.text }}
            >
              {note.category}
            </span>
          )}
        </div>
        <span className="text-[10px]" style={{ color: isDark ? '#636366' : '#AEAEB2' }}>
          {new Date(note.updated_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
        </span>
      </div>

      {/* 卡片动画样式 */}
      <style>{`
        .note-card-enter {
          animation: noteCardEnter 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
        .note-card-delete {
          animation: noteCardDelete 0.3s ease-out forwards;
        }
        @keyframes noteCardEnter {
          from {
            opacity: 0;
            transform: translateY(20px) scale(0.9);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes noteCardDelete {
          to {
            opacity: 0;
            transform: scale(0.8) translateY(-10px);
          }
        }
      `}</style>
    </div>
  );
};

// 笔记编辑器弹窗
interface NoteEditorProps {
  note: Note | null;
  categories: NoteCategory[];
  onSave: (data: CreateNoteParams | UpdateNoteParams) => void;
  onClose: () => void;
  onOpenCategoryManager: () => void;
}

const NoteEditor: React.FC<NoteEditorProps> = ({ note, categories, onSave, onClose, onOpenCategoryManager }) => {
  const [title, setTitle] = useState(note?.title || '');
  const [content, setContent] = useState(note?.content || '');
  const [color, setColor] = useState<NoteColor>(note?.color || 'default');
  const [categoryId, setCategoryId] = useState<string>(note?.category || '');
  const [saving, setSaving] = useState(false);
  const [showMenu, setShowMenu] = useState(false);
  const [generatingTitle, setGeneratingTitle] = useState(false);
  const [savedTip, setSavedTip] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Ctrl+S 保存快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [title, content, color, categoryId]);

  // AI 生成标题
  const generateAITitle = async () => {
    // 提取纯文本内容
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const textContent = tempDiv.textContent || '';
    
    if (!textContent.trim() || textContent.length < 10) {
      alert('请先输入足够的内容（至少10个字）');
      return;
    }

    const modelId = localStorage.getItem('ai_model') || 'deepseek-chat';
    const apiKey = localStorage.getItem(`ai_api_key_${modelId}`) || '';
    
    if (!apiKey) {
      alert('请先在设置中配置 AI 模型的 API Key');
      return;
    }

    setGeneratingTitle(true);
    
    try {
      // 获取模型配置
      const models: Record<string, string> = {
        'deepseek-chat': 'https://api.deepseek.com/chat/completions',
        'deepseek-reasoner': 'https://api.deepseek.com/chat/completions',
        'glm-4.5': 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
        'qwen3-max': 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
        'qwen-plus': 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
      };
      
      const apiUrl = models[modelId] || localStorage.getItem('ai_base_url') || models['deepseek-chat'];
      const customModel = localStorage.getItem('ai_custom_model');
      const modelName = modelId === 'custom' ? customModel : modelId;

      // 截取内容（最多2000字）
      const truncatedContent = textContent.slice(0, 2000);
      
      const prompt = `请为以下文章生成一个标题。

要求：
1. 严格限制在20字以内
2. 直白告诉读者这篇文章在讲什么
3. 语言要干练、优雅、生动
4. 有语言的艺术感，让人一看就想读
5. 只返回标题本身，不要任何解释或标点符号

文章内容：
${truncatedContent}`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: modelName,
          messages: [{ role: 'user', content: prompt }],
          max_tokens: 50,
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        throw new Error(`API 请求失败: ${response.status}`);
      }

      const data = await response.json();
      const generatedTitle = data.choices?.[0]?.message?.content?.trim() || '';
      
      if (generatedTitle) {
        // 确保不超过20字
        setTitle(generatedTitle.slice(0, 20));
      }
    } catch (error) {
      console.error('生成标题失败:', error);
      alert('生成标题失败，请检查 API 配置');
    } finally {
      setGeneratingTitle(false);
    }
  };

  // 菜单通过 Portal 渲染，不需要 useEffect 监听点击外部
  // 点击背景关闭已在 Portal 的 onMouseDown 中处理

  const handleSave = async () => {
    setSaving(true);
    // 提取纯文本预览 - 根据实际字数的百分比生成
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = content;
    const fullText = tempDiv.textContent || '';
    const textLength = fullText.length;
    // 预览长度为实际内容的40%，最少50字，最多500字
    const previewLength = Math.min(Math.max(Math.floor(textLength * 0.4), 50), 500);
    const preview = fullText.slice(0, previewLength);

    await onSave({
      title,
      content,
      preview,
      color,
      category: categoryId || undefined,
    });
    setSaving(false);
    // 显示保存成功提示
    setSavedTip(true);
    setTimeout(() => setSavedTip(false), 1500);
  };

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex flex-col" style={{ backgroundColor: '#F2F2F7', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}>
      {/* 顶部栏 - Apple 风格 */}
      <div className="flex items-center justify-between px-3 sm:px-4 py-3 shrink-0" style={{ backgroundColor: 'rgba(242,242,247,0.9)', backdropFilter: 'blur(20px)', borderBottom: '0.5px solid #C7C7CC' }}>
        <button onClick={onClose} className="flex items-center gap-1 hover:opacity-70 transition-opacity" style={{ color: '#007AFF' }}>
          <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          <span className="text-base">返回</span>
        </button>

        <div className="flex items-center gap-2">
          {/* 三点菜单按钮 */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setShowMenu(!showMenu)}
              className="w-9 h-9 rounded-full flex items-center justify-center transition-all hover:bg-black/5"
              style={{ backgroundColor: showMenu ? 'rgba(0,0,0,0.05)' : 'transparent' }}
            >
              <svg className="w-5 h-5" style={{ color: '#007AFF' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="1.5" fill="currentColor" /><circle cx="12" cy="6" r="1.5" fill="currentColor" /><circle cx="12" cy="18" r="1.5" fill="currentColor" />
              </svg>
            </button>
          </div>

          {/* 下拉菜单 - Portal到body */}
          {showMenu && createPortal(
            <div
              className="fixed inset-0 z-[99999999]"
              onMouseDown={(e) => {
                // 只有点击背景才关闭
                if (e.target === e.currentTarget) {
                  setShowMenu(false);
                }
              }}
            >
              <div
                className="absolute right-4 top-14 w-[260px] overflow-visible"
                style={{
                  backgroundColor: 'rgba(255,255,255,0.98)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: '14px',
                  boxShadow: '0 10px 40px rgba(0,0,0,0.2)',
                  border: '0.5px solid rgba(0,0,0,0.1)'
                }}
              >
                {/* 分类选择 */}
                <div className="px-4 py-3" style={{ borderBottom: '0.5px solid #E5E5EA' }}>
                  <p className="text-xs font-medium mb-2" style={{ color: '#8E8E93' }}>分类</p>
                  {categories.length === 0 ? (
                    <button
                      onClick={() => { setShowMenu(false); onOpenCategoryManager(); }}
                      className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg text-sm transition-colors"
                      style={{ backgroundColor: '#F2F2F7', color: '#007AFF' }}
                    >
                      <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      创建分类
                    </button>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      <button
                        onClick={() => setCategoryId('')}
                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${!categoryId ? 'bg-[#007AFF] text-white' : 'bg-[#F2F2F7] text-[#1C1C1E]'}`}
                      >
                        无分类
                      </button>
                      {categories.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => setCategoryId(cat.name)}
                          className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${categoryId === cat.name ? 'bg-[#007AFF] text-white' : 'bg-[#F2F2F7] text-[#1C1C1E]'}`}
                        >
                          {cat.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {/* 颜色选择 */}
                <div className="px-4 py-3" style={{ borderBottom: '0.5px solid #E5E5EA' }}>
                  <p className="text-xs font-medium mb-2" style={{ color: '#8E8E93' }}>颜色</p>
                  <div className="flex gap-2 flex-wrap">
                    {(['default', 'red', 'orange', 'yellow', 'green', 'blue', 'purple', 'pink'] as NoteColor[]).map(c => {
                      const displayColors: Record<NoteColor, string> = {
                        default: '#F5F5F5',
                        red: '#FF6B6B',
                        orange: '#FFA94D',
                        yellow: '#FFE066',
                        green: '#69DB7C',
                        blue: '#74C0FC',
                        purple: '#DA77F2',
                        pink: '#F783AC',
                      };
                      return (
                        <button
                          key={c}
                          onClick={() => setColor(c)}
                          className="w-7 h-7 rounded-full transition-transform hover:scale-110"
                          style={{
                            backgroundColor: displayColors[c],
                            border: color === c ? '2.5px solid #007AFF' : '1px solid rgba(0,0,0,0.15)',
                            boxShadow: color === c ? '0 0 0 2px rgba(0,122,255,0.3)' : '0 1px 3px rgba(0,0,0,0.1)'
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {/* 管理分类 */}
                <button
                  onClick={() => { setShowMenu(false); onOpenCategoryManager(); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm hover:bg-black/5 transition-colors"
                  style={{ color: '#1C1C1E' }}
                >
                  <svg className="w-5 h-5" style={{ color: '#007AFF' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3" />
                    <path d="M8 21V11a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v10" />
                  </svg>
                  管理分类
                </button>
              </div>
            </div>,
            document.body
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 sm:px-5 py-2 text-sm font-semibold rounded-full transition-all disabled:opacity-50"
            style={{ backgroundColor: '#007AFF', color: 'white' }}
          >
            {saving ? '...' : '保存'}
          </button>
        </div>

        {/* 保存成功提示 */}
        {savedTip && (
          <div className="absolute top-16 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/80 text-white text-sm rounded-full animate-fade-in">
            ✓ 已保存
          </div>
        )}
      </div>

      {/* 标题输入 - Apple 风格，移动端优化 */}
      <div className="px-3 sm:px-4 py-3 sm:py-4" style={{ backgroundColor: 'white', borderBottom: '0.5px solid #E5E5EA' }}>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="标题"
            className="flex-1 bg-transparent text-xl sm:text-2xl font-bold focus:outline-none"
            style={{ color: '#1C1C1E', fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", sans-serif' }}
          />
          {/* AI 生成标题按钮 */}
          <button
            onClick={generateAITitle}
            disabled={generatingTitle}
            className="shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-all flex items-center gap-1.5 disabled:opacity-50"
            style={{
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              boxShadow: '0 2px 8px rgba(102, 126, 234, 0.3)',
            }}
            title="AI 生成标题"
          >
            {generatingTitle ? (
              <>
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
                  <path d="M12 2a10 10 0 0 1 10 10" strokeLinecap="round" />
                </svg>
                <span>生成中</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                <span>AI标题</span>
              </>
            )}
          </button>
        </div>
        {/* 显示当前分类标签 */}
        {categoryId && (
          <div className="mt-2 flex items-center gap-2">
            <span
              className="text-xs px-2.5 py-1 rounded-full font-medium"
              style={{ backgroundColor: 'rgba(0,122,255,0.1)', color: '#007AFF' }}
            >
              {categoryId}
            </span>
          </div>
        )}
      </div>

      {/* 富文本编辑器 - 移动端全宽 */}
      <div className="flex-1 p-2 sm:p-4 overflow-hidden" style={{ backgroundColor: 'white' }}>
        <RichEditor
          content={content}
          onChange={setContent}
          placeholder="开始写笔记..."
        />
      </div>
    </div>,
    document.body
  );
};


// 主页面组件
const NotesPage: React.FC<NotesPageProps> = ({ isOpen, onClose }) => {
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categories, setCategories] = useState<NoteCategory[]>([]);
  const [editingNote, setEditingNote] = useState<Note | null | 'new'>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<Note | null>(null);
  const [batchDeleteConfirm, setBatchDeleteConfirm] = useState(false);
  const [showCategoryManager, setShowCategoryManager] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  // 左滑返回手势
  const swipeHandlers = useSwipeBack({ onBack: onClose });

  // 主题状态
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('notes-theme-mode');
    return (saved as ThemeMode) || 'auto';
  });

  // 简洁模式状态
  const [compactMode, setCompactMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('notes-compact-mode');
    return saved === 'true';
  });

  // 选择模式状态
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedNotes, setSelectedNotes] = useState<Set<number>>(new Set());

  // 删除动画状态
  const [deletingNotes, setDeletingNotes] = useState<Set<number>>(new Set());

  // 虚拟滚动 - 只渲染可见区域的笔记
  const [visibleCount, setVisibleCount] = useState(20);
  const listRef = useRef<HTMLDivElement>(null);

  // 计算实际主题
  const isDark = getActualTheme(themeMode) === 'dark';
  const theme = getThemeColors(isDark);

  // 保存主题设置
  useEffect(() => {
    localStorage.setItem('notes-theme-mode', themeMode);
  }, [themeMode]);

  // 保存简洁模式设置
  useEffect(() => {
    localStorage.setItem('notes-compact-mode', String(compactMode));
  }, [compactMode]);

  // 自动模式下定时检查时间
  useEffect(() => {
    if (themeMode !== 'auto') return;
    const interval = setInterval(() => {
      // 触发重新渲染以更新主题
      setThemeMode(prev => prev);
    }, 60000); // 每分钟检查一次
    return () => clearInterval(interval);
  }, [themeMode]);

  // 切换主题
  const cycleTheme = () => {
    setThemeMode(prev => {
      if (prev === 'auto') return 'light';
      if (prev === 'light') return 'dark';
      return 'auto';
    });
  };

  // 加载分类
  const loadCategories = useCallback(async () => {
    const userId = getStoredUserId();
    if (!userId) return;

    const { data, error } = await supabase
      .from('note_categories')
      .select('*')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });

    if (!error && data) {
      setCategories(data);
    }
  }, []);

  // 加载笔记 - 优化：保持旧数据直到新数据加载完成，避免闪动
  const loadNotes = useCallback(async (showLoading = true) => {
    const userId = getStoredUserId();
    if (!userId) return;

    // 只有首次加载或强制刷新时才显示 loading
    if (showLoading && notes.length === 0) {
      setLoading(true);
    }

    const { data, error } = await supabase
      .from('notes')
      .select('*')
      .eq('user_id', userId)
      .order('is_pinned', { ascending: false })
      .order('pin_order', { ascending: false })
      .order('updated_at', { ascending: false });

    if (!error && data) {
      setNotes(data);
    }
    setLoading(false);
  }, [notes.length]);

  // 添加分类
  const handleAddCategory = async () => {
    const userId = getStoredUserId();
    if (!userId || !newCategoryName.trim()) return;

    const { error } = await supabase
      .from('note_categories')
      .insert({
        user_id: userId,
        name: newCategoryName.trim(),
        sort_order: categories.length
      });

    if (!error) {
      setNewCategoryName('');
      loadCategories();
    }
  };

  // 删除分类
  const handleDeleteCategory = async (catId: number) => {
    const { error } = await supabase
      .from('note_categories')
      .delete()
      .eq('id', catId);

    if (!error) {
      loadCategories();
    }
  };

  useEffect(() => {
    if (isOpen) {
      // 首次打开时加载，后续静默刷新
      loadNotes(notes.length === 0);
      loadCategories();
    }
  }, [isOpen, loadNotes, loadCategories, notes.length]);

  // 筛选笔记
  const filteredNotes = useMemo(() => {
    return notes.filter(note => {
      if (selectedCategory && note.category !== selectedCategory) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        return note.title.toLowerCase().includes(term) ||
          (note.preview?.toLowerCase().includes(term));
      }
      return true;
    });
  }, [notes, searchTerm, selectedCategory]);

  // 置顶笔记
  const pinnedNotes = filteredNotes.filter(n => n.is_pinned);
  const unpinnedNotes = filteredNotes.filter(n => !n.is_pinned);

  // 虚拟滚动：只渲染可见的笔记
  const visiblePinnedNotes = pinnedNotes.slice(0, Math.min(visibleCount, pinnedNotes.length));
  const remainingCount = Math.max(0, visibleCount - pinnedNotes.length);
  const visibleUnpinnedNotes = unpinnedNotes.slice(0, remainingCount);

  // 滚动加载更多
  useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    let ticking = false;
    const handleScroll = () => {
      if (!ticking) {
        requestAnimationFrame(() => {
          const { scrollTop, scrollHeight, clientHeight } = container;
          // 距离底部 500px 时加载更多
          if (scrollTop + clientHeight >= scrollHeight - 500) {
            setVisibleCount(prev => Math.min(prev + 20, filteredNotes.length));
          }
          ticking = false;
        });
        ticking = true;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [filteredNotes.length]);

  // 筛选条件变化时重置可见数量
  useEffect(() => {
    setVisibleCount(20);
  }, [searchTerm, selectedCategory]);

  // 保存笔记
  const handleSave = async (data: CreateNoteParams | UpdateNoteParams) => {
    const userId = getStoredUserId();
    if (!userId) {
      console.error('未登录，无法保存笔记');
      return;
    }

    try {
      if (editingNote === 'new') {
        // 新建
        const { data: newNote, error } = await supabase
          .from('notes')
          .insert({
            ...data,
            user_id: userId,
            is_pinned: false,
            pin_order: 0
          })
          .select()
          .single();

        if (error) {
          console.error('创建笔记失败:', error);
          return;
        }
        console.log('笔记创建成功:', newNote);
        // 新建后切换到编辑模式，继续编辑
        setEditingNote(newNote);
      } else if (editingNote) {
        // 更新
        const { error } = await supabase
          .from('notes')
          .update({ ...data, updated_at: new Date().toISOString() })
          .eq('id', editingNote.id);

        if (error) {
          console.error('更新笔记失败:', error);
          return;
        }
        // 更新本地状态
        setEditingNote({ ...editingNote, ...data, updated_at: new Date().toISOString() } as Note);
      }

      // 不关闭编辑器，只刷新列表
      await loadNotes();
    } catch (err) {
      console.error('保存笔记异常:', err);
    }
  };

  // 切换置顶 - 使用乐观更新避免卡顿
  const handleTogglePin = async (note: Note) => {
    const newPinned = !note.is_pinned;
    const newPinOrder = newPinned ? Math.floor(Date.now() / 1000) % 2147483647 : 0;

    // 乐观更新 - 立即更新本地状态
    setNotes(prev => prev.map(n =>
      n.id === note.id ? { ...n, is_pinned: newPinned, pin_order: newPinOrder } : n
    ).sort((a, b) => {
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (a.is_pinned && b.is_pinned) return (b.pin_order || 0) - (a.pin_order || 0);
      return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
    }));

    // 后台同步到数据库
    const { error } = await supabase
      .from('notes')
      .update({ is_pinned: newPinned, pin_order: newPinOrder })
      .eq('id', note.id);
    if (error) {
      console.error('置顶失败:', error);
      loadNotes(); // 失败时重新加载
    }
  };

  // 删除单个笔记
  const handleDelete = async () => {
    if (!deleteConfirm) return;
    await supabase.from('notes').delete().eq('id', deleteConfirm.id);
    setDeleteConfirm(null);
    loadNotes();
  };

  // 批量删除笔记
  const handleBatchDelete = async () => {
    if (selectedNotes.size === 0) return;

    // 先播放删除动画
    setDeletingNotes(new Set(selectedNotes));
    // 等待动画完成
    await new Promise(resolve => setTimeout(resolve, 300));

    // 删除数据
    for (const noteId of selectedNotes) {
      await supabase.from('notes').delete().eq('id', noteId);
    }

    setDeletingNotes(new Set());
    setSelectionMode(false);
    setSelectedNotes(new Set());
    setBatchDeleteConfirm(false);
    loadNotes();
  };

  if (!isOpen) return null;

  // 解构出事件处理器，排除 swipeState
  const { swipeState: _, ...swipeEventHandlers } = swipeHandlers;

  return createPortal(
    <div 
      className="fixed inset-0 z-[99998] flex flex-col notes-page-enter" 
      style={{ backgroundColor: theme.bg, fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif' }}
      {...swipeEventHandlers}
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 right-20 w-80 h-80 rounded-full blur-3xl notes-blob" style={{ background: isDark ? 'rgba(0,122,255,0.08)' : 'rgba(0,122,255,0.05)' }} />
        <div className="absolute bottom-20 -left-40 w-80 h-80 rounded-full blur-3xl notes-blob notes-blob-delay" style={{ background: isDark ? 'rgba(175,82,222,0.08)' : 'rgba(175,82,222,0.05)' }} />
      </div>

      {/* 顶部导航 - Apple 风格 */}
      <div className="sticky top-0 z-10 notes-header-enter" style={{ backgroundColor: theme.headerBg, backdropFilter: 'blur(20px)', borderBottom: `0.5px solid ${theme.border}` }}>
        <div className="max-w-7xl mx-auto w-full">
          {/* 选择模式工具栏 */}
          {selectionMode ? (
            <div className="flex items-center gap-3 px-4 py-3">
              <button
                onClick={() => { setSelectionMode(false); setSelectedNotes(new Set()); }}
                className="p-2 -ml-2 rounded-xl hover:bg-black/5 transition-colors"
              >
                <span style={{ color: theme.accent }} className="text-base font-medium">取消</span>
              </button>

              <div className="flex-1 text-center">
                <span className="font-semibold" style={{ color: theme.text }}>
                  已选择 {selectedNotes.size} 项
                </span>
              </div>

              {/* 选择模式操作按钮 */}
              <div className="flex items-center gap-2">
                {/* 复制 */}
                <button
                  onClick={() => {
                    const selectedNotesArr = notes.filter(n => selectedNotes.has(n.id));
                    const content = selectedNotesArr.map(n => {
                      const tempDiv = document.createElement('div');
                      tempDiv.innerHTML = n.content || '';
                      return `${n.title || '无标题'}\n${tempDiv.textContent || ''}`;
                    }).join('\n\n---\n\n');
                    navigator.clipboard.writeText(content);
                    setSelectionMode(false);
                    setSelectedNotes(new Set());
                  }}
                  disabled={selectedNotes.size === 0}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 disabled:opacity-30"
                  style={{ backgroundColor: theme.inputBg }}
                  title="复制"
                >
                  <svg className="w-5 h-5" style={{ color: theme.accent }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>

                {/* 置顶 */}
                <button
                  onClick={async () => {
                    for (const noteId of selectedNotes) {
                      const note = notes.find(n => n.id === noteId);
                      if (note) await handleTogglePin(note);
                    }
                    setSelectionMode(false);
                    setSelectedNotes(new Set());
                  }}
                  disabled={selectedNotes.size === 0}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 disabled:opacity-30"
                  style={{ backgroundColor: theme.inputBg }}
                  title="置顶"
                >
                  <svg className="w-5 h-5" style={{ color: '#FF9F0A' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M16 4v8l2 2v2h-6v6l-1 1-1-1v-6H4v-2l2-2V4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2z" />
                  </svg>
                </button>

                <button
                  onClick={() => setBatchDeleteConfirm(true)}
                  disabled={selectedNotes.size === 0}
                  className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105 disabled:opacity-30"
                  style={{ backgroundColor: 'rgba(255,59,48,0.1)' }}
                  title="删除"
                >
                  <svg className="w-5 h-5" style={{ color: '#FF3B30' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                  </svg>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3 px-4 py-3">
              <button onClick={onClose} className="p-2 -ml-2 rounded-xl hover:bg-black/5 transition-colors">
                <svg className="w-6 h-6" style={{ color: theme.accent }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>

              <div className="flex-1">
                <h1 className="font-bold text-xl" style={{ color: theme.text }}>笔记</h1>
                <p className="text-xs" style={{ color: theme.textSecondary }}>{notes.length} 条笔记</p>
              </div>

              {/* 简洁模式切换按钮 */}
              <button
                onClick={() => setCompactMode(!compactMode)}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105"
                style={{ backgroundColor: compactMode ? theme.accent : theme.inputBg }}
                title={compactMode ? '详细模式' : '简洁模式'}
              >
                <svg className="w-5 h-5" style={{ color: compactMode ? '#FFFFFF' : theme.accent }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>

              {/* 主题切换按钮 - 显示当前实际主题图标 */}
              <button
                onClick={cycleTheme}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105"
                style={{ backgroundColor: theme.inputBg }}
                title={themeMode === 'auto' ? `自动 (${isDark ? '深色' : '浅色'})` : themeMode === 'light' ? '浅色' : '深色'}
              >
                {/* 根据实际显示的主题显示图标，自动模式显示 A 标记 */}
                {isDark ? (
                  <div className="relative">
                    <svg className="w-5 h-5" style={{ color: '#FFD60A' }} viewBox="0 0 24 24" fill="currentColor">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                    </svg>
                    {themeMode === 'auto' && (
                      <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#007AFF] rounded-full text-[8px] text-white flex items-center justify-center font-bold">A</span>
                    )}
                  </div>
                ) : (
                  <div className="relative">
                    <svg className="w-5 h-5" style={{ color: '#FF9500' }} viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="5" />
                      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" stroke="currentColor" strokeWidth="2" fill="none" />
                    </svg>
                    {themeMode === 'auto' && (
                      <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-[#007AFF] rounded-full text-[8px] text-white flex items-center justify-center font-bold">A</span>
                    )}
                  </div>
                )}
              </button>

              {/* 管理分类按钮 */}
              <button
                onClick={() => setShowCategoryManager(true)}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105"
                style={{ backgroundColor: theme.inputBg }}
                title="管理分类"
              >
                <svg className="w-5 h-5" style={{ color: theme.accent }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
              </button>

              {/* 新建按钮 */}
              <button
                onClick={() => setEditingNote('new')}
                className="w-10 h-10 rounded-full flex items-center justify-center transition-all hover:scale-105"
                style={{ backgroundColor: '#007AFF' }}
              >
                <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
            </div>
          )}

          {/* 搜索栏 - Apple 风格 */}
          <div className="px-4 pb-3">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: theme.textSecondary }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
              </svg>
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="搜索"
                className="w-full pl-11 pr-4 py-2.5 rounded-xl text-base focus:outline-none"
                style={{ backgroundColor: theme.inputBg, color: theme.text }}
              />
            </div>
          </div>

          {/* 分类筛选 - Apple 风格 */}
          <div className="px-4 pb-3 flex gap-2 overflow-x-auto no-scrollbar">
            <button
              onClick={() => setSelectedCategory(null)}
              className="shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all"
              style={{
                backgroundColor: !selectedCategory ? theme.accent : theme.inputBg,
                color: !selectedCategory ? 'white' : theme.text
              }}
            >
              全部
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.name)}
                className="shrink-0 px-4 py-2 rounded-full text-sm font-medium transition-all"
                style={{
                  backgroundColor: selectedCategory === cat.name ? theme.accent : theme.inputBg,
                  color: selectedCategory === cat.name ? 'white' : theme.text
                }}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 笔记列表 - Apple 风格 */}
      <div className="flex-1 overflow-y-auto p-4" ref={listRef}>
        <div className="max-w-7xl mx-auto w-full">
          {loading && notes.length === 0 ? (
            <div style={{ columnCount: 2, columnGap: '12px' }}>
              {[...Array(6)].map((_, i) => (
                <div
                  key={i}
                  className="skeleton-card"
                  style={{
                    breakInside: 'avoid',
                    marginBottom: '12px',
                    backgroundColor: theme.cardBg,
                    borderRadius: '16px',
                    padding: '16px',
                    border: `1px solid ${theme.border}`,
                    animationDelay: `${i * 100}ms`
                  }}
                >
                  <div className="skeleton-line" style={{ width: '60%', height: '14px', marginBottom: '12px', backgroundColor: theme.inputBg, borderRadius: '4px' }} />
                  <div className="skeleton-line" style={{ width: '100%', height: '10px', marginBottom: '8px', backgroundColor: theme.inputBg, borderRadius: '4px' }} />
                  <div className="skeleton-line" style={{ width: '90%', height: '10px', marginBottom: '8px', backgroundColor: theme.inputBg, borderRadius: '4px' }} />
                  <div className="skeleton-line" style={{ width: '70%', height: '10px', marginBottom: '16px', backgroundColor: theme.inputBg, borderRadius: '4px' }} />
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div className="skeleton-line" style={{ width: '30px', height: '10px', backgroundColor: theme.inputBg, borderRadius: '4px' }} />
                    <div className="skeleton-line" style={{ width: '50px', height: '10px', backgroundColor: theme.inputBg, borderRadius: '4px' }} />
                  </div>
                </div>
              ))}
              <style>{`
              .skeleton-card {
                animation: skeletonPulse 1.5s ease-in-out infinite;
              }
              .skeleton-line {
                animation: skeletonShimmer 1.5s ease-in-out infinite;
              }
              @keyframes skeletonPulse {
                0%, 100% { opacity: 1; }
                50% { opacity: 0.6; }
              }
              @keyframes skeletonShimmer {
                0% { opacity: 0.5; }
                50% { opacity: 0.8; }
                100% { opacity: 0.5; }
              }
            `}</style>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-20 h-20 rounded-full flex items-center justify-center mb-4" style={{ backgroundColor: theme.inputBg }}>
                <svg className="w-10 h-10" style={{ color: theme.border }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
              </div>
              <p className="text-base" style={{ color: theme.textSecondary }}>暂无笔记</p>
              <button
                onClick={() => setEditingNote('new')}
                className="mt-4 px-5 py-2.5 text-sm font-medium rounded-full transition-all"
                style={{ backgroundColor: theme.accent, color: 'white' }}
              >
                创建第一条笔记
              </button>
            </div>
          ) : (
            <div className="space-y-5">
              {/* 简洁模式 - 只显示标题列表 */}
              {compactMode ? (
                <div className="space-y-2">
                  {/* 置顶笔记 */}
                  {visiblePinnedNotes.length > 0 && (
                    <div className="mb-4">
                      <h3 className="text-xs font-semibold mb-2 flex items-center gap-1.5 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
                        <svg className="w-3.5 h-3.5" style={{ color: '#FF9F0A' }} viewBox="0 0 24 24" fill="currentColor">
                          <path d="M16 4v8l2 2v2h-6v6l-1 1-1-1v-6H4v-2l2-2V4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2z" />
                        </svg>
                        置顶
                      </h3>
                      {visiblePinnedNotes.map((note) => (
                        <div
                          key={note.id}
                          onClick={() => setEditingNote(note)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all hover:scale-[1.01]"
                          style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}
                        >
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lightColorConfig[note.color].text }} />
                          <span className="flex-1 text-sm font-medium truncate" style={{ color: theme.text }}>
                            {note.title || '无标题'}
                          </span>
                          <span className="text-xs" style={{ color: theme.textSecondary }}>
                            {new Date(note.updated_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* 普通笔记 */}
                  {visibleUnpinnedNotes.length > 0 && (
                    <div>
                      {visiblePinnedNotes.length > 0 && (
                        <h3 className="text-xs font-semibold mb-2 uppercase tracking-wide" style={{ color: theme.textSecondary }}>其他笔记</h3>
                      )}
                      {visibleUnpinnedNotes.map((note) => (
                        <div
                          key={note.id}
                          onClick={() => setEditingNote(note)}
                          className="flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer transition-all hover:scale-[1.01] mb-2"
                          style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}
                        >
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: lightColorConfig[note.color].text }} />
                          <span className="flex-1 text-sm font-medium truncate" style={{ color: theme.text }}>
                            {note.title || '无标题'}
                          </span>
                          <span className="text-xs" style={{ color: theme.textSecondary }}>
                            {new Date(note.updated_at).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })}
                          </span>
                        </div>
                      ))}
                      {/* 加载更多提示 */}
                      {visibleUnpinnedNotes.length < unpinnedNotes.length && (
                        <div className="text-center py-4">
                          <span className="text-xs" style={{ color: theme.textSecondary }}>
                            滑动加载更多...
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {/* 置顶笔记 */}
                  {visiblePinnedNotes.length > 0 && (
                    <div>
                      <h3 className="text-xs font-semibold mb-3 flex items-center gap-1.5 uppercase tracking-wide" style={{ color: theme.textSecondary }}>
                        <svg className="w-3.5 h-3.5" style={{ color: '#FF9F0A' }} viewBox="0 0 24 24" fill="currentColor">
                          <path d="M16 4v8l2 2v2h-6v6l-1 1-1-1v-6H4v-2l2-2V4c0-1.1.9-2 2-2h6c1.1 0 2 .9 2 2z" />
                        </svg>
                        置顶
                      </h3>
                      {/* 瀑布流布局 - 使用 CSS Grid 替代 column-count 提升性能 */}
                      <div className="grid grid-cols-2 gap-3" style={{ alignItems: 'start' }}>
                        {visiblePinnedNotes.map((note, index) => (
                          <div key={note.id} style={{ gridRow: `span ${Math.ceil((note.content?.length || 100) / 200)}` }}>
                            <NoteCard
                              note={note}
                              onClick={() => setEditingNote(note)}
                              onLongPress={() => { setSelectionMode(true); setSelectedNotes(new Set([note.id])); }}
                              isDark={isDark}
                              selectionMode={selectionMode}
                              isSelected={selectedNotes.has(note.id)}
                              onToggleSelect={() => {
                                setSelectedNotes(prev => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(note.id)) newSet.delete(note.id);
                                  else newSet.add(note.id);
                                  return newSet;
                                });
                              }}
                              animationIndex={index}
                              isDeleting={deletingNotes.has(note.id)}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 普通笔记 */}
                  {visibleUnpinnedNotes.length > 0 && (
                    <div>
                      {visiblePinnedNotes.length > 0 && (
                        <h3 className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: theme.textSecondary }}>其他笔记</h3>
                      )}
                      {/* 瀑布流布局 - 使用 CSS Grid 替代 column-count 提升性能 */}
                      <div className="grid grid-cols-2 gap-3" style={{ alignItems: 'start' }}>
                        {visibleUnpinnedNotes.map((note, index) => (
                          <div key={note.id} style={{ gridRow: `span ${Math.ceil((note.content?.length || 100) / 200)}` }}>
                            <NoteCard
                              note={note}
                              onClick={() => setEditingNote(note)}
                              onLongPress={() => { setSelectionMode(true); setSelectedNotes(new Set([note.id])); }}
                              isDark={isDark}
                              selectionMode={selectionMode}
                              isSelected={selectedNotes.has(note.id)}
                              onToggleSelect={() => {
                                setSelectedNotes(prev => {
                                  const newSet = new Set(prev);
                                  if (newSet.has(note.id)) newSet.delete(note.id);
                                  else newSet.add(note.id);
                                  return newSet;
                                });
                              }}
                              animationIndex={visiblePinnedNotes.length + index}
                              isDeleting={deletingNotes.has(note.id)}
                            />
                          </div>
                        ))}
                      </div>
                      {/* 加载更多提示 */}
                      {visibleUnpinnedNotes.length < unpinnedNotes.length && (
                        <div className="text-center py-4">
                          <span className="text-xs" style={{ color: theme.textSecondary }}>
                            滑动加载更多...
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 编辑器 */}
      {editingNote && (
        <NoteEditor
          note={editingNote === 'new' ? null : editingNote}
          categories={categories}
          onSave={handleSave}
          onClose={() => setEditingNote(null)}
          onOpenCategoryManager={() => setShowCategoryManager(true)}
        />
      )}

      {/* 分类管理弹窗 - Apple 风格 */}
      {showCategoryManager && createPortal(
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4" onClick={() => setShowCategoryManager(false)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-sm overflow-hidden"
            style={{ backgroundColor: theme.cardBg, borderRadius: '14px', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }}
            onClick={e => e.stopPropagation()}
          >
            {/* 标题 */}
            <div className="flex items-center justify-between px-4 py-4" style={{ borderBottom: `0.5px solid ${theme.border}` }}>
              <h3 className="font-semibold text-lg" style={{ color: theme.text }}>管理分类</h3>
              <button onClick={() => setShowCategoryManager(false)} className="p-1 hover:bg-black/5 rounded-full transition-colors">
                <svg className="w-6 h-6" style={{ color: theme.textSecondary }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* 添加分类 */}
            <div className="p-4" style={{ borderBottom: `0.5px solid ${theme.border}` }}>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="输入分类名称..."
                  className="flex-1 px-4 py-2.5 rounded-xl text-sm focus:outline-none"
                  style={{ backgroundColor: theme.inputBg, color: theme.text, border: `1px solid ${theme.border}` }}
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCategory()}
                />
                <button
                  onClick={handleAddCategory}
                  disabled={!newCategoryName.trim()}
                  className="px-5 py-2.5 text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
                  style={{ backgroundColor: theme.accent, color: 'white' }}
                >
                  添加
                </button>
              </div>
            </div>

            {/* 分类列表 */}
            <div className="max-h-60 overflow-y-auto">
              {categories.length === 0 ? (
                <div className="p-8 text-center text-sm" style={{ color: theme.textSecondary }}>
                  暂无分类，添加一个吧
                </div>
              ) : (
                <div className="py-2">
                  {categories.map(cat => (
                    <div key={cat.id} className="flex items-center justify-between px-4 py-3 hover:bg-black/5 group transition-colors">
                      <span className="text-base" style={{ color: theme.text }}>{cat.name}</span>
                      <button
                        onClick={() => handleDeleteCategory(cat.id)}
                        className="p-2 opacity-0 group-hover:opacity-100 hover:bg-red-50 rounded-full transition-all"
                        title="删除分类"
                      >
                        <svg className="w-5 h-5" style={{ color: '#FF3B30' }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* 单个删除确认 */}
      {deleteConfirm && (
        <DeleteConfirmModal
          title="删除笔记？"
          itemName={deleteConfirm.title || '无标题'}
          onConfirm={handleDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {/* 批量删除确认 */}
      {batchDeleteConfirm && (
        <DeleteConfirmModal
          title="批量删除"
          message={`确定要删除选中的 ${selectedNotes.size} 篇笔记吗？此操作无法撤销。`}
          onConfirm={handleBatchDelete}
          onCancel={() => setBatchDeleteConfirm(false)}
        />
      )}

      {/* 页面动画样式 */}
      <style>{`
        .notes-page-enter { animation: notesPageEnter 0.3s ease-out; }
        .notes-header-enter { animation: notesHeaderEnter 0.4s ease-out; }
        .notes-blob { animation: notesBlob 8s ease-in-out infinite; }
        .notes-blob-delay { animation-delay: 2s; }
        @keyframes notesPageEnter { from { opacity: 0; } to { opacity: 1; } }
        @keyframes notesHeaderEnter { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes notesBlob { 0%, 100% { transform: translate(0, 0) scale(1); } 33% { transform: translate(20px, -20px) scale(1.1); } 66% { transform: translate(-15px, 15px) scale(0.95); } }
      `}</style>
    </div>,
    document.body
  );
};

export default NotesPage;
