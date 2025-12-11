import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { getStoredUserId } from '../lib/auth';
import { getStorageCache, setStorageCache, CACHE_KEYS, CACHE_TTL } from '../lib/cache';
import type { VideoWithUploader } from '../lib/database.types';

interface UseVideosOptions {
  limit?: number;
  startDate?: Date;
  endDate?: Date;
}

interface UseVideosReturn {
  videos: VideoWithUploader[];
  loading: boolean;
  error: string | null;
  loadMore: () => void;
  hasMore: boolean;
  refresh: () => void;
}

export function useVideos(options: UseVideosOptions = {}): UseVideosReturn {
  const [videos, setVideos] = useState<VideoWithUploader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);

  const limit = options.limit || 20;

  const fetchVideos = useCallback(async (isLoadMore = false) => {
    try {
      setLoading(true);
      setError(null);

      const userId = getStoredUserId();
      if (!userId) {
        setVideos([]);
        setLoading(false);
        return;
      }

      let query = supabase
        .from('video')
        .select(`
          *,
          uploader:uploader!fk_video_uploader (name, face)
        `)
        .eq('user_id', userId)
        .order('pubdate', { ascending: false })
        .range(isLoadMore ? offset : 0, (isLoadMore ? offset : 0) + limit - 1);

      if (options.startDate) {
        query = query.gte('pubdate', options.startDate.toISOString());
      }
      if (options.endDate) {
        query = query.lte('pubdate', options.endDate.toISOString());
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      if (isLoadMore) {
        setVideos(prev => [...prev, ...(data || [])]);
      } else {
        setVideos(data || []);
      }

      setHasMore((data?.length || 0) === limit);
      if (isLoadMore) {
        setOffset(prev => prev + limit);
      } else {
        setOffset(limit);
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, [limit, offset, options.startDate, options.endDate]);

  useEffect(() => {
    fetchVideos(false);
  }, [options.startDate?.toISOString(), options.endDate?.toISOString()]);

  const loadMore = useCallback(() => {
    if (!loading && hasMore) {
      fetchVideos(true);
    }
  }, [loading, hasMore, fetchVideos]);

  const refresh = useCallback(() => {
    setOffset(0);
    fetchVideos(false);
  }, [fetchVideos]);

  return { videos, loading, error, loadMore, hasMore, refresh };
}

// 获取视频按日期分组的数量（用于热力图）
export function useVideoCountByDate() {
  const [countMap, setCountMap] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      try {
        const userId = getStoredUserId();
        if (!userId) {
          setCountMap({});
          setLoading(false);
          return;
        }
        
        // 先检查缓存
        const cacheKey = CACHE_KEYS.VIDEO_COUNT_BY_DATE(userId);
        const cached = getStorageCache<Record<string, number>>(cacheKey);
        if (cached) {
          setCountMap(cached);
          setLoading(false);
          return;
        }
        
        const { data, error } = await supabase
          .from('video')
          .select('pubdate')
          .eq('user_id', userId);

        if (error) throw error;

        const map: Record<string, number> = {};
        data?.forEach(v => {
          if (v.pubdate) {
            const dateKey = new Date(v.pubdate).toISOString().split('T')[0];
            map[dateKey] = (map[dateKey] || 0) + 1;
          }
        });

        // 写入缓存（30分钟）
        setStorageCache(cacheKey, map, CACHE_TTL.VIDEO_COUNT);
        setCountMap(map);
      } catch (err) {
        console.error('获取视频统计失败:', err);
      } finally {
        setLoading(false);
      }
    }

    fetch();
  }, []);

  return { countMap, loading };
}
