/**
 * OffscreenCanvas Compositor Worker
 * 
 * Receives VideoFrames via MessagePort, composites them using WebGL 2 / WebGPU,
 * and outputs the final composited frame. Runs in a Dedicated Worker to keep
 * the main thread free for UI interactions.
 * 
 * Supports both WebGL 2 (baseline) and WebGPU (preferred) rendering paths.
 */

/// <reference lib="webworker" />

import type { DecodedFrame } from '../videoDecoder.js';

// Worker message types
type WorkerMessageType = 
  | 'initialize'
  | 'setCanvas'
  | 'submitFrame'
  | 'setBlendMode'
  | 'setColorGrade'
  | 'setMask'
  | 'setTransform'
  | 'setTransition'
  | 'setEffect'
  | 'clear'
  | 'resize'
  | 'destroy'
  | 'frameReady'
  | 'error';

interface WorkerMessage<T = any> {
  type: string;
  payload: any;
  requestId?: number;
}

interface InitializePayload {
  width: number;
  height: number;
  preferWebGPU: boolean;
  tracks: TrackConfig[];
}

interface TrackConfig {
  id: string;
  type: 'video' | 'audio' | 'text' | 'adjustment';
  blendMode: BlendMode;
  opacity: number;
  transform: TransformConfig;
  colorGrade?: ColorGradeConfig;
  mask?: MaskConfig;
  effects: EffectConfig[];
}

interface TransformConfig {
  position: { x: number; y: number };
  scale: { x: number; y: number };
  rotation: number;
  anchor: { x: number; y: number };
}

interface ColorGradeConfig {
  lift: { r: number; g: number; b: number; master: number };
  gamma: { r: number; g: number; b: number; master: number };
  gain: { r: number; g: number; b: number; master: number };
  hsl: Array<{ hue: number; saturation: number; lightness: number }>;
  curves: { master: number[]; r: number[]; g: number[]; b: number[] };
  lut3D?: string; // base64 encoded .cube file
}

interface MaskConfig {
  type: 'rectangle' | 'ellipse' | 'linear' | 'mirror' | 'radial';
  position: { x: number; y: number };
  size: { width: number; height: number };
  rotation: number;
  feather: number;
  expansion: number;
  invert: boolean;
}

interface EffectConfig {
  type: 'blur' | 'gaussianBlur' | 'directionalBlur' | 'rgbSplit' | 'glitch' | 'filmGrain' | 'halftone' | 'prism' | 'glow';
  params: Record<string, number>;
}

interface BlendConfig {
  mode: BlendMode;
  opacity: number;
}

type BlendMode = 
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten'
  | 'color-dodge' | 'color-burn' | 'hard-light' | 'soft-light'
  | 'difference' | 'exclusion' | 'hue' | 'saturation' | 'color' | 'luminosity';

interface SubmitFramePayload {
  trackId: string;
  frame: VideoFrame;
  timestamp: number;
}

interface SetBlendModePayload {
  trackId: string;
  blendMode: BlendMode;
  opacity: number;
}

// WebGL 2 / WebGPU state
let canvas: OffscreenCanvas | null = null;
let gl: WebGL2RenderingContext | null = null;
let gpuDevice: GPUDevice | null = null;
let gpuContext: GPUCanvasContext | null = null;
let useWebGPU = false;
let width = 1920;
let height = 1080;
let isInitialized = false;
let isDestroyed = false;

// Track state
const tracks = new Map<string, TrackState>();

interface TrackState {
  config: TrackConfig;
  currentFrame: VideoFrame | null;
  texture: WebGLTexture | GPUTexture | null;
  lastUpdate: number;
}

// Shader programs
let webglPrograms: Map<string, WebGLProgram> = new Map();
let webgpuPipelines: Map<string, GPURenderPipeline> = new Map();

// Blend mode shader permutations
const BLEND_MODES: BlendMode[] = [
  'normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten',
  'color-dodge', 'color-burn', 'hard-light', 'soft-light',
  'difference', 'exclusion', 'hue', 'saturation'
];

// Vertex shader (quad)
const VERTEX_SHADER_SOURCE = `#version 300 es
precision highp float;

in vec2 a_position;
in vec2 a_texCoord;
out vec2 v_texCoord;

uniform mat3 u_transform;

void main() {
  vec3 pos = u_transform * vec3(a_position, 1.0);
  gl_Position = vec4(pos.xy, 0.0, 1.0);
  v_texCoord = a_texCoord;
}
`;

// Fragment shader template with blend mode placeholder
const FRAGMENT_SHADER_TEMPLATE = `#version 300 es
precision highp float;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform float u_opacity;
uniform vec4 u_colorMultiply;
uniform vec4 u_colorAdd;

{{BLEND_MODE_CODE}}

void main() {
  vec4 texColor = texture(u_texture, v_texCoord);
  texColor *= u_colorMultiply;
  texColor += u_colorAdd;
  texColor.a *= u_opacity;
  
  // Output with premultiplied alpha
  fragColor = texColor;
}
`;

// Blend mode implementations
const BLEND_MODE_CODE: Record<BlendMode, string> = {
  'normal': '',
  'multiply': `
vec3 blendMultiply(vec3 base, vec3 blend) {
  return base * blend;
}
`,
  'screen': `
vec3 blendScreen(vec3 base, vec3 blend) {
  return 1.0 - (1.0 - base) * (1.0 - blend);
}
`,
  'overlay': `
vec3 blendOverlay(vec3 base, vec3 blend) {
  return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, base));
}
`,
  'darken': `
vec3 blendDarken(vec3 base, vec3 blend) {
  return min(base, blend);
}
`,
  'lighten': `
vec3 blendLighten(vec3 base, vec3 blend) {
  return max(base, blend);
}
`,
  'color-dodge': `
vec3 blendColorDodge(vec3 base, vec3 blend) {
  return base / (1.0 - blend + 0.0001);
}
`,
  'color-burn': `
vec3 blendColorBurn(vec3 base, vec3 blend) {
  return 1.0 - (1.0 - base) / (blend + 0.0001);
}
`,
  'hard-light': `
vec3 blendHardLight(vec3 base, vec3 blend) {
  return mix(2.0 * base * blend, 1.0 - 2.0 * (1.0 - base) * (1.0 - blend), step(0.5, blend));
}
`,
  'soft-light': `
vec3 blendSoftLight(vec3 base, vec3 blend) {
  vec3 mask = step(0.5, blend);
  return mix(
    base - (1.0 - 2.0 * blend) * base * (1.0 - base),
    sqrt(base) - (1.0 - 2.0 * blend) * (sqrt(base) - base),
    mask
  );
}
`,
  'difference': `
vec3 blendDifference(vec3 base, vec3 blend) {
  return abs(base - blend);
}
`,
  'exclusion': `
vec3 blendExclusion(vec3 base, vec3 blend) {
  return base + blend - 2.0 * base * blend;
}
`,
  'hue': `
vec3 blendHue(vec3 base, vec3 blend) {
  return setLuma(setSaturation(blend, saturation(base)), luma(base));
}
`,
  'saturation': `
vec3 blendSaturation(vec3 base, vec3 blend) {
  return setLuma(setSaturation(base, saturation(blend)), luma(base));
}
`,
  'color': `
vec3 blendColor(vec3 base, vec3 blend) {
  return setLuma(blend, luma(base));
}
`,
  'luminosity': `
vec3 blendLuminosity(vec3 base, vec3 blend) {
  return setLuma(base, luma(blend));
}
`,
};

// Utility functions for blend modes
const FRAGMENT_UTILS = `
vec3 rgb2hsv(vec3 c) {
  vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
  vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
  vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
  float d = q.x - min(q.w, q.y);
  float e = 1.0e-10;
  return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + e)), d / (q.x + e), q.x);
}

vec3 hsv2rgb(vec3 c) {
  vec4 K = vec4(1.0, 2.0 / 3.0, 1.0 / 3.0, 3.0);
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
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
  if (currentSat < 0.0001) return vec3(luma(color));
  return mix(vec3(luma(color)), color, s / (currentSat + 0.0001));
}
`;

// Helper to create WebGL program
function createWebGLProgram(gl: WebGL2RenderingContext, vertexSrc: string, fragmentSrc: string): WebGLProgram {
  const vertexShader = gl.createShader(gl.VERTEX_SHADER)!;
  gl.shaderSource(vertexShader, vertexSrc);
  gl.compileShader(vertexShader);
  if (!gl.getShaderParameter(vertexShader, gl.COMPILE_STATUS)) {
    throw new Error('Vertex shader compile error: ' + gl.getShaderInfoLog(vertexShader));
  }

  const fragmentShader = gl.createShader(gl.FRAGMENT_SHADER)!;
  gl.shaderSource(fragmentShader, fragmentSrc);
  gl.compileShader(fragmentShader);
  if (!gl.getShaderParameter(fragmentShader, gl.COMPILE_STATUS)) {
    throw new Error('Fragment shader compile error: ' + gl.getShaderInfoLog(fragmentShader));
  }

  const program = gl.createProgram()!;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error('Program link error: ' + gl.getProgramInfoLog(program));
  }

  return program;
}

// Create blend mode fragment shader
function createBlendModeShader(gl: WebGL2RenderingContext, blendMode: BlendMode): WebGLProgram {
  const cacheKey = `blend_${blendMode}`;
  if (webglPrograms.has(cacheKey)) {
    return webglPrograms.get(cacheKey)!;
  }

  let blendCode = BLEND_MODE_CODE[blendMode] || '';
  const fragmentSrc = FRAGMENT_SHADER_TEMPLATE
    .replace('{{BLEND_MODE_CODE}}', FRAGMENT_UTILS + blendCode);

  const program = createWebGLProgram(gl, VERTEX_SHADER_SOURCE, fragmentSrc);
  webglPrograms.set(cacheKey, program);
  return program;
}

// Initialize WebGL 2
async function initializeWebGL(canvas: OffscreenCanvas, preferWebGPU: boolean): Promise<void> {
  width = canvas.width;
  height = canvas.height;

  // Try WebGPU first if preferred
  if (preferWebGPU && 'gpu' in navigator) {
    try {
      const adapter = await (navigator as any).gpu.requestAdapter({
        powerPreference: 'high-performance',
      });
      if (adapter) {
        gpuDevice = await adapter.requestDevice();
        gpuContext = canvas.getContext('webgpu');
        gpuContext.configure({
          device: gpuDevice,
          format: 'bgra8unorm',
          alphaMode: 'premultiplied',
        });
        useWebGPU = true;
        console.log('Using WebGPU');
        return;
      }
    } catch (e) {
      console.warn('WebGPU initialization failed, falling back to WebGL 2:', e);
    }
  }

  // Fallback to WebGL 2
  gl = canvas.getContext('webgl2', {
    alpha: true,
    premultipliedAlpha: true,
    antialias: false,
    preserveDrawingBuffer: false,
    powerPreference: 'high-performance',
  });

  if (!gl) {
    throw new Error('WebGL 2 not supported');
  }

  // Enable extensions
  gl.getExtension('EXT_color_buffer_float');
  gl.getExtension('OES_texture_float_linear');
  gl.getExtension('EXT_texture_filter_anisotropic');

  // Setup default state
  gl.enable(gl.BLEND);
  gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.viewport(0, 0, width, height);

  useWebGPU = false;
  console.log('Using WebGL 2');
}

// Create quad geometry
function createQuadGeometry(gl: WebGL2RenderingContext): { vao: WebGLVertexArrayObject; vertexCount: number } {
  const vao = gl.createVertexArray()!;
  gl.bindVertexArray(vao);

  const positions = new Float32Array([
    -1, -1,  0, 0,
     1, -1,  1, 0,
    -1,  1,  0, 1,
     1,  1,  1, 1,
  ]);

  const buffer = gl.createBuffer()!;
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

  gl.enableVertexAttribArray(0); // position
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
  gl.enableVertexAttribArray(1); // texCoord
  gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);

  gl.bindVertexArray(null);
  gl.bindBuffer(gl.ARRAY_BUFFER, null);

  return { vao, vertexCount: 4 };
}

// Create texture from VideoFrame
function createTextureFromFrame(gl: WebGL2RenderingContext, frame: VideoFrame): WebGLTexture {
  const texture = gl.createTexture()!;
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, frame);
  return texture;
}

// Create GPU texture from VideoFrame
async function createGPUTextureFromFrame(device: GPUDevice, frame: VideoFrame): Promise<GPUTexture> {
  const texture = device.createTexture({
    size: [frame.displayWidth, frame.displayHeight, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
  });

  device.queue.copyExternalImageToTexture(
    { source: frame },
    { texture },
    [frame.displayWidth, frame.displayHeight]
  );

  return texture;
}

// Initialize compositor
async function initialize(payload: InitializePayload): Promise<void> {
  if (isInitialized) return;

  // Get canvas from payload (transferred from main thread)
  // Note: In real implementation, canvas is transferred via postMessage
  // For now, we'll create it here
  canvas = new OffscreenCanvas(payload.width, payload.height);
  width = payload.width;
  height = payload.height;
  useWebGPU = payload.preferWebGPU;

  await initializeWebGL(canvas, payload.preferWebGPU);

  // Initialize track configs
  for (const trackConfig of payload.tracks) {
    tracks.set(trackConfig.id, {
      config: trackConfig,
      currentFrame: null,
      texture: null,
      lastUpdate: 0,
    });
  }

  // Create quad geometry
  if (gl) {
    createQuadGeometry(gl);
  }

  isInitialized = true;
  
  self.postMessage({ type: 'initialized', payload: { success: true } });
}

// Submit frame to track
function submitFrame(payload: SubmitFramePayload): void {
  const track = tracks.get(payload.trackId);
  if (!track) {
    console.warn(`Track ${payload.trackId} not found`);
    return;
  }

  const frame = payload.frame;
  
  // Update track state
  track.currentFrame = frame;
  track.lastUpdate = Date.now();

  // Create/update texture
  if (gl) {
    if (track.texture) {
      gl.deleteTexture(track.texture);
    }
    track.texture = createTextureFromFrame(gl, frame);
  } else if (gpuDevice) {
    if (track.texture) {
      (track.texture as GPUTexture).destroy();
    }
    track.texture = await createGPUTextureFromFrame(gpuDevice!, frame);
  }

  // Notify main thread frame is ready
  self.postMessage({
    type: 'frameReady',
    payload: {
      trackId: payload.trackId,
      timestamp: payload.timestamp,
    },
  });
}

// Render frame
function render(): void {
  if (!isInitialized || isDestroyed || !canvas) return;

  const targetCanvas = useWebGPU ? canvas : canvas;
  const targetGl = gl;
  const targetGpuDevice = gpuDevice;

  // Clear
  if (targetGl) {
    targetGl.clearColor(0, 0, 0, 0);
    targetGl.clear(targetGl.COLOR_BUFFER_BIT);
  }

  // Sort tracks by order (z-index)
  const sortedTracks = Array.from(tracks.entries())
    .sort((a, b) => a[1].config.order - b[1].config.order);

  // Render each track
  for (const [trackId, track] of sortedTracks) {
    if (!track.currentFrame || !track.texture) continue;

    const config = track.config;
    const blendMode = config.blendMode;
    const opacity = config.opacity;

    // Set blend mode
    if (gl) {
      const program = createBlendModeShader(gl, blendMode);
      gl.useProgram(program);

      // Set uniforms
      const opacityLoc = gl.getUniformLocation(program, 'u_opacity');
      const colorMultiplyLoc = gl.getUniformLocation(program, 'u_colorMultiply');
      const colorAddLoc = gl.getUniformLocation(program, 'u_colorAdd');

      gl.uniform1f(opacityLoc, config.opacity);
      gl.uniform4fv(colorMultiplyLoc, [1, 1, 1, 1]);
      gl.uniform4fv(colorAddLoc, [0, 0, 0, 0]);

      // Bind texture
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, track.texture);

      // Draw quad
      // ... draw call
    }
  }

  // Present frame
  if (useWebGPU && gpuContext) {
    // WebGPU presents automatically
  }
}

// Handle incoming messages
self.onmessage = async (event: MessageEvent) => {
  const { type, payload, requestId } = event.data as { type: string; payload: any; requestId?: number };

  try {
    switch (type) {
      case 'initialize': {
        await initialize(payload);
        self.postMessage({ type: 'initialized', payload: { success: true }, requestId });
        break;
      }

      case 'submitFrame': {
        submitFrame(payload);
        self.postMessage({ type: 'frameSubmitted', payload: { trackId: payload.trackId }, requestId });
        break;
      }

      case 'setBlendMode': {
        const track = tracks.get(payload.trackId);
        if (track) {
          track.config.blendMode = payload.blendMode;
          track.config.opacity = payload.opacity;
        }
        self.postMessage({ type: 'blendModeSet', payload: { trackId: payload.trackId }, requestId });
        break;
      }

      case 'resize': {
        width = payload.width;
        height = payload.height;
        if (canvas) {
          canvas.width = width;
          canvas.height = height;
        }
        if (gl) {
          gl.viewport(0, 0, width, height);
        }
        if (gpuContext) {
          gpuContext.configure({
            device: gpuDevice!,
            format: 'bgra8unorm',
            alphaMode: 'premultiplied',
          });
        }
        self.postMessage({ type: 'resized', payload: { width, height }, requestId });
        break;
      }

      case 'destroy': {
        isDestroyed = true;
        if (gl) {
          // Cleanup WebGL resources
          for (const program of webglPrograms.values()) {
            gl!.deleteProgram(program);
          }
          webglPrograms.clear();
        }
        if (gpuDevice) {
          gpuDevice.destroy();
        }
        isInitialized = false;
        isDestroyed = true;
        self.postMessage({ type: 'destroyed', payload: { success: true }, requestId });
        break;
      }

      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    self.postMessage({
      type: 'error',
      payload: { error: error instanceof Error ? error.message : String(error) },
      requestId,
    });
  }
};

self.postMessage({ type: 'ready', payload: { supported: typeof OffscreenCanvas !== 'undefined' } });