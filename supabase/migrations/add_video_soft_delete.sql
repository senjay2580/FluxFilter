-- ============================================
-- 添加视频软删除功能
-- 支持回收站功能，删除的视频可恢复
-- ============================================

-- 1. 添加软删除字段
ALTER TABLE video 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

ALTER TABLE video 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 2. 为 collected_video 表也添加软删除支持
ALTER TABLE collected_video 
ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false;

ALTER TABLE collected_video 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- 3. 创建索引优化回收站查询
CREATE INDEX IF NOT EXISTS idx_video_deleted 
ON video(user_id, is_deleted, deleted_at DESC);

CREATE INDEX IF NOT EXISTS idx_collected_video_deleted 
ON collected_video(user_id, is_deleted, deleted_at DESC);

-- 4. 更新现有数据（确保所有现有视频 is_deleted = false）
UPDATE video SET is_deleted = false WHERE is_deleted IS NULL;
UPDATE collected_video SET is_deleted = false WHERE is_deleted IS NULL;

-- 5. 添加注释
COMMENT ON COLUMN video.is_deleted IS '软删除标记：false=正常，true=已删除（在回收站）';
COMMENT ON COLUMN video.deleted_at IS '删除时间，用于回收站按时间分组展示';
COMMENT ON COLUMN collected_video.is_deleted IS '软删除标记：false=正常，true=已删除（在回收站）';
COMMENT ON COLUMN collected_video.deleted_at IS '删除时间';
