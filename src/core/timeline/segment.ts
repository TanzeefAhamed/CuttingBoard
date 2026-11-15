/**
 * Segment types for the timeline.
 * A Segment represents a clip on a track with source and target timeranges.
 */

import { TimePoint, TimeRange, Microseconds, RationalTime } from './types.js';
import type { ColorGradeConfig } from '../webcodecs/colorGrading.js';

export type TrackType = 'video' | 'audio' | 'text' | 'adjustment';

export interface SegmentTransform {
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number; // radians
  anchor: { x: number; y: number };
  opacity: number;
  blendMode: BlendMode;
}

export type BlendMode = 
  | 'normal' 
  | 'multiply' 
  | 'screen' 
  | 'overlay' 
  | 'darken' 
  | 'lighten' 
  | 'color-dodge' 
  | 'color-burn' 
  | 'hard-light' 
  | 'soft-light' 
  | 'difference' 
  | 'exclusion' 
  | 'hue' 
  | 'saturation';

export const DEFAULT_TRANSFORM: SegmentTransform = {
  position: { x: 0, y: 0 },
  scale: { x: 1, y: 1 },
  rotation: 0,
  anchor: { x: 0.5, y: 0.5 },
  opacity: 1,
  blendMode: 'normal',
};

export interface MediaReference {
  id: string;
  type: 'video' | 'audio' | 'image' | 'text';
  url: string;
  duration: Microseconds; // source media duration
  metadata?: Record<string, unknown>;
}

export interface Segment {
  id: string;
  trackId: string;
  type: TrackType;
  /** Target timerange on the timeline (where the segment appears) */
  targetTimerange: TimeRange;
  /** Source timerange in the media (what portion of media to play) */
  sourceTimerange: TimeRange;
  /** Media reference */
  media: MediaReference;
  /** Transform properties */
  transform: SegmentTransform;
  /** Whether this segment is a freeze frame (holds a single frame) */
  isFreezeFrame: boolean;
  /** Reverse playback flag */
  reverse: boolean;
  /** Speed multiplier (1.0 = normal) */
  speed: number;
  /** Unique identifier for this segment instance */
  instanceId: string;
  /** Audio gain (1 = 100%). Optional for backwards compatibility. */
  volume?: number;
  /** Crop in percent of source frame (0-100 per side). */
  crop?: SegmentCrop;
  /** Visual adjustments / effects. */
  filters?: SegmentFilters;
  /** Lift/Gamma/Gain, HSL, curves, 3D LUT color grading */
  colorGrade?: Partial<ColorGradeConfig>;
  /** AI effects (portrait matting, auto-captions) */
  aiEffects?: {
    portraitMatting?: boolean;
    autoCaptions?: boolean;
    captionsText?: string;
  };
}

export interface SegmentCrop { top: number; bottom: number; left: number; right: number }

export interface SegmentFilters {
  blur: number;        // px
  brightness: number;  // 100 = neutral
  contrast: number;    // 100 = neutral
  saturation: number;  // 100 = neutral
  hue: number;         // degrees
  effect: 'none' | 'grayscale' | 'sepia' | 'invert';
}

export const DEFAULT_CROP: SegmentCrop = { top: 0, bottom: 0, left: 0, right: 0 };
export const DEFAULT_FILTERS: SegmentFilters = {
  blur: 0, brightness: 100, contrast: 100, saturation: 100, hue: 0, effect: 'none',
};

export function createSegment(params: {
  id: string;
  trackId: string;
  type: TrackType;
  targetStart: TimePoint;
  targetDuration: Microseconds;
  sourceStart: TimePoint;
  sourceDuration: Microseconds;
  media: MediaReference;
  transform?: Partial<SegmentTransform>;
  isFreezeFrame?: boolean;
  reverse?: boolean;
  speed?: number;
}): Segment {
  return {
    id: params.id,
    trackId: params.trackId,
    type: params.type,
    targetTimerange: new TimeRange(params.targetStart, params.targetDuration),
    sourceTimerange: new TimeRange(params.sourceStart, params.sourceDuration),
    media: params.media,
    transform: { ...DEFAULT_TRANSFORM, ...params.transform },
    isFreezeFrame: params.isFreezeFrame ?? false,
    reverse: params.reverse ?? false,
    speed: params.speed ?? 1.0,
    instanceId: crypto.randomUUID(),
  };
}

export function splitSegment(segment: Segment, splitTime: TimePoint): [Segment, Segment] | null {
  const targetRange = segment.targetTimerange;
  
  if (!targetRange.contains(splitTime) || splitTime.equals(targetRange.start) || splitTime.equals(targetRange.end)) {
    return null;
  }

  const leftDuration = splitTime.value - targetRange.start.value;
  const rightDuration = targetRange.end.value - splitTime.value;

  // Calculate corresponding source positions
  const sourceRange = segment.sourceTimerange;
  const sourceProgress = Number(leftDuration) / Number(targetRange.duration);
  const sourceSplitOffset = BigInt(Math.round(Number(sourceRange.duration) * sourceProgress));
  const sourceSplitPoint = sourceRange.start.value + sourceSplitOffset;

  const leftSegment: Segment = {
    ...segment,
    id: `${segment.id}_left`,
    instanceId: crypto.randomUUID(),
    targetTimerange: new TimeRange(targetRange.start, leftDuration),
    sourceTimerange: new TimeRange(sourceRange.start, sourceSplitOffset),
  };

  const rightSegment: Segment = {
    ...segment,
    id: `${segment.id}_right`,
    instanceId: crypto.randomUUID(),
    targetTimerange: new TimeRange(splitTime, rightDuration),
    sourceTimerange: new TimeRange(
      new TimePoint(sourceSplitPoint),
      sourceRange.duration - sourceSplitOffset
    ),
  };

  return [leftSegment, rightSegment];
}

export function trimSegment(segment: Segment, newTargetRange: TimeRange): Segment {
  if (!segment.targetTimerange.intersects(newTargetRange)) {
    throw new Error('New target range does not intersect with segment');
  }

  const intersection = segment.targetTimerange.intersection(newTargetRange);
  if (!intersection) {
    throw new Error('No valid intersection');
  }

  const sourceRange = segment.sourceTimerange;
  const targetRange = segment.targetTimerange;
  
  const startProgress = Number(intersection.start.value - targetRange.start.value) / Number(targetRange.duration);
  const endProgress = Number(intersection.end.value - targetRange.start.value) / Number(targetRange.duration);
  
  const sourceStartOffset = BigInt(Math.round(Number(sourceRange.duration) * startProgress));
  const sourceEndOffset = BigInt(Math.round(Number(sourceRange.duration) * endProgress));

  return {
    ...segment,
    instanceId: crypto.randomUUID(),
    targetTimerange: intersection,
    sourceTimerange: new TimeRange(
      new TimePoint(sourceRange.start.value + sourceStartOffset),
      sourceEndOffset - sourceStartOffset
    ),
  };
}

export function getSegmentAtTime(segments: Segment[], time: TimePoint): Segment | null {
  for (const segment of segments) {
    if (segment.targetTimerange.contains(time)) {
      return segment;
    }
  }
  return null;
}