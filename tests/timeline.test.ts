/**
 * Timeline Core Tests
 * 
 * Tests for Milestone 1.1: Timeline Data Model & Microsecond Clock
 * 
 * TEST-1.1: test_microsecond_timeline_arithmetic
 * TEST-1.2: test_multi_track_composition_order
 * TEST-1.4: test_clip_split_boundary_integrity
 */

import { describe, it, expect } from 'vitest';
import {
  µs,
  µsFromSeconds,
  µsFromFrames,
  toSeconds,
  toFrames,
  TimePoint,
  TimeRange,
  RationalTime,
  FRAMERATES,
  µsPerFrame,
} from '../src/core/timeline/types.js';
import {
  createSegment,
  splitSegment,
  trimSegment,
  getSegmentAtTime,
  TrackType,
  BlendMode,
} from '../src/core/timeline/segment.js';
import {
  createTrack,
  addSegment,
  removeSegment,
  moveSegment,
  splitSegmentAt,
  trimSegmentAt,
  rippleDelete,
  getSegmentAtTime as getTrackSegmentAtTime,
  getTotalDuration,
} from '../src/core/timeline/track.js';
import {
  createTimeline,
  addTrack,
  createPrimaryVideoTrack,
  createVideoTrack,
  createAudioTrack,
  addSegmentToTrack,
  removeSegmentFromTrack,
  moveSegmentInTrack,
  splitSegmentInTrack,
  trimSegmentInTrack,
  getSegmentAtTime as getTimelineSegmentAtTime,
  getAllSegmentsAtTime,
  getTimelineDuration,
} from '../src/core/timeline/timeline.js';

describe('Milestone 1.1: Timeline Data Model & Microsecond Clock', () => {
  describe('TimePoint', () => {
    it('TEST-1.1: microsecond timeline arithmetic - zero and basic operations', () => {
      const zero = TimePoint.zero();
      expect(zero.value).toBe(0n);
      
      const tp1 = TimePoint.fromSeconds(1.5);
      expect(tp1.value).toBe(1_500_000n);
      
      const tp2 = TimePoint.fromFrames(30, FRAMERATES['30']);
      expect(tp2.value).toBe(1_000_000n); // 30 frames at 30fps = 1 second
    });

    it('TEST-1.1: microsecond timeline arithmetic - add/subtract', () => {
      const tp1 = TimePoint.fromSeconds(1);
      const tp2 = TimePoint.fromSeconds(2);
      const tp3 = tp1.add(tp2);
      expect(tp3.value).toBe(3_000_000n);
      
      const tp4 = tp3.subtract(tp1);
      expect(tp4.value).toBe(2_000_000n);
    });

    it('TEST-1.1: microsecond timeline arithmetic - comparison', () => {
      const tp1 = TimePoint.fromSeconds(1);
      const tp2 = TimePoint.fromSeconds(2);
      
      expect(tp1.lessThan(tp2)).toBe(true);
      expect(tp2.greaterThan(tp1)).toBe(true);
      expect(tp1.equals(TimePoint.fromSeconds(1))).toBe(true);
    });

    it('TEST-1.1: microsecond timeline arithmetic - min/max', () => {
      const tp1 = TimePoint.fromSeconds(1);
      const tp2 = TimePoint.fromSeconds(2);
      
      expect(tp1.min(tp2).value).toBe(1_000_000n);
      expect(tp1.max(tp2).value).toBe(2_000_000n);
    });
  });

  describe('TimeRange', () => {
    it('TEST-1.1: time range creation and duration', () => {
      const start = TimePoint.fromSeconds(1);
      const end = TimePoint.fromSeconds(3);
      const range = TimeRange.fromStartEnd(start, end);
      
      expect(range.start.value).toBe(1_000_000n);
      expect(range.duration).toBe(2_000_000n);
      expect(range.end.value).toBe(3_000_000n);
    });

    it('TEST-1.1: time range contains', () => {
      const range = TimeRange.fromStartEnd(
        TimePoint.fromSeconds(1),
        TimePoint.fromSeconds(3)
      );
      
      expect(range.contains(TimePoint.fromSeconds(2))).toBe(true);
      expect(range.contains(TimePoint.fromSeconds(1))).toBe(true);
      expect(range.contains(TimePoint.fromSeconds(3))).toBe(false); // end is exclusive
      expect(range.contains(TimePoint.fromSeconds(0))).toBe(false);
    });

    it('TEST-1.1: time range intersection', () => {
      const range1 = TimeRange.fromStartEnd(
        TimePoint.fromSeconds(1),
        TimePoint.fromSeconds(4)
      );
      const range2 = TimeRange.fromStartEnd(
        TimePoint.fromSeconds(2),
        TimePoint.fromSeconds(5)
      );
      
      const intersection = range1.intersection(range2);
      expect(intersection).not.toBeNull();
      expect(intersection!.start.value).toBe(2_000_000n);
      expect(intersection!.end.value).toBe(4_000_000n);
    });

    it('TEST-1.1: time range union', () => {
      const range1 = TimeRange.fromStartEnd(
        TimePoint.fromSeconds(1),
        TimePoint.fromSeconds(3)
      );
      const range2 = TimeRange.fromStartEnd(
        TimePoint.fromSeconds(2),
        TimePoint.fromSeconds(5)
      );
      
      const union = range1.union(range2);
      expect(union.start.value).toBe(1_000_000n);
      expect(union.end.value).toBe(5_000_000n);
    });

    it('TEST-1.1: time range shift', () => {
      const range = TimeRange.fromStartEnd(
        TimePoint.fromSeconds(1),
        TimePoint.fromSeconds(3)
      );
      
      const shifted = range.shift(1_000_000n as any);
      expect(shifted.start.value).toBe(2_000_000n);
      expect(shifted.end.value).toBe(4_000_000n);
    });

    it('TEST-1.1: time range trim', () => {
      const range = TimeRange.fromStartEnd(
        TimePoint.fromSeconds(1),
        TimePoint.fromSeconds(5)
      );
      
      const trimmedStart = range.trimStart(TimePoint.fromSeconds(2));
      expect(trimmedStart.start.value).toBe(2_000_000n);
      expect(trimmedStart.duration).toBe(3_000_000n);
      
      const trimmedEnd = range.trimEnd(TimePoint.fromSeconds(4));
      expect(trimmedEnd.start.value).toBe(1_000_000n);
      expect(trimmedEnd.duration).toBe(3_000_000n);
    });
  });

  describe('RationalTime and Framerate Conversion', () => {
    it('TEST-1.1: standard framerates', () => {
      expect(FRAMERATES['24'].numerator).toBe(24n);
      expect(FRAMERATES['24'].denominator).toBe(1n);
      
      expect(FRAMERATES['23.976'].numerator).toBe(24000n);
      expect(FRAMERATES['23.976'].denominator).toBe(1001n);
      
      expect(FRAMERATES['29.97'].numerator).toBe(30000n);
      expect(FRAMERATES['29.97'].denominator).toBe(1001n);
    });

    it('TEST-1.1: µs per frame calculation', () => {
      // 30 fps = 33,333.33... µs per frame
      const µs30 = µsPerFrame(FRAMERATES['30']);
      expect(µs30).toBe(33333n); // truncated
      
      // 24 fps = 41,666.66... µs per frame
      const µs24 = µsPerFrame(FRAMERATES['24']);
      expect(µs24).toBe(41666n);
      
      // 23.976 fps
      const µs23976 = µsPerFrame(FRAMERATES['23.976']);
      expect(µs23976).toBe(41708n); // ~41708.33 truncated
    });

    it('TEST-1.1: frame to µs conversion', () => {
      const frame30 = µsFromFrames(30, 30, 1); // 30 frames at 30fps
      expect(frame30).toBe(1_000_000n);
      
      const frame24 = µsFromFrames(24, 24, 1); // 24 frames at 24fps
      expect(frame24).toBe(1_000_000n);
    });

    it('TEST-1.1: µs to frame conversion', () => {
      const frames30 = toFrames(1_000_000n as any, 30, 1);
      expect(frames30).toBe(30);
      
      const frames24 = toFrames(1_000_000n as any, 24, 1);
      expect(frames24).toBe(24);
    });
  });
});

describe('Milestone 1.1: Track & Segment Operations', () => {
  const testMedia: any = {
    id: 'media-1',
    type: 'video',
    url: 'file:///test.mp4',
    duration: 10_000_000n as any, // 10 seconds
  };

  it('TEST-1.2: multi-track composition order', () => {
    const timeline = createTimeline({ id: 'tl-1', name: 'Test' });
    
    // Create 3 video tracks
    const tl1 = createVideoTrack(timeline);
    const tl2 = createVideoTrack(tl1);
    const tl3 = createVideoTrack(tl2);
    
    expect(tl3.tracks.length).toBe(3);
    expect(tl3.tracks[0].name).toBe('Video 1');
    expect(tl3.tracks[1].name).toBe('Video 2');
    expect(tl3.tracks[2].name).toBe('Video 3');
  });

  it('TEST-1.2: track order determines z-index', () => {
    let timeline = createTimeline({ id: 'tl-1', name: 'Test' });
    timeline = createPrimaryVideoTrack(timeline);
    timeline = createVideoTrack(timeline);
    
    expect(timeline.tracks.length).toBe(2);
    
    // Add segments to each track at same time
    const segment1 = createSegment({
      id: 'seg-1',
      trackId: timeline.tracks[0].id,
      type: 'video',
      targetStart: TimePoint.zero(),
      targetDuration: 5_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 5_000_000n as any,
      media: testMedia,
    });
    
    const segment2 = createSegment({
      id: 'seg-2',
      trackId: timeline.tracks[1].id,
      type: 'video',
      targetStart: TimePoint.zero(),
      targetDuration: 5_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 5_000_000n as any,
      media: testMedia,
    });
    
    timeline = addSegmentToTrack(timeline, timeline.tracks[0].id, segment1);
    timeline = addSegmentToTrack(timeline, timeline.tracks[1].id, segment2);
    
    // At time 0, both segments exist
    const segments = getAllSegmentsAtTime(timeline, TimePoint.zero());
    expect(segments.length).toBe(2);
    
    // Track order should be preserved (first track = bottom, last track = top)
    expect(segments[0].trackId).toBe(timeline.tracks[0].id);
    expect(segments[1].trackId).toBe(timeline.tracks[1].id);
  });

  it('TEST-1.4: clip split boundary integrity', () => {
    const track = createTrack({
      id: 'track-1',
      name: 'Video 1',
      type: 'video',
    });
    
    // Create a 10-second clip
    const segment = createSegment({
      id: 'clip-1',
      trackId: 'track-1',
      type: 'video',
      targetStart: TimePoint.zero(),
      targetDuration: 10_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 10_000_000n as any,
      media: testMedia,
    });
    
    const trackWithSegment = addSegment(track, segment);
    
    // Split at 4 seconds
    const splitTime = TimePoint.fromSeconds(4);
    const splitResult = splitSegment(segment, splitTime);
    
    expect(splitResult).not.toBeNull();
    const [left, right] = splitResult!;
    
    // Left segment: target 0-4s, source 0-4s
    expect(left.targetTimerange.start.value).toBe(0n);
    expect(left.targetTimerange.duration).toBe(4_000_000n);
    expect(left.sourceTimerange.start.value).toBe(0n);
    expect(left.sourceTimerange.duration).toBe(4_000_000n);
    
    // Right segment: target 4-10s, source 4-10s
    expect(right.targetTimerange.start.value).toBe(4_000_000n);
    expect(right.targetTimerange.duration).toBe(6_000_000n);
    expect(right.sourceTimerange.start.value).toBe(4_000_000n);
    expect(right.sourceTimerange.duration).toBe(6_000_000n);
    
    // Playback at boundary should be seamless
    // Left end = Right start
    expect(left.targetTimerange.end.value).toBe(right.targetTimerange.start.value);
    // Left source end = Right source start
    expect(left.sourceTimerange.end.value).toBe(right.sourceTimerange.start.value);
  });

  it('TEST-1.4: trim segment', () => {
    const segment = createSegment({
      id: 'clip-1',
      trackId: 'track-1',
      type: 'video',
      targetStart: TimePoint.zero(),
      targetDuration: 10_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 10_000_000n as any,
      media: testMedia,
    });
    
    // Trim to 2-8 seconds
    const newRange = TimeRange.fromStartEnd(
      TimePoint.fromSeconds(2),
      TimePoint.fromSeconds(8)
    );
    
    const trimmed = trimSegment(segment, newRange);
    
    expect(trimmed.targetTimerange.start.value).toBe(2_000_000n);
    expect(trimmed.targetTimerange.duration).toBe(6_000_000n);
    expect(trimmed.sourceTimerange.start.value).toBe(2_000_000n);
    expect(trimmed.sourceTimerange.duration).toBe(6_000_000n);
  });

  it('TEST-1.4: split at boundaries returns null', () => {
    const segment = createSegment({
      id: 'clip-1',
      trackId: 'track-1',
      type: 'video',
      targetStart: TimePoint.zero(),
      targetDuration: 10_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 10_000_000n as any,
      media: testMedia,
    });
    
    // Split at start
    const result1 = splitSegment(segment, TimePoint.zero());
    expect(result1).toBeNull();
    
    // Split at end
    const result2 = splitSegment(segment, TimePoint.fromSeconds(10));
    expect(result2).toBeNull();
    
    // Split outside
    const result3 = splitSegment(segment, TimePoint.fromSeconds(15));
    expect(result3).toBeNull();
  });
});

describe('Track Operations', () => {
  const testMedia: any = {
    id: 'media-1',
    type: 'video',
    url: 'file:///test.mp4',
    duration: 10_000_000n as any,
  };

  it('add/remove segment', () => {
    const track = createTrack({
      id: 'track-1',
      name: 'Video 1',
      type: 'video',
    });
    
    const segment = createSegment({
      id: 'seg-1',
      trackId: 'track-1',
      type: 'video',
      targetStart: TimePoint.fromSeconds(1),
      targetDuration: 5_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 5_000_000n as any,
      media: testMedia,
    });
    
    const trackWithSeg = addSegment(track, segment);
    expect(trackWithSeg.segments.length).toBe(1);
    
    const trackWithoutSeg = removeSegment(trackWithSeg, 'seg-1');
    expect(trackWithoutSeg.segments.length).toBe(0);
  });

  it('move segment', () => {
    const track = createTrack({
      id: 'track-1',
      name: 'Video 1',
      type: 'video',
    });
    
    const segment = createSegment({
      id: 'seg-1',
      trackId: 'track-1',
      type: 'video',
      targetStart: TimePoint.zero(),
      targetDuration: 5_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 5_000_000n as any,
      media: testMedia,
    });
    
    const trackWithSeg = addSegment(track, segment);
    const movedTrack = moveSegment(trackWithSeg, 'seg-1', TimePoint.fromSeconds(3));
    
    expect(movedTrack.segments[0].targetTimerange.start.value).toBe(3_000_000n);
    expect(movedTrack.segments[0].targetTimerange.duration).toBe(5_000_000n);
  });

  it('ripple delete shifts subsequent clips', () => {
    const track = createTrack({
      id: 'track-1',
      name: 'Video 1',
      type: 'video',
      isPrimary: true,
    });
    
    // Add 3 clips: A (0-5s), B (5-10s), C (10-15s)
    const clipA = createSegment({
      id: 'clip-a',
      trackId: 'track-1',
      type: 'video',
      targetStart: TimePoint.zero(),
      targetDuration: 5_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 5_000_000n as any,
      media: testMedia,
    });
    
    const clipB = createSegment({
      id: 'clip-b',
      trackId: 'track-1',
      type: 'video',
      targetStart: TimePoint.fromSeconds(5),
      targetDuration: 5_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 5_000_000n as any,
      media: testMedia,
    });
    
    const clipC = createSegment({
      id: 'clip-c',
      trackId: 'track-1',
      type: 'video',
      targetStart: TimePoint.fromSeconds(10),
      targetDuration: 5_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 5_000_000n as any,
      media: testMedia,
    });
    
    let trackWithClips = addSegment(track, clipA);
    trackWithClips = addSegment(trackWithClips, clipB);
    trackWithClips = addSegment(trackWithClips, clipC);
    
    // Ripple delete clip B (5-10s)
    trackWithClips = rippleDelete(trackWithClips, 'clip-b');
    
    // Clip C should now start at 5s
    const clipCNew = trackWithClips.segments.find(s => s.id === 'clip-c');
    expect(clipCNew).toBeDefined();
    expect(clipCNew!.targetTimerange.start.value).toBe(5_000_000n);
    expect(clipCNew!.targetTimerange.end.value).toBe(10_000_000n);
    
    // Total duration should be 10s
    expect(getTotalDuration(trackWithClips)).toBe(10_000_000n);
  });
});

describe('Timeline Operations', () => {
  const testMedia: any = {
    id: 'media-1',
    type: 'video',
    url: 'file:///test.mp4',
    duration: 10_000_000n as any,
  };

  it('create timeline with primary video track', () => {
    const timeline = createTimeline({ id: 'tl-1', name: 'Test' });
    const tlWithTrack = createPrimaryVideoTrack(timeline);
    
    expect(tlWithTrack.tracks.length).toBe(1);
    expect(tlWithTrack.tracks[0].isPrimary).toBe(true);
    expect(tlWithTrack.tracks[0].rippleEnabled).toBe(true);
  });

  it('add segment to track via timeline', () => {
    const timeline = createTimeline({ id: 'tl-1', name: 'Test' });
    const tlWithTrack = createPrimaryVideoTrack(timeline);
    
    const segment = createSegment({
      id: 'seg-1',
      trackId: 'video-primary',
      type: 'video',
      targetStart: TimePoint.zero(),
      targetDuration: 5_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 5_000_000n as any,
      media: testMedia,
    });
    
    const tlWithSeg = addSegmentToTrack(tlWithTrack, 'video-primary', segment);
    expect(tlWithSeg.tracks[0].segments.length).toBe(1);
  });

  it('split segment in timeline', () => {
    const timeline = createTimeline({ id: 'tl-1', name: 'Test' });
    const tlWithTrack = createPrimaryVideoTrack(timeline);
    
    const segment = createSegment({
      id: 'seg-1',
      trackId: 'video-primary',
      type: 'video',
      targetStart: TimePoint.zero(),
      targetDuration: 10_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 10_000_000n as any,
      media: testMedia,
    });
    
    let tl = addSegmentToTrack(tlWithTrack, 'video-primary', segment);
    tl = splitSegmentInTrack(tl, 'video-primary', 'seg-1', TimePoint.fromSeconds(4));
    
    const track = tl.tracks[0];
    expect(track.segments.length).toBe(2);
    expect(track.segments[0].targetTimerange.duration).toBe(4_000_000n);
    expect(track.segments[1].targetTimerange.duration).toBe(6_000_000n);
  });

  it('get segment at time', () => {
    const timeline = createTimeline({ id: 'tl-1', name: 'Test' });
    const tlWithTrack = createPrimaryVideoTrack(timeline);
    
    const segment = createSegment({
      id: 'seg-1',
      trackId: 'video-primary',
      type: 'video',
      targetStart: TimePoint.fromSeconds(2),
      targetDuration: 5_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 5_000_000n as any,
      media: testMedia,
    });
    
    const tl = addSegmentToTrack(tlWithTrack, 'video-primary', segment);
    
    // At 1s - no segment
    expect(getTimelineSegmentAtTime(tl, 'video-primary', TimePoint.fromSeconds(1))).toBeNull();
    
    // At 3s - segment exists
    const found = getTimelineSegmentAtTime(tl, 'video-primary', TimePoint.fromSeconds(3));
    expect(found).not.toBeNull();
    expect(found!.id).toBe('seg-1');
    
    // At 8s - no segment (ends at 7s)
    expect(getTimelineSegmentAtTime(tl, 'video-primary', TimePoint.fromSeconds(8))).toBeNull();
  });

  it('get all segments at time across tracks', () => {
    let timeline = createTimeline({ id: 'tl-1', name: 'Test' });
    timeline = createPrimaryVideoTrack(timeline);
    timeline = createVideoTrack(timeline);
    
    const videoMedia = { ...testMedia, id: 'video-1' };
    const overlayMedia = { ...testMedia, id: 'overlay-1' };
    
    const baseClip = createSegment({
      id: 'base',
      trackId: 'video-primary',
      type: 'video',
      targetStart: TimePoint.zero(),
      targetDuration: 10_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 10_000_000n as any,
      media: videoMedia,
    });
    
    const overlayClip = createSegment({
      id: 'overlay',
      trackId: 'video-2',
      type: 'video',
      targetStart: TimePoint.fromSeconds(2),
      targetDuration: 5_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 5_000_000n as any,
      media: overlayMedia,
    });
    
    timeline = addSegmentToTrack(timeline, 'video-primary', baseClip);
    timeline = addSegmentToTrack(timeline, 'video-2', overlayClip);
    
    // At 1s - only base
    let segments = getAllSegmentsAtTime(timeline, TimePoint.fromSeconds(1));
    expect(segments.length).toBe(1);
    expect(segments[0].id).toBe('base');
    
    // At 3s - both base and overlay
    segments = getAllSegmentsAtTime(timeline, TimePoint.fromSeconds(3));
    expect(segments.length).toBe(2);
    expect(segments.map(s => s.id).sort()).toEqual(['base', 'overlay']);
    
    // At 8s - only base
    segments = getAllSegmentsAtTime(timeline, TimePoint.fromSeconds(8));
    expect(segments.length).toBe(1);
    expect(segments[0].id).toBe('base');
  });

  it('timeline duration is max of all tracks', () => {
    let timeline = createTimeline({ id: 'tl-1', name: 'Test' });
    timeline = createPrimaryVideoTrack(timeline);
    timeline = createVideoTrack(timeline);
    
    const longClip = createSegment({
      id: 'long',
      trackId: 'video-primary',
      type: 'video',
      targetStart: TimePoint.zero(),
      targetDuration: 20_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 20_000_000n as any,
      media: testMedia,
    });
    
    const shortClip = createSegment({
      id: 'short',
      trackId: 'video-2',
      type: 'video',
      targetStart: TimePoint.zero(),
      targetDuration: 5_000_000n as any,
      sourceStart: TimePoint.zero(),
      sourceDuration: 5_000_000n as any,
      media: testMedia,
    });
    
    timeline = addSegmentToTrack(timeline, 'video-primary', longClip);
    timeline = addSegmentToTrack(timeline, 'video-2', shortClip);
    
    expect(getTimelineDuration(timeline)).toBe(20_000_000n);
  });
});