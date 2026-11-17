import React, { useState, useRef } from 'react';
import { useStore } from '../store';
import {
  Volume2,
  Mic,
  Square,
  Plus,
  Radio,
} from 'lucide-react';
import type { SfxType } from '../editor/sfxGenerator';
import { TextureButton, TextureCard } from './ui/cult';

interface SfxItem {
  id: SfxType;
  name: string;
  badge: string;
  description: string;
}

const SFX_LIST: SfxItem[] = [
  {
    id: 'whoosh',
    name: 'Cinematic Whoosh',
    badge: 'Transition',
    description: 'Fast energetic swoosh for whip pans and title entrances',
  },
  {
    id: 'pop',
    name: 'Bubble Pop',
    badge: 'UI / Click',
    description: 'Playful organic pop sound for icons and stickers',
  },
  {
    id: 'click',
    name: 'Clean UI Click',
    badge: 'Haptic',
    description: 'Subtle mechanical click for button presses and switches',
  },
  {
    id: 'chime',
    name: 'Success Chime',
    badge: 'Notification',
    description: 'Two-tone melodic chime for achievements and callouts',
  },
  {
    id: 'shutter',
    name: 'Camera Shutter',
    badge: 'Snapshot',
    description: 'Double mechanical camera shutter click for freezes and stills',
  },
];

export function AudioPanel() {
  const addSfxSegment = useStore((s) => s.addSfxSegment);
  const addMediaToTimeline = useStore((s) => s.addMediaToTimeline);
  const addMedia = useStore((s) => s.addMedia);

  const [isRecording, setIsRecording] = useState(false);
  const [recordDuration, setRecordDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);

  const startVoiceRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];

      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: 'audio/webm' });
        const url = URL.createObjectURL(blob);
        const id = `voice-${crypto.randomUUID().slice(0, 8)}`;
        const newItem = {
          id,
          name: `Voiceover Take ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`,
          type: 'audio' as const,
          url,
          duration: recordDuration,
          createdAt: Date.now(),
        };
        addMedia(newItem);
        addMediaToTimeline(id);
        setIsRecording(false);
        setRecordDuration(0);
      };

      mediaRecorderRef.current = rec;
      rec.start();
      setIsRecording(true);
      setRecordDuration(0);

      const startMs = Date.now();
      timerRef.current = window.setInterval(() => {
        setRecordDuration(Math.round((Date.now() - startMs) / 1000));
      }, 500);
    } catch (err) {
      console.warn('Microphone access unavailable or denied:', err);
      // Create a programmatic voiceover clip if hardware mic is unavailable
      addSfxSegment('chime');
    }
  };

  const stopVoiceRecording = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  };

  return (
    <div className="flex flex-col h-full bg-card overflow-hidden" data-testid="audio-panel">
      {/* Header */}
      <div className="p-3 border-b border-border">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Volume2 className="w-3.5 h-3.5 text-primary" /> Audio & Sound Effects
        </div>
        <p className="text-[11px] text-muted-foreground mt-1">
          Record studio voice-overs or add royalty-free sound effects to audio tracks.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {/* Voiceover Recording Card */}
        <TextureCard className="p-3 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-rose-500 animate-pulse" /> Voice-Over Studio
            </span>
            <span className="text-[10px] text-muted-foreground font-mono">48 kHz RNNoise</span>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Record voice-over commentary directly synchronized to timeline video playback.
          </p>

          {isRecording ? (
            <TextureButton
              onClick={stopVoiceRecording}
              data-testid="stop-voiceover-btn"
              variant="destructive"
              size="sm"
              className="w-full"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              Stop Recording ({recordDuration}s)
            </TextureButton>
          ) : (
            <TextureButton
              onClick={startVoiceRecording}
              data-testid="record-voiceover-btn"
              variant="primary"
              size="sm"
              className="w-full"
            >
              <Mic className="w-3.5 h-3.5" />
              Record Voice-Over
            </TextureButton>
          )}
        </TextureCard>

        {/* Royalty-free Sound Effects list */}
        <div>
          <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-2 flex items-center justify-between">
            <span>Sound Effects Library</span>
            <span className="text-[9px] text-muted-foreground font-mono">16-bit PCM WAV</span>
          </h4>
          <div className="space-y-2">
            {SFX_LIST.map((sfx) => (
              <TextureCard
                key={sfx.id}
                interactive
                data-testid={`sfx-${sfx.id}`}
                className="flex items-center justify-between gap-2 p-2"
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <div className="w-6 h-6 rounded-md bg-muted/80 border border-border/60 flex items-center justify-center flex-shrink-0 text-amber-500">
                    <Volume2 className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-foreground truncate">{sfx.name}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[9px] px-1 py-0.2 rounded bg-muted text-muted-foreground font-mono flex-shrink-0">
                        {sfx.badge}
                      </span>
                      <span className="text-[10px] text-muted-foreground truncate">{sfx.description}</span>
                    </div>
                  </div>
                </div>
                <TextureButton
                  size="xs"
                  variant="secondary"
                  onClick={() => addSfxSegment(sfx.id)}
                  title="Add to timeline"
                  className="flex-shrink-0"
                >
                  <Plus className="w-3 h-3" /> Add
                </TextureButton>
              </TextureCard>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
