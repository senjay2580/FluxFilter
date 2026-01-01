/**
 * YouTube 视频同步 API
 * 
 * 同步用户关注的 YouTube 频道的最新视频
 */

import { createClient } from '@supabase/supabase-js';

export const config = {
  runtime: 'edge',
};

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

interface YouTubeVideoItem {
  videoId: string;
  title: string;
  description: string;
  thumbnail: string;
  channelId: string;
  channelTitle: string;
  publishedAt: string;
  duration?: number;
  viewCount?: number;
}

export default async function handler(request: Request) {
  const authHeader = request.headers.get('Authorization');
  const cronSecret = process.env.CRON_SECRET;
  
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const youtubeApiKey = process.env.YOUTUBE_API_KEY;
  if (!youtubeApiKey) {
    return new Response(JSON.stringify({ error: 'YouTube API Key not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase configuration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  try {
    // 获取所有用户
    const { data: users, error: userError } = await supabase
      .from('user')
      .select('id');

    if (userError) throw userError;
    if (!users || users.length === 0) {
      return new Response(JSON.stringify({ message: 'No users found' }), {
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let totalAdded = 0;
    const userResults: { userId: string; added: number; errors: string[] }[] = [];

    for (const user of users) {
      const userId = user.id;
      const userErrors: string[] = [];
      let userAdded = 0;

      try {
        // 获取该用户的所有 YouTube 频道
        const { data: channels, error: channelError } = await supabase
          .from('uploader')
          .select('channel_id, name')
          .eq('user_id', userId)
          .eq('platform', 'youtube')
          .eq('is_active', true);

        if (channelError) throw channelError;
        if (!channels || channels.length === 0) continue;

        for (const channel of channels) {
          if (!channel.channel_id) continue;

          try {
            const videos = await fetchChannelVideos(channel.channel_id, youtubeApiKey);
            
            // 只获取最近24小时的视频
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);
            const recentVideos = videos.filter(v => new Date(v.publishedAt) >= oneDayAgo);

            for (const video of recentVideos) {
              const videoData = {
                user_id: userId,
                platform: 'youtube',
                video_id: video.videoId,
                channel_id: video.channelId,
                title: video.title,
                pic: video.thumbnail,
                description: video.description || '',
                duration: video.duration || 0,
                view_count: video.viewCount || 0,
                pubdate: video.publishedAt,
                // B站字段设为默认值
                bvid: `YT_${video.videoId}`,
                mid: 0,
              };

              const { error: upsertError } = await supabase
                .from('video')
                .upsert(videoData, { onConflict: 'user_id,platform,video_id' });

              if (upsertError) {
                userErrors.push(`视频 ${video.videoId}: ${upsertError.message}`);
              } else {
                userAdded++;
              }
            }

            await sleep(100);
          } catch (err) {
            userErrors.push(`频道 ${channel.name}: ${err}`);
          }
        }
      } catch (err) {
        userErrors.push(String(err));
      }

      totalAdded += userAdded;
      userResults.push({ userId, added: userAdded, errors: userErrors });
    }

    return new Response(JSON.stringify({
      success: true,
      platform: 'youtube',
      users_synced: users.length,
      videos_added: totalAdded,
      details: userResults,
    }), {
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

async function fetchChannelVideos(channelId: string, apiKey: string): Promise<YouTubeVideoItem[]> {
  // 获取上传播放列表 ID
  const uploadsPlaylistId = channelId.replace(/^UC/, 'UU');
  
  const playlistUrl = `${YOUTUBE_API_BASE}/playlistItems?part=snippet,contentDetails&playlistId=${uploadsPlaylistId}&maxResults=10&key=${apiKey}`;
  
  const response = await fetch(playlistUrl);
  const data = await response.json();

  if (data.error || !data.items) {
    return [];
  }

  const videos: YouTubeVideoItem[] = data.items.map((item: any) => ({
    videoId: item.contentDetails.videoId,
    title: item.snippet.title,
    description: item.snippet.description,
    thumbnail: item.snippet.thumbnails?.medium?.url || item.snippet.thumbnails?.default?.url,
    channelId: item.snippet.channelId,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
  }));

  // 获取视频详情
  if (videos.length > 0) {
    const videoIds = videos.map(v => v.videoId).join(',');
    const detailsUrl = `${YOUTUBE_API_BASE}/videos?part=contentDetails,statistics&id=${videoIds}&key=${apiKey}`;
    
    const detailsResponse = await fetch(detailsUrl);
    const detailsData = await detailsResponse.json();

    if (detailsData.items) {
      const detailsMap = new Map(
        detailsData.items.map((item: any) => [item.id, item])
      );

      videos.forEach(video => {
        const details = detailsMap.get(video.videoId) as any;
        if (details) {
          video.duration = parseDuration(details.contentDetails?.duration);
          video.viewCount = parseInt(details.statistics?.viewCount) || 0;
        }
      });
    }
  }

  return videos;
}

function parseDuration(duration: string): number {
  if (!duration) return 0;
  const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;
  const hours = parseInt(match[1]) || 0;
  const minutes = parseInt(match[2]) || 0;
  const seconds = parseInt(match[3]) || 0;
  return hours * 3600 + minutes * 60 + seconds;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
