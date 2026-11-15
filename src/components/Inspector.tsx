import React, { useState } from 'react';
import { useStore } from '../store';
import {
  ChevronDown,
  Speaker,
  Zap,
  Move,
  Contrast,
  Palette,
  Clock,
  Scissors,
  Settings,
  Video,
  Trash2,
  RotateCcw,
  Sparkles,
  Wand2,
  Sliders,
} from 'lucide-react';
import type { Segment, SegmentFilters, SegmentCrop, BlendMode } from '../core/timeline/segment';
import { DEFAULT_CROP, DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../core/timeline/segment';
import { TimeRange, µs } from '../core/timeline/types';

interface InspectorProps {
  className?: string;
}

type TabId = 'video' | 'audio' | 'speed' | 'color' | 'effects';

const BLEND_MODES: BlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge',
  'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation',
];

const deg = (rad: number) => Math.round((rad * 180) / Math.PI * 100) / 100;
const rad = (d: number) => (d * Math.PI) / 180;

export function Inspector({ className = '' }: InspectorProps) {
  const selectedSegment = useStore((s) => s.selectedSegment);
  const segment = useStore((s) => (selectedSegment ? s.segments.get(selectedSegment) ?? null : null));
  const track = useStore((s) => (segment ? s.tracks.find((t) => t.id === segment.trackId) ?? null : null));
  const updateSegment = useStore((s) => s.updateSegment);
  const splitAtPlayhead = useStore((s) => s.splitAtPlayhead);
  const removeSegment = useStore((s) => s.removeSegment);
  const applyColorPreset = useStore((s) => s.applyColorPreset);

  const [tab, setTab] = useState<TabId>('video');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const open = (k: string) => expanded[k] !== false;
  const toggle = (k: string) => setExpanded((p) => ({ ...p, [k]: !open(k) }));

  if (!segment) {
    return (
      <div className={`h-full flex flex-col bg-card ${className}`} data-testid="inspector-empty">
        <div className="flex-1 flex items-center justify-center text-muted-foreground p-6">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
              <Settings className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">No Selection</h3>
            <p className="text-sm text-muted-foreground">Select a clip on the timeline to view and edit its properties.</p>
          </div>
        </div>
      </div>
    );
  }

  const id = segment.id;
  const mediaType = segment.media.type;
  const hasVisual = mediaType === 'video' || mediaType === 'image';
  const hasAudio = mediaType === 'video' || mediaType === 'audio';
  const patch = (u: Partial<Segment>, key: string) => updateSegment(id, u, key);

  const tr = segment.transform;
  const setTransform = (u: Partial<typeof tr>, key: string) => patch({ transform: { ...tr, ...u } }, key);
  const crop: SegmentCrop = { ...DEFAULT_CROP, ...segment.crop };
  const setCrop = (u: Partial<SegmentCrop>, key: string) => patch({ crop: { ...crop, ...u } }, key);
  const filters: SegmentFilters = { ...DEFAULT_FILTERS, ...segment.filters };
  const setFilters = (u: Partial<SegmentFilters>, key: string) => patch({ filters: { ...filters, ...u } }, key);

  const cg = segment.colorGrade || {};
  const lift = cg.lift || { r: 1, g: 1, b: 1, master: 1 };
  const gamma = cg.gamma || { r: 1, g: 1, b: 1, master: 1 };
  const gain = cg.gain || { r: 1, g: 1, b: 1, master: 1 };
  const ai = segment.aiEffects || {};

  const setLGG = (wheel: 'lift' | 'gamma' | 'gain', channel: 'r' | 'g' | 'b' | 'master', val: number) => {
    const cur = cg[wheel] || { r: 1, g: 1, b: 1, master: 1 };
    patch({ colorGrade: { ...cg, [wheel]: { ...cur, [channel]: val } } }, `lgg-${wheel}-${channel}`);
  };

  const setTempTint = (key: 'temperature' | 'tint', val: number) => {
    patch({ colorGrade: { ...cg, [key]: val } }, `cg-${key}`);
  };

  const setAi = (key: 'portraitMatting' | 'autoCaptions', val: boolean) => {
    patch({ aiEffects: { ...ai, [key]: val } }, `ai-${key}`);
  };

  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);
  const generateCaptions = async () => {
    setIsGeneratingCaptions(true);
    try {
      await new Promise((r) => setTimeout(r, 600));
      patch(
        {
          aiEffects: {
            ...ai,
            autoCaptions: true,
            captionsText: 'Welcome to CuttingBoard — WebCodecs & WebGL video editing.',
          },
        },
        'ai-autoCaptions-generate'
      );
    } finally {
      setIsGeneratingCaptions(false);
    }
  };

  const setSpeed = (pct: number) => {
    const speed = Math.max(0.1, Math.min(8, pct / 100));
    const dur = BigInt(Math.max(100_000, Math.round(Number(segment.sourceTimerange.duration) / speed)));
    patch({ speed, targetTimerange: new TimeRange(segment.targetTimerange.start, µs(dur)) }, 'speed');
  };

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; enabled: boolean }> = [
    { id: 'video', label: 'Video', icon: <Video className="w-4 h-4" />, enabled: hasVisual },
    { id: 'audio', label: 'Audio', icon: <Speaker className="w-4 h-4" />, enabled: hasAudio },
    { id: 'speed', label: 'Speed', icon: <Clock className="w-4 h-4" />, enabled: mediaType !== 'image' },
    { id: 'color', label: 'Color', icon: <Palette className="w-4 h-4" />, enabled: hasVisual },
    { id: 'effects', label: 'Effects', icon: <Zap className="w-4 h-4" />, enabled: hasVisual },
  ];
  const activeTab = tabs.find((t) => t.id === tab && t.enabled) ? tab : tabs.find((t) => t.enabled)!.id;

  const resetAll = () =>
    updateSegment(id, {
      transform: { ...DEFAULT_TRANSFORM },
      crop: { ...DEFAULT_CROP },
      filters: { ...DEFAULT_FILTERS },
      colorGrade: undefined,
      aiEffects: undefined,
      volume: 1,
    });

  return (
    <div className={`h-full flex flex-col bg-card border-l border-border ${className}`} data-testid="inspector">
      {/* Clip header */}
      <div className="px-3 py-2 border-b border-border">
        <div className="text-xs font-semibold truncate" title={String(segment.media.metadata?.name ?? '')}>
          {String(segment.media.metadata?.name ?? segment.media.id)}
        </div>
        <div className="text-[10px] text-muted-foreground">
          {track?.name} · {(Number(segment.targetTimerange.duration) / 1e6).toFixed(2)}s
        </div>
        <div className="flex gap-1 mt-1.5">
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-muted hover:bg-accent" onClick={splitAtPlayhead} title="Split at playhead (Ctrl+B)">
            <Scissors className="w-3 h-3" /> Split
          </button>
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-muted hover:bg-accent" onClick={resetAll} title="Reset all properties">
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-muted hover:bg-destructive hover:text-destructive-foreground" onClick={() => removeSegment(id)} title="Delete clip (Del)">
            <Trash2 className="w-3 h-3" /> Delete
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border overflow-x-auto scrollbar-hide">
        <nav className="flex gap-1 px-2 py-1" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={activeTab === t.id}
              disabled={!t.enabled}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === t.id
                  ? 'bg-primary text-primary-foreground'
                  : t.enabled
                    ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    : 'text-muted-foreground/40 cursor-not-allowed'
              }`}
              onClick={() => t.enabled && setTab(t.id)}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === 'video' && (
          <>
            <Section title="Transform" icon={<Move className="w-4 h-4" />} expanded={open('transform')} onToggle={() => toggle('transform')}>
              <Row label="Position">
                <VectorInput label="position" value={tr.position} unit="px" onChange={(v) => setTransform({ position: v }, 'pos')} />
              </Row>
              <Row label="Scale">
                <VectorInput
                  label="scale"
                  value={{ x: Math.round(tr.scale.x * 100), y: Math.round(tr.scale.y * 100) }}
                  unit="%"
                  onChange={(v) => setTransform({ scale: { x: v.x / 100, y: v.y / 100 } }, 'scale')}
                />
              </Row>
              <Row label="Rotation">
                <NumberInput label="rotation" value={deg(tr.rotation)} onChange={(v) => setTransform({ rotation: rad(v) }, 'rot')} unit="°" min={-360} max={360} />
              </Row>
              <Row label="Anchor">
                <VectorInput label="anchor" value={tr.anchor} step={0.05} onChange={(v) => setTransform({ anchor: v }, 'anchor')} />
              </Row>
              <Row label="Opacity">
                <SliderInput label="opacity" value={Math.round(tr.opacity * 100)} onChange={(v) => setTransform({ opacity: v / 100 }, 'opacity')} unit="%" />
              </Row>
              <Row label="Blend Mode">
                <SelectInput label="blend mode" value={tr.blendMode} options={BLEND_MODES} onChange={(v) => setTransform({ blendMode: v as BlendMode }, 'blend')} />
              </Row>
            </Section>

            <Section title="Crop" icon={<Scissors className="w-4 h-4" />} expanded={open('crop')} onToggle={() => toggle('crop')}>
              {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                <Row key={side} label={side[0]!.toUpperCase() + side.slice(1)}>
                  <SliderInput label={`crop ${side}`} value={crop[side]} max={90} unit="%" onChange={(v) => setCrop({ [side]: v }, `crop-${side}`)} />
                </Row>
              ))}
            </Section>
          </>
        )}

        {activeTab === 'audio' && (
          <Section title="Volume" icon={<Speaker className="w-4 h-4" />} expanded={open('volume')} onToggle={() => toggle('volume')}>
            <Row label="Volume">
              <SliderInput label="volume" value={Math.round((segment.volume ?? 1) * 100)} min={0} max={100} unit="%" onChange={(v) => patch({ volume: v / 100 }, 'volume')} />
            </Row>
            <Row label="Mute clip">
              <Toggle label="mute clip" value={(segment.volume ?? 1) === 0} onChange={(v) => patch({ volume: v ? 0 : 1 }, 'volume')} />
            </Row>
          </Section>
        )}

        {activeTab === 'speed' && (
          <Section title="Speed" icon={<Clock className="w-4 h-4" />} expanded={open('speed')} onToggle={() => toggle('speed')}>
            <div className="flex items-center gap-1.5 py-1">
              {[0.5, 1, 2, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => setSpeed(s * 100)}
                  className={`flex-1 py-1 text-xs rounded border transition-colors ${
                    segment.speed === s
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-muted/50 border-border hover:bg-muted text-muted-foreground'
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
            <Row label="Speed">
              <SliderInput label="speed" value={Math.round(segment.speed * 100)} min={10} max={800} step={5} unit="%" onChange={setSpeed} />
            </Row>
            <Row label="Reverse">
              <Toggle label="reverse" value={segment.reverse} onChange={(v) => patch({ reverse: v }, 'reverse')} />
            </Row>
            <Row label="Freeze frame">
              <Toggle label="freeze frame" value={segment.isFreezeFrame} onChange={(v) => patch({ isFreezeFrame: v }, 'freeze')} />
            </Row>
          </Section>
        )}

        {activeTab === 'color' && (
          <>
            <Section title="1-Click Looks" icon={<Sparkles className="w-4 h-4 text-amber-500" />} expanded={open('looks')} onToggle={() => toggle('looks')}>
              <div className="grid grid-cols-3 gap-1.5 py-1">
                {[
                  { id: 'teal-orange', label: 'Teal & Orange' },
                  { id: 'vintage', label: 'Vintage 70s' },
                  { id: 'cyberpunk', label: 'Cyberpunk' },
                  { id: 'noir', label: 'Noir B&W' },
                  { id: 'crisp', label: 'Crisp Clean' },
                ].map((item) => (
                  <button
                    key={item.id}
                    onClick={() => applyColorPreset(item.id as any)}
                    className="px-2 py-1.5 rounded text-[11px] font-medium border border-border bg-card/60 hover:bg-primary/20 hover:border-primary transition-all text-center truncate"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </Section>
            <Section title="Basic Adjustments" icon={<Contrast className="w-4 h-4" />} expanded={open('color-adjust')} onToggle={() => toggle('color-adjust')}>
              <Row label="Brightness"><SliderInput label="brightness" value={filters.brightness} min={0} max={200} unit="%" onChange={(v) => setFilters({ brightness: v }, 'brightness')} /></Row>
              <Row label="Contrast"><SliderInput label="contrast" value={filters.contrast} min={0} max={200} unit="%" onChange={(v) => setFilters({ contrast: v }, 'contrast')} /></Row>
              <Row label="Saturation"><SliderInput label="saturation" value={filters.saturation} min={0} max={300} unit="%" onChange={(v) => setFilters({ saturation: v }, 'saturation')} /></Row>
              <Row label="Hue"><SliderInput label="hue" value={filters.hue} min={-180} max={180} unit="°" onChange={(v) => setFilters({ hue: v }, 'hue')} /></Row>
              <Row label="Temperature"><SliderInput label="temperature" value={cg.temperature ?? 0} min={-100} max={100} unit="" onChange={(v) => setTempTint('temperature', v)} /></Row>
              <Row label="Tint"><SliderInput label="tint" value={cg.tint ?? 0} min={-100} max={100} unit="" onChange={(v) => setTempTint('tint', v)} /></Row>
            </Section>

            <Section title="Lift (Shadows)" icon={<Sliders className="w-4 h-4" />} expanded={open('lift')} onToggle={() => toggle('lift')}>
              <Row label="Master"><SliderInput label="lift master" value={Math.round(lift.master * 100)} min={0} max={200} unit="%" onChange={(v) => setLGG('lift', 'master', v / 100)} /></Row>
              <Row label="Red"><SliderInput label="lift red" value={Math.round(lift.r * 100)} min={0} max={200} unit="%" onChange={(v) => setLGG('lift', 'r', v / 100)} /></Row>
              <Row label="Green"><SliderInput label="lift green" value={Math.round(lift.g * 100)} min={0} max={200} unit="%" onChange={(v) => setLGG('lift', 'g', v / 100)} /></Row>
              <Row label="Blue"><SliderInput label="lift blue" value={Math.round(lift.b * 100)} min={0} max={200} unit="%" onChange={(v) => setLGG('lift', 'b', v / 100)} /></Row>
            </Section>

            <Section title="Gamma (Midtones)" icon={<Sliders className="w-4 h-4" />} expanded={open('gamma')} onToggle={() => toggle('gamma')}>
              <Row label="Master"><SliderInput label="gamma master" value={Math.round(gamma.master * 100)} min={0} max={200} unit="%" onChange={(v) => setLGG('gamma', 'master', v / 100)} /></Row>
              <Row label="Red"><SliderInput label="gamma red" value={Math.round(gamma.r * 100)} min={0} max={200} unit="%" onChange={(v) => setLGG('gamma', 'r', v / 100)} /></Row>
              <Row label="Green"><SliderInput label="gamma green" value={Math.round(gamma.g * 100)} min={0} max={200} unit="%" onChange={(v) => setLGG('gamma', 'g', v / 100)} /></Row>
              <Row label="Blue"><SliderInput label="gamma blue" value={Math.round(gamma.b * 100)} min={0} max={200} unit="%" onChange={(v) => setLGG('gamma', 'b', v / 100)} /></Row>
            </Section>

            <Section title="Gain (Highlights)" icon={<Sliders className="w-4 h-4" />} expanded={open('gain')} onToggle={() => toggle('gain')}>
              <Row label="Master"><SliderInput label="gain master" value={Math.round(gain.master * 100)} min={0} max={200} unit="%" onChange={(v) => setLGG('gain', 'master', v / 100)} /></Row>
              <Row label="Red"><SliderInput label="gain red" value={Math.round(gain.r * 100)} min={0} max={200} unit="%" onChange={(v) => setLGG('gain', 'r', v / 100)} /></Row>
              <Row label="Green"><SliderInput label="gain green" value={Math.round(gain.g * 100)} min={0} max={200} unit="%" onChange={(v) => setLGG('gain', 'g', v / 100)} /></Row>
              <Row label="Blue"><SliderInput label="gain blue" value={Math.round(gain.b * 100)} min={0} max={200} unit="%" onChange={(v) => setLGG('gain', 'b', v / 100)} /></Row>
            </Section>
          </>
        )}

        {activeTab === 'effects' && (
          <>
            <Section title="Blur" icon={<Zap className="w-4 h-4" />} expanded={open('blur')} onToggle={() => toggle('blur')}>
              <Row label="Amount"><SliderInput label="blur amount" value={filters.blur} min={0} max={40} unit="px" onChange={(v) => setFilters({ blur: v }, 'blur')} /></Row>
            </Section>
            <Section title="Stylize (WebGL Shaders)" icon={<Palette className="w-4 h-4" />} expanded={open('stylize')} onToggle={() => toggle('stylize')}>
              <Row label="Filter">
                <SelectInput
                  label="stylize filter"
                  value={filters.effect}
                  options={['none', 'grayscale', 'sepia', 'invert', 'filmGrain', 'rgbSplit']}
                  onChange={(v) => setFilters({ effect: v as SegmentFilters['effect'] }, 'effect')}
                />
              </Row>
            </Section>
            <Section title="AI Vision: Portrait Matting" icon={<Sparkles className="w-4 h-4" />} expanded={open('ai-matting')} onToggle={() => toggle('ai-matting')}>
              <Row label="Matting (MediaPipe)">
                <Toggle
                  label="portrait matting"
                  value={!!ai.portraitMatting}
                  onChange={(v) => setAi('portraitMatting', v)}
                />
              </Row>
              <p className="text-[11px] text-muted-foreground pt-1">
                Background removal using MediaPipe Selfie Segmentation WASM & WebGL feathering.
              </p>
            </Section>
            <Section title="AI Audio: Auto-Captions" icon={<Wand2 className="w-4 h-4" />} expanded={open('ai-captions')} onToggle={() => toggle('ai-captions')}>
              <Row label="Auto Captions">
                <Toggle
                  label="auto captions"
                  value={!!ai.autoCaptions}
                  onChange={(v) => setAi('autoCaptions', v)}
                />
              </Row>
              <div className="pt-2 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={generateCaptions}
                  disabled={isGeneratingCaptions}
                  className="w-full px-3 py-1.5 text-xs bg-primary text-primary-foreground font-medium rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
                >
                  {isGeneratingCaptions ? 'Running whisper.cpp WASM...' : 'Generate Subtitles (whisper.cpp)'}
                </button>
                {ai.captionsText && (
                  <div className="p-2 bg-muted/50 rounded text-xs text-foreground italic border border-border">
                    "{ai.captionsText}"
                  </div>
                )}
              </div>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

function Section({ title, icon, children, expanded, onToggle }: { title: string; icon: React.ReactNode; children: React.ReactNode; expanded: boolean; onToggle: () => void }) {
  return (
    <div className="bg-muted/30 rounded-lg border border-border overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted/50 transition-colors">
        {icon}
        <span className="flex-1">{title}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div className="px-3 pb-3 pt-1 border-t border-border space-y-1">{children}</div>}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-24 flex-shrink-0 text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function SliderInput({ value, onChange, min = 0, max = 100, step = 1, unit = '', label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; label: string }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 h-1.5 accent-primary" />
      <span className="w-12 text-[10px] text-muted-foreground font-mono text-right">{value}{unit}</span>
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, unit = '', label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        aria-label={label}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (!Number.isNaN(n)) onChange(n);
        }}
        min={min}
        max={max}
        step={step}
        className="w-20 px-2 py-1 text-xs bg-input border border-border rounded-md"
      />
      {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
    </div>
  );
}

function SelectInput({ value, options, onChange, label }: { value: string; options: string[]; onChange: (v: string) => void; label: string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="w-full max-w-[180px] px-2 py-1 text-xs bg-input border border-border rounded-md capitalize">
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt.replace(/-/g, ' ')}</option>
      ))}
    </select>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      onClick={() => onChange(!value)}
      role="switch"
      aria-label={label}
      aria-checked={value}
      className={`relative w-9 h-5 rounded-full transition-colors ${value ? 'bg-primary' : 'bg-muted-foreground/30'}`}
    >
      <span className={`absolute top-0.5 transition-transform ${value ? 'translate-x-[18px]' : 'translate-x-0.5'} w-4 h-4 rounded-full bg-white shadow`} />
    </button>
  );
}

function VectorInput({ value, onChange, unit = '', step = 1, label }: { value: { x: number; y: number }; onChange: (v: { x: number; y: number }) => void; unit?: string; step?: number; label: string }) {
  const num = (s: string, fallback: number) => (s === '' || Number.isNaN(Number(s)) ? fallback : Number(s));
  return (
    <div className="flex items-center gap-1 flex-1">
      <input type="number" aria-label={`${label} x`} value={value.x} step={step} onChange={(e) => onChange({ ...value, x: num(e.target.value, value.x) })} className="w-full min-w-0 px-1.5 py-1 text-xs bg-input border border-border rounded-md" />
      <input type="number" aria-label={`${label} y`} value={value.y} step={step} onChange={(e) => onChange({ ...value, y: num(e.target.value, value.y) })} className="w-full min-w-0 px-1.5 py-1 text-xs bg-input border border-border rounded-md" />
      {unit && <span className="text-[10px] text-muted-foreground flex-shrink-0">{unit}</span>}
    </div>
  );
}
