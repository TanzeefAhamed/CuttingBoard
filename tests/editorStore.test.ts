import { describe, it, expect, beforeEach } from 'vitest';
import { useStore } from '../src/store';

const media = { id: 'm1', name: 'clip.mp4', type: 'video' as const, url: 'blob:x', duration: 10, createdAt: 1 };
const img = { id: 'm2', name: 'pic.png', type: 'image' as const, url: 'blob:y', createdAt: 2 };

describe('editor store wiring', () => {
  beforeEach(() => {
    const s = useStore.getState();
    s.setSegments(new Map());
    useStore.setState({ mediaItems: [media, img], past: [], future: [], selectedSegment: null, playhead: 0n as any });
  });

  it('adds media to timeline, appends sequentially, uses image default duration', () => {
    const s = useStore.getState();
    const a = s.addMediaToTimeline('m1')!;
    const b = useStore.getState().addMediaToTimeline('m2')!;
    const segs = useStore.getState().segments;
    expect(segs.get(a)!.targetTimerange.duration).toBe(10_000_000n);
    expect(segs.get(b)!.targetTimerange.start.value).toBe(10_000_000n);
    expect(segs.get(b)!.targetTimerange.duration).toBe(5_000_000n);
    expect(useStore.getState().selectedSegment).toBe(b);
  });

  it('splits at playhead, deletes, and undo/redo restore', () => {
    const id = useStore.getState().addMediaToTimeline('m1')!;
    useStore.getState().setPlayhead(4_000_000n as any);
    expect(useStore.getState().splitAtPlayhead()).toBe(true);
    const list = Array.from(useStore.getState().segments.values());
    expect(list.length).toBe(2);
    expect(list[0]!.targetTimerange.duration + list[1]!.targetTimerange.duration).toBe(10_000_000n);
    expect(list[1]!.sourceTimerange.start.value).toBe(4_000_000n);
    useStore.getState().deleteSelected();
    expect(useStore.getState().segments.size).toBe(1);
    useStore.getState().undo();
    expect(useStore.getState().segments.size).toBe(2);
    useStore.getState().undo();
    expect(useStore.getState().segments.has(id)).toBe(true);
    useStore.getState().redo();
    expect(useStore.getState().segments.size).toBe(2);
  });

  it('moves and trims clips', () => {
    const id = useStore.getState().addMediaToTimeline('m1')!;
    const s = useStore.getState();
    s.beginEdit();
    s.moveSegmentLive(id, 2_000_000n as any);
    expect(useStore.getState().segments.get(id)!.targetTimerange.start.value).toBe(2_000_000n);
    s.trimSegmentLive(id, 'end', 5_000_000n as any);
    const seg = useStore.getState().segments.get(id)!;
    expect(seg.targetTimerange.duration).toBe(3_000_000n);
    s.trimSegmentLive(id, 'start', 3_000_000n as any);
    const t = useStore.getState().segments.get(id)!;
    expect(t.targetTimerange.start.value).toBe(3_000_000n);
    expect(t.sourceTimerange.start.value).toBe(1_000_000n);
    s.trimSegmentLive(id, 'end', 99_000_000n as any); // bounded by source
    expect(useStore.getState().segments.get(id)!.sourceTimerange.start.value + useStore.getState().segments.get(id)!.sourceTimerange.duration).toBeLessThanOrEqual(10_000_000n);
  });

  it('coalesces inspector edits into one undo step', () => {
    const id = useStore.getState().addMediaToTimeline('m1')!;
    const before = useStore.getState().past.length;
    for (let i = 0; i < 5; i++) useStore.getState().updateSegment(id, { volume: i / 10 }, 'volume');
    expect(useStore.getState().past.length).toBe(before + 1);
  });

  it('duplicates segments seamlessly', () => {
    const id = useStore.getState().addMediaToTimeline('m1')!;
    const dupId = useStore.getState().duplicateSegment(id);
    expect(dupId).toBeTruthy();
    const segs = useStore.getState().segments;
    expect(segs.size).toBe(2);
    const orig = segs.get(id)!;
    const dup = segs.get(dupId!)!;
    expect(dup.targetTimerange.start.value).toBe(orig.targetTimerange.start.value + orig.targetTimerange.duration);
    expect(dup.targetTimerange.duration).toBe(orig.targetTimerange.duration);
    expect(useStore.getState().selectedSegment).toBe(dupId);
  });

  it('creates and updates text segments', () => {
    const textId = useStore.getState().addTextSegment('Initial Subtitle');
    expect(textId).toBeTruthy();
    const seg = useStore.getState().segments.get(textId)!;
    expect(seg.type).toBe('text');
    expect(seg.media.metadata?.text).toBe('Initial Subtitle');

    useStore.getState().updateSegmentText(textId, 'Updated Headline');
    const updated = useStore.getState().segments.get(textId)!;
    expect(updated.media.metadata?.text).toBe('Updated Headline');
  });

  it('reorders tracks up and down', () => {
    const t0 = useStore.getState().tracks[0]!.id;
    const t1 = useStore.getState().tracks[1]!.id;
    useStore.getState().reorderTrack(t1, 'up');
    expect(useStore.getState().tracks[0]!.id).toBe(t1);
    expect(useStore.getState().tracks[1]!.id).toBe(t0);

    useStore.getState().reorderTrack(t1, 'down');
    expect(useStore.getState().tracks[0]!.id).toBe(t0);
    expect(useStore.getState().tracks[1]!.id).toBe(t1);
  });

  it('creates shape elements and device mockup layers', () => {
    const shapeId = useStore.getState().addShapeSegment('device-macbook', 'MacBook Showcase');
    expect(shapeId).toBeTruthy();
    const seg = useStore.getState().segments.get(shapeId)!;
    expect(seg.media.metadata?.shapeType).toBe('device-macbook');
    expect(seg.media.metadata?.name).toBe('MacBook Showcase');
  });

  it('synthesizes and appends procedural audio SFX', () => {
    const sfxId = useStore.getState().addSfxSegment('whoosh');
    expect(sfxId).toBeTruthy();
    const seg = useStore.getState().segments.get(sfxId)!;
    expect(seg.type).toBe('audio');
    expect(seg.media.url.startsWith('data:audio/wav;base64,')).toBe(true);
  });

  it('applies cinematic color grading presets', () => {
    const id = useStore.getState().addMediaToTimeline('m1')!;
    useStore.getState().setSelectedSegment(id);
    useStore.getState().applyColorPreset('teal-orange');
    const seg = useStore.getState().segments.get(id)!;
    expect(seg.colorGrade?.temperature).toBe(15);
    expect(seg.colorGrade?.tint).toBe(-5);
    expect(seg.colorGrade?.lift?.b).toBe(1.15);
  });
});
