# Implementation Tasks

## Task 1: 扩展 lib/bilibili.ts API 函数
- [x] 添加 AISummary, SubtitleInfo, SubtitleContent 类型定义
- [x] 实现 getVideoCid() 获取视频CID
- [x] 实现 getVideoAISummary() 获取AI总结
- [x] 实现 getVideoSubtitleList() 获取字幕列表
- [x] 实现 getSubtitleContent() 获取字幕内容
- [x] 实现 getVideoSubtitles() 获取完整字幕（优先中文）
- [x] 添加 localStorage 缓存机制（24小时TTL）

## Task 2: 扩展 api/bilibili.ts 代理
- [x] 添加字幕URL代理支持 (subtitle_url 参数)
- [x] 保持原有API代理功能

## Task 3: 创建 AISummaryModal 组件
- [x] 创建 components/video/AISummaryModal.tsx
- [x] 实现 Tab 切换（AI总结/字幕）
- [x] 实现加载状态和错误处理
- [x] 实现复制全部功能
- [x] 实现章节大纲展示（带时间戳）
- [x] 实现字幕列表展示（带时间戳）

## Task 4: 集成到 VideoCard
- [x] 导入 AISummaryModal 组件
- [x] 添加 showAISummary 状态
- [x] 在抽屉菜单添加"AI总结"按钮
- [x] 在抽屉菜单添加"获取字幕"按钮
- [x] 渲染 AISummaryModal

## Task 5: 开发环境代理配置
- [x] 在 vite.config.ts 添加 /bili-subtitle 代理
