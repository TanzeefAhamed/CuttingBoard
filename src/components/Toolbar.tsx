import React from 'react';
import { useStore } from '../store';
import { 
  Play, Pause, SkipBack, SkipForward, 
  RotateCcw, RotateCw, Undo2, Redo2, 
  Save, Download, Settings, HelpCircle,
  ZoomIn, ZoomOut, Maximize2, Minimize2
} from 'lucide-react';

export function Toolbar() {
  const { 
    isPlaying, setIsPlaying, 
    playbackSpeed, setPlaybackSpeed,
    zoom, setZoom,
    undo, redo,
    saveProject, loadProject,
    exportProject,
    zoom: currentZoom
  } = useStore();

  const handlePlayPause = () => {
    // This would dispatch to the audio engine
    console.log('Play/Pause toggled');
  };

  const handleUndo = () => {
    // Implement undo
    console.log('Undo');
  };

  const handleRedo = () => {
    // Implement redo
    console.log('Redo');
  };

  const handleSave = () => {
    // Save project
    console.log('Save project');
  };

  const handleExport = () => {
    // Open export dialog
    console.log('Export project');
  };

  return (
    <div className="flex items-center gap-4 px-4 py-2 border-b border-border bg-background/80 backdrop-blur-sm sticky top-0 z-50">
      {/* Left - Transport Controls */}
      <div className="flex items-center gap-1">
        <button
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          onClick={handleUndo}
          title="Undo (Ctrl+Z)"
          disabled
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <button
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          onClick={handleRedo}
          title="Redo (Ctrl+Shift+Z)"
          disabled
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-6 bg-border mx-2" />

      <div className="flex items-center gap-1">
        <button
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          onClick={() => {}}
          title="Skip Back (J)"
        >
          <SkipBack className="w-4 h-4" />
        </button>
        <button
          className={`p-2 rounded-lg transition-colors ${isPlaying ? 'bg-primary text-primary-foreground' : 'hover:bg-accent'}`}
          onClick={() => {}}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          onClick={() => {}}
          title="Skip Forward (L)"
        >
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-6 bg-border mx-2" />

      <div className="flex items-center gap-1">
        <button
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          onClick={handleUndo}
          title="Undo (Ctrl+Z)"
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          onClick={() => {}}
          title="Redo (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-6 bg-border mx-2" />

      {/* Zoom Controls */}
      <div className="flex items-center gap-1">
        <button
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          onClick={() => {}}
          title="Zoom Out (-)"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="px-2 text-sm text-muted-foreground font-mono">
          {Math.round(100 * 100)}%
        </span>
        <button
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          onClick={() => {}}
          title="Zoom In (+)"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1" />

      {/* Right - Window Controls */}
      <div className="flex items-center gap-1">
        <button
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          onClick={() => {}}
          title="Settings (Ctrl+,)"
        >
          <Settings className="w-4 h-4" />
        </button>
        <button
          className="p-2 rounded-lg hover:bg-accent transition-colors"
          onClick={() => {}}
          title="Help (F1)"
        >
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}