/**
 * 待看列表 API
 * 
 * GET    /api/watchlist      - 获取待看列表
 * POST   /api/watchlist      - 添加到待看列表
 * DELETE /api/watchlist?id=X - 从待看列表移除
 * PATCH  /api/watchlist      - 更新待看状态
 */

import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

export default async function handler(request: Request) {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing configuration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const url = new URL(request.url);

  try {
    switch (request.method) {
      case 'GET': {
        // 获取待看列表
        const { data: watchlistData, error } = await supabase
          .from('watchlist')
          .select('*')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // 获取相关视频信息
        const bvids = watchlistData?.map(w => w.bvid) || [];
        const { data: videoData } = await supabase
          .from('video')
          .select('bvid, title, pic, duration, pubdate, mid')
          .in('bvid', bvids);
        
        // 获取UP主信息
        const mids = [...new Set(videoData?.map(v => v.mid) || [])];
        const { data: uploaderData } = await supabase
          .from('uploader')
          .select('mid, name, face')
          .in('mid', mids);
        
        const uploaderMap = new Map(uploaderData?.map(u => [u.mid, u]) || []);
        const videoMap = new Map(videoData?.map(v => [v.bvid, {
          ...v,
          uploader: uploaderMap.get(v.mid) || null
        }]) || []);
        
        const data = watchlistData?.map(w => ({
          ...w,
          video: videoMap.get(w.bvid) || null
        }));

        return new Response(JSON.stringify({ data }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'POST': {
        // 添加到待看列表
        const body = await request.json();
        const { bvid, note } = body;

        if (!bvid) {
          return new Response(JSON.stringify({ error: 'bvid is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const { data, error } = await supabase
          .from('watchlist')
          .insert({ bvid, note })
          .select()
          .single();

        if (error) {
          if (error.code === '23505') {
            return new Response(JSON.stringify({ error: '视频已在待看列表中' }), {
              status: 409,
              headers: { 'Content-Type': 'application/json' },
            });
          }
          throw error;
        }

        return new Response(JSON.stringify({ data }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'DELETE': {
        // 从待看列表移除
        const id = url.searchParams.get('id');
        
        if (!id) {
          return new Response(JSON.stringify({ error: 'id is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const { error } = await supabase
          .from('watchlist')
          .delete()
          .eq('id', parseInt(id));

        if (error) throw error;

        return new Response(JSON.stringify({ success: true }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      case 'PATCH': {
        // 更新待看状态
        const body = await request.json();
        const { id, is_watched, note, priority } = body;

        if (!id) {
          return new Response(JSON.stringify({ error: 'id is required' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          });
        }

        const updates: Record<string, unknown> = {};
        if (is_watched !== undefined) updates.is_watched = is_watched;
        if (note !== undefined) updates.note = note;
        if (priority !== undefined) updates.priority = priority;

        const { data, error } = await supabase
          .from('watchlist')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;

        return new Response(JSON.stringify({ data }), {
          headers: { 'Content-Type': 'application/json' },
        });
      }

      default:
        return new Response(JSON.stringify({ error: 'Method not allowed' }), {
          status: 405,
          headers: { 'Content-Type': 'application/json' },
        });
    }

  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
