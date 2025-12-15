-- ============================================
-- 学习日志表
-- ============================================
CREATE TABLE IF NOT EXISTS learning_log (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  video_url TEXT NOT NULL,
  video_title TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_log_user_id ON learning_log(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_log_created_at ON learning_log(created_at DESC);

-- ============================================
-- 资源文件夹表（树形结构）
-- ============================================
CREATE TABLE IF NOT EXISTS resource_folder (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  parent_id BIGINT REFERENCES resource_folder(id) ON DELETE CASCADE,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_folder_user_id ON resource_folder(user_id);
CREATE INDEX IF NOT EXISTS idx_resource_folder_parent_id ON resource_folder(parent_id);

-- ============================================
-- 资源表（关联文件夹）
-- ============================================
CREATE TABLE IF NOT EXISTS resource (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  folder_id BIGINT REFERENCES resource_folder(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  icon TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_user_id ON resource(user_id);
CREATE INDEX IF NOT EXISTS idx_resource_folder_id ON resource(folder_id);
CREATE INDEX IF NOT EXISTS idx_resource_created_at ON resource(created_at DESC);
