import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import { useStore } from '../store';
import { 
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Plus, Minus, Scissors, MousePointer, 
  Volume2, VolumeX, Scissors, 
  ZoomIn, ZoomOut, Maximize2, Minimize2,
  Move, Trash2, Copy, Link
} from 'lucide-react';
import { TimePoint, TimeRange, Microseconds, µs, µsFromFrames, toSeconds, toFrames } from '../core/timeline/types';
import { Segment, Track, TrackType } from '../core/timeline/segment';
import { Timeline as TimelineType } from '../core/timeline/timeline';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore } from '../store';
import { 
  ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
  Plus, Minus, Scissors, MousePointer, 
  Volume2, VolumeX, 
  ZoomIn, ZoomOut, Maximize2, Minimize2,
  Move, Trash2, Copy, Link, Scissors as ScissorsIcon
} from 'lucide-react';

interface TimelineProps {
  className?: string;
}

const TRACK_HEIGHT = 80;
const MIN_CLIP_WIDTH = 40;
const SNAP_THRESHOLD = 10; // pixels

interface TrackRenderData {
  track: any;
  segments: any[];
  y: number;
  height: number;
}

export function Timeline({ className = '' }) {
  const {
    tracks,
    segments,
    playhead,
    setPlayhead,
    isPlaying,
    setIsPlaying,
    zoom,
    setZoom,
    scrollX,
    setScrollX,
    playhead: currentPlayhead,
    duration,
    inPoint,
    outPoint,
    addTrack,
    removeTrack,
    moveSegment,
    trimSegment,
    splitSegment,
    addTrack: addTrackAction,
    splitSegment: splitSegmentAction,
    trimSegment: trimSegmentAction,
  } = useStore();

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);
  const [isPlaying, setIsPlayingLocal] = useState(false);
  const [hoveredSegment, setHoveredSegment] = useState<string | null>(null);
  const [draggedSegment, setDraggedSegment] = useState<{ segmentId: string; startX: number; startTime: any } | null>(null);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [showRuler, setShowRuler] = useState(true);

  const tracksData = useStore.getState().tracks;
  const segmentsData = useStore.getState().segments;
  const playhead = useStore.getState().playhead;
  const zoom = useStore.getState().zoom;
  const scrollX = useStore.getState().scrollX;
  const inPoint = useStore.getState().inPoint;
  const outPoint = useStore.getState().outPoint;

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rulerCanvasRef = useRef<HTMLCanvasElement>(null);
  const tracksContainerRef = useRef<HTMLDivElement>(null);

  // Virtualize tracks for performance
  const trackVirtualizer = useVirtualizer({
    count: 100, // Max tracks
    getScrollElement: () => tracksContainerRef.current,
    estimateSize: () => TRACK_HEIGHT,
    overscan: 5,
  });

  const TRACK_HEIGHT = 80;
  const RULER_HEIGHT = 40;
  const MIN_CLIP_WIDTH = 40;

  const pixelsPerMicrosecond = zoom;
  const microsecondsPerPixel = 1 / zoom;

  const formatTime = (us: bigint | number): string => {
    const us = typeof us === 'bigint' ? Number(us) : us;
    const seconds = us / 1_000_000;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const seconds = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;
  };

  const microsecondsToPixels = (us: bigint | number): number => {
    const us = typeof us === 'bigint' ? Number(us) : us;
    return us * pixelsPerMicrosecond;
  };

  const pixelsToMicroseconds = (px: number): bigint => {
    return BigInt(Math.round(px / pixelsPerMicrosecond));
  };

  const formatTimecode = (us: bigint | number) => {
    const us = typeof us === 'bigint' ? Number(us) : us;
    return formatTime(us);
  };

  // Render ruler
  const drawRuler = useCallback(() => {
    const canvas = rulerCanvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width = canvas.parentElement?.clientWidth || 800;
    canvas.height = RULER_HEIGHT;

    ctx.clearRect(0, 0, width, RULER_HEIGHT);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, width, RULER_HEIGHT);

    // Draw time markers
    const startTime = scrollX;
    const endTime = scrollX + (width / zoom);
    
    // Calculate tick interval based on zoom
    let tickInterval = 1_000_000; // 1 second
    if (zoom > 100) tickInterval = 100_000; // 100ms
    else if (zoom > 10) tickInterval = 500_000; // 500ms
    else if (zoom > 1) tickInterval = 1_000_000; // 1 second
    else tickInterval = 5_000_000; // 5 seconds

    const startTick = Math.ceil(Number(startTime) / tickInterval) * tickInterval;
    
    ctx.font = '11px "JetBrains Mono", monospace';
    ctx.fillStyle = '#888';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let t = startTick; t < Number(endTime); t += tickInterval) {
      const x = (t - Number(scrollX)) * pixelsPerMicrosecond;
      if (x < 0 || x > width) continue;

      const isMajor = tickInterval >= 1_000_000 && t % 5_000_000 === 0;
      const tickHeight = isMajor ? 20 : 12;
      
      ctx.beginPath();
      ctx.moveTo(x, RULER_HEIGHT - tickHeight);
      ctx.lineTo(x, RULER_HEIGHT);
      ctx.strokeStyle = isMajor ? '#666' : '#444';
      ctx.lineWidth = 1;
      ctx.stroke();

      if (isMajor) {
        ctx.fillText(formatTimecode(t), x, 14);
      }
    }
  }, [zoom, scrollX]);

  // Draw playhead
  const drawPlayhead = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const playheadX = microsecondsToPixels(playhead);
    
    ctx.save();
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(playheadX, 0);
    ctx.lineTo(playheadX, canvas.height);
    ctx.stroke();
    ctx.restore();

    // Playhead triangle at top
    ctx.fillStyle = '#ff4444';
    ctx.beginPath();
    ctx.moveTo(playheadX - 6, 0);
    ctx.lineTo(playheadX + 6, 0);
    ctx.lineTo(playheadX, 10);
    ctx.closePath();
    ctx.fill();
  }, [playhead]);

  // Render segments
  const renderSegments = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw track backgrounds
    tracksData.forEach((track, trackIndex) => {
      const y = trackIndex * TRACK_HEIGHT;
      
      // Track background
      ctx.fillStyle = track.type === 'video' ? '#1e1e1e' : 
                        track.type === 'audio' ? '#1a1a2e' : '#1e2e1e';
      ctx.fillRect(0, y, canvas.width, TRACK_HEIGHT);
      
      // Track separator
      ctx.strokeStyle = '#333';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, y + TRACK_HEIGHT);
      ctx.lineTo(canvas.width, y + TRACK_HEIGHT);
      ctx.stroke();
    });

    // Draw segments
    segmentsData.forEach((segment, segmentId) => {
      const track = tracksData.find(t => t.id === segment.trackId);
      if (!track) return;

      const trackIndex = tracksData.findIndex(t => t.id === segment.trackId);
      if (trackIndex === -1) return;

      const y = trackIndex * TRACK_HEIGHT;
      const x = microsecondsToPixels(segment.targetTimerange.start);
      const width = Math.max(MIN_CLIP_WIDTH, microsecondsToPixels(segment.targetTimerange.duration));
      
      // Segment background
      const isHovered = hoveredSegment === segmentId;
      const isSelected = false; // Would track selection state
      
      ctx.fillStyle = isHovered ? '#3b82f6' : 
                      track.type === 'video' ? '#3b82f6' : 
                      track.type === 'audio' ? '#f59e0b' : '#22c55e';
      
      if (isSelected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
      }

      const radius = 4;
      const x = Math.max(0, x);
      const w = Math.min(width, x + width - x);
      
      ctx.beginPath();
      ctx.roundRect(x, y + 4, w, TRACK_HEIGHT - 8, 4);
      ctx.fill();
      if (isSelected) ctx.stroke();

      // Segment label
      ctx.fillStyle = '#fff';
      ctx.font = '11px "JetBrains Mono", monospace';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const label = segment.media?.metadata?.name || segment.id.slice(0, 8);
      const textX = x + 8;
      const textY = y + TRACK_HEIGHT / 2;
      if (x + 8 + ctx.measureText(label).width < x + width - 8) {
        ctx.fillText(label, textX, textY);
      }

      // Trim handles
      if (isHovered || isSelected) {
        ctx.fillStyle = '#fff';
        // Left handle
        ctx.fillRect(x - 4, y + 4, 8, TRACK_HEIGHT - 8);
        // Right handle
        ctx.fillRect(x + width - 4, y + 4, 8, TRACK_HEIGHT - 8);
      }

      // Keyframe indicators
      // Would draw keyframe diamonds here
    });
  }, [tracksData, segmentsData, zoom, scrollX, playhead, hoveredSegment]);

  // Render loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const render = () => {
      renderSegments();
      drawPlayhead();
      
      requestAnimationFrame(render);
    };
    
    const animationFrameId = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animationFrameId);
  }, [renderSegments, drawPlayhead]);

  // Ruler render
  useEffect(() => {
    const canvas = rulerCanvasRef.current;
    if (!canvas) return;
    drawRuler();
  }, [drawRuler]);

  // Handle canvas click
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const time = pixelsToMicroseconds(x);
    
    setPlayhead(pixelsToMicroseconds(e.nativeEvent.offsetX));
    setIsDraggingPlayhead(true);
  }, []);

  const handleCanvasMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (isDraggingPlayhead) {
      const rect = canvasRef.current!.getBoundingClientRect();
      const x = e.clientX - rect.left;
      setPlayhead(pixelsToMicroseconds(x));
    }
  }, [isDraggingPlayhead]);

  const handleCanvasMouseUp = useCallback(() => {
    setIsDraggingPlayhead(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Zoom
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(Math.max(0.1, Math.min(100, zoom * delta)));
    } else {
      // Horizontal scroll
      setScrollX(prev => prev + e.deltaY * 10);
    }
  }, [zoom, scrollX]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    switch (e.code) {
      case 'Space':
        e.preventDefault();
        // Toggle play/pause
        break;
      case 'ArrowLeft':
        e.preventDefault();
        setPlayhead(playhead - 33333n); // Step back 1 frame at 30fps
        break;
      case 'ArrowRight':
        e.preventDefault();
        setPlayhead(playhead + 33333n);
        break;
      case 'ArrowUp':
        e.preventDefault();
        // Volume up
        break;
      case 'ArrowDown':
        e.preventDefault();
        // Volume down
        break;
      case 'KeyZ':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          // Undo
        }
        break;
      case 'KeyY':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          // Redo
        }
        break;
      case 'KeyB':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          // Razor tool - split at playhead
        }
        break;
      case 'KeyS':
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          // Save
        }
        break;
    }
  }, [playhead]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Ruler
  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Ruler */}
      {showRuler && (
        <div className="h-10 bg-background border-b border-border relative overflow-hidden" ref={rulerRef}>
          <canvas 
            ref={rulerCanvasRef} 
            className="w-full h-full" 
            style={{ touchAction: 'none' }}
          />
          
          {/* Playhead on ruler */}
          <div 
            className="absolute top-0 bottom-0 w-0.5 bg-red-500 pointer-events-none"
            style={{ 
              left: `${microsecondsToPixels(playhead)}px`,
              transform: 'translateX(-50%)'
            }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-3 border-transparent border-b-3 border-red-500" />
          </div>
          
          {/* In/Out points */}
          {inPoint && (
            <div 
              className="absolute top-0 bottom-0 w-px bg-green-500 pointer-events-none"
              style={{ left: `${microsecondsToPixels(inPoint)}px` }}
            />
          )}
          {outPoint && (
            <div 
              className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
              style={{ left: `${microsecondsToPixels(outPoint)}px` }}
            />
          )}
        </div>
      )}

      {/* Main Timeline Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Track Headers */}
        <div className="w-48 bg-card border-r border-border flex-shrink-0 overflow-y-auto">
          <div className="p-2 border-b border-border font-medium text-xs text-muted-foreground uppercase tracking-wider">
            Tracks
          </div>
          <div className="p-2 space-y-1">
            {tracksData.map((track, index) => (
              <div 
                key={track.id} 
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors group"
                style={{ height: `${TRACK_HEIGHT}px` }}
              >
                <input 
                  type="checkbox" 
                  className="w-4 h-4 accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium truncate">
                    <span className={`w-2 h-2 rounded-full ${track.type === 'video' ? 'bg-blue-500' : track.type === 'audio' ? 'bg-amber-500' : 'bg-green-500'}`} />
                    <span className="truncate">{track.name}</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span>{track.type}</span>
                    <span>•</span>
                    <span>{track.segments?.length || 0} clips</span>
                  </div>
                </div>
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                  <button className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                    <Volume2 className="w-4 h-4" />
                  </button>
                  <button className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                    <VolumeX className="w-4 h-4" />
                  </button>
                  <button className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-foreground">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline Canvas */}
        <div className="flex-1 relative overflow-auto" ref={tracksContainerRef} onWheel={handleWheel} onKeyDown={handleKeyDown}>
          <canvas
            ref={canvasRef}
            className="absolute top-0 left-0"
            style={{ 
              width: '100%', 
              height: '100%',
              touchAction: 'none'
            }}
            onClick={handleCanvasClick}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onWheel={handleWheel}
          />
          
          {/* Ruler Canvas */}
          <canvas
            ref={rulerCanvasRef}
            className="absolute top-0 left-0 pointer-events-none"
          />
          
          {/* Playhead indicator on timeline */}
          <div 
            className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
            style={{ left: `${microsecondsToPixels(playhead)}px` }}
          >
            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-0 h-0 border-l-3 border-transparent border-b-3 border-red-500" />
          </div>
          
          {/* In/Out points */}
          {inPoint && (
            <div 
              className="absolute top-0 bottom-0 w-px bg-green-500 pointer-events-none"
              style={{ left: `${microsecondsToPixels(inPoint)}px` }}
            />
          )}
          {outPoint && (
            <div 
              className="absolute top-0 bottom-0 w-px bg-red-500 pointer-events-none"
              style={{ left: `${microsecondsToPixels(outPoint)}px` }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

export { Timeline };