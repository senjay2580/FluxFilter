import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  isSupabaseConfigured, getResources, getResourceFolders,
  createResource, createResources, createResourceFolder,
  deleteResource, deleteResources, deleteResourceFolder
} from '../lib/supabase';
import { getStoredUserId } from '../lib/auth';
import type { Resource, ResourceFolder } from '../lib/database.types';

interface ResourceCenterProps { isOpen: boolean; onClose: () => void; }
interface FolderNode extends ResourceFolder { children: FolderNode[]; }

const ResourceCenter: React.FC<ResourceCenterProps> = ({ isOpen, onClose }) => {
  const [resources, setResources] = useState<Resource[]>([]);
  const [folders, setFolders] = useState<ResourceFolder[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<number>>(new Set());
  const [searchTerm, setSearchTerm] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [newResource, setNewResource] = useState({ name: '', url: '' });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // 资源多选
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // 文件夹多选
  const [folderSelectMode, setFolderSelectMode] = useState(false);
  const [selectedFolderIds, setSelectedFolderIds] = useState<Set<number>>(new Set());

  const longPressTimer = useRef<NodeJS.Timeout | null>(null);
  const folderLongPressTimer = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 移动端侧边栏状态
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 2000); };

  const loadData = useCallback(async () => {
    const userId = getStoredUserId();
    if (!userId || !isSupabaseConfigured) { setLoading(false); return; }
    try {
      const [f, r] = await Promise.all([getResourceFolders(userId), getResources(userId)]);
      setFolders(f); setResources(r);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { if (isOpen) loadData(); }, [isOpen, loadData]);

  // 构建文件夹树
  const buildFolderTree = useCallback((): FolderNode[] => {
    const map = new Map<number, FolderNode>();
    folders.forEach(f => map.set(f.id, { ...f, children: [] }));
    const roots: FolderNode[] = [];
    folders.forEach(f => {
      const node = map.get(f.id)!;
      if (f.parent_id && map.has(f.parent_id)) map.get(f.parent_id)!.children.push(node);
      else roots.push(node);
    });
    return roots;
  }, [folders]);

  const folderTree = buildFolderTree();
  
  // 递归计算文件夹及其子文件夹中的资源数量
  const countFolderResources = useCallback((folderId: number): number => {
    const getChildFolderIds = (id: number): number[] => {
      const children = folders.filter(f => f.parent_id === id);
      return [id, ...children.flatMap(c => getChildFolderIds(c.id))];
    };
    const allIds = getChildFolderIds(folderId);
    return resources.filter(r => r.folder_id && allIds.includes(r.folder_id)).length;
  }, [folders, resources]);

  const getFavicon = (url: string) => {
    try { return `https://www.google.com/s2/favicons?domain=${new URL(url).hostname}&sz=64`; }
    catch { return ''; }
  };

  // 解析书签HTML - 支持无限层级，跳过根文件夹（如"收藏夹栏"）
  const parseBookmarkHTML = async (html: string) => {
    const userId = getStoredUserId();
    if (!userId) return;
    setImporting(true); setShowImportModal(false);

    try {
      const doc = new DOMParser().parseFromString(html, 'text/html');
      interface TempFolder { tempId: string; name: string; parentTempId: string | null; depth: number; }
      interface TempResource { name: string; url: string; folderTempId: string | null; }
      const allFolders: TempFolder[] = [];
      const allResources: TempResource[] = [];
      let counter = 0;

      // 递归解析书签结构
      const parseNode = (element: Element, parentTempId: string | null, depth: number) => {
        const children = element.children;
        for (let i = 0; i < children.length; i++) {
          const child = children[i];
          
          if (child.tagName === 'DT') {
            const h3 = child.querySelector(':scope > H3');
            const anchor = child.querySelector(':scope > A');
            const subDl = child.querySelector(':scope > DL');
            
            if (h3) {
              const tempId = `folder_${counter++}`;
              const folderName = h3.textContent?.trim() || '未命名文件夹';
              allFolders.push({ tempId, name: folderName, parentTempId, depth });
              if (subDl) parseNode(subDl, tempId, depth + 1);
            } else if (anchor) {
              const url = anchor.getAttribute('href');
              const name = anchor.textContent?.trim();
              if (url && url.startsWith('http') && name) {
                allResources.push({ name, url, folderTempId: parentTempId });
              }
            }
          } else if (child.tagName === 'DL') {
            parseNode(child, parentTempId, depth);
          }
        }
      };

      // 找到根DL，然后找到第一个文件夹（通常是"收藏夹栏"），跳过它直接解析其子内容
      const rootDL = doc.querySelector('DL');
      if (rootDL) {
        // 查找第一个DT > H3（根文件夹如"收藏夹栏"）
        const firstDT = rootDL.querySelector(':scope > DT');
        const firstH3 = firstDT?.querySelector(':scope > H3');
        const firstSubDL = firstDT?.querySelector(':scope > DL');
        
        if (firstH3 && firstSubDL) {
          // 跳过根文件夹，直接解析其子内容
          console.log(`跳过根文件夹: ${firstH3.textContent?.trim()}`);
          parseNode(firstSubDL, null, 0);
        } else {
          // 没有根文件夹包装，直接解析
          parseNode(rootDL, null, 0);
        }
      }

      console.log('解析结果:', { folders: allFolders, resources: allResources });

      // 按深度排序，确保父文件夹先创建
      allFolders.sort((a, b) => a.depth - b.depth);

      // 创建文件夹映射
      const createdFolderMap = new Map<string, number>();
      
      for (const folder of allFolders) {
        const parentDbId = folder.parentTempId ? createdFolderMap.get(folder.parentTempId) ?? null : null;
        try {
          const created = await createResourceFolder(userId, { 
            name: folder.name, 
            parent_id: parentDbId 
          });
          createdFolderMap.set(folder.tempId, created.id);
          console.log(`创建文件夹: ${folder.name}, parent_id: ${parentDbId}, id: ${created.id}`);
        } catch (err) {
          console.error('创建文件夹失败:', folder.name, err);
        }
      }

      // 批量创建资源
      if (allResources.length > 0) {
        const resourcesData = allResources.map(r => ({
          name: r.name, 
          url: r.url, 
          icon: getFavicon(r.url),
          folder_id: r.folderTempId ? createdFolderMap.get(r.folderTempId) ?? null : null,
        }));
        await createResources(userId, resourcesData);
        console.log('创建资源:', resourcesData.map(r => ({ name: r.name, folder_id: r.folder_id })));
      }

      await loadData();
      showToast(`导入 ${allFolders.length} 个文件夹，${allResources.length} 个书签`);
    } catch (e) { 
      console.error('导入失败:', e); 
      showToast('导入失败'); 
    }
    setImporting(false);
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const content = ev.target?.result as string;
      if (file.name.endsWith('.html')) await parseBookmarkHTML(content);
      else if (file.name.endsWith('.json')) {
        setImporting(true); setShowImportModal(false);
        try {
          const data = JSON.parse(content);
          const userId = getStoredUserId();
          if (userId && Array.isArray(data)) {
            const items = data.filter((r: any) => r.name && r.url).map((r: any) => ({ name: r.name, url: r.url, icon: getFavicon(r.url) }));
            if (items.length) { await createResources(userId, items); await loadData(); showToast(`导入 ${items.length} 个资源`); }
          }
        } catch { showToast('JSON格式错误'); }
        setImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleAddResource = async () => {
    if (!newResource.name.trim() || !newResource.url.trim()) return;
    const userId = getStoredUserId();
    if (!userId) { showToast('请先登录'); return; }
    try {
      const url = newResource.url.trim().startsWith('http') ? newResource.url.trim() : `https://${newResource.url.trim()}`;
      await createResource(userId, { name: newResource.name.trim(), url, icon: getFavicon(url), folder_id: selectedFolderId });
      await loadData();
      setNewResource({ name: '', url: '' }); setShowAddModal(false); showToast('添加成功');
    } catch { showToast('添加失败'); }
  };

  const handleDelete = async (id: number) => {
    try { await deleteResource(id); setResources(p => p.filter(r => r.id !== id)); showToast('已删除'); }
    catch { showToast('删除失败'); }
    setDeleteConfirmId(null);
  };

  const handleBatchDelete = async () => {
    if (!selectedIds.size) return;
    try { await deleteResources([...selectedIds]); setResources(p => p.filter(r => !selectedIds.has(r.id))); showToast(`已删除 ${selectedIds.size} 项`); }
    catch { showToast('删除失败'); }
    setSelectMode(false); setSelectedIds(new Set());
  };

  const handleBatchDeleteFolders = async () => {
    if (!selectedFolderIds.size) return;
    try {
      for (const id of selectedFolderIds) await deleteResourceFolder(id);
      setFolders(p => p.filter(f => !selectedFolderIds.has(f.id)));
      setResources(p => p.filter(r => !selectedFolderIds.has(r.folder_id || -1)));
      showToast(`已删除 ${selectedFolderIds.size} 个文件夹`);
    } catch { showToast('删除失败'); }
    setFolderSelectMode(false); setSelectedFolderIds(new Set());
  };

  const handleExport = () => {
    const data = resources.map(r => ({ name: r.name, url: r.url, folder_id: r.folder_id }));
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `resources-${new Date().toISOString().split('T')[0]}.json`; a.click();
    showToast('导出成功');
  };

  // 资源长按
  const resourceLongPressTriggered = useRef(false);
  const startLongPress = (id: number) => { 
    resourceLongPressTriggered.current = false;
    longPressTimer.current = setTimeout(() => { 
      resourceLongPressTriggered.current = true;
      setSelectMode(true); 
      setSelectedIds(new Set([id])); 
    }, 500); 
  };
  const endLongPress = () => { 
    if (longPressTimer.current) { 
      clearTimeout(longPressTimer.current); 
      longPressTimer.current = null; 
    } 
  };
  const cancelLongPress = () => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  };
  const toggleSelect = (id: number) => setSelectedIds(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAll = () => setSelectedIds(new Set(filteredResources.map(r => r.id)));

  // 文件夹长按
  const toggleFolderSelect = (id: number) => setSelectedFolderIds(p => { const s = new Set(p); s.has(id) ? s.delete(id) : s.add(id); return s; });
  const selectAllFolders = () => setSelectedFolderIds(new Set(folders.map(f => f.id)));

  // 获取文件夹及其所有子文件夹的ID
  const getAllChildFolderIds = useCallback((folderId: number): number[] => {
    const children = folders.filter(f => f.parent_id === folderId);
    return [folderId, ...children.flatMap(c => getAllChildFolderIds(c.id))];
  }, [folders]);

  const filteredResources = resources.filter(r => {
    let matchFolder = true;
    if (selectedFolderId !== null) {
      const allFolderIds = getAllChildFolderIds(selectedFolderId);
      matchFolder = r.folder_id !== null && allFolderIds.includes(r.folder_id);
    }
    const matchSearch = !searchTerm || r.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchFolder && matchSearch;
  });

  // 文件夹长按标记
  const folderLongPressTriggered = useRef(false);

  // 根据层级获取文件夹图标样式
  const getFolderIcon = (depth: number, hasChildren: boolean, isExpanded: boolean) => {
    // 不同层级的颜色配置
    const colors = [
      { stroke: '#a3e635', fill: 'rgba(163, 230, 53, 0.15)' },  // 第0层: cyber-lime
      { stroke: '#60a5fa', fill: 'rgba(96, 165, 250, 0.15)' },  // 第1层: blue
      { stroke: '#f472b6', fill: 'rgba(244, 114, 182, 0.15)' }, // 第2层: pink
      { stroke: '#fbbf24', fill: 'rgba(251, 191, 36, 0.15)' },  // 第3层: amber
      { stroke: '#a78bfa', fill: 'rgba(167, 139, 250, 0.15)' }, // 第4层: violet
    ];
    const color = colors[depth % colors.length];
    
    if (depth === 0) {
      // 根文件夹 - 大文件夹图标
      return (
        <div className="w-6 h-6 rounded-md flex items-center justify-center shrink-0" style={{ background: color.fill }}>
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill={color.fill} stroke={color.stroke} strokeWidth="1.5">
            <path d="M3 7v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z"/>
          </svg>
        </div>
      );
    } else if (hasChildren) {
      // 有子文件夹 - 带标记的文件夹
      return (
        <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ background: color.fill }}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={color.stroke} strokeWidth="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            {isExpanded ? (
              <path d="M9 14h6" strokeWidth="2"/>
            ) : (
              <path d="M12 11v6M9 14h6" strokeWidth="2"/>
            )}
          </svg>
        </div>
      );
    } else {
      // 叶子文件夹 - 简单文件夹
      return (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke={color.stroke} strokeWidth="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
        </svg>
      );
    }
  };

  // 渲染文件夹树
  const renderFolderTree = (nodes: FolderNode[], depth = 0): React.ReactNode => nodes.map(node => {
    const isExpanded = expandedFolders.has(node.id);
    const isSelected = selectedFolderId === node.id;
    const isChecked = folderSelectMode && selectedFolderIds.has(node.id);
    
    return (
      <div key={node.id}>
        <div
          className={`flex items-center gap-2 py-2.5 px-2 mx-1 my-0.5 rounded-lg transition-all active:bg-white/10 ${
            isChecked ? 'bg-cyber-lime/20' : isSelected ? 'bg-white/10' : ''
          }`}
          style={{ paddingLeft: `${8 + depth * 14}px` }}
          onTouchStart={() => {
            folderLongPressTriggered.current = false;
            folderLongPressTimer.current = setTimeout(() => {
              folderLongPressTriggered.current = true;
              setFolderSelectMode(true);
              setSelectedFolderIds(new Set([node.id]));
            }, 500);
          }}
          onTouchEnd={() => {
            if (folderLongPressTimer.current) {
              clearTimeout(folderLongPressTimer.current);
              folderLongPressTimer.current = null;
            }
          }}
          onTouchMove={() => {
            if (folderLongPressTimer.current) {
              clearTimeout(folderLongPressTimer.current);
              folderLongPressTimer.current = null;
            }
          }}
          onClick={() => {
            if (folderLongPressTriggered.current) {
              folderLongPressTriggered.current = false;
              return;
            }
            if (folderSelectMode) { toggleFolderSelect(node.id); return; }
            if (node.children.length > 0) {
              setExpandedFolders(p => { 
                const s = new Set(p); 
                s.has(node.id) ? s.delete(node.id) : s.add(node.id); 
                return s; 
              });
            }
            setSelectedFolderId(node.id);
            if (node.children.length === 0 && window.innerWidth < 640) {
              setSidebarOpen(false);
            }
          }}
        >
          {folderSelectMode && (
            <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${isChecked ? 'bg-cyber-lime border-cyber-lime' : 'border-gray-500'}`}>
              {isChecked && <svg className="w-3 h-3 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12"/></svg>}
            </div>
          )}
          {node.children.length > 0 ? (
            <svg className={`w-3 h-3 shrink-0 transition-transform text-gray-500 ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6"/></svg>
          ) : <div className="w-3" />}
          {getFolderIcon(depth, node.children.length > 0, isExpanded)}
          <span className={`text-sm truncate flex-1 ${isSelected ? 'text-white font-medium' : 'text-gray-400'}`}>{node.name}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${isSelected ? 'bg-cyber-lime/20 text-cyber-lime' : 'text-gray-600'}`}>
            {countFolderResources(node.id)}
          </span>
        </div>
        {isExpanded && node.children.length > 0 && renderFolderTree(node.children, depth + 1)}
      </div>
    );
  });

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[99999] flex flex-col bg-[#0a0a0f]">
      {/* 移动端文件夹抽屉遮罩 */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-10 sm:hidden" onClick={() => setSidebarOpen(false)} />
      )}
      
      {/* 左侧文件夹侧边栏 */}
      <div className={`
        fixed inset-y-0 left-0 z-20
        w-64 sm:w-44 bg-[#0d0d12] border-r border-white/10
        transform transition-transform duration-300 ease-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full sm:translate-x-0'}
        flex flex-col
      `}>
        {/* 文件夹头部 */}
        <div className="p-3 border-b border-white/10 flex items-center justify-between">
          <span className="text-white text-sm font-medium">文件夹</span>
          <button onClick={() => setSidebarOpen(false)} className="sm:hidden p-1 rounded-lg active:bg-white/10">
            <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
        
        {/* 文件夹操作栏 */}
        {folderSelectMode && (
          <div className="flex items-center gap-2 p-2 border-b border-white/10 bg-black/50">
            <button onClick={selectAllFolders} className="text-xs text-cyber-lime px-2 py-1.5 rounded-lg active:bg-cyber-lime/10">全选</button>
            <button onClick={handleBatchDeleteFolders} className="text-xs text-red-400 px-2 py-1.5 rounded-lg active:bg-red-500/10">删除({selectedFolderIds.size})</button>
            <button onClick={() => { setFolderSelectMode(false); setSelectedFolderIds(new Set()); }} className="text-xs text-gray-400 px-2 py-1.5 rounded-lg">取消</button>
          </div>
        )}
        
        {/* 文件夹列表 */}
        <div className="flex-1 overflow-y-auto py-1">
          {renderFolderTree(folderTree)}
        </div>
      </div>

      {/* 主内容区 */}
      <div className="flex-1 flex flex-col min-h-0 sm:ml-44">
        {/* 顶部栏 */}
        <div className="sticky top-0 z-10 bg-black/80 backdrop-blur-xl border-b border-white/10 p-3">
          <div className="flex items-center gap-2">
            {/* 移动端菜单按钮 */}
            <button onClick={() => setSidebarOpen(true)} className="sm:hidden p-2 -ml-1 rounded-xl active:bg-white/10">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
            </button>
            <button onClick={onClose} className="p-2 -ml-1 sm:ml-0 rounded-xl active:bg-white/10">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
            </button>
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="搜索..." className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50"/>
            </div>
            {selectMode ? (
              <>
                <button onClick={selectAll} className="px-3 py-2 text-xs text-cyber-lime active:bg-cyber-lime/10 rounded-lg">全选</button>
                <button onClick={handleBatchDelete} className="px-3 py-2 text-xs text-red-400 active:bg-red-500/10 rounded-lg">删除({selectedIds.size})</button>
                <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }} className="px-3 py-2 text-xs text-gray-400 rounded-lg">取消</button>
              </>
            ) : (
              <>
                <button onClick={handleExport} className="hidden sm:block p-2.5 rounded-xl bg-white/5 border border-white/10 active:bg-white/10"><svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></button>
                <button onClick={() => setShowImportModal(true)} className="p-2.5 rounded-xl bg-white/5 border border-white/10 active:bg-white/10"><svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg></button>
                <button onClick={() => setShowAddModal(true)} className="p-2.5 rounded-xl bg-cyber-lime text-black active:bg-cyber-lime/80"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></button>
              </>
            )}
          </div>
        </div>

        {/* 资源列表 */}
        <div className="flex-1 overflow-y-auto p-3">
          {loading || importing ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin mb-3"/>
              <p className="text-gray-400 text-sm">{importing ? '正在导入...' : '加载中...'}</p>
            </div>
          ) : filteredResources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 8v13H3V8"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg>
              </div>
              <p className="text-gray-500 text-sm">暂无资源</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {filteredResources.map((r, i) => (
                <div
                  key={r.id}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all active:scale-[0.98] ${selectMode && selectedIds.has(r.id) ? 'bg-cyber-lime/15 border border-cyber-lime/30' : 'bg-white/[0.03] active:bg-white/[0.08]'}`}
                  style={{ animation: `fadeIn 0.2s ease ${i * 20}ms both` }}
                  onTouchStart={() => startLongPress(r.id)}
                  onTouchEnd={endLongPress}
                  onTouchMove={cancelLongPress}
                  onClick={() => { 
                    if (resourceLongPressTriggered.current) {
                      resourceLongPressTriggered.current = false;
                      return;
                    }
                    if (selectMode) toggleSelect(r.id); 
                    else window.open(r.url, '_blank'); 
                  }}
                >
                  {selectMode && (
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0 ${selectedIds.has(r.id) ? 'bg-cyber-lime border-cyber-lime' : 'border-gray-500'}`}>
                      {selectedIds.has(r.id) && <svg className="w-3 h-3 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12"/></svg>}
                    </div>
                  )}
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-white/10 to-white/5 flex items-center justify-center shrink-0 shadow-lg shadow-black/20">
                    {r.icon ? <img src={r.icon} alt="" className="w-6 h-6" onError={e => (e.target as HTMLImageElement).style.display = 'none'}/> : null}
                    <span className={`text-sm font-bold text-cyber-lime ${r.icon ? 'hidden' : ''}`}>{r.name[0]?.toUpperCase()}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm font-medium truncate">{r.name}</p>
                    <p className="text-gray-500 text-xs truncate">{(() => { try { return new URL(r.url).hostname; } catch { return r.url; } })()}</p>
                  </div>
                  {!selectMode && (
                    <button onClick={e => { e.stopPropagation(); setDeleteConfirmId(r.id); }} className="p-2 rounded-lg active:bg-red-500/20">
                      <svg className="w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      

      {/* Toast */}
      {toast && <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/90 border border-white/20 rounded-full text-white text-sm z-[999999]">{toast}</div>}

      {/* 添加弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 z-[999999] flex items-end sm:items-center justify-center" onClick={() => setShowAddModal(false)}>
          <div className="absolute inset-0 bg-black/80"/>
          <div className="relative bg-[#1a1a1f] rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-sm border-t sm:border border-white/10 safe-area-bottom" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowAddModal(false)} className="absolute top-3 right-3 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            <h3 className="text-white text-lg font-bold mb-4">添加资源</h3>
            <div className="space-y-3">
              <input value={newResource.name} onChange={e => setNewResource({...newResource, name: e.target.value})} placeholder="名称" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50"/>
              <input value={newResource.url} onChange={e => setNewResource({...newResource, url: e.target.value})} placeholder="链接" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50"/>
              <button onClick={handleAddResource} className="w-full py-3 bg-cyber-lime text-black font-medium rounded-xl active:bg-cyber-lime/80">添加</button>
            </div>
          </div>
        </div>
      )}

      {/* 导入弹窗 */}
      {showImportModal && (
        <div className="fixed inset-0 z-[999999] flex items-end sm:items-center justify-center" onClick={() => setShowImportModal(false)}>
          <div className="absolute inset-0 bg-black/80"/>
          <div className="relative bg-[#1a1a1f] rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-sm border-t sm:border border-white/10 safe-area-bottom" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowImportModal(false)} className="absolute top-3 right-3 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            <h3 className="text-white text-lg font-bold mb-4">导入书签</h3>
            <input ref={fileInputRef} type="file" accept=".json,.html" onChange={handleFileImport} className="hidden"/>
            <button onClick={() => fileInputRef.current?.click()} className="w-full py-8 bg-white/5 border border-dashed border-white/20 rounded-xl text-gray-400 active:bg-white/10">
              <svg className="w-10 h-10 mx-auto mb-2 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <p className="text-sm">点击选择文件</p>
              <p className="text-xs text-gray-600 mt-1">支持浏览器书签HTML或JSON</p>
            </button>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-6" onClick={() => setDeleteConfirmId(null)}>
          <div className="absolute inset-0 bg-black/80"/>
          <div className="relative bg-[#1a1a1f] rounded-2xl p-5 max-w-xs w-full border border-white/10" onClick={e => e.stopPropagation()}>
            <button onClick={() => setDeleteConfirmId(null)} className="absolute top-3 right-3 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12"/></svg></button>
            <h3 className="text-white text-lg font-bold text-center mb-2">删除资源</h3>
            <p className="text-gray-400 text-sm text-center mb-5">确定要删除吗？</p>
            <button onClick={() => handleDelete(deleteConfirmId)} className="w-full py-3 bg-red-500 active:bg-red-600 rounded-xl text-white font-medium">确认删除</button>
          </div>
        </div>
      )}

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>,
    document.body
  );
};

export default ResourceCenter;
