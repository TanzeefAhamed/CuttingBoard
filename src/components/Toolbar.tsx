import React, { useState } from 'react';
import { useStore } from '../store';
import {
  Play, Pause, SkipBack, SkipForward, Undo2, Redo2, ZoomIn, ZoomOut, Save, Download,
  HelpCircle, Scissors, Trash2, Settings as SettingsIcon, FilePlus, ChevronLeft, ChevronRight,
  Magnet, Link2, Copy,
} from 'lucide-react';
import type { Microseconds } from '../core/timeline/types';
import type { AspectRatio } from '../store';
import { saveProject } from '../editor/useEditorEffects';
import { TextureButton } from './ui/cult';

const FRAME_US = 33_333n;

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
  const selectedSegment = useStore((s) => s.selectedSegment);
  const hasSelection = selectedSegment !== null;
  const splitAtPlayhead = useStore((s) => s.splitAtPlayhead);
  const duplicateSegment = useStore((s) => s.duplicateSegment);
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
    <div
      className="flex items-center gap-2 px-3 py-1.5 border-b border-border/80 dark:border-white/[0.08] bg-card/95 dark:bg-zinc-950/90 backdrop-blur-md sticky top-0 z-40 select-none overflow-x-auto scrollbar-hide"
      data-testid="toolbar"
    >
      {/* Brand & Project Name */}
      <div className="flex items-center gap-2 flex-shrink-0">
        <div className="flex items-center gap-1.5">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-b from-blue-500 to-blue-600 flex items-center justify-center font-bold text-[11px] text-white shadow-[inset_0_1px_0_0_rgba(255,255,255,0.35),0_2px_8px_rgba(59,130,246,0.45)]">
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
            className="px-2 py-0.5 text-xs bg-input border border-primary rounded-md max-w-[140px] text-foreground font-medium"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setTitleDraft(projectName);
              setIsEditingTitle(true);
            }}
            className="text-xs font-medium text-foreground hover:bg-accent/60 px-2 py-1 rounded-md cursor-pointer max-w-[140px] truncate border border-transparent hover:border-border/60 transition-colors"
            title="Click to rename project"
            data-testid="project-title-btn"
          >
            {projectName}
          </button>
        )}

        <span className="items-center gap-1 text-[10px] text-emerald-500 font-mono hidden lg:flex px-1.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          Saved
        </span>
      </div>

      <div className="w-px h-5 bg-border/80 flex-shrink-0" />

      {/* History */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40 dark:bg-zinc-900/90 border border-border/60 dark:border-white/[0.06] flex-shrink-0">
        <TextureButton variant="ghost" size="icon" title="New project" aria-label="New project" onClick={() => (hasClips ? window.confirm('Clear the timeline? (can be undone)') && clearProject() : clearProject())}>
          <FilePlus className="w-3.5 h-3.5" />
        </TextureButton>
        <TextureButton variant="ghost" size="icon" title="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={undo}>
          <Undo2 className="w-3.5 h-3.5" />
        </TextureButton>
        <TextureButton variant="ghost" size="icon" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled={!canRedo} onClick={redo}>
          <Redo2 className="w-3.5 h-3.5" />
        </TextureButton>
      </div>

      {/* Transport */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40 dark:bg-zinc-900/90 border border-border/60 dark:border-white/[0.06] flex-shrink-0">
        <TextureButton variant="ghost" size="icon" title="Go to start (Home)" aria-label="Go to start" onClick={() => setPlayhead(0n as Microseconds)}>
          <SkipBack className="w-3.5 h-3.5" />
        </TextureButton>
        <TextureButton variant="ghost" size="icon" title="Previous frame (←)" aria-label="Previous frame" onClick={() => step(-1)}>
          <ChevronLeft className="w-3.5 h-3.5" />
        </TextureButton>
        <TextureButton
          variant={isPlaying ? 'primary' : 'ghost'}
          size="icon"
          title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          aria-label={isPlaying ? 'Pause' : 'Play'}
          disabled={!hasClips}
          onClick={() => setIsPlaying(!isPlaying)}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
        </TextureButton>
        <TextureButton variant="ghost" size="icon" title="Next frame (→)" aria-label="Next frame" onClick={() => step(1)}>
          <ChevronRight className="w-3.5 h-3.5" />
        </TextureButton>
        <TextureButton variant="ghost" size="icon" title="Go to end (End)" aria-label="Go to end" onClick={() => setPlayhead(useStore.getState().getDuration())}>
          <SkipForward className="w-3.5 h-3.5" />
        </TextureButton>
      </div>

      {/* Edit tools: Split, Duplicate, Delete, Snap, Ripple */}
      <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40 dark:bg-zinc-900/90 border border-border/60 dark:border-white/[0.06] flex-shrink-0">
        <TextureButton variant="ghost" size="icon" title="Split at playhead (Ctrl+B)" aria-label="Split" disabled={!hasClips} onClick={splitAtPlayhead}>
          <Scissors className="w-3.5 h-3.5" />
        </TextureButton>
        <TextureButton variant="ghost" size="icon" title="Duplicate selected (Ctrl+D)" aria-label="Duplicate" disabled={!hasSelection} onClick={() => selectedSegment && duplicateSegment(selectedSegment)}>
          <Copy className="w-3.5 h-3.5" />
        </TextureButton>
        <TextureButton variant="ghost" size="icon" title="Delete selected (Del)" aria-label="Delete selected" disabled={!hasSelection} onClick={deleteSelected}>
          <Trash2 className="w-3.5 h-3.5" />
        </TextureButton>
        <TextureButton
          variant={snapEnabled ? 'active' : 'ghost'}
          size="icon"
          title={snapEnabled ? 'Snapping: ON (S)' : 'Snapping: OFF (S)'}
          aria-label="Toggle snapping"
          onClick={() => setSettings({ snapEnabled: !snapEnabled })}
        >
          <Magnet className="w-3.5 h-3.5" />
        </TextureButton>
        <TextureButton
          variant={rippleEnabled ? 'active' : 'ghost'}
          size="icon"
          title={rippleEnabled ? 'Ripple Edit: ON' : 'Ripple Edit: OFF'}
          aria-label="Toggle ripple edit"
          onClick={() => setRippleEnabled(!rippleEnabled)}
        >
          <Link2 className="w-3.5 h-3.5" />
        </TextureButton>
      </div>

      {/* Aspect Ratio Quick Preset */}
      <select
        aria-label="Canvas aspect ratio"
        value={canvasAspectRatio}
        onChange={(e) => setCanvasAspectRatio(e.target.value as AspectRatio)}
        className="text-xs bg-muted/60 dark:bg-zinc-900 border border-border/80 dark:border-white/[0.08] rounded-lg px-2 py-1 text-foreground font-medium cursor-pointer hover:bg-muted flex-shrink-0"
        data-testid="aspect-ratio-select"
      >
        <option value="16:9">16:9</option>
        <option value="9:16">9:16</option>
        <option value="1:1">1:1</option>
        <option value="4:3">4:3</option>
        <option value="21:9">21:9</option>
      </select>

      {/* Zoom controls */}
      <div className="hidden xl:flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/40 dark:bg-zinc-900/90 border border-border/60 dark:border-white/[0.06] flex-shrink-0">
        <TextureButton variant="ghost" size="icon" title="Zoom Out" aria-label="Zoom out" onClick={() => setZoom(zoom / 1.25)}>
          <ZoomOut className="w-3.5 h-3.5" />
        </TextureButton>
        <span className="px-1 text-[11px] text-muted-foreground font-mono w-11 text-center">{Math.round(zoom * 100)}%</span>
        <TextureButton variant="ghost" size="icon" title="Zoom In" aria-label="Zoom in" onClick={() => setZoom(zoom * 1.25)}>
          <ZoomIn className="w-3.5 h-3.5" />
        </TextureButton>
      </div>

      <div className="flex-1" />

      {isExporting && (
        <span className="text-[11px] font-mono text-primary flex items-center gap-1.5 mr-2 flex-shrink-0" data-testid="export-progress">
          <span className="w-2 h-2 rounded-full bg-primary animate-ping" />
          Exporting {Math.round(exportProgress)}%
        </span>
      )}

      {/* Right Action Buttons */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <TextureButton variant="secondary" size="icon" title="Save project (Ctrl+S)" aria-label="Save project" onClick={saveProject}>
          <Save className="w-3.5 h-3.5" />
        </TextureButton>

        <TextureButton
          variant="primary"
          size="sm"
          title="Export Video (Ctrl+E)"
          aria-label="Export"
          onClick={() => openDialog('export')}
          data-testid="toolbar-export-btn"
        >
          <Download className="w-3.5 h-3.5" />
          <span>Export</span>
        </TextureButton>

        <TextureButton variant="ghost" size="icon" title="Settings" aria-label="Settings" onClick={() => openDialog('settings')}>
          <SettingsIcon className="w-3.5 h-3.5" />
        </TextureButton>
        <TextureButton variant="ghost" size="icon" title="Keyboard shortcuts & help (F1)" aria-label="Help" onClick={() => openDialog('help')}>
          <HelpCircle className="w-3.5 h-3.5" />
        </TextureButton>
      </div>
    </div>
  );
}
