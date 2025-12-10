import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { WatchlistItem } from '../lib/database.types';

interface UseWatchlistReturn {
  watchlist: WatchlistItem[];
  loading: boolean;
  error: string | null;
  addToWatchlist: (bvid: string, note?: string) => Promise<boolean>;
  removeFromWatchlist: (id: number) => Promise<boolean>;
  toggleWatched: (id: number, isWatched: boolean) => Promise<boolean>;
  isInWatchlist: (bvid: string) => boolean;
  refresh: () => void;
}

export function useWatchlist(): UseWatchlistReturn {
  const [watchlist, setWatchlist] = useState<WatchlistItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchWatchlist = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('watchlist')
        .select(`
          *,
          video:bvid (
            bvid, title, pic, duration, pubdate, mid,
            uploader:mid (name, face)
          )
        `)
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setWatchlist(data || []);

    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWatchlist();
  }, [fetchWatchlist]);

  const addToWatchlist = useCallback(async (bvid: string, note?: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('watchlist')
        .insert({ bvid, note })
        .select()
        .single();

      if (error) {
        if (error.code === '23505') {
          alert('视频已在待看列表中');
          return false;
        }
        throw error;
      }

      // 重新获取完整数据
      await fetchWatchlist();
      return true;

    } catch (err) {
      console.error('添加失败:', err);
      return false;
    }
  }, [fetchWatchlist]);

  const removeFromWatchlist = useCallback(async (id: number): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('watchlist')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setWatchlist(prev => prev.filter(item => item.id !== id));
      return true;

    } catch (err) {
      console.error('删除失败:', err);
      return false;
    }
  }, []);

  const toggleWatched = useCallback(async (id: number, isWatched: boolean): Promise<boolean> => {
    try {
      const { error } = await supabase
        .from('watchlist')
        .update({ is_watched: isWatched })
        .eq('id', id);

      if (error) throw error;

      setWatchlist(prev =>
        prev.map(item =>
          item.id === id ? { ...item, is_watched: isWatched } : item
        )
      );
      return true;

    } catch (err) {
      console.error('更新失败:', err);
      return false;
    }
  }, []);

  const isInWatchlist = useCallback((bvid: string): boolean => {
    return watchlist.some(item => item.bvid === bvid);
  }, [watchlist]);

  return {
    watchlist,
    loading,
    error,
    addToWatchlist,
    removeFromWatchlist,
    toggleWatched,
    isInWatchlist,
    refresh: fetchWatchlist,
  };
}
