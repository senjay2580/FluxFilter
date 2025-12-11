-- ============================================
-- FluxFilter - Supabase 数据库初始化脚本
-- 支持多用户隔离，每个用户独立管理B站Cookie和数据
-- 在 Supabase Dashboard -> SQL Editor 中执行
-- ============================================

-- 0. 用户表（核心：存储用户信息和B站Cookie）
CREATE TABLE IF NOT EXISTS "user" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(100),               -- 昵称
    password VARCHAR(255),               -- 密码
    -- B站认证信息（用户自行填写）
    bilibili_cookie TEXT,                -- B站Cookie（重要：用户自己填写）
    
    
    -- 时间戳
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);



-- 1. UP主配置表（存储要追踪的B站UP主，按用户隔离）
CREATE TABLE IF NOT EXISTS uploader (
    id BIGSERIAL PRIMARY KEY,
    mid BIGINT NOT NULL,                 -- UP主ID
    user_id UUID NOT NULL,               -- 所属用户ID（必须）
    name VARCHAR(100) NOT NULL,          -- UP主昵称
    face VARCHAR(500),                   -- 头像URL
    sign TEXT,                           -- 个性签名
    is_active BOOLEAN DEFAULT true,      -- 是否启用追踪
    last_sync_count INTEGER DEFAULT 0,   -- 上次同步获取的视频数
    last_sync_at TIMESTAMPTZ,            -- 上次同步时间
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 外键关联用户
    CONSTRAINT fk_uploader_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
    -- 同一用户下UP主唯一
    CONSTRAINT unique_user_uploader UNIQUE (user_id, mid)
);

-- UP主表索引
CREATE INDEX IF NOT EXISTS idx_uploader_user_id ON uploader(user_id);   
CREATE INDEX IF NOT EXISTS idx_uploader_mid ON uploader(mid);

-- 2. 视频表（存储UP主发布的视频，按用户隔离）
CREATE TABLE IF NOT EXISTS video (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,               -- 所属用户ID（必须）
    bvid VARCHAR(20) NOT NULL,           -- B站视频BV号
    aid BIGINT,                          -- AV号
    mid BIGINT NOT NULL,                 -- UP主ID
    title VARCHAR(500) NOT NULL,         -- 视频标题
    pic VARCHAR(500),                    -- 封面图URL
    description TEXT,                    -- 视频简介
    duration INTEGER DEFAULT 0,          -- 时长（秒）
    view_count INTEGER DEFAULT 0,        -- 播放量
    danmaku_count INTEGER DEFAULT 0,     -- 弹幕数
    reply_count INTEGER DEFAULT 0,       -- 评论数
    favorite_count INTEGER DEFAULT 0,    -- 收藏数
    coin_count INTEGER DEFAULT 0,        -- 投币数
    share_count INTEGER DEFAULT 0,       -- 分享数
    like_count INTEGER DEFAULT 0,        -- 点赞数
    pubdate TIMESTAMPTZ,                 -- 发布时间
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 外键关联用户
    CONSTRAINT fk_video_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
    -- 同一用户下视频唯一
    CONSTRAINT unique_user_video UNIQUE (user_id, bvid)
);

-- 视频表索引
CREATE INDEX IF NOT EXISTS idx_video_user_id ON video(user_id);
CREATE INDEX IF NOT EXISTS idx_video_mid ON video(user_id, mid);
CREATE INDEX IF NOT EXISTS idx_video_pubdate ON video(user_id, pubdate DESC);
CREATE INDEX IF NOT EXISTS idx_video_bvid ON video(bvid);

-- 外键：video → uploader（同一用户下，通过mid关联）
ALTER TABLE video 
ADD CONSTRAINT fk_video_uploader 
FOREIGN KEY (user_id, mid) REFERENCES uploader(user_id, mid) ON DELETE CASCADE;

-- 3. 待看列表表（用户收藏的待看视频）
CREATE TABLE IF NOT EXISTS watchlist (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,               -- 所属用户ID（必须）
    bvid VARCHAR(20) NOT NULL,           -- 视频BV号
    note TEXT,                           -- 用户备注
    is_watched BOOLEAN DEFAULT false,    -- 是否已看
    priority INTEGER DEFAULT 0,          -- 优先级（0-5）
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 外键关联用户
    CONSTRAINT fk_watchlist_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE,
    -- 同一用户不能重复添加同一视频
    CONSTRAINT unique_watchlist_user_video UNIQUE (user_id, bvid)
);

-- 待看列表索引
CREATE INDEX IF NOT EXISTS idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_watched ON watchlist(user_id, is_watched);

-- 4. 同步日志表（记录定时任务执行情况，按用户隔离）
CREATE TABLE IF NOT EXISTS sync_log (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID NOT NULL,               -- 所属用户ID（必须）
    sync_type VARCHAR(50) NOT NULL,      -- 同步类型: 'auto', 'manual'
    status VARCHAR(20) NOT NULL,         -- 状态: 'success', 'failed', 'partial', 'cancelled'
    videos_added INTEGER DEFAULT 0,      -- 新增视频数
    videos_updated INTEGER DEFAULT 0,    -- 更新视频数
    uploaders_synced INTEGER DEFAULT 0,  -- 同步的UP主数量
    error_message TEXT,                  -- 错误信息
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    
    -- 外键关联用户
    CONSTRAINT fk_sync_log_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE
);

-- 同步日志索引
CREATE INDEX IF NOT EXISTS idx_sync_log_user_id ON sync_log(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_started_at ON sync_log(user_id, started_at DESC);

-- ============================================
-- 触发器：自动更新 updated_at 字段
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- 应用触发器到所有表
DROP TRIGGER IF EXISTS update_user_updated_at ON "user";
CREATE TRIGGER update_user_updated_at
    BEFORE UPDATE ON "user"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_uploader_updated_at ON uploader;
CREATE TRIGGER update_uploader_updated_at
    BEFORE UPDATE ON uploader
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_video_updated_at ON video;
CREATE TRIGGER update_video_updated_at
    BEFORE UPDATE ON video
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_watchlist_updated_at ON watchlist;
CREATE TRIGGER update_watchlist_updated_at
    BEFORE UPDATE ON watchlist
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- Row Level Security (RLS) - 数据隔离
-- ============================================
-- 注意：user表不启用RLS，允许注册和登录
-- ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploader ENABLE ROW LEVEL SECURITY;
ALTER TABLE video ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- RLS策略：允许匿名访问（因为我们不使用Supabase Auth）
CREATE POLICY "Allow all for uploader" ON uploader FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for video" ON video FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for watchlist" ON watchlist FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for sync_log" ON sync_log FOR ALL USING (true) WITH CHECK (true);

-- ============================================
-- 视图：获取视频详情（含UP主信息）
-- ============================================
CREATE OR REPLACE VIEW video_with_uploader AS
SELECT 
    v.*,
    u.name as uploader_name,
    u.face as uploader_face
FROM video v
LEFT JOIN uploader u ON v.user_id = u.user_id AND v.mid = u.mid
ORDER BY v.pubdate DESC;

-- ============================================
-- 函数：UPSERT 视频（插入或更新，按用户隔离）
-- ============================================
CREATE OR REPLACE FUNCTION upsert_video(
    p_user_id UUID,
    p_bvid VARCHAR,
    p_aid BIGINT,
    p_mid BIGINT,
    p_title VARCHAR,
    p_pic VARCHAR,
    p_description TEXT,
    p_duration INTEGER,
    p_view_count INTEGER,
    p_danmaku_count INTEGER,
    p_reply_count INTEGER,
    p_favorite_count INTEGER,
    p_coin_count INTEGER,
    p_share_count INTEGER,
    p_like_count INTEGER,
    p_pubdate TIMESTAMPTZ
) RETURNS VOID AS $$
BEGIN
    INSERT INTO video (
        user_id, bvid, aid, mid, title, pic, description, duration,
        view_count, danmaku_count, reply_count, favorite_count,
        coin_count, share_count, like_count, pubdate
    ) VALUES (
        p_user_id, p_bvid, p_aid, p_mid, p_title, p_pic, p_description, p_duration,
        p_view_count, p_danmaku_count, p_reply_count, p_favorite_count,
        p_coin_count, p_share_count, p_like_count, p_pubdate
    )
    ON CONFLICT (user_id, bvid) DO UPDATE SET
        title = EXCLUDED.title,
        pic = EXCLUDED.pic,
        description = EXCLUDED.description,
        view_count = EXCLUDED.view_count,
        danmaku_count = EXCLUDED.danmaku_count,
        reply_count = EXCLUDED.reply_count,
        favorite_count = EXCLUDED.favorite_count,
        coin_count = EXCLUDED.coin_count,
        share_count = EXCLUDED.share_count,
        like_count = EXCLUDED.like_count,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 函数：创建新用户
-- ============================================
CREATE OR REPLACE FUNCTION create_user(
    p_username VARCHAR,
    p_password VARCHAR
) RETURNS UUID AS $$
DECLARE
    new_user_id UUID;
BEGIN
    INSERT INTO "user" (username, password)
    VALUES (p_username, p_password)
    RETURNING id INTO new_user_id;
    
    RETURN new_user_id;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 表注释
-- ============================================
COMMENT ON TABLE "user" IS '用户表：存储用户信息和B站Cookie，实现多用户隔离';
COMMENT ON COLUMN "user".bilibili_cookie IS 'B站Cookie，用户自行填写，用于API请求认证';

COMMENT ON TABLE uploader IS 'UP主表：用户关注的B站UP主，按user_id隔离';
COMMENT ON TABLE video IS '视频表：UP主发布的视频，按user_id隔离';
COMMENT ON TABLE watchlist IS '待看列表：用户收藏的待看视频';
COMMENT ON TABLE sync_log IS '同步日志：记录同步任务执行情况';