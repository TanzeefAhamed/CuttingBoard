import React from 'react';
import { useStore } from '../store';
import {
  Square,
  Circle,
  ArrowRight,
  Laptop,
  Smartphone,
  Plus,
  Layers,
} from 'lucide-react';

interface ElementItem {
  id: string;
  name: string;
  category: 'shapes' | 'mockups';
  shapeType: string;
  icon: React.ReactNode;
  description: string;
}

const ELEMENTS: ElementItem[] = [
  {
    id: 'rect',
    name: 'Rounded Card',
    category: 'shapes',
    shapeType: 'rectangle',
    icon: <Square className="w-5 h-5 text-blue-400" />,
    description: 'Sleek rounded rectangle for text backgrounds or banners',
  },
  {
    id: 'circle',
    name: 'Circle Badge',
    category: 'shapes',
    shapeType: 'circle',
    icon: <Circle className="w-5 h-5 text-indigo-400" />,
    description: 'Circular badge for highlights or avatars',
  },
  {
    id: 'arrow',
    name: 'Arrow Callout',
    category: 'shapes',
    shapeType: 'arrow',
    icon: <ArrowRight className="w-5 h-5 text-emerald-400" />,
    description: 'Directional callout arrow to guide viewer attention',
  },
  {
    id: 'macbook',
    name: 'MacBook Pro Frame',
    category: 'mockups',
    shapeType: 'device-macbook',
    icon: <Laptop className="w-5 h-5 text-slate-300" />,
    description: 'Realistic laptop screen mockup for software showcases',
  },
  {
    id: 'iphone',
    name: 'iPhone Frame',
    category: 'mockups',
    shapeType: 'device-iphone',
    icon: <Smartphone className="w-5 h-5 text-slate-300" />,
    description: 'Mobile phone mockup with dynamic island for mobile demos',
  },
];

export function ElementsPanel() {
  const addShapeSegment = useStore((s) => s.addShapeSegment);

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden" data-testid="elements-panel">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Layers className="w-3.5 h-3.5 text-primary" /> Elements & Mockup Frames
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Add geometric shapes, callouts, and device frames to stage product videos.
        </p>
      </div>

      {/* Grid of elements */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Shapes section */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Shapes & Callouts
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {ELEMENTS.filter((e) => e.category === 'shapes').map((item) => (
              <div
                key={item.id}
                data-testid={`element-${item.id}`}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card/60 hover:bg-accent/40 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{item.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{item.description}</div>
                  </div>
                </div>
                <button
                  onClick={() => addShapeSegment(item.shapeType, item.name)}
                  className="px-2 py-1 text-xs font-medium rounded bg-muted hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-1 flex-shrink-0"
                  title="Add to timeline"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            ))}
          </div>
        </div>

        {/* Device Mockups section */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Device Mockup Frames
          </h4>
          <div className="grid grid-cols-1 gap-2">
            {ELEMENTS.filter((e) => e.category === 'mockups').map((item) => (
              <div
                key={item.id}
                data-testid={`element-${item.id}`}
                className="flex items-center justify-between p-2.5 rounded-lg border border-border bg-card/60 hover:bg-accent/40 transition-colors group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                    {item.icon}
                  </div>
                  <div className="min-w-0">
                    <div className="text-xs font-medium text-foreground truncate">{item.name}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{item.description}</div>
                  </div>
                </div>
                <button
                  onClick={() => addShapeSegment(item.shapeType, item.name)}
                  className="px-2 py-1 text-xs font-medium rounded bg-muted hover:bg-primary hover:text-primary-foreground transition-colors flex items-center gap-1 flex-shrink-0"
                  title="Add to timeline"
                >
                  <Plus className="w-3 h-3" /> Add
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
