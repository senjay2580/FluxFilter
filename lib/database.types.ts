// ============================================
// Supabase 数据库类型定义
// ============================================

export interface Uploader {
  id: number;
  user_id: string;
  mid: number;
  name: string;
  face: string | null;
  sign: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Video {
  id: number;
  user_id: string;
  bvid: string;
  aid: number | null;
  mid: number;
  title: string;
  pic: string | null;
  description: string | null;
  duration: number;
  view_count: number;
  danmaku_count: number;
  reply_count: number;
  favorite_count: number;
  coin_count: number;
  share_count: number;
  like_count: number;
  pubdate: string | null;
  created_at: string;
  updated_at: string;
}

export interface VideoWithUploader extends Video {
  uploader_name?: string;
  uploader_face?: string;
  // Supabase join 返回的嵌套对象
  uploader?: {
    name: string;
    face: string | null;
  } | null;
}

export interface WatchlistItem {
  id: number;
  user_id: string | null;
  bvid: string;
  note: string | null;
  is_watched: boolean;
  priority: number;
  created_at: string;
  updated_at: string;
  // 关联的视频信息
  video?: Video;
}

export interface SyncLog {
  id: number;
  sync_type: 'cron_morning' | 'cron_evening' | 'manual';
  status: 'success' | 'failed' | 'partial';
  videos_added: number;
  videos_updated: number;
  error_message: string | null;
  started_at: string;
  finished_at: string | null;
}

// B站API响应类型
export interface BilibiliVideoItem {
  aid: number;
  bvid: string;
  title: string;
  pic: string;
  description: string;
  duration: number;
  pubdate: number;
  stat: {
    view: number;
    danmaku: number;
    reply: number;
    favorite: number;
    coin: number;
    share: number;
    like: number;
  };
}

export interface BilibiliSpaceResponse {
  code: number;
  message: string;
  data: {
    list: {
      vlist: BilibiliVideoItem[];
    };
    page: {
      pn: number;
      ps: number;
      count: number;
    };
  };
}

// 插入/更新视频的参数类型
export interface UpsertVideoParams {
  bvid: string;
  aid: number;
  mid: number;
  title: string;
  pic: string;
  description: string;
  duration: number;
  view_count: number;
  danmaku_count: number;
  reply_count: number;
  favorite_count: number;
  coin_count: number;
  share_count: number;
  like_count: number;
  pubdate: string;
}
