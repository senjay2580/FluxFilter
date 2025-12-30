-- 音乐歌单表
CREATE TABLE IF NOT EXISTS music_playlist (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  cover_url TEXT,
  is_default BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 音乐表
CREATE TABLE IF NOT EXISTS music (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title VARCHAR(200) NOT NULL,
  artist VARCHAR(100),
  album VARCHAR(100),
  duration INTEGER, -- 秒
  cover_url TEXT,
  file_url TEXT NOT NULL, -- 标准音质
  file_url_hq TEXT, -- 高清音质
  file_size INTEGER, -- 字节
  file_type VARCHAR(20), -- mp3, flac, wav 等
  lyrics TEXT, -- 歌词
  play_count INTEGER DEFAULT 0,
  last_position INTEGER DEFAULT 0, -- 上次播放位置（秒）
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 歌单-音乐关联表
CREATE TABLE IF NOT EXISTS music_playlist_item (
  id SERIAL PRIMARY KEY,
  playlist_id INTEGER NOT NULL REFERENCES music_playlist(id) ON DELETE CASCADE,
  music_id INTEGER NOT NULL REFERENCES music(id) ON DELETE CASCADE,
  sort_order INTEGER DEFAULT 0,
  added_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(playlist_id, music_id)
);

-- 播放历史表
CREATE TABLE IF NOT EXISTS music_play_history (
  id SERIAL PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  music_id INTEGER NOT NULL REFERENCES music(id) ON DELETE CASCADE,
  played_at TIMESTAMPTZ DEFAULT NOW(),
  duration_played INTEGER DEFAULT 0 -- 本次播放时长
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_music_user_id ON music(user_id);
CREATE INDEX IF NOT EXISTS idx_music_playlist_user_id ON music_playlist(user_id);
CREATE INDEX IF NOT EXISTS idx_music_playlist_item_playlist ON music_playlist_item(playlist_id);
CREATE INDEX IF NOT EXISTS idx_music_play_history_user ON music_play_history(user_id);

-- RLS 策略
ALTER TABLE music ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_playlist ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_playlist_item ENABLE ROW LEVEL SECURITY;
ALTER TABLE music_play_history ENABLE ROW LEVEL SECURITY;

-- 用户只能访问自己的数据
CREATE POLICY "Users can manage own music" ON music FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own playlists" ON music_playlist FOR ALL USING (auth.uid() = user_id);
CREATE POLICY "Users can manage own playlist items" ON music_playlist_item FOR ALL 
  USING (playlist_id IN (SELECT id FROM music_playlist WHERE user_id = auth.uid()));
CREATE POLICY "Users can manage own play history" ON music_play_history FOR ALL USING (auth.uid() = user_id);
