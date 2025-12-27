-- ============================================
-- 更新 ai_config 表以支持多个 Groq API Key
-- ============================================

-- 1. 删除旧的唯一约束
ALTER TABLE ai_config DROP CONSTRAINT IF EXISTS unique_user_ai_model;

-- 2. 添加新的唯一约束（包含 custom_model_name）
ALTER TABLE ai_config ADD CONSTRAINT unique_user_ai_model_name UNIQUE (user_id, model_id, custom_model_name);

-- 3. 添加新的索引
CREATE INDEX IF NOT EXISTS idx_ai_config_user_model ON ai_config(user_id, model_id);

-- 4. 更新表注释
COMMENT ON TABLE ai_config IS 'AI 配置表：存储用户自定义的 AI 模型参数和密钥，支持多个Groq API Key';
COMMENT ON COLUMN ai_config.custom_model_name IS '自定义名称，用于区分同一模型的多个配置（如多个Groq API Key）';
