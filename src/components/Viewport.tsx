import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../store';
import { Maximize2, Minimize2, Pause, Play, Settings, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { SafeAreaOverlay } from './SafeArea';
import type { Microseconds } from '../core/timeline/types';
import { renderWebGLFrame, renderFrame, syncMedia } from '../editor/renderer';
import { WebGLCompositor } from '../core/webcodecs/webglCompositor';
import type { AspectRatio } from '../store';

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
  const canvasAspectRatio = useStore((s) => s.canvasAspectRatio);
  const setCanvasAspectRatio = useStore((s) => s.setCanvasAspectRatio);
  const volume = useStore((s) => s.volume);
  const setVolume = useStore((s) => s.setVolume);
  const openDialog = useStore((s) => s.openDialog);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const compositorRef = useRef<WebGLCompositor | null>(null);
  const glRef = useRef<WebGL2RenderingContext | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Initialize WebGL 2 Compositor
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const gl = canvas.getContext('webgl2', {
        alpha: false,
        desynchronized: true,
        antialias: true,
        preserveDrawingBuffer: false,
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

  // DPR-aware canvas sizing
  useEffect(() => {
    const canvas = canvasRef.current;
    const wrapper = wrapperRef.current;
    if (!canvas || !wrapper) return;
    const resize = () => {
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrapper);
    return () => observer.disconnect();
  }, []);

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
            letterboxFill: '#000',
          });
        } catch (err) {
          console.warn('renderWebGLFrame error', err);
        } finally {
          isRendering = false;
        }
      } else if (!compositor) {
        // Fallback to 2D context if WebGL2 not available
        const ctx = canvas.getContext('2d');
        if (ctx) {
          renderFrame(ctx, canvas.width, canvas.height, {
            segments: st.segments.values(),
            tracks: st.tracks,
            t: st.playhead,
            aspect: st.canvasAspectRatio,
            letterboxFill: '#000',
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

  return (
    <div
      ref={wrapperRef}
      data-testid="viewport"
      className={`relative w-full h-full bg-black overflow-hidden ${className}`}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
    >
      <canvas ref={canvasRef} data-testid="viewport-canvas" className="w-full h-full block" />

      {segmentsSize === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none text-slate-400 text-sm select-none">
          Add media to the timeline to preview
        </div>
      )}

      <div className="absolute inset-0 pointer-events-none">
        <SafeAreaOverlay
          aspectRatio={canvasAspectRatio}
          showActionSafe={safeArea.actionSafe}
          showTitleSafe={safeArea.titleSafe}
          showTikTokSafe={safeArea.tiktokSafe}
        />
      </div>

      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
          <div className="mb-2 py-1.5 cursor-pointer" onMouseDown={onBarDown} ref={barRef} data-testid="viewport-scrubber">
            <div className="relative h-1.5 bg-white/20 rounded-full">
              <div className="absolute inset-y-0 left-0 bg-red-500/70 rounded-full" style={{ width: `${frac * 100}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow"
                style={{ left: `${frac * 100}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1">
              <button
                className="p-1.5 text-white/80 hover:text-white transition-colors"
                title="Back 1s (J)"
                onClick={() => setPlayhead((playhead - 1_000_000n) as Microseconds)}
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 text-white hover:text-white transition-colors"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
                onClick={() => setIsPlaying(!isPlaying)}
                disabled={segmentsSize === 0}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button
                className="p-1.5 text-white/80 hover:text-white transition-colors"
                title="Forward 1s (L)"
                onClick={() => setPlayhead((playhead + 1_000_000n) as Microseconds)}
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            <div className="text-white/80 font-mono text-xs" data-testid="viewport-timecode">
              {formatTimecode(playhead)} / {formatTimecode(duration)}
            </div>

            <div className="flex items-center gap-1">
              <select
                value={canvasAspectRatio}
                onChange={(e) => setCanvasAspectRatio(e.target.value as AspectRatio)}
                className="text-[10px] bg-black/50 text-white border border-white/20 rounded px-1 py-0.5"
                title="Canvas aspect ratio"
              >
                {['16:9', '9:16', '1:1', '4:3', '21:9'].map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
              <button className="p-1 text-white/70 hover:text-white" onClick={() => setVolume(volume === 0 ? 1 : 0)} title="Mute">
                {volume === 0 ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="w-20 h-1 accent-primary"
                title="Volume"
              />
              <button className="p-1.5 text-white/70 hover:text-white transition-colors" title="Toggle fullscreen" onClick={toggleFullscreen}>
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button className="p-1.5 text-white/70 hover:text-white transition-colors" title="Settings" onClick={() => openDialog('settings')}>
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
