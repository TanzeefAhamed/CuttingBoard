import React, { useState, useCallback } from 'react';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates, SortableContext, sortableList, verticalListSortingStrategy, useSortable, SortableContextProps } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PanelLeft, PanelRight, PanelTop, PanelBottom, LayoutGrid, Maximize2, Minimize2, Settings, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Search, Filter, MoreHorizontal } from 'lucide-react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useStore } from './store';
import { Timeline } from './components/Timeline';
import { Viewport } from './components/Viewport';
import { Inspector } from './components/Inspector';
import { MediaBrowser } from './components/MediaBrowser';
import { Toolbar } from './components/Toolbar';
import { SafeAreaProvider } from './components/SafeArea';

const PANE_IDS = ['media-browser', 'viewport', 'inspector', 'timeline'] as const;
type PaneId = typeof PANE_IDS[number];

interface PaneConfig {
  id: PaneId;
  label: string;
  icon: React.ReactNode;
  defaultWidth?: number;
  defaultHeight?: number;
  minWidth?: number;
  minHeight?: number;
}

const PANE_CONFIGS: Record<PaneId, PaneConfig> = {
  'media-browser': { id: 'media-browser', label: 'Media', icon: <Search className="w-4 h-4" />, defaultWidth: 280, minWidth: 240 },
  'viewport': { id: 'viewport', label: 'Viewer', icon: <PanelTop className="w-4 h-4" /> },
  'inspector': { id: 'inspector', label: 'Properties', icon: <Settings className="w-4 h-4" />, defaultWidth: 300, minWidth: 260 },
  'timeline': { id: 'timeline', label: 'Timeline', icon: <LayoutGrid className="w-4 h-4" />, defaultHeight: 200, minHeight: 150 },
};

function PaneHandle({ paneId, children }: { paneId: PaneId; children: React.ReactNode }) {
  const { activePane, setActivePane } = useStore();
  const isActive = activePane === paneId;
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 text-sm font-medium transition-colors ${
        isActive
          ? 'bg-primary text-primary-foreground'
          : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
      } rounded-lg`}
      onClick={() => setActivePane(paneId)}
    >
      {children}
    </div>
  );
}

function PaneHeader({ paneId, title, icon, children, actions }: { paneId: PaneId; title: string; icon: React.ReactNode; children?: React.ReactNode; actions?: React.ReactNode }) {
  const { activePane, setActivePane, paneSizes, setPaneSizes } = useStore();
  const isActive = activePane === paneId;
  const config = PANE_CONFIGS[paneId];
  
  return (
    <div className={`flex items-center justify-between px-3 py-2 border-b border-border ${
      isActive ? 'bg-primary text-primary-foreground' : 'bg-card'
    }`}>
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{title}</span>
      </div>
      <div className="flex items-center gap-1">
        {actions}
        <button
          className={`p-1.5 rounded transition-colors ${
            isActive ? 'text-primary-foreground hover:bg-primary/80' : 'text-muted-foreground hover:bg-accent'
          }`}
          onClick={() => setActivePane(paneId)}
          title="Focus"
        >
          <Maximize2 className="w-4 h-4" />
        </button>
        <button
          className={`p-1.5 rounded transition-colors ${
            isActive ? 'text-primary-foreground hover:bg-primary/80' : 'text-muted-foreground hover:bg-accent'
          }`}
          onClick={() => {
            const newSizes = { ...paneSizes };
            if (config.defaultWidth) newSizes[paneId] = config.defaultWidth;
            if (config.defaultHeight) newSizes[paneId] = config.defaultHeight;
            setPaneSizes(newSizes);
          }}
          title="Reset size"
        >
          <Minimize2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ResizablePane({ paneId, children, direction }: { paneId: PaneId; children: React.ReactNode; direction: 'horizontal' | 'vertical' }) {
  const { paneSizes, setPaneSizes, activePane } = useStore();
  const config = PANE_CONFIGS[paneId];
  const isActive = activePane === paneId;
  
  const size = paneSizes[paneId] || (direction === 'horizontal' ? config.defaultWidth : config.defaultHeight) || (direction === 'horizontal' ? 280 : 200);
  const minSize = direction === 'horizontal' ? (config.minWidth || 200) : (config.minHeight || 100);
  
  const [isDragging, setIsDragging] = React.useState(false);
  
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    const { paneSizes: currentSizes, setPaneSizes: setSizes } = useStore.getState();
    const delta = direction === 'horizontal' ? e.movementX : e.movementY;
    const newSize = Math.max(minSize, (direction === 'horizontal' ? paneSizes[paneId] || 280 : paneSizes[paneId] || 200) + delta);
    setSizes({ ...currentSizes, [paneId]: newSize });
  };
  
  const handleMouseUp = () => {
    setIsDragging(false);
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  };
  
  return (
    <div
      className={`flex flex-col overflow-hidden transition-all duration-200 ${
        direction === 'horizontal' ? 'w-72' : 'h-48'
      }`}
      style={{
        [direction === 'horizontal' ? 'width' : 'height']: `${size}px`,
        [direction === 'horizontal' ? 'minWidth' : 'minHeight']: `${minSize}px`,
      }}
    >
      <div
        className={`h-6 cursor-col-resize select-none flex items-center justify-center transition-colors ${
          direction === 'horizontal' ? 'w-1' : 'h-1'
        } ${isDragging ? 'bg-primary' : 'hover:bg-muted'}`}
        onMouseDown={handleMouseDown}
        style={{ 
          [direction === 'horizontal' ? 'width' : 'height']: '4px',
          [direction === 'horizontal' ? 'cursor' : 'cursor']: direction === 'horizontal' ? 'col-resize' : 'row-resize'
        }}
      >
        <div className="w-1 h-1 bg-muted-foreground/30 rounded-full" />
      </div>
      <div className="flex-1 overflow-hidden bg-card">
        {children}
      </div>
    </div>
  );
}

function MediaBrowserPane() {
  return (
    <PaneHeader title="Media" icon={<Search className="w-4 h-4" />}>
      <div className="p-3 space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="Search media..."
            className="flex-1 px-3 py-2 text-sm bg-input border border-border rounded-lg placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button className="p-2 bg-muted hover:bg-accent rounded-lg transition-colors">
            <Filter className="w-4 h-4" />
          </button>
        </div>
        <div className="h-full overflow-y-auto">
          <MediaBrowser />
        </div>
      </div>
    </PaneHeader>
  );
}

function ViewportPane() {
  return (
    <PaneHeader title="Viewer" icon={<PanelTop className="w-4 h-4" />}>
      <div className="h-full">
        <Viewport />
      </div>
    </PaneHeader>
  );
}

function InspectorPane() {
  return (
    <PaneHeader title="Properties" icon={<Settings className="w-4 h-4" />}>
      <div className="h-full overflow-y-auto p-3">
        <Inspector />
      </div>
    </PaneHeader>
  );
}

function TimelinePane() {
  return (
    <PaneHeader title="Timeline" icon={<LayoutGrid className="w-4 h-4" />}>
      <div className="h-full">
        <Timeline />
      </div>
    </PaneHeader>
  );
}

function AppShell() {
  const { activePane, setActivePane, paneSizes, setPaneSizes } = useStore();
  
  // Initialize pane sizes if not set
  React.useEffect(() => {
    const stored = localStorage.getItem('pane-sizes');
    if (stored) {
      try {
        setPaneSizes(JSON.parse(stored));
      } catch {
        // Ignore parse errors
      }
    }
  }, [setPaneSizes]);
  
  React.useEffect(() => {
    localStorage.setItem('pane-sizes', JSON.stringify(useStore.getState().paneSizes));
  }, [paneSizes]);

  return (
    <DndContext
      sensors={useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
      )}
      collisionDetection={closestCenter}
    >
      <SortableContext items={PANE_IDS} strategy={verticalListSortingStrategy}>
        <div className="flex h-screen w-screen bg-background overflow-hidden">
          {/* Top Toolbar */}
          <Toolbar />
          
          <div className="flex-1 flex overflow-hidden">
            {/* Left Sidebar - Media Browser */}
            <ResizablePane paneId="media-browser" direction="horizontal">
              <MediaBrowserPane />
            </ResizablePane>
            
            {/* Center - Viewport */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <ResizablePane paneId="viewport" direction="vertical">
                <ViewportPane />
              </ResizablePane>
              <ResizablePane paneId="timeline" direction="vertical">
                <TimelinePane />
              </ResizablePane>
            </div>
            
            {/* Right Sidebar - Inspector */}
            <ResizablePane paneId="inspector" direction="horizontal">
              <InspectorPane />
            </ResizablePane>
          </div>
        </div>
      </SortableContext>
    </DndContext>
  );
}

export function App() {
  return (
    <SafeAreaProvider>
      <div className="h-screen w-screen flex flex-col">
        <AppShell />
      </div>
    </SafeAreaProvider>
  );
}