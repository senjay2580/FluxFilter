# Groq API 池配置指南

## 问题描述
当添加多个Groq API Key时，会遇到错误：
```
duplicate key value violates unique constraint "unique_user_ai_model"
```

这是因为数据库表`ai_config`有唯一约束`UNIQUE (user_id, model_id)`，限制了每个用户对每个模型只能有一条记录。

## 解决方案
需要更新数据库表结构，将唯一约束改为`UNIQUE (user_id, model_id, custom_model_name)`，这样可以支持多个Groq API Key。

## 执行步骤

### 1. 在 Supabase 中执行 Migration

打开 Supabase Dashboard → SQL Editor，执行以下SQL：

```sql
-- 删除旧的唯一约束
ALTER TABLE ai_config DROP CONSTRAINT IF EXISTS unique_user_ai_model;

-- 添加新的唯一约束（包含 custom_model_name）
ALTER TABLE ai_config ADD CONSTRAINT unique_user_ai_model_name UNIQUE (user_id, model_id, custom_model_name);

-- 添加新的索引
CREATE INDEX IF NOT EXISTS idx_ai_config_user_model ON ai_config(user_id, model_id);

-- 更新表注释
COMMENT ON TABLE ai_config IS 'AI 配置表：存储用户自定义的 AI 模型参数和密钥，支持多个Groq API Key';
COMMENT ON COLUMN ai_config.custom_model_name IS '自定义名称，用于区分同一模型的多个配置（如多个Groq API Key）';
```

### 2. 验证更新

执行后，应该能够成功添加多个Groq API Key。

## 工作原理

- **model_id**: 存储Groq模型ID（如`whisper-large-v3-turbo`或`whisper-large-v3`）
- **custom_model_name**: 用户给API Key起的名称（如"API Key 1"、"API Key 2"）
- **唯一约束**: `(user_id, model_id, custom_model_name)` 确保同一用户对同一模型的不同API Key有不同的名称

## 相关文件

- `supabase/ai_config.sql` - AI配置表定义
- `supabase/migrations/update_ai_config_for_groq_pool.sql` - Migration脚本
- `lib/groq-api-pool.ts` - Groq API池管理器
- `components/settings/SettingsModal.tsx` - 设置界面
