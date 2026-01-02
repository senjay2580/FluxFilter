-- ============================================
-- 修复 video 表唯一约束问题
-- 条件唯一索引不能用于 ON CONFLICT，需要创建真正的唯一约束
-- ============================================

-- 1. 删除条件唯一索引（如果存在）
DROP INDEX IF EXISTS idx_video_user_platform_bvid;
DROP INDEX IF EXISTS idx_video_user_platform_videoid;

-- 2. 创建真正的唯一约束（支持 ON CONFLICT）
-- 对于 B站视频：user_id + bvid 唯一
-- 对于 YouTube 视频：user_id + video_id 唯一
-- 统一方案：user_id + platform + bvid 作为唯一约束（YouTube 用 YT_xxx 格式的 bvid）

ALTER TABLE video 
DROP CONSTRAINT IF EXISTS unique_video_user_platform_bvid;

ALTER TABLE video 
ADD CONSTRAINT unique_video_user_platform_bvid 
UNIQUE (user_id, platform, bvid);

-- 3. 为 YouTube 视频单独创建索引（用于快速查询）
CREATE INDEX IF NOT EXISTS idx_video_youtube_video_id 
ON video(user_id, video_id) 
WHERE platform = 'youtube' AND video_id IS NOT NULL;

-- 4. 同样修复 collected_video 表
DROP INDEX IF EXISTS idx_collected_video_user_platform_bvid;
DROP INDEX IF EXISTS idx_collected_video_user_platform_videoid;

ALTER TABLE collected_video 
DROP CONSTRAINT IF EXISTS unique_collected_video_user_platform_bvid;

ALTER TABLE collected_video 
ADD CONSTRAINT unique_collected_video_user_platform_bvid 
UNIQUE (user_id, platform, bvid);

CREATE INDEX IF NOT EXISTS idx_collected_video_youtube_video_id 
ON collected_video(user_id, video_id) 
WHERE platform = 'youtube' AND video_id IS NOT NULL;

-- 5. 同样修复 uploader 表
DROP INDEX IF EXISTS idx_uploader_user_platform_mid;
DROP INDEX IF EXISTS idx_uploader_user_platform_channel;

ALTER TABLE uploader 
DROP CONSTRAINT IF EXISTS unique_uploader_user_platform_mid;

ALTER TABLE uploader 
ADD CONSTRAINT unique_uploader_user_platform_mid 
UNIQUE (user_id, platform, mid);

-- YouTube 频道用 channel_id 作为唯一标识
CREATE INDEX IF NOT EXISTS idx_uploader_youtube_channel 
ON uploader(user_id, channel_id) 
WHERE platform = 'youtube' AND channel_id IS NOT NULL;
