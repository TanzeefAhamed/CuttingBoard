import React, { useEffect } from 'react';
import { Settings, Search, Type, Layers, Palette, Volume2 } from 'lucide-react';
import { useStore } from './store';
import { Timeline } from './components/Timeline';
import { Viewport } from './components/Viewport';
import { Inspector } from './components/Inspector';
import { MediaBrowser } from './components/MediaBrowser';
import { TextCaptionsPanel } from './components/TextCaptionsPanel';
import { ElementsPanel } from './components/ElementsPanel';
import { EffectsPanel } from './components/EffectsPanel';
import { AudioPanel } from './components/AudioPanel';
import { Toolbar } from './components/Toolbar';
import { Dialogs } from './components/Dialogs';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CultSegmentedTabs } from './components/ui/cult';
import { useEditorEffects } from './editor/useEditorEffects';
import { initSampleMedia } from './editor/sampleMedia';

type PaneId = 'media-browser' | 'inspector' | 'timeline';

const PANE_DEFAULTS: Record<PaneId, { width?: number; height?: number; min?: number }> = {
  'media-browser': { width: 300, min: 240 },
  'inspector': { width: 310, min: 260 },
  'timeline': { height: 260, min: 140 },
};

function SidebarPane({
  paneId,
  title,
  icon,
  customHeader,
  side = 'left',
  children,
}: {
  paneId: PaneId;
  title?: string;
  icon?: React.ReactNode;
  customHeader?: React.ReactNode;
  side?: 'left' | 'right';
  children: React.ReactNode;
}) {
  const { paneSizes, setPaneSizes, activePane, setActivePane } = useStore();
  const defaults = PANE_DEFAULTS[paneId];
  const width = paneSizes[paneId] ?? defaults.width ?? 300;
  const isActive = activePane === paneId;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (ev: MouseEvent) => {
      const delta = side === 'left' ? ev.clientX - startX : startX - ev.clientX;
      const next = Math.max(defaults.min ?? 220, Math.min(520, startWidth + delta));
      setPaneSizes({ ...useStore.getState().paneSizes, [paneId]: next });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div
      className={`relative flex-shrink-0 flex flex-col bg-card overflow-hidden ${
        side === 'left' ? 'border-r border-border/80 dark:border-white/[0.08]' : 'border-l border-border/80 dark:border-white/[0.08]'
      }`}
      style={{ width }}
    >
      {/* Header */}
      {customHeader ? (
        <div
          className={`p-2 border-b border-border/80 dark:border-white/[0.08] ${
            isActive ? 'bg-primary/[0.04]' : ''
          }`}
          onClick={() => setActivePane(paneId)}
        >
          {customHeader}
        </div>
      ) : (
        <div
          className={`flex items-center justify-between px-3 py-2 border-b border-border/80 dark:border-white/[0.08] cursor-pointer ${
            isActive ? 'bg-primary/[0.06]' : ''
          }`}
          onClick={() => setActivePane(paneId)}
        >
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {icon}
            {title}
          </div>
          <button
            className={`p-1 rounded hover:bg-accent ${isActive ? 'text-primary' : 'text-muted-foreground'}`}
            title="Reset width"
            onClick={(e) => {
              e.stopPropagation();
              setPaneSizes({ ...useStore.getState().paneSizes, [paneId]: defaults.width ?? 300 });
            }}
          >
            <Settings className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Body */}
      <div className="flex-1 min-h-0">{children}</div>

      {/* Resize handle */}
      <div
        className={`absolute top-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors z-10 ${
          side === 'left' ? 'right-0' : 'left-0'
        }`}
        onMouseDown={startResize}
      />
    </div>
  );
}

function TimelinePane() {
  const { paneSizes, setPaneSizes } = useStore();
  const defaults = PANE_DEFAULTS['timeline'];
  const height = paneSizes['timeline'] ?? defaults.height ?? 260;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = height;

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(defaults.min ?? 140, Math.min(520, startHeight - (ev.clientY - startY)));
      setPaneSizes({ ...useStore.getState().paneSizes, timeline: next });
    };
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div className="relative flex-shrink-0" style={{ height }}>
      <div
        className="absolute top-0 left-0 right-0 h-1 cursor-row-resize hover:bg-primary/40 transition-colors z-10"
        onMouseDown={startResize}
      />
      <Timeline />
    </div>
  );
}

function AppShell() {
  const { paneSizes, setPaneSizes, activeSidebarTab, setActiveSidebarTab, setActivePane } = useStore();
  useEditorEffects();

  useEffect(() => {
    initSampleMedia();
  }, []);

  // Restore persisted pane sizes
  useEffect(() => {
    const stored = localStorage.getItem('pane-sizes');
    if (stored) {
      try {
        setPaneSizes(JSON.parse(stored));
      } catch {
        /* ignore malformed storage */
      }
    }
  }, [setPaneSizes]);

  useEffect(() => {
    localStorage.setItem('pane-sizes', JSON.stringify(paneSizes));
  }, [paneSizes]);

  const normalizedSidebarTab = activeSidebarTab === 'captions' ? 'text' : activeSidebarTab;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      <Toolbar />
      <div className="flex flex-1 min-h-0">
        {/* Left: Cult UI Creative Suite Tabs */}
        <SidebarPane
          paneId="media-browser"
          side="left"
          customHeader={
            <CultSegmentedTabs
              value={normalizedSidebarTab}
              onChange={(id) => {
                setActiveSidebarTab(id);
                setActivePane('media-browser');
              }}
              items={[
                { id: 'media', label: 'Media', icon: <Search className="w-3.5 h-3.5" />, testId: 'tab-media' },
                { id: 'text', label: 'Text', icon: <Type className="w-3.5 h-3.5" />, testId: 'tab-text' },
                { id: 'elements', label: 'Shapes', icon: <Layers className="w-3.5 h-3.5" />, testId: 'tab-elements' },
                { id: 'effects', label: 'Effects', icon: <Palette className="w-3.5 h-3.5" />, testId: 'tab-effects' },
                { id: 'audio', label: 'Audio', icon: <Volume2 className="w-3.5 h-3.5" />, testId: 'tab-audio' },
              ]}
            />
          }
        >
          {normalizedSidebarTab === 'media' && <MediaBrowser />}
          {normalizedSidebarTab === 'text' && <TextCaptionsPanel />}
          {normalizedSidebarTab === 'elements' && <ElementsPanel />}
          {normalizedSidebarTab === 'effects' && <EffectsPanel />}
          {normalizedSidebarTab === 'audio' && <AudioPanel />}
        </SidebarPane>

        {/* Center: Viewport + Timeline */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 min-h-0 border-b border-border/80 dark:border-white/[0.08] bg-zinc-950">
            <Viewport />
          </div>
          <TimelinePane />
        </div>

        {/* Right: Inspector */}
        <SidebarPane paneId="inspector" side="right" title="Inspector" icon={<Settings className="w-3.5 h-3.5" />}>
          <Inspector />
        </SidebarPane>
      </div>
      <Dialogs />
    </div>
  );
}

export function App() {
  return (
    <ErrorBoundary>
      <AppShell />
    </ErrorBoundary>
  );
}
