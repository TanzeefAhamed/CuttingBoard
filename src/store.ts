import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TimePoint, TimeRange, Microseconds, µs } from './core/timeline/types';
import { Segment, Track, TrackType, MediaReference } from './core/timeline/segment';
import { Timeline } from './core/timeline/timeline';
import { TrackAudioManager, TrackAudioConfig, FadeConfig } from '../core/webcodecs/audioEngine';
import { createEncodedVideoChunk, EncodedVideoChunk } from '../core/webcodecs/videoDecoder';
import { createEncodedVideoChunk as createEncodedChunk, EncodedVideoChunk as EncodedChunk } from '../core/webcodecs/videoEncoder';

// UI State
interface UIState {
  activePane: 'media-browser' | 'viewport' | 'inspector' | 'timeline';
  setActivePane: (pane: 'media-browser' | 'viewport' | 'inspector' | 'timeline') => void;
  paneSizes: Record<string, number>;
  setPaneSizes: (sizes: Record<string, number>) => void;
  activeTimeline: string | null;
  setActiveTimeline: (id: string | null) => void;
  playhead: Microseconds;
  setPlayhead: (time: Microseconds) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  inPoint: Microseconds | null;
  outPoint: Microseconds | null;
  setInPoint: (point: Microseconds | null) => void;
  setOutPoint: (point: Microseconds | null) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  scrollX: number;
  setScrollX: (x: number) => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
}

// Timeline State
interface TimelineState {
  currentTimeline: Timeline | null;
  setCurrentTimeline: (timeline: Timeline | null) => void;
  tracks: Track[];
  setTracks: (tracks: Track[]) => void;
  addTrack: (track: Track) => void;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  segments: Map<string, Segment>;
  setSegments: (segments: Map<string, Segment>) => void;
  addSegment: (segment: Segment) => void;
  removeSegment: (segmentId: string) => void;
  updateSegment: (segmentId: string, updates: Partial<Segment>) => void;
  moveSegment: (segmentId: string, newStart: Microseconds, trackId?: string) => void;
  trimSegment: (segmentId: string, newRange: { start: Microseconds; end: Microseconds }) => void;
  splitSegment: (segmentId: string, splitTime: Microseconds) => void;
}

// Audio State
interface AudioState {
  audioManager: any | null;
  setAudioManager: (manager: any) => void;
  masterVolume: number;
  setMasterVolume: (volume: number) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
}

// Media State
interface MediaState {
  mediaItems: Array<{
    id: string;
    name: string;
    type: 'video' | 'audio' | 'image';
    url: string;
    duration: number;
    width?: number;
    height?: number;
    thumbnail?: string;
  }>;
  setMediaItems: (items: any[]) => void;
  addMedia: (item: any) => void;
  removeMedia: (id: string) => void;
  selectedMedia: string | null;
  setSelectedMedia: (id: string | null) => void;
}

// Export State
interface ExportState {
  isExporting: boolean;
  exportProgress: number;
  exportSettings: {
    format: 'mp4' | 'mov' | 'webm';
    codec: 'h264' | 'hevc' | 'vp9' | 'av1';
    resolution: '4k' | '1080p' | '720p' | '480p';
    framerate: number;
    bitrate: number;
    bitrateMode: 'cbr' | 'vbr' | 'cq';
    audioCodec: 'aac' | 'opus' | 'pcm';
    c2pa: boolean;
  };
  setExportSettings: (settings: any) => void;
  startExport: () => Promise<void>;
  cancelExport: () => void;
}

type AppState = UIState & TimelineState & AudioState & MediaState & ExportState;

export const useStore = create(
  persist(
    (set, get) => ({
      // UI State
      activePane: 'viewport',
      setActivePane: (pane) => set({ activePane: pane }),
      paneSizes: {
        'media-browser': 280,
        'viewport': 0,
        'inspector': 300,
        'timeline': 200,
      },
      setPaneSizes: (sizes) => set({ paneSizes: sizes }),
      activeTimeline: null,
      setActiveTimeline: (id) => set({ activeTimeline: id }),
      playhead: 0n,
      setPlayhead: (time) => set({ playhead: time }),
      isPlaying: false,
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      playbackSpeed: 1,
      setPlaybackSpeed: (speed) => set({ playbackSpeed: Math.max(0.1, Math.min(10, speed)) }),
      inPoint: null,
      outPoint: null,
      setInPoint: (point) => set({ inPoint: point }),
      setOutPoint: (point) => set({ outPoint: point }),
      zoom: 1,
      setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(10, zoom)) }),
      scrollX: 0,
      setScrollX: (x) => set({ scrollX: x }),
      theme: 'system',
      setTheme: (theme) => set({ theme }),
      
      // Timeline State
      currentTimeline: null,
      setCurrentTimeline: (timeline) => set({ currentTimeline: timeline }),
      tracks: [],
      setTracks: (tracks) => set({ tracks }),
      addTrack: (track) => set((state) => ({ tracks: [...state.tracks, track] })),
      removeTrack: (trackId) => set((state) => ({ tracks: state.tracks.filter(t => t.id !== trackId) })),
      updateTrack: (trackId, updates) => set((state) => ({
        tracks: state.tracks.map(t => t.id === trackId ? { ...t, ...updates } : t)
      })),
      segments: new Map(),
      setSegments: (segments) => set({ segments }),
      addSegment: (segment) => set((state) => {
        const newSegments = new Map(state.segments);
        newSegments.set(segment.id, segment);
        return { segments: newSegments };
      }),
      removeSegment: (segmentId) => set((state) => {
        const newSegments = new Map(state.segments);
        newSegments.delete(segmentId);
        return { segments: newSegments };
      }),
      updateSegment: (segmentId, updates) => set((state) => {
        const newSegments = new Map(state.segments);
        const segment = newSegments.get(segmentId);
        if (segment) newSegments.set(segmentId, { ...segment, ...updates });
        return { segments: newSegments };
      }),
      moveSegment: (segmentId, newStart, trackId) => set((state) => {
        const newSegments = new Map(state.segments);
        const segment = newSegments.get(segmentId);
        if (segment) {
          const duration = segment.targetTimerange.duration;
          newSegments.set(segmentId, {
            ...segment,
            targetTimerange: { start: newStart, duration },
            trackId: trackId || segment.trackId,
          });
        }
        return { segments: newSegments };
      }),
      trimSegment: (segmentId, newRange) => set((state) => {
        const newSegments = new Map(state.segments);
        const segment = newSegments.get(segmentId);
        if (segment) {
          newSegments.set(segmentId, {
            ...segment,
            targetTimerange: { start: newRange.start, duration: newRange.end - newRange.start },
          });
        }
        return { segments: newSegments };
      }),
      splitSegment: (segmentId, splitTime) => set((state) => {
        const newSegments = new Map(state.segments);
        const segment = newSegments.get(segmentId);
        if (segment && splitTime > segment.targetTimerange.start && splitTime < segment.targetTimerange.end) {
          const leftDuration = splitTime - segment.targetTimerange.start;
          const rightDuration = segment.targetTimerange.end - splitTime;
          
          const leftSegment: any = {
            ...segment,
            id: `${segment.id}_left`,
            targetTimerange: { start: segment.targetTimerange.start, duration: leftDuration },
            sourceTimerange: { start: segment.sourceTimerange.start, duration: leftDuration },
          };
          
          const rightSegment: any = {
            ...segment,
            id: `${segment.id}_right`,
            targetTimerange: { start: splitTime, duration: rightDuration },
            sourceTimerange: { start: segment.sourceTimerange.start + leftDuration, duration: rightDuration },
          };
          
          newSegments.delete(segmentId);
          newSegments.set(leftSegment.id, leftSegment);
          newSegments.set(rightSegment.id, rightSegment);
        }
        return { segments: newSegments };
      }),
      
      // Audio State
      audioManager: null,
      setAudioManager: (manager) => set({ audioManager: manager }),
      masterVolume: 1,
      setMasterVolume: (volume) => set({ masterVolume: Math.max(0, Math.min(1, volume)) }),
      isPlaying: false,
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      playbackSpeed: 1,
      setPlaybackSpeed: (speed) => set({ playbackSpeed: Math.max(0.1, Math.min(10, speed)) }),
      
      // Media State
      mediaItems: [],
      setMediaItems: (items) => set({ mediaItems: items }),
      addMedia: (item) => set((state) => ({ mediaItems: [...state.mediaItems, item] })),
      removeMedia: (id) => set((state) => ({ mediaItems: state.mediaItems.filter(m => m.id !== id) })),
      selectedMedia: null,
      setSelectedMedia: (id) => set({ selectedMedia: id }),
      
      // Export State
      isExporting: false,
      exportProgress: 0,
      exportSettings: {
        format: 'mp4',
        codec: 'h264',
        resolution: '1080p',
        framerate: 30,
        bitrate: 10000000,
        bitrateMode: 'vbr',
        audioCodec: 'aac',
        c2pa: false,
      },
      setExportSettings: (settings) => set((state) => ({ exportSettings: { ...state.exportSettings, ...settings } })),
      startExport: async () => {
        set({ isExporting: true, exportProgress: 0 });
        // Export implementation would go here
        set({ isExporting: false, exportProgress: 100 });
      },
      cancelExport: () => set({ isExporting: false, exportProgress: 0 }),
    }),
    {
      name: 'cuttingboard-store',
      partialize: (state) => ({
        paneSizes: state.paneSizes,
        theme: state.theme,
        exportSettings: state.exportSettings,
        // Don't persist runtime state
      }),
    }
  )
);