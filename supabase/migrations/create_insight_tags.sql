-- ============================================
-- 每日信息差 - 用户兴趣标签表
-- ============================================

CREATE TABLE IF NOT EXISTS insight_tags (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,
    tag VARCHAR(50) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 外键关联用户
    CONSTRAINT fk_insight_tags_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
    -- 同一用户下标签唯一
    CONSTRAINT unique_user_tag UNIQUE (user_id, tag)
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_insight_tags_user_id ON insight_tags(user_id);

-- RLS策略
ALTER TABLE insight_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all for insight_tags" ON insight_tags FOR ALL USING (true) WITH CHECK (true);

-- 表注释
COMMENT ON TABLE insight_tags IS '每日信息差用户兴趣标签表';
COMMENT ON COLUMN insight_tags.tag IS '用户感兴趣的领域标签，如：科技、心理学、经济学等';
