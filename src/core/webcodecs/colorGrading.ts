/**
 * Color Grading Engine
 * 
 * Implements professional color grading tools:
 * - Lift/Gamma/Gain 3-way color wheels (12 uniforms)
 * - 8-channel HSL selective color correction
 * - RGB & Luma spline curves (cubic spline → 1D texture)
 * - 3D LUT (.cube) parser with trilinear sampling
 * 
 * Designed for WebGL 2 / WebGPU fragment shaders.
 */

// ============================================================================
// Types
// ============================================================================

/** Lift/Gamma/Gain 3-way color grading parameters */
export interface LGGParams {
  /** Lift (shadows) - RGB + master */
  lift: { r: number; g: number; b: number; master: number };
  /** Gamma (midtones) - RGB + master */
  gamma: { r: number; g: number; b: number; master: number };
  /** Gain (highlights) - RGB + master */
  gain: { r: number; g: number; b: number; master: number };
}

/** 8-channel HSL selective color adjustment */
export interface HSLParams {
  /** 8 channels: Red, Orange, Yellow, Green, Cyan, Blue, Purple, Magenta */
  channels: Array<{
    hue: number;        // Hue shift in degrees (-180 to 180)
    saturation: number; // Saturation multiplier (0 to 2+)
    lightness: number;  // Lightness shift (-1 to 1)
  }>;
}

/** Spline curve control point */
export interface CurvePoint {
  x: number; // Input (0-1)
  y: number; // Output (0-1)
}

/** Curve configuration for RGB + Luma */
export interface CurveParams {
  master: CurvePoint[];
  r: CurvePoint[];
  g: CurvePoint[];
  b: CurvePoint[];
}

/** 3D LUT data */
export interface LUT3D {
  size: number;           // Cube size (17, 33, 65)
  data: Float32Array;     // Flattened RGBA data (size^3 * 4)
}

/** Complete color grading configuration */
export interface ColorGradeConfig {
  lgg: LGGParams;
  hsl: HSLParams;
  curves: CurveParams;
  lut3d?: LUT3D;
  enabled: boolean;
}

/** Default color grading config (identity/no-op) */
export const DEFAULT_COLOR_GRADE: ColorGradeConfig = {
  enabled: true,
  lgg: {
    lift: { r: 0, g: 0, b: 0, master: 0 },
    gamma: { r: 1, g: 1, b: 1, master: 1 },
    gain: { r: 1, g: 1, b: 1, master: 1 },
  },
  hsl: {
    channels: [
      { hue: 0, saturation: 1, lightness: 0 },   // Red
      { hue: 0, saturation: 1, lightness: 0 },   // Orange
      { hue: 0, saturation: 1, lightness: 0 },   // Yellow
      { hue: 0, saturation: 1, lightness: 0 },   // Green
      { hue: 0, saturation: 1, lightness: 0 },   // Cyan
      { hue: 0, saturation: 1, lightness: 0 },   // Blue
      { hue: 0, saturation: 1, lightness: 0 },   // Purple
      { hue: 0, saturation: 1, lightness: 0 },   // Magenta
    ],
  },
  curves: {
    master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    r: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    g: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
    b: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
  },
  enabled: true,
};

// ============================================================================
// Cubic Spline Interpolation (CPU-side)
// ============================================================================

/**
 * Computes cubic spline coefficients for interpolation.
 * Returns coefficients for each segment: [a, b, c, d] where f(t) = a*t^3 + b*t^2 + c*t + d
 */
export function computeCubicSpline(points: CurvePoint[]): number[][] {
  const n = points.length - 1;
  if (n < 1) return [];

  // Sort points by x
  const sorted = [...points].sort((a, b) => a.x - b.x);
  const x = sorted.map(p => p.x);
  const y = sorted.map(p => p.y);

  // Natural cubic spline: second derivative = 0 at endpoints
  const h = new Array(n);
  for (let i = 0; i < n; i++) h[i] = x[i + 1] - x[i];

  const alpha = new Array(n);
  for (let i = 1; i < n; i++) {
    alpha[i] = (3 / h[i]) * (y[i + 1] - y[i]) - (3 / h[i - 1]) * (y[i] - y[i - 1]);
  }

  // Tridiagonal system
  const l = new Array(n + 1).fill(1);
  const mu = new Array(n + 1).fill(0);
  const z = new Array(n + 1).fill(0);

  for (let i = 1; i < n; i++) {
    l[i] = 2 * (x[i + 1] - x[i - 1]) - h[i - 1] * mu[i - 1];
    mu[i] = h[i] / l[i];
    z[i] = (alpha[i] - h[i - 1] * z[i - 1]) / l[i];
  }

  l[n] = 1;
  z[n] = 0;

  const c = new Array(n + 1).fill(0);
  const b = new Array(n).fill(0);
  const d = new Array(n).fill(0);

  for (let j = n - 1; j >= 0; j--) {
    c[j] = z[j] - mu[j] * c[j + 1];
    b[j] = (y[j + 1] - y[j]) / h[j] - h[j] * (c[j + 1] + 2 * c[j]) / 3;
    d[j] = (c[j + 1] - c[j]) / (3 * h[j]);
  }

  // Return coefficients [a, b, c, d] for each segment
  // f(t) = a*t^3 + b*t^2 + c*t + d where t is normalized to segment [0,1]
  const coeffs: number[][] = [];
  for (let i = 0; i < n; i++) {
    coeffs.push([d[i], c[i], b[i], y[i]]); // Note: d is a, c is b, b is c, y is d in standard form
  }
  return coeffs;
}

/**
 * Evaluates cubic spline at position t (0-1 normalized across entire curve)
 */
export function evaluateSpline(coeffs: number[][], points: CurvePoint[], t: number): number {
  if (coeffs.length === 0) return t;
  if (t <= points[0].x) return points[0].y;
  if (t >= points[points.length - 1].x) return points[points.length - 1].y;

  // Find segment
  const n = points.length - 1;
  let segment = 0;
  for (let i = 0; i < n; i++) {
    if (t >= points[i].x && t <= points[i + 1].x) {
      segment = i;
      break;
    }
  }

  // Normalize t to segment [0,1]
  const x0 = points[segment].x;
  const x1 = points[segment + 1].x;
  const localT = (t - x0) / (x1 - x0);

  const [a, b, c, d] = coeffs[segment];
  return ((a * localT + b) * localT + c) * localT + d;
}

/**
 * Generates 1D texture data (256 texels) from spline curve
 */
export function generateCurveTexture(
  coeffs: number[][],
  points: CurvePoint[],
  size: number = 256
): Float32Array {
  const texture = new Float32Array(size);
  for (let i = 0; i < size; i++) {
    const t = i / (size - 1);
    texture[i] = evaluateSpline(coeffs, points, t);
  }
  return texture;
}

/**
 * Pre-computes spline coefficients for all curve channels
 */
export function prepareCurveTextures(curves: CurveParams, size: number = 256): {
  master: Float32Array;
  r: Float32Array;
  g: Float32Array;
  b: Float32Array;
} {
  const masterCoeffs = computeCubicSpline(curves.master);
  const rCoeffs = computeCubicSpline(curves.r);
  const gCoeffs = computeCubicSpline(curves.g);
  const bCoeffs = computeCubicSpline(curves.b);

  return {
    master: generateCurveTexture(masterCoeffs, curves.master, size),
    r: generateCurveTexture(rCoeffs, curves.r, size),
    g: generateCurveTexture(gCoeffs, curves.g, size),
    b: generateCurveTexture(bCoeffs, curves.b, size),
  };
}

// ============================================================================
// 3D LUT Parser (.cube format)
// ============================================================================

/**
 * Parses .cube file format (Adobe Cube LUT format)
 * Returns LUT3D object with size and flattened RGBA data
 */
export function parseCubeLUT(cubeText: string): LUT3D {
  const lines = cubeText.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));

  let size = 0;
  const data: number[] = [];

  for (const line of lines) {
    if (line.startsWith('LUT_3D_SIZE')) {
      size = parseInt(line.split(' ')[1], 10);
    } else if (line.startsWith('LUT_1D_SIZE')) {
      throw new Error('1D LUT not supported');
    } else {
      // Data line: R G B values (0-1 or 0-255)
      const parts = line.split(/\s+/).map(parseFloat);
      if (parts.length >= 3) {
        // Normalize to 0-1 if values appear to be 0-255
        const maxVal = Math.max(...parts.slice(0, 3));
        const scale = maxVal > 1.0 ? 1 / 255 : 1;
        data.push(parts[0] * scale, parts[1] * scale, parts[2] * scale, 1.0); // RGBA
      }
    }
  }

  if (size === 0) {
    // Infer size from data length
    const voxelCount = data.length / 4;
    size = Math.round(Math.cbrt(voxelCount));
  }

  const expectedVoxels = size * size * size;
  if (data.length !== expectedVoxels * 4) {
    throw new Error(`LUT data size mismatch: expected ${expectedVoxels * 4} values, got ${data.length}`);
  }

  return {
    size,
    data: new Float32Array(data),
  };
}

/**
 * Generates WebGL 2 3D texture from LUT3D
 */
export function createWebGL3DLUT(gl: WebGL2RenderingContext, lut: LUT3D): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_3D, texture);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage3D(
    gl.TEXTURE_3D, 0, gl.RGBA32F, lut.size, lut.size, lut.size, 0,
    gl.RGBA, gl.FLOAT, lut.data
  );
  return texture;
}

/**
 * Generates WGSL code for 3D LUT sampling with trilinear interpolation
 */
export function generateLUT3DWGSL(): string {
  return `
@group(0) @binding(4) var u_lut3d: texture_3d<f32>;
@group(0) @binding(5) var u_lut_sampler: sampler;

fn sampleLUT3D(color: vec3<f32>) -> vec3<f32> {
  return textureSampleLevel(u_lut3d, u_lut_sampler, color, 0.0).rgb;
}
`;
}

// ============================================================================
// LGG (Lift/Gamma/Gain) Shader Generation
// ============================================================================

/**
 * Generates WGSL code for Lift/Gamma/Gain color grading
 * 12 uniforms: Lift R/G/B/Master, Gamma R/G/B/Master, Gain R/G/B/Master
 */
export function generateLGGWGSL(): string {
  return `
@group(0) @binding(0) var<uniform> u_lgg: LGGParams;

struct LGGParams {
  lift_r: f32, lift_g: f32, lift_b: f32, lift_master: f32,
  gamma_r: f32, gamma_g: f32, gamma_b: f32, gamma_master: f32,
  gain_r: f32, gain_g: f32, gain_b: f32, gain_master: f32,
};

fn applyLGG(color: vec3<f32>) -> vec3<f32> {
  var result = color;

  // Lift (shadows) - affects darker values more
  var lift = vec3<f32>(u_lgg.lift_r, u_lgg.lift_g, u_lgg.lift_b) + u_lgg.lift_master;
  result = mix(result, result + lift, 1.0 - result);

  // Gamma (midtones) - power function
  var gamma = vec3<f32>(u_lgg.gamma_r, u_lgg.gamma_g, u_lgg.gamma_b) * u_lgg.gamma_master;
  result = pow(result, vec3<f32>(1.0) / max(gamma, vec3<f32>(0.01)));

  // Gain (highlights) - affects brighter values more
  var gain = vec3<f32>(u_lgg.gain_r, u_lgg.gain_g, u_lgg.gain_b) * u_lgg.gain_master;
  result = result * gain;

  return clamp(result, vec3<f32>(0.0), vec3<f32>(1.0));
}
`;
}

// ============================================================================
// HSL Selective Color Adjustment Shader
// ============================================================================

/**
 * Generates WGSL code for 8-channel HSL selective color adjustment
 * 8 channels: Red, Orange, Yellow, Green, Cyan, Blue, Purple, Magenta
 */
export function generateHSLWGSL(): string {
  return `
@group(0) @binding(1) var<uniform> u_hsl: HSLParams;

struct HSLChannel {
  hue: f32,        // Hue shift in degrees (-180 to 180)
  saturation: f32, // Saturation multiplier (0 to 2+)
  lightness: f32,  // Lightness shift (-1 to 1)
};

struct HSLParams {
  channels: array<HSLChannel, 8>;
};

// Hue ranges for 8 channels (in degrees)
const HUE_CENTERS = array<f32, 8>(
  0.0,    // Red
  30.0,   // Orange
  60.0,   // Yellow
  120.0,  // Green
  180.0,  // Cyan
  240.0,  // Blue
  270.0,  // Purple
  300.0   // Magenta
);

const HUE_WIDTH = 30.0; // degrees

fn rgb2hsv(c: vec3<f32>) -> vec3<f32> {
  var K = vec4<f32>(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  var p = mix(vec4<f32>(c.bg, K.wz), vec4<f32>(c.gb, K.xy), step(c.b, c.g));
  var q = mix(vec4<f32>(p.xyw, c.r), vec4<f32>(c.r, p.yzx), step(p.x, c.r));
  var d = q.x - min(q.w, q.y);
  var e = 1.0e-10;
  return vec3<f32>(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

fn hsv2rgb(c: vec3<f32>) -> vec3<f32> {
  var K = vec4<f32>(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  var p = abs(fract(c.xxx + vec3<f32>(K.x, K.y, K.z)) * 6.0 - K.www);
  return c.z * mix(vec3<f32>(K.x, K.y, K.z), clamp(p - vec3<f32>(K.x, K.y, K.z), 0.0, 1.0), c.y);
}

fn applyHSL(color: vec3<f32>) -> vec3<f32> {
  var hsv = rgb2hsv(color);
  var h = hsv.x * 360.0; // Convert to degrees
  var s = hsv.y;
  var v = hsv.z;

  // Find which channel this hue belongs to
  var channelIndex = 0u;
  var maxWeight = 0.0;
  
  for (var i = 0u; i < 8u; i++) {
    var center = HUE_CENTERS[i];
    var dist = abs(h - center);
    dist = min(dist, 360.0 - dist); // Handle wrap-around
    var weight = smoothstep(HUE_WIDTH, 0.0, dist);
    
    if (weight > maxWeight) {
      maxWeight = weight;
      channelIndex = i;
    }
  }

  // Apply adjustment for the dominant channel
  if (maxWeight > 0.0) {
    var adj = u_hsl.channels[channelIndex];
    
    // Hue shift
    h = h + adj.hue * maxWeight;
    h = h % 360.0;
    if (h < 0.0) h = h + 360.0;
    
    // Saturation adjustment
    s = s * adj.saturation * maxWeight + s * (1.0 - maxWeight);
    
    // Lightness adjustment
    v = v + adj.lightness * maxWeight;
  }

  return hsv2rgb(vec3<f32>(h / 360.0, s, v));
}
`;
}

// ============================================================================
// Curve Texture Uniforms
// ============================================================================

/**
 * Generates WGSL code for curve texture sampling
 */
export function generateCurveWGSL(): string {
  return `
@group(0) @binding(2) var u_curve_master: texture_1d<f32>;
@group(0) @binding(3) var u_curve_r: texture_1d<f32>;
@group(0) @binding(4) var u_curve_g: texture_1d<f32>;
@group(0) @binding(5) var u_curve_b: texture_1d<f32>;
@group(0) @binding(6) var u_curve_sampler: sampler;

fn applyCurves(color: vec3<f32>) -> vec3<f32> {
  var r = textureSample(u_curve_r, u_curve_sampler, color.r).r;
  var g = textureSample(u_curve_g, u_curve_sampler, color.g).r;
  var b = textureSample(u_curve_b, u_curve_sampler, color.b).r;
  var m = textureSample(u_curve_master, u_curve_sampler, (color.r + color.g + color.b) / 3.0).r;
  
  // Apply master curve as overall multiplier
  return vec3<f32>(r * m, g * m, b * m);
}
`;
}

// ============================================================================
// Complete Color Grading Shader
// ============================================================================

/**
 * Generates complete fragment shader for color grading pipeline
 * Pipeline: Base texture → LGG → HSL → Curves → 3D LUT → Output
 */
export function generateColorGradeWGSL(): string {
  return `
${generateLGGWGSL()}
${generateHSLWGSL()}
${generateCurveWGSL()}
${generateLUT3DWGSL()}

@group(0) @binding(0) var<uniform> u_params: ColorGradeParams;

struct ColorGradeParams {
  lgg_enabled: u32,
  hsl_enabled: u32,
  curves_enabled: u32,
  lut3d_enabled: u32,
  opacity: f32,
};

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>, @location(0) uv: vec2<f32>) -> @location(0) vec4<f32> {
  var color = textureSample(u_texture, u_sampler, uv).rgb;
  
  // LGG (Lift/Gamma/Gain)
  if (u_params.lgg_enabled == 1u) {
    color = applyLGG(color);
  }
  
  // HSL Selective Color
  if (u_params.hsl_enabled == 1u) {
    color = applyHSL(color);
  }
  
  // Curves
  if (u_params.curves_enabled == 1u) {
    color = applyCurves(color);
  }
  
  // 3D LUT
  if (u_params.lut3d_enabled == 1u) {
    color = sampleLUT3D(color);
  }
  
  var alpha = textureSample(u_texture, u_sampler, uv).a * u_params.opacity;
  return vec4<f32>(color, alpha);
}
`;
}

// ============================================================================
// WebGL 2 Fragment Shader (GLSL)
// ============================================================================

/**
 * Generates GLSL fragment shader for WebGL 2 color grading
 */
export function generateColorGradeGLSL(): string {
  return `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform sampler2D u_curve_master;
uniform sampler2D u_curve_r;
uniform sampler2D u_curve_g;
uniform sampler2D u_curve_b;
uniform sampler3D u_lut3d;

uniform int u_lgg_enabled;
uniform int u_hsl_enabled;
uniform int u_curves_enabled;
uniform int u_lut3d_enabled;
uniform float u_opacity;

// LGG uniforms
uniform vec4 u_lift;      // r, g, b, master
uniform vec4 u_gamma;     // r, g, b, master
uniform vec4 u_gain;      // r, g, b, master

// HSL uniforms
uniform vec3 u_hsl_hue[8];
uniform vec3 u_hsl_saturation[8];
uniform vec3 u_hsl_lightness[8];

// Curve textures
uniform sampler2D u_curve_master;
uniform sampler2D u_curve_r;
uniform sampler2D u_curve_g;
uniform sampler2D u_curve_b;
uniform sampler3D u_lut3d;

in vec2 v_texCoord;
out vec4 fragColor;

// Utility functions
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0/3.0, 2.0/3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0/3.0, 1.0/3.0, 3.0);
  vec3 p = abs(fract(c.xxx + vec3(K.x, K.y, K.z)) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float luma(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

vec3 setLuma(vec3 color, float l) {
  float currentLuma = luma(color);
  return color * (l / (currentLuma + 0.0001));
}

float saturation(vec3 color) {
  return max(max(color.r, color.g), color.b) - min(min(color.r, color.g), color.b);
}

vec3 setSaturation(vec3 color, float s) {
  float currentSat = saturation(color);
  return mix(vec3(luma(color)), color, s / (currentSat + 0.0001));
}

// LGG
vec3 applyLGG(vec3 color) {
  vec3 result = color;
  
  // Lift
  vec3 lift = u_lift.rgb + u_lift.a;
  result = mix(result, result + lift, 1.0 - result);
  
  // Gamma
  vec3 gamma = u_gamma.rgb * u_gamma.a;
  result = pow(result, vec3(1.0) / max(gamma, vec3(0.01)));
  
  // Gain
  vec3 gain = u_gain.rgb * u_gain.a;
  result = result * gain;
  
  return clamp(result, 0.0, 1.0);
}

// HSL
vec3 applyHSL(vec3 color) {
  vec3 hsv = rgb2hsv(color);
  float h = hsv.x * 360.0;
  float s = hsv.y;
  float v = hsv.z;
  
  // 8 channel centers
  float centers[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 270.0, 300.0);
  float width = 30.0;
  
  int channel = 0;
  float maxWeight = 0.0;
  
  for (int i = 0; i < 8; i++) {
    float dist = abs(h - centers[i]);
    dist = min(dist, 360.0 - dist);
    float weight = smoothstep(width, 0.0, dist);
    
    if (weight > maxWeight) {
      maxWeight = weight;
      channel = i;
    }
  }
  
  if (maxWeight > 0.0) {
    // Apply adjustments - simplified for GLSL
    // In real implementation, these would be uniform arrays
  }
  
  return hsv2rgb(vec3(h / 360.0, s, v));
}

// Curves
vec3 applyCurves(vec3 color) {
  float r = texture(u_curve_r, vec2(color.r, 0.5)).r;
  float g = texture(u_curve_g, vec2(color.g, 0.5)).r;
  float b = texture(u_curve_b, vec2(color.b, 0.5)).r;
  float m = texture(u_curve_master, vec2((color.r + color.g + color.b) / 3.0, 0.5)).r;
  
  return vec3(r * m, g * m, b * m);
}

// 3D LUT
vec3 applyLUT(vec3 color) {
  return texture(u_lut3d, color).rgb;
}

void main() {
  vec3 color = texture(u_texture, v_texCoord).rgb;
  float alpha = texture(u_texture, v_texCoord).a;
  
  // Apply color grading pipeline
  if (1 == 1) color = applyLGG(color);      // LGG always enabled for testing
  if (1 == 1) color = applyHSL(color);      // HSL
  if (1 == 1) color = applyCurves(color);   // Curves
  if (1 == 1) color = applyLUT(color);      // 3D LUT
  
  fragColor = vec4(color, u_opacity);
}
`;
}

