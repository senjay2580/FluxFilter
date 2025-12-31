-- ============================================
-- 每日信息差记忆表
-- 存储用户生成过的所有信息卡片，用于 AI 去重
-- ============================================

-- 1. 信息卡片历史表
CREATE TABLE IF NOT EXISTS insight_history (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title VARCHAR(100) NOT NULL,
  category VARCHAR(50) NOT NULL,
  source VARCHAR(200),
  core_content TEXT,
  tags TEXT[], -- 标签数组
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. 索引优化
CREATE INDEX IF NOT EXISTS idx_insight_history_user_id ON insight_history(user_id);
CREATE INDEX IF NOT EXISTS idx_insight_history_created_at ON insight_history(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_insight_history_title ON insight_history(user_id, title);

-- 3. RLS 策略
ALTER TABLE insight_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for insight_history" ON insight_history;
CREATE POLICY "Allow all for insight_history" ON insight_history FOR ALL USING (true) WITH CHECK (true);

-- 4. 表注释
COMMENT ON TABLE insight_history IS '每日信息差历史记录表：存储用户生成过的所有信息卡片，用于 AI 记忆去重';
COMMENT ON COLUMN insight_history.title IS '卡片标题，用于去重检测';
COMMENT ON COLUMN insight_history.category IS '分类：Industry_Insight, Cognitive_Upgrade, Life_Heuristics, Global_Perspective, Golden_Quote';
COMMENT ON COLUMN insight_history.tags IS '标签数组，用于主题聚类';
