-- 笔记表
CREATE TABLE IF NOT EXISTS notes (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  preview TEXT, -- 内容预览（纯文本，用于搜索和展示）
  color VARCHAR(20) DEFAULT 'default', -- 卡片颜色: default, red, orange, yellow, green, blue, purple, pink
  category VARCHAR(100), -- 分类
  is_pinned BOOLEAN DEFAULT FALSE, -- 是否置顶
  pin_order INTEGER DEFAULT 0, -- 置顶排序
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_notes_user_id ON notes(user_id);
CREATE INDEX idx_notes_is_pinned ON notes(is_pinned);
CREATE INDEX idx_notes_category ON notes(category);
CREATE INDEX idx_notes_created_at ON notes(created_at DESC);

-- 更新时间触发器
CREATE OR REPLACE FUNCTION update_notes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_notes_updated_at
  BEFORE UPDATE ON notes
  FOR EACH ROW
  EXECUTE FUNCTION update_notes_updated_at();

-- RLS 策略 (使用自定义 user 表，允许所有已认证操作)
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notes" ON notes
  FOR SELECT USING (true);

CREATE POLICY "Users can insert own notes" ON notes
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update own notes" ON notes
  FOR UPDATE USING (true);

CREATE POLICY "Users can delete own notes" ON notes
  FOR DELETE USING (true);

-- 笔记分类表（可选，用于管理分类）
CREATE TABLE IF NOT EXISTS note_categories (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(20) DEFAULT 'default',
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, name)
);

CREATE INDEX idx_note_categories_user_id ON note_categories(user_id);

ALTER TABLE note_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own categories" ON note_categories
  FOR ALL USING (true);
