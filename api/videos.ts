/**
 * 视频列表 API
 * 
 * GET /api/videos - 获取视频列表
 * Query Params:
 *   - user_id: 用户ID（必须）
 *   - limit: 每页数量（默认20）
 *   - offset: 偏移量
 *   - date: 指定日期（YYYY-MM-DD）
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
  
  const userId = url.searchParams.get('user_id');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  const offset = parseInt(url.searchParams.get('offset') || '0');
  const dateParam = url.searchParams.get('date');

  // user_id 是必须的
  if (!userId) {
    return new Response(JSON.stringify({ error: 'user_id is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    let query = supabase
      .from('video')
      .select('*')
      .eq('user_id', userId)
      .order('pubdate', { ascending: false })
      .range(offset, offset + limit - 1);

    // 如果指定了日期，按日期筛选
    if (dateParam) {
      const date = new Date(dateParam);
      const startOfDay = new Date(date);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(date);
      endOfDay.setHours(23, 59, 59, 999);

      query = query
        .gte('pubdate', startOfDay.toISOString())
        .lte('pubdate', endOfDay.toISOString());
    }

    const { data, error, count } = await query;

    if (error) throw error;

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

    return new Response(JSON.stringify({
      data: processedData,
      pagination: {
        limit,
        offset,
        total: count,
      },
    }), {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300',
      },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
