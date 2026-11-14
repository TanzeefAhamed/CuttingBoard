/**
 * Keyframe Types and Evaluator for CuttingBoard
 * 
 * Supports keyframe animation with multiple interpolation types:
 * - linear: Linear interpolation between keyframes
 * - hold: Hold value until next keyframe
 * - bezier: Cubic bezier interpolation with custom control points
 * - spring: Physics-based spring animation
 */

import { TimePoint, Microseconds, RationalTime } from '../timeline/types.js';
import { InterpolationType, CubicBezier, SpringConfig, getEasingFunction } from './easing.js';

export interface Keyframe<T = number> {
  /** Time position in microseconds */
  time: Microseconds;
  /** Value at this keyframe */
  value: T;
  /** Interpolation type to the NEXT keyframe */
  interpolation: InterpolationType;
  /** Bezier control points (for bezier interpolation) */
  bezier?: CubicBezier;
  /** Spring config (for spring interpolation) */
  spring?: SpringConfig;
  /** Easing name (for preset easings) */
  easing?: string;
}

export interface KeyframeTrack<T = number> {
  /** Property path being animated (e.g., "transform.position.x", "opacity") */
  property: string;
  /** Keyframes sorted by time */
  keyframes: Keyframe<T>[];
  /** Default value when no keyframes exist */
  defaultValue: T;
}

/**
 * Creates an empty keyframe track.
 */
export function createKeyframeTrack<T>(property: string, defaultValue: T): KeyframeTrack<T> {
  return {
    property,
    keyframes: [],
    defaultValue,
  };
}

/**
 * Adds a keyframe to a track, maintaining sorted order.
 */
export function addKeyframe<T>(track: KeyframeTrack<T>, keyframe: Keyframe<T>): KeyframeTrack<T> {
  const newKeyframes = [...track.keyframes, keyframe];
  newKeyframes.sort((a, b) => Number(a.time - b.time));
  return { ...track, keyframes: newKeyframes };
}

/**
 * Removes a keyframe at a specific time.
 */
export function removeKeyframeAt<T>(track: KeyframeTrack<T>, time: Microseconds): KeyframeTrack<T> {
  return {
    ...track,
    keyframes: track.keyframes.filter(k => k.time !== time),
  };
}

/**
 * Gets the keyframes surrounding a given time.
 * Returns [previousKeyframe, nextKeyframe] or null if not found.
 */
export function getSurroundingKeyframes<T>(track: KeyframeTrack<T>, time: Microseconds): [Keyframe<T>, Keyframe<T>] | null {
  const { keyframes } = track;
  if (keyframes.length === 0) return null;
  if (keyframes.length === 1) return [keyframes[0], keyframes[0]];

  // Find the last keyframe at or before the given time
  let prevIndex = -1;
  for (let i = 0; i < keyframes.length; i++) {
    if (keyframes[i].time <= time) {
      prevIndex = i;
    } else {
      break;
    }
  }

  if (prevIndex === -1) {
    // Time is before first keyframe - return first keyframe twice
    return [keyframes[0], keyframes[0]];
  }

  if (prevIndex === keyframes.length - 1) {
    // Time is at or after last keyframe - return last keyframe twice
    return [keyframes[prevIndex], keyframes[prevIndex]];
  }

  // Time is between keyframes - check if exactly at a keyframe
  if (keyframes[prevIndex].time === time) {
    return [keyframes[prevIndex], keyframes[prevIndex]];
  }

  return [keyframes[prevIndex], keyframes[prevIndex + 1]];
}

/**
 * Interpolates between two values based on the interpolation type of the first keyframe.
 * Handles numbers, Point2D objects, and arrays of numbers.
 */
export function interpolateValue<T>(
  from: Keyframe<T>,
  to: Keyframe<T>,
  progress: number
): T {
  if (progress <= 0) return from.value;
  if (progress >= 1) return to.value;

  // For hold interpolation, return the from value until the very end
  if (from.interpolation === 'hold') {
    return from.value;
  }

  const easing = getEasingFunction(from.interpolation, from.bezier || from.spring);
  const easedProgress = easing(progress);

  // Handle numeric values
  if (typeof from.value === 'number' && typeof to.value === 'number') {
    return lerp(from.value, to.value, easedProgress) as T;
  }

  // Handle Point2D-like objects { x: number, y: number }
  if (isPoint2D(from.value) && isPoint2D(to.value)) {
    return {
      x: lerp(from.value.x, to.value.x, easedProgress),
      y: lerp(from.value.y, to.value.y, easedProgress),
    } as T;
  }

  // Handle arrays of numbers
  if (Array.isArray(from.value) && Array.isArray(to.value) && from.value.length === to.value.length) {
    return from.value.map((v, i) => lerp(v, to.value[i], easedProgress)) as T;
  }

  // For other non-numeric values, return the from value (no interpolation)
  return progress < 1 ? from.value : to.value;
}

function isPoint2D(value: any): value is { x: number; y: number } {
  return value && typeof value === 'object' && 'x' in value && 'y' in value &&
         typeof value.x === 'number' && typeof value.y === 'number';
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Evaluates a keyframe track at a specific time.
 * Returns the interpolated value.
 */
export function evaluateKeyframeTrack<T>(track: KeyframeTrack<T>, time: Microseconds): T {
  const { keyframes, defaultValue } = track;
  
  if (keyframes.length === 0) return defaultValue;
  if (keyframes.length === 1) return keyframes[0].value;

  const surrounding = getSurroundingKeyframes(track, time);
  if (!surrounding) return defaultValue;

  const [from, to] = surrounding;

  // If time is exactly at a keyframe
  if (from.time === to.time) return from.value;

  // If time is before first keyframe
  if (time <= keyframes[0].time) return keyframes[0].value;

  // If time is after last keyframe
  if (time >= keyframes[keyframes.length - 1].time) {
    return keyframes[keyframes.length - 1].value;
  }

  // Calculate progress between keyframes
  const duration = Number(to.time - from.time);
  if (duration === 0) return from.value;

  const elapsed = Number(time - from.time);
  const progress = elapsed / duration;

  return interpolateValue(from, to, progress);
}

/**
 * Evaluates multiple keyframe tracks at once.
 */
export function evaluateKeyframeTracks<T extends Record<string, KeyframeTrack<any>>>(
  tracks: T,
  time: Microseconds
): { [K in keyof T]: ReturnType<T[K] extends KeyframeTrack<infer V> ? (t: Microseconds) => V : never> } {
  const result: any = {};
  for (const [key, track] of Object.entries(tracks)) {
    result[key] = evaluateKeyframeTrack(track, time);
  }
  return result;
}

/**
 * Gets all keyframe times across all tracks.
 */
export function getAllKeyframeTimes(tracks: KeyframeTrack<any>[]): Microseconds[] {
  const times = new Set<Microseconds>();
  for (const track of tracks) {
    for (const kf of track.keyframes) {
      times.add(kf.time);
    }
  }
  return Array.from(times).sort((a, b) => Number(a - b));
}

/**
 * Creates a keyframe track for a numeric property with linear interpolation.
 */
export function createLinearKeyframeTrack(property: string, defaultValue: number): KeyframeTrack<number> {
  return createKeyframeTrack(property, defaultValue);
}

/**
 * Creates a keyframe track for a 2D point property.
 */
export interface Point2D { x: number; y: number; }

export function createPoint2DKeyframeTrack(property: string, defaultValue: Point2D = { x: 0, y: 0 }): KeyframeTrack<Point2D> {
  return createKeyframeTrack(property, defaultValue);
}

/**
 * Creates a keyframe track for transform properties.
 */
export interface TransformKeyframes {
  position: KeyframeTrack<Point2D>;
  scale: KeyframeTrack<Point2D>;
  rotation: KeyframeTrack<number>;
  anchor: KeyframeTrack<Point2D>;
  opacity: KeyframeTrack<number>;
}

export function createTransformKeyframes(): TransformKeyframes {
  return {
    position: createPoint2DKeyframeTrack('transform.position', { x: 0, y: 0 }),
    scale: createPoint2DKeyframeTrack('transform.scale', { x: 1, y: 1 }),
    rotation: createKeyframeTrack('transform.rotation', 0),
    anchor: createPoint2DKeyframeTrack('transform.anchor', { x: 0.5, y: 0.5 }),
    opacity: createKeyframeTrack('opacity', 1),
  };
}

/**
 * Adds a keyframe to a TransformKeyframes object.
 */
export function addTransformKeyframe<K extends keyof TransformKeyframes>(
  keyframes: TransformKeyframes,
  property: K,
  keyframe: Omit<Keyframe<TransformKeyframes[K]['defaultValue']>, 'time'> & { time: Microseconds }
): TransformKeyframes {
  if (!keyframes || !keyframes[property]) {
    throw new Error(`Invalid keyframes or property: ${String(property)}`);
  }
  return {
    ...keyframes,
    [property]: addKeyframe(keyframes[property], keyframe as Keyframe<any>),
  };
}

/**
 * Evaluates all transform keyframes at a given time.
 */
export function evaluateTransformKeyframes(keyframes: TransformKeyframes, time: Microseconds) {
  return {
    position: evaluateKeyframeTrack(keyframes.position, time),
    scale: evaluateKeyframeTrack(keyframes.scale, time),
    rotation: evaluateKeyframeTrack(keyframes.rotation, time),
    anchor: evaluateKeyframeTrack(keyframes.anchor, time),
    opacity: evaluateKeyframeTrack(keyframes.opacity, time),
  };
}