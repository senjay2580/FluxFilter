# 文本分块和并行 AI 优化指南

## 问题背景

当转写的文本内容过长时，AI 生成的优化内容可能会被截断。这是因为 AI 模型有 token 限制，无法一次性处理超长文本。

## 修复内容（v2）

### 修复的问题

1. **并发处理死锁** ✅
   - 修复了 `processChunksInParallel` 中的 Promise 管理逻辑
   - 使用 Set 而不是数组，避免索引查找导致的性能问题
   - 正确处理 Promise 完成和移除

2. **结果合并卡顿** ✅
   - 优化了 `mergeChunkResults` 的去重算法
   - 避免了不必要的数组操作
   - 添加了空结果过滤

3. **进度更新频繁** ✅
   - 限制进度更新频率（每 500ms 一次）
   - 避免频繁的数组操作和重新计算
   - 使用 Map 存储已完成的结果

## 解决方案

我们实现了一个智能的文本分块和并行处理系统，具有以下特点：

### 1. 智能分块策略

#### 按长度分块（默认）
- 每个分块最多 3000 字符（约 1500 个中文字）
- 尽量在句子边界处分割（句号、问号、感叹号）
- 分块之间有 200 字符的重叠，保持上下文连贯

```typescript
import { chunkTextByLength } from '@/lib/text-chunking-service';

const chunks = chunkTextByLength(longText, {
  maxChunkLength: 3000,
  overlapLength: 200,
});
```

#### 按段落分块
适合有明确段落结构的文本（用双换行符分隔）

```typescript
import { chunkTextByParagraph } from '@/lib/text-chunking-service';

const chunks = chunkTextByParagraph(longText);
```

#### 按页数分块
假设每页约 600 字符

```typescript
import { chunkTextByPage } from '@/lib/text-chunking-service';

const chunks = chunkTextByPage(longText, 600);
```

#### 自动选择策略
根据文本特征自动选择最合适的分块方式

```typescript
import { selectChunkingStrategy } from '@/lib/text-chunking-service';

const chunks = selectChunkingStrategy(longText, hasStructure);
```

### 2. 并行处理

系统支持最多 3 个并发 AI 请求，大幅加快处理速度：

```typescript
import { processChunksInParallel } from '@/lib/text-chunking-service';

const results = await processChunksInParallel(
  chunks,
  async (chunk) => {
    // 处理单个分块
    return await optimizeChunk(chunk);
  },
  3 // 最多 3 个并发
);
```

### 3. 结果合并

自动合并多个分块的优化结果：

```typescript
import { mergeChunkResults } from '@/lib/text-chunking-service';

const { title, content } = mergeChunkResults(results, chunks);
```

合并策略：
- 使用第一个分块的标题作为整体标题
- 所有分块的内容按顺序拼接
- 自动去除分块之间的重复内容

### 4. 自动集成

`transcribeService` 已自动集成分块处理：

```typescript
// 当文本超过 3000 字符时，自动使用分块处理
await transcribeService.optimizeText(
  recordId,
  longText,
  fileName,
  (title, content) => {
    // 实时更新进度
    console.log('进度:', title, content.length);
  },
  (title, content) => {
    // 完成回调
    console.log('完成:', title);
  }
);
```

## 性能指标

### 处理时间估算

```typescript
import { estimateProcessingTime } from '@/lib/text-chunking-service';

// 估算 10000 字符文本的处理时间
const timeMs = estimateProcessingTime(10000);
console.log(`预计耗时: ${timeMs}ms`);
```

### 实际性能

| 文本长度 | 分块数 | 并发数 | 预计时间 |
|---------|--------|--------|---------|
| 3000 字 | 1 | 1 | ~5s |
| 6000 字 | 2 | 2 | ~5s |
| 9000 字 | 3 | 3 | ~5s |
| 15000 字 | 5 | 3 | ~10s |
| 30000 字 | 10 | 3 | ~20s |

## 最佳实践

### 1. 文本预处理

在分块前进行基本的文本清理：

```typescript
function preprocessText(text: string): string {
  return text
    .trim()
    .replace(/\s+/g, ' ') // 合并多个空格
    .replace(/\n{3,}/g, '\n\n'); // 合并多个换行
}
```

### 2. 选择合适的分块大小

- **短文本**（< 3000 字）：不分块，直接处理
- **中等文本**（3000-10000 字）：按长度分块，每块 3000 字
- **长文本**（> 10000 字）：按段落分块（如果有结构），否则按长度分块

### 3. 监控处理进度

```typescript
let processedChunks = 0;
const totalChunks = chunks.length;

await processChunksInParallel(chunks, async (chunk) => {
  const result = await optimizeChunk(chunk);
  processedChunks++;
  console.log(`进度: ${processedChunks}/${totalChunks}`);
  return result;
});
```

### 4. 错误处理

分块处理中单个分块失败不会影响整体：

```typescript
const results = await processChunksInParallel(chunks, async (chunk) => {
  try {
    return await optimizeChunk(chunk);
  } catch (err) {
    console.error(`分块 ${chunk.index} 失败:`, err);
    // 返回原文本作为备选
    return {
      chunkIndex: chunk.index,
      content: chunk.text,
      error: err.message,
    };
  }
});
```

## 配置调优

### 调整分块大小

如果 AI 仍然截断内容，减小分块大小：

```typescript
const chunks = chunkTextByLength(text, {
  maxChunkLength: 2000, // 从 3000 减小到 2000
  overlapLength: 150,
});
```

### 调整并发数

如果遇到 API 限流，减少并发数：

```typescript
await processChunksInParallel(
  chunks,
  processor,
  2 // 从 3 减小到 2
);
```

### 调整重叠长度

增加重叠以保持更好的上下文连贯性：

```typescript
const chunks = chunkTextByLength(text, {
  maxChunkLength: 3000,
  overlapLength: 300, // 从 200 增加到 300
});
```

## 故障排查

### 问题：合并后的内容仍然不完整

**原因**：分块大小过小，导致内容被过度分割

**解决**：增加 `maxChunkLength`

```typescript
const chunks = chunkTextByLength(text, {
  maxChunkLength: 4000, // 增加分块大小
});
```

### 问题：处理速度很慢

**原因**：并发数过低或分块过多

**解决**：增加并发数或减小分块数

```typescript
// 增加并发数
await processChunksInParallel(chunks, processor, 5);

// 或增加分块大小以减少分块数
const chunks = chunkTextByLength(text, {
  maxChunkLength: 5000,
});
```

### 问题：某些分块处理失败

**原因**：API 限流或网络问题

**解决**：添加重试逻辑

```typescript
async function optimizeChunkWithRetry(chunk, config, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await optimizeChunk(chunk, config);
    } catch (err) {
      if (i === maxRetries - 1) throw err;
      await new Promise(r => setTimeout(r, 1000 * (i + 1))); // 指数退避
    }
  }
}
```

## 总结

这个分块处理系统提供了：

✅ **智能分块**：自动选择最合适的分块策略
✅ **并行处理**：最多 3 个并发请求，加快速度
✅ **自动合并**：无缝合并分块结果
✅ **错误恢复**：单个分块失败不影响整体
✅ **进度监控**：实时反馈处理进度
✅ **灵活配置**：支持自定义分块参数

通过这个系统，你可以放心地处理任意长度的文本，而不用担心 AI 生成内容被截断。
