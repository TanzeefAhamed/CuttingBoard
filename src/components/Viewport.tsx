import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../store';
import {
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Settings,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Camera,
  Shield,
} from 'lucide-react';
import { SafeAreaOverlay } from './SafeArea';
import type { Microseconds } from '../core/timeline/types';
import { ASPECTS, renderWebGLFrame, renderFrame, syncMedia } from '../editor/renderer';
import { WebGLCompositor } from '../core/webcodecs/webglCompositor';
import type { AspectRatio } from '../store';
import { TextureButton } from './ui/cult';

interface ViewportProps {
  className?: string;
}

function formatTimecode(us: number | bigint): string {
  const total = Number(us) / 1_000_000;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const c = Math.floor((total % 1) * 100);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${c
    .toString()
    .padStart(2, '0')}`;
}

export function Viewport({ className = '' }: ViewportProps) {
  const isPlaying = useStore((s) => s.isPlaying);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const playhead = useStore((s) => s.playhead);
  const setPlayhead = useStore((s) => s.setPlayhead);
  const segmentsSize = useStore((s) => s.segments.size);
  const duration = useStore((s) => s.getDuration());
  const safeArea = useStore((s) => s.safeArea);
  const setSafeArea = useStore((s) => s.setSafeArea);
  const canvasAspectRatio = useStore((s) => s.canvasAspectRatio);
  const setCanvasAspectRatio = useStore((s) => s.setCanvasAspectRatio);
  const volume = useStore((s) => s.volume);
  const setVolume = useStore((s) => s.setVolume);
  const openDialog = useStore((s) => s.openDialog);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<WebGLCompositor | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [stageBounds, setStageBounds] = useState<{ width: number; height: number }>({ width: 850, height: 500 });

  // Compute exact aspect-ratio stage box dimensions fitting cleanly inside stageRef
  const ratio = ASPECTS[canvasAspectRatio] ?? 16 / 9;
  const availW = Math.max(120, stageBounds.width - 24);
  const availH = Math.max(120, stageBounds.height - 24);
  let frameW = availW;
  let frameH = frameW / ratio;
  if (frameH > availH) {
    frameH = availH;
    frameW = frameH * ratio;
  }
  const roundedFrameW = Math.max(1, Math.round(frameW));
  const roundedFrameH = Math.max(1, Math.round(frameH));

  // Initialize WebGL 2 Compositor (preserveDrawingBuffer: true ensures stable frames & PNG snapshots)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      if (gl) {
        glRef.current = gl;
        compositorRef.current = new WebGLCompositor(gl);
      }
    } catch (e) {
      console.warn('WebGL2 init failed, falling back to 2D canvas', e);
    }
    return () => {
      compositorRef.current?.destroy();
      compositorRef.current = null;
      glRef.current = null;
    };
  }, []);

  // Measure outer stage container
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const measure = () => {
      const rect = stage.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setStageBounds({ width: rect.width, height: rect.height });
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  // DPR-aware canvas backing store locked to framed aspect box
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(roundedFrameW * dpr));
    canvas.height = Math.max(1, Math.round(roundedFrameH * dpr));
  }, [roundedFrameW, roundedFrameH]);

  // Render loop: sync media elements to the playhead, then composite via WebGL 2 & WebCodecs
  useEffect(() => {
    let raf = 0;
    let isRendering = false;
    const render = async () => {
      const canvas = canvasRef.current;
      const compositor = compositorRef.current;
      const gl = glRef.current;
      if (!canvas) {
        raf = requestAnimationFrame(render);
        return;
      }

      const st = useStore.getState();
      if (!st.isExporting) {
        syncMedia(st.segments.values(), st.tracks, st.playhead, st.isPlaying, st.playbackSpeed, st.volume);
      }

      if (compositor && gl && !isRendering) {
        isRendering = true;
        try {
          await renderWebGLFrame(compositor, gl, canvas.width, canvas.height, {
            segments: st.segments.values(),
            tracks: st.tracks,
            t: st.playhead,
            aspect: st.canvasAspectRatio,
            letterboxFill: '#09090b',
          });
        } catch (err) {
          console.warn('renderWebGLFrame error', err);
        } finally {
          isRendering = false;
        }
      } else if (!compositor) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          renderFrame(ctx, canvas.width, canvas.height, {
            segments: st.segments.values(),
            tracks: st.tracks,
            t: st.playhead,
            aspect: st.canvasAspectRatio,
            letterboxFill: '#09090b',
          });
        }
      }
      raf = requestAnimationFrame(render);
    };
    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Fullscreen state follows the real document state
  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement === wrapperRef.current);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  const toggleFullscreen = () => {
    const el = wrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void el.requestFullscreen?.().catch(() => undefined);
  };

  const takeSnapshot = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `cuttingboard-frame-${Date.now()}.png`;
      a.click();
    } catch (e) {
      console.warn('Snapshot error', e);
    }
  };

  // Scrub bar
  const seekFromBar = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar) return;
      const dur = useStore.getState().getDuration();
      const r = bar.getBoundingClientRect();
      const frac = Math.max(0, Math.min(1, (clientX - r.left) / r.width));
      setPlayhead(BigInt(Math.round(Number(dur) * frac)) as Microseconds);
    },
    [setPlayhead],
  );

  const onBarDown = (e: React.MouseEvent) => {
    seekFromBar(e.clientX);
    const move = (ev: MouseEvent) => seekFromBar(ev.clientX);
    const up = () => {
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    window.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
  };

  const frac = duration > 0n ? Math.min(1, Number(playhead) / Number(duration)) : 0;
  const anySafeArea = safeArea.actionSafe || safeArea.titleSafe || safeArea.tiktokSafe;

  return (
    <div
      ref={wrapperRef}
      data-testid="viewport"
      className={`flex flex-col w-full h-full bg-zinc-950 overflow-hidden ${className}`}
    >
      {/* Top Composition Stage Region */}
      <div
        ref={stageRef}
        className="flex-1 min-h-0 relative flex items-center justify-center bg-zinc-950 overflow-hidden p-3"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.05) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
        <div
          style={{ width: roundedFrameW, height: roundedFrameH }}
          className="relative rounded-lg overflow-hidden shadow-[0_12px_40px_rgba(0,0,0,0.85)] ring-1 ring-white/15 bg-black transition-[width,height] duration-150 flex-shrink-0"
        >
          <canvas ref={canvasRef} data-testid="viewport-canvas" className="w-full h-full block" />

          {anySafeArea && (
            <div className="absolute inset-0 pointer-events-none">
              <SafeAreaOverlay
                aspectRatio={canvasAspectRatio}
                showActionSafe={safeArea.actionSafe}
                showTitleSafe={safeArea.titleSafe}
                showTikTokSafe={safeArea.tiktokSafe}
              />
            </div>
          )}
        </div>

        {segmentsSize === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none select-none p-4">
            <div className="px-4 py-2.5 rounded-xl border border-white/[0.08] bg-zinc-900/80 backdrop-blur-md text-xs text-slate-300 shadow-lg">
              Add media from the left panel or timeline to preview
            </div>
          </div>
        )}
      </div>

      {/* Dedicated Docked Cult UI Transport & Utility Bar (never collides with canvas) */}
      <div className="flex-shrink-0 px-3 py-2 bg-card/95 dark:bg-zinc-900/95 border-t border-border/80 dark:border-white/[0.08] backdrop-blur-md space-y-1.5 select-none">
        {/* Scrubber */}
        <div
          className="py-1 cursor-pointer group"
          onMouseDown={onBarDown}
          ref={barRef}
          data-testid="viewport-scrubber"
        >
          <div className="relative h-1.5 bg-muted dark:bg-white/15 rounded-full overflow-visible">
            <div
              className="absolute inset-y-0 left-0 bg-primary rounded-full"
              style={{ width: `${frac * 100}%` }}
            />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-white border-2 border-primary rounded-full shadow transition-transform group-hover:scale-125"
              style={{ left: `${frac * 100}%` }}
            />
          </div>
        </div>

        {/* Transport & Controls Row */}
        <div className="flex items-center justify-between gap-2 whitespace-nowrap overflow-x-auto scrollbar-hide">
          <div className="flex items-center gap-1">
            <TextureButton
              variant="ghost"
              size="icon"
              title="Back 1s (J)"
              onClick={() => setPlayhead((playhead - 1_000_000n) as Microseconds)}
            >
              <SkipBack className="w-3.5 h-3.5" />
            </TextureButton>
            <TextureButton
              variant={isPlaying ? 'primary' : 'secondary'}
              size="icon"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
              aria-label={isPlaying ? 'Pause' : 'Play'}
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={segmentsSize === 0}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </TextureButton>
            <TextureButton
              variant="ghost"
              size="icon"
              title="Forward 1s (L)"
              onClick={() => setPlayhead((playhead + 1_000_000n) as Microseconds)}
            >
              <SkipForward className="w-3.5 h-3.5" />
            </TextureButton>
          </div>

          <div
            className="px-2.5 py-0.5 rounded-md bg-muted/60 dark:bg-zinc-950/80 border border-border/60 dark:border-white/[0.06] text-foreground font-mono text-[11px]"
            data-testid="viewport-timecode"
          >
            {formatTimecode(playhead)} <span className="text-muted-foreground">/ {formatTimecode(duration)}</span>
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={canvasAspectRatio}
              onChange={(e) => setCanvasAspectRatio(e.target.value as AspectRatio)}
              className="text-[11px] bg-muted/60 dark:bg-zinc-950 text-foreground border border-border/80 dark:border-white/[0.08] rounded-md px-1.5 py-0.5 cursor-pointer"
              title="Canvas aspect ratio"
            >
              {['16:9', '9:16', '1:1', '4:3', '21:9'].map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>

            <TextureButton
              variant={anySafeArea ? 'active' : 'ghost'}
              size="icon"
              title={anySafeArea ? 'Hide Safe Area Guides' : 'Show Safe Area Guides'}
              onClick={() =>
                setSafeArea({
                  actionSafe: !anySafeArea,
                  titleSafe: !anySafeArea,
                })
              }
            >
              <Shield className="w-3.5 h-3.5" />
            </TextureButton>

            <div className="hidden sm:flex items-center gap-1 pl-1 border-l border-border/60">
              <TextureButton
                variant="ghost"
                size="icon"
                onClick={() => setVolume(volume === 0 ? 1 : 0)}
                title="Mute"
              >
                {volume === 0 ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </TextureButton>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-16 h-1 accent-primary cursor-pointer"
                title="Volume"
              />
            </div>

            <TextureButton
              variant="ghost"
              size="icon"
              title="Capture frame snapshot (PNG)"
              onClick={takeSnapshot}
              data-testid="viewport-snapshot-btn"
            >
              <Camera className="w-3.5 h-3.5" />
            </TextureButton>
            <TextureButton
              variant="ghost"
              size="icon"
              title="Toggle fullscreen"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            </TextureButton>
            <TextureButton
              variant="ghost"
              size="icon"
              title="Settings"
              onClick={() => openDialog('settings')}
            >
              <Settings className="w-3.5 h-3.5" />
            </TextureButton>
          </div>
        </div>
      </div>
    </div>
  );
}
