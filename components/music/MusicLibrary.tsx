import React, { useState, useEffect, useCallback, useSyncExternalStore } from 'react';
import { musicService } from '../../lib/music-service';
import {
  getMusicList,
  getPlaylists,
  getPlaylistMusic,
  createPlaylist,
  deletePlaylist,
  createMusic,
  deleteMusic,
  addMusicToPlaylist,
  removeMusicFromPlaylist,
  searchMusic,
  uploadMusicFile,
  uploadMusicCover,
} from '../../lib/supabase';
import { getStoredUserId } from '../../lib/auth';
import type { Music, MusicPlaylist } from '../../lib/music-types';

interface MusicLibraryProps {
  onClose: () => void;
  onPlayMusic: (music: Music, playlist: Music[]) => void;
}

type TabType = 'all' | 'playlists' | 'favorites';

const MusicLibrary: React.FC<MusicLibraryProps> = ({ onClose, onPlayMusic }) => {
  const playerState = useSyncExternalStore(
    musicService.subscribe,
    musicService.getState
  );

  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [musicList, setMusicList] = useState<Music[]>([]);
  const [playlists, setPlaylists] = useState<MusicPlaylist[]>([]);
  const [selectedPlaylist, setSelectedPlaylist] = useState<MusicPlaylist | null>(null);
  const [playlistMusic, setPlaylistMusic] = useState<Music[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showPlaylistModal, setShowPlaylistModal] = useState(false);
  const [showAddToPlaylist, setShowAddToPlaylist] = useState<Music | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const userId = getStoredUserId();

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2000);
  }, []);

  // 加载数据
  const loadData = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const [music, lists] = await Promise.all([
        getMusicList(userId),
        getPlaylists(userId),
      ]);
      setMusicList(music);
      setPlaylists(lists);
    } catch (err) {
      console.error('加载音乐数据失败:', err);
      showToast('加载失败');
    } finally {
      setLoading(false);
    }
  }, [userId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 搜索
  const handleSearch = useCallback(async () => {
    if (!userId || !searchTerm.trim()) {
      loadData();
      return;
    }
    setLoading(true);
    try {
      const results = await searchMusic(userId, searchTerm);
      setMusicList(results);
    } catch (err) {
      console.error('搜索失败:', err);
    } finally {
      setLoading(false);
    }
  }, [userId, searchTerm, loadData]);

  useEffect(() => {
    const timer = setTimeout(handleSearch, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  // 加载歌单音乐
  const loadPlaylistMusic = useCallback(async (playlist: MusicPlaylist) => {
    setSelectedPlaylist(playlist);
    setLoading(true);
    try {
      const music = await getPlaylistMusic(playlist.id);
      setPlaylistMusic(music);
    } catch (err) {
      console.error('加载歌单失败:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // 播放音乐
  const handlePlay = (music: Music) => {
    const playlist = selectedPlaylist ? playlistMusic : musicList;
    onPlayMusic(music, playlist);
  };

  // 删除音乐
  const handleDeleteMusic = async (music: Music) => {
    if (!confirm(`确定删除「${music.title}」吗？`)) return;
    try {
      await deleteMusic(music.id);
      setMusicList(prev => prev.filter(m => m.id !== music.id));
      showToast('已删除');
    } catch (err) {
      console.error('删除失败:', err);
      showToast('删除失败');
    }
  };

  // 创建歌单
  const handleCreatePlaylist = async (name: string) => {
    if (!userId || !name.trim()) return;
    try {
      const playlist = await createPlaylist(userId, { name });
      setPlaylists(prev => [...prev, playlist]);
      setShowPlaylistModal(false);
      showToast('歌单已创建');
    } catch (err) {
      console.error('创建歌单失败:', err);
      showToast('创建失败');
    }
  };

  // 删除歌单
  const handleDeletePlaylist = async (playlist: MusicPlaylist) => {
    if (!confirm(`确定删除歌单「${playlist.name}」吗？`)) return;
    try {
      await deletePlaylist(playlist.id);
      setPlaylists(prev => prev.filter(p => p.id !== playlist.id));
      if (selectedPlaylist?.id === playlist.id) {
        setSelectedPlaylist(null);
      }
      showToast('歌单已删除');
    } catch (err) {
      console.error('删除歌单失败:', err);
      showToast('删除失败');
    }
  };

  // 添加到歌单
  const handleAddToPlaylist = async (playlistId: number) => {
    if (!showAddToPlaylist) return;
    try {
      await addMusicToPlaylist(playlistId, showAddToPlaylist.id);
      setShowAddToPlaylist(null);
      showToast('已添加到歌单');
    } catch (err: any) {
      showToast(err.message || '添加失败');
    }
  };

  // 从歌单移除
  const handleRemoveFromPlaylist = async (music: Music) => {
    if (!selectedPlaylist) return;
    try {
      await removeMusicFromPlaylist(selectedPlaylist.id, music.id);
      setPlaylistMusic(prev => prev.filter(m => m.id !== music.id));
      showToast('已从歌单移除');
    } catch (err) {
      console.error('移除失败:', err);
      showToast('移除失败');
    }
  };

  // 过滤显示的音乐
  const displayMusic = activeTab === 'favorites'
    ? musicList.filter(m => m.is_favorite)
    : selectedPlaylist
      ? playlistMusic
      : musicList;

  // 音乐项组件
  const MusicItem = ({ music, inPlaylist = false }: { music: Music; inPlaylist?: boolean }) => {
    const isPlaying = playerState.currentMusic?.id === music.id && playerState.isPlaying;

    return (
      <div
        className={`flex items-center gap-3 p-3 rounded-xl transition-all ${isPlaying ? 'bg-pink-500/20' : 'hover:bg-white/5'
          }`}
      >
        {/* 封面 */}
        <button
          onClick={() => handlePlay(music)}
          className="w-12 h-12 rounded-lg overflow-hidden shrink-0 relative group"
        >
          {music.cover_url ? (
            <img src={music.cover_url} alt={music.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-pink-500/50 to-violet-500/50 flex items-center justify-center">
              <svg className="w-5 h-5 text-white/60" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
              </svg>
            </div>
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
            {isPlaying ? (
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16" rx="1" />
                <rect x="14" y="4" width="4" height="16" rx="1" />
              </svg>
            ) : (
              <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </div>
        </button>

        {/* 信息 */}
        <div className="flex-1 min-w-0" onClick={() => handlePlay(music)}>
          <h4 className={`text-sm font-medium truncate ${isPlaying ? 'text-pink-400' : 'text-white'}`}>
            {music.title}
          </h4>
          <p className="text-gray-500 text-xs truncate">{music.artist || '未知艺术家'}</p>
        </div>

        {/* 时长 */}
        <span className="text-gray-500 text-xs shrink-0">
          {music.duration ? formatTime(music.duration) : '--:--'}
        </span>

        {/* 操作菜单 */}
        <div className="flex items-center gap-1">
          {inPlaylist ? (
            <button
              onClick={() => handleRemoveFromPlaylist(music)}
              className="p-2 text-gray-500 hover:text-red-400 transition-colors"
              title="从歌单移除"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14" />
              </svg>
            </button>
          ) : (
            <>
              <button
                onClick={() => setShowAddToPlaylist(music)}
                className="p-2 text-gray-500 hover:text-white transition-colors"
                title="添加到歌单"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </button>
              <button
                onClick={() => handleDeleteMusic(music)}
                className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                title="删除"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full">
      {/* 顶部 */}
      <div className="px-4 py-3 border-b border-white/10">
        <div className="flex items-center gap-3">
          <button onClick={onClose} className="p-2 -ml-2 rounded-xl hover:bg-white/10 transition-colors">
            <svg className="w-5 h-5 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M19 12H5M12 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-white font-bold text-lg flex-1">
            {selectedPlaylist ? selectedPlaylist.name : '音乐库'}
          </h1>
          <button
            onClick={() => setShowUploadModal(true)}
            className="p-2 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 transition-colors"
          >
            <svg className="w-5 h-5 text-pink-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
          </button>
        </div>

        {/* 搜索框 */}
        {!selectedPlaylist && (
          <div className="mt-3 relative">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="搜索音乐..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-pink-500/50"
            />
          </div>
        )}

        {/* Tab 切换 */}
        {!selectedPlaylist && (
          <div className="flex gap-2 mt-3">
            {(['all', 'playlists', 'favorites'] as TabType[]).map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${activeTab === tab
                  ? 'bg-pink-500 text-white'
                  : 'bg-white/5 text-gray-400 hover:text-white'
                  }`}
              >
                {tab === 'all' ? '全部' : tab === 'playlists' ? '歌单' : '收藏'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 内容区域 */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-40 gap-3">
            {/* 音乐主题加载动画 - 音频波形 */}
            <div className="flex items-end gap-1 h-8">
              <div className="w-1 bg-pink-500 rounded-full animate-music-bar" style={{ animationDelay: '0ms' }} />
              <div className="w-1 bg-pink-400 rounded-full animate-music-bar" style={{ animationDelay: '150ms' }} />
              <div className="w-1 bg-violet-500 rounded-full animate-music-bar" style={{ animationDelay: '300ms' }} />
              <div className="w-1 bg-violet-400 rounded-full animate-music-bar" style={{ animationDelay: '450ms' }} />
              <div className="w-1 bg-pink-500 rounded-full animate-music-bar" style={{ animationDelay: '600ms' }} />
            </div>
            <span className="text-gray-400 text-sm">加载中...</span>
          </div>
        ) : activeTab === 'playlists' && !selectedPlaylist ? (
          // 歌单列表
          <div className="p-4 space-y-3">
            <button
              onClick={() => setShowPlaylistModal(true)}
              className="w-full p-4 rounded-xl border-2 border-dashed border-white/20 hover:border-pink-500/50 transition-colors flex items-center justify-center gap-2 text-gray-400 hover:text-pink-400"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>创建歌单</span>
            </button>

            {playlists.map(playlist => (
              <div
                key={playlist.id}
                className="flex items-center gap-3 p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
              >
                <button
                  onClick={() => loadPlaylistMusic(playlist)}
                  className="flex-1 flex items-center gap-3 text-left"
                >
                  <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-pink-500/50 to-violet-500/50 flex items-center justify-center">
                    <svg className="w-6 h-6 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                    </svg>
                  </div>
                  <div>
                    <h4 className="text-white font-medium">{playlist.name}</h4>
                    <p className="text-gray-500 text-xs">{playlist.description || '暂无描述'}</p>
                  </div>
                </button>
                <button
                  onClick={() => handleDeletePlaylist(playlist)}
                  className="p-2 text-gray-500 hover:text-red-400 transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        ) : (
          // 音乐列表
          <div className="p-4 space-y-1">
            {selectedPlaylist && (
              <button
                onClick={() => setSelectedPlaylist(null)}
                className="flex items-center gap-2 text-gray-400 hover:text-white mb-3 text-sm"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M19 12H5M12 19l-7-7 7-7" />
                </svg>
                返回歌单列表
              </button>
            )}

            {displayMusic.length === 0 ? (
              <div className="text-center py-12 text-gray-500">
                <svg className="w-12 h-12 mx-auto mb-3 opacity-50" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                </svg>
                <p>暂无音乐</p>
                <p className="text-xs mt-1">点击右上角上传音乐</p>
              </div>
            ) : (
              displayMusic.map(music => (
                <MusicItem key={music.id} music={music} inPlaylist={!!selectedPlaylist} />
              ))
            )}
          </div>
        )}
      </div>

      {/* 上传弹窗 */}
      {showUploadModal && (
        <UploadModal
          onClose={() => setShowUploadModal(false)}
          onSuccess={() => {
            setShowUploadModal(false);
            loadData();
            showToast('上传成功');
          }}
        />
      )}

      {/* 创建歌单弹窗 */}
      {showPlaylistModal && (
        <PlaylistModal
          onClose={() => setShowPlaylistModal(false)}
          onSubmit={handleCreatePlaylist}
        />
      )}

      {/* 添加到歌单弹窗 */}
      {showAddToPlaylist && (
        <AddToPlaylistModal
          playlists={playlists}
          onClose={() => setShowAddToPlaylist(null)}
          onSelect={handleAddToPlaylist}
        />
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 px-4 py-2 bg-black/90 border border-white/20 rounded-full text-white text-sm z-50">
          {toast}
        </div>
      )}
    </div>
  );
};

// 上传弹窗组件
const UploadModal: React.FC<{ onClose: () => void; onSuccess: () => void }> = ({ onClose, onSuccess }) => {
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [coverFile, setCoverFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const userId = getStoredUserId();

  const handleSubmit = async () => {
    if (!userId || !audioFile || !title.trim()) return;

    setUploading(true);
    try {
      // 上传音频文件
      const fileUrl = await uploadMusicFile(userId, audioFile);

      // 上传封面（可选）
      let coverUrl: string | undefined;
      if (coverFile) {
        coverUrl = await uploadMusicCover(userId, coverFile);
      }

      // 创建音乐记录
      await createMusic(userId, {
        title: title.trim(),
        artist: artist.trim() || undefined,
        file_url: fileUrl,
        cover_url: coverUrl,
        file_size: audioFile.size,
        file_type: audioFile.type.split('/')[1] || 'mp3',
      });

      onSuccess();
    } catch (err: any) {
      console.error('上传失败:', err);
      // 如果实现已移除，则已在 uploadMusicFile 中 alert 过
      if (err.message !== 'Storage implementation removed') {
        alert('上传进程已中止。');
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-md p-6">
        <h2 className="text-white font-bold text-lg mb-4">上传音乐</h2>

        <div className="space-y-4">
          <div>
            <label className="text-gray-400 text-sm mb-1 block">音乐文件 *</label>
            <input
              type="file"
              accept="audio/*"
              onChange={(e) => setAudioFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-pink-500/20 file:text-pink-400 hover:file:bg-pink-500/30"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-1 block">标题 *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="输入歌曲名称"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500/50"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-1 block">艺术家</label>
            <input
              type="text"
              value={artist}
              onChange={(e) => setArtist(e.target.value)}
              placeholder="输入艺术家名称"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500/50"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm mb-1 block">封面图片</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => setCoverFile(e.target.files?.[0] || null)}
              className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:bg-white/10 file:text-gray-300 hover:file:bg-white/20"
            />
          </div>
        </div>

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 py-2 rounded-xl bg-white/10 text-white hover:bg-white/20 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleSubmit}
            disabled={!audioFile || !title.trim() || uploading}
            className="flex-1 py-2 rounded-xl bg-pink-500 text-white hover:bg-pink-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {uploading ? '上传中...' : '上传'}
          </button>
        </div>
      </div>
    </div>
  );
};

// 创建歌单弹窗
const PlaylistModal: React.FC<{ onClose: () => void; onSubmit: (name: string) => void }> = ({ onClose, onSubmit }) => {
  const [name, setName] = useState('');

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">
      <div className="bg-gray-900 rounded-2xl w-full max-w-sm p-6">
        <h2 className="text-white font-bold text-lg mb-4">创建歌单</h2>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="输入歌单名称"
          className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-white placeholder-gray-500 focus:outline-none focus:border-pink-500/50"
          autoFocus
        />
        <div className="flex gap-3 mt-4">
          <button onClick={onClose} className="flex-1 py-2 rounded-xl bg-white/10 text-white">取消</button>
          <button
            onClick={() => onSubmit(name)}
            disabled={!name.trim()}
            className="flex-1 py-2 rounded-xl bg-pink-500 text-white disabled:opacity-50"
          >
            创建
          </button>
        </div>
      </div>
    </div>
  );
};

// 添加到歌单弹窗
const AddToPlaylistModal: React.FC<{
  playlists: MusicPlaylist[];
  onClose: () => void;
  onSelect: (playlistId: number) => void;
}> = ({ playlists, onClose, onSelect }) => {
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex items-end justify-center">
      <div className="bg-gray-900 rounded-t-2xl w-full max-w-md p-4 pb-8 animate-slide-up">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-bold">添加到歌单</h2>
          <button onClick={onClose} className="p-2 text-gray-400 hover:text-white">
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {playlists.length === 0 ? (
            <p className="text-gray-500 text-center py-4">暂无歌单</p>
          ) : (
            playlists.map(playlist => (
              <button
                key={playlist.id}
                onClick={() => onSelect(playlist.id)}
                className="w-full p-3 rounded-xl bg-white/5 hover:bg-white/10 transition-colors text-left flex items-center gap-3"
              >
                <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-500/50 to-violet-500/50 flex items-center justify-center">
                  <svg className="w-5 h-5 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                </div>
                <span className="text-white">{playlist.name}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default MusicLibrary;
