-- ============================================
-- 为学习日志表添加视频封面字段
-- ============================================

-- 添加视频封面 URL 字段
ALTER TABLE learning_log 
ADD COLUMN IF NOT EXISTS video_cover TEXT DEFAULT '';

-- 添加注释
COMMENT ON COLUMN learning_log.video_cover IS '视频封面图片URL';
