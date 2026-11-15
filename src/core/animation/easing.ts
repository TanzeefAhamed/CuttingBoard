import { InterpolationType, CubicBezier, SpringConfig } from './index';

/**
 * Linear interpolation between two values.
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Clamps a value between 0 and 1.
 */
export function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/**
 * Cubic Bezier interpolation using Newton-Raphson method for finding t given x.
 * Based on Web Animations API and CSS Transitions specification.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  // Pre-calculate polynomial coefficients
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;

  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;

  // Sample points for binary search fallback
  const SAMPLE_COUNT = 11;
  const samples = new Array(SAMPLE_COUNT);
  for (let i = 0; i < SAMPLE_COUNT; i++) {
    const t = i / (SAMPLE_COUNT - 1);
    samples[i] = calcBezier(t, ax, bx, cx);
  }

  function calcBezier(t: number, a: number, b: number, c: number): number {
    return ((a * t + b) * t + c) * t;
  }

  function getSlope(t: number, a: number, b: number, c: number): number {
    return 3 * a * t * t + 2 * b * t + c;
  }

  function getTForX(x: number): number {
    // Binary search for initial guess
    let intervalStart = 0;
    let currentSample = 1;
    const lastSample = SAMPLE_COUNT - 1;

    for (; currentSample !== lastSample && samples[currentSample] <= x; ++currentSample) {
      intervalStart += 1 / (SAMPLE_COUNT - 1);
    }
    --currentSample;

    // Interpolate to get initial guess
    const dist = (x - samples[currentSample]) / (samples[currentSample + 1] - samples[currentSample]);
    const guess = intervalStart + dist * (1 / (SAMPLE_COUNT - 1));

    // Newton-Raphson refinement
    let t = guess;
    for (let i = 0; i < 8; i++) {
      const xDiff = calcBezier(t, ax, bx, cx) - x;
      if (Math.abs(xDiff) < 1e-7) break;
      const slope = getSlope(t, ax, bx, cx);
      if (slope === 0) break;
      t -= xDiff / slope;
    }

    return clamp01(t);
  }

  return (t: number): number => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const tForX = getTForX(t);
    return calcBezier(tForX, ay, by, cy);
  };
}

/**
 * Creates a cubic-bezier easing function from CSS-style values.
 */
export function createCubicBezierEasing(bezier: CubicBezier): (t: number) => number {
  return cubicBezier(bezier.x1, bezier.y1, bezier.x2, bezier.y2);
}

/**
 * Hold interpolation - value stays constant until next keyframe.
 */
export function holdInterpolation(_t: number): number {
  return 0; // Will be handled specially in evaluator
}

/**
 * Spring physics interpolation.
 * Based on the spring model from iOS/UIKit and React Native Reanimated.
 */
export function createSpringEasing(config: SpringConfig): (t: number) => number {
  const { stiffness, damping, mass, initialVelocity = 0 } = config;
  
  // Calculate critical damping
  const criticalDamping = 2 * Math.sqrt(stiffness * mass);
  const dampingRatio = damping / criticalDamping;
  
  // Natural frequency
  const omega0 = Math.sqrt(stiffness / mass);
  
  if (dampingRatio < 1) {
    // Underdamped - oscillates
    const omega1 = omega0 * Math.sqrt(1 - dampingRatio * dampingRatio);
    return (t: number): number => {
      const envelope = Math.exp(-dampingRatio * omega0 * t);
      return 1 - envelope * (Math.cos(omega1 * t) + 
        (dampingRatio * omega0 - initialVelocity) / omega1 * Math.sin(omega1 * t));
    };
  } else if (dampingRatio === 1) {
    // Critically damped
    return (t: number): number => {
      return 1 - Math.exp(-omega0 * t) * (1 + omega0 * t);
    };
  } else {
    // Overdamped
    const s1 = -omega0 * (dampingRatio - Math.sqrt(dampingRatio * dampingRatio - 1));
    const s2 = -omega0 * (dampingRatio + Math.sqrt(dampingRatio * dampingRatio - 1));
    return (t: number): number => {
      const c1 = (initialVelocity - s2) / (s1 - s2);
      const c2 = 1 - c1;
      return 1 - (c1 * Math.exp(s1 * t) + c2 * Math.exp(s2 * t));
    };
  }
}

/**
 * Common easing presets.
 */
export const EASING_PRESETS: Record<string, (t: number) => number> = {
  linear: (t: number) => t,
  easeIn: cubicBezier(0.42, 0, 1, 1),
  easeOut: cubicBezier(0, 0, 0.58, 1),
  easeInOut: cubicBezier(0.42, 0, 0.58, 1),
  easeInQuad: cubicBezier(0.55, 0.085, 0.68, 0.53),
  easeOutQuad: cubicBezier(0.25, 0.46, 0.45, 0.94),
  easeInOutQuad: cubicBezier(0.455, 0.03, 0.515, 0.955),
  easeInCubic: cubicBezier(0.55, 0.055, 0.675, 0.19),
  easeOutCubic: cubicBezier(0.215, 0.61, 0.355, 1),
  easeInOutCubic: cubicBezier(0.645, 0.045, 0.355, 1),
  easeInQuart: cubicBezier(0.895, 0.03, 0.685, 0.22),
  easeOutQuart: cubicBezier(0.165, 0.84, 0.44, 1),
  easeInOutQuart: cubicBezier(0.77, 0, 0.175, 1),
  easeInQuint: cubicBezier(0.755, 0.05, 0.855, 0.06),
  easeOutQuint: cubicBezier(0.23, 1, 0.32, 1),
  easeInOutQuint: cubicBezier(0.86, 0, 0.07, 1),
  easeInExpo: cubicBezier(0.95, 0.05, 0.795, 0.035),
  easeOutExpo: cubicBezier(0.19, 1, 0.22, 1),
  easeInOutExpo: cubicBezier(1, 0, 0, 1),
  easeInCirc: cubicBezier(0.6, 0.04, 0.98, 0.335),
  easeOutCirc: cubicBezier(0.075, 0.82, 0.165, 1),
  easeInOutCirc: cubicBezier(0.785, 0.135, 0.15, 0.86),
  easeInBack: cubicBezier(0.6, -0.28, 0.735, 0.045),
  easeOutBack: cubicBezier(0.175, 0.885, 0.32, 1.275),
  easeInOutBack: cubicBezier(0.68, -0.55, 0.265, 1.55),
};

/**
 * Gets an easing function by name or creates from bezier/spring config.
 */
export function getEasingFunction(type: InterpolationType, config?: CubicBezier | SpringConfig): (t: number) => number {
  switch (type) {
    case 'linear':
      return EASING_PRESETS.linear;
    case 'hold':
      return holdInterpolation;
    case 'bezier':
      if (config && 'x1' in config) {
        return createCubicBezierEasing(config as CubicBezier);
      }
      return EASING_PRESETS.easeInOut;
    case 'spring':
      if (config && 'stiffness' in config) {
        return createSpringEasing(config as SpringConfig);
      }
      return createSpringEasing({ stiffness: 100, damping: 10, mass: 1 });
    default:
      return EASING_PRESETS.linear;
  }
}