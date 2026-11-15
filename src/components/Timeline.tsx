import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../store';
import {
  Volume2,
  VolumeX,
  Trash2,
  Scissors,
  ZoomIn,
  ZoomOut,
  Plus,
  ChevronUp,
  ChevronDown,
  Copy,
  Settings,
  Type,
} from 'lucide-react';
import type { Microseconds } from '../core/timeline/types';
import { MEDIA_DRAG_TYPE } from './MediaBrowser';

const TRACK_HEIGHT = 56;
const RULER_HEIGHT = 28;
const MIN_CLIP_WIDTH = 6;
const EDGE_PX = 7;
const SNAP_PX = 8;

/** zoom = 1 -> 100 px per second */
const pps = (zoom: number) => 100 * (zoom || 1);
const usToPx = (us: number | bigint, zoom: number) => (Number(us) / 1_000_000) * pps(zoom);
const pxToUs = (px: number, zoom: number) => BigInt(Math.round((px / pps(zoom)) * 1_000_000)) as Microseconds;

function formatTimecode(us: number | bigint, frames = true): string {
  const total = Number(us) / 1_000_000;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const f = Math.floor((total % 1) * 30);
  const base = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return frames ? `${base}.${f.toString().padStart(2, '0')}` : base;
}

type DragState = {
  mode: 'move' | 'trimStart' | 'trimEnd' | 'playhead';
  segId?: string;
  startX: number;
  startY: number;
  origStart: bigint;
  grabOffsetUs: bigint;
  began: boolean;
};

const CLIP_COLORS: Record<string, string> = {
  video: '#3b82f6',
  audio: '#f59e0b',
  text: '#22c55e',
  adjustment: '#a855f7',
};

export function Timeline({ className = '' }: { className?: string }) {
  const tracks = useStore((s) => s.tracks);
  const segments = useStore((s) => s.segments);
  const playhead = useStore((s) => s.playhead);
  const isPlaying = useStore((s) => s.isPlaying);
  const zoom = useStore((s) => s.zoom);
  const inPoint = useStore((s) => s.inPoint);
  const outPoint = useStore((s) => s.outPoint);
  const selectedSegment = useStore((s) => s.selectedSegment);
  const showFrames = useStore((s) => s.settings.showTimecodeFrames);
  const setZoom = useStore((s) => s.setZoom);
  const updateTrack = useStore((s) => s.updateTrack);
  const removeTrack = useStore((s) => s.removeTrack);
  const addTrackOfType = useStore((s) => s.addTrackOfType);
  const splitAtPlayhead = useStore((s) => s.splitAtPlayhead);
  const duplicateSegment = useStore((s) => s.duplicateSegment);
  const removeSegment = useStore((s) => s.removeSegment);
  const setSelectedSegment = useStore((s) => s.setSelectedSegment);
  const setActivePane = useStore((s) => s.setActivePane);
  const reorderTrack = useStore((s) => s.reorderTrack);
  const addTextSegment = useStore((s) => s.addTextSegment);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rulerRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rulerWrapRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{ x: number; track: number } | null>(null);
  const [viewW, setViewW] = useState(800);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    segmentId: string | null;
  } | null>(null);

  // Close context menu on global click/contextmenu outside
  useEffect(() => {
    const handleClose = () => setContextMenu(null);
    window.addEventListener('click', handleClose);
    return () => window.removeEventListener('click', handleClose);
  }, []);

  // ------------------------------------------------------------- geometry
  const durationUs = (() => {
    let end = 0n;
    for (const s of segments.values()) {
      const e = s.targetTimerange.start.value + s.targetTimerange.duration;
      if (e > end) end = e;
    }
    return end;
  })();
  const contentWidth = Math.max(viewW, usToPx(durationUs, zoom) + 300, usToPx(30_000_000n, zoom));
  const contentHeight = Math.max(TRACK_HEIGHT * tracks.length, 80);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewW(el.clientWidth));
    ro.observe(el);
    setViewW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // -------------------------------------------------------------- drawing
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = contentWidth;
    const H = contentHeight;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = `${W}px`;
    canvas.style.height = `${H}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    tracks.forEach((track, i) => {
      const y = i * TRACK_HEIGHT;
      ctx.fillStyle = i % 2 ? '#111827' : '#0f172a';
      ctx.fillRect(0, y, W, TRACK_HEIGHT);
      ctx.strokeStyle = '#1e293b';
      ctx.beginPath();
      ctx.moveTo(0, y + TRACK_HEIGHT - 0.5);
      ctx.lineTo(W, y + TRACK_HEIGHT - 0.5);
      ctx.stroke();
    });

    for (const seg of segments.values()) {
      const ti = tracks.findIndex((t) => t.id === seg.trackId);
      if (ti === -1) continue;
      const x = usToPx(seg.targetTimerange.start.value, zoom);
      const w = Math.max(MIN_CLIP_WIDTH, usToPx(seg.targetTimerange.duration, zoom));
      const top = ti * TRACK_HEIGHT + 5;
      const h = TRACK_HEIGHT - 11;
      const isSel = seg.id === selectedSegment;
      const isHov = seg.id === hovered;
      const base = CLIP_COLORS[seg.type] ?? '#3b82f6';

      ctx.globalAlpha = tracks[ti]?.muted ? 0.45 : 1;
      ctx.fillStyle = base;
      ctx.beginPath();
      ctx.roundRect(x, top, w, h, 5);
      ctx.fill();
      if (isHov && !isSel) {
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (isSel) {
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#fff';
        ctx.fillRect(x, top + 4, 3, h - 8);
        ctx.fillRect(x + w - 3, top + 4, 3, h - 8);
      }
      ctx.save();
      ctx.beginPath();
      ctx.rect(x + 6, top, Math.max(0, w - 12), h);
      ctx.clip();
      ctx.fillStyle = '#fff';
      ctx.font = '11px Inter, system-ui, sans-serif';
      ctx.textBaseline = 'middle';
      const label = String(seg.media.metadata?.name ?? seg.media.id);
      ctx.fillText(label, x + 8, top + h / 2 - 6);
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '10px "JetBrains Mono", monospace';
      const sp = seg.speed !== 1 ? ` ${seg.speed}x` : '';
      ctx.fillText(`${(Number(seg.targetTimerange.duration) / 1e6).toFixed(1)}s${sp}${seg.reverse ? ' ⟲' : ''}`, x + 8, top + h / 2 + 8);
      ctx.restore();
    }

    const drawMarker = (us: bigint, color: string) => {
      const mx = usToPx(us, zoom);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, H);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (inPoint !== null) drawMarker(inPoint, '#22c55e');
    if (outPoint !== null) drawMarker(outPoint, '#f97316');

    if (dropHint) {
      ctx.fillStyle = 'rgba(96,165,250,0.25)';
      ctx.fillRect(dropHint.x, dropHint.track * TRACK_HEIGHT, 120, TRACK_HEIGHT);
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.strokeRect(dropHint.x, dropHint.track * TRACK_HEIGHT + 1, 120, TRACK_HEIGHT - 2);
    }

    const px = usToPx(playhead, zoom);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, H);
    ctx.stroke();
  }, [tracks, segments, playhead, zoom, hovered, inPoint, outPoint, selectedSegment, contentWidth, contentHeight, dropHint]);

  useEffect(() => {
    const canvas = rulerRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const W = contentWidth;
    canvas.width = Math.round(W * dpr);
    canvas.height = RULER_HEIGHT * dpr;
    canvas.style.width = `${W}px`;
    canvas.style.height = `${RULER_HEIGHT}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b1220';
    ctx.fillRect(0, 0, W, RULER_HEIGHT);

    const p = pps(zoom);
    let tickS = 5;
    if (p > 400) tickS = 0.5;
    else if (p > 150) tickS = 1;
    else if (p > 60) tickS = 2;
    else if (p < 25) tickS = 10;
    const tickUs = tickS * 1_000_000;
    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    for (let t = 0, n = 0; usToPx(t, zoom) <= W; t += tickUs, n++) {
      const x = usToPx(t, zoom);
      const major = n % 2 === 0;
      ctx.strokeStyle = major ? '#64748b' : '#334155';
      ctx.beginPath();
      ctx.moveTo(x + 0.5, major ? RULER_HEIGHT - 12 : RULER_HEIGHT - 6);
      ctx.lineTo(x + 0.5, RULER_HEIGHT);
      ctx.stroke();
      if (major) {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(formatTimecode(t, false), x + 3, 11);
      }
    }
    const px = usToPx(playhead, zoom);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(px - 6, 0);
    ctx.lineTo(px + 6, 0);
    ctx.lineTo(px, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(px - 1, 0, 2, RULER_HEIGHT);
  }, [zoom, playhead, contentWidth]);

  // follow playhead while playing
  useEffect(() => {
    if (!isPlaying) return;
    const el = scrollRef.current;
    if (!el) return;
    const px = usToPx(playhead, zoom);
    if (px > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = px - 80;
    else if (px < el.scrollLeft) el.scrollLeft = Math.max(0, px - 80);
  }, [playhead, isPlaying, zoom]);

  // ctrl+wheel zoom (non-passive)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const st = useStore.getState();
        st.setZoom(st.zoom * (e.deltaY > 0 ? 0.9 : 1.1));
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  // ---------------------------------------------------------- interaction
  const canvasPoint = (clientX: number, clientY: number) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const hitTest = useCallback((x: number, y: number) => {
    const st = useStore.getState();
    const ti = Math.floor(y / TRACK_HEIGHT);
    const track = st.tracks[ti];
    if (!track) return null;
    let found: { id: string; zone: 'body' | 'start' | 'end' } | null = null;
    for (const seg of st.segments.values()) {
      if (seg.trackId !== track.id) continue;
      const sx = usToPx(seg.targetTimerange.start.value, st.zoom);
      const w = Math.max(MIN_CLIP_WIDTH, usToPx(seg.targetTimerange.duration, st.zoom));
      if (x >= sx && x <= sx + w) {
        const edge = Math.min(EDGE_PX, w / 3);
        found = { id: seg.id, zone: x - sx <= edge ? 'start' : sx + w - x <= edge ? 'end' : 'body' };
      }
    }
    return found;
  }, []);

  const snapUs = (us: bigint, exclude?: string, widthUs?: bigint): bigint => {
    const st = useStore.getState();
    if (!st.settings.snapEnabled) return us;
    const thresh = pxToUs(SNAP_PX, st.zoom);
    const pts: bigint[] = [0n, st.playhead];
    for (const s of st.segments.values()) {
      if (s.id === exclude) continue;
      pts.push(s.targetTimerange.start.value, s.targetTimerange.start.value + s.targetTimerange.duration);
    }
    let best = us;
    let bestD = thresh + 1n;
    for (const p of pts) {
      const d1 = us > p ? us - p : p - us;
      if (d1 < bestD) {
        bestD = d1;
        best = p;
      }
      if (widthUs !== undefined) {
        const e = us + widthUs;
        const d2 = e > p ? e - p : p - e;
        if (d2 < bestD) {
          bestD = d2;
          best = p - widthUs;
        }
      }
    }
    return best < 0n ? 0n : best;
  };

  const onCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    const st = useStore.getState();
    const { x, y } = canvasPoint(e.clientX, e.clientY);
    const hit = hitTest(x, y);
    if (hit) {
      const seg = st.segments.get(hit.id)!;
      st.setSelectedSegment(hit.id);
      dragRef.current = {
        mode: hit.zone === 'start' ? 'trimStart' : hit.zone === 'end' ? 'trimEnd' : 'move',
        segId: hit.id,
        startX: e.clientX,
        startY: e.clientY,
        origStart: seg.targetTimerange.start.value,
        grabOffsetUs: pxToUs(x, st.zoom) - seg.targetTimerange.start.value,
        began: false,
      };
    } else {
      st.setSelectedSegment(null);
      st.setIsPlaying(false);
      st.setPlayhead(pxToUs(Math.max(0, x), st.zoom));
      dragRef.current = { mode: 'playhead', startX: e.clientX, startY: e.clientY, origStart: 0n, grabOffsetUs: 0n, began: true };
    }
    attachDrag();
  };

  const onRulerMouseDown = (e: React.MouseEvent) => {
    const st = useStore.getState();
    st.setIsPlaying(false);
    const rect = rulerWrapRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left + (scrollRef.current?.scrollLeft ?? 0);
    st.setPlayhead(pxToUs(Math.max(0, x), st.zoom));
    dragRef.current = { mode: 'playhead', startX: e.clientX, startY: e.clientY, origStart: 0n, grabOffsetUs: 0n, began: true };
    attachDrag();
  };

  const attachDrag = () => {
    const onMove = (ev: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const st = useStore.getState();
      if (d.mode === 'playhead') {
        const rect = canvasRef.current!.getBoundingClientRect();
        st.setPlayhead(pxToUs(Math.max(0, ev.clientX - rect.left), st.zoom));
        return;
      }
      if (!d.began) {
        if (Math.abs(ev.clientX - d.startX) < 3 && Math.abs(ev.clientY - d.startY) < 3) return;
        st.beginEdit();
        d.began = true;
      }
      const { x, y } = canvasPoint(ev.clientX, ev.clientY);
      const seg = st.segments.get(d.segId!);
      if (!seg) return;
      const tUs = pxToUs(Math.max(0, x), st.zoom);
      if (d.mode === 'move') {
        const raw = tUs - d.grabOffsetUs;
        const start = snapUs(raw < 0n ? 0n : raw, seg.id, seg.targetTimerange.duration);
        const ti = Math.max(0, Math.min(st.tracks.length - 1, Math.floor(y / TRACK_HEIGHT)));
        st.moveSegmentLive(seg.id, start as Microseconds, st.tracks[ti]?.id);
      } else if (d.mode === 'trimStart') {
        st.trimSegmentLive(seg.id, 'start', snapUs(tUs, seg.id) as Microseconds);
      } else {
        st.trimSegmentLive(seg.id, 'end', snapUs(tUs, seg.id) as Microseconds);
      }
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const onCanvasMouseMove = (e: React.MouseEvent) => {
    if (dragRef.current) return;
    const { x, y } = canvasPoint(e.clientX, e.clientY);
    const hit = hitTest(x, y);
    setHovered(hit?.id ?? null);
    if (canvasRef.current) {
      canvasRef.current.style.cursor = !hit ? 'text' : hit.zone === 'body' ? 'grab' : 'ew-resize';
    }
  };

  // ------------------------------------------------------------ drag & drop
  const onDragOver = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes(MEDIA_DRAG_TYPE)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const { x, y } = canvasPoint(e.clientX, e.clientY);
    const track = Math.max(0, Math.min(tracks.length - 1, Math.floor(y / TRACK_HEIGHT)));
    setDropHint({ x: Math.max(0, x), track });
  };
  const onDrop = (e: React.DragEvent) => {
    const id = e.dataTransfer.getData(MEDIA_DRAG_TYPE);
    setDropHint(null);
    if (!id) return;
    e.preventDefault();
    const st = useStore.getState();
    const { x, y } = canvasPoint(e.clientX, e.clientY);
    const ti = Math.floor(y / TRACK_HEIGHT);
    const start = snapUs(pxToUs(Math.max(0, x), st.zoom));
    let targetTrackId = st.tracks[ti]?.id;
    if (!targetTrackId) {
      const item = st.mediaItems.find((m) => m.id === id);
      targetTrackId = st.addTrackOfType(item?.type === 'audio' ? 'audio' : 'video');
    }
    st.addMediaToTimeline(id, { trackId: targetTrackId, start: start as Microseconds });
  };

  const onCanvasContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    const { x, y } = canvasPoint(e.clientX, e.clientY);
    const hit = hitTest(x, y);
    if (hit) {
      setSelectedSegment(hit.id);
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        segmentId: hit.id,
      });
    } else {
      setContextMenu({
        x: e.clientX,
        y: e.clientY,
        segmentId: null,
      });
    }
  };

  // ------------------------------------------------------------------ view
  return (
    <div className={`flex flex-col h-full bg-slate-900 ${className}`} data-testid="timeline">
      {/* Ruler row */}
      <div className="flex flex-shrink-0 border-b border-border" style={{ height: RULER_HEIGHT }}>
        <div className="w-40 flex-shrink-0 bg-card border-r border-border flex items-center gap-1 px-1.5 overflow-x-auto">
          <button
            className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent font-medium"
            title="Add video track"
            onClick={() => addTrackOfType('video')}
          >
            <Plus className="w-3 h-3" /> Video
          </button>
          <button
            className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent font-medium"
            title="Add audio track"
            onClick={() => addTrackOfType('audio')}
          >
            <Plus className="w-3 h-3" /> Audio
          </button>
          <button
            className="flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-muted hover:bg-accent font-medium"
            title="Add text track"
            onClick={() => addTrackOfType('text')}
          >
            <Plus className="w-3 h-3" /> Text
          </button>
        </div>
        <div ref={rulerWrapRef} className="flex-1 overflow-hidden cursor-pointer" onMouseDown={onRulerMouseDown}>
          <canvas ref={rulerRef} className="block" />
        </div>
      </div>

      <div className="flex flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
        {/* Track headers */}
        <div className="w-40 flex-shrink-0 bg-card border-r border-border self-start">
          {tracks.map((track) => {
            const count = Array.from(segments.values()).filter((s) => s.trackId === track.id).length;
            return (
              <div
                key={track.id}
                data-testid="track-header"
                className="flex items-center gap-2 px-2 border-b border-border/50"
                style={{ height: TRACK_HEIGHT }}
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: CLIP_COLORS[track.type] }}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate">{track.name}</div>
                  <div className="text-[10px] text-muted-foreground">
                    {track.type} · {count} clip{count === 1 ? '' : 's'}
                  </div>
                </div>
                <div className="flex items-center gap-0.5">
                  <div className="flex flex-col">
                    <button
                      className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      title="Move track up"
                      onClick={() => reorderTrack(track.id, 'up')}
                    >
                      <ChevronUp className="w-2.5 h-2.5" />
                    </button>
                    <button
                      className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground"
                      title="Move track down"
                      onClick={() => reorderTrack(track.id, 'down')}
                    >
                      <ChevronDown className="w-2.5 h-2.5" />
                    </button>
                  </div>
                  <div className="flex flex-col gap-0.5">
                    <button
                      className="p-0.5 rounded hover:bg-accent"
                      title={track.muted ? 'Unmute track' : 'Mute track'}
                      onClick={() => updateTrack(track.id, { muted: !track.muted })}
                    >
                      {track.muted ? <VolumeX className="w-3 h-3 text-destructive" /> : <Volume2 className="w-3 h-3" />}
                    </button>
                    <button
                      className="p-0.5 rounded hover:bg-accent text-destructive"
                      title="Delete track"
                      onClick={() => removeTrack(track.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Canvas */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative"
          onScroll={(e) => {
            if (rulerWrapRef.current) rulerWrapRef.current.scrollLeft = e.currentTarget.scrollLeft;
          }}
          onDragOver={onDragOver}
          onDragLeave={() => setDropHint(null)}
          onDrop={onDrop}
        >
          <canvas
            ref={canvasRef}
            data-testid="timeline-canvas"
            className="block"
            onMouseDown={onCanvasMouseDown}
            onMouseMove={onCanvasMouseMove}
            onMouseLeave={() => setHovered(null)}
            onContextMenu={onCanvasContextMenu}
          />
          {segments.size === 0 && (
            <div className="absolute left-4 top-4 text-xs text-muted-foreground pointer-events-none">
              Drag media here, or press + on a media item
            </div>
          )}
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-card text-[10px] text-muted-foreground font-mono">
        <span data-testid="timeline-timecode">{formatTimecode(playhead, showFrames)}</span>
        <span className="flex items-center gap-3">
          <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setZoom(zoom / 1.25)} title="Zoom out">
            <ZoomOut className="w-3 h-3" />
          </button>
          {Math.round(zoom * 100)}%
          <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => setZoom(zoom * 1.25)} title="Zoom in">
            <ZoomIn className="w-3 h-3" />
          </button>
          <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={splitAtPlayhead} title="Split at playhead (Ctrl+B)">
            <Scissors className="w-3 h-3" /> Ctrl+B split
          </button>
        </span>
      </div>

      {/* Floating Context Menu */}
      {contextMenu && (
        <div
          data-testid="timeline-context-menu"
          className="fixed z-50 min-w-[160px] bg-popover text-popover-foreground border border-border rounded-md shadow-lg py-1 text-xs select-none"
          style={{
            left: Math.min(window.innerWidth - 180, contextMenu.x),
            top: Math.min(window.innerHeight - 180, contextMenu.y),
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {contextMenu.segmentId ? (
            <>
              <button
                data-testid="context-menu-split"
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left"
                onClick={() => {
                  splitAtPlayhead();
                  setContextMenu(null);
                }}
              >
                <span className="flex items-center gap-2">
                  <Scissors className="w-3.5 h-3.5" /> Split at Playhead
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Ctrl+B</span>
              </button>
              <button
                data-testid="context-menu-duplicate"
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left"
                onClick={() => {
                  if (contextMenu.segmentId) duplicateSegment(contextMenu.segmentId);
                  setContextMenu(null);
                }}
              >
                <span className="flex items-center gap-2">
                  <Copy className="w-3.5 h-3.5" /> Duplicate
                </span>
                <span className="text-[10px] text-muted-foreground font-mono">Ctrl+D</span>
              </button>
              <button
                data-testid="context-menu-properties"
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left"
                onClick={() => {
                  setActivePane('inspector');
                  setContextMenu(null);
                }}
              >
                <Settings className="w-3.5 h-3.5" /> Properties (Inspector)
              </button>
              <div className="h-px bg-border my-1" />
              <button
                data-testid="context-menu-delete"
                className="w-full flex items-center justify-between px-3 py-1.5 hover:bg-destructive hover:text-destructive-foreground text-destructive text-left"
                onClick={() => {
                  if (contextMenu.segmentId) removeSegment(contextMenu.segmentId);
                  setContextMenu(null);
                }}
              >
                <span className="flex items-center gap-2">
                  <Trash2 className="w-3.5 h-3.5" /> Delete
                </span>
                <span className="text-[10px] font-mono">Del</span>
              </button>
            </>
          ) : (
            <>
              <button
                data-testid="context-menu-add-video"
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left"
                onClick={() => {
                  addTrackOfType('video');
                  setContextMenu(null);
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Add Video Track
              </button>
              <button
                data-testid="context-menu-add-audio"
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left"
                onClick={() => {
                  addTrackOfType('audio');
                  setContextMenu(null);
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Add Audio Track
              </button>
              <button
                data-testid="context-menu-add-text"
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left"
                onClick={() => {
                  addTrackOfType('text');
                  setContextMenu(null);
                }}
              >
                <Plus className="w-3.5 h-3.5" /> Add Text Track
              </button>
              <div className="h-px bg-border my-1" />
              <button
                data-testid="context-menu-add-sample-text"
                className="w-full flex items-center gap-2 px-3 py-1.5 hover:bg-accent hover:text-accent-foreground text-left"
                onClick={() => {
                  addTextSegment('Title Text');
                  setContextMenu(null);
                }}
              >
                <Type className="w-3.5 h-3.5" /> Insert Text at Playhead
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
