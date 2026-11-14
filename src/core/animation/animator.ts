/**
 * Property Animator - Evaluates animated properties at a given timestamp.
 * Pure function with no side effects.
 */

import { TimePoint, Microseconds } from '../timeline/types.js';
import { KeyframeTrack, evaluateKeyframeTrack, TransformKeyframes, evaluateTransformKeyframes, addTransformKeyframe as addKeyframeToTransform, removeTransformKeyframe as removeKeyframeFromTransform } from './keyframe.js';
import { Segment, SegmentTransform } from '../timeline/segment.js';

export interface AnimatedProperties {
  transform: SegmentTransform;
  // Other animatable properties can be added here
  volume: number;
  speed: number;
  opacity: number;
}

export interface SegmentAnimationState {
  segmentId: string;
  transformKeyframes: TransformKeyframes;
  volumeKeyframeTrack: KeyframeTrack<number>;
  speedKeyframeTrack: KeyframeTrack<number>;
  opacityKeyframeTrack: KeyframeTrack<number>;
}

/**
 * Creates default animation state for a segment.
 */
export function createSegmentAnimationState(segment: Segment): SegmentAnimationState {
  return {
    segmentId: segment.id,
    transformKeyframes: {
      position: { property: 'transform.position', keyframes: [], defaultValue: segment.transform.position },
      scale: { property: 'transform.scale', keyframes: [], defaultValue: segment.transform.scale },
      rotation: { property: 'transform.rotation', keyframes: [], defaultValue: segment.transform.rotation },
      anchor: { property: 'transform.anchor', keyframes: [], defaultValue: segment.transform.anchor },
      opacity: { property: 'opacity', keyframes: [], defaultValue: segment.transform.opacity },
    },
    volumeKeyframeTrack: { property: 'volume', keyframes: [], defaultValue: 1 },
    speedKeyframeTrack: { property: 'speed', keyframes: [], defaultValue: segment.speed },
    opacityKeyframeTrack: { property: 'opacity', keyframes: [], defaultValue: segment.transform.opacity },
  };
}

/**
 * Evaluates all animated properties for a segment at a given time.
 * Returns the computed animated values.
 */
export function evaluateSegmentAnimation(
  segment: Segment,
  animationState: SegmentAnimationState,
  time: TimePoint
): AnimatedProperties {
  const relativeTime = time.value - segment.targetTimerange.start.value;
  if (relativeTime < 0) relativeTime = 0n;
  
  const localTime = relativeTime as Microseconds;

  const transform = evaluateTransformKeyframes(animationState.transformKeyframes, localTime);
  const volume = evaluateKeyframeTrack(animationState.volumeKeyframeTrack, localTime);
  const speed = evaluateKeyframeTrack(animationState.speedKeyframeTrack, localTime);
  const opacity = evaluateKeyframeTrack(animationState.opacityKeyframeTrack, localTime);

  return {
    transform: {
      position: transform.position,
      scale: transform.scale,
      rotation: transform.rotation,
      anchor: transform.anchor,
      opacity: transform.opacity,
      blendMode: segment.transform.blendMode,
    },
    volume,
    speed,
    opacity,
  };
}

/**
 * Evaluates animated properties for all segments at a given time.
 */
export function evaluateAllSegmentsAnimation(
  segments: Segment[],
  animationStates: Map<string, SegmentAnimationState>,
  time: TimePoint
): Map<string, AnimatedProperties> {
  const results = new Map<string, AnimatedProperties>();
  
  for (const segment of segments) {
    if (!segment.targetTimerange.contains(time)) continue;
    
    const state = animationStates.get(segment.id);
    if (!state) continue;
    
    const animated = evaluateSegmentAnimation(segment, state, time);
    results.set(segment.id, animated);
  }
  
  return results;
}

/**
 * Adds a transform keyframe to a segment's animation state.
 */
export function addTransformKeyframe(
  state: SegmentAnimationState,
  property: keyof TransformKeyframes,
  time: Microseconds,
  value: any,
  interpolation: 'linear' | 'hold' | 'bezier' | 'spring' = 'linear',
  bezier?: { x1: number; y1: number; x2: number; y2: number }
): SegmentAnimationState {
  const keyframe = {
    time,
    value,
    interpolation,
    bezier,
  } as any;
  
  const newTransformKeyframes = addKeyframeToTransform(state.transformKeyframes, property, keyframe);
  
  return {
    ...state,
    transformKeyframes: newTransformKeyframes,
  };
}

/**
 * Removes a transform keyframe from a segment's animation state.
 */
export function removeTransformKeyframe(
  state: SegmentAnimationState,
  property: keyof TransformKeyframes,
  time: Microseconds
): SegmentAnimationState {
  const newTransformKeyframes = removeKeyframeFromTransform(state.transformKeyframes, property, time);
  
  return {
    ...state,
    transformKeyframes: newTransformKeyframes,
  };
}

/**
 * Gets the animated value of a specific property at a time.
 */
export function getAnimatedProperty(
  segment: Segment,
  animationState: SegmentAnimationState,
  time: TimePoint,
  propertyPath: string
): any {
  const relativeTime = time.value - segment.targetTimerange.start.value;
  if (relativeTime < 0) return undefined;
  
  const localTime = relativeTime as Microseconds;

  switch (propertyPath) {
    case 'transform.position':
      return evaluateKeyframeTrack(animationState.transformKeyframes.position, localTime);
    case 'transform.scale':
      return evaluateKeyframeTrack(animationState.transformKeyframes.scale, localTime);
    case 'transform.rotation':
      return evaluateKeyframeTrack(animationState.transformKeyframes.rotation, localTime);
    case 'transform.anchor':
      return evaluateKeyframeTrack(animationState.transformKeyframes.anchor, localTime);
    case 'transform.opacity':
      return evaluateKeyframeTrack(animationState.transformKeyframes.opacity, localTime);
    case 'volume':
      return evaluateKeyframeTrack(animationState.volumeKeyframeTrack, localTime);
    case 'speed':
      return evaluateKeyframeTrack(animationState.speedKeyframeTrack, localTime);
    case 'opacity':
      return evaluateKeyframeTrack(animationState.opacityKeyframeTrack, localTime);
    default:
      return undefined;
  }
}

/**
 * Creates animation state from a segment's existing keyframes (for import).
 */
export function createAnimationStateFromSegment(segment: Segment): SegmentAnimationState {
  const state = createSegmentAnimationState(segment);
  
  // Note: In a real implementation, this would parse keyframes from the segment's metadata
  // For now, we return the default state
  
  return state;
}