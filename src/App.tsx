import React, { useEffect } from 'react';
import { Settings, Search } from 'lucide-react';
import { useStore } from './store';
import { Timeline } from './components/Timeline';
import { Viewport } from './components/Viewport';
import { Inspector } from './components/Inspector';
import { MediaBrowser } from './components/MediaBrowser';
import { Toolbar } from './components/Toolbar';
import { Dialogs } from './components/Dialogs';
import { useEditorEffects } from './editor/useEditorEffects';
import { initSampleMedia } from './editor/sampleMedia';

type PaneId = 'media-browser' | 'inspector' | 'timeline';

const PANE_DEFAULTS: Record<PaneId, { width?: number; height?: number; min?: number }> = {
  'media-browser': { width: 280, min: 200 },
  'inspector': { width: 300, min: 240 },
  'timeline': { height: 260, min: 140 },
};

function SidebarPane({
  paneId,
  title,
  icon,
  children,
}: {
  paneId: PaneId;
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const { paneSizes, setPaneSizes, activePane, setActivePane } = useStore();
  const defaults = PANE_DEFAULTS[paneId];
  const width = paneSizes[paneId] ?? defaults.width ?? 280;
  const isActive = activePane === paneId;

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = width;

    const onMove = (ev: MouseEvent) => {
      const next = Math.max(defaults.min ?? 200, startWidth + (ev.clientX - startX));
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
      className="relative flex-shrink-0 flex flex-col bg-card border-r border-border overflow-hidden"
      style={{ width }}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-3 py-2 border-b border-border cursor-pointer ${
          isActive ? 'bg-primary/10' : ''
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
            setPaneSizes({ ...useStore.getState().paneSizes, [paneId]: defaults.width ?? 280 });
          }}
        >
          <Settings className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">{children}</div>

      {/* Resize handle */}
      <div
        className="absolute top-0 right-0 bottom-0 w-1 cursor-col-resize hover:bg-primary/40 transition-colors"
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
      const next = Math.max(defaults.min ?? 140, startHeight - (ev.clientY - startY));
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
  const { paneSizes, setPaneSizes } = useStore();
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background">
      <Toolbar />
      <div className="flex flex-1 min-h-0">
        {/* Left: Media Browser */}
        <SidebarPane paneId="media-browser" title="Media" icon={<Search className="w-3.5 h-3.5" />}>
          <MediaBrowser />
        </SidebarPane>

        {/* Center: Viewport + Timeline */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          <div className="flex-1 min-h-0 border-b border-border bg-black">
            <Viewport />
          </div>
          <TimelinePane />
        </div>

        {/* Right: Inspector */}
        <SidebarPane paneId="inspector" title="Inspector" icon={<Settings className="w-3.5 h-3.5" />}>
          <Inspector />
        </SidebarPane>
      </div>
      <Dialogs />
    </div>
  );
}

export function App() {
  return <AppShell />;
}
