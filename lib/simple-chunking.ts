/**
 * 简化的文本分块方案
 * 避免内存溢出，采用流式处理
 */

export interface SimpleChunk {
  index: number;
  text: string;
  isLast: boolean;
}

/**
 * 简单分块：按固定大小分割
 * 不保存所有分块在内存中，而是按需生成
 */
export function* generateChunks(
  text: string,
  chunkSize: number = 2000
): Generator<SimpleChunk> {
  let index = 0;
  let offset = 0;

  while (offset < text.length) {
    const end = Math.min(offset + chunkSize, text.length);
    const chunk = text.substring(offset, end);
    
    yield {
      index,
      text: chunk,
      isLast: end >= text.length,
    };

    offset = end;
    index++;
  }
}

/**
 * 检查文本是否需要分块
 */
export function shouldChunk(text: string): boolean {
  return text.length > 2000;
}

/**
 * 获取分块数量
 */
export function getChunkCount(text: string, chunkSize: number = 2000): number {
  return Math.ceil(text.length / chunkSize);
}
