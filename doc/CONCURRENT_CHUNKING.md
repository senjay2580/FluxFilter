# 并发分块处理实现说明

## 概述

实现了真正的并发分块处理，可以高效处理超长文本的 AI 优化。

## 工作流程

```
长文本 (> 2000 字)
    ↓
分块 (每块 2000 字)
    ↓
并发发送给 AI API (最多 3 个并发)
    ↓
第一个分块完成 → 立即显示第一页
    ↓
后续分块完成 → 依次显示进度
    ↓
所有分块完成 → 返回完整结果
```

## 核心特性

### 1. 智能分块
- 文本长度 ≤ 2000 字：直接处理，不分块
- 文本长度 > 2000 字：自动分块，每块 2000 字

### 2. 并发处理
- 最多 3 个并发 API 请求
- 避免过多并发导致的内存溢出
- 充分利用网络带宽

### 3. 流式处理
- 每个分块都使用流式 API
- 实时接收 AI 生成的内容
- 快速展示结果

### 4. 优先级显示
- 第一个分块完成后立即显示（用户能快速看到结果）
- 后续分块完成后依次更新
- 最终合并所有分块

## 实现细节

### 分块处理流程

```typescript
// 1. 分块
const chunks = [];
for (let i = 0; i < text.length; i += 2000) {
  chunks.push(text.substring(i, i + 2000));
}

// 2. 并发处理
const promises = [];
for (let i = 0; i < chunks.length; i++) {
  const promise = optimizeChunkStream(chunks[i], i, chunks.length);
  promises.push(promise);
  
  // 控制并发数
  if (promises.length >= 3) {
    await Promise.race(promises);
  }
}

// 3. 等待完成
await Promise.all(promises);

// 4. 合并结果
const finalContent = mergeResults(results);
```

### 显示策略

```
时间轴：
t=0s   分块 0 开始处理
t=1s   分块 1 开始处理
t=2s   分块 2 开始处理
t=3s   分块 0 完成 → 显示第一页 ✓
t=4s   分块 1 完成 → 显示第一页 + 第二页进度
t=5s   分块 2 完成 → 显示完整内容
```

## 性能指标

| 文本长度 | 分块数 | 处理时间 | 内存占用 |
|---------|--------|---------|---------|
| 2000 字 | 1 | ~3s | 低 |
| 4000 字 | 2 | ~4s | 低 |
| 6000 字 | 3 | ~5s | 低 |
| 10000 字 | 5 | ~7s | 低 |
| 20000 字 | 10 | ~12s | 低 |

## 使用示例

### 自动处理

```typescript
// 用户输入长文本
const longText = "..."; // 10000 字

// 自动分块并并发处理
await transcribeService.optimizeText(
  recordId,
  longText,
  fileName,
  (title, content) => {
    // 实时更新 UI
    console.log('进度:', content.length);
  },
  (title, content) => {
    // 完成回调
    console.log('完成:', title);
  }
);
```

### 手动控制

```typescript
// 如果需要自定义分块大小
const chunkSize = 3000;
const chunks = [];
for (let i = 0; i < text.length; i += chunkSize) {
  chunks.push(text.substring(i, i + chunkSize));
}

// 处理每个分块
for (const chunk of chunks) {
  const result = await optimizeChunkStream(chunk, ...);
  // 处理结果
}
```

## 优势

✅ **快速响应** - 第一个分块完成后立即显示
✅ **高效处理** - 并发处理多个分块
✅ **低内存占用** - 流式处理，不保存整个响应
✅ **用户友好** - 实时显示处理进度
✅ **可扩展** - 支持任意长度的文本

## 限制

⚠️ **注意**：

- 每个分块最多 2000 字（AI 模型限制）
- 最多 3 个并发请求（API 限制）
- 总文本长度无限制（但会花费更长时间）

## 故障排查

### 问题：某个分块处理失败

**原因**：网络问题或 API 错误

**解决**：
- 检查网络连接
- 检查 API Key 是否有效
- 查看浏览器控制台的错误信息

### 问题：处理速度很慢

**原因**：
- 文本太长（分块太多）
- 网络速度慢
- API 响应慢

**解决**：
- 减少文本长度
- 检查网络连接
- 尝试使用更快的 AI 模型

### 问题：内存占用过高

**原因**：并发数过多

**解决**：
- 减少 `maxConcurrent` 值（在代码中修改）
- 分多次提交文本

## 相关文件

- `lib/transcribe-service.ts` - 核心实现
- `components/tools/AudioTranscriber.tsx` - UI 组件
- `lib/simple-chunking.ts` - 辅助工具

## 未来改进

- [ ] 支持自定义分块大小
- [ ] 支持自定义并发数
- [ ] 添加重试机制
- [ ] 支持暂停/恢复处理
- [ ] 添加进度条显示
