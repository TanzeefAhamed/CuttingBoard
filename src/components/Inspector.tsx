import React, { useState } from 'react';
import { useStore, type AspectRatio } from '../store';
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
  Copy,
  Type,
  Layers,
  Shield,
} from 'lucide-react';
import type { Segment, SegmentFilters, SegmentCrop, BlendMode } from '../core/timeline/segment';
import { DEFAULT_CROP, DEFAULT_FILTERS, DEFAULT_TRANSFORM } from '../core/timeline/segment';
import { TimeRange, µs } from '../core/timeline/types';
import { CultSegmentedTabs, TextureButton, TextureCard } from './ui/cult';

interface InspectorProps {
  className?: string;
}

type TabId = 'video' | 'audio' | 'speed' | 'color' | 'effects';

const BLEND_MODES: BlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten', 'color-dodge',
  'color-burn', 'hard-light', 'soft-light', 'difference', 'exclusion', 'hue', 'saturation',
];

const SWATCH_COLORS = ['#ffffff', '#000000', '#3b82f6', '#10b981', '#f59e0b', '#ef4444'];

const deg = (rad: number) => Math.round(((rad * 180) / Math.PI) * 100) / 100;
const rad = (d: number) => (d * Math.PI) / 180;

function formatSec(usVal: bigint): string {
  return `${(Number(usVal) / 1e6).toFixed(2)}s`;
}

export function Inspector({ className = '' }: InspectorProps) {
  // All Zustand selectors & React hooks MUST remain unconditional at the top of Inspector
  const selectedSegment = useStore((s) => s.selectedSegment);
  const segment = useStore((s) => (selectedSegment ? s.segments.get(selectedSegment) ?? null : null));
  const track = useStore((s) => (segment ? s.tracks.find((t) => t.id === segment.trackId) ?? null : null));
  const tracksCount = useStore((s) => s.tracks.length);
  const segmentsCount = useStore((s) => s.segments.size);
  const durationUs = useStore((s) => s.getDuration());
  const projectName = useStore((s) => s.projectName);
  const setProjectName = useStore((s) => s.setProjectName);
  const canvasAspectRatio = useStore((s) => s.canvasAspectRatio);
  const setCanvasAspectRatio = useStore((s) => s.setCanvasAspectRatio);
  const safeArea = useStore((s) => s.safeArea);
  const setSafeArea = useStore((s) => s.setSafeArea);
  const snapEnabled = useStore((s) => s.settings.snapEnabled);
  const setSettings = useStore((s) => s.setSettings);
  const rippleEnabled = useStore((s) => s.rippleEnabled);
  const setRippleEnabled = useStore((s) => s.setRippleEnabled);

  const updateSegment = useStore((s) => s.updateSegment);
  const updateSegmentText = useStore((s) => s.updateSegmentText);
  const updateSegmentMetadata = useStore((s) => s.updateSegmentMetadata);
  const splitAtPlayhead = useStore((s) => s.splitAtPlayhead);
  const duplicateSegment = useStore((s) => s.duplicateSegment);
  const removeSegment = useStore((s) => s.removeSegment);
  const applyColorPreset = useStore((s) => s.applyColorPreset);

  const [tab, setTab] = useState<TabId>('video');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [isGeneratingCaptions, setIsGeneratingCaptions] = useState(false);

  const open = (k: string) => expanded[k] !== false;
  const toggle = (k: string) => setExpanded((p) => ({ ...p, [k]: !open(k) }));

  // Empty state: Project & Stage Inspector (Cult UI)
  if (!segment) {
    return (
      <div className={`h-full flex flex-col bg-card overflow-y-auto p-3 space-y-3 ${className}`} data-testid="inspector-empty">
        <TextureCard className="p-3 space-y-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Settings className="w-3.5 h-3.5 text-primary" />
            Project & Stage
          </div>
          <Row label="Title">
            <input
              type="text"
              aria-label="Project title"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="w-full px-2 py-1 text-xs bg-input border border-border/80 rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </Row>
          <Row label="Ratio">
            <div className="grid grid-cols-3 gap-1">
              {(['16:9', '9:16', '1:1', '4:3', '21:9'] as AspectRatio[]).map((r) => (
                <TextureButton
                  key={r}
                  size="xs"
                  variant={canvasAspectRatio === r ? 'active' : 'secondary'}
                  onClick={() => setCanvasAspectRatio(r)}
                >
                  {r}
                </TextureButton>
              ))}
            </div>
          </Row>
        </TextureCard>

        <TextureCard className="p-3 space-y-1.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground mb-1">
            <Shield className="w-3.5 h-3.5 text-primary" />
            Canvas Guides & Editing
          </div>
          <Row label="Action Safe">
            <Toggle label="Action Safe" value={safeArea.actionSafe} onChange={(v) => setSafeArea({ actionSafe: v })} />
          </Row>
          <Row label="Title Safe">
            <Toggle label="Title Safe" value={safeArea.titleSafe} onChange={(v) => setSafeArea({ titleSafe: v })} />
          </Row>
          <Row label="TikTok Zone">
            <Toggle label="TikTok Zone" value={safeArea.tiktokSafe} onChange={(v) => setSafeArea({ tiktokSafe: v })} />
          </Row>
          <Row label="Snap">
            <Toggle label="Snap" value={snapEnabled} onChange={(v) => setSettings({ snapEnabled: v })} />
          </Row>
          <Row label="Ripple Edit">
            <Toggle label="Ripple Edit" value={rippleEnabled} onChange={(v) => setRippleEnabled(v)} />
          </Row>
        </TextureCard>

        <TextureCard className="p-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Timeline Summary
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-lg bg-muted/40 border border-border/60">
              <div className="text-sm font-mono font-semibold text-foreground">{tracksCount}</div>
              <div className="text-[10px] text-muted-foreground">Tracks</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/40 border border-border/60">
              <div className="text-sm font-mono font-semibold text-foreground">{segmentsCount}</div>
              <div className="text-[10px] text-muted-foreground">Clips</div>
            </div>
            <div className="p-2 rounded-lg bg-muted/40 border border-border/60">
              <div className="text-sm font-mono font-semibold text-foreground">{formatSec(durationUs)}</div>
              <div className="text-[10px] text-muted-foreground">Length</div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground text-center pt-1">
            Select any clip on the timeline to inspect transform, color grading, speed, and effects.
          </p>
        </TextureCard>
      </div>
    );
  }

  const id = segment.id;
  const mediaType = segment.media.type;
  const isText = mediaType === 'text';
  const isShape = (mediaType as string) === 'shape';
  const hasVisual = mediaType === 'video' || mediaType === 'image' || isText || isShape;
  const hasAudio = mediaType === 'video' || mediaType === 'audio';
  const patch = (u: Partial<Segment>, key?: string) => updateSegment(id, u, key);

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

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; disabled: boolean }> = [
    { id: 'video', label: 'Video', icon: <Video className="w-3.5 h-3.5" />, disabled: !hasVisual },
    { id: 'audio', label: 'Audio', icon: <Speaker className="w-3.5 h-3.5" />, disabled: !hasAudio },
    { id: 'speed', label: 'Speed', icon: <Clock className="w-3.5 h-3.5" />, disabled: mediaType === 'image' },
    { id: 'color', label: 'Color', icon: <Palette className="w-3.5 h-3.5" />, disabled: !hasVisual },
    { id: 'effects', label: 'FX', icon: <Zap className="w-3.5 h-3.5" />, disabled: !hasVisual },
  ];
  const activeTab: TabId =
    tabs.find((t) => t.id === tab && !t.disabled)?.id ??
    tabs.find((t) => !t.disabled)?.id ??
    'video';

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
    <div className={`h-full flex flex-col bg-card overflow-hidden ${className}`} data-testid="inspector">
      {/* Clip header */}
      <div className="p-2.5 border-b border-border/80 space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="text-xs font-semibold truncate text-foreground" title={String(segment.media.metadata?.name ?? '')}>
              {String(segment.media.metadata?.name ?? segment.media.id)}
            </div>
            <div className="text-[10px] text-muted-foreground font-mono">
              {track?.name ?? 'Track'} · {formatSec(segment.targetTimerange.duration)}
            </div>
          </div>
          <span className="px-1.5 py-0.5 rounded bg-muted text-[9px] uppercase font-mono text-muted-foreground flex-shrink-0">
            {mediaType}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1">
          <TextureButton size="xs" variant="secondary" onClick={splitAtPlayhead} title="Split at playhead (Ctrl+B)">
            <Scissors className="w-3 h-3" /> Split
          </TextureButton>
          <TextureButton size="xs" variant="secondary" onClick={() => duplicateSegment(id)} title="Duplicate clip (Ctrl+D)">
            <Copy className="w-3 h-3" /> Dup
          </TextureButton>
          <TextureButton size="xs" variant="secondary" onClick={resetAll} title="Reset all properties">
            <RotateCcw className="w-3 h-3" /> Reset
          </TextureButton>
          <TextureButton size="xs" variant="destructive" onClick={() => removeSegment(id)} title="Delete clip (Del)">
            <Trash2 className="w-3 h-3" /> Del
          </TextureButton>
        </div>

        {/* Cult UI Segmented Tabs */}
        <CultSegmentedTabs
          items={tabs}
          value={activeTab}
          onChange={setTab}
        />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === 'video' && (
          <>
            {isText && (
              <Section title="Text & Typography" icon={<Type className="w-4 h-4 text-emerald-400" />} expanded={open('text-style')} onToggle={() => toggle('text-style')}>
                <Row label="Content">
                  <input
                    type="text"
                    aria-label="Text content"
                    value={String(segment.media.metadata?.text ?? '')}
                    onChange={(e) => updateSegmentText(id, e.target.value)}
                    className="w-full px-2 py-1 text-xs bg-input border border-border rounded-md text-foreground"
                  />
                </Row>
                <Row label="Font Size">
                  <SliderInput
                    label="font size"
                    value={Number(segment.media.metadata?.fontSize ?? 44)}
                    min={16}
                    max={120}
                    unit="px"
                    onChange={(v) => updateSegmentMetadata(id, { fontSize: v }, 'text-size')}
                  />
                </Row>
                <Row label="Color">
                  <div className="flex items-center gap-1.5 flex-nowrap">
                    {SWATCH_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateSegmentMetadata(id, { color: c }, 'text-color')}
                        className={`w-4 h-4 rounded-full border ${segment.media.metadata?.color === c ? 'ring-2 ring-primary border-white' : 'border-white/30'}`}
                        style={{ backgroundColor: c }}
                        title={c}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="Text color"
                      value={String(segment.media.metadata?.color ?? '#ffffff')}
                      onChange={(e) => updateSegmentMetadata(id, { color: e.target.value }, 'text-color')}
                      className="w-6 h-5 bg-transparent border-0 p-0 cursor-pointer"
                    />
                  </div>
                </Row>
              </Section>
            )}

            {isShape && (
              <Section title="Shape & Style" icon={<Layers className="w-4 h-4 text-blue-400" />} expanded={open('shape-style')} onToggle={() => toggle('shape-style')}>
                <Row label="Fill">
                  <div className="flex items-center gap-1.5 flex-nowrap">
                    {SWATCH_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onClick={() => updateSegmentMetadata(id, { color: c }, 'shape-color')}
                        className={`w-4 h-4 rounded-full border ${segment.media.metadata?.color === c ? 'ring-2 ring-primary border-white' : 'border-white/30'}`}
                        style={{ backgroundColor: c }}
                      />
                    ))}
                    <input
                      type="color"
                      aria-label="Shape fill color"
                      value={String(segment.media.metadata?.color ?? '#3b82f6')}
                      onChange={(e) => updateSegmentMetadata(id, { color: e.target.value }, 'shape-color')}
                      className="w-6 h-5 bg-transparent border-0 p-0 cursor-pointer"
                    />
                  </div>
                </Row>
                <Row label="Stroke">
                  <input
                    type="color"
                    aria-label="Shape stroke color"
                    value={String(segment.media.metadata?.strokeColor ?? '#ffffff')}
                    onChange={(e) => updateSegmentMetadata(id, { strokeColor: e.target.value }, 'shape-stroke')}
                    className="w-7 h-6 bg-transparent border-0 p-0 cursor-pointer"
                  />
                </Row>
              </Section>
            )}

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
            <div className="grid grid-cols-4 gap-1 py-1">
              {[0.5, 1, 2, 4].map((s) => (
                <TextureButton
                  key={s}
                  size="xs"
                  variant={segment.speed === s ? 'active' : 'secondary'}
                  onClick={() => setSpeed(s * 100)}
                >
                  {s}x
                </TextureButton>
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
              <div className="grid grid-cols-2 gap-1.5 py-1">
                {[
                  { id: 'teal-orange', label: 'Teal & Orange' },
                  { id: 'vintage', label: 'Vintage 70s' },
                  { id: 'cyberpunk', label: 'Cyberpunk' },
                  { id: 'noir', label: 'Noir B&W' },
                  { id: 'crisp', label: 'Crisp Clean' },
                ].map((item) => (
                  <TextureButton
                    key={item.id}
                    size="xs"
                    variant="secondary"
                    onClick={() => applyColorPreset(item.id as any)}
                  >
                    {item.label}
                  </TextureButton>
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
                <TextureButton
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={generateCaptions}
                  disabled={isGeneratingCaptions}
                  className="w-full"
                >
                  {isGeneratingCaptions ? 'Running whisper.cpp WASM...' : 'Generate Subtitles (whisper.cpp)'}
                </TextureButton>
                {ai.captionsText && (
                  <div className="p-2 bg-muted/50 rounded-lg text-xs text-foreground italic border border-border">
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
    <TextureCard className="overflow-hidden">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs font-semibold text-foreground hover:bg-white/[0.03] transition-colors cursor-pointer">
        {icon}
        <span className="flex-1 truncate">{title}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && <div className="px-3 pb-3 pt-1.5 border-t border-border/60 dark:border-white/[0.06] space-y-1">{children}</div>}
    </TextureCard>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1.5">
      <span className="w-20 flex-shrink-0 text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="flex-1 min-w-0">{children}</div>
    </div>
  );
}

function SliderInput({ value, onChange, min = 0, max = 100, step = 1, unit = '', label }: { value: number; onChange: (v: number) => void; min?: number; max?: number; step?: number; unit?: string; label: string }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <input type="range" aria-label={label} min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="flex-1 h-1.5 accent-primary cursor-pointer" />
      <span className="w-11 text-[10px] text-muted-foreground font-mono text-right">{value}{unit}</span>
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
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className="w-full px-2 py-1 text-xs bg-input border border-border rounded-md capitalize">
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt.replace(/-/g, ' ')}</option>
      ))}
    </select>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
      role="switch"
      aria-label={label}
      aria-checked={value}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors cursor-pointer ${value ? 'bg-primary' : 'bg-muted-foreground/30'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${value ? 'translate-x-[18px]' : 'translate-x-0.5'}`} />
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
