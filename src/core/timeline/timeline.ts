/**
 * Timeline - The main composition container.
 */

import { TimePoint, TimeRange, Microseconds, RationalTime, FRAMERATES } from './types.js';
import { Track, TrackType, createTrack, addSegment, removeSegment, moveSegment, splitSegmentAt, trimSegmentAt, rippleDelete, getSegmentAtTime as getTrackSegmentAtTime, getSegmentsInRange as getTrackSegmentsInRange, getTotalDuration } from './track.js';
import { Segment, MediaReference } from './segment.js';

export interface Timeline {
  id: string;
  name: string;
  /** Project framerate */
  fps: RationalTime;
  /** Canvas dimensions */
  canvasWidth: number;
  canvasHeight: number;
  /** Canvas background color (CSS color string) */
  backgroundColor: string;
  /** Background mode */
  backgroundMode: 'color' | 'blur' | 'image';
  /** Blur level (1-3) for blur background mode */
  blurLevel: number;
  /** Background image URL for image background mode */
  backgroundImageUrl?: string;
  /** Tracks in the timeline */
  tracks: Track[];
  /** Current playhead position */
  playhead: TimePoint;
  /** Whether playback is active */
  isPlaying: boolean;
  /** Playback speed (1.0 = normal) */
  playbackSpeed: number;
  /** In/out points for rendering */
  inPoint?: TimePoint;
  outPoint?: TimePoint;
  /** Project creation timestamp */
  createdAt: number;
  /** Last modified timestamp */
  updatedAt: number;
}

export function createTimeline(params: {
  id: string;
  name: string;
  fps?: keyof typeof FRAMERATES | RationalTime;
  canvasWidth?: number;
  canvasHeight?: number;
}): Timeline {
  const fpsKey = typeof params.fps === 'string' ? params.fps : '30';
  const fps = typeof params.fps === 'string' ? FRAMERATES[fpsKey] : params.fps;
  
  return {
    id: params.id,
    name: params.name,
    fps: fps ?? FRAMERATES['30'],
    canvasWidth: params.canvasWidth ?? 1920,
    canvasHeight: params.canvasHeight ?? 1080,
    backgroundColor: '#000000',
    backgroundMode: 'color',
    blurLevel: 1,
    tracks: [],
    playhead: TimePoint.zero(),
    isPlaying: false,
    playbackSpeed: 1.0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

export function addTrack(timeline: Timeline, track: Track): Timeline {
  const newTracks = [...timeline.tracks, track];
  newTracks.sort((a, b) => a.order - b.order);
  return { ...timeline, tracks: newTracks, updatedAt: Date.now() };
}

export function removeTrack(timeline: Timeline, trackId: string): Timeline {
  return { 
    ...timeline, 
    tracks: timeline.tracks.filter(t => t.id !== trackId),
    updatedAt: Date.now(),
  };
}

export function reorderTracks(timeline: Timeline, trackIds: string[]): Timeline {
  const trackMap = new Map(timeline.tracks.map(t => [t.id, t]));
  const newTracks = trackIds.map((id, index) => {
    const track = trackMap.get(id);
    if (!track) throw new Error(`Track ${id} not found`);
    return { ...track, order: index };
  });
  return { ...timeline, tracks: newTracks, updatedAt: Date.now() };
}

export function setPlayhead(timeline: Timeline, time: TimePoint): Timeline {
  return { ...timeline, playhead: time };
}

export function setPlayback(timeline: Timeline, isPlaying: boolean): Timeline {
  return { ...timeline, isPlaying };
}

export function setPlaybackSpeed(timeline: Timeline, speed: number): Timeline {
  return { ...timeline, playbackSpeed: speed };
}

export function setInPoint(timeline: Timeline, time?: TimePoint): Timeline {
  return { ...timeline, inPoint: time };
}

export function setOutPoint(timeline: Timeline, time?: TimePoint): Timeline {
  return { ...timeline, outPoint: time };
}

export function getRenderRange(timeline: Timeline): TimeRange {
  const start = timeline.inPoint ?? TimePoint.zero();
  const end = timeline.outPoint ?? new TimePoint(getTimelineDuration(timeline));
  return TimeRange.fromStartEnd(start, end);
}

export function getTimelineDuration(timeline: Timeline): Microseconds {
  let maxDuration = 0n as Microseconds;
  for (const track of timeline.tracks) {
    const trackDuration = getTotalDuration(track);
    if (trackDuration > maxDuration) maxDuration = trackDuration;
  }
  return maxDuration;
}

export function addSegmentToTrack(timeline: Timeline, trackId: string, segment: Segment): Timeline {
  const trackIndex = timeline.tracks.findIndex(t => t.id === trackId);
  if (trackIndex === -1) throw new Error('Track not found');
  
  const newTracks = [...timeline.tracks];
  newTracks[trackIndex] = addSegment(newTracks[trackIndex], segment);
  
  return { ...timeline, tracks: newTracks, updatedAt: Date.now() };
}

export function removeSegmentFromTrack(timeline: Timeline, trackId: string, segmentId: string, ripple?: boolean): Timeline {
  const trackIndex = timeline.tracks.findIndex(t => t.id === trackId);
  if (trackIndex === -1) throw new Error('Track not found');
  
  const track = timeline.tracks[trackIndex];
  let newTrack: Track;
  
  if (ripple && track.rippleEnabled) {
    newTrack = rippleDelete(track, segmentId);
  } else {
    newTrack = removeSegment(track, segmentId);
  }
  
  const newTracks = [...timeline.tracks];
  newTracks[trackIndex] = newTrack;
  
  return { ...timeline, tracks: newTracks, updatedAt: Date.now() };
}

export function moveSegmentInTrack(timeline: Timeline, trackId: string, segmentId: string, newStart: TimePoint): Timeline {
  const trackIndex = timeline.tracks.findIndex(t => t.id === trackId);
  if (trackIndex === -1) throw new Error('Track not found');
  
  const newTracks = [...timeline.tracks];
  newTracks[trackIndex] = moveSegment(newTracks[trackIndex], segmentId, newStart);
  
  return { ...timeline, tracks: newTracks, updatedAt: Date.now() };
}

export function splitSegmentInTrack(timeline: Timeline, trackId: string, segmentId: string, splitTime: TimePoint): Timeline {
  const trackIndex = timeline.tracks.findIndex(t => t.id === trackId);
  if (trackIndex === -1) throw new Error('Track not found');
  
  const newTracks = [...timeline.tracks];
  newTracks[trackIndex] = splitSegmentAt(newTracks[trackIndex], segmentId, splitTime);
  
  return { ...timeline, tracks: newTracks, updatedAt: Date.now() };
}

export function trimSegmentInTrack(timeline: Timeline, trackId: string, segmentId: string, newTargetRange: TimeRange): Timeline {
  const trackIndex = timeline.tracks.findIndex(t => t.id === trackId);
  if (trackIndex === -1) throw new Error('Track not found');
  
  const newTracks = [...timeline.tracks];
  newTracks[trackIndex] = trimSegmentAt(newTracks[trackIndex], segmentId, newTargetRange);
  
  return { ...timeline, tracks: newTracks, updatedAt: Date.now() };
}

export function getSegmentAtTime(timeline: Timeline, trackId: string, time: TimePoint): Segment | null {
  const track = timeline.tracks.find(t => t.id === trackId);
  if (!track) return null;
  return getTrackSegmentAtTime(track, time);
}

export function getAllSegmentsAtTime(timeline: Timeline, time: TimePoint): Segment[] {
  const segments: Segment[] = [];
  for (const track of timeline.tracks) {
    if (!track.visible) continue;
    const segment = getTrackSegmentAtTime(track, time);
    if (segment) segments.push(segment);
  }
  return segments;
}

export function getSegmentsInRange(timeline: Timeline, trackId: string, range: TimeRange): Segment[] {
  const track = timeline.tracks.find(t => t.id === trackId);
  if (!track) return [];
  return getTrackSegmentsInRange(track, range);
}

export function createPrimaryVideoTrack(timeline: Timeline): Timeline {
  const track = createTrack({
    id: 'video-primary',
    name: 'Video 1',
    type: 'video',
    isPrimary: true,
    order: 0,
  });
  return addTrack(timeline, track);
}

export function createVideoTrack(timeline: Timeline, name: string = 'Video'): Timeline {
  const videoTracks = timeline.tracks.filter(t => t.type === 'video').length;
  const track = createTrack({
    id: `video-${videoTracks + 1}`,
    name: `${name} ${videoTracks + 1}`,
    type: 'video',
    order: timeline.tracks.length,
  });
  return addTrack(timeline, track);
}

export function createAudioTrack(timeline: Timeline, name: string = 'Audio'): Timeline {
  const audioTracks = timeline.tracks.filter(t => t.type === 'audio').length;
  const track = createTrack({
    id: `audio-${audioTracks + 1}`,
    name: `${name} ${audioTracks + 1}`,
    type: 'audio',
    order: timeline.tracks.length,
  });
  return addTrack(timeline, track);
}

export function createTextTrack(timeline: Timeline, name: string = 'Text'): Timeline {
  const textTracks = timeline.tracks.filter(t => t.type === 'text').length;
  const track = createTrack({
    id: `text-${textTracks + 1}`,
    name: `${name} ${textTracks + 1}`,
    type: 'text',
    order: timeline.tracks.length,
  });
  return addTrack(timeline, track);
}

export function createAdjustmentTrack(timeline: Timeline, name: string = 'Adjustment'): Timeline {
  const adjTracks = timeline.tracks.filter(t => t.type === 'adjustment').length;
  const track = createTrack({
    id: `adjustment-${adjTracks + 1}`,
    name: `${name} ${adjTracks + 1}`,
    type: 'adjustment',
    order: timeline.tracks.length,
  });
  return addTrack(timeline, track);
}