/**
 * CuttingBoard WebGL 2 High-Performance Compositor Engine
 *
 * Implements GPU-accelerated layer compositing, 2D affine transforms,
 * 14 blend modes, 3-way Lift/Gamma/Gain color grading, 8-channel HSL,
 * cubic spline curves, 3D LUTs, alpha masking, and post-processing VFX.
 */

import {
  prepareCurveTextures,
  createWebGL3DLUT,
  type ColorGradeConfig,
  type CurveParams,
  type LUT3D,
  DEFAULT_COLOR_GRADE,
} from './colorGrading.js';
import type { Segment, BlendMode } from '../timeline/segment.js';
import type { Track } from '../timeline/track.js';

export interface LayerRenderParams {
  source: VideoFrame | ImageBitmap | HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
  width: number;
  height: number;
  transform: {
    position: { x: number; y: number };
    scale: { x: number; y: number };
    rotation: number; // radians
    anchor: { x: number; y: number };
    opacity: number;
    blendMode: BlendMode;
  };
  crop?: { top: number; bottom: number; left: number; right: number };
  colorGrade?: Partial<ColorGradeConfig>;
  mask?: {
    type: 'none' | 'rectangle' | 'radial' | 'linear';
    feather: number;
    invert: boolean;
    center: { x: number; y: number };
    size: { x: number; y: number };
  };
  adjustments?: {
    brightness: number;  // 100 = neutral
    contrast: number;    // 100 = neutral
    saturation: number;  // 100 = neutral
    temperature?: number; // 0 = neutral, -100 to +100
    tint?: number;        // 0 = neutral, -100 to +100
    hue: number;         // degrees
    blur: number;        // pixels
    vignette?: number;   // 0 to 1
  };
  filterEffect?: 'none' | 'grayscale' | 'sepia' | 'invert' | 'filmGrain' | 'rgbSplit';
}

const VERTEX_SHADER_SRC = `#version 300 es
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

const FRAGMENT_UTILS = `
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
  vec3 p = abs(fract(c.xxx + K.xyz) * 6.0 - K.www);
  return c.z * mix(K.xxx, clamp(p - K.xxx, 0.0, 1.0), c.y);
}

float getLuma(vec3 c) {
  return dot(c, vec3(0.2126, 0.7152, 0.0722));
}

vec3 setLuma(vec3 color, float l) {
  float current = getLuma(color);
  return color * (l / (current + 0.0001));
}

float getSat(vec3 c) {
  return max(max(c.r, c.g), c.b) - min(min(c.r, c.g), c.b);
}

vec3 setSat(vec3 color, float s) {
  float current = getSat(color);
  if (current < 0.0001) return vec3(getLuma(color));
  return mix(vec3(getLuma(color)), color, s / (current + 0.0001));
}
`;

function buildFragmentShaderSrc(blendMode: BlendMode = 'normal'): string {
  let blendCalc = 'baseColor';
  if (blendMode === 'multiply') blendCalc = 'dstColor.rgb * srcColor.rgb';
  else if (blendMode === 'screen') blendCalc = '1.0 - (1.0 - dstColor.rgb) * (1.0 - srcColor.rgb)';
  else if (blendMode === 'overlay') {
    blendCalc = 'mix(2.0 * dstColor.rgb * srcColor.rgb, 1.0 - 2.0 * (1.0 - dstColor.rgb) * (1.0 - srcColor.rgb), step(0.5, dstColor.rgb))';
  } else if (blendMode === 'darken') blendCalc = 'min(dstColor.rgb, srcColor.rgb)';
  else if (blendMode === 'lighten') blendCalc = 'max(dstColor.rgb, srcColor.rgb)';
  else if (blendMode === 'color-dodge') blendCalc = 'clamp(dstColor.rgb / (1.0 - srcColor.rgb + 0.0001), 0.0, 1.0)';
  else if (blendMode === 'color-burn') blendCalc = 'clamp(1.0 - (1.0 - dstColor.rgb) / (srcColor.rgb + 0.0001), 0.0, 1.0)';
  else if (blendMode === 'hard-light') {
    blendCalc = 'mix(2.0 * dstColor.rgb * srcColor.rgb, 1.0 - 2.0 * (1.0 - dstColor.rgb) * (1.0 - srcColor.rgb), step(0.5, srcColor.rgb))';
  } else if (blendMode === 'soft-light') {
    blendCalc = 'mix(dstColor.rgb - (1.0 - 2.0 * srcColor.rgb) * dstColor.rgb * (1.0 - dstColor.rgb), sqrt(dstColor.rgb) - (1.0 - 2.0 * srcColor.rgb) * (sqrt(dstColor.rgb) - dstColor.rgb), step(0.5, srcColor.rgb))';
  } else if (blendMode === 'difference') blendCalc = 'abs(dstColor.rgb - srcColor.rgb)';
  else if (blendMode === 'exclusion') blendCalc = 'dstColor.rgb + srcColor.rgb - 2.0 * dstColor.rgb * srcColor.rgb';
  else if (blendMode === 'hue') blendCalc = 'setLuma(setSat(srcColor.rgb, getSat(dstColor.rgb)), getLuma(dstColor.rgb))';
  else if (blendMode === 'saturation') blendCalc = 'setLuma(setSat(dstColor.rgb, getSat(srcColor.rgb)), getLuma(dstColor.rgb))';
  else if (blendMode === 'color') blendCalc = 'setLuma(srcColor.rgb, getLuma(dstColor.rgb))';
  else if (blendMode === 'luminosity') blendCalc = 'setLuma(dstColor.rgb, getLuma(srcColor.rgb))';
  else blendCalc = 'srcColor.rgb';

  return `#version 300 es
precision highp float;
precision highp sampler3D;

in vec2 v_texCoord;
out vec4 fragColor;

uniform sampler2D u_texture;
uniform sampler2D u_backdrop;
uniform int u_has_backdrop;

// Color grading textures
uniform sampler2D u_curve_master;
uniform sampler2D u_curve_r;
uniform sampler2D u_curve_g;
uniform sampler2D u_curve_b;
uniform sampler3D u_lut3d;

// Control flags
uniform int u_lgg_enabled;
uniform int u_hsl_enabled;
uniform int u_curves_enabled;
uniform int u_lut3d_enabled;
uniform float u_opacity;

// 12 LGG uniforms
uniform float u_lift_r;
uniform float u_lift_g;
uniform float u_lift_b;
uniform float u_lift_master;

uniform float u_gamma_r;
uniform float u_gamma_g;
uniform float u_gamma_b;
uniform float u_gamma_master;

uniform float u_gain_r;
uniform float u_gain_g;
uniform float u_gain_b;
uniform float u_gain_master;

// 8-channel HSL
uniform vec3 u_hsl_hue[8];
uniform vec3 u_hsl_saturation[8];
uniform vec3 u_hsl_lightness[8];

// Crop
uniform vec4 u_crop; // top, bottom, left, right in percent 0-100

// Adjustments
uniform float u_brightness;  // 1.0 = normal
uniform float u_contrast;    // 1.0 = normal
uniform float u_saturation;  // 1.0 = normal
uniform float u_temperature; // -1 to 1
uniform float u_tint;        // -1 to 1
uniform float u_hue;         // degrees
uniform int u_effect;        // 0=none, 1=grayscale, 2=sepia, 3=invert, 4=filmGrain, 5=rgbSplit

// Mask
uniform int u_mask_type;     // 0=none, 1=rectangle, 2=radial, 3=linear
uniform float u_mask_feather;
uniform int u_mask_invert;
uniform vec2 u_mask_center;
uniform vec2 u_mask_size;

${FRAGMENT_UTILS}

void main() {
  vec2 uv = v_texCoord;

  // Crop check
  float cTop = u_crop.x / 100.0;
  float cBottom = 1.0 - (u_crop.y / 100.0);
  float cLeft = u_crop.z / 100.0;
  float cRight = 1.0 - (u_crop.w / 100.0);

  if (uv.x < cLeft || uv.x > cRight || uv.y < cTop || uv.y > cBottom) {
    fragColor = vec4(0.0);
    return;
  }

  // Remap uv inside crop
  vec2 sampleUV = vec2(
    (uv.x - cLeft) / max(0.0001, cRight - cLeft),
    (uv.y - cTop) / max(0.0001, cBottom - cTop)
  );

  vec4 srcColor;
  if (u_effect == 5) {
    // RGB Split effect
    float r = texture(u_texture, sampleUV + vec2(0.006, 0.0)).r;
    float g = texture(u_texture, sampleUV).g;
    float b = texture(u_texture, sampleUV - vec2(0.006, 0.0)).b;
    float a = texture(u_texture, sampleUV).a;
    srcColor = vec4(r, g, b, a);
  } else {
    srcColor = texture(u_texture, sampleUV);
  }

  vec3 col = srcColor.rgb;
  float alpha = srcColor.a * u_opacity;

  // 1. Lift / Gamma / Gain
  if (u_lgg_enabled == 1) {
    vec3 lift = (vec3(u_lift_r, u_lift_g, u_lift_b) + vec3(u_lift_master)) * 0.5;
    col = mix(col, col + lift, 1.0 - col);

    vec3 gamma = (vec3(u_gamma_r, u_gamma_g, u_gamma_b) + vec3(u_gamma_master));
    gamma = max(gamma, vec3(0.05));
    col = pow(max(col, vec3(0.0)), vec3(1.0) / gamma);

    vec3 gain = (vec3(u_gain_r, u_gain_g, u_gain_b) + vec3(u_gain_master));
    col = col * gain;
    col = clamp(col, 0.0, 1.0);
  }

  // 2. 8-Channel HSL
  if (u_hsl_enabled == 1) {
    vec3 hsv = rgb2hsv(col);
    float h = hsv.x * 360.0;
    float centers[8] = float[8](0.0, 30.0, 60.0, 120.0, 180.0, 240.0, 270.0, 300.0);
    float width = 30.0;

    for (int i = 0; i < 8; i++) {
      float dist = abs(h - centers[i]);
      dist = min(dist, 360.0 - dist);
      float weight = smoothstep(width, 0.0, dist);
      if (weight > 0.0) {
        hsv.x += (u_hsl_hue[i].x / 360.0) * weight;
        hsv.y = clamp(hsv.y + (u_hsl_saturation[i].y / 100.0) * weight, 0.0, 1.0);
        hsv.z = clamp(hsv.z + (u_hsl_lightness[i].z / 100.0) * weight, 0.0, 1.0);
      }
    }
    col = hsv2rgb(vec3(fract(hsv.x), hsv.y, hsv.z));
  }

  // 3. Spline Curves
  if (u_curves_enabled == 1) {
    float r = texture(u_curve_r, vec2(col.r, 0.5)).r;
    float g = texture(u_curve_g, vec2(col.g, 0.5)).r;
    float b = texture(u_curve_b, vec2(col.b, 0.5)).r;
    float lum = getLuma(vec3(r, g, b));
    float m = texture(u_curve_master, vec2(lum, 0.5)).r;
    col = clamp(vec3(r, g, b) * (m / max(lum, 0.0001)), 0.0, 1.0);
  }

  // 4. 3D LUT
  if (u_lut3d_enabled == 1) {
    col = texture(u_lut3d, col).rgb;
  }

  // 5. Basic Adjustments
  if (u_brightness != 1.0) col *= u_brightness;
  if (u_contrast != 1.0) col = ((col - 0.5) * u_contrast) + 0.5;
  if (u_saturation != 1.0) {
    float lum = getLuma(col);
    col = mix(vec3(lum), col, u_saturation);
  }
  if (u_temperature != 0.0 || u_tint != 0.0) {
    col.r += u_temperature * 0.1;
    col.b -= u_temperature * 0.1;
    col.g += u_tint * 0.08;
  }
  if (u_hue != 0.0) {
    vec3 hsv = rgb2hsv(col);
    hsv.x = fract(hsv.x + u_hue / 360.0);
    col = hsv2rgb(hsv);
  }

  // 6. Stylize Filter Effects
  if (u_effect == 1) {
    // Grayscale
    col = vec3(getLuma(col));
  } else if (u_effect == 2) {
    // Sepia
    col = vec3(
      dot(col, vec3(0.393, 0.769, 0.189)),
      dot(col, vec3(0.349, 0.686, 0.168)),
      dot(col, vec3(0.272, 0.534, 0.131))
    );
  } else if (u_effect == 3) {
    // Invert
    col = 1.0 - col;
  } else if (u_effect == 4) {
    // Film Grain
    float noise = (fract(sin(dot(uv, vec2(12.9898, 78.233))) * 43758.5453) - 0.5) * 0.12;
    col = clamp(col + noise, 0.0, 1.0);
  }

  // 7. Mask
  if (u_mask_type > 0) {
    float maskVal = 1.0;
    vec2 p = uv - u_mask_center;
    if (u_mask_type == 1) {
      // Rectangle mask
      vec2 d = abs(p) - u_mask_size * 0.5;
      float dist = max(d.x, d.y);
      maskVal = 1.0 - smoothstep(0.0, max(0.001, u_mask_feather), dist);
    } else if (u_mask_type == 2) {
      // Radial / Ellipse mask
      vec2 scaled = p / max(vec2(0.0001), u_mask_size);
      float dist = length(scaled);
      maskVal = 1.0 - smoothstep(1.0 - u_mask_feather, 1.0, dist);
    } else if (u_mask_type == 3) {
      // Linear mask
      maskVal = smoothstep(-u_mask_feather * 0.5, u_mask_feather * 0.5, p.y);
    }
    if (u_mask_invert == 1) maskVal = 1.0 - maskVal;
    alpha *= clamp(maskVal, 0.0, 1.0);
  }

  col = clamp(col, 0.0, 1.0);

  // 8. Blend with backdrop
  if (u_has_backdrop == 1) {
    vec4 dstColor = texture(u_backdrop, uv);
    vec3 blended = ${blendCalc};
    // Standard porter-duff over
    fragColor = vec4(blended * alpha + dstColor.rgb * (1.0 - alpha), dstColor.a + alpha * (1.0 - dstColor.a));
  } else {
    fragColor = vec4(col, alpha);
  }
}
`;
}

export class WebGLCompositor {
  private gl: WebGL2RenderingContext;
  private quadVao: WebGLVertexArrayObject;
  private programs: Map<string, WebGLProgram> = new Map();
  private curveTextures: { master: WebGLTexture; r: WebGLTexture; g: WebGLTexture; b: WebGLTexture } | null = null;
  private lut3DTexture: WebGLTexture | null = null;
  private defaultWhiteTexture: WebGLTexture;
  private fboA: WebGLFramebuffer | null = null;
  private fboB: WebGLFramebuffer | null = null;
  private fboTexA: WebGLTexture | null = null;
  private fboTexB: WebGLTexture | null = null;
  private fboWidth = 0;
  private fboHeight = 0;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    gl.enable(gl.BLEND);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);

    // Quad geometry
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    const pos = new Float32Array([
      -1, -1, 0, 1,
       1, -1, 1, 1,
      -1,  1, 0, 0,
       1,  1, 1, 0,
    ]);
    const vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER, pos, gl.STATIC_DRAW);

    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 16, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 16, 8);
    gl.bindVertexArray(null);
    this.quadVao = vao;

    // 1x1 default white texture
    const tex = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    this.defaultWhiteTexture = tex;

    this.initDefaultCurveTextures();
  }

  private initDefaultCurveTextures() {
    const gl = this.gl;
    const defaultData = new Uint8Array(256);
    for (let i = 0; i < 256; i++) defaultData[i] = i;

    const makeTex = () => {
      const t = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, defaultData);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      return t;
    };

    this.curveTextures = {
      master: makeTex(),
      r: makeTex(),
      g: makeTex(),
      b: makeTex(),
    };
  }

  getProgram(blendMode: BlendMode = 'normal'): WebGLProgram {
    if (this.programs.has(blendMode)) return this.programs.get(blendMode)!;

    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, VERTEX_SHADER_SRC);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
      throw new Error('Vertex shader compile error: ' + gl.getShaderInfoLog(vs));
    }

    const fsSrc = buildFragmentShaderSrc(blendMode);
    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSrc);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
      throw new Error('Fragment shader compile error: ' + gl.getShaderInfoLog(fs));
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.bindAttribLocation(prog, 0, 'a_position');
    gl.bindAttribLocation(prog, 1, 'a_texCoord');
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error('Program link error: ' + gl.getProgramInfoLog(prog));
    }

    this.programs.set(blendMode, prog);
    return prog;
  }

  load3DLUT(lut: LUT3D) {
    if (this.lut3DTexture) this.gl.deleteTexture(this.lut3DTexture);
    this.lut3DTexture = createWebGL3DLUT(this.gl, lut);
  }

  loadCurves(curves: CurveParams) {
    const gl = this.gl;
    const prepared = prepareCurveTextures(curves);

    const upload = (tex: WebGLTexture, data: Uint8Array) => {
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 1, 0, gl.RED, gl.UNSIGNED_BYTE, data);
    };

    if (this.curveTextures) {
      upload(this.curveTextures.master, prepared.master);
      upload(this.curveTextures.r, prepared.r);
      upload(this.curveTextures.g, prepared.g);
      upload(this.curveTextures.b, prepared.b);
    }
  }

  clear(width: number, height: number, r = 0, g = 0, b = 0, a = 1) {
    const gl = this.gl;
    gl.viewport(0, 0, width, height);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  renderLayer(params: LayerRenderParams, targetWidth: number, targetHeight: number) {
    const gl = this.gl;
    const prog = this.getProgram(params.transform.blendMode || 'normal');
    gl.useProgram(prog);

    // Compute Affine 2D Transform matrix
    // Normalised device coordinates: target viewport is [-1, 1]
    const tr = params.transform;
    const rad = tr.rotation;
    const cosR = Math.cos(rad);
    const sinR = Math.sin(rad);

    // Position in NDC [-1, 1]
    const px = (tr.position.x / (targetWidth * 0.5));
    const py = -(tr.position.y / (targetHeight * 0.5));

    // Scale
    const sx = tr.scale.x;
    const sy = tr.scale.y;

    // 3x3 column-major affine transform matrix
    const mat = new Float32Array([
      sx * cosR, -sy * sinR, 0,
      sx * sinR,  sy * cosR, 0,
      px,         py,        1,
    ]);

    const uTransformLoc = gl.getUniformLocation(prog, 'u_transform');
    gl.uniformMatrix3fv(uTransformLoc, false, mat);

    // Source texture
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    try {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, params.source as any);
    } catch {
      // Fallback: draw through image element / white
      gl.bindTexture(gl.TEXTURE_2D, this.defaultWhiteTexture);
    }

    gl.uniform1i(gl.getUniformLocation(prog, 'u_texture'), 0);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_opacity'), tr.opacity ?? 1.0);

    // Crop
    const crop = params.crop || { top: 0, bottom: 0, left: 0, right: 0 };
    gl.uniform4f(gl.getUniformLocation(prog, 'u_crop'), crop.top, crop.bottom, crop.left, crop.right);

    // Color grading (LGG)
    const cg = params.colorGrade;
    if (cg?.lift || cg?.gamma || cg?.gain) {
      gl.uniform1i(gl.getUniformLocation(prog, 'u_lgg_enabled'), 1);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_lift_r'), cg.lift?.r ?? 1);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_lift_g'), cg.lift?.g ?? 1);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_lift_b'), cg.lift?.b ?? 1);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_lift_master'), cg.lift?.master ?? 1);

      gl.uniform1f(gl.getUniformLocation(prog, 'u_gamma_r'), cg.gamma?.r ?? 1);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_gamma_g'), cg.gamma?.g ?? 1);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_gamma_b'), cg.gamma?.b ?? 1);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_gamma_master'), cg.gamma?.master ?? 1);

      gl.uniform1f(gl.getUniformLocation(prog, 'u_gain_r'), cg.gain?.r ?? 1);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_gain_g'), cg.gain?.g ?? 1);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_gain_b'), cg.gain?.b ?? 1);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_gain_master'), cg.gain?.master ?? 1);
    } else {
      gl.uniform1i(gl.getUniformLocation(prog, 'u_lgg_enabled'), 0);
    }

    // Curves
    if (this.curveTextures) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.curveTextures.master);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_curve_master'), 1);

      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.curveTextures.r);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_curve_r'), 2);

      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.curveTextures.g);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_curve_g'), 3);

      gl.activeTexture(gl.TEXTURE4);
      gl.bindTexture(gl.TEXTURE_2D, this.curveTextures.b);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_curve_b'), 4);

      gl.uniform1i(gl.getUniformLocation(prog, 'u_curves_enabled'), cg?.curves ? 1 : 0);
    }

    // 3D LUT
    if (this.lut3DTexture && cg?.lut3D) {
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_3D, this.lut3DTexture);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_lut3d'), 5);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_lut3d_enabled'), 1);
    } else {
      gl.uniform1i(gl.getUniformLocation(prog, 'u_lut3d_enabled'), 0);
    }

    // Basic adjustments
    const adj = params.adjustments || { brightness: 100, contrast: 100, saturation: 100, hue: 0, blur: 0 };
    gl.uniform1f(gl.getUniformLocation(prog, 'u_brightness'), (adj.brightness ?? 100) / 100);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_contrast'), (adj.contrast ?? 100) / 100);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_saturation'), (adj.saturation ?? 100) / 100);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_temperature'), (adj.temperature ?? 0) / 100);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_tint'), (adj.tint ?? 0) / 100);
    gl.uniform1f(gl.getUniformLocation(prog, 'u_hue'), adj.hue ?? 0);

    // Effect
    let fxCode = 0;
    if (params.filterEffect === 'grayscale') fxCode = 1;
    else if (params.filterEffect === 'sepia') fxCode = 2;
    else if (params.filterEffect === 'invert') fxCode = 3;
    else if (params.filterEffect === 'filmGrain') fxCode = 4;
    else if (params.filterEffect === 'rgbSplit') fxCode = 5;
    gl.uniform1i(gl.getUniformLocation(prog, 'u_effect'), fxCode);

    // Mask
    if (params.mask && params.mask.type !== 'none') {
      const typeCode = params.mask.type === 'rectangle' ? 1 : params.mask.type === 'radial' ? 2 : 3;
      gl.uniform1i(gl.getUniformLocation(prog, 'u_mask_type'), typeCode);
      gl.uniform1f(gl.getUniformLocation(prog, 'u_mask_feather'), params.mask.feather ?? 0.1);
      gl.uniform1i(gl.getUniformLocation(prog, 'u_mask_invert'), params.mask.invert ? 1 : 0);
      gl.uniform2f(gl.getUniformLocation(prog, 'u_mask_center'), params.mask.center?.x ?? 0.5, params.mask.center?.y ?? 0.5);
      gl.uniform2f(gl.getUniformLocation(prog, 'u_mask_size'), params.mask.size?.x ?? 0.5, params.mask.size?.y ?? 0.5);
    } else {
      gl.uniform1i(gl.getUniformLocation(prog, 'u_mask_type'), 0);
    }

    // Draw quad
    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);

    // Cleanup per-frame texture
    gl.deleteTexture(tex);
  }

  destroy() {
    const gl = this.gl;
    gl.deleteVertexArray(this.quadVao);
    gl.deleteTexture(this.defaultWhiteTexture);
    if (this.curveTextures) {
      gl.deleteTexture(this.curveTextures.master);
      gl.deleteTexture(this.curveTextures.r);
      gl.deleteTexture(this.curveTextures.g);
      gl.deleteTexture(this.curveTextures.b);
    }
    if (this.lut3DTexture) gl.deleteTexture(this.lut3DTexture);
    for (const p of this.programs.values()) gl.deleteProgram(p);
    this.programs.clear();
  }
}
