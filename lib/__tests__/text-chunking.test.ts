/**
 * 文本分块服务测试
 */

import {
  chunkTextByLength,
  chunkTextByParagraph,
  processChunksInParallel,
  mergeChunkResults,
  selectChunkingStrategy,
  type TextChunk,
  type ChunkResult,
} from '../text-chunking-service';

// 生成测试文本
function generateLongText(length: number): string {
  const baseText = '这是一段测试文本。';
  let result = '';
  while (result.length < length) {
    result += baseText;
  }
  return result.substring(0, length);
}

describe('文本分块服务', () => {
  describe('chunkTextByLength', () => {
    it('应该正确分块短文本', () => {
      const text = '这是一段短文本。';
      const chunks = chunkTextByLength(text);
      expect(chunks.length).toBe(1);
      expect(chunks[0].text).toBe(text);
    });

    it('应该正确分块长文本', () => {
      const text = generateLongText(10000);
      const chunks = chunkTextByLength(text, { maxChunkLength: 3000 });
      expect(chunks.length).toBeGreaterThan(1);
      
      // 验证每个分块的大小
      chunks.forEach((chunk, i) => {
        if (!chunk.isLastChunk) {
          expect(chunk.text.length).toBeLessThanOrEqual(3000);
        }
      });
    });

    it('应该在句子边界处分割', () => {
      const text = '第一句。第二句。第三句。';
      const chunks = chunkTextByLength(text, { maxChunkLength: 5 });
      // 应该在句号处分割，而不是在中间
      chunks.forEach(chunk => {
        expect(chunk.text).toMatch(/。$/);
      });
    });
  });

  describe('processChunksInParallel', () => {
    it('应该正确处理并发任务', async () => {
      const chunks: TextChunk[] = [
        { index: 0, text: 'chunk1', startIndex: 0, endIndex: 6, isLastChunk: false },
        { index: 1, text: 'chunk2', startIndex: 6, endIndex: 12, isLastChunk: false },
        { index: 2, text: 'chunk3', startIndex: 12, endIndex: 18, isLastChunk: true },
      ];

      const results = await processChunksInParallel(
        chunks,
        async (chunk) => {
          // 模拟异步处理
          await new Promise(r => setTimeout(r, 10));
          return { chunkIndex: chunk.index, content: chunk.text.toUpperCase() };
        },
        2
      );

      expect(results.length).toBe(3);
      expect(results[0].content).toBe('CHUNK1');
      expect(results[1].content).toBe('CHUNK2');
      expect(results[2].content).toBe('CHUNK3');
    });

    it('应该不会卡住', async () => {
      const chunks: TextChunk[] = Array.from({ length: 10 }, (_, i) => ({
        index: i,
        text: `chunk${i}`,
        startIndex: i * 6,
        endIndex: (i + 1) * 6,
        isLastChunk: i === 9,
      }));

      const startTime = Date.now();
      const results = await processChunksInParallel(
        chunks,
        async (chunk) => {
          await new Promise(r => setTimeout(r, 50));
          return { chunkIndex: chunk.index, content: chunk.text };
        },
        3
      );
      const duration = Date.now() - startTime;

      expect(results.length).toBe(10);
      // 3 并发，10 个任务，每个 50ms，应该约 200ms
      expect(duration).toBeLessThan(500);
    });
  });

  describe('mergeChunkResults', () => {
    it('应该正确合并结果', () => {
      const results: ChunkResult[] = [
        { chunkIndex: 0, title: '标题', content: '第一部分内容。' },
        { chunkIndex: 1, content: '第二部分内容。' },
        { chunkIndex: 2, content: '第三部分内容。' },
      ];

      const chunks: TextChunk[] = [
        { index: 0, text: '', startIndex: 0, endIndex: 0, isLastChunk: false },
        { index: 1, text: '', startIndex: 0, endIndex: 0, isLastChunk: false },
        { index: 2, text: '', startIndex: 0, endIndex: 0, isLastChunk: true },
      ];

      const merged = mergeChunkResults(results, chunks);
      expect(merged.title).toBe('标题');
      expect(merged.content).toContain('第一部分');
      expect(merged.content).toContain('第二部分');
      expect(merged.content).toContain('第三部分');
    });

    it('应该处理空结果', () => {
      const results: ChunkResult[] = [];
      const chunks: TextChunk[] = [];

      const merged = mergeChunkResults(results, chunks);
      expect(merged.title).toBe('');
      expect(merged.content).toBe('');
    });
  });

  describe('selectChunkingStrategy', () => {
    it('短文本不应该分块', () => {
      const text = '这是一段短文本。';
      const chunks = selectChunkingStrategy(text);
      expect(chunks.length).toBe(1);
    });

    it('长文本应该分块', () => {
      const text = generateLongText(5000);
      const chunks = selectChunkingStrategy(text);
      expect(chunks.length).toBeGreaterThan(1);
    });

    it('有段落结构的文本应该使用段落分块', () => {
      const text = '第一段。\n\n第二段。\n\n第三段。' + generateLongText(5000);
      const chunks = selectChunkingStrategy(text, true);
      expect(chunks.length).toBeGreaterThan(1);
    });
  });
});
