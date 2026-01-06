// AI 书签搜索助手 - 后台脚本
// 完全依赖 AI 进行语义匹配

let currentSearch = {
  isSearching: false,
  query: '',
  results: [],
  summary: '',
  fullContent: '',
  error: null,
  abortController: null
};

const DEFAULT_CONFIG = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat'
};

async function getConfig() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(['apiKey', 'baseUrl', 'model'], (result) => {
      resolve({
        apiKey: result.apiKey || '',
        baseUrl: result.baseUrl || DEFAULT_CONFIG.baseUrl,
        model: result.model || DEFAULT_CONFIG.model
      });
    });
  });
}

async function getAllBookmarks() {
  return new Promise((resolve) => {
    chrome.bookmarks.getTree((tree) => {
      const bookmarks = [];
      function traverse(nodes, folderPath = '') {
        for (const node of nodes) {
          if (node.url) {
            bookmarks.push({
              id: node.id,
              name: node.title || '未命名',
              url: node.url,
              folder: folderPath || null
            });
          }
          if (node.children) {
            const newPath = node.title ? 
              (folderPath ? `${folderPath} > ${node.title}` : node.title) : 
              folderPath;
            traverse(node.children, newPath);
          }
        }
      }
      traverse(tree);
      resolve(bookmarks);
    });
  });
}

// 构建 AI 提示词 - 发送所有书签
function buildPrompt(query, bookmarks) {
  // 压缩格式：序号|名称|文件夹|URL
  const list = bookmarks.map((b, i) => 
    `${i + 1}|${b.name}|${b.folder || ''}|${b.url}`
  ).join('\n');

  return `你是书签搜索助手。用户搜索："${query}"

书签列表（格式：序号|名称|文件夹路径|URL）：
${list}

搜索规则：
1. 文件夹匹配最重要！搜"vibe coding"要返回"Vibe coding"文件夹下所有书签
2. 忽略大小写、空格、连字符差异
3. 理解语义：搜"前端"要匹配React/Vue/CSS等
4. 搜"vibe coding 项目"也要匹配"Vibe coding"文件夹

返回JSON（只返回JSON，不要其他内容）：
{"results":[{"id":"序号","name":"名称","url":"URL","folder":"文件夹","confidence":95,"relevance":"匹配原因"}],"summary":"找到X个书签"}

要求：返回8-20个最相关的，按相关度排序。`;
}

// 简单的本地搜索（无API时使用）
function localSearch(query, bookmarks) {
  const q = query.toLowerCase();
  const keywords = q.split(/\s+/).filter(k => k);
  
  const results = bookmarks
    .map(b => {
      const name = b.name.toLowerCase();
      const folder = (b.folder || '').toLowerCase();
      const url = b.url.toLowerCase();
      
      let score = 0;
      
      // 文件夹匹配
      if (folder.includes(q.replace(/\s+/g, ''))) score += 100;
      if (folder.includes(q)) score += 80;
      
      // 检查文件夹每一级
      for (const seg of folder.split(' > ')) {
        const segClean = seg.replace(/\s+/g, '').toLowerCase();
        const qClean = q.replace(/\s+/g, '');
        if (segClean.includes(qClean) || qClean.includes(segClean)) {
          score += 90;
          break;
        }
        // 所有关键词都在这一级
        if (keywords.every(k => seg.includes(k))) {
          score += 70;
          break;
        }
      }
      
      // 名称匹配
      if (name.includes(q)) score += 50;
      
      // 关键词匹配
      keywords.forEach(k => {
        if (name.includes(k)) score += 20;
        if (folder.includes(k)) score += 30;
        if (url.includes(k)) score += 10;
      });
      
      return { ...b, score, confidence: Math.min(score, 100), relevance: score >= 70 ? '文件夹匹配' : '关键词匹配' };
    })
    .filter(b => b.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 20);

  return { results, summary: `找到 ${results.length} 个书签` };
}

function extractPartialResults(content) {
  const results = [];
  
  // 方法1: 尝试匹配完整的 results 数组
  try {
    const match = content.match(/"results"\s*:\s*\[([\s\S]*?)\]/);
    if (match) {
      const parsed = JSON.parse(`[${match[1]}]`);
      for (const obj of parsed) {
        if (obj.name && obj.url) {
          results.push({
            name: obj.name,
            url: obj.url,
            folder: obj.folder || null,
            confidence: obj.confidence || 80,
            relevance: obj.relevance || ''
          });
        }
      }
      if (results.length > 0) return results;
    }
  } catch {}
  
  // 方法2: 逐个解析完整的 JSON 对象（在 results 数组内）
  const resultsStart = content.indexOf('"results"');
  if (resultsStart !== -1) {
    const arrayStart = content.indexOf('[', resultsStart);
    if (arrayStart !== -1) {
      const searchContent = content.slice(arrayStart);
      let depth = 0, start = -1, inArray = false;
      
      for (let i = 0; i < searchContent.length; i++) {
        const char = searchContent[i];
        if (char === '[' && !inArray) { inArray = true; continue; }
        if (!inArray) continue;
        if (char === ']' && depth === 0) break;
        
        if (char === '{') { 
          if (depth === 0) start = i; 
          depth++; 
        } else if (char === '}') {
          depth--;
          if (depth === 0 && start !== -1) {
            try {
              const obj = JSON.parse(searchContent.slice(start, i + 1));
              if (obj.name && obj.url) {
                results.push({ 
                  name: obj.name, 
                  url: obj.url, 
                  folder: obj.folder || null, 
                  confidence: obj.confidence || 80, 
                  relevance: obj.relevance || '' 
                });
              }
            } catch {}
            start = -1;
          }
        }
      }
    }
  }
  
  // 方法3: 如果上面都失败，尝试匹配任何完整的对象
  if (results.length === 0) {
    let depth = 0, start = -1;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '{') { if (depth === 0) start = i; depth++; }
      else if (content[i] === '}') {
        depth--;
        if (depth === 0 && start !== -1) {
          try {
            const obj = JSON.parse(content.slice(start, i + 1));
            if (obj.name && obj.url && !obj.results) {
              results.push({ 
                name: obj.name, 
                url: obj.url, 
                folder: obj.folder || null, 
                confidence: obj.confidence || 80, 
                relevance: obj.relevance || '' 
              });
            }
          } catch {}
          start = -1;
        }
      }
    }
  }
  
  return results;
}

async function performAISearch(query) {
  if (currentSearch.abortController) currentSearch.abortController.abort();
  
  const abortController = new AbortController();
  currentSearch = { isSearching: true, query, results: [], summary: '', fullContent: '', error: null, abortController };

  const config = await getConfig();
  const bookmarks = await getAllBookmarks();
  
  console.log(`[搜索] 查询: "${query}", 书签数: ${bookmarks.length}`);

  if (!config.apiKey) {
    console.log('[搜索] 无API Key，使用本地搜索');
    const result = localSearch(query, bookmarks);
    currentSearch = { isSearching: false, query, results: result.results, summary: result.summary + ' (本地搜索)', fullContent: '', error: null, abortController: null };
    return;
  }

  const prompt = buildPrompt(query, bookmarks);
  console.log(`[搜索] Prompt长度: ${prompt.length}`);

  try {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content: prompt }], temperature: 0.2, max_tokens: 2000, stream: true }),
      signal: abortController.signal
    });

    if (!response.ok) {
      console.log('[搜索] API错误，使用本地搜索');
      const result = localSearch(query, bookmarks);
      currentSearch = { isSearching: false, query, results: result.results, summary: result.summary + ' (API错误)', fullContent: '', error: null, abortController: null };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = ''; // 用于处理跨chunk的数据

    while (true) {
      if (abortController.signal.aborted) { reader.cancel(); break; }
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // 保留最后一个可能不完整的行

      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('data: ') && trimmed.slice(6) !== '[DONE]') {
          try {
            const data = JSON.parse(trimmed.slice(6));
            const content = data.choices?.[0]?.delta?.content || '';
            if (content) {
              currentSearch.fullContent += content;
              // 每次收到内容都尝试解析，实时更新结果
              const partial = extractPartialResults(currentSearch.fullContent);
              if (partial.length > currentSearch.results.length) {
                currentSearch.results = partial;
                console.log(`[流式] 已解析 ${partial.length} 个结果`);
              }
            }
          } catch (e) {
            // 忽略解析错误，继续处理
          }
        }
      }
    }
    
    // 处理buffer中剩余的数据
    if (buffer.trim().startsWith('data: ') && buffer.trim().slice(6) !== '[DONE]') {
      try {
        const content = JSON.parse(buffer.trim().slice(6)).choices?.[0]?.delta?.content || '';
        if (content) currentSearch.fullContent += content;
      } catch {}
    }

    // 解析完整结果
    try {
      const json = currentSearch.fullContent.match(/\{[\s\S]*\}/);
      if (json) {
        const parsed = JSON.parse(json[0]);
        if (parsed.results?.length) {
          currentSearch.results = parsed.results;
          currentSearch.summary = parsed.summary || '搜索完成';
        }
      }
    } catch {}

    if (!currentSearch.results.length) {
      const result = localSearch(query, bookmarks);
      currentSearch.results = result.results;
      currentSearch.summary = result.summary;
    }

  } catch (e) {
    console.log('[搜索] 错误:', e.message);
    const result = localSearch(query, bookmarks);
    currentSearch.results = result.results;
    currentSearch.summary = result.summary;
    currentSearch.error = e.message;
  }

  currentSearch.isSearching = false;
  currentSearch.abortController = null;
  console.log(`[搜索] 完成，结果: ${currentSearch.results.length}`);
}

function stopSearch() {
  if (currentSearch.abortController) {
    currentSearch.abortController.abort();
    currentSearch.abortController = null;
  }
  currentSearch.isSearching = false;
  currentSearch.summary = currentSearch.results.length ? `已停止，${currentSearch.results.length} 个结果` : '已停止';
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'START_SEARCH') {
    performAISearch(message.query);
    sendResponse({ success: true });
  } else if (message.type === 'STOP_SEARCH') {
    stopSearch();
    sendResponse({ success: true });
  } else if (message.type === 'GET_SEARCH_STATUS') {
    sendResponse(currentSearch);
  } else if (message.type === 'CLEAR_SEARCH') {
    stopSearch();
    currentSearch = { isSearching: false, query: '', results: [], summary: '', fullContent: '', error: null, abortController: null };
    sendResponse({ success: true });
  } else if (message.type === 'GET_BOOKMARK_STATS') {
    getAllBookmarks().then(bookmarks => {
      const vibe = bookmarks.filter(b => (b.folder || '').toLowerCase().includes('vibe'));
      sendResponse({ total: bookmarks.length, vibeCount: vibe.length, vibeBookmarks: vibe });
    });
    return true;
  }
  return true;
});
