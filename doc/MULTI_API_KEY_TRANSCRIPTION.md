# 多 API Key 并发转写指南

## 功能概述

支持配置多个 Groq API Key，实现同时转写多个文件的功能。每个 API Key 对应一个独立的转写页面，用户可以通过 Tab 切换。

## 核心特性

### 1. 多 API Key 管理
- 在设置中配置多个 Groq API Key
- 每个 API Key 可以选择不同的 Whisper 模型（v3 或 v3-turbo）
- 支持启用/禁用 API Key
- 显示每个 API Key 的请求统计

### 2. Tab 切换界面
- 每个 API Key 对应一个转写页面
- 用户可以通过 Tab 快速切换
- 支持同时在多个 Tab 中进行转写

### 3. 负载均衡
- 系统自动选择请求数最少的 API Key
- 根据文件大小智能调整并发数：
  - 小文件（< 50MB）：2 个并发
  - 中等文件（50-100MB）：1 个并发
  - 大文件（> 100MB）：1 个并发

### 4. 独立的悬浮窗
- 主悬浮球显示总体转写状态
- 每个 API Key 有独立的悬浮球显示其任务数
- 悬浮球堆叠显示，便于查看多个任务

## 使用流程

### 第一步：配置 API Key

1. 打开设置 → API 池
2. 在"Groq API 池"部分添加 API Key
3. 输入 API Key 名称（如"API Key 1"）
4. 选择 Whisper 模型（v3-turbo 或 v3）
5. 输入 API Key
6. 点击"添加 API Key"

### 第二步：进行转写

1. 打开音频转写工具
2. 系统会自动为每个 API Key 创建一个 Tab
3. 在不同 Tab 中上传不同的文件
4. 系统会自动分配到对应的 API Key 进行转写

### 第三步：监控进度

- 主悬浮球显示是否有转写任务在进行
- 每个 API Key 的悬浮球显示该 API Key 的任务数
- 点击悬浮球可以快速返回转写页面

## 技术实现

### 数据库架构

`ai_config` 表支持多个 Groq API Key：
- `model_id`: Whisper 模型 ID（whisper-large-v3-turbo 或 whisper-large-v3）
- `custom_model_name`: API Key 的别名（用于区分多个 Key）
- 唯一约束：`(user_id, model_id, custom_model_name)`

### 转写流程

1. 用户上传文件到某个 Tab
2. 系统获取该 Tab 对应的 API Key ID
3. 创建转写任务，标记 `apiKeyId`
4. 转写完成后，更新任务状态
5. 通过事件通知 UI 更新悬浮球

### 状态管理

- `transcribeService.getActiveTasksForApiKey(apiKeyId)`: 获取特定 API Key 的活跃任务数
- `transcribe-status` 事件包含 `tasksByApiKey` 信息
- 每个 API Key 的悬浮球独立显示其任务数

## 相关文件

- `components/tools/MultiAudioTranscriber.tsx` - 多 API Key 转写界面
- `components/tools/AudioTranscriber.tsx` - 单个转写页面
- `lib/groq-api-pool.ts` - API 池管理
- `lib/transcribe-service.ts` - 转写服务
- `App.tsx` - 主应用（包含悬浮球逻辑）
- `components/settings/SettingsModal.tsx` - 设置界面

## 常见问题

### Q: 如何同时转写多个文件？
A: 在不同的 Tab 中分别上传文件即可。系统会自动为每个文件分配对应 API Key 的转写任务。

### Q: 悬浮球太多了怎么办？
A: 悬浮球会堆叠显示，只有有任务的 API Key 才会显示悬浮球。

### Q: 如何切换 API Key？
A: 点击 Tab 栏中的 API Key 名称即可切换到对应的转写页面。

### Q: 如何禁用某个 API Key？
A: 在设置 → API 池中，点击对应 API Key 的"禁用"按钮。禁用后该 Key 不会被使用。
