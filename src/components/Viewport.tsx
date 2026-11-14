import React, { useRef, useEffect, useState, useCallback } from 'react';
import { useStore } from '../store';
import { 
  Play, Pause, SkipBack, SkipForward, 
  RotateCcw, RotateCw, Expand, Minimize2,
  Volume2, VolumeX, Settings, 
  Camera, Image, Video, 
  Grid, Layers, Maximize2, Minimize2
} from 'lucide-react';
import { SafeAreaOverlay } from './SafeArea';

interface ViewportProps {
  className?: string;
}

export function Viewport({ className = '' }: ViewportProps) {
  const { 
    isPlaying, setIsPlaying, 
    playbackSpeed, setPlaybackSpeed,
    playhead, setPlayhead,
    zoom, setZoom,
    canvasAspectRatio, setCanvasAspectRatio,
    safeArea,
    playhead: currentTime,
    duration,
    canvasRef: externalCanvasRef
  } = useStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const canvasRefCombined = externalCanvasRef || canvasRef;

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d', { 
      alpha: true, 
      desynchronized: true,
      willReadFrequently: false 
    });
    
    if (!ctx) return;

    // Set canvas size
    const resize = () => {
      const wrapper = canvasWrapperRef.current;
      if (!wrapper) return;
      
      const rect = wrapper.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, []);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      // Clear canvas
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      
      // Draw background
      ctx.fillStyle = '#1a1a1a';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw safe area overlay
      // SafeAreaOverlay would be rendered here

      animationFrameId = requestAnimationFrame(render);
    };

    render();
    return () => cancelAnimationFrame(animationFrameId);
  }, []);

  const handlePlayPause = () => {
    // Toggle play/pause
  };

  const handleSeek = (time: number) => {
    // Seek to time
  };

  const handleVolumeChange = (value: number) => {
    // Handle volume change
  };

  const handleSpeedChange = (rate: number) => {
    // Handle speed change
  };

  const toggleFullscreen = () => {
    // Toggle fullscreen
  };

  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
  };

  const formatTimeShort = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        // Toggle play/pause
        break;
      case 'ArrowLeft':
        e.preventDefault();
        // Step back
        break;
      case 'ArrowRight':
        e.preventDefault();
        // Step forward
        break;
      case 'ArrowUp':
        e.preventDefault();
        // Volume up
        break;
      case 'ArrowDown':
        e.preventDefault();
        // Volume down
        break;
      case 'KeyF':
        e.preventDefault();
        // Toggle fullscreen
        break;
      case 'KeyM':
        e.preventDefault();
        // Toggle mute
        break;
    }
  };

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div 
      ref={canvasWrapperRef}
      className={`relative w-full h-full bg-black ${isFullscreen ? 'fixed inset-0 z-50' : ''} ${className}`}
      onMouseEnter={() => setShowControls(true)}
      onMouseLeave={() => setShowControls(false)}
      tabIndex={0}
    >
      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className="w-full h-full block"
        style={{ 
          backgroundColor: '#1a1a1a',
          width: '100%',
          height: '100%',
        }}
      />

      {/* Safe Area Overlay */}
      <SafeAreaOverlay 
        aspectRatio="16:9"
        showActionSafe={true}
        showTitleSafe={true}
        showTikTokSafe={false}
      />

      {/* Controls Overlay */}
      {showControls && (
        <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/80 to-transparent">
          {/* Progress Bar */}
          <div className="mb-4">
            <div 
              className="relative h-2 bg-white/20 rounded-full cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const percent = (e.nativeEvent.clientX - rect.left) / rect.width;
                // Seek to position
              }}
            >
              <div 
                className="h-full bg-primary rounded-full transition-all duration-100"
                style={{ width: `${(100 * 0.5)}%` }} // Would be dynamic based on current time
              />
            </div>
            <div className="flex justify-between text-xs text-white/70 mt-1 px-1">
              <span>00:00:00.00</span>
              <span>00:10:00.00</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-between">
            {/* Left Controls */}
            <div className="flex items-center gap-2">
              <button className="p-2 text-white/80 hover:text-white transition-colors" title="Skip Back (J)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="19 20 9 12 19 4 19 20" />
                  <line x1="5" y1="19" x2="5" y2="5" />
                </svg>
              </button>
              <button className="p-2 text-white/80 hover:text-white transition-colors" title="Play/Pause (Space)">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5 3 19 12 5 21" />
                </svg>
              </button>
              <button className="p-2 text-white/70 hover:text-white transition-colors" title="Skip Forward (L)">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 4 15 12 5 20" />
                  <line x1="19" y1="20" x2="19" y2="4" />
                </svg>
              </button>
            </div>

            {/* Center - Time Display */}
            <div className="flex items-center gap-4 text-white/80 font-mono text-sm">
              <span className="font-mono">00:00:00.00 / 00:10:00.00</span>
            </div>

            {/* Right Controls */}
            <div className="flex items-center gap-2">
              <button className="p-2 text-white/70 hover:text-white transition-colors" title="Volume">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
                </svg>
              </button>
              <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.1" 
                value={1}
                className="w-24 h-1 accent-primary"
                onChange={(e) => {}}
              />
              <button className="p-2 text-white/70 hover:text-white transition-colors" title="Fullscreen (F)">
                <Maximize2 className="w-5 h-5" />
              </button>
              <button className="p-2 text-white/70 hover:text-white transition-colors" title="Settings">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}