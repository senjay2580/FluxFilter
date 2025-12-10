-- ============================================
-- FluxFilter - Supabase 数据库初始化脚本
-- 在 Supabase Dashboard -> SQL Editor 中执行
-- ============================================

-- 1. UP主配置表（存储要追踪的B站UP主）
CREATE TABLE IF NOT EXISTS uploader (
    id BIGSERIAL PRIMARY KEY,
    mid BIGINT NOT NULL UNIQUE,          -- B站用户ID
    name VARCHAR(100) NOT NULL,          -- UP主昵称
    face VARCHAR(500),                   -- 头像URL
    sign TEXT,                           -- 个性签名
    is_active BOOLEAN DEFAULT true,      -- 是否启用追踪
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 创建mid索引
CREATE INDEX IF NOT EXISTS idx_uploader_mid ON uploader(mid);
CREATE INDEX IF NOT EXISTS idx_uploader_active ON uploader(is_active);

-- 2. 视频表（存储UP主发布的视频，bvid唯一防止重复）
CREATE TABLE IF NOT EXISTS video (
    id BIGSERIAL PRIMARY KEY,
    bvid VARCHAR(20) NOT NULL UNIQUE,    -- B站视频BV号（唯一标识）
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
    
    -- 外键关联UP主
    CONSTRAINT fk_video_uploader FOREIGN KEY (mid) REFERENCES uploader(mid) ON DELETE CASCADE
);

-- 视频表索引
CREATE INDEX IF NOT EXISTS idx_video_mid ON video(mid);
CREATE INDEX IF NOT EXISTS idx_video_pubdate ON video(pubdate DESC);
CREATE INDEX IF NOT EXISTS idx_video_bvid ON video(bvid);

-- 3. 待看列表表（用户收藏的待看视频）
CREATE TABLE IF NOT EXISTS watchlist (
    id BIGSERIAL PRIMARY KEY,
    user_id UUID,                        -- 可选：支持用户系统后使用
    bvid VARCHAR(20) NOT NULL,           -- 视频BV号
    note TEXT,                           -- 用户备注
    is_watched BOOLEAN DEFAULT false,    -- 是否已看
    priority INTEGER DEFAULT 0,          -- 优先级（0-5）
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- 外键关联视频
    CONSTRAINT fk_watchlist_video FOREIGN KEY (bvid) REFERENCES video(bvid) ON DELETE CASCADE,
    -- 同一用户不能重复添加同一视频
    CONSTRAINT unique_user_video UNIQUE (user_id, bvid)
);

-- 待看列表索引
CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_watched ON watchlist(is_watched);

-- 4. 同步日志表（记录定时任务执行情况）
CREATE TABLE IF NOT EXISTS sync_log (
    id BIGSERIAL PRIMARY KEY,
    sync_type VARCHAR(50) NOT NULL,      -- 同步类型: 'cron_morning', 'cron_evening', 'manual'
    status VARCHAR(20) NOT NULL,         -- 状态: 'success', 'failed', 'partial'
    videos_added INTEGER DEFAULT 0,      -- 新增视频数
    videos_updated INTEGER DEFAULT 0,    -- 更新视频数
    error_message TEXT,                  -- 错误信息
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ
);

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

-- 应用触发器
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
-- Row Level Security (RLS) - 可选
-- ============================================
-- 启用 RLS（如果需要用户隔离）
-- ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 示例数据：添加一些默认UP主
-- ============================================
INSERT INTO uploader (mid, name, face, sign) VALUES
    (946974, '影视飓风', 'https://i0.hdslb.com/bfs/face/xxx.jpg', '科技视频创作者'),
    (25876945, '何同学', 'https://i0.hdslb.com/bfs/face/xxx.jpg', '数码科技UP主'),
    (517327498, '老番茄', 'https://i0.hdslb.com/bfs/face/xxx.jpg', '游戏搞笑UP主')
ON CONFLICT (mid) DO NOTHING;

-- ============================================
-- 视图：获取视频详情（含UP主信息）
-- ============================================
CREATE OR REPLACE VIEW video_with_uploader AS
SELECT 
    v.*,
    u.name as uploader_name,
    u.face as uploader_face
FROM video v
LEFT JOIN uploader u ON v.mid = u.mid
ORDER BY v.pubdate DESC;

-- ============================================
-- 函数：UPSERT 视频（插入或更新，防止重复）
-- ============================================
CREATE OR REPLACE FUNCTION upsert_video(
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
        bvid, aid, mid, title, pic, description, duration,
        view_count, danmaku_count, reply_count, favorite_count,
        coin_count, share_count, like_count, pubdate
    ) VALUES (
        p_bvid, p_aid, p_mid, p_title, p_pic, p_description, p_duration,
        p_view_count, p_danmaku_count, p_reply_count, p_favorite_count,
        p_coin_count, p_share_count, p_like_count, p_pubdate
    )
    ON CONFLICT (bvid) DO UPDATE SET
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
