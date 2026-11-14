/**
 * Animation Tests
 * 
 * Tests for Milestone 1.2: Keyframe & Animation Evaluator
 * TEST-2.3: test_bezier_keyframe_interpolation
 */

import { describe, it, expect } from 'vitest';
import {
  lerp,
  clamp01,
  cubicBezier,
  createCubicBezierEasing,
  createSpringEasing,
  EASING_PRESETS,
  getEasingFunction,
} from '../src/core/animation/easing.js';
import {
  createKeyframeTrack,
  addKeyframe,
  removeKeyframeAt,
  getSurroundingKeyframes,
  evaluateKeyframeTrack,
  evaluateKeyframeTracks,
  interpolateValue,
  createTransformKeyframes,
  evaluateTransformKeyframes,
  addTransformKeyframe,
  Keyframe,
  KeyframeTrack,
} from '../src/core/animation/keyframe.js';
import {
  createSegmentAnimationState,
  evaluateSegmentAnimation,
  evaluateAllSegmentsAnimation,
  removeTransformKeyframe,
  getAnimatedProperty,
  SegmentAnimationState,
} from '../src/core/animation/animator.js';
import { addTransformKeyframe as addSegmentTransformKeyframe } from '../src/core/animation/animator.js';
import { TimePoint, Microseconds, µs } from '../src/core/timeline/types.js';
import { Segment, createSegment, TrackType } from '../src/core/timeline/segment.js';

describe('Milestone 1.2: Keyframe & Animation Evaluator', () => {
  describe('Easing Functions', () => {
    it('lerp - basic linear interpolation', () => {
      expect(lerp(0, 10, 0)).toBe(0);
      expect(lerp(0, 10, 0.5)).toBe(5);
      expect(lerp(0, 10, 1)).toBe(10);
      expect(lerp(-5, 5, 0.5)).toBe(0);
    });

    it('clamp01 - clamps values to [0, 1]', () => {
      expect(clamp01(-1)).toBe(0);
      expect(clamp01(0.5)).toBe(0.5);
      expect(clamp01(2)).toBe(1);
    });

    it('cubicBezier - basic bezier curve', () => {
      // Linear bezier (x1=y1=0, x2=y2=1) should be identity
      const linear = cubicBezier(0, 0, 1, 1);
      expect(linear(0)).toBe(0);
      expect(linear(0.5)).toBeCloseTo(0.5, 3);
      expect(linear(1)).toBe(1);

      // Ease-in-out bezier
      const easeInOut = cubicBezier(0.42, 0, 0.58, 1);
      expect(easeInOut(0)).toBe(0);
      expect(easeInOut(1)).toBe(1);
      // At 0.5, ease-in-out should be 0.5
      expect(easeInOut(0.5)).toBeCloseTo(0.5, 2);
    });

    it('createCubicBezierEasing - creates easing from config', () => {
      const easing = createCubicBezierEasing({ x1: 0.25, y1: 0.1, x2: 0.25, y2: 1 });
      expect(easing(0)).toBe(0);
      expect(easing(1)).toBe(1);
    });

    it('createSpringEasing - creates spring easing', () => {
      const spring = createSpringEasing({ stiffness: 100, damping: 10, mass: 1 });
      expect(spring(0)).toBe(0);
      expect(spring(1)).toBeCloseTo(1, 2);
      // Spring should overshoot slightly at intermediate values
      expect(spring(0.5)).toBeGreaterThan(0);
    });

    it('EASING_PRESETS - common presets work', () => {
      expect(EASING_PRESETS.linear(0.5)).toBe(0.5);
      expect(EASING_PRESETS.easeIn(0)).toBe(0);
      expect(EASING_PRESETS.easeOut(1)).toBe(1);
      expect(EASING_PRESETS.easeInOut(0.5)).toBeCloseTo(0.5, 1);
    });

    it('getEasingFunction - returns correct functions', () => {
      expect(getEasingFunction('linear')(0.5)).toBe(0.5);
      expect(getEasingFunction('bezier', { x1: 0, y1: 0, x2: 1, y2: 1 })(0.5)).toBeCloseTo(0.5, 2);
      expect(getEasingFunction('spring', { stiffness: 100, damping: 10, mass: 1 })(0)).toBe(0);
      expect(getEasingFunction('hold')(0.5)).toBe(0); // Hold returns 0 for progress
    });
  });

  describe('Keyframe Track Operations', () => {
    it('createKeyframeTrack - creates empty track', () => {
      const track = createKeyframeTrack('opacity', 1);
      expect(track.property).toBe('opacity');
      expect(track.defaultValue).toBe(1);
      expect(track.keyframes.length).toBe(0);
    });

    it('addKeyframe - adds and sorts keyframes', () => {
      let track = createKeyframeTrack('position', 0);
      
      track = addKeyframe(track, { time: µs(5_000_000), value: 100, interpolation: 'linear' });
      track = addKeyframe(track, { time: µs(1_000_000), value: 10, interpolation: 'linear' });
      track = addKeyframe(track, { time: µs(10_000_000), value: 200, interpolation: 'linear' });
      
      expect(track.keyframes.length).toBe(3);
      expect(track.keyframes[0].time).toBe(1_000_000n);
      expect(track.keyframes[1].time).toBe(5_000_000n);
      expect(track.keyframes[2].time).toBe(10_000_000n);
    });

    it('removeKeyframeAt - removes keyframe at time', () => {
      let track = createKeyframeTrack('opacity', 1);
      track = addKeyframe(track, { time: µs(1_000_000), value: 0.5, interpolation: 'linear' });
      track = addKeyframe(track, { time: µs(2_000_000), value: 0, interpolation: 'linear' });
      
      track = removeKeyframeAt(track, µs(1_000_000));
      
      expect(track.keyframes.length).toBe(1);
      expect(track.keyframes[0].time).toBe(2_000_000n);
    });

    it('getSurroundingKeyframes - finds surrounding keyframes', () => {
      let track = createKeyframeTrack('opacity', 1);
      track = addKeyframe(track, { time: µs(1_000_000), value: 0.5, interpolation: 'linear' });
      track = addKeyframe(track, { time: µs(3_000_000), value: 0, interpolation: 'linear' });
      track = addKeyframe(track, { time: µs(5_000_000), value: 1, interpolation: 'linear' });
      
      // Time at a keyframe
      const atKeyframe = getSurroundingKeyframes(track, µs(3_000_000));
      expect(atKeyframe).not.toBeNull();
      expect(atKeyframe![0].time).toBe(3_000_000n);
      expect(atKeyframe![1].time).toBe(3_000_000n);
      
      // Time between keyframes
      const between = getSurroundingKeyframes(track, µs(2_000_000));
      expect(between).not.toBeNull();
      expect(between![0].time).toBe(1_000_000n);
      expect(between![1].time).toBe(3_000_000n);
      
      // Time before first
      const before = getSurroundingKeyframes(track, µs(0));
      expect(before).not.toBeNull();
      expect(before![0].time).toBe(1_000_000n);
      
      // Time after last
      const after = getSurroundingKeyframes(track, µs(10_000_000));
      expect(after).not.toBeNull();
      expect(after![0].time).toBe(5_000_000n);
    });
  });

  describe('Keyframe Evaluation', () => {
    it('evaluateKeyframeTrack - evaluates at exact keyframe', () => {
      let track = createKeyframeTrack('opacity', 1);
      track = addKeyframe(track, { time: µs(1_000_000), value: 0.5, interpolation: 'linear' });
      track = addKeyframe(track, { time: µs(3_000_000), value: 0, interpolation: 'linear' });
      
      expect(evaluateKeyframeTrack(track, µs(1_000_000))).toBe(0.5);
      expect(evaluateKeyframeTrack(track, µs(3_000_000))).toBe(0);
    });

    it('evaluateKeyframeTrack - linear interpolation between keyframes', () => {
      let track = createKeyframeTrack('position', 0);
      track = addKeyframe(track, { time: µs(0), value: 0, interpolation: 'linear' });
      track = addKeyframe(track, { time: µs(10_000_000), value: 100, interpolation: 'linear' });
      
      expect(evaluateKeyframeTrack(track, µs(0))).toBe(0);
      expect(evaluateKeyframeTrack(track, µs(5_000_000))).toBe(50);
      expect(evaluateKeyframeTrack(track, µs(10_000_000))).toBe(100);
    });

    it('evaluateKeyframeTrack - returns default before first keyframe', () => {
      let track = createKeyframeTrack('opacity', 1);
      track = addKeyframe(track, { time: µs(5_000_000), value: 0.5, interpolation: 'linear' });
      
      expect(evaluateKeyframeTrack(track, µs(0))).toBe(0.5); // First keyframe value
      expect(evaluateKeyframeTrack(track, µs(1_000_000))).toBe(0.5); // Still first keyframe
    });

    it('evaluateKeyframeTrack - returns last value after last keyframe', () => {
      let track = createKeyframeTrack('opacity', 1);
      track = addKeyframe(track, { time: µs(1_000_000), value: 0.5, interpolation: 'linear' });
      track = addKeyframe(track, { time: µs(3_000_000), value: 0, interpolation: 'linear' });
      
      expect(evaluateKeyframeTrack(track, µs(5_000_000))).toBe(0);
      expect(evaluateKeyframeTrack(track, µs(10_000_000))).toBe(0);
    });

    it('evaluateKeyframeTrack - single keyframe returns that value', () => {
      let track = createKeyframeTrack('opacity', 1);
      track = addKeyframe(track, { time: µs(1_000_000), value: 0.5, interpolation: 'linear' });
      
      expect(evaluateKeyframeTrack(track, µs(0))).toBe(0.5);
      expect(evaluateKeyframeTrack(track, µs(5_000_000))).toBe(0.5);
    });

    it('evaluateKeyframeTrack - empty track returns default', () => {
      const track = createKeyframeTrack('opacity', 0.75);
      expect(evaluateKeyframeTrack(track, µs(0))).toBe(0.75);
      expect(evaluateKeyframeTrack(track, µs(10_000_000))).toBe(0.75);
    });

    it('TEST-2.3: cubic bezier keyframe interpolation', () => {
      let track = createKeyframeTrack('position', 0);
      
      // Keyframe 1 at t=0s (value 0, ease-out handle)
      // Keyframe 2 at t=2s (value 100, ease-in handle)
      // Using ease-in-out bezier for the transition
      track = addKeyframe(track, { 
        time: µs(0), 
        value: 0, 
        interpolation: 'bezier',
        bezier: { x1: 0.42, y1: 0, x2: 0.58, y2: 1 } // ease-in-out
      });
      track = addKeyframe(track, { 
        time: µs(2_000_000), 
        value: 100, 
        interpolation: 'linear' 
      });
      
      // At t=1s (50% progress), with ease-in-out bezier
      // The value should be around 50 but with S-curve easing
      const valueAt1s = evaluateKeyframeTrack(track, µs(1_000_000));
      
      // With ease-in-out, at 50% time the value should be close to 50
      // but the curve is S-shaped so it might be slightly different
      expect(valueAt1s).toBeCloseTo(50, 0); // Within 1 unit
    });

    it('hold interpolation - holds value until next keyframe', () => {
      let track = createKeyframeTrack('opacity', 1);
      track = addKeyframe(track, { time: µs(0), value: 1, interpolation: 'hold' });
      track = addKeyframe(track, { time: µs(2_000_000), value: 0, interpolation: 'linear' });
      
      // At 1s (50% between), hold should return the from value (1)
      expect(evaluateKeyframeTrack(track, µs(1_000_000))).toBe(1);
      
      // At exactly 2s, should transition to next
      expect(evaluateKeyframeTrack(track, µs(2_000_000))).toBe(0);
    });

    it('evaluateKeyframeTracks - evaluates multiple tracks', () => {
      let positionTrack = createKeyframeTrack('position', { x: 0, y: 0 });
      positionTrack = addKeyframe(positionTrack, { time: µs(0), value: { x: 0, y: 0 }, interpolation: 'linear' });
      positionTrack = addKeyframe(positionTrack, { time: µs(10_000_000), value: { x: 100, y: 100 }, interpolation: 'linear' });
      
      let scaleTrack = createKeyframeTrack('scale', { x: 1, y: 1 });
      scaleTrack = addKeyframe(scaleTrack, { time: µs(0), value: { x: 1, y: 1 }, interpolation: 'linear' });
      scaleTrack = addKeyframe(scaleTrack, { time: µs(10_000_000), value: { x: 2, y: 2 }, interpolation: 'linear' });
      
      const opacityTrack = createKeyframeTrack('opacity', 1);
      
      const tracks = {
        position: positionTrack,
        scale: scaleTrack,
        opacity: opacityTrack,
      };
      
      const results = evaluateKeyframeTracks(tracks, µs(5_000_000));
      
      expect(results.position.x).toBe(50);
      expect(results.position.y).toBe(50);
      expect(results.scale.x).toBe(1.5);
      expect(results.scale.y).toBe(1.5);
      expect(results.opacity).toBe(1); // default
    });
  });

  describe('Transform Keyframes', () => {
    it('createTransformKeyframes - creates all transform tracks', () => {
      const tf = createTransformKeyframes();
      
      expect(tf.position).toBeDefined();
      expect(tf.scale).toBeDefined();
      expect(tf.rotation).toBeDefined();
      expect(tf.anchor).toBeDefined();
      expect(tf.opacity).toBeDefined();
      
      expect(tf.position.defaultValue).toEqual({ x: 0, y: 0 });
      expect(tf.scale.defaultValue).toEqual({ x: 1, y: 1 });
      expect(tf.rotation.defaultValue).toBe(0);
      expect(tf.anchor.defaultValue).toEqual({ x: 0.5, y: 0.5 });
      expect(tf.opacity.defaultValue).toBe(1);
    });

    it('evaluateTransformKeyframes - evaluates all transform properties', () => {
      let tf = createTransformKeyframes();
      
      tf = addTransformKeyframe(tf, 'position', { time: µs(0), value: { x: 0, y: 0 }, interpolation: 'linear' });
      tf = addTransformKeyframe(tf, 'position', { time: µs(10_000_000), value: { x: 100, y: 200 }, interpolation: 'linear' });
      
      tf = addTransformKeyframe(tf, 'scale', { time: µs(0), value: { x: 1, y: 1 }, interpolation: 'linear' });
      tf = addTransformKeyframe(tf, 'scale', { time: µs(10_000_000), value: { x: 2, y: 0.5 }, interpolation: 'linear' });
      
      tf = addTransformKeyframe(tf, 'rotation', { time: µs(0), value: 0, interpolation: 'linear' });
      tf = addTransformKeyframe(tf, 'rotation', { time: µs(10_000_000), value: Math.PI, interpolation: 'linear' });
      
      const result = evaluateTransformKeyframes(tf, µs(5_000_000));
      
      expect(result.position.x).toBe(50);
      expect(result.position.y).toBe(100);
      expect(result.scale.x).toBe(1.5);
      expect(result.scale.y).toBe(0.75);
      expect(result.rotation).toBeCloseTo(Math.PI / 2, 3);
      expect(result.anchor).toEqual({ x: 0.5, y: 0.5 }); // default
      expect(result.opacity).toBe(1); // default
    });
  });

  describe('Segment Animation', () => {
    const testMedia = {
      id: 'media-1',
      type: 'video' as const,
      url: 'file:///test.mp4',
      duration: 10_000_000n as Microseconds,
    };

    it('createSegmentAnimationState - creates default state', () => {
      const segment = createSegment({
        id: 'seg-1',
        trackId: 'track-1',
        type: 'video',
        targetStart: TimePoint.zero(),
        targetDuration: 10_000_000n as Microseconds,
        sourceStart: TimePoint.zero(),
        sourceDuration: 10_000_000n as Microseconds,
        media: testMedia,
      });
      
      const state = createSegmentAnimationState(segment);
      
      expect(state.segmentId).toBe('seg-1');
      expect(state.transformKeyframes.position.defaultValue).toEqual({ x: 0, y: 0 });
      expect(state.transformKeyframes.scale.defaultValue).toEqual({ x: 1, y: 1 });
      expect(state.volumeKeyframeTrack.defaultValue).toBe(1);
      expect(state.speedKeyframeTrack.defaultValue).toBe(1);
    });

    it('evaluateSegmentAnimation - evaluates at segment start', () => {
      const segment = createSegment({
        id: 'seg-1',
        trackId: 'track-1',
        type: 'video',
        targetStart: TimePoint.zero(),
        targetDuration: 10_000_000n as Microseconds,
        sourceStart: TimePoint.zero(),
        sourceDuration: 10_000_000n as Microseconds,
        media: testMedia,
      });
      
      const state = createSegmentAnimationState(segment);
      const animated = evaluateSegmentAnimation(segment, state, TimePoint.zero());
      
      expect(animated.transform.position).toEqual({ x: 0, y: 0 });
      expect(animated.transform.scale).toEqual({ x: 1, y: 1 });
      expect(animated.volume).toBe(1);
      expect(animated.speed).toBe(1);
    });

    it('evaluateSegmentAnimation - evaluates with keyframes', () => {
      const segment = createSegment({
        id: 'seg-1',
        trackId: 'track-1',
        type: 'video',
        targetStart: TimePoint.zero(),
        targetDuration: 10_000_000n as Microseconds,
        sourceStart: TimePoint.zero(),
        sourceDuration: 10_000_000n as Microseconds,
        media: testMedia,
      });
      
      let state = createSegmentAnimationState(segment);
      
      // Add position keyframes at 0s, 5s, 10s
      state = addSegmentTransformKeyframe(state, 'position', µs(0), { x: 0, y: 0 });
      state = addSegmentTransformKeyframe(state, 'position', µs(5_000_000), { x: 100, y: 200 });
      state = addSegmentTransformKeyframe(state, 'position', µs(10_000_000), { x: 300, y: 400 });
      
      // Evaluate at 2.5s (halfway between 0s and 5s keyframes)
      const animated = evaluateSegmentAnimation(segment, state, TimePoint.fromSeconds(2.5));
      
      // At 2.5s, position should be halfway between (0,0) and (100,200) = (50, 100)
      expect(animated.transform.position.x).toBeCloseTo(50, 0);
      expect(animated.transform.position.y).toBeCloseTo(100, 0);
    });

    it('evaluateAllSegmentsAnimation - evaluates multiple segments', () => {
      const segment1 = createSegment({
        id: 'seg-1',
        trackId: 'track-1',
        type: 'video',
        targetStart: TimePoint.zero(),
        targetDuration: 5_000_000n as Microseconds,
        sourceStart: TimePoint.zero(),
        sourceDuration: 5_000_000n as Microseconds,
        media: testMedia,
      });
      
      const segment2 = createSegment({
        id: 'seg-2',
        trackId: 'track-1',
        type: 'video',
        targetStart: TimePoint.fromSeconds(5),
        targetDuration: 5_000_000n as Microseconds,
        sourceStart: TimePoint.zero(),
        sourceDuration: 5_000_000n as Microseconds,
        media: testMedia,
      });
      
      const states = new Map<string, SegmentAnimationState>();
      states.set('seg-1', createSegmentAnimationState(segment1));
      states.set('seg-2', createSegmentAnimationState(segment2));
      
      // At 2.5s - only seg-1 active
      let results = evaluateAllSegmentsAnimation([segment1, segment2], states, TimePoint.fromSeconds(2.5));
      expect(results.size).toBe(1);
      expect(results.has('seg-1')).toBe(true);
      
      // At 7.5s - only seg-2 active
      results = evaluateAllSegmentsAnimation([segment1, segment2], states, TimePoint.fromSeconds(7.5));
      expect(results.size).toBe(1);
      expect(results.has('seg-2')).toBe(true);
    });

    it('getAnimatedProperty - gets specific property', () => {
      const segment = createSegment({
        id: 'seg-1',
        trackId: 'track-1',
        type: 'video',
        targetStart: TimePoint.zero(),
        targetDuration: 10_000_000n as Microseconds,
        sourceStart: TimePoint.zero(),
        sourceDuration: 10_000_000n as Microseconds,
        media: testMedia,
      });
      
      let state = createSegmentAnimationState(segment);
      state = addSegmentTransformKeyframe(state, 'position', µs(0), { x: 0, y: 0 });
      state = addSegmentTransformKeyframe(state, 'position', µs(10_000_000), { x: 100, y: 100 });
      state = addSegmentTransformKeyframe(state, 'rotation', µs(0), 0);
      state = addSegmentTransformKeyframe(state, 'rotation', µs(10_000_000), Math.PI);
      
      const pos = getAnimatedProperty(segment, state, TimePoint.fromSeconds(5), 'transform.position');
      expect(pos.x).toBe(50);
      expect(pos.y).toBe(50);
      
      const rot = getAnimatedProperty(segment, state, TimePoint.fromSeconds(5), 'transform.rotation');
      expect(rot).toBeCloseTo(Math.PI / 2, 3);
    });
  });
});