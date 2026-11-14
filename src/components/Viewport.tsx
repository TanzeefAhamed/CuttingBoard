import React, { useRef, useEffect, useState } from 'react';
import { useStore } from '../store';
import { Maximize2, Minimize2, Pause, Play, Settings, SkipBack, SkipForward, Volume2 } from 'lucide-react';
import { SafeAreaOverlay } from './SafeArea';

interface ViewportProps {
  className?: string;
}

function formatTimecode(us: number | bigint): string {
  const totalSeconds = Number(us) / 1_000_000;
  const hrs = Math.floor(totalSeconds / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = Math.floor(totalSeconds % 60);
  const hundredths = Math.floor((totalSeconds % 1) * 100);
  return `${hrs.toString().padStart(2, '0')}:${mins
    .toString()
    .padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${hundredths
    .toString()
    .padStart(2, '0')}`;
}

export function Viewport({ className = '' }: ViewportProps) {
  const {
    isPlaying,
    setIsPlaying,
    playhead,
    setPlayhead,
    safeArea,
    canvasAspectRatio,
  } = useStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [volume, setVolume] = useState(1);

  // Canvas sizing (DPR-aware)
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

  // Render loop: draws placeholder composition preview
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let raf = 0;
    const render = () => {
      const { width, height } = canvas;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, width, height);

      // Letterboxed 16:9 preview area
      const targetAspect = 16 / 9;
      const canvasAspect = width / height;
      let w = width;
      let h = height;
      if (canvasAspect > targetAspect) {
        w = height * targetAspect;
      } else {
        h = width / targetAspect;
      }
      const ox = (width - w) / 2;
      const oy = (height - h) / 2;

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(ox, oy, w, h);

      // Grid lines
      ctx.strokeStyle = '#1e293b';
      ctx.lineWidth = 1;
      for (let i = 1; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(ox + (w / 3) * i, oy);
        ctx.lineTo(ox + (w / 3) * i, oy + h);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(ox, oy + (h / 3) * i);
        ctx.lineTo(ox + w, oy + (h / 3) * i);
        ctx.stroke();
      }

      // Center label
      ctx.fillStyle = '#475569';
      ctx.font = `${Math.max(12, Math.round(h / 25))}px Inter, system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('CuttingBoard Preview', ox + w / 2, oy + h / 2);

      raf = requestAnimationFrame(render);
    };

    raf = requestAnimationFrame(render);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Keyboard shortcuts (space = play/pause)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }
      switch (e.code) {
        case 'Space':
          e.preventDefault();
          setIsPlaying(!isPlaying);
          break;
        case 'ArrowLeft':
          e.preventDefault();
          setPlayhead(playhead > BigInt(33_333) ? playhead - BigInt(33_333) : BigInt(0));
          break;
        case 'ArrowRight':
          e.preventDefault();
          setPlayhead(playhead + BigInt(33_333));
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isPlaying, playhead, setIsPlaying, setPlayhead]);

  return (
    <div
      ref={wrapperRef}
      className={`relative w-full h-full bg-black overflow-hidden ${className}`}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      tabIndex={0}
    >
      <canvas ref={canvasRef} className="w-full h-full block" />

      {/* Safe area overlay driven by store */}
      <div className="absolute inset-0 pointer-events-none">
        <SafeAreaOverlay
          aspectRatio={canvasAspectRatio}
          showActionSafe={safeArea.actionSafe}
          showTitleSafe={safeArea.titleSafe}
          showTikTokSafe={safeArea.tiktokSafe}
        />
      </div>

      {/* Transport overlay */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/80 to-transparent">
          {/* Progress */}
          <div className="mb-2">
            <div className="relative h-1.5 bg-white/20 rounded-full">
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 bg-red-500 rounded-full shadow"
                style={{ left: '10%' }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between">
            {/* Left: transport */}
            <div className="flex items-center gap-1">
              <button
                className="p-1.5 text-white/80 hover:text-white transition-colors"
                title="Skip Back (J)"
                onClick={() => setPlayhead(playhead > BigInt(1_000_000) ? playhead - BigInt(1_000_000) : BigInt(0))}
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                className="p-1.5 text-white hover:text-white transition-colors"
                title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
                onClick={() => setIsPlaying(!isPlaying)}
              >
                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
              </button>
              <button
                className="p-1.5 text-white/80 hover:text-white transition-colors"
                title="Skip Forward (L)"
                onClick={() => setPlayhead(playhead + BigInt(1_000_000))}
              >
                <SkipForward className="w-4 h-4" />
              </button>
            </div>

            {/* Center: timecode */}
            <div className="text-white/80 font-mono text-xs">
              {formatTimecode(playhead)}
            </div>

            {/* Right: misc */}
            <div className="flex items-center gap-1">
              <Volume2 className="w-4 h-4 text-white/70" />
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
              <button
                className="p-1.5 text-white/70 hover:text-white transition-colors"
                title="Toggle fullscreen"
                onClick={() => setIsFullscreen((f) => !f)}
              >
                {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button
                className="p-1.5 text-white/70 hover:text-white transition-colors"
                title="Viewer settings"
              >
                <Settings className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
