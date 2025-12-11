-- =============================================
-- FluxFilter 用户模块迁移脚本
-- 用于从旧版本升级到多用户版本
-- 注意：此脚本用于已有数据的迁移，新部署请直接使用 schema.sql
-- =============================================

-- 步骤1: 创建用户表
CREATE TABLE IF NOT EXISTS "user" (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE,
    nickname VARCHAR(100),
    avatar_url VARCHAR(500),
    bilibili_cookie TEXT,
    bilibili_mid BIGINT,
    bilibili_name VARCHAR(100),
    bilibili_face VARCHAR(500),
    sync_interval INT DEFAULT 30,
    auto_sync BOOLEAN DEFAULT false,
    theme VARCHAR(20) DEFAULT 'dark',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- 步骤2: 创建默认用户（用于迁移旧数据）
INSERT INTO "user" (id, nickname) 
VALUES ('00000000-0000-0000-0000-000000000001', '默认用户')
ON CONFLICT (id) DO NOTHING;

-- 步骤3: 为现有表添加 user_id 字段
ALTER TABLE uploader ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE video ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE sync_log ADD COLUMN IF NOT EXISTS user_id UUID;

-- 步骤4: 将旧数据关联到默认用户
UPDATE uploader SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
UPDATE video SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
UPDATE sync_log SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;
UPDATE watchlist SET user_id = '00000000-0000-0000-0000-000000000001' WHERE user_id IS NULL;

-- 步骤5: 设置 user_id 为必填并添加外键
ALTER TABLE uploader ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE uploader ADD CONSTRAINT fk_uploader_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE video ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE video ADD CONSTRAINT fk_video_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE sync_log ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE sync_log ADD CONSTRAINT fk_sync_log_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

ALTER TABLE watchlist ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE watchlist ADD CONSTRAINT fk_watchlist_user FOREIGN KEY (user_id) REFERENCES "user"(id) ON DELETE CASCADE;

-- 步骤6: 删除旧的唯一约束，添加新的（包含user_id）
ALTER TABLE uploader DROP CONSTRAINT IF EXISTS uploader_mid_key;
ALTER TABLE uploader ADD CONSTRAINT unique_user_uploader UNIQUE (user_id, mid);

ALTER TABLE video DROP CONSTRAINT IF EXISTS video_bvid_key;
ALTER TABLE video ADD CONSTRAINT unique_user_video UNIQUE (user_id, bvid);

-- 步骤7: 创建索引
CREATE INDEX IF NOT EXISTS idx_user_email ON "user"(email);
CREATE INDEX IF NOT EXISTS idx_uploader_user_id ON uploader(user_id);
CREATE INDEX IF NOT EXISTS idx_video_user_id ON video(user_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_user_id ON sync_log(user_id);

-- 步骤8: 启用 RLS
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;
ALTER TABLE uploader ENABLE ROW LEVEL SECURITY;
ALTER TABLE video ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;

-- 步骤9: 添加用户表触发器
DROP TRIGGER IF EXISTS update_user_updated_at ON "user";
CREATE TRIGGER update_user_updated_at
    BEFORE UPDATE ON "user"
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- 完成提示
DO $$
BEGIN
    RAISE NOTICE '迁移完成！旧数据已关联到默认用户(ID: 00000000-0000-0000-0000-000000000001)';
    RAISE NOTICE '请在应用中配置默认用户的B站Cookie';
END $$;
