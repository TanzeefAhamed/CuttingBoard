import React, { useState } from 'react';
import { useStore } from '../store';
import {
  ChevronDown,
  Speaker,
  Zap,
  Move,
  RotateCw,
  Contrast,
  Palette,
  Clock,
  Scissors,
  Link,
  Plus,
  ArrowUpDown,
  Settings,
  Video,
  Keyframe as KeyframeIcon,
} from 'lucide-react';

interface InspectorProps {
  className?: string;
}

type TabId = 'video' | 'audio' | 'speed' | 'animation' | 'color' | 'effects';

export function Inspector({ className = '' }: InspectorProps) {
  const { tracks, segments, selectedSegment, selectedTrack } = useStore();

  const [activeTab, setActiveTab] = useState<TabId>('video');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    transform: true,
    compositing: true,
    speed: true,
    animation: true,
    color: true,
    effects: true,
  });

  const segment = selectedSegment
    ? (segments.get(selectedSegment) as any) ?? null
    : null;
  const track = segment ? tracks.find((t: any) => t.id === segment.trackId) : null;

  const toggleSection = (section: string) =>
    setExpanded((prev) => ({ ...prev, [section]: !prev[section] }));

  const handleNumberChange = (_field: string, _value: number) => {
    /* wired to store command in a later milestone */
  };

  const noop = () => {};

  if (!segment) {
    return (
      <div className={`h-full flex flex-col bg-card ${className}`}>
        <div className="flex-1 flex items-center justify-center text-muted-foreground p-6">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
              <Settings className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">No Selection</h3>
            <p className="text-sm text-muted-foreground">
              Select a clip on the timeline to view and edit its properties.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const isVideo = track?.type === 'video';
  const isAudio = track?.type === 'audio';

  const tabs: Array<{ id: TabId; label: string; icon: React.ReactNode; enabled: boolean }> = [
    { id: 'video', label: 'Video', icon: <Video className="w-4 h-4" />, enabled: isVideo },
    { id: 'audio', label: 'Audio', icon: <Speaker className="w-4 h-4" />, enabled: isAudio },
    { id: 'speed', label: 'Speed', icon: <Clock className="w-4 h-4" />, enabled: true },
    { id: 'animation', label: 'Animation', icon: <Move className="w-4 h-4" />, enabled: true },
    { id: 'color', label: 'Color', icon: <Palette className="w-4 h-4" />, enabled: true },
    { id: 'effects', label: 'Effects', icon: <Zap className="w-4 h-4" />, enabled: true },
  ];

  return (
    <div className={`h-full flex flex-col bg-card border-l border-border ${className}`}>
      {/* Tabs */}
      <div className="border-b border-border overflow-x-auto scrollbar-hide">
        <nav className="flex gap-1 px-2 py-1" role="tablist">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              disabled={!tab.enabled}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : tab.enabled
                    ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    : 'text-muted-foreground/40 cursor-not-allowed'
              }`}
              onClick={() => tab.enabled && setActiveTab(tab.id)}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {activeTab === 'video' && (
          <>
            <Section
              title="Transform"
              icon={<Move className="w-4 h-4" />}
              expanded={expanded.transform}
              onToggle={() => toggleSection('transform')}
            >
              <Row label="Position">
                <VectorInput value={{ x: 0, y: 0 }} onChange={noop} unit="px" />
              </Row>
              <Row label="Scale">
                <VectorInput value={{ x: 100, y: 100 }} onChange={noop} unit="%" step={1} />
              </Row>
              <Row label="Rotation">
                <NumberInput value={0} onChange={noop} unit="°" min={-360} max={360} />
              </Row>
              <Row label="Anchor">
                <VectorInput value={{ x: 0.5, y: 0.5 }} onChange={noop} step={0.01} />
              </Row>
              <Row label="Opacity">
                <SliderInput value={100} onChange={noop} min={0} max={100} unit="%" />
              </Row>
              <Row label="Blend Mode">
                <SelectInput
                  value="normal"
                  options={[
                    'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
                    'color-dodge', 'color-burn', 'hard-light', 'soft-light',
                    'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity',
                  ]}
                  onChange={noop}
                />
              </Row>
            </Section>

            <Section
              title="Crop"
              icon={<Scissors className="w-4 h-4" />}
              expanded={expanded.compositing}
              onToggle={() => toggleSection('compositing')}
            >
              <Row label="Top"><SliderInput value={0} onChange={noop} unit="%" /></Row>
              <Row label="Bottom"><SliderInput value={0} onChange={noop} unit="%" /></Row>
              <Row label="Left"><SliderInput value={0} onChange={noop} unit="%" /></Row>
              <Row label="Right"><SliderInput value={0} onChange={noop} unit="%" /></Row>
            </Section>

            <Section
              title="Stabilization"
              icon={<RotateCw className="w-4 h-4" />}
              expanded={expanded.compositing}
              onToggle={() => toggleSection('compositing')}
            >
              <Row label="Enable"><Toggle value={false} onChange={noop} /></Row>
              <Row label="Strength"><SliderInput value={50} onChange={noop} /></Row>
              <Row label="Smoothness"><SliderInput value={50} onChange={noop} /></Row>
            </Section>
          </>
        )}

        {activeTab === 'audio' && (
          <>
            <Section
              title="Volume"
              icon={<Speaker className="w-4 h-4" />}
              expanded={expanded.transform}
              onToggle={() => toggleSection('transform')}
            >
              <Row label="Volume"><SliderInput value={100} onChange={noop} min={0} max={200} unit="%" /></Row>
              <Row label="Pan"><SliderInput value={0} onChange={noop} min={-100} max={100} /></Row>
              <Row label="Fade In"><NumberInput value={0} onChange={noop} unit="s" step={0.1} min={0} /></Row>
              <Row label="Fade Out"><NumberInput value={0} onChange={noop} unit="s" step={0.1} min={0} /></Row>
            </Section>

            <Section
              title="Audio Effects"
              icon={<Zap className="w-4 h-4" />}
              expanded={expanded.effects}
              onToggle={() => toggleSection('effects')}
            >
              <Row label="Denoise"><Toggle value={false} onChange={noop} /></Row>
              <Row label="Strength"><SliderInput value={50} onChange={noop} /></Row>
              <Row label="Reverb"><Toggle value={false} onChange={noop} /></Row>
              <Row label="Room Size"><SliderInput value={50} onChange={noop} /></Row>
            </Section>
          </>
        )}

        {activeTab === 'speed' && (
          <>
            <Section
              title="Speed"
              icon={<Clock className="w-4 h-4" />}
              expanded={expanded.speed}
              onToggle={() => toggleSection('speed')}
            >
              <Row label="Speed"><SliderInput value={100} onChange={noop} min={1} max={1000} unit="%" /></Row>
              <Row label="Reverse"><Toggle value={false} onChange={noop} /></Row>
              <Row label="Pitch Correction"><Toggle value={true} onChange={noop} /></Row>
              <Row label="Ripple Edit"><Toggle value={true} onChange={noop} /></Row>
            </Section>

            <Section
              title="Ramping"
              icon={<ArrowUpDown className="w-4 h-4" />}
              expanded={expanded.speed}
              onToggle={() => toggleSection('speed')}
            >
              <Row label="Ramp Up"><NumberInput value={0} onChange={noop} unit="s" step={0.1} min={0} /></Row>
              <Row label="Ramp Down"><NumberInput value={0} onChange={noop} unit="s" step={0.1} min={0} /></Row>
              <Row label="Curve">
                <SelectInput
                  value="linear"
                  options={['linear', 'ease-in', 'ease-out', 'ease-in-out', 'custom']}
                  onChange={noop}
                />
              </Row>
            </Section>
          </>
        )}

        {activeTab === 'animation' && (
          <Section
            title="Keyframes"
            icon={<KeyframeIcon className="w-4 h-4" />}
            expanded={expanded.animation}
            onToggle={() => toggleSection('animation')}
          >
            <div className="space-y-3">
              {(['Position', 'Scale', 'Rotation', 'Opacity'] as const).map((prop, i) => (
                <div key={prop} className="pb-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2 text-sm">
                    <KeyframeIcon
                      className={`w-4 h-4 ${['text-primary', 'text-amber-500', 'text-emerald-500', 'text-fuchsia-500'][i]}`}
                    />
                    <span className="font-medium">{prop}</span>
                    <button className="ml-auto p-1 rounded hover:bg-accent" title="Add keyframe">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              <Row label="Default Easing">
                <SelectInput
                  value="ease-in-out"
                  options={['linear', 'ease-in', 'ease-out', 'ease-in-out', 'custom']}
                  onChange={noop}
                />
              </Row>
            </div>
          </Section>
        )}

        {activeTab === 'color' && (
          <>
            <Section
              title="Lift / Gamma / Gain"
              icon={<Contrast className="w-4 h-4" />}
              expanded={expanded.color}
              onToggle={() => toggleSection('color')}
            >
              <div className="space-y-3">
                {(['Lift (Shadows)', 'Gamma (Midtones)', 'Gain (Highlights)'] as const).map((label) => (
                  <div key={label}>
                    <div className="text-[10px] font-medium text-muted-foreground mb-1.5">{label}</div>
                    <div className="grid grid-cols-4 gap-2">
                      <ColorInput label="Master" value="#808080" onChange={noop} />
                      <ColorInput label="R" value="#ff0000" onChange={noop} />
                      <ColorInput label="G" value="#00ff00" onChange={noop} />
                      <ColorInput label="B" value="#0000ff" onChange={noop} />
                    </div>
                  </div>
                ))}
              </div>
            </Section>

            <Section
              title="3D LUT"
              icon={<Link className="w-4 h-4" />}
              expanded={expanded.color}
              onToggle={() => toggleSection('color')}
            >
              <div className="flex items-center gap-2">
                <input type="file" accept=".cube" className="flex-1 text-xs" />
                <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs">
                  Load .cube
                </button>
              </div>
              <Row label="Intensity">
                <SliderInput value={100} onChange={noop} unit="%" />
              </Row>
            </Section>
          </>
        )}

        {activeTab === 'effects' && (
          <>
            <Section
              title="Blur"
              icon={<Zap className="w-4 h-4" />}
              expanded={expanded.effects}
              onToggle={() => toggleSection('effects')}
            >
              <Row label="Type">
                <SelectInput
                  value="gaussian"
                  options={['gaussian', 'directional', 'box', 'radial', 'zoom']}
                  onChange={noop}
                />
              </Row>
              <Row label="Amount"><SliderInput value={0} onChange={noop} /></Row>
            </Section>

            <Section
              title="Stylize"
              icon={<Palette className="w-4 h-4" />}
              expanded={expanded.effects}
              onToggle={() => toggleSection('effects')}
            >
              <Row label="Type">
                <SelectInput
                  value="none"
                  options={['none', 'rgb-split', 'glitch', 'prism', 'film-grain', 'halftone']}
                  onChange={noop}
                />
              </Row>
              <Row label="Amount"><SliderInput value={0} onChange={noop} /></Row>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ helpers */

function Section({
  title,
  icon,
  children,
  expanded,
  onToggle,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="bg-muted/30 rounded-lg border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2.5 text-left text-sm font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
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

function SliderInput({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit = '',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-1.5 accent-primary"
      />
      <span className="w-12 text-[10px] text-muted-foreground font-mono text-right">
        {value}
        {unit}
      </span>
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  unit = '',
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-20 px-2 py-1 text-xs bg-input border border-border rounded-md"
      />
      {unit && <span className="text-[10px] text-muted-foreground">{unit}</span>}
    </div>
  );
}

function SelectInput({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full max-w-[180px] px-2 py-1 text-xs bg-input border border-border rounded-md capitalize"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>
          {opt.replace(/-/g, ' ')}
        </option>
      ))}
    </select>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      role="switch"
      aria-checked={value}
      className={`relative w-9 h-5 rounded-full transition-colors ${
        value ? 'bg-primary' : 'bg-muted-foreground/30'
      }`}
    >
      <span
        className={`absolute top-0.5 transition-transform ${
          value ? 'translate-x-[18px]' : 'translate-x-0.5'
        } w-4 h-4 rounded-full bg-white shadow`}
      />
    </button>
  );
}

function VectorInput({
  value,
  onChange,
  unit = '',
  step = 1,
}: {
  value: { x: number; y: number };
  onChange: (v: { x: number; y: number }) => void;
  unit?: string;
  step?: number;
}) {
  return (
    <div className="flex items-center gap-1 flex-1">
      <input
        type="number"
        value={value.x}
        step={step}
        onChange={(e) => onChange({ ...value, x: Number(e.target.value) })}
        className="w-full min-w-0 px-1.5 py-1 text-xs bg-input border border-border rounded-md"
      />
      <input
        type="number"
        value={value.y}
        step={step}
        onChange={(e) => onChange({ ...value, y: Number(e.target.value) })}
        className="w-full min-w-0 px-1.5 py-1 text-xs bg-input border border-border rounded-md"
      />
      {unit && <span className="text-[10px] text-muted-foreground flex-shrink-0">{unit}</span>}
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5">
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-7 rounded border border-border cursor-pointer"
        title={label}
      />
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}
