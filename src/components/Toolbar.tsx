import React from 'react';
import { useStore } from '../store';
import {
  Play, Pause, SkipBack, SkipForward, Undo2, Redo2, ZoomIn, ZoomOut, Save, Download,
  HelpCircle, Scissors, Trash2, Settings as SettingsIcon, FilePlus, ChevronLeft, ChevronRight,
} from 'lucide-react';
import type { Microseconds } from '../core/timeline/types';
import { saveProject } from '../editor/useEditorEffects';

const FRAME_US = 33_333n;

const btn = 'p-1.5 rounded-md hover:bg-accent transition-colors disabled:opacity-30 disabled:pointer-events-none';

export function Toolbar() {
  const isPlaying = useStore((s) => s.isPlaying);
  const setIsPlaying = useStore((s) => s.setIsPlaying);
  const playhead = useStore((s) => s.playhead);
  const setPlayhead = useStore((s) => s.setPlayhead);
  const zoom = useStore((s) => s.zoom);
  const setZoom = useStore((s) => s.setZoom);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const hasClips = useStore((s) => s.segments.size > 0);
  const hasSelection = useStore((s) => s.selectedSegment !== null);
  const splitAtPlayhead = useStore((s) => s.splitAtPlayhead);
  const deleteSelected = useStore((s) => s.deleteSelected);
  const clearProject = useStore((s) => s.clearProject);
  const openDialog = useStore((s) => s.openDialog);
  const isExporting = useStore((s) => s.isExporting);
  const exportProgress = useStore((s) => s.exportProgress);

  const step = (dir: 1 | -1) => setPlayhead((playhead + BigInt(dir) * FRAME_US) as Microseconds);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card sticky top-0 z-40" data-testid="toolbar">
      <div className="flex items-center gap-0.5">
        <button className={btn} title="New project" aria-label="New project" onClick={() => hasClips ? window.confirm('Clear the timeline? (can be undone)') && clearProject() : clearProject()}>
          <FilePlus className="w-4 h-4" />
        </button>
        <button className={btn} title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <Undo2 className="w-4 h-4" />
        </button>
        <button className={btn} title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}>
          <Redo2 className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-5 bg-border" />

      <div className="flex items-center gap-0.5">
        <button className={btn} title="Go to start (Home)" aria-label="Go to start" onClick={() => setPlayhead(0n as Microseconds)}>
          <SkipBack className="w-4 h-4" />
        </button>
        <button className={btn} title="Previous frame (←)" aria-label="Previous frame" onClick={() => step(-1)}>
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          className={`${btn} ${isPlaying ? 'bg-primary text-primary-foreground hover:bg-primary' : ''}`}
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={!hasClips}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        <button className={btn} title="Next frame (→)" aria-label="Next frame" onClick={() => step(1)}>
          <ChevronRight className="w-4 h-4" />
        </button>
        <button className={btn} title="Go to end (End)" aria-label="Go to end" onClick={() => setPlayhead(useStore.getState().getDuration())}>
          <SkipForward className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-5 bg-border" />

      <div className="flex items-center gap-0.5">
        <button className={btn} title="Split at playhead (Ctrl+B)" aria-label="Split" disabled={!hasClips} onClick={splitAtPlayhead}>
          <Scissors className="w-4 h-4" />
        </button>
        <button className={btn} title="Delete selected (Del)" aria-label="Delete selected" disabled={!hasSelection} onClick={deleteSelected}>
          <Trash2 className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-5 bg-border" />

      <div className="flex items-center gap-0.5">
        <button className={btn} title="Zoom Out" aria-label="Zoom out" onClick={() => setZoom(zoom / 1.25)}>
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="px-1 text-[11px] text-muted-foreground font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
        <button className={btn} title="Zoom In" aria-label="Zoom in" onClick={() => setZoom(zoom * 1.25)}>
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1" />

      {isExporting && (
        <span className="text-[11px] font-mono text-primary" data-testid="export-progress">
          Exporting {Math.round(exportProgress)}%
        </span>
      )}

      <div className="flex items-center gap-0.5">
        <button className={btn} title="Save project (Ctrl+S)" aria-label="Save project" onClick={saveProject}>
          <Save className="w-4 h-4" />
        </button>
        <button className={btn} title="Export (Ctrl+E)" aria-label="Export" onClick={() => openDialog('export')}>
          <Download className="w-4 h-4" />
        </button>
        <button className={btn} title="Settings" aria-label="Settings" onClick={() => openDialog('settings')}>
          <SettingsIcon className="w-4 h-4" />
        </button>
        <button className={btn} title="Help (F1)" aria-label="Help" onClick={() => openDialog('help')}>
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
