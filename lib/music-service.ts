/**
 * 音乐播放服务 - 全局单例
 * 管理音乐播放状态、进度记忆、播放模式等
 */

import type { Music, PlayMode, AudioQuality, PlayerState } from './music-types';
import { updateMusicPosition, incrementPlayCount, recordPlayHistory } from './supabase';
import { getStoredUserId } from './auth';

type Listener = () => void;

class MusicService {
  private audio: HTMLAudioElement;
  private listeners: Set<Listener> = new Set();
  private savePositionTimer: NodeJS.Timeout | null = null;
  private playStartTime: number = 0;
  
  private state: PlayerState = {
    currentMusic: null,
    playlist: [],
    playlistId: null,
    isPlaying: false,
    currentTime: 0,
    duration: 0,
    volume: 0.8,
    isMuted: false,
    playMode: 'list',
    quality: 'standard',
    isMinimized: false,
    showFloatingBall: false,
  };

  constructor() {
    this.audio = new Audio();
    this.audio.preload = 'metadata';
    
    // 绑定音频事件
    this.audio.addEventListener('timeupdate', this.handleTimeUpdate);
    this.audio.addEventListener('loadedmetadata', this.handleLoadedMetadata);
    this.audio.addEventListener('ended', this.handleEnded);
    this.audio.addEventListener('play', () => this.updateState({ isPlaying: true }));
    this.audio.addEventListener('pause', () => this.updateState({ isPlaying: false }));
    this.audio.addEventListener('error', this.handleError);
    
    // 从 localStorage 恢复设置
    this.loadSettings();
  }

  // 订阅状态变化
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  // 获取当前状态
  getState = () => this.state;

  // 更新状态并通知订阅者
  private updateState = (partial: Partial<PlayerState>) => {
    this.state = { ...this.state, ...partial };
    this.listeners.forEach(l => l());
  };

  // 从 localStorage 加载设置
  private loadSettings = () => {
    try {
      const volume = localStorage.getItem('music-volume');
      const playMode = localStorage.getItem('music-play-mode') as PlayMode;
      const quality = localStorage.getItem('music-quality') as AudioQuality;
      
      if (volume) {
        this.state.volume = parseFloat(volume);
        this.audio.volume = this.state.volume;
      }
      if (playMode) this.state.playMode = playMode;
      if (quality) this.state.quality = quality;
    } catch { /* ignore */ }
  };

  // 保存设置到 localStorage
  private saveSettings = () => {
    localStorage.setItem('music-volume', String(this.state.volume));
    localStorage.setItem('music-play-mode', this.state.playMode);
    localStorage.setItem('music-quality', this.state.quality);
  };

  // 播放音乐
  play = async (music: Music, playlist?: Music[], playlistId?: number) => {
    // 如果是同一首歌，直接继续播放
    if (this.state.currentMusic?.id === music.id && this.audio.src) {
      this.audio.play();
      return;
    }

    // 保存上一首的播放进度
    await this.saveCurrentPosition();

    // 更新播放列表
    if (playlist) {
      this.updateState({ playlist, playlistId: playlistId || null });
    }

    // 选择音质
    const fileUrl = this.state.quality === 'high' && music.file_url_hq 
      ? music.file_url_hq 
      : music.file_url;

    this.audio.src = fileUrl;
    
    // 从上次位置继续播放
    if (music.last_position && music.last_position > 0) {
      this.audio.currentTime = music.last_position;
    }

    this.updateState({ 
      currentMusic: music,
      showFloatingBall: false,
    });

    try {
      await this.audio.play();
      this.playStartTime = Date.now();
      // 增加播放次数
      incrementPlayCount(music.id).catch(console.error);
    } catch (err) {
      console.error('播放失败:', err);
    }
  };

  // 暂停
  pause = () => {
    this.audio.pause();
    this.saveCurrentPosition();
  };

  // 切换播放/暂停
  toggle = () => {
    if (this.state.isPlaying) {
      this.pause();
    } else if (this.state.currentMusic) {
      this.audio.play();
    }
  };

  // 上一曲
  prev = () => {
    const { playlist, currentMusic, playMode } = this.state;
    if (!playlist.length || !currentMusic) return;

    const currentIndex = playlist.findIndex(m => m.id === currentMusic.id);
    let prevIndex: number;

    if (playMode === 'shuffle') {
      prevIndex = Math.floor(Math.random() * playlist.length);
    } else {
      prevIndex = currentIndex <= 0 ? playlist.length - 1 : currentIndex - 1;
    }

    this.play(playlist[prevIndex], playlist);
  };

  // 下一曲
  next = () => {
    const { playlist, currentMusic, playMode } = this.state;
    if (!playlist.length || !currentMusic) return;

    const currentIndex = playlist.findIndex(m => m.id === currentMusic.id);
    let nextIndex: number;

    if (playMode === 'shuffle') {
      nextIndex = Math.floor(Math.random() * playlist.length);
    } else {
      nextIndex = currentIndex >= playlist.length - 1 ? 0 : currentIndex + 1;
    }

    this.play(playlist[nextIndex], playlist);
  };

  // 跳转到指定时间
  seek = (time: number) => {
    this.audio.currentTime = time;
    this.updateState({ currentTime: time });
  };

  // 设置音量
  setVolume = (volume: number) => {
    this.audio.volume = volume;
    this.updateState({ volume, isMuted: volume === 0 });
    this.saveSettings();
  };

  // 切换静音
  toggleMute = () => {
    if (this.state.isMuted) {
      this.audio.volume = this.state.volume || 0.8;
      this.updateState({ isMuted: false });
    } else {
      this.audio.volume = 0;
      this.updateState({ isMuted: true });
    }
  };

  // 设置播放模式
  setPlayMode = (mode: PlayMode) => {
    this.updateState({ playMode: mode });
    this.saveSettings();
  };

  // 切换播放模式
  togglePlayMode = () => {
    const modes: PlayMode[] = ['list', 'single', 'shuffle'];
    const currentIndex = modes.indexOf(this.state.playMode);
    const nextMode = modes[(currentIndex + 1) % modes.length];
    this.setPlayMode(nextMode);
  };

  // 设置音质
  setQuality = (quality: AudioQuality) => {
    const wasPlaying = this.state.isPlaying;
    const currentTime = this.audio.currentTime;
    
    this.updateState({ quality });
    this.saveSettings();

    // 如果正在播放，切换音质后继续播放
    if (this.state.currentMusic) {
      const fileUrl = quality === 'high' && this.state.currentMusic.file_url_hq
        ? this.state.currentMusic.file_url_hq
        : this.state.currentMusic.file_url;
      
      this.audio.src = fileUrl;
      this.audio.currentTime = currentTime;
      
      if (wasPlaying) {
        this.audio.play();
      }
    }
  };

  // 最小化播放器（显示悬浮球）
  minimize = () => {
    this.updateState({ isMinimized: true, showFloatingBall: true });
  };

  // 展开播放器
  expand = () => {
    this.updateState({ isMinimized: false, showFloatingBall: false });
  };

  // 显示/隐藏悬浮球
  setShowFloatingBall = (show: boolean) => {
    this.updateState({ showFloatingBall: show });
  };

  // 停止播放并清理
  stop = async () => {
    await this.saveCurrentPosition();
    this.audio.pause();
    this.audio.src = '';
    this.updateState({
      currentMusic: null,
      isPlaying: false,
      currentTime: 0,
      duration: 0,
      showFloatingBall: false,
    });
  };

  // 保存当前播放进度
  private saveCurrentPosition = async () => {
    if (!this.state.currentMusic || this.audio.currentTime < 5) return;
    
    try {
      await updateMusicPosition(this.state.currentMusic.id, Math.floor(this.audio.currentTime));
      
      // 记录播放历史
      const userId = getStoredUserId();
      if (userId && this.playStartTime) {
        const durationPlayed = Math.floor((Date.now() - this.playStartTime) / 1000);
        if (durationPlayed > 10) {
          await recordPlayHistory(userId, this.state.currentMusic.id, durationPlayed);
        }
      }
    } catch (err) {
      console.error('保存播放进度失败:', err);
    }
  };

  // 音频事件处理
  private handleTimeUpdate = () => {
    this.updateState({ currentTime: this.audio.currentTime });
    
    // 每30秒自动保存进度
    if (!this.savePositionTimer) {
      this.savePositionTimer = setTimeout(() => {
        this.saveCurrentPosition();
        this.savePositionTimer = null;
      }, 30000);
    }
  };

  private handleLoadedMetadata = () => {
    this.updateState({ duration: this.audio.duration });
  };

  private handleEnded = () => {
    const { playMode } = this.state;
    
    if (playMode === 'single') {
      // 单曲循环
      this.audio.currentTime = 0;
      this.audio.play();
    } else {
      // 列表循环或随机播放
      this.next();
    }
  };

  private handleError = (e: Event) => {
    console.error('音频播放错误:', e);
    this.updateState({ isPlaying: false });
  };

  // 格式化时间
  static formatTime = (seconds: number): string => {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };
}

// 导出单例
export const musicService = new MusicService();
