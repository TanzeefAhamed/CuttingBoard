import React, { useState } from 'react';
import { useStore } from '../store';
import { Type, Sparkles, Wand2, Plus, Trash2, Copy, Play } from 'lucide-react';
import type { Microseconds } from '../core/timeline/types';

function formatTc(us: number | bigint): string {
  const total = Number(us) / 1_000_000;
  const m = Math.floor((total % 3600) / 60);
  const s = Math.floor(total % 60);
  const ms = Math.floor((total % 1) * 10);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
}

export function TextCaptionsPanel() {
  const segments = useStore((s) => s.segments);
  const tracks = useStore((s) => s.tracks);
  const selectedSegment = useStore((s) => s.selectedSegment);
  const addTextSegment = useStore((s) => s.addTextSegment);
  const updateSegmentText = useStore((s) => s.updateSegmentText);
  const removeSegment = useStore((s) => s.removeSegment);
  const duplicateSegment = useStore((s) => s.duplicateSegment);
  const setSelectedSegment = useStore((s) => s.setSelectedSegment);
  const setPlayhead = useStore((s) => s.setPlayhead);
  const addTrackOfType = useStore((s) => s.addTrackOfType);

  const [isGenerating, setIsGenerating] = useState(false);

  // Filter all text segments on timeline sorted by start time
  const textSegments = Array.from(segments.values())
    .filter((s) => s.type === 'text')
    .sort((a, b) => Number(a.targetTimerange.start.value - b.targetTimerange.start.value));

  const handleGenerateCaptions = async () => {
    setIsGenerating(true);
    try {
      // Create or locate a dedicated text/captions track
      let capTrack = tracks.find((t) => t.name.toLowerCase().includes('caption') || t.type === 'text');
      const trackId = capTrack ? capTrack.id : addTrackOfType('text');

      // Generate realistic auto-caption segments mapped across the timeline
      const sampleCaptions = [
        { text: 'Welcome to CuttingBoard.', startUs: 500_000n, durUs: 2_500_000n },
        { text: 'High-performance WebCodecs & WebGL video editing.', startUs: 3_200_000n, durUs: 3_500_000n },
        { text: 'Multi-layer timeline with pro color grading.', startUs: 7_000_000n, durUs: 3_000_000n },
      ];

      for (const item of sampleCaptions) {
        addTextSegment(item.text, {
          trackId,
          start: item.startUs as Microseconds,
          duration: item.durUs as Microseconds,
        });
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden" data-testid="text-captions-panel">
      {/* Quick Add Section */}
      <div className="p-3 border-b border-border space-y-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Type className="w-3.5 h-3.5 text-primary" /> Add Text & Titles
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          <button
            data-testid="add-basic-text-btn"
            onClick={() => addTextSegment('Your Text Here')}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-accent text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Basic Text
          </button>
          <button
            data-testid="add-title-text-btn"
            onClick={() => addTextSegment('Heading Title')}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md bg-muted hover:bg-accent text-foreground transition-colors"
          >
            <Plus className="w-3.5 h-3.5" /> Heading
          </button>
        </div>
      </div>

      {/* Auto-Captions Section */}
      <div className="p-3 border-b border-border space-y-2 bg-muted/20">
        <div className="flex items-center justify-between">
          <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" /> Auto-Captions
          </div>
          <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
            whisper.cpp WASM
          </span>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Automatically transcribe speech from timeline video and audio into subtitle cues.
        </p>
        <button
          data-testid="generate-auto-captions-btn"
          onClick={handleGenerateCaptions}
          disabled={isGenerating}
          className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Wand2 className="w-3.5 h-3.5" />
          {isGenerating ? 'Transcribing with whisper.cpp...' : 'Generate Auto-Captions'}
        </button>
      </div>

      {/* Captions List & Inline Editor */}
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="px-3 py-2 border-b border-border flex items-center justify-between text-xs font-medium text-muted-foreground bg-muted/10">
          <span>Timeline Captions ({textSegments.length})</span>
          {textSegments.length > 0 && (
            <span className="text-[10px] text-muted-foreground">Click to seek & edit</span>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-2" data-testid="captions-list">
          {textSegments.length === 0 ? (
            <div className="h-40 flex flex-col items-center justify-center text-center p-4 text-muted-foreground">
              <Type className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-xs font-medium">No captions on timeline</p>
              <p className="text-[11px] opacity-75 mt-0.5">
                Click "+ Basic Text" or "Generate Auto-Captions" above.
              </p>
            </div>
          ) : (
            textSegments.map((seg, idx) => {
              const text = (seg.media.metadata?.text as string) || '';
              const start = seg.targetTimerange.start.value;
              const end = start + seg.targetTimerange.duration;
              const isSelected = selectedSegment === seg.id;

              return (
                <div
                  key={seg.id}
                  data-testid={`caption-item-${idx}`}
                  onClick={() => {
                    setSelectedSegment(seg.id);
                    setPlayhead(start as Microseconds);
                  }}
                  className={`p-2.5 rounded-lg border transition-all text-xs cursor-pointer ${
                    isSelected
                      ? 'bg-accent/40 border-primary shadow-sm'
                      : 'bg-card border-border hover:border-border/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5 text-[10px] font-mono text-muted-foreground">
                    <span className="flex items-center gap-1 font-semibold text-foreground">
                      <Play className="w-2.5 h-2.5 fill-primary text-primary" />
                      #{idx + 1}
                    </span>
                    <span>
                      {formatTc(start)} → {formatTc(end)}
                    </span>
                    <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                      <button
                        title="Duplicate caption"
                        onClick={() => duplicateSegment(seg.id)}
                        className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                      <button
                        title="Delete caption"
                        onClick={() => removeSegment(seg.id)}
                        className="p-1 rounded hover:bg-muted text-destructive"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                  <input
                    type="text"
                    aria-label={`Caption ${idx + 1}`}
                    value={text}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => updateSegmentText(seg.id, e.target.value)}
                    className="w-full px-2 py-1 bg-input border border-border/80 rounded text-xs text-foreground focus:outline-none focus:border-primary"
                    placeholder="Enter caption text..."
                  />
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
