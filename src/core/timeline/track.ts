/**
 * Track and Timeline types for the timeline.
 */

import { TimePoint, TimeRange, Microseconds, RationalTime, FRAMERATES } from './types.js';
import { Segment, TrackType, createSegment, splitSegment, trimSegment, getSegmentAtTime as getSegmentAtTimeFromArray } from './segment.js';

export interface Track {
  id: string;
  name: string;
  type: TrackType;
  /** Whether this track is the primary magnetic track (video only) */
  isPrimary: boolean;
  /** Whether ripple editing is enabled for this track */
  rippleEnabled: boolean;
  /** Track order (z-index) */
  order: number;
  /** Whether track is locked */
  locked: boolean;
  /** Whether track is visible */
  visible: boolean;
  /** Whether track is muted (audio only) */
  muted: boolean;
  /** Track volume (audio only) */
  volume: number;
  /** Segments on this track, sorted by targetTimerange.start */
  segments: Segment[];
}

export function createTrack(params: {
  id: string;
  name: string;
  type: TrackType;
  isPrimary?: boolean;
  order?: number;
}): Track {
  return {
    id: params.id,
    name: params.name,
    type: params.type,
    isPrimary: params.isPrimary ?? false,
    rippleEnabled: params.isPrimary ?? false,
    order: params.order ?? 0,
    locked: false,
    visible: true,
    muted: false,
    volume: 1.0,
    segments: [],
  };
}

export function addSegment(track: Track, segment: Segment): Track {
  if (track.locked) throw new Error('Track is locked');
  
  const newSegments = [...track.segments, segment];
  newSegments.sort((a, b) => {
    if (a.targetTimerange.start.value !== b.targetTimerange.start.value) {
      return a.targetTimerange.start.value < b.targetTimerange.start.value ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });

  return { ...track, segments: newSegments };
}

export function removeSegment(track: Track, segmentId: string): Track {
  if (track.locked) throw new Error('Track is locked');
  
  return {
    ...track,
    segments: track.segments.filter(s => s.id !== segmentId),
  };
}

export function moveSegment(track: Track, segmentId: string, newStart: TimePoint): Track {
  if (track.locked) throw new Error('Track is locked');
  
  const segmentIndex = track.segments.findIndex(s => s.id === segmentId);
  if (segmentIndex === -1) throw new Error('Segment not found');
  
  const segment = track.segments[segmentIndex];
  const duration = segment.targetTimerange.duration;
  const newTargetRange = new TimeRange(newStart, duration);
  
  // Check for overlaps with other segments (if ripple is disabled)
  if (!track.rippleEnabled) {
    for (let i = 0; i < track.segments.length; i++) {
      if (i === segmentIndex) continue;
      if (track.segments[i].targetTimerange.intersects(newTargetRange)) {
        throw new Error('Segment would overlap with another segment');
      }
    }
  }
  
  const newSegments = [...track.segments];
  newSegments[segmentIndex] = {
    ...segment,
    instanceId: crypto.randomUUID(),
    targetTimerange: newTargetRange,
  };
  
  newSegments.sort((a, b) => {
    if (a.targetTimerange.start.value !== b.targetTimerange.start.value) {
      return a.targetTimerange.start.value < b.targetTimerange.start.value ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });

  return { ...track, segments: newSegments };
}

export function splitSegmentAt(track: Track, segmentId: string, splitTime: TimePoint): Track {
  if (track.locked) throw new Error('Track is locked');
  
  const segmentIndex = track.segments.findIndex(s => s.id === segmentId);
  if (segmentIndex === -1) throw new Error('Segment not found');
  
  const segment = track.segments[segmentIndex];
  const splitResult = splitSegment(segment, splitTime);
  
  if (!splitResult) return track;
  
  const [left, right] = splitResult;
  const newSegments = [
    ...track.segments.slice(0, segmentIndex),
    left,
    right,
    ...track.segments.slice(segmentIndex + 1),
  ];

  return { ...track, segments: newSegments };
}

export function trimSegmentAt(track: Track, segmentId: string, newTargetRange: TimeRange): Track {
  if (track.locked) throw new Error('Track is locked');
  
  const segmentIndex = track.segments.findIndex(s => s.id === segmentId);
  if (segmentIndex === -1) throw new Error('Segment not found');
  
  const segment = track.segments[segmentIndex];
  const trimmed = trimSegment(segment, newTargetRange);
  
  const newSegments = [
    ...track.segments.slice(0, segmentIndex),
    trimmed,
    ...track.segments.slice(segmentIndex + 1),
  ];

  return { ...track, segments: newSegments };
}

export function rippleDelete(track: Track, segmentId: string): Track {
  if (track.locked) throw new Error('Track is locked');
  if (!track.rippleEnabled) throw new Error('Ripple editing not enabled on this track');
  
  const segmentIndex = track.segments.findIndex(s => s.id === segmentId);
  if (segmentIndex === -1) throw new Error('Segment not found');
  
  const deletedSegment = track.segments[segmentIndex];
  const deletedDuration = deletedSegment.targetTimerange.duration;
  
  const newSegments = track.segments
    .filter((_, i) => i !== segmentIndex)
    .map((segment, i) => {
      if (i >= segmentIndex) {
        return {
          ...segment,
          instanceId: crypto.randomUUID(),
          targetTimerange: new TimeRange(
            segment.targetTimerange.start.subtract(deletedDuration),
            segment.targetTimerange.duration
          ),
        };
      }
      return segment;
    });

  return { ...track, segments: newSegments };
}

export function getSegmentAtTime(track: Track, time: TimePoint): Segment | null {
  return getSegmentAtTimeFromArray(track.segments, time);
}

export function getSegmentsInRange(track: Track, range: TimeRange): Segment[] {
  return track.segments.filter(s => s.targetTimerange.intersects(range));
}

export function getTotalDuration(track: Track): Microseconds {
  if (track.segments.length === 0) return 0n as Microseconds;
  const lastSegment = track.segments[track.segments.length - 1];
  return lastSegment.targetTimerange.end.value;
}