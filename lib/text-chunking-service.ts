/**
 * 文本分块和并行 AI 优化服务
 * 用于处理超长文本，避免 AI 生成内容被截断
 */

export interface ChunkConfig {
  maxChunkLength: number; // 单个分块的最大字符数
  overlapLength: number; // 分块之间的重叠字符数（用于保持上下文）
  maxConcurrent: number; // 最大并发请求数
}

export interface TextChunk {
  index: number;
  text: string;
  startIndex: number;
  endIndex: number;
  isLastChunk: boolean;
}

export interface ChunkResult {
  chunkIndex: number;
  title?: string;
  content: string;
  error?: string;
}

// 默认配置 - 更激进的分块以节省内存
const DEFAULT_CONFIG: ChunkConfig = {
  maxChunkLength: 2000, // 每个分块最多 2000 字符
  overlapLength: 100, // 分块之间重叠 100 字符
  maxConcurrent: 2, // 最多 2 个并发请求（减少内存占用）
};

/**
 * 按字符数分块
 */
export function chunkTextByLength(
  text: string,
  config: Partial<ChunkConfig> = {}
): TextChunk[] {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const { maxChunkLength, overlapLength } = finalConfig;

  if (text.length <= maxChunkLength) {
    return [{
      index: 0,
      text,
      startIndex: 0,
      endIndex: text.length,
      isLastChunk: true,
    }];
  }

  const chunks: TextChunk[] = [];
  let currentIndex = 0;

  while (currentIndex < text.length) {
    const chunkStart = currentIndex;
    let chunkEnd = Math.min(currentIndex + maxChunkLength, text.length);

    // 如果不是最后一个分块，尝试在句子边界处分割
    if (chunkEnd < text.length) {
      // 从 chunkEnd 往前找最近的句号、问号、感叹号或换行符
      let boundaryIndex = chunkEnd;
      for (let i = chunkEnd; i > chunkStart + maxChunkLength * 0.5; i--) {
        const char = text[i];
        if (char === '。' || char === '！' || char === '？' || char === '\n') {
          boundaryIndex = i + 1;
          break;
        }
      }
      chunkEnd = boundaryIndex;
    }

    const chunkText = text.substring(chunkStart, chunkEnd);
    chunks.push({
      index: chunks.length,
      text: chunkText,
      startIndex: chunkStart,
      endIndex: chunkEnd,
      isLastChunk: chunkEnd >= text.length,
    });

    // 移动到下一个分块的起始位置（考虑重叠）
    currentIndex = chunkEnd - overlapLength;
    if (currentIndex >= text.length) break;
  }

  return chunks;
}

/**
 * 按段落分块（用于有明确段落结构的文本）
 */
export function chunkTextByParagraph(
  text: string,
  config: Partial<ChunkConfig> = {}
): TextChunk[] {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const { maxChunkLength } = finalConfig;

  // 按双换行符分割段落
  const paragraphs = text.split(/\n\n+/);
  const chunks: TextChunk[] = [];
  let currentChunk = '';
  let currentStartIndex = 0;

  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length <= maxChunkLength) {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    } else {
      if (currentChunk) {
        chunks.push({
          index: chunks.length,
          text: currentChunk,
          startIndex: currentStartIndex,
          endIndex: currentStartIndex + currentChunk.length,
          isLastChunk: false,
        });
        currentStartIndex += currentChunk.length + 2; // +2 for \n\n
      }
      currentChunk = paragraph;
    }
  }

  if (currentChunk) {
    chunks.push({
      index: chunks.length,
      text: currentChunk,
      startIndex: currentStartIndex,
      endIndex: currentStartIndex + currentChunk.length,
      isLastChunk: true,
    });
  }

  return chunks;
}

/**
 * 按页数分块（假设每页约 500-800 字符）
 */
export function chunkTextByPage(
  text: string,
  charsPerPage: number = 600,
  config: Partial<ChunkConfig> = {}
): TextChunk[] {
  const finalConfig = { ...DEFAULT_CONFIG, ...config };
  const maxChunkLength = charsPerPage;
  return chunkTextByLength(text, { ...finalConfig, maxChunkLength });
}

/**
 * 并行处理多个文本分块（简化版本，避免内存溢出）
 */
export async function processChunksInParallel<T>(
  chunks: TextChunk[],
  processor: (chunk: TextChunk) => Promise<T>,
  maxConcurrent: number = 2
): Promise<T[]> {
  const results: T[] = new Array(chunks.length);
  let currentIndex = 0;

  // 简单的队列处理，避免创建过多 Promise
  while (currentIndex < chunks.length) {
    const batch: Promise<void>[] = [];
    
    // 创建当前批次的任务
    for (let i = 0; i < maxConcurrent && currentIndex < chunks.length; i++) {
      const chunkIndex = currentIndex;
      const chunk = chunks[chunkIndex];
      
      const promise = processor(chunk)
        .then(result => {
          results[chunkIndex] = result;
        })
        .catch(err => {
          console.error(`处理分块 ${chunkIndex} 失败:`, err);
          results[chunkIndex] = null as any;
        });
      
      batch.push(promise);
      currentIndex++;
    }
    
    // 等待当前批次完成
    await Promise.all(batch);
  }

  return results;
}

/**
 * 合并多个分块的优化结果（简化版本）
 */
export function mergeChunkResults(
  results: ChunkResult[],
  originalChunks: TextChunk[]
): { title: string; content: string } {
  if (!results || results.length === 0) {
    return { title: '', content: '' };
  }

  // 使用第一个分块的标题
  const title = results[0]?.title || '';

  // 简单拼接内容（不做复杂的去重）
  const contents: string[] = [];
  for (const result of results) {
    if (result && result.content) {
      contents.push(result.content);
    }
  }

  // 用换行符连接，避免复杂的字符串操作
  const content = contents.join('\n');

  return { title, content };
}

/**
 * 智能选择分块策略
 */
export function selectChunkingStrategy(
  text: string,
  hasStructure: boolean = false
): TextChunk[] {
  const textLength = text.length;

  // 如果文本不超过 3000 字符，不需要分块
  if (textLength <= 3000) {
    return [{
      index: 0,
      text,
      startIndex: 0,
      endIndex: textLength,
      isLastChunk: true,
    }];
  }

  // 如果有明确的段落结构（包含多个双换行符），使用段落分块
  if (hasStructure && text.includes('\n\n')) {
    return chunkTextByParagraph(text);
  }

  // 否则使用长度分块
  return chunkTextByLength(text);
}

/**
 * 估算文本处理时间
 */
export function estimateProcessingTime(
  textLength: number,
  chunkSize: number = 3000,
  timePerChunk: number = 5000 // 毫秒
): number {
  const chunkCount = Math.ceil(textLength / chunkSize);
  const maxConcurrent = 3;
  const batches = Math.ceil(chunkCount / maxConcurrent);
  return batches * timePerChunk;
}
