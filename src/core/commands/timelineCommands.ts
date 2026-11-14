/**
 * Timeline-specific Commands for Undo/Redo
 */

import { produce } from 'immer';
import { Command, createCommand, createCompositeCommand } from './types.js';
import { Timeline } from '../timeline/timeline.js';
import { Segment } from '../timeline/segment.js';
import { Track } from '../timeline/track.js';
import { TimePoint, TimeRange, Microseconds } from '../timeline/types.js';
import {
  addSegmentToTrack,
  removeSegmentFromTrack,
  moveSegmentInTrack,
  splitSegmentInTrack,
  trimSegmentInTrack,
  addTrack,
  removeTrack,
  reorderTracks,
  setPlayhead,
  setPlayback,
  setPlaybackSpeed,
  setInPoint,
  setOutPoint,
} from '../timeline/timeline.js';

/**
 * Add Segment Command
 */
export function createAddSegmentCommand(
  trackId: string,
  segment: Segment
): Command {
  return {
    ...createCommand(`Add segment ${segment.id} to track ${trackId}`),
    execute: (timeline: Timeline) => addSegmentToTrack(timeline, trackId, segment),
    undo: (timeline: Timeline) => removeSegmentFromTrack(timeline, trackId, segment.id),
    redo: (timeline: Timeline) => addSegmentToTrack(timeline, trackId, segment),
  };
}

/**
 * Remove Segment Command
 */
export function createRemoveSegmentCommand(
  trackId: string,
  segmentId: string,
  segment: Segment, // Store segment for undo
  ripple: boolean = false
): Command {
  return {
    ...createCommand(`Remove segment ${segmentId} from track ${trackId}`),
    execute: (timeline: Timeline) => removeSegmentFromTrack(timeline, trackId, segmentId, ripple),
    undo: (timeline: Timeline) => addSegmentToTrack(timeline, trackId, segment),
    redo: (timeline: Timeline) => removeSegmentFromTrack(timeline, trackId, segmentId, ripple),
  };
}

/**
 * Move Segment Command
 */
export function createMoveSegmentCommand(
  trackId: string,
  segmentId: string,
  newStart: TimePoint,
  oldStart: TimePoint
): Command {
  return {
    ...createCommand(`Move segment ${segmentId} on track ${trackId}`),
    execute: (timeline: Timeline) => moveSegmentInTrack(timeline, trackId, segmentId, newStart),
    undo: (timeline: Timeline) => moveSegmentInTrack(timeline, trackId, segmentId, oldStart),
    redo: (timeline: Timeline) => moveSegmentInTrack(timeline, trackId, segmentId, newStart),
  };
}

/**
 * Split Segment Command
 */
export function createSplitSegmentCommand(
  trackId: string,
  segmentId: string,
  splitTime: TimePoint,
  originalSegment: Segment // Store original for undo
): Command {
  return {
    ...createCommand(`Split segment ${segmentId} on track ${trackId} at ${splitTime.toString()}`),
    execute: (timeline: Timeline) => splitSegmentInTrack(timeline, trackId, segmentId, splitTime),
    undo: (timeline: Timeline) => {
      // Remove the two split segments and restore original
      let tl = removeSegmentFromTrack(timeline, trackId, `${segmentId}_left`);
      tl = removeSegmentFromTrack(tl, trackId, `${segmentId}_right`);
      return addSegmentToTrack(tl, trackId, originalSegment);
    },
    redo: (timeline: Timeline) => splitSegmentInTrack(timeline, trackId, segmentId, splitTime),
  };
}

/**
 * Trim Segment Command
 * Stores the full original segment for accurate undo/redo.
 */
export function createTrimSegmentCommand(
  trackId: string,
  segment: Segment,
  newTargetRange: TimeRange
): Command {
  const oldTargetRange = segment.targetTimerange;
  
  return {
    ...createCommand(`Trim segment ${segment.id} on track ${trackId}`),
    execute: (timeline: Timeline) => trimSegmentInTrack(timeline, trackId, segment.id, newTargetRange),
    undo: (timeline: Timeline) => {
      // Restore the original segment directly
      let tl = removeSegmentFromTrack(timeline, trackId, segment.id);
      return addSegmentToTrack(tl, trackId, segment);
    },
    redo: (timeline: Timeline) => trimSegmentInTrack(timeline, trackId, segment.id, newTargetRange),
  };
}

/**
 * Add Track Command
 */
export function createAddTrackCommand(track: Track): Command {
  return {
    ...createCommand(`Add track ${track.name} (${track.type})`),
    execute: (timeline: Timeline) => addTrack(timeline, track),
    undo: (timeline: Timeline) => removeTrack(timeline, track.id),
    redo: (timeline: Timeline) => addTrack(timeline, track),
  };
}

/**
 * Remove Track Command
 */
export function createRemoveTrackCommand(track: Track): Command {
  return {
    ...createCommand(`Remove track ${track.name} (${track.type})`),
    execute: (timeline: Timeline) => removeTrack(timeline, track.id),
    undo: (timeline: Timeline) => addTrack(timeline, track),
    redo: (timeline: Timeline) => removeTrack(timeline, track.id),
  };
}

/**
 * Reorder Tracks Command
 */
export function createReorderTracksCommand(
  trackIds: string[],
  oldOrder: string[]
): Command {
  return {
    ...createCommand('Reorder tracks'),
    execute: (timeline: Timeline) => reorderTracks(timeline, trackIds),
    undo: (timeline: Timeline) => reorderTracks(timeline, oldOrder),
    redo: (timeline: Timeline) => reorderTracks(timeline, trackIds),
  };
}

/**
 * Set Playhead Command
 */
export function createSetPlayheadCommand(newTime: TimePoint, oldTime: TimePoint): Command {
  return {
    ...createCommand(`Set playhead to ${newTime.toString()}`),
    execute: (timeline: Timeline) => setPlayhead(timeline, newTime),
    undo: (timeline: Timeline) => setPlayhead(timeline, oldTime),
    redo: (timeline: Timeline) => setPlayhead(timeline, newTime),
  };
}

/**
 * Set Playback State Command
 */
export function createSetPlaybackCommand(isPlaying: boolean, wasPlaying: boolean): Command {
  return {
    ...createCommand(isPlaying ? 'Play' : 'Pause'),
    execute: (timeline: Timeline) => setPlayback(timeline, isPlaying),
    undo: (timeline: Timeline) => setPlayback(timeline, wasPlaying),
    redo: (timeline: Timeline) => setPlayback(timeline, isPlaying),
  };
}

/**
 * Set Playback Speed Command
 */
export function createSetPlaybackSpeedCommand(speed: number, oldSpeed: number): Command {
  return {
    ...createCommand(`Set playback speed to ${speed}x`),
    execute: (timeline: Timeline) => setPlaybackSpeed(timeline, speed),
    undo: (timeline: Timeline) => setPlaybackSpeed(timeline, oldSpeed),
    redo: (timeline: Timeline) => setPlaybackSpeed(timeline, speed),
  };
}

/**
 * Set In/Out Points Command
 */
export function createSetInOutPointsCommand(
  inPoint?: TimePoint,
  outPoint?: TimePoint,
  oldInPoint?: TimePoint,
  oldOutPoint?: TimePoint
): Command {
  return {
    ...createCommand('Set in/out points'),
    execute: (timeline: Timeline) => {
      let tl = setInPoint(timeline, inPoint);
      return setOutPoint(tl, outPoint);
    },
    undo: (timeline: Timeline) => {
      let tl = setInPoint(timeline, oldInPoint);
      return setOutPoint(tl, oldOutPoint);
    },
    redo: (timeline: Timeline) => {
      let tl = setInPoint(timeline, inPoint);
      return setOutPoint(tl, outPoint);
    },
  };
}

/**
 * Set Segment Property Command (for keyframe/property changes)
 */
export interface PropertyChange {
  segmentId: string;
  propertyPath: string;
  oldValue: any;
  newValue: any;
}

export function createSetSegmentPropertyCommand(
  segmentId: string,
  propertyPath: string,
  oldValue: any,
  newValue: any
): Command {
  return {
    ...createCommand(`Set ${propertyPath} on segment ${segmentId}`),
    execute: (timeline: Timeline) => {
      // This would require a more complex implementation to modify nested properties
      // For now, return timeline unchanged - actual implementation would use Immer produce
      return setSegmentProperty(timeline, segmentId, propertyPath, newValue);
    },
    undo: (timeline: Timeline) => setSegmentProperty(timeline, segmentId, propertyPath, oldValue),
    redo: (timeline: Timeline) => setSegmentProperty(timeline, segmentId, propertyPath, newValue),
  };
}

/**
 * Helper to set a nested property on a segment using Immer produce
 */
function setSegmentProperty(
  timeline: Timeline,
  segmentId: string,
  propertyPath: string,
  value: any
): Timeline {
  return produce(timeline, (draft: Timeline) => {
    for (const track of draft.tracks) {
      const segmentIndex = track.segments.findIndex(s => s.id === segmentId);
      if (segmentIndex !== -1) {
        const segment = track.segments[segmentIndex];
        setNestedProperty(segment, propertyPath, value);
        break;
      }
    }
  });
}

function setNestedProperty(obj: any, path: string, value: any): void {
  const keys = path.split('.');
  let current = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    current = current[keys[i]];
    if (!current) return;
  }
  current[keys[keys.length - 1]] = value;
}