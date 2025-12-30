// 音乐相关类型定义

export interface Music {
  id: number;
  user_id: string;
  title: string;
  artist: string | null;
  album: string | null;
  duration: number | null;
  cover_url: string | null;
  file_url: string;
  file_url_hq: string | null;
  file_size: number | null;
  file_type: string | null;
  lyrics: string | null;
  play_count: number;
  last_position: number;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface MusicPlaylist {
  id: number;
  user_id: string;
  name: string;
  description: string | null;
  cover_url: string | null;
  is_default: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface MusicPlaylistItem {
  id: number;
  playlist_id: number;
  music_id: number;
  sort_order: number;
  added_at: string;
}

export interface MusicPlayHistory {
  id: number;
  user_id: string;
  music_id: number;
  played_at: string;
  duration_played: number;
}

// 播放模式
export type PlayMode = 'single' | 'list' | 'shuffle';

// 音质选项
export type AudioQuality = 'standard' | 'high';

// 播放器状态
export interface PlayerState {
  currentMusic: Music | null;
  playlist: Music[];
  playlistId: number | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  playMode: PlayMode;
  quality: AudioQuality;
  isMinimized: boolean;
  showFloatingBall: boolean;
}

// 创建音乐参数
export interface CreateMusicParams {
  title: string;
  artist?: string;
  album?: string;
  duration?: number;
  cover_url?: string;
  file_url: string;
  file_url_hq?: string;
  file_size?: number;
  file_type?: string;
  lyrics?: string;
}

// 创建歌单参数
export interface CreatePlaylistParams {
  name: string;
  description?: string;
  cover_url?: string;
}

// 更新音乐参数
export interface UpdateMusicParams {
  title?: string;
  artist?: string;
  album?: string;
  cover_url?: string;
  lyrics?: string;
  is_favorite?: boolean;
  last_position?: number;
}
