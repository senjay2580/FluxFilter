-- ============================================
-- 音频转写历史记录表
-- ============================================

CREATE TABLE IF NOT EXISTS transcript_history (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,               -- 所属用户ID
    file_name VARCHAR(255) NOT NULL,     -- 原始文件名
    raw_text TEXT NOT NULL,              -- 原始转写文本
    optimized_text TEXT,                 -- AI优化后的文本（可选）
    ai_model VARCHAR(100),               -- 使用的AI模型（如 deepseek-chat）
    duration INTEGER,                    -- 音频时长（秒）
    file_size INTEGER,                   -- 文件大小（字节）
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 外键关联用户
    CONSTRAINT fk_transcript_history_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_transcript_history_user_id ON transcript_history(user_id);
CREATE INDEX IF NOT EXISTS idx_transcript_history_created_at ON transcript_history(user_id, created_at DESC);

-- RLS策略
ALTER TABLE transcript_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for transcript_history" ON transcript_history FOR ALL USING (true) WITH CHECK (true);

-- 触发器：自动更新 updated_at
DROP TRIGGER IF EXISTS update_transcript_history_updated_at ON transcript_history;
CREATE TRIGGER update_transcript_history_updated_at
    BEFORE UPDATE ON transcript_history
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

COMMENT ON TABLE transcript_history IS '音频转写历史记录表：存储用户的语音转写结果';