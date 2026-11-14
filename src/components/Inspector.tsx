import React, { useState, useMemo } from 'react';
import { useStore } from '../store';
import { 
  ChevronDown, ChevronRight, 
  SlidersHorizontal, Speaker, 
  Zap, Move, RotateCw, 
  Contrast, Palette, 
  Clock, Scissors, 
  Link, Unlink, 
  Plus, Minus, Trash2,
  Eye, EyeOff,
  Lock, Unlock,
  Copy, Paste,
  ArrowUpDown, ArrowLeftRight,
  Reset, Settings,
  Keyframe, Keyframe as KeyframeIcon
} from 'lucide-react';
import { useStore } from '../store';
import { 
  TimePoint, TimeRange, Microseconds, µs, µsFromFrames, toSeconds, toFrames 
} from '../core/timeline/types';
import { Segment } from '../core/timeline/segment';
import { Track } from '../core/timeline/track';

interface InspectorProps {
  className?: string;
}

export function Inspector({ className = '' }) {
  const { 
    selectedSegment, 
    setSelectedSegment,
    tracks,
    segments,
    updateSegment,
    selectedTrack,
    setSelectedTrack,
  } = useStore();

  const [activeTab, setActiveTab] = useState<'video' | 'audio' | 'speed' | 'animation' | 'effects' | 'adjustments'>('video');
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
    transform: true,
    compositing: true,
    speed: true,
    animation: true,
    color: true,
    effects: true,
  });

  const selectedSegmentId = useStore.getState().selectedSegment;
  const segment = selectedSegmentId ? useStore.getState().segments.get(selectedSegmentId) : null;
  const track = selectedSegmentId ? tracks.find(t => t.id === segment?.trackId) : null;

  const toggleSection = (section: string) => {
    setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const formatTime = (us: bigint | number): string => {
    const us = typeof us === 'bigint' ? Number(us) : us;
    const seconds = us / 1_000_000;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const seconds = Math.floor(seconds % 60);
    const frames = Math.floor((seconds % 1) * 30);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${frames.toString().padStart(2, '0')}`;
  };

  const handleNumberChange = (field: string, value: number) => {
    // Would update segment property
    console.log('Change:', field, value);
  };

  const handleVectorChange = (field: string, value: { x: number; y: number }) => {
    // Would update vector property
    console.log('Change:', field, value);
  };

  if (!segment) {
    return (
      <div className={`h-full flex flex-col ${className}`}>
        <div className="flex-1 flex items-center justify-center text-muted-foreground">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 bg-muted rounded-full flex items-center justify-center">
              <Settings className="w-8 h-8 text-muted-foreground/50" />
            </div>
            <h3 className="text-lg font-medium text-foreground mb-1">No Selection</h3>
            <p className="text-sm text-muted-foreground">
              Select a clip on the timeline to view and edit its properties
            </p>
          </div>
        </div>
      </div>
    );
  }

  const segmentTrack = useMemo(() => tracks.find(t => t.id === segment.trackId), [tracks, segment.trackId]);
  const isVideo = segmentTrack?.type === 'video';
  const isAudio = segmentTrack?.type === 'audio';

  return (
    <div className={`h-full flex flex-col bg-card border-l border-border ${className}`}>
      {/* Tabs */}
      <div className="border-b border-border">
        <nav className="flex gap-1 px-2" role="tablist">
          {([
            { id: 'video', label: 'Video', icon: <Video className="w-4 h-4" />, enabled: isVideo },
            { id: 'audio', label: 'Audio', icon: <Speaker className="w-4 h-4" />, enabled: isAudio },
            { id: 'speed', label: 'Speed', icon: <Clock className="w-4 h-4" />, enabled: true },
            { id: 'animation', label: 'Animation', icon: <Move className="w-4 h-4" />, enabled: true },
            { id: 'color', label: 'Color', icon: <Palette className="w-4 h-4" />, enabled: isVideo },
            { id: 'effects', label: 'Effects', icon: <Zap className="w-4 h-4" />, enabled: true },
          ].map(tab => (
            <button
              key={tab.id}
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : tab.enabled
                    ? 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                    : 'text-muted-foreground/50 cursor-not-allowed'
              }`}
              onClick={() => tab.enabled && setActiveTab(tab.id)}
              disabled={!tab.enabled}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {activeTab === 'video' && (
          <InspectorSection title="Transform" icon={<Move className="w-4 h-4" />} expanded={expandedSections.transform} onToggle={() => toggleSection('transform')}>
            <InspectorRow label="Position">
              <VectorInput 
                value={{ x: 0, y: 0 }} 
                onChange={(v) => handleNumberChange('position', v)}
                unit="px"
              />
            </InspectorRow>
            <InspectorRow label="Scale">
              <VectorInput 
                value={{ x: 1, y: 1 }} 
                onChange={(v) => handleVectorChange('scale', v)}
                unit="%"
                defaultValue={100}
              />
            </InspectorRow>
            <InspectorRow label="Rotation">
              <NumberInput 
                value={0} 
                onChange={(v) => handleNumberChange('rotation', v)}
                unit="°"
                step={1}
                min={-360}
                max={360}
              />
            </InspectorRow>
            <InspectorRow label="Anchor">
              <VectorInput 
                value={{ x: 0.5, y: 0.5 }} 
                onChange={(v) => handleVectorChange('anchor', v)}
                unit=""
                step={0.01}
                min={0}
                max={1}
              />
            </InspectorRow>
            <InspectorRow label="Opacity">
              <SliderInput 
                value={1} 
                onChange={(v) => handleNumberChange('opacity', v)}
                min={0}
                max={1}
                step={0.01}
              />
            </InspectorRow>
            <InspectorRow label="Blend Mode">
              <SelectInput
                value="normal"
                options={[
                  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
                  'color-dodge', 'color-burn', 'hard-light', 'soft-light',
                  'difference', 'exclusion', 'hue', 'saturation', 'color', 'luminosity'
                ]}
                onChange={(v) => handleNumberChange('blendMode', v)}
              />
            </InspectorRow>
          </InspectorSection>

          <InspectorSection title="Cropping" icon={<ScissorsIcon className="w-4 h-4" />} expanded={expandedSections.compositing} onToggle={() => toggleSection('compositing')}>
            <InspectorRow label="Crop Top">
              <SliderInput value={0} onChange={(v) => {}} min={0} max={1} step={0.01} />
            </InspectorRow>
            <InspectorRow label="Crop Bottom">
              <SliderInput value={0} onChange={(v) => {}} min={0} max={1} step={0.01} />
            </InspectorRow>
            <InspectorRow label="Crop Left">
              <SliderInput value={0} onChange={(v) => {}} min={0} max={1} step={0.01} />
            </InspectorRow>
            <InspectorRow label="Crop Right">
              <SliderInput value={0} onChange={(v) => {}} min={0} max={1} step={0.01} />
            </InspectorRow>
          </InspectorSection>

          <InspectorSection title="Stabilization" icon={<RotateCw className="w-4 h-4" />} expanded={expandedSections.compositing} onToggle={() => toggleSection('compositing')}>
            <InspectorRow label="Enable">
              <Toggle value={false} onChange={(v) => {}} />
            </InspectorRow>
            <InspectorRow label="Strength">
              <SliderInput value={50} onChange={(v) => {}} min={0} max={100} />
            </InspectorRow>
            <InspectorRow label="Smoothness">
              <SliderInput value={50} onChange={(v) => {}} min={0} max={100} />
            </InspectorRow>
          </InspectorSection>
        )}

        {activeTab === 'audio' && (
          <InspectorSection title="Volume" icon={<Speaker className="w-4 h-4" />} expanded={expandedSections.transform} onToggle={() => toggleSection('transform')}>
            <InspectorRow label="Volume">
              <SliderInput value={1} onChange={(v) => {}} min={0} max={2} step={0.01} />
            </InspectorRow>
            <InspectorRow label="Pan">
              <SliderInput value={0} onChange={(v) => {}} min={-1} max={1} step={0.01} />
            </InspectorRow>
            <InspectorRow label="Fade In">
              <NumberInput value={0} onChange={(v) => {}} unit="s" step={0.1} min={0} />
            </InspectorRow>
            <InspectorRow label="Fade Out">
              <NumberInput value={0} onChange={(v) => {}} unit="s" step={0.1} min={0} />
            </InspectorRow>
            <InspectorRow label="EQ">
              <SelectInput value="flat" options={['flat', 'bass boost', 'vocal', 'treble boost', 'custom']} onChange={(v) => {}} />
            </InspectorRow>
          </InspectorSection>

          <InspectorSection title="Effects" icon={<Zap className="w-4 h-4" />} expanded={expandedSections.effects} onToggle={() => toggleSection('effects')}>
            <InspectorRow label="Noise Reduction">
              <Toggle value={false} onChange={(v) => {}} />
            </InspectorRow>
            <InspectorRow label="Strength">
              <SliderInput value={50} onChange={(v) => {}} min={0} max={100} />
            </InspectorRow>
            <InspectorRow label="Reverb">
              <Toggle value={false} onChange={(v) => {}} />
            </InspectorRow>
            <InspectorRow label="Room Size">
              <SliderInput value={50} onChange={(v) => {}} min={0} max={100} />
            </InspectorRow>
          </InspectorSection>
        )}

        {activeTab === 'speed' && (
          <InspectorSection title="Speed" icon={<Clock className="w-4 h-4" />} expanded={expandedSections.speed} onToggle={() => toggleSection('speed')}>
            <InspectorRow label="Speed">
              <SliderInput value={1} onChange={(v) => {}} min={0.01} max={100} step={0.01} />
            </InspectorRow>
            <InspectorRow label="Duration">
              <NumberInput value={10} onChange={(v) => {}} unit="s" step={0.1} min={0.01} />
            </InspectorRow>
            <InspectorRow label="Reverse">
              <Toggle value={false} onChange={(v) => {}} />
            </InspectorRow>
            <InspectorRow label="Pitch Correction">
              <Toggle value={true} onChange={(v) => {}} />
            </InspectorRow>
            <InspectorRow label="Ripple Edit">
              <Toggle value={true} onChange={(v) => {}} />
            </InspectorRow>
          </InspectorSection>

          <InspectorSection title="Ramping" icon={<ArrowUpDown className="w-4 h-4" />} expanded={expandedSections.speed} onToggle={() => toggleSection('speed')}>
            <InspectorRow label="Ramp Up">
              <NumberInput value={0} onChange={(v) => {}} unit="s" step={0.1} min={0} />
            </InspectorRow>
            <InspectorRow label="Ramp Down">
              <NumberInput value={0} onChange={(v) => {}} unit="s" step={0.1} min={0} />
            </InspectorRow>
            <InspectorRow label="Curve">
              <SelectInput value="linear" options={['linear', 'ease-in', 'ease-out', 'ease-in-out', 'custom']} onChange={(v) => {}} />
            </InspectorRow>
          </InspectorSection>
        )}

        {activeTab === 'animation' && (
          <InspectorSection title="Keyframes" icon={<KeyframeIcon className="w-4 h-4" />} expanded={expandedSections.animation} onToggle={() => toggleSection('animation')}>
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <KeyframeIcon className="w-4 h-4 text-primary" />
                <span className="font-medium">Position</span>
                <button className="ml-auto p-1 rounded hover:bg-accent" title="Add keyframe">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                <div>X: 0px</div>
                <div>Y: 0px</div>
              </div>
              <div className="pt-2 border-t border-border">
                <div className="flex items-center gap-2 text-sm">
                  <KeyframeIcon className="w-4 h-4 text-amber-500" />
                  <span className="font-medium">Scale</span>
                  <button className="ml-auto p-1 rounded hover:bg-accent" title="Add keyframe">
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                  <div>X: 100%</div>
                  <div>Y: 100%</div>
                </div>
                <div className="pt-2 border-t border-border">
                  <div className="flex items-center gap-2 text-sm">
                    <KeyframeIcon className="w-4 h-4 text-emerald-500" />
                    <span className="font-medium">Rotation</span>
                    <button className="ml-auto p-1 rounded hover:bg-accent" title="Add keyframe">
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
                    <div>0°</div>
                    <div>0°</div>
                  </div>
                </div>
              </div>
            </div>
          </InspectorSection>

          <InspectorSection title="Easing" icon={<ArrowUpDown className="w-4 h-4" />} expanded={expandedSections.animation} onToggle={() => toggleSection('animation')}>
            <InspectorRow label="Default Easing">
              <SelectInput value="ease-in-out" options={['linear', 'ease-in', 'ease-out', 'ease-in-out', 'ease-in-back', 'ease-out-back', 'ease-in-out-back', 'custom']} onChange={(v) => {}} />
            </InspectorRow>
            <InspectorRow label="Custom Curve">
              <div className="w-full h-24 bg-muted rounded-lg border border-border relative">
                <canvas className="w-full h-full" />
              </div>
            </InspectorRow>
          </InspectorSection>
        )}

        {activeTab === 'color' && (
          <InspectorSection title="Lift / Gamma / Gain" icon={<Contrast className="w-4 h-4" />} expanded={expandedSections.color} onToggle={() => toggleSection('color')}>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Lift (Shadows)</label>
                <div className="grid grid-cols-4 gap-2">
                  <ColorWheelInput label="Master" value="#ffffff" onChange={(c) => {}} />
                  <ColorWheelInput label="R" value="#ff0000" onChange={(c) => {}} />
                  <ColorWheelInput label="G" value="#00ff00" onChange={(c) => {}} />
                  <ColorWheelInput label="B" value="#0000ff" onChange={(c) => {}} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Gamma (Midtones)</label>
                <div className="grid grid-cols-4 gap-2">
                  <ColorWheelInput label="Master" value="#ffffff" onChange={(c) => {}} />
                  <ColorWheelInput label="R" value="#ff0000" onChange={(c) => {}} />
                  <ColorWheelInput label="G" value="#00ff00" onChange={(c) => {}} />
                  <ColorWheelInput label="B" value="#0000ff" onChange={(c) => {}} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-2">Gain (Highlights)</label>
                <div className="grid grid-cols-4 gap-2">
                  <ColorWheelInput label="Master" value="#ffffff" onChange={(c) => {}} />
                  <ColorWheelInput label="R" value="#ff0000" onChange={(c) => {}} />
                  <ColorWheelInput label="G" value="#00ff00" onChange={(c) => {}} />
                  <ColorWheelInput label="B" value="#0000ff" onChange={(c) => {}} />
                </div>
              </div>
            </div>
          </InspectorSection>

          <InspectorSection title="HSL Selective" icon={<Palette className="w-4 h-4" />} expanded={expandedSections.color} onToggle={() => toggleSection('color')}>
            <div className="space-y-2">
              {['Red', 'Orange', 'Yellow', 'Green', 'Cyan', 'Blue', 'Purple', 'Magenta'].map((color) => (
                <div key={color} className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded" style={{ backgroundColor: color.toLowerCase() }} />
                  <div className="flex-1 flex items-center gap-2">
                    <SliderInput label="H" value={0} onChange={(v) => {}} min={-180} max={180} step={1} />
                    <SliderInput label="S" value={1} onChange={(v) => {}} min={0} max={2} step={0.01} />
                    <SliderInput label="L" value={0} onChange={(v) => {}} min={-1} max={1} step={0.01} />
                  </div>
                </div>
              ))}
            </div>
          </InspectorSection>

          <InspectorSection title="Curves" icon={<Zap className="w-4 h-4" />} expanded={expandedSections.color} onToggle={() => toggleSection('color')}>
            <div className="space-y-2">
              <select className="w-full px-3 py-2 bg-input border border-border rounded-lg text-sm">
                <option value="master">Master (Luma)</option>
                <option value="red">Red</option>
                <option value="green">Green</option>
                <option value="blue">Blue</option>
              </select>
              <div className="w-full h-32 bg-muted rounded-lg border border-border relative">
                <canvas className="w-full h-full" />
              </div>
            </div>
          </InspectorSection>

          <InspectorSection title="3D LUT" icon={<Link className="w-4 h-4" />} expanded={expandedSections.color} onToggle={() => toggleSection('color')}>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input type="file" accept=".cube" className="flex-1 text-sm" />
                <button className="px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm">Load .cube</button>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="lut-enabled" />
                <label htmlFor="lut-enabled" className="text-sm">Enable LUT</label>
              </div>
              <InspectorRow label="Intensity">
                <SliderInput value={1} onChange={(v) => {}} min={0} max={2} step={0.01} />
              </InspectorRow>
            </div>
          </InspectorSection>
        )}

        {activeTab === 'effects' && (
          <>
            <InspectorSection title="Blur" icon={<Zap className="w-4 h-4" />} expanded={expandedSections.effects} onToggle={() => toggleSection('effects')}>
              <InspectorRow label="Type">
                <SelectInput value="gaussian" options={['gaussian', 'directional', 'box', 'radial', 'zoom']} onChange={(v) => {}} />
              </InspectorRow>
              <InspectorRow label="Amount">
                <SliderInput value={0} onChange={(v) => {}} min={0} max={100} step={0.1} />
              </InspectorRow>
            </InspectorSection>

            <InspectorSection title="Distortion" icon={<Move className="w-4 h-4" />} expanded={expandedSections.effects} onToggle={() => toggleSection('effects')}>
              <InspectorRow label="Type">
                <SelectInput value="none" options={['none', 'rgb-split', 'glitch', 'prism', 'fisheye', 'pinch', 'twirl']} onChange={(v) => {}} />
              </InspectorRow>
              <InspectorRow label="Amount">
                <SliderInput value={0} onChange={(v) => {}} min={0} max={100} step={1} />
              </InspectorRow>
            </InspectorSection>

            <InspectorSection title="Stylize" icon={<Palette className="w-4 h-4" />} expanded={expandedSections.effects} onToggle={() => toggleSection('effects')}>
              <InspectorRow label="Type">
                <SelectInput value="none" options={['none', 'film-grain', 'halftone', 'posterize', 'solarize', 'threshold', 'noise']} onChange={(v) => {}} />
              </InspectorRow>
              <InspectorRow label="Amount">
                <SliderInput value={0} onChange={(v) => {}} min={0} max={100} step={1} />
              </InspectorRow>
            </InspectorSection>

            <InspectorSection title="Transitions" icon={<Link className="w-4 h-4" />} expanded={expandedSections.effects} onToggle={() => toggleSection('effects')}>
              <div className="space-y-2">
                <div className="grid grid-cols-3 gap-2 p-3 bg-muted rounded-lg">
                  {['cross-dissolve', 'dip-to-black', 'slide', 'push', 'wipe', 'zoom', 'flash', 'glitch'].map((t) => (
                    <button key={t} className="p-2 text-xs text-center rounded-lg hover:bg-accent transition-colors capitalize">
                      {t.replace('-', ' ')}
                    </button>
                  ))}
                </div>
                <InspectorRow label="Duration">
                  <NumberInput value={1} onChange={(v) => {}} unit="s" step={0.1} min={0.1} />
                </InspectorRow>
                <InspectorRow label="Alignment">
                  <SelectInput value="center" options={['center', 'start', 'end']} onChange={(v) => {}} />
                </InspectorRow>
              </div>
            </InspectorSection>
          </>
        )}
      </div>
    </div>
  );
}

// Helper Components
function InspectorSection({ 
  title, icon, children, expanded, onToggle 
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
        className="w-full flex items-center gap-2 px-4 py-3 text-left font-medium text-foreground hover:bg-muted/50 transition-colors"
      >
        {icon}
        <span className="flex-1">{title}</span>
        <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="px-4 pb-4 border-t border-border animate-slide-in">
          {children}
        </div>
      )}
    </div>
  );
}

function InspectorRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-2">
      <label className="w-28 text-xs font-medium text-muted-foreground">{label}</label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function SliderInput({ value, onChange, min = 0, max = 100, step = 1, unit = '' }) {
  return (
    <div className="flex items-center gap-2 flex-1">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 h-2 bg-muted rounded-full appearance-none accent-primary"
      />
      <span className="w-12 text-xs text-muted-foreground font-mono text-right">
        {value}{''}
      </span>
    </div>
  );
}

function NumberInput({ value, onChange, min, max, step = 1, unit = '' }) {
  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        min={min}
        max={max}
        step={step}
        className="w-20 px-2 py-1.5 text-sm bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
}

function SelectInput({ value, options, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="px-3 py-1.5 bg-input border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring w-full max-w-xs"
    >
      {options.map((opt) => (
        <option key={opt} value={opt}>{opt}</option>
      ))}
    </select>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-6 rounded-full transition-colors ${
        value ? 'bg-primary' : 'bg-muted'
      }`}
      role="switch"
      aria-checked={value}
    >
      <span className={`absolute top-0.5 transition-transform ${
        value ? 'translate-x-5' : 'translate-x-0.5'
      } w-5 h-5 rounded-full bg-white shadow`} />
    </button>
  );
}

function VectorInput({ value, onChange, unit = '', step = 0.01, min, max, defaultValue }) {
  return (
    <div className="flex items-center gap-1 flex-1">
      <input
        type="number"
        value={value.x}
        onChange={(e) => onChange({ ...value, x: Number(e.target.value) })}
        min={min}
        max={max}
        step={step}
        className="w-1/2 px-2 py-1.5 text-sm bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {unit && <span className="text-xs text-muted-foreground px-1">{unit}</span>}
      <input
        type="number"
        value={value.y}
        onChange={(e) => onChange({ ...value, y: Number(e.target.value) })}
        min={min}
        max={max}
        step={step}
        className="w-1/2 px-2 py-1.5 text-sm bg-input border border-border rounded-lg text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
    </div>
  );
}

function ColorWheelInput({ label, value, onChange }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <label className="text-xs text-muted-foreground">{label}</label>
      <input
        type="color"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-8 h-8 rounded border border-border cursor-pointer"
      />
    </div>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-6 rounded-full transition-colors ${
        value ? 'bg-primary' : 'bg-muted'
      }`}
      role="switch"
      aria-checked={value}
    >
      <span className={`absolute top-0.5 transition-transform ${
        value ? 'translate-x-5' : 'translate-x-0.5'
      } w-5 h-5 rounded-full bg-white shadow`} />
    </button>
  );
}

function Toggle({ value, onChange }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`relative w-10 h-6 rounded-full transition-colors ${
        value ? 'bg-primary' : 'bg-muted'
      }`}
      role="switch"
      aria-checked={value}
    >
      <span className={`absolute top-0.5 transition-transform ${
        value ? 'translate-x-5' : 'translate-x-0.5'
      } w-5 h-5 rounded-full bg-white shadow`} />
    </button>
  );
}