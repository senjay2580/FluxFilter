-- ============================================
-- 添加 YouTube 支持
-- 扩展 uploader 和 video 表支持多平台
-- ============================================

-- 0. 为 user 表添加 YouTube API Key 字段
ALTER TABLE "user" 
ADD COLUMN IF NOT EXISTS youtube_api_key TEXT;

COMMENT ON COLUMN "user".youtube_api_key IS 'YouTube API Key，用户自行填写，用于获取YouTube频道和视频数据';

-- 1. 先删除依赖的外键约束
ALTER TABLE video DROP CONSTRAINT IF EXISTS fk_video_uploader;

-- 2. 删除旧的唯一约束
ALTER TABLE uploader DROP CONSTRAINT IF EXISTS unique_user_uploader CASCADE;
ALTER TABLE video DROP CONSTRAINT IF EXISTS unique_user_video CASCADE;
ALTER TABLE collected_video DROP CONSTRAINT IF EXISTS unique_collected_video CASCADE;

-- 3. 为 uploader 表添加新字段
ALTER TABLE uploader 
ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'bilibili';

ALTER TABLE uploader 
ADD COLUMN IF NOT EXISTS channel_id VARCHAR(50);

-- 4. 为 video 表添加新字段
ALTER TABLE video 
ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'bilibili';

ALTER TABLE video 
ADD COLUMN IF NOT EXISTS video_id VARCHAR(50);

ALTER TABLE video 
ADD COLUMN IF NOT EXISTS channel_id VARCHAR(50);

-- 5. 为 collected_video 表添加新字段
ALTER TABLE collected_video 
ADD COLUMN IF NOT EXISTS platform VARCHAR(20) DEFAULT 'bilibili';

ALTER TABLE collected_video 
ADD COLUMN IF NOT EXISTS video_id VARCHAR(50);

ALTER TABLE collected_video 
ADD COLUMN IF NOT EXISTS channel_id VARCHAR(50);

-- 6. 初始化现有数据（所有现有数据都是B站的）
UPDATE uploader SET platform = 'bilibili' WHERE platform IS NULL;
UPDATE video SET platform = 'bilibili' WHERE platform IS NULL;
UPDATE collected_video SET platform = 'bilibili' WHERE platform IS NULL;

-- 7. 创建新的唯一索引（基于平台）
-- uploader 表
DROP INDEX IF EXISTS idx_uploader_user_platform_mid;
DROP INDEX IF EXISTS idx_uploader_user_platform_channel;

CREATE UNIQUE INDEX idx_uploader_user_platform_mid 
ON uploader(user_id, platform, mid) 
WHERE platform = 'bilibili';

CREATE UNIQUE INDEX idx_uploader_user_platform_channel 
ON uploader(user_id, platform, channel_id) 
WHERE platform = 'youtube';

-- video 表
DROP INDEX IF EXISTS idx_video_user_platform_bvid;
DROP INDEX IF EXISTS idx_video_user_platform_videoid;

CREATE UNIQUE INDEX idx_video_user_platform_bvid 
ON video(user_id, platform, bvid) 
WHERE platform = 'bilibili';

CREATE UNIQUE INDEX idx_video_user_platform_videoid 
ON video(user_id, platform, video_id) 
WHERE platform = 'youtube';

-- collected_video 表
DROP INDEX IF EXISTS idx_collected_video_user_platform_bvid;
DROP INDEX IF EXISTS idx_collected_video_user_platform_videoid;

CREATE UNIQUE INDEX idx_collected_video_user_platform_bvid 
ON collected_video(user_id, platform, bvid) 
WHERE platform = 'bilibili';

CREATE UNIQUE INDEX idx_collected_video_user_platform_videoid 
ON collected_video(user_id, platform, video_id) 
WHERE platform = 'youtube';

-- 8. 添加普通索引优化查询
CREATE INDEX IF NOT EXISTS idx_uploader_platform ON uploader(platform);
CREATE INDEX IF NOT EXISTS idx_video_platform ON video(platform);
CREATE INDEX IF NOT EXISTS idx_collected_video_platform ON collected_video(platform);

-- 9. 重建 video -> uploader 外键（支持多平台）
-- 对于B站视频，通过 user_id + mid 关联
-- 对于YouTube视频，通过 user_id + channel_id 关联
-- 由于外键不支持条件约束，这里不重建外键，改用应用层保证数据一致性

-- 10. 更新视图
DROP VIEW IF EXISTS video_with_uploader;

CREATE OR REPLACE VIEW video_with_uploader AS
SELECT 
    v.*,
    u.name as uploader_name,
    u.face as uploader_face
FROM video v
LEFT JOIN uploader u ON 
    v.user_id = u.user_id AND 
    v.platform = u.platform AND
    (
        (v.platform = 'bilibili' AND v.mid = u.mid) OR
        (v.platform = 'youtube' AND v.channel_id = u.channel_id)
    )
ORDER BY v.pubdate DESC;

-- 11. 添加注释
COMMENT ON COLUMN uploader.platform IS '平台类型: bilibili, youtube';
COMMENT ON COLUMN uploader.channel_id IS 'YouTube 频道 ID';
COMMENT ON COLUMN video.platform IS '平台类型: bilibili, youtube';
COMMENT ON COLUMN video.video_id IS 'YouTube 视频 ID';
COMMENT ON COLUMN video.channel_id IS 'YouTube 频道 ID';
COMMENT ON COLUMN collected_video.platform IS '平台类型: bilibili, youtube';
COMMENT ON COLUMN collected_video.video_id IS 'YouTube 视频 ID';
COMMENT ON COLUMN collected_video.channel_id IS 'YouTube 频道 ID';
