# 分块分割线设计说明

## 概述

在并发分块处理长文本时，为了提高可读性，在每个分块之间添加了美观的分割线。

## 实现方式

### 1. 后端分块标记

在 `lib/transcribe-service.ts` 中，分块之间使用 `\n---\n` 作为分隔符：

```typescript
// 在分块之间添加分割线
if (i < totalChunks - 1 && results.get(i + 1)) {
  contents.push('\n---\n');
}
```

### 2. 前端渲染

在 `components/tools/AudioTranscriber.tsx` 中，按分割线分割内容并渲染：

```typescript
{optimizedResult.split('\n---\n').map((section, idx) => (
  <div key={idx}>
    <p>{section}</p>
    {idx < optimizedResult.split('\n---\n').length - 1 && (
      <hr className="my-4 border-none h-px bg-gradient-to-r from-transparent via-violet-500/30 to-transparent" />
    )}
  </div>
))}
```

### 3. 样式定义

在 `styles/chunk-divider.css` 中定义分割线样式：

```css
hr {
  margin: 2rem 0;
  border: none;
  height: 2px;
  background: linear-gradient(
    to right,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
}
```

## 视觉效果

### 分割线特点

✨ **渐变效果** - 从透明到半透明再到透明
✨ **主题适配** - 自动适配深色/浅色主题
✨ **平滑过渡** - 悬停时透明度变化
✨ **合理间距** - 上下各 1.5-2rem 的间距

### 深色主题

```
第一个分块的内容
...

        ─────────────────────
        
第二个分块的内容
...
```

### 浅色主题

分割线颜色会自动调整为浅色，保持对比度。

## 使用场景

### 自动应用

当文本长度 > 2000 字时，自动分块并添加分割线：

```
原文本 (10000 字)
  ↓
分块 1 (2000 字) + 分割线
分块 2 (2000 字) + 分割线
分块 3 (2000 字) + 分割线
分块 4 (2000 字) + 分割线
分块 5 (2000 字)
```

### 复制行为

用户复制优化结果时，分割线也会被复制（作为 `---` 的 Markdown 格式）。

## 自定义样式

### 修改分割线颜色

编辑 `styles/chunk-divider.css`：

```css
hr {
  background: linear-gradient(
    to right,
    transparent,
    rgba(100, 200, 255, 0.3),  /* 修改这里 */
    transparent
  );
}
```

### 修改分割线间距

```css
hr {
  margin: 3rem 0;  /* 从 2rem 改为 3rem */
}
```

### 修改分割线高度

```css
hr {
  height: 3px;  /* 从 2px 改为 3px */
}
```

## 相关文件

- `lib/transcribe-service.ts` - 分块处理逻辑
- `components/tools/AudioTranscriber.tsx` - UI 渲染
- `styles/chunk-divider.css` - 样式定义

## 最佳实践

### 1. 保持一致性

分割线样式应该与应用的整体设计风格保持一致。

### 2. 可读性优先

确保分割线不会过于突出，影响内容的可读性。

### 3. 响应式设计

在不同屏幕尺寸上测试分割线的显示效果。

## 故障排查

### 问题：分割线不显示

**原因**：CSS 文件未被正确导入

**解决**：
1. 检查 `chunk-divider.css` 是否存在
2. 检查导入语句是否正确
3. 清除浏览器缓存

### 问题：分割线样式不对

**原因**：CSS 被其他样式覆盖

**解决**：
1. 增加 CSS 选择器的特异性
2. 使用 `!important`（谨慎使用）
3. 检查 Tailwind CSS 的冲突

### 问题：分割线在复制时显示为 `---`

**这是正常的**，因为 `---` 是 Markdown 的分割线语法。

## 未来改进

- [ ] 支持自定义分割线样式
- [ ] 添加分块编号显示
- [ ] 支持分块折叠/展开
- [ ] 添加分块导航
