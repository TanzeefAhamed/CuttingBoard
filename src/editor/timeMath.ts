import type { Segment } from '../core/timeline/segment';

export const ASPECTS: Record<string, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:3': 4 / 3,
  '21:9': 21 / 9,
};

/** Logical composition size (height 1080) for an aspect ratio. */
export function compSize(aspect: string, height = 1080): { w: number; h: number } {
  const r = ASPECTS[aspect] ?? 16 / 9;
  return { w: Math.round(height * r), h: height };
}

export function segmentEnd(s: Segment): bigint {
  return s.targetTimerange.start.value + s.targetTimerange.duration;
}

export function isActive(s: Segment, t: bigint): boolean {
  return t >= s.targetTimerange.start.value && t < segmentEnd(s);
}

/** Seconds into the source media for a timeline time. */
export function sourceTimeSeconds(s: Segment, t: bigint): number {
  const into = Number(t - s.targetTimerange.start.value) * (s.isFreezeFrame ? 0 : s.speed);
  const srcStart = Number(s.sourceTimerange.start.value);
  const srcDur = Number(s.sourceTimerange.duration);
  const us = s.reverse ? srcStart + srcDur - into : srcStart + into;
  return Math.max(0, us / 1_000_000);
}
