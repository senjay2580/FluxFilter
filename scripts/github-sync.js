/**
 * GitHub Actions 定时同步脚本
 * 直接从 GitHub runner 请求 B站 API
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// B站 API 请求
async function getUploaderVideos(mid, cookie) {
  const url = `https://api.bilibili.com/x/space/wbi/arc/search?mid=${mid}&ps=10&pn=1&order=pubdate`;
  
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Referer': `https://space.bilibili.com/${mid}`,
      'Origin': 'https://space.bilibili.com',
      'Cookie': cookie,
    },
  });

  const data = await response.json();
  
  if (data.code !== 0) {
    console.log(`  ⚠️ UP主[${mid}]失败: ${data.message || data.code}`);
    return [];
  }

  return data.data?.list?.vlist || [];
}

// 解析时长
function parseDuration(length) {
  if (!length) return 0;
  const parts = length.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return 0;
}

async function main() {
  console.log('🕐 GitHub Actions 同步开始:', new Date().toISOString());

  // 获取所有用户
  const { data: users, error: userError } = await supabase
    .from('user')
    .select('id, bilibili_cookie')
    .not('bilibili_cookie', 'is', null);

  if (userError) {
    console.error('获取用户失败:', userError);
    process.exit(1);
  }

  if (!users?.length) {
    console.log('没有配置 Cookie 的用户');
    return;
  }

  console.log(`找到 ${users.length} 个用户`);

  for (const user of users) {
    if (!user.bilibili_cookie) continue;

    console.log(`\n👤 处理用户: ${user.id.slice(0, 8)}...`);

    // 获取 UP 主列表
    const { data: uploaders } = await supabase
      .from('uploader')
      .select('mid, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .eq('platform', 'bilibili');

    if (!uploaders?.length) {
      console.log('  无 UP 主');
      continue;
    }

    console.log(`  找到 ${uploaders.length} 个 UP 主`);

    // 今天 0 点
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const todayTimestamp = Math.floor(todayStart.getTime() / 1000);

    const allVideos = [];
    const newVideoTitles = [];

    for (const uploader of uploaders) {
      try {
        const videos = await getUploaderVideos(uploader.mid, user.bilibili_cookie);
        
        // 只保留今天的视频
        const todayVideos = videos.filter(v => v.created >= todayTimestamp);
        
        for (const video of todayVideos) {
          allVideos.push({
            user_id: user.id,
            bvid: video.bvid,
            aid: video.aid,
            mid: uploader.mid,
            title: video.title,
            pic: video.pic?.replace('http:', 'https:'),
            description: video.description || '',
            duration: parseDuration(video.length),
            view_count: video.play || 0,
            danmaku_count: video.video_review || 0,
            reply_count: video.comment || 0,
            favorite_count: video.favorites || 0,
            coin_count: 0,
            share_count: 0,
            like_count: 0,
            pubdate: new Date(video.created * 1000).toISOString(),
            platform: 'bilibili',
          });
          newVideoTitles.push(`${uploader.name}: ${video.title}`);
        }

        if (todayVideos.length > 0) {
          console.log(`  ✅ ${uploader.name}: ${todayVideos.length} 个新视频`);
        }

        // 限流
        await new Promise(r => setTimeout(r, 300));
      } catch (err) {
        console.log(`  ❌ ${uploader.name}: ${err.message}`);
      }
    }

    // 插入新视频
    if (allVideos.length > 0) {
      // 查询已存在的
      const bvids = allVideos.map(v => v.bvid);
      const { data: existing } = await supabase
        .from('video')
        .select('bvid')
        .eq('user_id', user.id)
        .in('bvid', bvids);

      const existingBvids = new Set(existing?.map(v => v.bvid) || []);
      const newVideos = allVideos.filter(v => !existingBvids.has(v.bvid));

      if (newVideos.length > 0) {
        const { error: insertError } = await supabase
          .from('video')
          .upsert(newVideos, { onConflict: 'user_id,platform,bvid' });

        if (insertError) {
          console.log(`  ❌ 插入失败: ${insertError.message}`);
        } else {
          console.log(`  📥 新增 ${newVideos.length} 个视频`);

          // 创建通知
          await supabase.from('notification').insert({
            user_id: user.id,
            type: 'sync_result',
            title: `同步完成：新增 ${newVideos.length} 个视频`,
            content: newVideoTitles.slice(0, 5).join('\n') + 
              (newVideoTitles.length > 5 ? `\n...等 ${newVideoTitles.length} 个` : ''),
            data: {
              videos_added: newVideos.length,
              new_videos: newVideos.slice(0, 10).map(v => ({
                bvid: v.bvid,
                title: v.title,
                pic: v.pic,
              })),
            },
          });
        }
      } else {
        console.log('  无新视频');
      }
    }
  }

  console.log('\n✅ 同步完成');
}

main().catch(err => {
  console.error('同步失败:', err);
  process.exit(1);
});
