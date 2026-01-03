import { supabase } from './supabase';
import { getStoredUserId } from './auth';
import { AI_MODELS, getModelApiKey } from './ai-models';

// 用户学习数据类型定义
export interface UserLearningData {
  learningLogs: {
    video_title: string;
    video_url: string;
    summary: string;
    created_at: string;
  }[];
  notes: {
    title: string;
    content: string;
    preview: string;
    created_at: string;
    updated_at: string;
  }[];
  collectedVideos: {
    title: string;
    pubdate: string;
    created_at: string;
    uploader_name: string;
    duration: number;
  }[];
  watchlistVideos: {
    title: string;
    created_at: string;
    is_watched: boolean;
    note: string;
  }[];
  insightHistory: {
    title: string;
    category: string;
    core_content: string;
    tags: string[];
    created_at: string;
  }[];
}

// 获取用户学习数据
export async function getUserLearningData(): Promise<UserLearningData> {
  const userId = getStoredUserId();
  if (!userId) {
    throw new Error('用户未登录');
  }

  const [logsRes, notesRes, collectedRes, watchlistRes, insightRes] = await Promise.all([
    supabase
      .from('learning_log')
      .select('video_title, video_url, summary, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('notes')
      .select('title, content, preview, created_at, updated_at')
      .eq('user_id', userId)
      .order('updated_at', { ascending: false }),
    supabase
      .from('collected_video')
      .select('title, pubdate, created_at, uploader_name, duration')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('watchlist')
      .select('bvid, is_watched, note, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
    supabase
      .from('insight_history')
      .select('title, category, core_content, tags, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false }),
  ]);

  const watchlistBvids = (watchlistRes.data || []).map(w => w.bvid);
  let watchlistVideos: UserLearningData['watchlistVideos'] = [];
  
  if (watchlistBvids.length > 0) {
    const [videoRes, collectedVideoRes] = await Promise.all([
      supabase.from('video').select('bvid, title').eq('user_id', userId).in('bvid', watchlistBvids),
      supabase.from('collected_video').select('bvid, title').eq('user_id', userId).in('bvid', watchlistBvids),
    ]);

    const titleMap = new Map<string, string>();
    (videoRes.data || []).forEach(v => titleMap.set(v.bvid, v.title));
    (collectedVideoRes.data || []).forEach(v => titleMap.set(v.bvid, v.title));

    watchlistVideos = (watchlistRes.data || []).map(w => ({
      title: titleMap.get(w.bvid) || w.bvid,
      created_at: w.created_at,
      is_watched: w.is_watched,
      note: w.note || '',
    }));
  }

  return {
    learningLogs: logsRes.data || [],
    notes: notesRes.data || [],
    collectedVideos: collectedRes.data || [],
    watchlistVideos,
    insightHistory: insightRes.data || [],
  };
}

function daysDiff(dateStr: string, currentDate: string): number {
  return Math.floor((new Date(currentDate).getTime() - new Date(dateStr).getTime()) / (1000 * 60 * 60 * 24));
}

const REVIEW_INTERVALS = [1, 2, 4, 7, 15, 30];

function buildAISuggestionPrompt(data: UserLearningData, currentDate: string): string {
  const { learningLogs, notes, collectedVideos, watchlistVideos, insightHistory } = data;

  // 1. 学习日志 - 全部展示（最多20个）
  const allLogs = learningLogs.slice(0, 20).map(log => {
    const diff = daysDiff(log.created_at, currentDate);
    const needReview = REVIEW_INTERVALS.includes(diff);
    return { title: log.video_title, days: diff, needReview, summary: log.summary };
  });

  // 2. 笔记 - 全部展示（最多20个）
  const allNotes = notes.slice(0, 20).map(note => {
    const diff = daysDiff(note.updated_at, currentDate);
    const needReview = REVIEW_INTERVALS.includes(diff);
    const isStale = diff > 14;
    const preview = (note.content || note.preview || '').replace(/<[^>]*>/g, '').slice(0, 30);
    return { title: note.title || '无标题', days: diff, needReview, isStale, preview };
  });

  // 3. 视频收藏夹 - 全部展示（最多20个）
  const allCollected = collectedVideos.slice(0, 20).map(v => {
    const diff = daysDiff(v.created_at, currentDate);
    let status = '正常';
    if (diff > 30) status = '严重拖欠';
    else if (diff > 14) status = '较久未看';
    else if (diff > 7) status = '待看';
    return { title: v.title, uploader: v.uploader_name, days: diff, status };
  });

  // 4. 待看列表 - 全部展示（最多20个）
  const unwatchedList = watchlistVideos.filter(v => !v.is_watched);
  const allWatchlist = unwatchedList.slice(0, 20).map(v => {
    const diff = daysDiff(v.created_at, currentDate);
    let status = '正常';
    if (diff > 30) status = '严重拖欠';
    else if (diff > 14) status = '较久未看';
    else if (diff > 7) status = '待看';
    return { title: v.title, days: diff, note: v.note, status };
  });

  // 5. 每日信息差 - 全部展示（最多20个）
  const allInsights = insightHistory.slice(0, 20).map(i => {
    const diff = daysDiff(i.created_at, currentDate);
    return { title: i.title, category: i.category, days: diff, content: (i.core_content || '').slice(0, 30) };
  });
  const insightsByCategory = insightHistory.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  let prompt = '你是学习任务提醒助手。根据以下数据生成今日任务提醒。\n\n';
  prompt += '当前日期：' + currentDate + '\n\n';
  prompt += '=== 原始数据（每个模块最多20条）===\n\n';

  // 学习日志
  prompt += '【1. 学习日志】共' + learningLogs.length + '条\n';
  if (allLogs.length > 0) {
    allLogs.forEach((l, i) => {
      const tag = l.needReview ? '[需复习]' : '';
      prompt += (i + 1) + '. ' + tag + l.title + ' - ' + l.days + '天前\n';
    });
  } else {
    prompt += '暂无记录\n';
  }

  // 笔记
  prompt += '\n【2. 笔记】共' + notes.length + '条\n';
  if (allNotes.length > 0) {
    allNotes.forEach((n, i) => {
      let tag = '';
      if (n.needReview) tag = '[需复习]';
      else if (n.isStale) tag = '[久未复习]';
      prompt += (i + 1) + '. ' + tag + n.title + ' - ' + n.days + '天前 | ' + n.preview + '\n';
    });
  } else {
    prompt += '暂无记录\n';
  }

  // 视频收藏夹
  prompt += '\n【3. 视频收藏夹】共' + collectedVideos.length + '个\n';
  if (allCollected.length > 0) {
    allCollected.forEach((v, i) => {
      const tag = v.status !== '正常' ? '[' + v.status + ']' : '';
      prompt += (i + 1) + '. ' + tag + v.title + ' by ' + v.uploader + ' - ' + v.days + '天\n';
    });
  } else {
    prompt += '暂无记录\n';
  }

  // 待看列表
  prompt += '\n【4. 待看列表】共' + unwatchedList.length + '个未看\n';
  if (allWatchlist.length > 0) {
    allWatchlist.forEach((v, i) => {
      const tag = v.status !== '正常' ? '[' + v.status + ']' : '';
      prompt += (i + 1) + '. ' + tag + v.title + ' - ' + v.days + '天' + (v.note ? ' (' + v.note + ')' : '') + '\n';
    });
  } else {
    prompt += '暂无记录\n';
  }

  // 每日信息差
  prompt += '\n【5. 每日信息差】共' + insightHistory.length + '张\n';
  const categoryStr = Object.entries(insightsByCategory).map(([c, n]) => c + ':' + n).join(', ');
  prompt += '分类: ' + (categoryStr || '无') + '\n';
  if (allInsights.length > 0) {
    allInsights.forEach((i, idx) => {
      prompt += (idx + 1) + '. [' + i.category + '] ' + i.title + ' - ' + i.days + '天前 | ' + i.content + '\n';
    });
  } else {
    prompt += '暂无记录\n';
  }

  // 输出要求
  prompt += '\n=== 输出要求 ===\n\n';
  prompt += '请严格按以下5个模块输出，每个模块用表格展示所有数据（最多20条）：\n\n';

  prompt += '## 📺 视频收藏夹（共' + collectedVideos.length + '个）\n\n';
  prompt += '| 序号 | 视频标题 | UP主 | 收藏天数 | 状态 |\n';
  prompt += '|-----|---------|------|---------|-----|\n';
  prompt += '（展示所有收藏视频，状态用emoji：🚨严重拖欠 ⚠️较久未看 📋待看 ✅正常）\n\n';

  prompt += '## 📚 学习日志（共' + learningLogs.length + '条）\n\n';
  prompt += '| 序号 | 视频标题 | 学习天数 | 状态 |\n';
  prompt += '|-----|---------|---------|-----|\n';
  prompt += '（展示所有学习日志，状态：🔄需复习 ✅正常）\n\n';

  prompt += '## 📝 笔记（共' + notes.length + '条）\n\n';
  prompt += '| 序号 | 笔记标题 | 更新天数 | 状态 | 摘要 |\n';
  prompt += '|-----|---------|---------|-----|-----|\n';
  prompt += '（展示所有笔记，状态：🔄需复习 ⚠️久未复习 ✅正常）\n\n';

  prompt += '## 📌 待看列表（共' + unwatchedList.length + '个未看）\n\n';
  prompt += '| 序号 | 视频标题 | 添加天数 | 状态 | 备注 |\n';
  prompt += '|-----|---------|---------|-----|-----|\n';
  prompt += '（展示所有待看视频，状态用emoji：🚨严重拖欠 ⚠️较久未看 📋待看 ✅正常）\n\n';

  prompt += '## 💡 每日信息差（共' + insightHistory.length + '张）\n\n';
  prompt += '| 序号 | 标题 | 分类 | 生成天数 | 内容摘要 |\n';
  prompt += '|-----|-----|-----|---------|--------|\n';
  prompt += '（展示所有信息差卡片）\n\n';

  prompt += '## 🎯 今日建议\n';
  prompt += '（根据数据分析，给出具体的学习建议，指出最紧急需要处理的任务）\n\n';

  prompt += '注意：\n';
  prompt += '- 每个模块必须用Markdown表格展示所有数据\n';
  prompt += '- 如果某模块无数据，写"✅ 暂无记录"\n';
  prompt += '- 表格内容要简洁，标题最多15字，超出用...截断\n';
  prompt += '- 收藏夹和待看列表是两个不同的东西，不要混淆';

  return prompt;
}

export async function generateAISuggestion(onStream?: (content: string) => void): Promise<string> {
  const data = await getUserLearningData();
  
  const now = new Date();
  const currentDate = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
  
  const prompt = buildAISuggestionPrompt(data, currentDate);

  const selectedModelId = localStorage.getItem('ai_model') || 'deepseek-chat';
  const model = AI_MODELS.find(m => m.id === selectedModelId) || AI_MODELS[0];
  const apiKey = getModelApiKey(selectedModelId);

  if (!apiKey) {
    throw new Error('请先在设置中配置 AI 模型的 API Key');
  }

  if (model.provider === 'Google') {
    return callGeminiAPI(model, apiKey, prompt, onStream);
  } else {
    return callOpenAICompatibleAPI(model, apiKey, prompt, onStream);
  }
}

async function callOpenAICompatibleAPI(
  model: typeof AI_MODELS[0],
  apiKey: string,
  prompt: string,
  onStream?: (content: string) => void
): Promise<string> {
  const response = await fetch(model.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
    },
    body: JSON.stringify({
      model: model.id,
      messages: [{ role: 'user', content: prompt }],
      stream: !!onStream,
      max_tokens: 3000,
    }),
  });

  if (!response.ok) {
    throw new Error('API 请求失败: ' + response.status);
  }

  if (onStream && response.body) {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n').filter(line => line.startsWith('data: '));

      for (const line of lines) {
        const jsonData = line.slice(6);
        if (jsonData === '[DONE]') continue;
        try {
          const json = JSON.parse(jsonData);
          const content = json.choices?.[0]?.delta?.content || '';
          result += content;
          onStream(result);
        } catch {}
      }
    }
    return result;
  } else {
    const json = await response.json();
    return json.choices?.[0]?.message?.content || '';
  }
}

async function callGeminiAPI(
  model: typeof AI_MODELS[0],
  apiKey: string,
  prompt: string,
  onStream?: (content: string) => void
): Promise<string> {
  const url = model.apiUrl + '?key=' + apiKey;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 3000 },
    }),
  });

  if (!response.ok) {
    throw new Error('Gemini API 请求失败: ' + response.status);
  }

  const json = await response.json();
  const content = json.candidates?.[0]?.content?.parts?.[0]?.text || '';
  
  if (onStream) {
    onStream(content);
  }
  
  return content;
}
