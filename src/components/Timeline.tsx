import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../store';
import {
  Volume2, VolumeX, Trash2, Scissors, ZoomIn, ZoomOut,
} from 'lucide-react';

const TRACK_HEIGHT = 80;
const RULER_HEIGHT = 36;
const MIN_CLIP_WIDTH = 24;

/** zoom = 1 -> 100 px per second */
const pixelsPerSecond = (zoom: number) => 100 * (zoom || 1);
const usToPx = (us: number | bigint, zoom: number) =>
  (Number(us) / 1_000_000) * pixelsPerSecond(zoom);
const pxToUs = (px: number, zoom: number) =>
  BigInt(Math.round((px / pixelsPerSecond(zoom)) * 1_000_000));

function formatTimecode(us: number | bigint): string {
  const totalSeconds = Number(us) / 1_000_000;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.floor(totalSeconds % 60);
  const frames = Math.floor((totalSeconds % 1) * 30);
  return `${hours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${frames
    .toString()
    .padStart(2, '0')}`;
}

export function Timeline({ className = '' }: { className?: string }) {
  const {
    tracks,
    segments,
    playhead,
    setPlayhead,
    isPlaying,
    setIsPlaying,
    zoom,
    setZoom,
    inPoint,
    outPoint,
    removeSegment,
    splitSegment,
  } = useStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rulerCanvasRef = useRef<HTMLCanvasElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);

  // How much timeline width the visible viewport represents
  const getViewportWidth = () => scrollRef.current?.clientWidth ?? 800;
  const timelineWidth = () => Math.max(getViewportWidth() + 400, usToPx(30_000_000, zoom));

  // ---------------------------------------------------------------- drawing
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = timelineWidth();
    const height = Math.max(TRACK_HEIGHT * Math.max(tracks.length, 1), 120);
    const dpr = window.devicePixelRatio || 1;
    if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Track lanes
    tracks.forEach((track: any, index: number) => {
      const y = index * TRACK_HEIGHT;
      ctx.fillStyle =
        track.type === 'video' ? '#1e293b' : track.type === 'audio' ? '#1e1b2e' : '#16241b';
      ctx.fillRect(0, y, width, TRACK_HEIGHT - 1);
      ctx.strokeStyle = '#334155';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + TRACK_HEIGHT - 0.5);
      ctx.lineTo(width, y + TRACK_HEIGHT - 0.5);
      ctx.stroke();
    });

    // Segments
    const segmentList = Array.from(segments.values()) as any[];
    for (const segment of segmentList) {
      const trackIndex = tracks.findIndex((t: any) => t.id === segment.trackId);
      if (trackIndex === -1) continue;

      const y = trackIndex * TRACK_HEIGHT;
      const x = usToPx(segment.targetTimerange.start, zoom);
      const w = Math.max(MIN_CLIP_WIDTH, usToPx(segment.targetTimerange.duration, zoom));
      if (x + w < 0 || x > width) continue;

      const isHovered = hoveredSegment === segment.id;
      ctx.fillStyle = isHovered
        ? '#60a5fa'
        : (trackIndex % 3 === 0 ? '#3b82f6' : trackIndex % 3 === 1 ? '#f59e0b' : '#22c55e');

      ctx.beginPath();
      const r = 4;
      const top = y + 6;
      const h = TRACK_HEIGHT - 14;
      ctx.roundRect(x, top, w, h, r);
      ctx.fill();

      // Label
      ctx.fillStyle = '#f8fafc';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const label = segment.media?.metadata?.name || segment.media?.id || segment.id.slice(0, 8);
      if (ctx.measureText(label).width < w - 16) {
        ctx.fillText(label, x + 8, top + h / 2);
      }

      // Trim handles on hover
      if (isHovered) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x, top, 4, h);
        ctx.fillRect(x + w - 4, top, 4, h);
      }
    }

    // Playhead
    const px = usToPx(playhead, zoom);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(px - 6, 0);
    ctx.lineTo(px + 6, 0);
    ctx.lineTo(px, 9);
    ctx.closePath();
    ctx.fill();

    // In / Out markers
    const drawMarker = (us: number | bigint, color: string) => {
      const mx = usToPx(us, zoom);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(mx, 0);
      ctx.lineTo(mx, height);
      ctx.stroke();
      ctx.setLineDash([]);
    };
    if (inPoint) drawMarker(inPoint, '#22c55e');
    if (outPoint) drawMarker(outPoint, '#f97316');
  }, [tracks, segments, playhead, zoom, hoveredSegment, inPoint, outPoint]);

  // ------------------------------------------------------------------ ruler
  const drawRuler = useCallback(() => {
    const canvas = rulerCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = timelineWidth();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = RULER_HEIGHT * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${RULER_HEIGHT}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, RULER_HEIGHT);

    // Choose a tick interval that keeps labels readable
    const pxPerSec = pixelsPerSecond(zoom);
    let tickSeconds = 5;
    if (pxPerSec > 400) tickSeconds = 0.5;
    else if (pxPerSec > 150) tickSeconds = 1;
    else if (pxPerSec > 60) tickSeconds = 2;
    else if (pxPerSec < 25) tickSeconds = 10;

    const tickUs = tickSeconds * 1_000_000;
    const startTick = Math.floor(0 / tickUs) * tickUs;

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    for (let t = startTick; t * 1 <= (width / pxPerSec) * 1_000_000; t += tickUs) {
      const x = usToPx(t, zoom);
      if (x > width) break;
      const isMajor = Math.round(t / tickUs) % 5 === 0;
      ctx.strokeStyle = isMajor ? '#64748b' : '#475569';
      ctx.beginPath();
      ctx.moveTo(x, isMajor ? RULER_HEIGHT - 14 : RULER_HEIGHT - 8);
      ctx.lineTo(x, RULER_HEIGHT);
      ctx.stroke();
      if (isMajor) {
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(formatTimecode(t), x, 12);
      }
    }

    // Playhead marker on ruler
    const px = usToPx(playhead, zoom);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(px - 1, 0, 2, RULER_HEIGHT);
  }, [zoom, playhead, tracks.length]);

  // ------------------------------------------------------------- rAF render
  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      drawRuler();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw, drawRuler]);

  // ------------------------------------------------------------ interaction
  const seekFromEvent = (clientX: number) => {
    const el = scrollRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left + el.scrollLeft;
    setPlayhead(pxToUs(Math.max(0, x), zoom));
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    setIsDraggingPlayhead(true);
    seekFromEvent(e.clientX);
  };

  useEffect(() => {
    if (!isDraggingPlayhead) return;
    const onMove = (e: MouseEvent) => seekFromEvent(e.clientX);
    const onUp = () => setIsDraggingPlayhead(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDraggingPlayhead, zoom]);

  const handleWheel = (e: React.WheelEvent) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(Math.max(0.05, Math.min(200, zoom * factor)));
    }
    // horizontal pan is native overflow scroll
  };

  // -------------------------------------------------------------- shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setPlayhead(playhead - BigInt(33_333));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setPlayhead(playhead + BigInt(33_333));
          break;
        case 'KeyJ':
          setPlayhead(Math.max(BigInt(0), playhead - BigInt(1_000_000)));
          break;
        case 'KeyL':
          setPlayhead(playhead + BigInt(1_000_000));
          break;
        case 'KeyB':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const seg = Array.from(segments.values()).find(
              (s: any) => playhead >= s.targetTimerange.start && playhead < s.targetTimerange.start + s.targetTimerange.duration
            );
            if (seg) splitSegment(seg.id, playhead);
          }
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [playhead, isPlaying, segments, setIsPlaying, setPlayhead, splitSegment]);

  // ------------------------------------------------------------------- view
  return (
    <div className={`flex flex-col h-full bg-slate-900 ${className}`}>
      {/* Ruler */}
      <div
        className="relative border-b border-border overflow-hidden cursor-pointer"
        style={{ height: RULER_HEIGHT }}
        onMouseDown={(e) => {
          setIsDraggingPlayhead(true);
          seekFromEvent(e.clientX);
        }}
      >
        <canvas ref={rulerCanvasRef} className="block" />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Track headers */}
        <div className="w-44 flex-shrink-0 bg-card border-r border-border overflow-y-auto">
          <div className="px-3 py-2 border-b border-border text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Tracks
          </div>
          {tracks.length === 0 && (
            <div className="p-3 text-xs text-muted-foreground">
              No tracks yet — import media to get started.
            </div>
          )}
          {tracks.map((track: any, index: number) => (
            <div
              key={track.id}
              className="flex items-center gap-2 px-2 border-b border-border/50"
              style={{ height: TRACK_HEIGHT }}
            >
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  track.type === 'video'
                    ? 'bg-blue-500'
                    : track.type === 'audio'
                      ? 'bg-amber-500'
                      : 'bg-emerald-500'
                }`}
              />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium truncate">{track.name}</div>
                <div className="text-[10px] text-muted-foreground">
                  {track.type} · {track.segments?.length ?? 0} clips
                </div>
              </div>
              <div className="flex flex-col gap-1 opacity-60 hover:opacity-100 transition-opacity">
                <button className="p-0.5 rounded hover:bg-accent" title="Mute">
                  <Volume2 className="w-3 h-3" />
                </button>
                <button
                  className="p-0.5 rounded hover:bg-accent text-destructive"
                  title="Delete track"
                  onClick={() => {
                    /* handled via store command later */
                  }}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Scrollable canvas area */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-x-auto overflow-y-auto relative"
          onWheel={handleWheel}
        >
          <canvas
            ref={canvasRef}
            className="block cursor-text"
            onMouseDown={handleCanvasMouseDown}
            onMouseEnter={(e) => {
              const segId = (e.target as HTMLCanvasElement).dataset.hover as string | undefined;
              if (segId) setHoveredSegment(segId);
            }}
            onMouseLeave={() => setHoveredSegment(null)}
          />
        </div>
      </div>

      {/* Status bar */}
      <div className="flex items-center justify-between px-3 py-1 border-t border-border bg-card text-[10px] text-muted-foreground font-mono">
        <span>{formatTimecode(playhead)}</span>
        <span className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1">
            <ZoomOut className="w-3 h-3" /> {Math.round(zoom * 100)}%
            <ZoomIn className="w-3 h-3" />
          </span>
          <span className="inline-flex items-center gap-1">
            <Scissors className="w-3 h-3" /> Ctrl+B split
          </span>
        </span>
      </div>
    </div>
  );
}
