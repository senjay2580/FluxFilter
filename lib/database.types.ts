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
  access_restriction: string | null; // 访问限制: charging/pay/ugc_pay/arc_pay/null
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

export interface User {
  id: string;
  email: string | null;
  bilibili_cookie: string | null;
  created_at: string;
  updated_at: string;
}

export interface SyncLog {
  id: number;
  user_id: string;
  sync_type: 'cron_morning' | 'cron_evening' | 'manual';
  status: 'success' | 'failed' | 'partial' | 'running';
  videos_added: number;
  videos_updated: number;
  uploaders_synced: number;
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

// ============================================
// 笔记相关类型
// ============================================

export type NoteColor = 'default' | 'red' | 'orange' | 'yellow' | 'green' | 'blue' | 'purple' | 'pink';

export interface Note {
  id: number;
  user_id: string;
  title: string;
  content: string; // HTML 富文本内容
  preview: string | null; // 纯文本预览
  color: NoteColor;
  category: string | null;
  is_pinned: boolean;
  pin_order: number;
  created_at: string;
  updated_at: string;
}

export interface NoteCategory {
  id: number;
  user_id: string;
  name: string;
  color: NoteColor;
  sort_order: number;
  created_at: string;
}

export interface CreateNoteParams {
  title: string;
  content: string;
  preview?: string;
  color?: NoteColor;
  category?: string;
  is_pinned?: boolean;
}

export interface UpdateNoteParams {
  title?: string;
  content?: string;
  preview?: string;
  color?: NoteColor;
  category?: string;
  is_pinned?: boolean;
  pin_order?: number;
}


// ============================================
// 学习日志相关类型
// ============================================

export interface LearningLog {
  id: number;
  user_id: string;
  video_url: string;
  video_title: string;
  summary: string;
  created_at: string;
  updated_at: string;
}

export interface CreateLearningLogParams {
  video_url: string;
  video_title?: string;
  summary?: string;
}

export interface UpdateLearningLogParams {
  video_title?: string;
  summary?: string;
}

// ============================================
// 资源中心相关类型
// ============================================

export interface ResourceFolder {
  id: number;
  user_id: string;
  name: string;
  parent_id: number | null;
  sort_order: number;
  created_at: string;
}

export interface Resource {
  id: number;
  user_id: string;
  folder_id: number | null;
  name: string;
  url: string;
  icon: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateResourceFolderParams {
  name: string;
  parent_id?: number | null;
  sort_order?: number;
}

export interface CreateResourceParams {
  name: string;
  url: string;
  icon?: string;
  folder_id?: number | null;
}

// ============================================
// 音频转写历史记录相关类型
// ============================================

export interface TranscriptHistory {
  id: number;
  user_id: string;
  file_name: string;
  raw_text: string;
  optimized_text: string | null;
  optimized_title: string | null;
  ai_model: string | null;
  duration: number | null;
  file_size: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateTranscriptParams {
  file_name: string;
  raw_text: string;
  optimized_text?: string;
  optimized_title?: string;
  ai_model?: string;
  duration?: number;
  file_size?: number;
}

export interface UpdateTranscriptParams {
  optimized_text?: string;
  optimized_title?: string;
  ai_model?: string;
}

// ============================================
// AI 配置相关类型
// ============================================

export interface AIConfig {
  id: number;
  user_id: string;
  model_id: string;
  api_key: string;
  base_url: string | null;
  custom_model_name: string | null;
  settings: any | null;
  created_at: string;
  updated_at: string;
}

export interface UpsertAIConfigParams {
  model_id: string;
  api_key: string;
  base_url?: string | null;
  custom_model_name?: string | null;
  settings?: any | null;
}
