import React from 'react';
import { useStore } from '../store';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Save,
  Download,
  HelpCircle,
} from 'lucide-react';

export function Toolbar() {
  const {
    isPlaying,
    setIsPlaying,
    playhead,
    setPlayhead,
    zoom,
    setZoom,
    segments,
  } = useStore();

  const handlePlayPause = () => setIsPlaying(!isPlaying);

  const stepFrame = (dir: 1 | -1) => {
    // 1 frame @ 30fps = 33333µs
    setPlayhead(playhead + BigInt(dir) * BigInt(33_333));
  };

  const handleSkipBack = () => {
    // Jump to previous clip boundary or 1s back
    setPlayhead(playhead > BigInt(1_000_000) ? playhead - BigInt(1_000_000) : BigInt(0));
  };

  const handleSkipForward = () => setPlayhead(playhead + BigInt(1_000_000));

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card sticky top-0 z-50">
      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <button
          className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground"
          title="Undo (Ctrl+Z)"
          onClick={() => console.log('Undo')}
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 rounded-md hover:bg-accent transition-colors text-muted-foreground"
          title="Redo (Ctrl+Shift+Z)"
          onClick={() => console.log('Redo')}
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Transport */}
      <div className="flex items-center gap-0.5">
        <button
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          title="Skip Back (J)"
          onClick={handleSkipBack}
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          className={`p-1.5 rounded-md transition-colors ${
            isPlaying ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'
          }`}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          onClick={handlePlayPause}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          title="Step forward"
          onClick={() => stepFrame(1)}
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Zoom */}
      <div className="flex items-center gap-0.5">
        <button
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          title="Zoom Out"
          onClick={() => setZoom(zoom * 0.8)}
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="px-1 text-[11px] text-muted-foreground font-mono w-12 text-center">
          {Math.round(zoom * 100)}%
        </span>
        <button
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          title="Zoom In"
          onClick={() => setZoom(zoom * 1.25)}
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1" />

      {/* Project actions */}
      <div className="flex items-center gap-0.5">
        <button
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          title="Save project (Ctrl+S)"
          onClick={() => console.log('Save project')}
        >
          <Save className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          title="Export (Ctrl+E)"
          onClick={() => console.log('Export project')}
        >
          <Download className="w-4 h-4" />
        </button>
        <button
          className="p-1.5 rounded-md hover:bg-accent transition-colors"
          title="Help (F1)"
          onClick={() => console.log('Help')}
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
