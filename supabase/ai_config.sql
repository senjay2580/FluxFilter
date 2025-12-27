-- ============================================
-- FluxFilter - AI 配置管理脚本
-- 支持多用户隔离，持久化存储 AI 模型 API Key 和设置
-- ============================================

-- 1. AI 配置表
CREATE TABLE IF NOT EXISTS ai_config (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,               -- 所属用户ID（关联 user.id）
    model_id VARCHAR(100) NOT NULL,       -- AI 模型标识符（如 'deepseek-chat', 'whisper-large-v3-turbo'）
    api_key TEXT NOT NULL,                -- 对应的 API 密钥
    base_url TEXT,                        -- 自定义 API 终端地址
    custom_model_name VARCHAR(255),       -- 自定义模型名称（用于Groq API Key的别名）
    settings JSONB DEFAULT '{}'::jsonb,   -- 扩展设置（如 temperature, maxTokens 等）
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 外键关联用户
    CONSTRAINT fk_ai_config_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
    -- 对于非Groq模型，同一用户下每个模型的配置唯一
    -- 对于Groq模型，允许多个API Key（通过custom_model_name区分）
    CONSTRAINT unique_user_ai_model UNIQUE (user_id, model_id, custom_model_name)
);

-- 索引优化
CREATE INDEX IF NOT EXISTS idx_ai_config_user_id ON ai_config(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_config_model_id ON ai_config(model_id);
CREATE INDEX IF NOT EXISTS idx_ai_config_user_model ON ai_config(user_id, model_id);

-- 2. 触发器：自动更新 updated_at
-- (update_updated_at_column 函数已在 schema.sql 中定义)
DROP TRIGGER IF EXISTS update_ai_config_updated_at ON ai_config;
CREATE TRIGGER update_ai_config_updated_at
    BEFORE UPDATE ON ai_config
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 3. Row Level Security (RLS)
ALTER TABLE ai_config ENABLE ROW LEVEL SECURITY;

-- 策略：允许所有操作（由应用层逻辑控制 user_id 隔离，保持与 schema.sql 风格一致）
DROP POLICY IF EXISTS "Allow all for ai_config" ON ai_config;
CREATE POLICY "Allow all for ai_config" ON ai_config FOR ALL USING (true) WITH CHECK (true);

-- 4. 表注释
COMMENT ON TABLE ai_config IS 'AI 配置表：存储用户自定义的 AI 模型参数和密钥，支持多个Groq API Key';
COMMENT ON COLUMN ai_config.model_id IS 'AI 模型唯一标识，如 deepseek-chat、whisper-large-v3-turbo 等';
COMMENT ON COLUMN ai_config.custom_model_name IS '自定义名称，用于区分同一模型的多个配置（如多个Groq API Key）';
