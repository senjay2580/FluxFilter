# 多 API Key 转写系统指南

## 功能概述

这个系统允许用户配置多个 Groq API Key，并通过负载均衡自动分配转写任务。

## 核心组件

### 1. Groq API 池 (`lib/groq-api-pool.ts`)

管理多个 API Key 的生命周期和负载均衡。

**主要功能**：
- 添加/移除 API Key
- 负载均衡（选择请求数最少的 API Key）
- 统计信息（请求数、总请求数等）
- 持久化存储（localStorage）

**使用示例**：
```typescript
import { groqApiPool } from './lib/groq-api-pool';

// 添加 API Key
const id = groqApiPool.addApiKey('gsk_...', 'API Key 1');

// 获取下一个最空闲的 API Key
const apiKey = groqApiPool.getNextApiKey();

// 获取统计信息
const stats = groqApiPool.getStats();
```

### 2. 转写服务更新 (`lib/transcribe-service.ts`)

支持从 API 池中选择 API Key。

**关键变化**：
- `transcribe()` 方法现在接受可选的 `apiKeyId` 参数
- 如果没有指定 `apiKeyId`，自动从池中选择最空闲的 API Key
- 转写完成后自动更新 API Key 的统计信息

**使用示例**：
```typescript
// 使用指定的 API Key
await transcribeService.transcribe(file, false, callback, 'key_123');

// 自动选择最空闲的 API Key
await transcribeService.transcribe(file, false, callback);
```

### 3. 多转写器组件 (`components/tools/MultiAudioTranscriber.tsx`)

提供 UI 来管理多个 API Key 和转写页面。

**功能**：
- 显示多个 Tab，每个对应一个 API Key
- API Key 管理面板（添加、删除、启用/禁用）
- 实时显示每个 API Key 的负载情况
- 自动初始化 API 池

**使用示例**：
```typescript
import MultiAudioTranscriber from './components/tools/MultiAudioTranscriber';

// 在你的应用中使用
<MultiAudioTranscriber onNavigate={handleNavigate} />
```

## 工作流程

1. **初始化**：
   - 用户打开应用
   - 系统从 localStorage 加载已保存的 API Key

2. **配置 API Key**：
   - 用户在 API 管理面板中添加多个 API Key
   - 每个 API Key 有一个名称和状态（启用/禁用）

3. **转写**：
   - 用户在某个 Tab 中上传音频文件
   - 系统使用该 Tab 对应的 API Key 进行转写
   - 或者系统自动选择最空闲的 API Key

4. **负载均衡**：
   - 系统跟踪每个 API Key 的当前请求数
   - 新的转写任务分配给请求数最少的 API Key
   - 避免单个 API Key 过载

## 配置示例

### 添加多个 API Key

```typescript
const transcribeService = new TranscribeService();

// 添加 3 个 API Key
transcribeService.addApiKey('gsk_key1...', 'API Key 1');
transcribeService.addApiKey('gsk_key2...', 'API Key 2');
transcribeService.addApiKey('gsk_key3...', 'API Key 3');

// 查看统计信息
const stats = transcribeService.getApiPoolStats();
console.log(stats);
// 输出：
// {
//   totalKeys: 3,
//   activeKeys: 3,
//   totalRequests: 0,
//   currentLoad: 0,
//   keyStats: [...]
// }
```

### 使用特定 API Key

```typescript
// 使用第一个 API Key
const apiKeys = transcribeService.getAllApiKeys();
const taskId = await transcribeService.transcribe(
  file,
  false,
  callback,
  apiKeys[0].id
);
```

## 负载均衡算法

系统使用**最少连接**算法：

1. 获取所有活跃的 API Key
2. 按当前请求数排序
3. 选择请求数最少的 API Key
4. 如果请求数相同，选择最先添加的 API Key

这确保了负载均衡分布，避免单个 API Key 过载。

## 速率限制处理

当遇到 429（Too Many Requests）错误时：

1. 系统自动等待 `Retry-After` 指定的时间
2. 如果没有 `Retry-After`，默认等待 30 秒
3. 自动重试最多 3 次
4. 如果仍然失败，返回错误信息

## 存储和持久化

API Key 配置保存在 Supabase 的 `ai_config` 表中：

```sql
-- ai_config 表结构
CREATE TABLE ai_config (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,               -- 用户 ID
    model_id VARCHAR(100) NOT NULL,      -- 模型标识（'groq' 表示 Groq API）
    api_key TEXT NOT NULL,               -- API Key
    custom_model_name VARCHAR(255),      -- 自定义名称
    settings JSONB DEFAULT '{}'::jsonb,  -- 扩展设置
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_user_ai_model UNIQUE (user_id, model_id)
);
```

**优势**：
- ✅ 多用户隔离（每个用户独立的 API Key）
- ✅ 数据持久化（不会因浏览器清空而丢失）
- ✅ 跨设备同步（登录任何设备都能访问）
- ✅ 安全存储（由 Supabase 管理）

## 最佳实践

1. **配置多个 API Key**：
   - 如果有多个 Groq 账户，配置多个 API Key
   - 这样可以提高转写速度和可靠性

2. **监控负载**：
   - 定期检查 API Key 的统计信息
   - 如果某个 API Key 经常过载，考虑添加更多 API Key

3. **禁用而不是删除**：
   - 如果某个 API Key 出现问题，先禁用而不是删除
   - 这样可以保留统计信息用于调试

4. **定期更新**：
   - 定期检查 API Key 的有效性
   - 删除过期或不再使用的 API Key

## 故障排除

### 问题：转写失败，显示"API 速率限制"

**解决方案**：
- 添加更多 API Key
- 等待一段时间后重试
- 升级 Groq 账户到付费版本

### 问题：某个 API Key 显示高负载

**解决方案**：
- 添加更多 API Key 来分散负载
- 禁用该 API Key，让其他 API Key 处理任务
- 检查是否有长时间运行的转写任务

### 问题：API Key 配置丢失

**解决方案**：
- 检查是否登录了正确的账户
- 确保网络连接正常
- 检查 Supabase 数据库是否可访问
- 如果数据库中没有数据，重新添加 API Key

## 集成到现有应用

如果你已经有一个使用 `AudioTranscriber` 的应用，可以这样升级：

```typescript
// 旧方式
import AudioTranscriber from './components/tools/AudioTranscriber';
<AudioTranscriber onNavigate={handleNavigate} />

// 新方式（支持多 API Key）
import MultiAudioTranscriber from './components/tools/MultiAudioTranscriber';
<MultiAudioTranscriber onNavigate={handleNavigate} />
```

`MultiAudioTranscriber` 完全兼容旧的 `AudioTranscriber` 接口，同时提供了新的多 API Key 功能。
