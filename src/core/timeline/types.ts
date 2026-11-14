/**
 * Core Timeline Types for CuttingBoard
 * 
 * Time is represented as microseconds (µs) using JavaScript bigint for precision.
 * This eliminates floating-point rounding errors and framerate drift over long sessions.
 */

export type Microseconds = bigint & { readonly __brand: unique symbol };
export type RationalNumerator = bigint & { readonly __brand: unique symbol };
export type RationalDenominator = bigint & { readonly __brand: unique symbol };

/**
 * Creates a Microseconds value from a number of microseconds.
 */
export function µs(value: bigint | number): Microseconds {
  return BigInt(value) as Microseconds;
}

/**
 * Creates a Microseconds value from seconds.
 */
export function µsFromSeconds(seconds: number): Microseconds {
  return µs(Math.round(seconds * 1_000_000));
}

/**
 * Creates a Microseconds value from frames at a given framerate.
 * Uses exact rational arithmetic to avoid precision loss.
 */
export function µsFromFrames(frames: number, fpsNumerator: number, fpsDenominator: number): Microseconds {
  // µs = frames * 1_000_000 * denominator / numerator
  // Do multiplication first to avoid truncation
  return µs((BigInt(frames) * 1_000_000n * BigInt(fpsDenominator)) / BigInt(fpsNumerator));
}

/**
 * Converts Microseconds to seconds (floating point, for display only).
 */
export function toSeconds(µs: Microseconds): number {
  return Number(µs) / 1_000_000;
}

/**
 * Converts Microseconds to frames at a given framerate.
 */
export function toFrames(µs: Microseconds, fpsNumerator: number, fpsDenominator: number): number {
  // frames = µs * numerator / (1_000_000 * denominator)
  return Number((µs * BigInt(fpsNumerator)) / (1_000_000n * BigInt(fpsDenominator)));
}

/**
 * Creates a Microseconds value from frames at a given RationalTime framerate.
 * Uses exact rational arithmetic to avoid precision loss.
 */
export function µsFromFramesRational(frames: number, fps: RationalTime): Microseconds {
  return µs((BigInt(frames) * 1_000_000n * fps.denominator) / fps.numerator);
}

/**
 * Converts Microseconds to frames at a given RationalTime framerate.
 * Uses exact rational arithmetic.
 */
export function toFramesRational(µs: Microseconds, fps: RationalTime): number {
  return Number((µs * fps.numerator) / (1_000_000n * fps.denominator));
}

/**
 * Rational framerate representation (e.g., 24000/1001 for 23.976 fps).
 */
export interface RationalTime {
  numerator: bigint;
  denominator: bigint;
}

/**
 * Standard framerates as RationalTime.
 */
export const FRAMERATES: Record<string, RationalTime> = {
  '23.976': { numerator: 24000n, denominator: 1001n },
  '24': { numerator: 24n, denominator: 1n },
  '25': { numerator: 25n, denominator: 1n },
  '29.97': { numerator: 30000n, denominator: 1001n },
  '30': { numerator: 30n, denominator: 1n },
  '50': { numerator: 50n, denominator: 1n },
  '59.94': { numerator: 60000n, denominator: 1001n },
  '60': { numerator: 60n, denominator: 1n },
};

/**
 * Returns microseconds per frame for a given framerate.
 */
export function µsPerFrame(fps: RationalTime): bigint {
  return (1_000_000n * fps.denominator) / fps.numerator;
}

/**
 * TimePoint represents an absolute position on the timeline in microseconds.
 */
export class TimePoint {
  constructor(public readonly value: Microseconds) {}

  static zero(): TimePoint {
    return new TimePoint(µs(0));
  }

  static fromFrames(frame: number, fps: RationalTime): TimePoint {
    return new TimePoint(µsFromFramesRational(frame, fps));
  }

  static fromSeconds(seconds: number): TimePoint {
    return new TimePoint(µsFromSeconds(seconds));
  }

  add(other: TimePoint | Microseconds): TimePoint {
    const µs = other instanceof TimePoint ? other.value : other;
    return new TimePoint(this.value + µs);
  }

  subtract(other: TimePoint | Microseconds): TimePoint {
    const µs = other instanceof TimePoint ? other.value : other;
    return new TimePoint(this.value - µs);
  }

  mul(scalar: number): TimePoint {
    return new TimePoint(this.value * BigInt(Math.round(scalar)));
  }

  div(scalar: number): TimePoint {
    return new TimePoint(this.value / BigInt(Math.round(scalar)));
  }

  toFrames(fps: RationalTime): number {
    return toFramesRational(this.value, fps);
  }

  toSeconds(): number {
    return toSeconds(this.value);
  }

  equals(other: TimePoint): boolean {
    return this.value === other.value;
  }

  lessThan(other: TimePoint): boolean {
    return this.value < other.value;
  }

  lessThanOrEqual(other: TimePoint): boolean {
    return this.value <= other.value;
  }

  greaterThan(other: TimePoint): boolean {
    return this.value > other.value;
  }

  greaterThanOrEqual(other: TimePoint): boolean {
    return this.value >= other.value;
  }

  min(other: TimePoint): TimePoint {
    return this.lessThan(other) ? this : other;
  }

  max(other: TimePoint): TimePoint {
    return this.greaterThan(other) ? this : other;
  }

  toString(): string {
    return `${this.value}µs`;
  }

  toJSON(): string {
    return this.value.toString();
  }
}

/**
 * TimeRange represents a duration or span on the timeline.
 */
export class TimeRange {
  constructor(
    public readonly start: TimePoint,
    public readonly duration: Microseconds
  ) {}

  static zero(): TimeRange {
    return new TimeRange(TimePoint.zero(), µs(0));
  }

  static fromStartEnd(start: TimePoint, end: TimePoint): TimeRange {
    return new TimeRange(start, end.value - start.value);
  }

  static fromFrames(frames: number, fps: RationalTime): TimeRange {
    const µsDuration = µsFromFrames(frames, Number(fps.numerator), Number(fps.denominator));
    return new TimeRange(TimePoint.zero(), µsDuration);
  }

  get end(): TimePoint {
    return this.start.add(this.duration);
  }

  get isEmpty(): boolean {
    return this.duration === µs(0);
  }

  contains(time: TimePoint): boolean {
    return time.greaterThanOrEqual(this.start) && time.lessThan(this.end);
  }

  intersects(other: TimeRange): boolean {
    return this.start.lessThan(other.end) && other.start.lessThan(this.end);
  }

  union(other: TimeRange): TimeRange {
    const newStart = this.start.min(other.start);
    const newEnd = this.end.max(other.end);
    return TimeRange.fromStartEnd(newStart, newEnd);
  }

  intersection(other: TimeRange): TimeRange | null {
    const newStart = this.start.max(other.start);
    const newEnd = this.end.min(other.end);
    if (newStart.greaterThanOrEqual(newEnd)) return null;
    return TimeRange.fromStartEnd(newStart, newEnd);
  }

  shift(offset: Microseconds): TimeRange {
    return new TimeRange(this.start.add(offset), this.duration);
  }

  trimStart(newStart: TimePoint): TimeRange {
    if (newStart.lessThan(this.start) || newStart.greaterThanOrEqual(this.end)) {
      throw new Error('Invalid trim start');
    }
    return TimeRange.fromStartEnd(newStart, this.end);
  }

  trimEnd(newEnd: TimePoint): TimeRange {
    if (newEnd.lessThanOrEqual(this.start) || newEnd.greaterThan(this.end)) {
      throw new Error('Invalid trim end');
    }
    return TimeRange.fromStartEnd(this.start, newEnd);
  }

  toFrames(fps: RationalTime): number {
    return toFrames(this.duration, Number(fps.numerator), Number(fps.denominator));
  }

  toSeconds(): number {
    return toSeconds(this.duration);
  }

  equals(other: TimeRange): boolean {
    return this.start.equals(other.start) && this.duration === other.duration;
  }

  toString(): string {
    return `[${this.start} → ${this.end}) (${this.duration}µs)`;
  }

  toJSON(): { start: string; duration: string } {
    return { start: this.start.toJSON(), duration: this.duration.toString() };
  }
}