import { InterpolationType, CubicBezier, SpringConfig, getEasingFunction } from './easing';
import { TimePoint, TimeRange, Microseconds, µs, µsFromFrames, toSeconds, toFrames } from '../timeline/types';

export interface Keyframe<T = number> {
  time: Microseconds;
  value: T;
  interpolation: InterpolationType;
  bezier?: CubicBezier;
  spring?: SpringConfig;
  easing?: string;
}

export interface KeyframeTrack<T = number> {
  property: string;
  keyframes: Keyframe<T>[];
  defaultValue: T;
}

export function createKeyframeTrack<T>(property: string, defaultValue: T): KeyframeTrack<T> {
  return {
    property,
    keyframes: [],
    defaultValue,
  };
}

export function addKeyframe<T>(track: KeyframeTrack<T>, keyframe: Keyframe<T>): KeyframeTrack<T> {
  const newKeyframes = [...track.keyframes, keyframe];
  newKeyframes.sort((a, b) => Number(a.time - b.time));
  return { ...track, keyframes: newKeyframes };
}

export function removeKeyframeAt<T>(track: KeyframeTrack<T>, time: Microseconds): KeyframeTrack<T> {
  return {
    ...track,
    keyframes: track.keyframes.filter(k => k.time !== time),
  };
}

export function getSurroundingKeyframes<T>(track: KeyframeTrack<T>, time: Microseconds): [Keyframe<T>, Keyframe<T>] | null {
  const { keyframes } = track;
  if (keyframes.length === 0) return null;
  if (keyframes.length === 1) return [keyframes[0], keyframes[0]];

  let prevIndex = -1;
  for (let i = 0; i < keyframes.length; i++) {
    if (keyframes[i].time <= time) {
      prevIndex = i;
    } else {
      break;
    }
  }

  if (prevIndex === -1) {
    return [keyframes[0], keyframes[0]];
  }

  if (prevIndex === keyframes.length - 1) {
    return [keyframes[prevIndex], keyframes[prevIndex]];
  }

  if (keyframes[prevIndex].time === time) {
    return [keyframes[prevIndex], keyframes[prevIndex]];
  }

  return [keyframes[prevIndex], keyframes[prevIndex + 1]];
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function interpolateValue<T>(
  from: Keyframe<T>,
  to: Keyframe<T>,
  progress: number
): T {
  if (progress <= 0) return from.value;
  if (progress >= 1) return to.value;

  if (from.interpolation === 'hold') {
    return from.value;
  }

  const easing = getEasingFunction(from.interpolation, from.bezier || from.spring);
  const easedProgress = easing(progress);

  if (typeof from.value === 'number' && typeof to.value === 'number') {
    return lerp(from.value, to.value, easedProgress) as T;
  }

  if (isPoint2D(from.value) && isPoint2D(to.value)) {
    return {
      x: lerp(from.value.x, to.value.x, easedProgress),
      y: lerp(from.value.y, to.value.y, easedProgress),
    } as T;
  }

  if (Array.isArray(from.value) && Array.isArray(to.value) && from.value.length === to.value.length) {
    return from.value.map((v, i) => lerp(v, to.value[i], easedProgress)) as T;
  }

  return progress < 1 ? from.value : to.value;
}

function isPoint2D(value: any): value is { x: number; y: number } {
  return value && typeof value === 'object' && 'x' in value && 'y' in value &&
         typeof value.x === 'number' && typeof value.y === 'number';
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function evaluateKeyframeTrack<T>(track: KeyframeTrack<T>, time: Microseconds): T {
  const { keyframes, defaultValue } = track;
  
  if (keyframes.length === 0) return defaultValue;
  if (keyframes.length === 1) return keyframes[0].value;

  const surrounding = getSurroundingKeyframes(track, time);
  if (!surrounding) return defaultValue;

  const [from, to] = surrounding;

  if (from.time === to.time) return from.value;

  if (time <= keyframes[0].time) return keyframes[0].value;
  if (time >= keyframes[keyframes.length - 1].time) {
    return keyframes[keyframes.length - 1].value;
  }

  const duration = Number(to.time - from.time);
  if (duration === 0) return from.value;

  const elapsed = Number(time - from.time);
  const progress = elapsed / duration;

  return interpolateValue(from, to, progress);
}

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

export function getAllKeyframeTimes(tracks: KeyframeTrack<any>[]): Microseconds[] {
  const times = new Set<Microseconds>();
  for (const track of tracks) {
    for (const kf of track.keyframes) {
      times.add(kf.time);
    }
  }
  return Array.from(times).sort((a, b) => Number(a - b));
}

export function createLinearKeyframeTrack(property: string, defaultValue: number): KeyframeTrack<number> {
  return createKeyframeTrack(property, defaultValue);
}

export function createPoint2DKeyframeTrack(property: string, defaultValue: { x: number; y: number } = { x: 0, y: 0 }): KeyframeTrack<{ x: number; y: number }> {
  return createKeyframeTrack(property, defaultValue);
}

export interface Point2D { x: number; y: number; }

export function createPoint2DKeyframeTrack(property: string, defaultValue: Point2D = { x: 0, y: 0 }): KeyframeTrack<Point2D> {
  return createKeyframeTrack(property, defaultValue);
}

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

export function evaluateTransformKeyframes(keyframes: TransformKeyframes, time: Microseconds) {
  return {
    position: evaluateKeyframeTrack(keyframes.position, time),
    scale: evaluateKeyframeTrack(keyframes.scale, time),
    rotation: evaluateKeyframeTrack(keyframes.rotation, time),
    anchor: evaluateKeyframeTrack(keyframes.anchor, time),
    opacity: evaluateKeyframeTrack(keyframes.opacity, time),
  };
}

export function addTransformKeyframe<K extends keyof TransformKeyframes>(
  keyframes: TransformKeyframes,
  property: keyof TransformKeyframes,
  keyframe: Keyframe<TransformKeyframes[keyof TransformKeyframes]['defaultValue']>
): TransformKeyframes {
  return {
    ...keyframes,
    [property]: addKeyframe(keyframes[property], keyframe as any),
  };
}

export function evaluateTransformKeyframes(keyframes: TransformKeyframes, time: Microseconds) {
  return {
    position: evaluateKeyframeTrack(keyframes.position, time),
    scale: evaluateKeyframeTrack(keyframes.scale, time),
    rotation: evaluateKeyframeTrack(keyframes.rotation, time),
    anchor: evaluateKeyframeTrack(keyframes.anchor, time),
    opacity: evaluateKeyframeTrack(keyframes.opacity, time),
  };
}