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
        .select('*')
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

      // 获取 uploader 信息
      let processedData = data || [];
      if (data && data.length > 0) {
        // 分别处理 B站和 YouTube 视频
        const biliVideos = data.filter((v: any) => v.platform !== 'youtube');
        const ytVideos = data.filter((v: any) => v.platform === 'youtube');

        // B站视频通过 mid 关联
        const mids = [...new Set(biliVideos.map((v: any) => v.mid).filter(Boolean))];
        let biliUploaderMap = new Map();
        if (mids.length > 0) {
          const { data: uploaders } = await supabase
            .from('uploader')
            .select('mid, name, face')
            .eq('user_id', userId)
            .eq('platform', 'bilibili')
            .in('mid', mids);
          biliUploaderMap = new Map(uploaders?.map((u: any) => [u.mid, u]) || []);
        }

        // YouTube 视频通过 channel_id 关联
        const channelIds = [...new Set(ytVideos.map((v: any) => v.channel_id).filter(Boolean))];
        let ytUploaderMap = new Map();
        if (channelIds.length > 0) {
          const { data: uploaders } = await supabase
            .from('uploader')
            .select('channel_id, name, face')
            .eq('user_id', userId)
            .eq('platform', 'youtube')
            .in('channel_id', channelIds);
          ytUploaderMap = new Map(uploaders?.map((u: any) => [u.channel_id, u]) || []);
        }

        processedData = data.map((v: any) => {
          let uploader = null;
          if (v.platform === 'youtube') {
            uploader = ytUploaderMap.get(v.channel_id);
          } else {
            uploader = biliUploaderMap.get(v.mid);
          }
          return {
            ...v,
            uploader: uploader ? { name: uploader.name, face: uploader.face } : null
          };
        });
      }

      if (isLoadMore) {
        setVideos(prev => [...prev, ...(processedData || [])]);
      } else {
        setVideos(processedData || []);
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
