-- ============================================
-- 添加视频访问限制字段
-- 用于标识视频是否需要付费/充电才能观看
-- ============================================

-- 为 video 表添加访问限制字段
ALTER TABLE video 
ADD COLUMN IF NOT EXISTS access_restriction VARCHAR(50) DEFAULT NULL;

-- 为 collected_video 表也添加该字段
ALTER TABLE collected_video 
ADD COLUMN IF NOT EXISTS access_restriction VARCHAR(50) DEFAULT NULL;

-- 添加注释
COMMENT ON COLUMN video.access_restriction IS '访问限制类型: pay(付费), ugc_pay(UGC付费), arc_pay(稿件付费), charging(充电专属), null(无限制)';
COMMENT ON COLUMN collected_video.access_restriction IS '访问限制类型: pay(付费), ugc_pay(UGC付费), arc_pay(稿件付费), charging(充电专属), null(无限制)';

-- 创建索引方便筛选
CREATE INDEX IF NOT EXISTS idx_video_access_restriction ON video(user_id, access_restriction);
CREATE INDEX IF NOT EXISTS idx_collected_video_access_restriction ON collected_video(user_id, access_restriction);
CREATE INDEX IF NOT EXISTS idx_collected_video_access_restriction ON collected_video(user_id, access_restriction);
