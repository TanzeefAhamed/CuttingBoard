import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Microseconds } from './core/timeline/types';
import type { Segment } from './core/timeline/segment';
import type { Track } from './core/timeline/track';

/* ------------------------------------------------------------------ types */

type PaneId = 'media-browser' | 'viewport' | 'inspector' | 'timeline';

interface SafeAreaState {
  actionSafe: boolean;
  titleSafe: boolean;
  tiktokSafe: boolean;
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '21:9';
}

interface MediaItem {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  duration?: number;
  width?: number;
  height?: number;
  thumbnail?: string;
  size?: number;
  createdAt: number;
}

interface ExportSettings {
  format: 'mp4' | 'mov' | 'webm';
  codec: 'h264' | 'hevc' | 'vp9' | 'av1';
  resolution: '4k' | '1080p' | '720p' | '480p';
  framerate: number;
  bitrate: number;
  bitrateMode: 'cbr' | 'vbr' | 'cq';
  audioCodec: 'aac' | 'opus' | 'pcm';
  c2pa: boolean;
}

interface AppState {
  /* UI */
  activePane: PaneId;
  setActivePane: (pane: PaneId) => void;
  paneSizes: Record<string, number>;
  setPaneSizes: (sizes: Record<string, number>) => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;

  /* Safe areas */
  safeArea: SafeAreaState;
  setSafeArea: (safeArea: Partial<SafeAreaState>) => void;
  canvasAspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '21:9';
  setCanvasAspectRatio: (ratio: '16:9' | '9:16' | '1:1' | '4:3' | '21:9') => void;

  /* Timeline */
  playhead: Microseconds;
  setPlayhead: (time: Microseconds) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  scrollX: number;
  setScrollX: (x: number) => void;
  inPoint: Microseconds | null;
  outPoint: Microseconds | null;
  setInPoint: (point: Microseconds | null) => void;
  setOutPoint: (point: Microseconds | null) => void;

  /* Tracks & segments */
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
  splitSegment: (segmentId: string, splitTime: Microseconds) => void;

  /* Selection */
  selectedSegment: string | null;
  setSelectedSegment: (id: string | null) => void;
  selectedTrack: string | null;
  setSelectedTrack: (id: string | null) => void;

  /* Media pool */
  mediaItems: MediaItem[];
  addMedia: (item: MediaItem) => void;
  removeMedia: (id: string) => void;

  /* Export */
  isExporting: boolean;
  exportProgress: number;
  exportSettings: ExportSettings;
  setExportSettings: (settings: Partial<ExportSettings>) => void;
  startExport: () => Promise<void>;
  cancelExport: () => void;
}

/* ------------------------------------------------------------------- store */

export const useStore = create<AppState>()(
  persist(
    (set, get) => ({
      /* UI */
      activePane: 'viewport',
      setActivePane: (pane) => set({ activePane: pane }),
      paneSizes: {
        'media-browser': 280,
        inspector: 300,
        timeline: 260,
      },
      setPaneSizes: (sizes) => set({ paneSizes: sizes }),
      theme: 'system',
      setTheme: (theme) => set({ theme }),

      /* Safe areas */
      safeArea: {
        actionSafe: true,
        titleSafe: true,
        tiktokSafe: false,
        aspectRatio: '16:9',
      },
      setSafeArea: (safeArea) => set({ safeArea: { ...get().safeArea, ...safeArea } }),
      canvasAspectRatio: '16:9',
      setCanvasAspectRatio: (ratio) => set({ canvasAspectRatio: ratio }),

      /* Timeline */
      playhead: 0n as Microseconds,
      setPlayhead: (time) => set({ playhead: time }),
      isPlaying: false,
      setIsPlaying: (playing) => set({ isPlaying: playing }),
      playbackSpeed: 1,
      setPlaybackSpeed: (speed) =>
        set({ playbackSpeed: Math.max(0.1, Math.min(100, speed)) }),
      zoom: 1,
      setZoom: (zoom) => set({ zoom: Math.max(0.05, Math.min(200, zoom)) }),
      scrollX: 0,
      setScrollX: (x) => set({ scrollX: x }),
      inPoint: null,
      outPoint: null,
      setInPoint: (point) => set({ inPoint: point }),
      setOutPoint: (point) => set({ outPoint: point }),

      /* Tracks & segments */
      tracks: [],
      setTracks: (tracks) => set({ tracks }),
      addTrack: (track) => set({ tracks: [...get().tracks, track] }),
      removeTrack: (trackId) =>
        set({ tracks: get().tracks.filter((t) => t.id !== trackId) }),
      updateTrack: (trackId, updates) =>
        set({
          tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t)),
        }),
      segments: new Map(),
      setSegments: (segments) => set({ segments }),
      addSegment: (segment) => {
        const next = new Map(get().segments);
        next.set(segment.id, segment);
        set({ segments: next });
      },
      removeSegment: (segmentId) => {
        const next = new Map(get().segments);
        next.delete(segmentId);
        set({ segments: next });
      },
      updateSegment: (segmentId, updates) => {
        const next = new Map(get().segments);
        const segment = next.get(segmentId);
        if (segment) next.set(segmentId, { ...segment, ...updates });
        set({ segments: next });
      },
      splitSegment: (segmentId, splitTime) => {
        const next = new Map(get().segments);
        const segment = next.get(segmentId);
        if (!segment) return;
        const start = segment.targetTimerange.start;
        const end = segment.targetTimerange.start + segment.targetTimerange.duration;
        if (splitTime <= start || splitTime >= end) return;

        const leftDuration = splitTime - start;
        const rightDuration = end - splitTime;
        const sourceStart = segment.sourceTimerange.start;

        next.delete(segmentId);
        next.set(`${segment.id}_left`, {
          ...segment,
          id: `${segment.id}_left`,
          targetTimerange: {
            start,
            duration: leftDuration,
          } as any,
          sourceTimerange: {
            start: sourceStart,
            duration: leftDuration,
          } as any,
        });
        next.set(`${segment.id}_right`, {
          ...segment,
          id: `${segment.id}_right`,
          targetTimerange: {
            start: splitTime,
            duration: rightDuration,
          } as any,
          sourceTimerange: {
            start: sourceStart + leftDuration,
            duration: rightDuration,
          } as any,
        });
        set({ segments: next });
      },

      /* Selection */
      selectedSegment: null,
      setSelectedSegment: (id) => set({ selectedSegment: id }),
      selectedTrack: null,
      setSelectedTrack: (id) => set({ selectedTrack: id }),

      /* Media pool */
      mediaItems: [],
      addMedia: (item) => set({ mediaItems: [...get().mediaItems, item] }),
      removeMedia: (id) =>
        set({ mediaItems: get().mediaItems.filter((m) => m.id !== id) }),

      /* Export */
      isExporting: false,
      exportProgress: 0,
      exportSettings: {
        format: 'mp4',
        codec: 'h264',
        resolution: '1080p',
        framerate: 30,
        bitrate: 10_000_000,
        bitrateMode: 'vbr',
        audioCodec: 'aac',
        c2pa: false,
      },
      setExportSettings: (settings) =>
        set({ exportSettings: { ...get().exportSettings, ...settings } }),
      startExport: async () => {
        set({ isExporting: true, exportProgress: 0 });
        /* real pipeline wired in the export milestone */
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
        canvasAspectRatio: state.canvasAspectRatio,
      }),
    }
  )
);
