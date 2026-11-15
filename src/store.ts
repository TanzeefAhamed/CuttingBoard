import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { TimePoint, TimeRange, µs } from './core/timeline/types';
import type { Microseconds } from './core/timeline/types';
import { createSegment, splitSegment as coreSplitSegment } from './core/timeline/segment';
import type { Segment, TrackType } from './core/timeline/segment';
import { createTrack } from './core/timeline/track';
import type { Track } from './core/timeline/track';
import { generateSfx, type SfxType } from './editor/sfxGenerator';

/* ------------------------------------------------------------------ types */

export type PaneId = 'media-browser' | 'viewport' | 'inspector' | 'timeline';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '21:9';
export type DialogId = 'settings' | 'export' | 'help' | null;

export interface SafeAreaState {
  actionSafe: boolean;
  titleSafe: boolean;
  tiktokSafe: boolean;
  aspectRatio: AspectRatio;
}

export interface MediaItem {
  id: string;
  name: string;
  type: 'video' | 'audio' | 'image';
  url: string;
  duration?: number; // seconds
  width?: number;
  height?: number;
  thumbnail?: string;
  size?: number;
  createdAt: number;
}

export interface ExportSettings {
  format: 'mp4' | 'mov' | 'webm';
  codec: 'h264' | 'hevc' | 'vp9' | 'av1';
  resolution: '4k' | '1080p' | '720p' | '480p';
  framerate: number;
  bitrate: number;
  bitrateMode: 'cbr' | 'vbr' | 'cq';
  audioCodec: 'aac' | 'opus' | 'pcm';
  c2pa: boolean;
}

export interface AppSettings {
  defaultImageDuration: number; // seconds
  snapEnabled: boolean;
  autoSelectOnAdd: boolean;
  showTimecodeFrames: boolean;
}

interface Snapshot {
  tracks: Track[];
  segments: Map<string, Segment>;
}

interface AppState {
  /* UI */
  projectName: string;
  setProjectName: (name: string) => void;
  activePane: PaneId;
  setActivePane: (pane: PaneId) => void;
  activeSidebarTab: 'media' | 'text' | 'elements' | 'effects' | 'audio' | 'captions';
  setActiveSidebarTab: (tab: 'media' | 'text' | 'elements' | 'effects' | 'audio' | 'captions') => void;
  activeTool: 'select' | 'razor' | 'hand';
  setActiveTool: (tool: 'select' | 'razor' | 'hand') => void;
  rippleEnabled: boolean;
  setRippleEnabled: (v: boolean) => void;
  paneSizes: Record<string, number>;
  setPaneSizes: (sizes: Record<string, number>) => void;
  theme: 'light' | 'dark' | 'system';
  setTheme: (theme: 'light' | 'dark' | 'system') => void;
  activeDialog: DialogId;
  openDialog: (d: DialogId) => void;
  settings: AppSettings;
  setSettings: (s: Partial<AppSettings>) => void;
  resetSettings: () => void;

  /* Safe areas */
  safeArea: SafeAreaState;
  setSafeArea: (safeArea: Partial<SafeAreaState>) => void;
  canvasAspectRatio: AspectRatio;
  setCanvasAspectRatio: (ratio: AspectRatio) => void;

  /* Timeline */
  playhead: Microseconds;
  setPlayhead: (time: Microseconds) => void;
  isPlaying: boolean;
  setIsPlaying: (playing: boolean) => void;
  playbackSpeed: number;
  setPlaybackSpeed: (speed: number) => void;
  volume: number;
  setVolume: (v: number) => void;
  zoom: number;
  setZoom: (zoom: number) => void;
  scrollX: number;
  setScrollX: (x: number) => void;
  inPoint: Microseconds | null;
  outPoint: Microseconds | null;
  setInPoint: (point: Microseconds | null) => void;
  setOutPoint: (point: Microseconds | null) => void;
  getDuration: () => Microseconds;

  /* Tracks & segments */
  tracks: Track[];
  setTracks: (tracks: Track[]) => void;
  addTrack: (track: Track) => void;
  addTrackOfType: (type: TrackType) => string;
  removeTrack: (trackId: string) => void;
  updateTrack: (trackId: string, updates: Partial<Track>) => void;
  segments: Map<string, Segment>;
  setSegments: (segments: Map<string, Segment>) => void;
  addSegment: (segment: Segment) => void;
  removeSegment: (segmentId: string) => void;
  updateSegment: (segmentId: string, updates: Partial<Segment>, coalesceKey?: string) => void;
  splitSegment: (segmentId: string, splitTime: Microseconds) => void;
  splitAtPlayhead: () => boolean;
  duplicateSegment: (segmentId: string) => string | null;
  addTextSegment: (text?: string, opts?: { trackId?: string; start?: Microseconds; duration?: Microseconds }) => string;
  addShapeSegment: (shapeType?: string, label?: string) => string;
  addSfxSegment: (sfxType: SfxType) => string;
  applyColorPreset: (preset: 'teal-orange' | 'vintage' | 'cyberpunk' | 'noir' | 'crisp') => void;
  updateSegmentText: (segmentId: string, text: string) => void;
  reorderTrack: (trackId: string, direction: 'up' | 'down') => void;
  deleteSelected: () => void;
  addMediaToTimeline: (mediaId: string, opts?: { trackId?: string; start?: Microseconds }) => string | null;
  /** Begin a drag-edit: pushes a single history entry. */
  beginEdit: () => void;
  /** Live (non-history) move; call beginEdit() first. */
  moveSegmentLive: (segmentId: string, newStart: Microseconds, trackId?: string) => void;
  /** Live (non-history) trim; call beginEdit() first. edge = which edge moves to `time`. */
  trimSegmentLive: (segmentId: string, edge: 'start' | 'end', time: Microseconds) => void;

  /* History */
  past: Snapshot[];
  future: Snapshot[];
  undo: () => void;
  redo: () => void;
  clearProject: () => void;

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
  exportError: string | null;
  exportSettings: ExportSettings;
  setExportSettings: (settings: Partial<ExportSettings>) => void;
  startExport: () => Promise<void>;
  cancelExport: () => void;
}

const DEFAULT_SETTINGS: AppSettings = {
  defaultImageDuration: 5,
  snapEnabled: true,
  autoSelectOnAdd: true,
  showTimecodeFrames: true,
};

const MIN_CLIP_US = 100_000n;
const HISTORY_LIMIT = 100;

function defaultTracks(): Track[] {
  return [
    createTrack({ id: 'track-v1', name: 'Video 1', type: 'video', isPrimary: true, order: 0 }),
    createTrack({ id: 'track-a1', name: 'Audio 1', type: 'audio', order: 1 }),
  ];
}

let exportAbort: AbortController | null = null;
let lastEdit: { key: string; at: number } | null = null;

/* ------------------------------------------------------------------- store */

export const useStore = create<AppState>()(
  persist(
    (set, get) => {
      const snapshot = (): Snapshot => ({ tracks: get().tracks, segments: get().segments });
      const pushHistory = () => {
        const past = [...get().past, snapshot()];
        if (past.length > HISTORY_LIMIT) past.shift();
        set({ past, future: [] });
        lastEdit = null;
      };

      return {
        /* UI */
        projectName: 'New Project',
        setProjectName: (name) => set({ projectName: name }),
        activePane: 'viewport',
        setActivePane: (pane) => set({ activePane: pane }),
        activeSidebarTab: 'media',
        setActiveSidebarTab: (tab) => set({ activeSidebarTab: tab }),
        activeTool: 'select',
        setActiveTool: (tool) => set({ activeTool: tool }),
        rippleEnabled: false,
        setRippleEnabled: (v) => set({ rippleEnabled: v }),
        paneSizes: { 'media-browser': 280, inspector: 300, timeline: 260 },
        setPaneSizes: (sizes) => set({ paneSizes: sizes }),
        theme: 'system',
        setTheme: (theme) => set({ theme }),
        activeDialog: null,
        openDialog: (d) => set({ activeDialog: d }),
        settings: DEFAULT_SETTINGS,
        setSettings: (s) => set({ settings: { ...get().settings, ...s } }),
        resetSettings: () =>
          set({
            settings: DEFAULT_SETTINGS,
            theme: 'system',
            canvasAspectRatio: '16:9',
            safeArea: { actionSafe: true, titleSafe: true, tiktokSafe: false, aspectRatio: '16:9' },
          }),

        /* Safe areas */
        safeArea: { actionSafe: true, titleSafe: true, tiktokSafe: false, aspectRatio: '16:9' },
        setSafeArea: (safeArea) => set({ safeArea: { ...get().safeArea, ...safeArea } }),
        canvasAspectRatio: '16:9',
        setCanvasAspectRatio: (ratio) => set({ canvasAspectRatio: ratio }),

        /* Timeline */
        playhead: 0n as Microseconds,
        setPlayhead: (time) => set({ playhead: (time < 0n ? 0n : time) as Microseconds }),
        isPlaying: false,
        setIsPlaying: (playing) => set({ isPlaying: playing }),
        playbackSpeed: 1,
        setPlaybackSpeed: (speed) => set({ playbackSpeed: Math.max(0.1, Math.min(100, speed)) }),
        volume: 1,
        setVolume: (v) => set({ volume: Math.max(0, Math.min(1, v)) }),
        zoom: 1,
        setZoom: (zoom) => set({ zoom: Math.max(0.05, Math.min(200, zoom)) }),
        scrollX: 0,
        setScrollX: (x) => set({ scrollX: x }),
        inPoint: null,
        outPoint: null,
        setInPoint: (point) => set({ inPoint: point }),
        setOutPoint: (point) => set({ outPoint: point }),
        getDuration: () => {
          let end = 0n;
          for (const s of get().segments.values()) {
            const e = s.targetTimerange.start.value + s.targetTimerange.duration;
            if (e > end) end = e;
          }
          return end as Microseconds;
        },

        /* Tracks & segments */
        tracks: defaultTracks(),
        setTracks: (tracks) => set({ tracks }),
        addTrack: (track) => {
          pushHistory();
          set({ tracks: [...get().tracks, track] });
        },
        addTrackOfType: (type) => {
          const same = get().tracks.filter((t) => t.type === type).length;
          const label = type === 'video' ? 'Video' : type === 'audio' ? 'Audio' : type === 'text' ? 'Text' : 'Adjust';
          const track = createTrack({
            id: `track-${crypto.randomUUID().slice(0, 8)}`,
            name: `${label} ${same + 1}`,
            type,
            order: get().tracks.length,
          });
          pushHistory();
          set({ tracks: [...get().tracks, track] });
          return track.id;
        },
        removeTrack: (trackId) => {
          pushHistory();
          const next = new Map(get().segments);
          for (const [id, s] of next) if (s.trackId === trackId) next.delete(id);
          const sel = get().selectedSegment;
          set({
            tracks: get().tracks.filter((t) => t.id !== trackId),
            segments: next,
            selectedSegment: sel && next.has(sel) ? sel : null,
          });
        },
        updateTrack: (trackId, updates) => {
          pushHistory();
          set({ tracks: get().tracks.map((t) => (t.id === trackId ? { ...t, ...updates } : t)) });
        },
        segments: new Map(),
        setSegments: (segments) => set({ segments }),
        addSegment: (segment) => {
          pushHistory();
          const next = new Map(get().segments);
          next.set(segment.id, segment);
          set({ segments: next });
        },
        removeSegment: (segmentId) => {
          pushHistory();
          const next = new Map(get().segments);
          next.delete(segmentId);
          set({
            segments: next,
            selectedSegment: get().selectedSegment === segmentId ? null : get().selectedSegment,
          });
        },
        updateSegment: (segmentId, updates, coalesceKey) => {
          const seg = get().segments.get(segmentId);
          if (!seg) return;
          const now = Date.now();
          if (coalesceKey && lastEdit && lastEdit.key === `${segmentId}:${coalesceKey}` && now - lastEdit.at < 800) {
            lastEdit.at = now;
          } else {
            pushHistory();
            if (coalesceKey) lastEdit = { key: `${segmentId}:${coalesceKey}`, at: now };
          }
          const next = new Map(get().segments);
          next.set(segmentId, { ...seg, ...updates });
          set({ segments: next });
        },
        splitSegment: (segmentId, splitTime) => {
          const seg = get().segments.get(segmentId);
          if (!seg) return;
          const parts = coreSplitSegment(seg, new TimePoint(splitTime));
          if (!parts) return;
          pushHistory();
          const [left, right] = parts;
          const uid = crypto.randomUUID().slice(0, 8);
          const l = { ...left, id: `${seg.id.replace(/_(left|right)$/, '')}_${uid}a` };
          const r = { ...right, id: `${seg.id.replace(/_(left|right)$/, '')}_${uid}b` };
          const next = new Map<string, Segment>();
          for (const [id, s] of get().segments) {
            if (id === segmentId) {
              next.set(l.id, l);
              next.set(r.id, r);
            } else next.set(id, s);
          }
          set({ segments: next, selectedSegment: r.id });
        },
        splitAtPlayhead: () => {
          const { segments, selectedSegment, playhead } = get();
          const contains = (s: Segment) =>
            playhead > s.targetTimerange.start.value &&
            playhead < s.targetTimerange.start.value + s.targetTimerange.duration;
          let target = selectedSegment ? segments.get(selectedSegment) : undefined;
          if (!target || !contains(target)) target = Array.from(segments.values()).find(contains);
          if (!target) return false;
          get().splitSegment(target.id, playhead);
          return true;
        },
        deleteSelected: () => {
          const id = get().selectedSegment;
          if (id) get().removeSegment(id);
        },
        duplicateSegment: (segmentId) => {
          const seg = get().segments.get(segmentId);
          if (!seg) return null;
          pushHistory();
          const id = `seg-${crypto.randomUUID().slice(0, 8)}`;
          const dur = seg.targetTimerange.duration;
          const newStart = seg.targetTimerange.start.value + dur;
          const newSeg: Segment = {
            ...seg,
            id,
            instanceId: crypto.randomUUID(),
            targetTimerange: new TimeRange(new TimePoint(µs(newStart)), dur),
            transform: { ...seg.transform },
            crop: seg.crop ? { ...seg.crop } : undefined,
            filters: seg.filters ? { ...seg.filters } : undefined,
            colorGrade: seg.colorGrade ? { ...seg.colorGrade } : undefined,
            aiEffects: seg.aiEffects ? { ...seg.aiEffects } : undefined,
          };
          const next = new Map(get().segments);
          next.set(id, newSeg);
          set({ segments: next, selectedSegment: id });
          return id;
        },
        addTextSegment: (text = 'Sample Text', opts) => {
          pushHistory();
          let tracks = get().tracks;
          let track = opts?.trackId ? tracks.find((t) => t.id === opts.trackId) : undefined;
          if (!track || track.locked) {
            track = tracks.find((t) => t.type === 'text' && !t.locked) || tracks.find((t) => t.type === 'video' && !t.locked);
          }
          if (!track) {
            track = createTrack({
              id: `track-${crypto.randomUUID().slice(0, 8)}`,
              name: `Text ${tracks.filter((t) => t.type === 'text').length + 1}`,
              type: 'text',
              order: tracks.length,
            });
            tracks = [...tracks, track];
          }

          const duration = opts?.duration ?? µs(3_000_000n);
          const start = opts?.start ?? get().playhead;
          const id = `seg-${crypto.randomUUID().slice(0, 8)}`;
          const segment = createSegment({
            id,
            trackId: track.id,
            type: 'text',
            targetStart: new TimePoint(start),
            targetDuration: duration,
            sourceStart: TimePoint.zero(),
            sourceDuration: duration,
            media: {
              id: `media-${id}`,
              type: 'text',
              url: 'data:text/plain,' + encodeURIComponent(text),
              duration,
              metadata: { text, fontSize: 44, color: '#ffffff', fontFamily: 'Inter' },
            },
          });

          const next = new Map(get().segments);
          next.set(id, segment);
          set({
            tracks,
            segments: next,
            selectedSegment: id,
          });
          return id;
        },
        addShapeSegment: (shapeType = 'rectangle', label) => {
          pushHistory();
          let tracks = get().tracks;
          let track = tracks.find((t) => t.type === 'video' && !t.locked);
          if (!track) {
            track = createTrack({
              id: `track-${crypto.randomUUID().slice(0, 8)}`,
              name: `Video ${tracks.filter((t) => t.type === 'video').length + 1}`,
              type: 'video',
              order: tracks.length,
            });
            tracks = [...tracks, track];
          }

          const duration = µs(4_000_000n);
          const start = get().playhead;
          const id = `seg-${crypto.randomUUID().slice(0, 8)}`;
          const segment = createSegment({
            id,
            trackId: track.id,
            type: 'video',
            targetStart: new TimePoint(start),
            targetDuration: duration,
            sourceStart: TimePoint.zero(),
            sourceDuration: duration,
            media: {
              id: `media-${id}`,
              type: 'shape' as any,
              url: 'data:text/plain;shape,' + shapeType,
              duration,
              metadata: {
                name: label || (shapeType.charAt(0).toUpperCase() + shapeType.slice(1)),
                shapeType,
                color: shapeType.includes('device') ? '#1e293b' : '#3b82f6',
                strokeColor: '#ffffff',
              },
            },
          });

          const next = new Map(get().segments);
          next.set(id, segment);
          set({
            tracks,
            segments: next,
            selectedSegment: id,
          });
          return id;
        },
        addSfxSegment: (sfxType) => {
          pushHistory();
          const sfx = generateSfx(sfxType);
          const durUs = BigInt(Math.round(sfx.durationSec * 1_000_000)) as Microseconds;
          const sfxItem: MediaItem = {
            id: `sfx-${crypto.randomUUID().slice(0, 8)}`,
            name: `SFX ${sfxType.charAt(0).toUpperCase() + sfxType.slice(1)}`,
            type: 'audio',
            url: sfx.url,
            duration: sfx.durationSec,
            createdAt: Date.now(),
          };

          let tracks = get().tracks;
          let track = tracks.find((t) => t.type === 'audio' && !t.locked);
          if (!track) {
            track = createTrack({
              id: `track-${crypto.randomUUID().slice(0, 8)}`,
              name: `Audio ${tracks.filter((t) => t.type === 'audio').length + 1}`,
              type: 'audio',
              order: tracks.length,
            });
            tracks = [...tracks, track];
          }

          const start = get().playhead;
          const id = `seg-${crypto.randomUUID().slice(0, 8)}`;
          const segment = createSegment({
            id,
            trackId: track.id,
            type: 'audio',
            targetStart: new TimePoint(start),
            targetDuration: durUs,
            sourceStart: TimePoint.zero(),
            sourceDuration: durUs,
            media: sfxItem,
          });

          const next = new Map(get().segments);
          next.set(id, segment);
          set({
            mediaItems: [...get().mediaItems, sfxItem],
            tracks,
            segments: next,
            selectedSegment: id,
          });
          return id;
        },
        applyColorPreset: (preset) => {
          const selId = get().selectedSegment;
          if (!selId) return;
          const seg = get().segments.get(selId);
          if (!seg) return;
          pushHistory();

          let lift = { r: 1, g: 1, b: 1, master: 1 };
          let gamma = { r: 1, g: 1, b: 1, master: 1 };
          let gain = { r: 1, g: 1, b: 1, master: 1 };
          let temperature = 0;
          let tint = 0;

          if (preset === 'teal-orange') {
            lift = { r: 0.9, g: 1.0, b: 1.15, master: 1 };
            gamma = { r: 1.05, g: 0.98, b: 0.9, master: 1 };
            gain = { r: 1.2, g: 1.05, b: 0.85, master: 1 };
            temperature = 15;
            tint = -5;
          } else if (preset === 'vintage') {
            lift = { r: 1.1, g: 1.0, b: 0.85, master: 1 };
            gamma = { r: 1.0, g: 1.05, b: 0.95, master: 1 };
            gain = { r: 1.05, g: 0.95, b: 0.8, master: 1 };
            temperature = 25;
            tint = 10;
          } else if (preset === 'cyberpunk') {
            lift = { r: 0.8, g: 0.85, b: 1.3, master: 1 };
            gamma = { r: 1.2, g: 0.8, b: 1.1, master: 1 };
            gain = { r: 1.1, g: 1.25, b: 0.9, master: 1 };
            temperature = -20;
            tint = 25;
          } else if (preset === 'noir') {
            lift = { r: 0.8, g: 0.8, b: 0.8, master: 0.8 };
            gamma = { r: 1.1, g: 1.1, b: 1.1, master: 1.1 };
            gain = { r: 1.2, g: 1.2, b: 1.2, master: 1.2 };
            temperature = 0;
            tint = 0;
          } else if (preset === 'crisp') {
            lift = { r: 0.95, g: 0.95, b: 0.95, master: 0.95 };
            gamma = { r: 1.0, g: 1.0, b: 1.0, master: 1.0 };
            gain = { r: 1.1, g: 1.1, b: 1.1, master: 1.1 };
            temperature = -5;
            tint = 0;
          }

          const next = new Map(get().segments);
          next.set(selId, {
            ...seg,
            colorGrade: {
              ...seg.colorGrade,
              lift,
              gamma,
              gain,
              temperature,
              tint,
            },
          });
          set({ segments: next });
        },
        updateSegmentText: (segmentId, text) => {
          const seg = get().segments.get(segmentId);
          if (!seg) return;
          const next = new Map(get().segments);
          next.set(segmentId, {
            ...seg,
            media: {
              ...seg.media,
              metadata: {
                ...seg.media.metadata,
                text,
              },
            },
          });
          set({ segments: next });
        },
        reorderTrack: (trackId, direction) => {
          const tracks = [...get().tracks];
          const idx = tracks.findIndex((t) => t.id === trackId);
          if (idx === -1) return;
          const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
          if (targetIdx < 0 || targetIdx >= tracks.length) return;
          pushHistory();
          const [removed] = tracks.splice(idx, 1);
          tracks.splice(targetIdx, 0, removed!);
          set({ tracks: tracks.map((t, i) => ({ ...t, order: i })) });
        },
        addMediaToTimeline: (mediaId, opts) => {
          const item = get().mediaItems.find((m) => m.id === mediaId);
          if (!item) return null;
          const wantType: TrackType = item.type === 'audio' ? 'audio' : 'video';
          pushHistory();

          let tracks = get().tracks;
          let track = opts?.trackId ? tracks.find((t) => t.id === opts.trackId) : undefined;
          if (!track || track.type !== wantType || track.locked) {
            track = tracks.find((t) => t.type === wantType && !t.locked);
          }
          if (!track) {
            track = createTrack({
              id: `track-${crypto.randomUUID().slice(0, 8)}`,
              name: wantType === 'video' ? 'Video 1' : 'Audio 1',
              type: wantType,
              order: tracks.length,
            });
            tracks = [...tracks, track];
          }

          const settings = get().settings;
          const seconds = item.duration && item.duration > 0 ? item.duration : settings.defaultImageDuration;
          const duration = µs(Math.round(seconds * 1_000_000));

          let start: bigint;
          if (opts?.start !== undefined) start = opts.start;
          else {
            start = 0n;
            for (const s of get().segments.values()) {
              if (s.trackId === track.id) {
                const e = s.targetTimerange.start.value + s.targetTimerange.duration;
                if (e > start) start = e;
              }
            }
          }
          if (start < 0n) start = 0n;

          const id = `seg-${crypto.randomUUID().slice(0, 8)}`;
          const segment = createSegment({
            id,
            trackId: track.id,
            type: wantType,
            targetStart: new TimePoint(µs(start)),
            targetDuration: duration,
            sourceStart: TimePoint.zero(),
            sourceDuration: duration,
            media: {
              id: item.id,
              type: item.type,
              url: item.url,
              duration,
              metadata: { name: item.name, width: item.width, height: item.height },
            },
          });
          const next = new Map(get().segments);
          next.set(id, segment);
          set({
            tracks,
            segments: next,
            selectedSegment: settings.autoSelectOnAdd ? id : get().selectedSegment,
          });
          return id;
        },
        beginEdit: () => pushHistory(),
        moveSegmentLive: (segmentId, newStart, trackId) => {
          const seg = get().segments.get(segmentId);
          if (!seg) return;
          const start = newStart < 0n ? 0n : newStart;
          let tid = seg.trackId;
          if (trackId && trackId !== tid) {
            const t = get().tracks.find((x) => x.id === trackId);
            if (t && !t.locked && (t.type === seg.type || (t.type === 'video' && seg.type === 'video'))) tid = trackId;
          }
          const next = new Map(get().segments);
          next.set(segmentId, {
            ...seg,
            trackId: tid,
            targetTimerange: new TimeRange(new TimePoint(µs(start)), seg.targetTimerange.duration),
          });
          set({ segments: next });
        },
        trimSegmentLive: (segmentId, edge, time) => {
          const seg = get().segments.get(segmentId);
          if (!seg) return;
          const tStart = seg.targetTimerange.start.value;
          const tDur: bigint = seg.targetTimerange.duration;
          const tEnd = tStart + tDur;
          const sStart = seg.sourceTimerange.start.value;
          const sDur: bigint = seg.sourceTimerange.duration;
          const mediaDur: bigint = seg.media.duration;
          const bounded = seg.media.type === 'video' || seg.media.type === 'audio';
          // microseconds of source per microsecond of timeline
          const ratio = sDur === 0n || tDur === 0n ? 1 : Number(sDur) / Number(tDur);
          let nTStart: bigint = tStart;
          let nTDur: bigint = tDur;
          let nSStart: bigint = sStart;
          let nSDur: bigint = sDur;

          if (edge === 'start') {
            let t: bigint = time;
            if (t > tEnd - MIN_CLIP_US) t = tEnd - MIN_CLIP_US;
            if (t < 0n) t = 0n;
            let delta = t - tStart; // + shrinks
            let srcDelta = BigInt(Math.round(Number(delta) * ratio));
            if (bounded && sStart + srcDelta < 0n) {
              srcDelta = -sStart;
              delta = BigInt(Math.round(Number(srcDelta) / ratio));
            }
            nTStart = tStart + delta;
            nTDur = tDur - delta;
            nSStart = sStart + srcDelta;
            nSDur = sDur - srcDelta;
          } else {
            let t: bigint = time;
            if (t < tStart + MIN_CLIP_US) t = tStart + MIN_CLIP_US;
            let newDur = t - tStart;
            let newSDur = BigInt(Math.round(Number(newDur) * ratio));
            if (bounded && sStart + newSDur > mediaDur) {
              newSDur = mediaDur - sStart;
              newDur = BigInt(Math.round(Number(newSDur) / ratio));
            }
            nTDur = newDur;
            nSDur = newSDur;
          }
          if (nTDur <= 0n || nSDur <= 0n) return;
          const next = new Map(get().segments);
          next.set(segmentId, {
            ...seg,
            targetTimerange: new TimeRange(new TimePoint(µs(nTStart)), µs(nTDur)),
            sourceTimerange: new TimeRange(new TimePoint(µs(nSStart)), µs(nSDur)),
          });
          set({ segments: next });
        },

        /* History */
        past: [],
        future: [],
        undo: () => {
          const { past } = get();
          const prev = past[past.length - 1];
          if (!prev) return;
          const sel = get().selectedSegment;
          set({
            past: past.slice(0, -1),
            future: [...get().future, snapshot()],
            tracks: prev.tracks,
            segments: prev.segments,
            selectedSegment: sel && prev.segments.has(sel) ? sel : null,
          });
          lastEdit = null;
        },
        redo: () => {
          const { future } = get();
          const nxt = future[future.length - 1];
          if (!nxt) return;
          const sel = get().selectedSegment;
          set({
            future: future.slice(0, -1),
            past: [...get().past, snapshot()],
            tracks: nxt.tracks,
            segments: nxt.segments,
            selectedSegment: sel && nxt.segments.has(sel) ? sel : null,
          });
          lastEdit = null;
        },
        clearProject: () => {
          pushHistory();
          set({ segments: new Map(), tracks: defaultTracks(), selectedSegment: null, playhead: 0n as Microseconds, isPlaying: false });
        },

        /* Selection */
        selectedSegment: null,
        setSelectedSegment: (id) => set({ selectedSegment: id }),
        selectedTrack: null,
        setSelectedTrack: (id) => set({ selectedTrack: id }),

        /* Media pool */
        mediaItems: [],
        addMedia: (item) => set({ mediaItems: [...get().mediaItems, item] }),
        removeMedia: (id) => {
          const used = Array.from(get().segments.values()).some((s) => s.media.id === id);
          if (used) {
            pushHistory();
            const next = new Map(get().segments);
            for (const [sid, s] of next) if (s.media.id === id) next.delete(sid);
            const sel = get().selectedSegment;
            set({ segments: next, selectedSegment: sel && next.has(sel) ? sel : null });
          }
          set({ mediaItems: get().mediaItems.filter((m) => m.id !== id) });
        },

        /* Export */
        isExporting: false,
        exportProgress: 0,
        exportError: null,
        exportSettings: {
          format: 'webm',
          codec: 'vp9',
          resolution: '720p',
          framerate: 30,
          bitrate: 8_000_000,
          bitrateMode: 'vbr',
          audioCodec: 'opus',
          c2pa: false,
        },
        setExportSettings: (settings) => set({ exportSettings: { ...get().exportSettings, ...settings } }),
        startExport: async () => {
          if (get().isExporting) return;
          if (get().segments.size === 0) {
            set({ exportError: 'Nothing to export — add clips to the timeline first.' });
            return;
          }
          exportAbort = new AbortController();
          set({ isExporting: true, exportProgress: 0, exportError: null, isPlaying: false });
          try {
            const { runExport } = await import('./editor/exporter');
            await runExport(
              {
                segments: get().segments,
                tracks: get().tracks,
                duration: get().getDuration(),
                aspect: get().canvasAspectRatio,
                settings: get().exportSettings,
              },
              (p) => set({ exportProgress: p }),
              exportAbort.signal,
            );
            set({ exportProgress: 100 });
          } catch (e) {
            if ((e as Error).name !== 'AbortError') set({ exportError: (e as Error).message || String(e) });
          } finally {
            set({ isExporting: false });
            exportAbort = null;
          }
        },
        cancelExport: () => {
          exportAbort?.abort();
          set({ isExporting: false, exportProgress: 0 });
        },
      };
    },
    {
      name: 'cuttingboard-store',
      partialize: (state) => ({
        paneSizes: state.paneSizes,
        theme: state.theme,
        exportSettings: state.exportSettings,
        canvasAspectRatio: state.canvasAspectRatio,
        safeArea: state.safeArea,
        settings: state.settings,
        volume: state.volume,
      }),
    },
  ),
);
