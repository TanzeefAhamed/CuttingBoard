import React, { useState } from 'react';
import { useStore } from '../store';
import {
  Play, Pause, SkipBack, SkipForward, Undo2, Redo2, ZoomIn, ZoomOut, Save, Download,
  HelpCircle, Scissors, Trash2, Settings as SettingsIcon, FilePlus, ChevronLeft, ChevronRight,
  Magnet, Link2, Check,
} from 'lucide-react';
import type { Microseconds } from '../core/timeline/types';
import type { AspectRatio } from '../store';
import { saveProject } from '../editor/useEditorEffects';

const FRAME_US = 33_333n;

const btn = 'p-1.5 rounded-md hover:bg-accent transition-colors disabled:opacity-30 disabled:pointer-events-none text-muted-foreground hover:text-foreground';

export function Toolbar() {
  const projectName = useStore((s) => s.projectName);
  const setProjectName = useStore((s) => s.setProjectName);
  const canvasAspectRatio = useStore((s) => s.canvasAspectRatio);
  const setCanvasAspectRatio = useStore((s) => s.setCanvasAspectRatio);
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
  const snapEnabled = useStore((s) => s.settings.snapEnabled);
  const setSettings = useStore((s) => s.setSettings);
  const rippleEnabled = useStore((s) => s.rippleEnabled);
  const setRippleEnabled = useStore((s) => s.setRippleEnabled);

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(projectName);

  const step = (dir: 1 | -1) => setPlayhead((playhead + BigInt(dir) * FRAME_US) as Microseconds);

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border bg-card sticky top-0 z-40 select-none" data-testid="toolbar">
      {/* Brand & Project Name */}
      <div className="flex items-center gap-2 mr-2">
        <div className="flex items-center gap-1.5">
          <div className="w-5 h-5 rounded bg-primary flex items-center justify-center font-bold text-[11px] text-primary-foreground shadow-sm">
            CB
          </div>
          <span className="font-semibold text-xs tracking-tight hidden sm:inline">CuttingBoard</span>
        </div>

        {/* Editable Project Title */}
        {isEditingTitle ? (
          <input
            type="text"
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => {
              setProjectName(titleDraft.trim() || 'Untitled Project');
              setIsEditingTitle(false);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                setProjectName(titleDraft.trim() || 'Untitled Project');
                setIsEditingTitle(false);
              }
            }}
            autoFocus
            className="px-1.5 py-0.5 text-xs bg-input border border-primary rounded max-w-[140px] text-foreground font-medium"
          />
        ) : (
          <span
            onClick={() => {
              setTitleDraft(projectName);
              setIsEditingTitle(true);
            }}
            className="text-xs font-medium text-foreground hover:bg-accent/60 px-1.5 py-0.5 rounded cursor-pointer max-w-[140px] truncate"
            title="Click to rename project"
            data-testid="project-title-btn"
          >
            {projectName}
          </span>
        )}

        {/* Saved status indicator */}
        <span className="flex items-center gap-1 text-[10px] text-emerald-500 font-mono hidden md:flex">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
          Saved
        </span>
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Undo / Redo */}
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

      {/* Playback Controls */}
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

      {/* Edit tools: Split, Delete, Snap, Ripple */}
      <div className="flex items-center gap-0.5">
        <button className={btn} title="Split at playhead (Ctrl+B)" aria-label="Split" disabled={!hasClips} onClick={splitAtPlayhead}>
          <Scissors className="w-4 h-4" />
        </button>
        <button className={btn} title="Delete selected (Del)" aria-label="Delete selected" disabled={!hasSelection} onClick={deleteSelected}>
          <Trash2 className="w-4 h-4" />
        </button>
        <button
          className={`${btn} ${snapEnabled ? 'text-primary bg-primary/10' : ''}`}
          title={snapEnabled ? 'Snapping: ON (S)' : 'Snapping: OFF (S)'}
          onClick={() => setSettings({ snapEnabled: !snapEnabled })}
        >
          <Magnet className="w-4 h-4" />
        </button>
        <button
          className={`${btn} ${rippleEnabled ? 'text-primary bg-primary/10' : ''}`}
          title={rippleEnabled ? 'Ripple Edit: ON' : 'Ripple Edit: OFF'}
          onClick={() => setRippleEnabled(!rippleEnabled)}
        >
          <Link2 className="w-4 h-4" />
        </button>
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Aspect Ratio Quick Preset */}
      <div className="flex items-center gap-1">
        <select
          aria-label="Canvas aspect ratio"
          value={canvasAspectRatio}
          onChange={(e) => setCanvasAspectRatio(e.target.value as AspectRatio)}
          className="text-xs bg-muted/60 border border-border rounded px-2 py-1 text-foreground font-medium cursor-pointer hover:bg-muted"
          data-testid="aspect-ratio-select"
        >
          <option value="16:9">16:9 (YouTube)</option>
          <option value="9:16">9:16 (Shorts/TikTok)</option>
          <option value="1:1">1:1 (Square)</option>
          <option value="4:3">4:3 (Classic)</option>
          <option value="21:9">21:9 (Ultrawide)</option>
        </select>
      </div>

      <div className="w-px h-5 bg-border" />

      {/* Zoom controls */}
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

      {/* Export progress indicator */}
      {isExporting && (
        <span className="text-[11px] font-mono text-primary flex items-center gap-1.5 mr-2" data-testid="export-progress">
          <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
          Exporting {Math.round(exportProgress)}%
        </span>
      )}

      {/* Right Action Buttons */}
      <div className="flex items-center gap-1.5">
        <button className={btn} title="Save project (Ctrl+S)" aria-label="Save project" onClick={saveProject}>
          <Save className="w-4 h-4" />
        </button>

        {/* High-contrast Prominent Render / Export Button */}
        <button
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm transition-all"
          title="Export Video (Ctrl+E)"
          aria-label="Export"
          onClick={() => openDialog('export')}
          data-testid="toolbar-export-btn"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </button>

        <button className={btn} title="Settings" aria-label="Settings" onClick={() => openDialog('settings')}>
          <SettingsIcon className="w-4 h-4" />
        </button>
        <button className={btn} title="Keyboard shortcuts & help (F1)" aria-label="Help" onClick={() => openDialog('help')}>
          <HelpCircle className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
