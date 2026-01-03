-- ============================================
-- 创建通知表
-- 用于存储系统通知（如定时同步结果）
-- ============================================

CREATE TABLE IF NOT EXISTS notification (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,               -- 所属用户ID
    type VARCHAR(50) NOT NULL,           -- 通知类型: sync_result, system, etc.
    title VARCHAR(200) NOT NULL,         -- 通知标题
    content TEXT,                        -- 通知内容
    data JSONB,                          -- 额外数据（如新增视频列表）
    is_read BOOLEAN DEFAULT false,       -- 是否已读
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 外键关联用户
    CONSTRAINT fk_notification_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_notification_user_id ON notification(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_created_at ON notification(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_unread ON notification(user_id, is_read) WHERE is_read = false;

-- RLS
ALTER TABLE notification ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for notification" ON notification FOR ALL USING (true) WITH CHECK (true);

-- 注释
COMMENT ON TABLE notification IS '通知表：存储系统通知，如定时同步结果';
COMMENT ON COLUMN notification.type IS '通知类型: sync_result=同步结果, system=系统通知';
COMMENT ON COLUMN notification.data IS 'JSON格式额外数据，如 {videos_added: 5, new_videos: [...]}';
