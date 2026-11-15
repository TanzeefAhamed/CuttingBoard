import { produce } from 'immer';
import { Command, CommandType } from './types';
import { Timeline } from '../timeline/timeline';
import { Track, TrackType } from '../timeline/track';
import { Segment } from '../timeline/segment';
import { TimePoint, TimeRange, Microseconds, µs, µsFromFrames, toSeconds, toFrames } from '../timeline/types';

export interface TimelineCommandsState {
  timeline: Timeline | null;
  tracks: Track[];
  segments: Map<string, Segment>;
}

export function createTimelineReducer(initialState: TimelineCommandsState) {
  return (state: TimelineCommandsState, command: Command): TimelineCommandsState => {
    switch (command.type) {
      case CommandType.ADD_TRACK: {
        const { track } = command.payload as { track: Track };
        return produce(state, (draft) => {
          draft.tracks.push(track);
          draft.timeline = draft.timeline ? { ...draft.timeline, tracks: [...draft.timeline.tracks, track] } : null;
        });
      }

      case CommandType.REMOVE_TRACK: {
        const { trackId } = command.payload as { trackId: string };
        return produce(state, (draft) => {
          draft.tracks = draft.tracks.filter(t => t.id !== trackId);
          draft.segments.forEach((segment, segmentId) => {
            if (segment.trackId === trackId) {
              draft.segments.delete(segmentId);
            }
          });
          if (draft.timeline) {
            draft.timeline = {
              ...draft.timeline,
              tracks: draft.timeline.tracks.filter(t => t.id !== trackId),
            };
          }
        });
      }

      case CommandType.ADD_SEGMENT: {
        const { segment, trackId } = command.payload as { segment: Segment; trackId: string };
        return produce(state, (draft) => {
          draft.segments.set(segment.id, segment);
          const track = draft.tracks.find(t => t.id === trackId);
          if (track) {
            track.segments.push(segment.id);
          }
          if (draft.timeline) {
            draft.timeline = {
              ...draft.timeline,
              tracks: draft.timeline.tracks.map(t =>
                t.id === trackId ? { ...t, segments: [...t.segments, segment.id] } : t
              ),
            };
          }
        });
      }

      case CommandType.REMOVE_SEGMENT: {
        const { segmentId } = command.payload as { segmentId: string };
        return produce(state, (draft) => {
          const segment = draft.segments.get(segmentId);
          if (segment) {
            draft.segments.delete(segmentId);
            const track = draft.tracks.find(t => t.id === segment.trackId);
            if (track) {
              track.segments = track.segments.filter(id => id !== segmentId);
            }
          }
          if (draft.timeline) {
            draft.timeline = {
              ...draft.timeline,
              tracks: draft.timeline.tracks.map(t => ({
                ...t,
                segments: t.segments.filter(id => id !== segmentId),
              })),
            };
          }
        });
      }

      case CommandType.MOVE_SEGMENT: {
        const { segmentId, newStart } = command.payload as { segmentId: string; newStart: bigint };
        return produce(state, (draft) => {
          const segment = draft.segments.get(segmentId);
          if (segment) {
            const oldStart = segment.targetTimerange.start;
            const duration = segment.targetTimerange.duration;
            segment.targetTimerange = {
              start: newStart,
              duration,
            };
          }
        });
      }

      case CommandType.TRIM_SEGMENT: {
        const { segmentId, newDuration } = command.payload as { segmentId: string; newDuration: bigint };
        return produce(state, (draft) => {
          const segment = draft.segments.get(segmentId);
          if (segment) {
            segment.targetTimerange = {
              start: segment.targetTimerange.start,
              duration: newDuration,
            };
          }
        });
      }

      case CommandType.SPLIT_SEGMENT: {
        const { segmentId, splitTime } = command.payload as { segmentId: string; splitTime: bigint };
        return produce(state, (draft) => {
          const segment = draft.segments.get(segmentId);
          if (!segment) return;

          const start = segment.targetTimerange.start;
          const end = segment.targetTimerange.start + segment.targetTimerange.duration;
          if (splitTime <= start || splitTime >= end) return;

          const leftDuration = splitTime - start;
          const rightDuration = end - splitTime;
          const sourceStart = segment.sourceTimerange.start;

          draft.segments.delete(segmentId);
          
          const leftSegment: Segment = {
            ...segment,
            id: `${segment.id}_left`,
            targetTimerange: {
              start,
              duration: leftDuration,
            },
            sourceTimerange: {
              start: sourceStart,
              duration: leftDuration,
            },
          };

          const rightSegment: Segment = {
            ...segment,
            id: `${segment.id}_right`,
            targetTimerange: {
              start: splitTime,
              duration: rightDuration,
            },
            sourceTimerange: {
              start: sourceStart + leftDuration,
              duration: rightDuration,
            },
          };

          draft.segments.set(leftSegment.id, leftSegment);
          draft.segments.set(rightSegment.id, rightSegment);
        });
      }

      case CommandType.UPDATE_SEGMENT: {
        const { segmentId, updates } = command.payload as { segmentId: string; updates: any };
        return produce(state, (draft) => {
          const segment = draft.segments.get(segmentId);
          if (segment) {
            Object.assign(segment, updates);
          }
        });
      }

      case CommandType.UPDATE_TRACK: {
        const { trackId, updates } = command.payload as { trackId: string; updates: any };
        return produce(state, (draft) => {
          const track = draft.tracks.find(t => t.id === trackId);
          if (track) {
            Object.assign(track, updates);
          }
        });
      }

      case CommandType.SET_PLAYHEAD: {
        const { time } = command.payload as { time: bigint };
        return produce(state, (draft) => {
          // Playhead is managed in UI state
        });
      }

      case CommandType.SET_ZOOM: {
        const { zoom } = command.payload as { zoom: number };
        return produce(state, (draft) => {
          // Zoom is managed in UI state
        });
      }

      case CommandType.SET_IN_POINT: {
        const { time } = command.payload as { time: bigint | null };
        return produce(state, (draft) => {
          // In/Out points managed in UI state
        });
      }

      case CommandType.SET_OUT_POINT: {
        const { time } = command.payload as { time: bigint | null };
        return produce(state, (draft) => {
          // In/Out points managed in UI state
        });
      }

      case CommandType.SET_PLAYBACK_SPEED: {
        const { speed } = command.payload as { speed: number };
        return produce(state, (draft) => {
          // Playback speed managed in UI state
        });
      }

      case CommandType.SET_CANVAS_ASPECT_RATIO: {
        const { ratio } = command.payload as { ratio: string };
        return produce(state, (draft) => {
          // Aspect ratio managed in UI state
        });
      }

      case CommandType.SET_SAFE_AREA: {
        const { safeArea } = command.payload as { safeArea: any };
        return produce(state, (draft) => {
          // Safe area managed in UI state
        });
      }

      default:
        return state;
    }
  };
}

export const initialTimelineCommandsState: TimelineCommandsState = {
  timeline: null,
  tracks: [],
  segments: new Map(),
};