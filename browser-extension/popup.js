// AI 书签搜索助手 - Popup 脚本
// 使用后台脚本进行搜索，支持关闭 popup 后继续

// DOM 元素
const mainPage = document.getElementById('mainPage');
const settingsPage = document.getElementById('settingsPage');
const historyPage = document.getElementById('historyPage');
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const resultsDiv = document.getElementById('results');
const loadingDiv = document.getElementById('loading');
const settingsBtn = document.getElementById('settingsBtn');
const historyBtn = document.getElementById('historyBtn');
const backBtn = document.getElementById('backBtn');
const historyBackBtn = document.getElementById('historyBackBtn');
const clearHistoryBtn = document.getElementById('clearHistoryBtn');
const historyListDiv = document.getElementById('historyList');
const saveSettingsBtn = document.getElementById('saveSettings');
const apiKeyInput = document.getElementById('apiKey');
const baseUrlInput = document.getElementById('baseUrl');
const modelInput = document.getElementById('model');

// 默认配置
const DEFAULT_CONFIG = {
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat'
};

// 历史记录配置
const HISTORY_KEY = 'bookmark_search_history';
const MAX_HISTORY = 30;

// 轮询间隔
let pollInterval = null;
let lastResultCount = 0;
let renderedResultCount = 0;
let currentQuery = ''; // 当前搜索词

// 获取配置
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

// 保存配置
async function saveConfig(config) {
  return new Promise((resolve) => {
    chrome.storage.sync.set(config, resolve);
  });
}

// ========== 历史记录功能 ==========
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

function addToHistory(query, results, summary) {
  if (!query || results.length === 0) return;
  
  const history = getHistory();
  const newItem = {
    id: Date.now().toString(),
    query,
    results,
    summary,
    timestamp: Date.now()
  };
  // 去重
  const filtered = history.filter(h => h.query !== query);
  saveHistory([newItem, ...filtered]);
}

function deleteHistoryItem(id) {
  const history = getHistory();
  saveHistory(history.filter(h => h.id !== id));
}

function clearAllHistory() {
  localStorage.removeItem(HISTORY_KEY);
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - timestamp;
  
  if (diff < 60000) return '刚刚';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function renderHistoryList() {
  const history = getHistory();
  
  if (history.length === 0) {
    historyListDiv.innerHTML = '<p class="history-empty">暂无搜索历史</p>';
    return;
  }
  
  let html = '';
  history.forEach(item => {
    html += `
      <div class="history-item" data-id="${item.id}">
        <div class="history-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div class="history-content">
          <p class="history-query">${escapeHtml(item.query)}</p>
          <p class="history-meta">${item.results.length} 个结果 · ${formatTime(item.timestamp)}</p>
        </div>
        <button class="history-delete" data-id="${item.id}" title="删除">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>
    `;
  });
  
  historyListDiv.innerHTML = html;
  
  // 绑定点击事件
  historyListDiv.querySelectorAll('.history-item').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('.history-delete')) return;
      const id = el.dataset.id;
      const item = history.find(h => h.id === id);
      if (item) {
        loadFromHistory(item);
      }
    });
  });
  
  // 绑定删除事件
  historyListDiv.querySelectorAll('.history-delete').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      deleteHistoryItem(id);
      renderHistoryList();
    });
  });
}

function loadFromHistory(item) {
  searchInput.value = item.query;
  renderResults(item.results, item.summary);
  showMain();
}

function showHistory() {
  mainPage.classList.remove('active');
  historyPage.classList.add('active');
  renderHistoryList();
}

function hideHistory() {
  historyPage.classList.remove('active');
  mainPage.classList.add('active');
}

// 渲染流式结果 - 增量更新，避免抖动
function renderStreamingResults(results) {
  // 如果结果数量没变，不重新渲染
  if (results.length === renderedResultCount) return;
  
  // 如果是第一次渲染或结果数量减少，完全重新渲染
  if (renderedResultCount === 0 || results.length < renderedResultCount) {
    let html = `<p class="result-summary streaming"><span class="stream-dot"></span>正在搜索... 已找到 ${results.length} 个结果</p>`;
    html += `<div class="results-list">`;
    html += renderResultItems(results, 0);
    html += `</div>`;
    resultsDiv.innerHTML = html;
    renderedResultCount = results.length;
    return;
  }
  
  // 增量更新：只更新摘要和添加新结果
  const summaryEl = resultsDiv.querySelector('.result-summary');
  if (summaryEl) {
    summaryEl.innerHTML = `<span class="stream-dot"></span>正在搜索... 已找到 ${results.length} 个结果`;
  }
  
  // 添加新的结果项
  const listEl = resultsDiv.querySelector('.results-list');
  if (listEl) {
    const newItems = results.slice(renderedResultCount);
    const newHtml = renderResultItems(newItems, renderedResultCount);
    listEl.insertAdjacentHTML('beforeend', newHtml);
  }
  
  renderedResultCount = results.length;
}

// 渲染结果项
function renderResultItems(results, startIndex = 0) {
  let html = '';
  results.forEach((result, index) => {
    const actualIndex = startIndex + index;
    let hostname = '';
    try { hostname = new URL(result.url).hostname; } catch { hostname = result.url; }

    const confidence = result.confidence || 0;
    const confidenceClass = confidence >= 80 ? 'high' : confidence >= 50 ? 'medium' : 'low';

    html += `
      <a href="${escapeHtml(result.url)}" target="_blank" class="result-item" style="animation-delay: ${index * 30}ms">
        <span class="result-index">${actualIndex + 1}</span>
        <div class="result-content">
          <p class="result-name">${escapeHtml(result.name)}</p>
          <p class="result-url">${escapeHtml(hostname)}</p>
          ${result.folder ? `<span class="result-folder">📁 ${escapeHtml(result.folder)}</span>` : ''}
        </div>
        <div class="result-meta">
          ${confidence ? `<span class="result-confidence ${confidenceClass}">${confidence}%</span>` : ''}
          <span class="result-relevance">${escapeHtml(result.relevance || '')}</span>
        </div>
        <svg class="result-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
          <polyline points="15 3 21 3 21 9" />
          <line x1="10" y1="14" x2="21" y2="3" />
        </svg>
      </a>
    `;
  });
  return html;
}

// 渲染最终结果
function renderResults(results, summary) {
  renderedResultCount = 0; // 重置计数
  
  if (results.length === 0) {
    resultsDiv.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
        </div>
        <p>${escapeHtml(summary) || '未找到相关书签'}</p>
        <p class="hint">试试换个描述方式</p>
      </div>
    `;
    return;
  }

  let html = `<p class="result-summary">${escapeHtml(summary)}</p>`;
  html += `<div class="results-list">`;
  html += renderResultItems(results, 0);
  html += `</div>`;
  resultsDiv.innerHTML = html;
  renderedResultCount = results.length;
}

// HTML 转义
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// 开始轮询搜索状态
function startPolling() {
  if (pollInterval) return;
  
  lastResultCount = 0;
  let noResultTicks = 0; // 追踪没有结果的轮询次数
  
  pollInterval = setInterval(async () => {
    try {
      const status = await chrome.runtime.sendMessage({ type: 'GET_SEARCH_STATUS' });
      
      if (status.isSearching) {
        // 正在搜索中
        if (status.results && status.results.length > 0) {
          // 有结果了，隐藏loading，显示流式结果
          loadingDiv.classList.add('hidden');
          if (status.results.length !== lastResultCount) {
            renderStreamingResults(status.results);
            lastResultCount = status.results.length;
          }
          noResultTicks = 0;
        } else {
          // 还没有结果，显示loading状态
          noResultTicks++;
          // 超过2秒(约13次轮询)还没结果，显示提示
          if (noResultTicks > 13) {
            const loadingText = loadingDiv.querySelector('p');
            if (loadingText) {
              loadingText.textContent = 'AI 正在分析书签...';
            }
          }
        }
      } else {
        // 搜索完成
        stopPolling();
        loadingDiv.classList.add('hidden');
        searchBtn.disabled = false;
        updateSearchButton(false);
        
        if (status.results && status.results.length > 0) {
          renderResults(status.results, status.summary);
          // 保存到历史记录
          addToHistory(status.query || currentQuery, status.results, status.summary);
        } else if (status.query) {
          renderResults([], status.summary || '未找到相关书签');
        }
      }
    } catch (error) {
      console.error('轮询错误:', error);
    }
  }, 100); // 缩短轮询间隔到100ms，更快响应
}

// 停止轮询
function stopPolling() {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
  }
}

// 停止搜索
async function stopSearch() {
  stopPolling();
  try {
    await chrome.runtime.sendMessage({ type: 'STOP_SEARCH' });
  } catch (error) {
    console.error('停止搜索失败:', error);
  }
  loadingDiv.classList.add('hidden');
  searchBtn.disabled = false;
  updateSearchButton(false);
}

// 更新搜索按钮状态
function updateSearchButton(isSearching) {
  isCurrentlySearching = isSearching;
  if (isSearching) {
    searchBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="6" y="6" width="12" height="12" rx="2" />
      </svg>
    `;
    searchBtn.title = '停止搜索';
    searchBtn.classList.add('stop-btn');
  } else {
    searchBtn.innerHTML = `
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12h14M12 5l7 7-7 7" />
      </svg>
    `;
    searchBtn.title = '搜索';
    searchBtn.classList.remove('stop-btn');
  }
}

// 执行搜索
async function performSearch() {
  const query = searchInput.value.trim();
  if (!query) return;

  currentQuery = query;
  loadingDiv.classList.remove('hidden');
  searchBtn.disabled = false; // 保持可点击以便停止
  updateSearchButton(true);
  resultsDiv.innerHTML = '';
  renderedResultCount = 0;
  lastResultCount = 0;

  try {
    await chrome.runtime.sendMessage({ type: 'START_SEARCH', query });
    startPolling();
  } catch (error) {
    console.error('搜索失败:', error);
    renderResults([], '搜索出错，请重试');
    loadingDiv.classList.add('hidden');
    updateSearchButton(false);
  }
}

// 加载设置
async function loadSettings() {
  const config = await getConfig();
  apiKeyInput.value = config.apiKey;
  baseUrlInput.value = config.baseUrl;
  modelInput.value = config.model;
}

// 显示设置页面
function showSettings() {
  mainPage.classList.remove('active');
  historyPage.classList.remove('active');
  settingsPage.classList.add('active');
  loadSettings();
}

// 显示主页面
function showMain() {
  settingsPage.classList.remove('active');
  historyPage.classList.remove('active');
  mainPage.classList.add('active');
}

// 检查是否有正在进行的搜索
async function checkOngoingSearch() {
  try {
    const status = await chrome.runtime.sendMessage({ type: 'GET_SEARCH_STATUS' });
    
    if (status.query) {
      searchInput.value = status.query;
    }
    
    if (status.isSearching) {
      loadingDiv.classList.remove('hidden');
      searchBtn.disabled = false;
      updateSearchButton(true);
      if (status.results && status.results.length > 0) {
        loadingDiv.classList.add('hidden');
        renderStreamingResults(status.results);
      }
      startPolling();
    } else if (status.results && status.results.length > 0) {
      updateSearchButton(false);
      renderResults(status.results, status.summary);
    }
  } catch (error) {
    console.error('检查搜索状态失败:', error);
  }
}

// 当前是否正在搜索
let isCurrentlySearching = false;

// 事件监听
searchBtn.addEventListener('click', () => {
  if (isCurrentlySearching) {
    stopSearch();
  } else {
    performSearch();
  }
});

searchInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    performSearch();
  }
});

settingsBtn.addEventListener('click', showSettings);
historyBtn.addEventListener('click', showHistory);
backBtn.addEventListener('click', showMain);
historyBackBtn.addEventListener('click', hideHistory);

clearHistoryBtn.addEventListener('click', () => {
  if (confirm('确定要清空所有搜索历史吗？')) {
    clearAllHistory();
    renderHistoryList();
  }
});

saveSettingsBtn.addEventListener('click', async () => {
  await saveConfig({
    apiKey: apiKeyInput.value.trim(),
    baseUrl: baseUrlInput.value.trim() || DEFAULT_CONFIG.baseUrl,
    model: modelInput.value.trim() || DEFAULT_CONFIG.model
  });
  showMain();
});

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  searchInput.focus();
  checkOngoingSearch();
  
  // 调试：显示书签统计
  chrome.runtime.sendMessage({ type: 'GET_BOOKMARK_STATS' }, (stats) => {
    if (stats) {
      console.log('书签统计:', stats);
    }
  });
});

// 清理
window.addEventListener('unload', () => {
  stopPolling();
});
