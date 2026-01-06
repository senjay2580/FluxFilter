import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  isSupabaseConfigured, getResources, getResourceFolders,
  createResource, createResources, createResourceFolder,
  deleteResource, deleteResources, deleteResourceFolder
} from '../../lib/supabase';
import { getStoredUserId } from '../../lib/auth';
import type { Resource, ResourceFolder } from '../../lib/database.types';
import { useSwipeBack } from '../../hooks/useSwipeBack';
import AISearchModal from '../shared/AISearchModal';
import type { SearchableItem } from '../../lib/resource-ai-search';

interface ResourceCenterProps { isOpen: boolean; onClose: () => void; }
interface FolderNode extends ResourceFolder { children: FolderNode[]; }

// 卡片样式配置 - 更多随机性
interface CardStyle {
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  bgType: 'solid' | 'gradient' | 'glass' | 'glow';
  colorScheme: string;
  hasPattern: boolean;
  iconStyle: 'circle' | 'rounded' | 'square';
}

// 基于 ID 生成稳定的随机数
const seededRandom = (seed: number) => {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
};

// 生成卡片样式
const generateCardStyle = (id: number, nameLen: number): CardStyle => {
  const r1 = seededRandom(id);
  const r2 = seededRandom(id + 1);
  const r3 = seededRandom(id + 2);
  const r4 = seededRandom(id + 3);
  const r5 = seededRandom(id + 4);
  
  // 尺寸 - 更多变化
  const sizes: CardStyle['size'][] = ['xs', 'sm', 'sm', 'md', 'md', 'md', 'lg', 'lg', 'xl'];
  let sizeIdx = Math.floor(r1 * sizes.length);
  // 名称长的倾向于大卡片
  if (nameLen > 20) sizeIdx = Math.min(sizeIdx + 2, sizes.length - 1);
  else if (nameLen > 12) sizeIdx = Math.min(sizeIdx + 1, sizes.length - 1);
  
  // 背景类型
  const bgTypes: CardStyle['bgType'][] = ['solid', 'solid', 'gradient', 'gradient', 'glass', 'glow'];
  const bgType = bgTypes[Math.floor(r2 * bgTypes.length)];
  
  // 颜色方案 - 更丰富
  const colorSchemes = [
    'emerald', 'cyan', 'violet', 'amber', 'rose', 'blue', 'indigo', 'pink', 'teal', 'orange', 'lime', 'fuchsia'
  ];
  const colorScheme = colorSchemes[Math.floor(r3 * colorSchemes.length)];
  
  // 是否有图案
  const hasPattern = r4 > 0.7;
  
  // 图标样式
  const iconStyles: CardStyle['iconStyle'][] = ['circle', 'rounded', 'square'];
  const iconStyle = iconStyles[Math.floor(r5 * iconStyles.length)];
  
  return { size: sizes[sizeIdx], bgType, colorScheme, hasPattern, iconStyle };
};

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

  // 左滑返回手势
  const swipeHandlers = useSwipeBack({ onBack: onClose });

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
  // AI搜索弹窗
  const [showAISearch, setShowAISearch] = useState(false);

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
    try {
      await deleteResource(id);
      // 重新加载数据确保缓存一致性
      await loadData();
      showToast('已删除');
    } catch (e) {
      console.error('删除资源失败:', e);
      showToast('删除失败');
    }
    setDeleteConfirmId(null);
  };

  const handleBatchDelete = async () => {
    if (!selectedIds.size) return;
    const count = selectedIds.size;
    try {
      await deleteResources([...selectedIds]);
      // 重新加载数据确保缓存一致性
      await loadData();
      showToast(`已删除 ${count} 项`);
    } catch (e) {
      console.error('删除资源失败:', e);
      showToast('删除失败');
    }
    setSelectMode(false);
    setSelectedIds(new Set());
  };

  const handleBatchDeleteFolders = async () => {
    if (!selectedFolderIds.size) return;
    const count = selectedFolderIds.size;
    try {
      // 获取所有要删除的文件夹ID（包括子文件夹）
      const allFolderIdsToDelete = new Set<number>();
      const collectChildFolders = (folderId: number) => {
        allFolderIdsToDelete.add(folderId);
        folders.filter(f => f.parent_id === folderId).forEach(child => collectChildFolders(child.id));
      };
      selectedFolderIds.forEach(id => collectChildFolders(id));

      // 删除所有文件夹（从子到父的顺序）
      const sortedIds = [...allFolderIdsToDelete].sort((a, b) => {
        const depthA = folders.filter(f => f.id === a)[0]?.parent_id ? 1 : 0;
        const depthB = folders.filter(f => f.id === b)[0]?.parent_id ? 1 : 0;
        return depthB - depthA;
      });

      for (const id of sortedIds) {
        await deleteResourceFolder(id);
      }

      // 重新加载数据确保缓存一致性
      await loadData();
      // 重置选中的文件夹
      if (selectedFolderId && allFolderIdsToDelete.has(selectedFolderId)) {
        setSelectedFolderId(null);
      }
      showToast(`已删除 ${count} 个文件夹`);
    } catch (e) {
      console.error('删除文件夹失败:', e);
      showToast('删除失败');
      // 即使失败也重新加载以恢复正确状态
      await loadData();
    }
    setFolderSelectMode(false);
    setSelectedFolderIds(new Set());
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

  // 构建AI搜索数据
  const aiSearchItems: SearchableItem[] = useMemo(() => {
    return resources.map(r => {
      const folder = folders.find(f => f.id === r.folder_id);
      return {
        id: r.id,
        name: r.name,
        url: r.url,
        folder: folder?.name,
      };
    });
  }, [resources, folders]);

  const filteredResources = resources.filter(r => {
    let matchFolder = true;
    if (selectedFolderId !== null) {
      const allFolderIds = getAllChildFolderIds(selectedFolderId);
      matchFolder = r.folder_id !== null && allFolderIds.includes(r.folder_id);
    }
    const matchSearch = !searchTerm || r.name.toLowerCase().includes(searchTerm.toLowerCase());
    return matchFolder && matchSearch;
  });

  // 虚拟滚动相关
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const [containerWidth, setContainerWidth] = useState(0);
  
  // 计算列数
  const columnCount = useMemo((): number => {
    if (containerWidth < 400) return 2;
    if (containerWidth < 640) return 2;
    if (containerWidth < 900) return 3;
    return 4;
  }, [containerWidth]);
  
  // 卡片尺寸映射
  const getSizeHeight = (size: CardStyle['size']): number => {
    switch (size) {
      case 'xs': return 100;
      case 'sm': return 130;
      case 'md': return 160;
      case 'lg': return 200;
      case 'xl': return 240;
    }
  };
  
  // 计算瀑布流布局
  const layoutData = useMemo(() => {
    if (!containerWidth || !columnCount) return { items: [], totalHeight: 0 };
    
    const gap = 16;
    const columnWidth = (containerWidth - gap * (columnCount - 1)) / columnCount;
    const columnHeights = new Array(columnCount).fill(0);
    
    const items = filteredResources.map((r, i) => {
      const style = generateCardStyle(r.id, r.name.length);
      const height = getSizeHeight(style.size);
      
      // 找最短的列
      const minHeight = Math.min(...columnHeights);
      const columnIndex = columnHeights.indexOf(minHeight);
      
      const x = columnIndex * (columnWidth + gap);
      const y = columnHeights[columnIndex];
      
      columnHeights[columnIndex] = y + height + gap;
      
      return {
        resource: r,
        style,
        x,
        y,
        width: columnWidth,
        height,
        index: i
      };
    });
    
    return {
      items,
      totalHeight: Math.max(...columnHeights)
    };
  }, [filteredResources, containerWidth, columnCount]);
  
  // 虚拟滚动 - 只渲染可见区域的卡片
  const visibleItems = useMemo(() => {
    const buffer = 200; // 缓冲区
    const viewTop = scrollTop - buffer;
    const viewBottom = scrollTop + containerHeight + buffer;
    
    return layoutData.items.filter(item => {
      const itemBottom = item.y + item.height;
      return itemBottom >= viewTop && item.y <= viewBottom;
    });
  }, [layoutData.items, scrollTop, containerHeight]);
  
  // 监听滚动和容器尺寸
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    
    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };
    
    const updateSize = () => {
      setContainerHeight(container.clientHeight);
      setContainerWidth(container.clientWidth - 32); // 减去 padding
    };
    
    updateSize();
    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateSize);
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateSize);
    };
  }, [isOpen]);
  
  // 获取卡片背景样式
  const getCardBgClass = (style: CardStyle, isSelected: boolean) => {
    if (isSelected) return 'border-cyber-lime bg-cyber-lime/20 shadow-[0_0_20px_rgba(186,255,41,0.2)]';
    
    const colorMap: Record<string, { gradient: string; solid: string; glass: string; glow: string }> = {
      emerald: {
        gradient: 'bg-gradient-to-br from-emerald-500/25 to-emerald-700/10',
        solid: 'bg-emerald-900/40',
        glass: 'bg-emerald-500/10 backdrop-blur-sm',
        glow: 'bg-emerald-950/60 shadow-[inset_0_0_20px_rgba(16,185,129,0.15)]'
      },
      cyan: {
        gradient: 'bg-gradient-to-br from-cyan-500/25 to-cyan-700/10',
        solid: 'bg-cyan-900/40',
        glass: 'bg-cyan-500/10 backdrop-blur-sm',
        glow: 'bg-cyan-950/60 shadow-[inset_0_0_20px_rgba(6,182,212,0.15)]'
      },
      violet: {
        gradient: 'bg-gradient-to-br from-violet-500/25 to-violet-700/10',
        solid: 'bg-violet-900/40',
        glass: 'bg-violet-500/10 backdrop-blur-sm',
        glow: 'bg-violet-950/60 shadow-[inset_0_0_20px_rgba(139,92,246,0.15)]'
      },
      amber: {
        gradient: 'bg-gradient-to-br from-amber-500/25 to-amber-700/10',
        solid: 'bg-amber-900/40',
        glass: 'bg-amber-500/10 backdrop-blur-sm',
        glow: 'bg-amber-950/60 shadow-[inset_0_0_20px_rgba(245,158,11,0.15)]'
      },
      rose: {
        gradient: 'bg-gradient-to-br from-rose-500/25 to-rose-700/10',
        solid: 'bg-rose-900/40',
        glass: 'bg-rose-500/10 backdrop-blur-sm',
        glow: 'bg-rose-950/60 shadow-[inset_0_0_20px_rgba(244,63,94,0.15)]'
      },
      blue: {
        gradient: 'bg-gradient-to-br from-blue-500/25 to-blue-700/10',
        solid: 'bg-blue-900/40',
        glass: 'bg-blue-500/10 backdrop-blur-sm',
        glow: 'bg-blue-950/60 shadow-[inset_0_0_20px_rgba(59,130,246,0.15)]'
      },
      indigo: {
        gradient: 'bg-gradient-to-br from-indigo-500/25 to-indigo-700/10',
        solid: 'bg-indigo-900/40',
        glass: 'bg-indigo-500/10 backdrop-blur-sm',
        glow: 'bg-indigo-950/60 shadow-[inset_0_0_20px_rgba(99,102,241,0.15)]'
      },
      pink: {
        gradient: 'bg-gradient-to-br from-pink-500/25 to-pink-700/10',
        solid: 'bg-pink-900/40',
        glass: 'bg-pink-500/10 backdrop-blur-sm',
        glow: 'bg-pink-950/60 shadow-[inset_0_0_20px_rgba(236,72,153,0.15)]'
      },
      teal: {
        gradient: 'bg-gradient-to-br from-teal-500/25 to-teal-700/10',
        solid: 'bg-teal-900/40',
        glass: 'bg-teal-500/10 backdrop-blur-sm',
        glow: 'bg-teal-950/60 shadow-[inset_0_0_20px_rgba(20,184,166,0.15)]'
      },
      orange: {
        gradient: 'bg-gradient-to-br from-orange-500/25 to-orange-700/10',
        solid: 'bg-orange-900/40',
        glass: 'bg-orange-500/10 backdrop-blur-sm',
        glow: 'bg-orange-950/60 shadow-[inset_0_0_20px_rgba(249,115,22,0.15)]'
      },
      lime: {
        gradient: 'bg-gradient-to-br from-lime-500/25 to-lime-700/10',
        solid: 'bg-lime-900/40',
        glass: 'bg-lime-500/10 backdrop-blur-sm',
        glow: 'bg-lime-950/60 shadow-[inset_0_0_20px_rgba(132,204,22,0.15)]'
      },
      fuchsia: {
        gradient: 'bg-gradient-to-br from-fuchsia-500/25 to-fuchsia-700/10',
        solid: 'bg-fuchsia-900/40',
        glass: 'bg-fuchsia-500/10 backdrop-blur-sm',
        glow: 'bg-fuchsia-950/60 shadow-[inset_0_0_20px_rgba(217,70,239,0.15)]'
      }
    };
    
    const colors = colorMap[style.colorScheme] || colorMap.emerald;
    return colors[style.bgType];
  };
  
  // 获取图标容器样式
  const getIconContainerClass = (style: CardStyle) => {
    const base = 'flex items-center justify-center bg-white/10';
    switch (style.iconStyle) {
      case 'circle': return `${base} rounded-full`;
      case 'rounded': return `${base} rounded-xl`;
      case 'square': return `${base} rounded-md`;
    }
  };
  
  // 获取图标尺寸
  const getIconSize = (size: CardStyle['size']) => {
    switch (size) {
      case 'xs': return { container: 'w-8 h-8', icon: 'w-4 h-4', text: 'text-sm' };
      case 'sm': return { container: 'w-10 h-10', icon: 'w-5 h-5', text: 'text-base' };
      case 'md': return { container: 'w-12 h-12', icon: 'w-6 h-6', text: 'text-lg' };
      case 'lg': return { container: 'w-14 h-14', icon: 'w-7 h-7', text: 'text-xl' };
      case 'xl': return { container: 'w-16 h-16', icon: 'w-8 h-8', text: 'text-2xl' };
    }
  };

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
            <path d="M3 7v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-7l-2-2H5a2 2 0 0 0-2 2z" />
          </svg>
        </div>
      );
    } else if (hasChildren) {
      // 有子文件夹 - 带标记的文件夹
      return (
        <div className="w-5 h-5 rounded flex items-center justify-center shrink-0" style={{ background: color.fill }}>
          <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke={color.stroke} strokeWidth="1.5">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
            {isExpanded ? (
              <path d="M9 14h6" strokeWidth="2" />
            ) : (
              <path d="M12 11v6M9 14h6" strokeWidth="2" />
            )}
          </svg>
        </div>
      );
    } else {
      // 叶子文件夹 - 简单文件夹
      return (
        <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke={color.stroke} strokeWidth="1.5">
          <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
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
          className={`flex items-center gap-2 py-2.5 px-2 mx-1 my-0.5 rounded-lg transition-all active:bg-white/10 ${isChecked ? 'bg-cyber-lime/20' : isSelected ? 'bg-white/10' : ''
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
              {isChecked && <svg className="w-3 h-3 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>}
            </div>
          )}
          {node.children.length > 0 ? (
            <svg className={`w-3 h-3 shrink-0 transition-transform text-gray-500 ${isExpanded ? 'rotate-90' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 18l6-6-6-6" /></svg>
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
    <div 
      className="fixed inset-0 z-[99999] flex flex-col bg-[#0a0a0f] animate-page-enter"
      {...swipeHandlers}
    >
      {/* 背景装饰 */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 right-10 w-60 h-60 bg-cyber-lime/5 rounded-full blur-3xl animate-float" />
        <div className="absolute bottom-20 left-10 w-60 h-60 bg-blue-500/5 rounded-full blur-3xl animate-float animation-delay-2000" />
      </div>

      {/* 移动端文件夹抽屉遮罩 */}
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/60 z-10 sm:hidden animate-fade-in" onClick={() => setSidebarOpen(false)} />
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
            <svg className="w-5 h-5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
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
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 12h18M3 6h18M3 18h18" /></svg>
            </button>
            <button onClick={onClose} className="p-2 -ml-1 sm:ml-0 rounded-xl active:bg-white/10">
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
            </button>
            <div className="flex-1 relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
              <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="搜索..." className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50" />
            </div>
            {/* AI搜索按钮 */}
            <button 
              onClick={() => setShowAISearch(true)} 
              className="p-2.5 rounded-xl bg-gradient-to-r from-cyber-lime/20 to-emerald-500/20 border border-cyber-lime/30 active:scale-95 transition-transform"
              title="AI智能搜索"
            >
              <svg className="w-4 h-4 text-cyber-lime" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.35-4.35" />
                <path d="M11 8v6M8 11h6" />
              </svg>
            </button>
            {selectMode ? (
              <>
                <button onClick={selectAll} className="px-3 py-2 text-xs text-cyber-lime active:bg-cyber-lime/10 rounded-lg">全选</button>
                <button onClick={handleBatchDelete} className="px-3 py-2 text-xs text-red-400 active:bg-red-500/10 rounded-lg">删除({selectedIds.size})</button>
                <button onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }} className="px-3 py-2 text-xs text-gray-400 rounded-lg">取消</button>
              </>
            ) : (
              <>
                <button onClick={handleExport} className="hidden sm:block p-2.5 rounded-xl bg-white/5 border border-white/10 active:bg-white/10"><svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg></button>
                <button onClick={() => setShowImportModal(true)} className="p-2.5 rounded-xl bg-white/5 border border-white/10 active:bg-white/10"><svg className="w-4 h-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg></button>
                <button onClick={() => setShowAddModal(true)} className="p-2.5 rounded-xl bg-cyber-lime text-black active:bg-cyber-lime/80"><svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg></button>
              </>
            )}
          </div>
        </div>

        {/* 资源列表 - 虚拟滚动瀑布流 */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4">
          {loading || importing ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-10 h-10 border-2 border-cyber-lime border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-gray-400 text-sm">{importing ? '正在导入...' : '加载中...'}</p>
            </div>
          ) : filteredResources.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center mb-3">
                <svg className="w-7 h-7 text-gray-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 8v13H3V8" /><path d="M1 3h22v5H1z" /><path d="M10 12h4" /></svg>
              </div>
              <p className="text-gray-500 text-sm">暂无资源</p>
            </div>
          ) : (
            <div className="relative" style={{ height: layoutData.totalHeight }}>
              {visibleItems.map(({ resource: r, style, x, y, width, height, index }) => {
                const iconSize = getIconSize(style.size);
                const isSelected = selectMode && selectedIds.has(r.id);
                
                return (
                  <div
                    key={r.id}
                    className="absolute transition-transform duration-200"
                    style={{
                      transform: `translate(${x}px, ${y}px)`,
                      width,
                      height,
                    }}
                  >
                    <button
                      className={`relative w-full h-full text-left cursor-pointer rounded-2xl border border-white/10 transition-all duration-300 hover:[transform:translateY(-3px)] hover:shadow-xl active:scale-[0.98] overflow-hidden ${getCardBgClass(style, isSelected)}`}
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
                      {/* 装饰图案 */}
                      {style.hasPattern && (
                        <div className="absolute inset-0 opacity-10 pointer-events-none">
                          <div className="absolute -top-4 -right-4 w-24 h-24 border border-white/20 rounded-full" />
                          <div className="absolute -bottom-6 -left-6 w-32 h-32 border border-white/10 rounded-full" />
                        </div>
                      )}
                      
                      {/* 选择模式复选框 */}
                      {selectMode && (
                        <div className={`absolute top-3 right-3 w-5 h-5 rounded-full border-2 flex items-center justify-center z-10 ${isSelected ? 'bg-cyber-lime border-cyber-lime' : 'border-gray-500 bg-black/50'}`}>
                          {isSelected && <svg className="w-3 h-3 text-black" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4"><polyline points="20 6 9 17 4 12" /></svg>}
                        </div>
                      )}
                      
                      {/* 内容区 */}
                      <div className={`relative z-10 h-full flex flex-col ${style.size === 'xs' ? 'p-3' : style.size === 'sm' ? 'p-3.5' : 'p-4'}`}>
                        {/* 图标 */}
                        <div className={`${iconSize.container} ${getIconContainerClass(style)} mb-auto`}>
                          {r.icon ? (
                            <img src={r.icon} alt="" className={iconSize.icon} onError={e => (e.target as HTMLImageElement).style.display = 'none'} />
                          ) : (
                            <span className={`font-bold text-cyber-lime ${iconSize.text}`}>{r.name[0]?.toUpperCase()}</span>
                          )}
                        </div>
                        
                        {/* 名称和域名 */}
                        <div className="mt-auto">
                          <p className={`text-white font-medium leading-snug ${style.size === 'xs' ? 'text-xs line-clamp-1' : style.size === 'sm' ? 'text-sm line-clamp-2' : 'text-base line-clamp-2'} mb-1`}>{r.name}</p>
                          <p className={`text-gray-500 truncate ${style.size === 'xs' ? 'text-[10px]' : 'text-xs'}`}>
                            {(() => { try { return new URL(r.url).hostname.replace('www.', ''); } catch { return r.url; } })()}
                          </p>
                        </div>
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>


      {/* AI搜索弹窗 */}
      <AISearchModal 
        isOpen={showAISearch} 
        onClose={() => setShowAISearch(false)} 
        items={aiSearchItems} 
      />

      {/* Toast */}
      {toast && <div className="fixed bottom-24 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/90 border border-white/20 rounded-full text-white text-sm z-[999999]">{toast}</div>}

      {/* 添加弹窗 */}
      {showAddModal && (
        <div className="fixed inset-0 z-[999999] flex items-end sm:items-center justify-center" onClick={() => setShowAddModal(false)}>
          <div className="absolute inset-0 bg-black/80" />
          <div className="relative bg-[#1a1a1f] rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-sm border-t sm:border border-white/10 safe-area-bottom" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowAddModal(false)} className="absolute top-3 right-3 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
            <h3 className="text-white text-lg font-bold mb-4">添加资源</h3>
            <div className="space-y-3">
              <input value={newResource.name} onChange={e => setNewResource({ ...newResource, name: e.target.value })} placeholder="名称" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50" />
              <input value={newResource.url} onChange={e => setNewResource({ ...newResource, url: e.target.value })} placeholder="链接" className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 focus:outline-none focus:border-cyber-lime/50" />
              <button onClick={handleAddResource} className="w-full py-3 bg-cyber-lime text-black font-medium rounded-xl active:bg-cyber-lime/80">添加</button>
            </div>
          </div>
        </div>
      )}

      {/* 导入弹窗 */}
      {showImportModal && (
        <div className="fixed inset-0 z-[999999] flex items-end sm:items-center justify-center" onClick={() => setShowImportModal(false)}>
          <div className="absolute inset-0 bg-black/80" />
          <div className="relative bg-[#1a1a1f] rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-sm border-t sm:border border-white/10 safe-area-bottom" onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowImportModal(false)} className="absolute top-3 right-3 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
            <h3 className="text-white text-lg font-bold mb-4">导入书签</h3>
            <input ref={fileInputRef} type="file" accept=".json,.html" onChange={handleFileImport} className="hidden" />
            <button onClick={() => fileInputRef.current?.click()} className="w-full py-8 bg-white/5 border border-dashed border-white/20 rounded-xl text-gray-400 active:bg-white/10">
              <svg className="w-10 h-10 mx-auto mb-2 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
              <p className="text-sm">点击选择文件</p>
              <p className="text-xs text-gray-600 mt-1">支持浏览器书签HTML或JSON</p>
            </button>
          </div>
        </div>
      )}

      {/* 删除确认 */}
      {deleteConfirmId && (
        <div className="fixed inset-0 z-[999999] flex items-center justify-center p-6" onClick={() => setDeleteConfirmId(null)}>
          <div className="absolute inset-0 bg-black/80" />
          <div className="relative bg-[#1a1a1f] rounded-2xl p-5 max-w-xs w-full border border-white/10" onClick={e => e.stopPropagation()}>
            <button onClick={() => setDeleteConfirmId(null)} className="absolute top-3 right-3 w-6 h-6 rounded-full bg-red-500 flex items-center justify-center"><svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M18 6L6 18M6 6l12 12" /></svg></button>
            <h3 className="text-white text-lg font-bold text-center mb-2">删除资源</h3>
            <p className="text-gray-400 text-sm text-center mb-5">确定要删除吗？</p>
            <button onClick={() => handleDelete(deleteConfirmId)} className="w-full py-3 bg-red-500 active:bg-red-600 rounded-xl text-white font-medium">确认删除</button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes page-enter { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes float { 0%, 100% { transform: translateY(0) scale(1); } 50% { transform: translateY(-20px) scale(1.05); } }
        @keyframes slide-in-left { from { opacity: 0; transform: translateX(-20px); } to { opacity: 1; transform: translateX(0); } }
        .animate-page-enter { animation: page-enter 0.3s ease-out; }
        .animate-fade-in { animation: fade-in 0.2s ease-out; }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-slide-in-left { animation: slide-in-left 0.3s ease-out; }
        .animation-delay-2000 { animation-delay: 2s; }
      `}</style>
    </div>,
    document.body
  );
};

export default ResourceCenter;
