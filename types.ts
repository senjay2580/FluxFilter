export interface Video {
  id: string;
  title: string;
  thumbnail: string;
  duration: string;
  views: string;
  author: string;
  avatar: string;
  createdAt: Date;
  tags: string[];
  description: string;
}

export type FilterType = 'all' | 'today' | 'week' | 'month' | 'custom';

export interface DateFilter {
  year?: number;
  month?: number;
  day?: number;
}

export type Tab = 'home' | 'watchLater' | 'rss';
