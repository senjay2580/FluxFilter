-- ============================================
-- 同步锁表 - 用于控制多用户并发同步
-- ============================================

CREATE TABLE IF NOT EXISTS sync_lock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 每个用户只能有一个锁
    CONSTRAINT unique_user_lock UNIQUE (user_id)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_sync_lock_started_at ON sync_lock(started_at);

-- RLS
ALTER TABLE sync_lock ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for sync_lock" ON sync_lock FOR ALL USING (true) WITH CHECK (true);

-- 注释
COMMENT ON TABLE sync_lock IS '同步锁表：控制多用户并发同步，避免B站API限流';
