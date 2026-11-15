import React from 'react';
import { useStore } from '../store';
import {
  Sparkles,
  Palette,
  Eye,
  Sliders,
  Check,
  Zap,
} from 'lucide-react';

interface LookPreset {
  id: 'teal-orange' | 'vintage' | 'cyberpunk' | 'noir' | 'crisp';
  name: string;
  badge: string;
  previewColors: [string, string];
  description: string;
}

const LOOKS: LookPreset[] = [
  {
    id: 'teal-orange',
    name: 'Teal & Orange',
    badge: 'Blockbuster',
    previewColors: ['#0d9488', '#ea580c'],
    description: 'High contrast Hollywood cinematic look with warm skin tones and teal shadows',
  },
  {
    id: 'vintage',
    name: 'Vintage 70s',
    badge: 'Retro',
    previewColors: ['#d97706', '#78350f'],
    description: 'Warm analog film look with golden highlights and faded blacks',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    badge: 'Sci-Fi',
    previewColors: ['#ec4899', '#3b82f6'],
    description: 'Vibrant neon magenta and electric blue split-toning',
  },
  {
    id: 'noir',
    name: 'Classic Noir B&W',
    badge: 'Monochrome',
    previewColors: ['#1e293b', '#e2e8f0'],
    description: 'Dramatic silver-gelatin black and white with punchy contrast',
  },
  {
    id: 'crisp',
    name: 'Crisp Clean',
    badge: 'Modern',
    previewColors: ['#38bdf8', '#f8fafc'],
    description: 'Commercial clean grade with punchy clarity and neutral whites',
  },
];

export function EffectsPanel() {
  const selectedSegment = useStore((s) => s.selectedSegment);
  const segment = useStore((s) => (selectedSegment ? s.segments.get(selectedSegment) ?? null : null));
  const applyColorPreset = useStore((s) => s.applyColorPreset);
  const updateSegment = useStore((s) => s.updateSegment);

  const isPortraitMatting = segment?.aiEffects?.portraitMatting ?? false;
  const togglePortraitMatting = () => {
    if (!selectedSegment || !segment) return;
    updateSegment(selectedSegment, {
      aiEffects: {
        ...segment.aiEffects,
        portraitMatting: !isPortraitMatting,
      },
    }, 'ai-portrait');
  };

  const toggleGrayscale = () => {
    if (!selectedSegment || !segment) return;
    const cur = segment.filters?.effect;
    updateSegment(selectedSegment, {
      filters: {
        ...segment.filters,
        effect: cur === 'grayscale' ? 'none' : 'grayscale',
      },
    }, 'vfx-gray');
  };

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden" data-testid="effects-panel">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Palette className="w-3.5 h-3.5 text-primary" /> Cinematic Looks & Visual FX
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          {segment
            ? `Applying to selected clip: ${segment.media.metadata?.name ?? segment.id}`
            : 'Select a clip on the timeline to apply color grades and effects.'}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* 1-Click Look Presets */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center justify-between">
            <span>Color Grading LUT Presets</span>
            <span className="text-[9px] text-muted-foreground">WebGL 2 GPU</span>
          </h4>
          <div className="space-y-2">
            {LOOKS.map((look) => (
              <div
                key={look.id}
                data-testid={`look-${look.id}`}
                onClick={() => applyColorPreset(look.id)}
                className={`p-2.5 rounded-lg border border-border bg-card/60 hover:border-primary/60 transition-all cursor-pointer ${
                  !segment ? 'opacity-50 pointer-events-none' : ''
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-4 h-4 rounded-full border border-white/20 shadow-sm flex-shrink-0"
                      style={{
                        background: `linear-gradient(135deg, ${look.previewColors[0]}, ${look.previewColors[1]})`,
                      }}
                    />
                    <span className="text-xs font-medium text-foreground">{look.name}</span>
                  </div>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground font-mono">
                    {look.badge}
                  </span>
                </div>
                <p className="text-[10px] text-muted-foreground">{look.description}</p>
              </div>
            ))}
          </div>
        </div>

        {/* AI & Quick VFX Toggles */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            AI Cutout & Filters
          </h4>
          <div className="space-y-2">
            <button
              disabled={!segment}
              onClick={togglePortraitMatting}
              data-testid="toggle-ai-cutout-btn"
              className={`w-full flex items-center justify-between p-2.5 rounded-lg border text-left transition-colors ${
                isPortraitMatting
                  ? 'bg-primary/20 border-primary text-foreground'
                  : 'bg-card/60 border-border hover:bg-accent/30 text-muted-foreground'
              } disabled:opacity-40 disabled:pointer-events-none`}
            >
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-amber-400" />
                <div>
                  <div className="text-xs font-medium text-foreground">AI Portrait Smart Cutout</div>
                  <div className="text-[10px] text-muted-foreground">MediaPipe neural background removal</div>
                </div>
              </div>
              {isPortraitMatting && <Check className="w-3.5 h-3.5 text-primary" />}
            </button>

            <button
              disabled={!segment}
              onClick={toggleGrayscale}
              data-testid="toggle-bw-btn"
              className="w-full flex items-center justify-between p-2.5 rounded-lg border border-border bg-card/60 hover:bg-accent/30 text-left transition-colors disabled:opacity-40 disabled:pointer-events-none"
            >
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-sky-400" />
                <div>
                  <div className="text-xs font-medium text-foreground">Black & White Filter</div>
                  <div className="text-[10px] text-muted-foreground">Instant high-contrast monochrome pass</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
