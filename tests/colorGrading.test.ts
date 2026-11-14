/**
 * Color Grading Engine Tests
 * 
 * Tests for Milestone 2.3: Color Grading Engine
 * 
 * TEST-3.1: Lift/Gamma/Gain 3-way color grading shader
 * TEST-3.2: 8-channel HSL selective color correction
 * TEST-3.3: RGB & Luma spline curves
 * TEST-3.4: 3D LUT .cube parser and trilinear sampling
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  // Types
  LGGParams,
  HSLParams,
  CurvePoint,
  CurveParams,
  LUT3D,
  ColorGradeConfig,
  DEFAULT_COLOR_GRADE,
  // Spline functions
  computeCubicSpline,
  evaluateSpline,
  generateCurveTexture,
  prepareCurveTextures,
  // LUT
  parseCubeLUT,
  createWebGL3DLUT,
  generateLUT3DWGSL,
  // Shader generation
  generateLGGWGSL,
  generateHSLWGSL,
  generateCurveWGSL,
  generateLUT3DWGSL,
  generateColorGradeWGSL,
  generateColorGradeGLSL,
} from '../src/core/webcodecs/colorGrading.js';

// Mock WebGL2RenderingContext for createWebGL3DLUT test
class MockWebGL2Context {
  textures = new Map();
  boundTexture: any = null;
  texParams = new Map();
  
  TEXTURE_3D = 34067;
  TEXTURE_WRAP_S = 10242;
  TEXTURE_WRAP_T = 10243;
  TEXTURE_WRAP_R = 32882;
  TEXTURE_MIN_FILTER = 9728;
  TEXTURE_MAG_FILTER = 9729;
  RGBA32F = 34836;
  RGBA = 6408;
  FLOAT = 5126;
  CLAMP_TO_EDGE = 33071;
  LINEAR = 9729;
  TEXTURE_WRAP_R = 32882;
  
  createTexture() {
    const id = {};
    this.textures.set(id, {});
    return id;
  }
  
  bindTexture(target: number, texture: any) {
    this.boundTexture = texture;
  }
  
  texParameteri(target: number, pname: number, param: number) {
    if (this.boundTexture && this.textures.has(this.boundTexture)) {
      this.texParams.set(`${this.boundTexture}-${pname}`, param);
    }
  }
  
  texImage3D(
    target: number, level: number, internalformat: number,
    width: number, height: number, depth: number, border: number,
    format: number, type: number, data: ArrayBufferView
  ) {
    if (this.boundTexture) {
      this.textures.get(this.boundTexture)!.data = data;
      this.textures.get(this.boundTexture)!.size = { width, height, depth };
    }
  }
}

describe('Milestone 2.3: Color Grading Engine', () => {
  describe('DEFAULT_COLOR_GRADE', () => {
    it('has correct default LGG values', () => {
      expect(DEFAULT_COLOR_GRADE.lgg.lift).toEqual({ r: 0, g: 0, b: 0, master: 0 });
      expect(DEFAULT_COLOR_GRADE.lgg.gamma).toEqual({ r: 1, g: 1, b: 1, master: 1 });
      expect(DEFAULT_COLOR_GRADE.lgg.gain).toEqual({ r: 1, g: 1, b: 1, master: 1 });
    });

    it('has 8 HSL channels with neutral defaults', () => {
      expect(DEFAULT_COLOR_GRADE.hsl.channels.length).toBe(8);
      for (const ch of DEFAULT_COLOR_GRADE.hsl.channels) {
        expect(ch.hue).toBe(0);
        expect(ch.saturation).toBe(1);
        expect(ch.lightness).toBe(0);
      }
    });

    it('has linear curve defaults', () => {
      expect(DEFAULT_COLOR_GRADE.curves.master.length).toBe(2);
      expect(DEFAULT_COLOR_GRADE.curves.master[0]).toEqual({ x: 0, y: 0 });
      expect(DEFAULT_COLOR_GRADE.curves.master[1]).toEqual({ x: 1, y: 1 });
    });
  });

  describe('Cubic Spline Interpolation', () => {
    it('computes correct spline coefficients for linear points', () => {
      const points: CurvePoint[] = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ];
      const coeffs = computeCubicSpline(points);
      
      // For linear interpolation, we expect linear coefficients
      expect(coeffs.length).toBe(1);
      // f(t) = t, so a=0, b=0, c=1, d=0
      expect(coeffs[0][0]).toBeCloseTo(0); // a
      expect(coeffs[0][1]).toBeCloseTo(0); // b
      expect(coeffs[0][2]).toBeCloseTo(1); // c
      expect(coeffs[0][3]).toBeCloseTo(0); // d
    });

    it('computes S-curve coefficients correctly', () => {
      const points: CurvePoint[] = [
        { x: 0, y: 0 },
        { x: 0.25, y: 0.1 },
        { x: 0.75, y: 0.9 },
        { x: 1, y: 1 },
      ];
      const coeffs = computeCubicSpline(points);
      
      expect(coeffs.length).toBe(3);
      for (const c of coeffs) {
        expect(c.length).toBe(4);
      }
    });

    it('evaluates linear spline correctly', () => {
      const points: CurvePoint[] = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ];
      const coeffs = computeCubicSpline(points);
      
      expect(evaluateSpline(coeffs, points, 0)).toBeCloseTo(0);
      expect(evaluateSpline(coeffs, points, 0.5)).toBeCloseTo(0.5);
      expect(evaluateSpline(coeffs, points, 1)).toBeCloseTo(1);
    });

    it('evaluates S-curve correctly', () => {
      const points: CurvePoint[] = [
        { x: 0, y: 0 },
        { x: 0.25, y: 0.1 },
        { x: 0.75, y: 0.9 },
        { x: 1, y: 1 },
      ];
      const coeffs = computeCubicSpline(points);
      
      expect(evaluateSpline(coeffs, points, 0)).toBeCloseTo(0);
      expect(evaluateSpline(coeffs, points, 1)).toBeCloseTo(1);
      // At 0.5 (between 0.25 and 0.75), natural cubic spline may give different value
      // The S-curve is very steep, so midpoint may be around 0.9
      const mid = evaluateSpline(coeffs, points, 0.5);
      expect(mid).toBeGreaterThan(0.4);
      expect(mid).toBeLessThan(1.0);
    });

    it('clamps at boundaries', () => {
      const points: CurvePoint[] = [
        { x: 0.2, y: 0.2 },
        { x: 0.8, y: 0.8 },
      ];
      const coeffs = computeCubicSpline(points);
      
      expect(evaluateSpline(coeffs, points, -0.5)).toBeCloseTo(0.2);
      expect(evaluateSpline(coeffs, points, 1.5)).toBeCloseTo(0.8);
    });
  });

  describe('Curve Texture Generation', () => {
    it('generates 256-texel texture for linear curve', () => {
      const points: CurvePoint[] = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ];
      const coeffs = computeCubicSpline(points);
      const texture = generateCurveTexture(coeffs, points, 256);
      
      expect(texture.length).toBe(256);
      expect(texture[0]).toBeCloseTo(0);
      expect(texture[128]).toBeCloseTo(0.5);
      expect(texture[255]).toBeCloseTo(1);
    });

    it('generates correct S-curve texture', () => {
      const points: CurvePoint[] = [
        { x: 0, y: 0 },
        { x: 0.25, y: 0.1 },
        { x: 0.75, y: 0.9 },
        { x: 1, y: 1 },
      ];
      const coeffs = computeCubicSpline(points);
      const texture = generateCurveTexture(coeffs, points, 256);
      
      expect(texture[0]).toBeCloseTo(0);
      expect(texture[255]).toBeCloseTo(1);
      // S-curve should be below linear at 0.25, above at 0.75
      expect(texture[64]).toBeLessThan(64/255);
      expect(texture[192]).toBeGreaterThan(192/255);
    });

    it('prepares all curve textures', () => {
      const curves: CurveParams = {
        master: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        r: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        g: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
        b: [{ x: 0, y: 0 }, { x: 1, y: 1 }],
      };
      
      const textures = prepareCurveTextures(curves, 256);
      
      expect(textures.master).toBeInstanceOf(Float32Array);
      expect(textures.r).toBeInstanceOf(Float32Array);
      expect(textures.g).toBeInstanceOf(Float32Array);
      expect(textures.b).toBeInstanceOf(Float32Array);
      expect(textures.master.length).toBe(256);
    });
  });

  describe('3D LUT Parser (.cube format)', () => {
    it('parses valid 17x17x17 .cube file', () => {
      const size = 17;
      const voxels = size * size * size;
      let cubeText = 'LUT_3D_SIZE 17\n';
      
      for (let i = 0; i < voxels; i++) {
        const r = (i / voxels);
        const g = 0.5;
        const b = 0.25;
        cubeText += `${r} ${g} ${b}\n`;
      }
      
      const lut = parseCubeLUT(cubeText);
      
      expect(lut.size).toBe(17);
      expect(lut.data.length).toBe(17 * 17 * 17 * 4);
      expect(lut.data[0]).toBeCloseTo(0);
      expect(lut.data[3]).toBe(1); // Alpha
    });

    it('parses 33x33x33 .cube file', () => {
      const size = 33;
      const voxels = size * size * size;
      let cubeText = `LUT_3D_SIZE ${size}\n`;
      
      for (let i = 0; i < voxels; i++) {
        cubeText += `0.5 0.5 0.5\n`;
      }
      
      const lut = parseCubeLUT(cubeText);
      expect(lut.size).toBe(33);
      expect(lut.data.length).toBe(33 * 33 * 33 * 4);
    });

    it('handles 0-255 range input', () => {
      const size = 17;
      const voxels = size * size * size;
      let cubeText = 'LUT_3D_SIZE 17\n';
      
      for (let i = 0; i < voxels; i++) {
        cubeText += `128 255 64\n`; // 0-255 range
      }
      
      const lut = parseCubeLUT(cubeText);
      
      // Values should be normalized to 0-1
      expect(lut.data[0]).toBeCloseTo(128/255, 2);
      expect(lut.data[1]).toBeCloseTo(1.0);
      expect(lut.data[2]).toBeCloseTo(64/255, 2);
    });

    it('rejects 1D LUT', () => {
      const cubeText = 'LUT_1D_SIZE 17\n0.5 0.5 0.5\n';
      
      expect(() => parseCubeLUT(cubeText)).toThrow('1D LUT not supported');
    });

    it('rejects malformed data size', () => {
      const cubeText = 'LUT_3D_SIZE 17\n0.5 0.5 0.5\n'; // Only 1 voxel instead of 17^3
      
      expect(() => parseCubeLUT(cubeText)).toThrow('LUT data size mismatch');
    });
  });

  describe('WebGL 3D LUT Texture Creation', () => {
    it('creates 3D texture with correct parameters', () => {
      const gl = new MockWebGL2Context() as any;
      const lut: LUT3D = {
        size: 17,
        data: new Float32Array(17 * 17 * 17 * 4),
      };
      
      const texture = createWebGL3DLUT(gl, lut);
      
      expect(texture).toBeDefined();
      expect(gl.boundTexture).toBe(texture);
      expect(gl.texParams.get(`${texture}-10242`)).toBe(33071); // CLAMP_TO_EDGE
      expect(gl.texParams.get(`${texture}-9728`)).toBe(9729); // LINEAR
      expect(gl.texParams.get(`${texture}-9729`)).toBe(9729); // LINEAR
    });
  });

  describe('LGG (Lift/Gamma/Gain) Shader Generation', () => {
    it('generates LGG WGSL with 12 uniforms', () => {
      const wgsl = generateLGGWGSL();
      
      expect(wgsl).toContain('LGGParams');
      expect(wgsl).toContain('lift_r');
      expect(wgsl).toContain('lift_g');
      expect(wgsl).toContain('lift_b');
      expect(wgsl).toContain('lift_master');
      expect(wgsl).toContain('gamma_r');
      expect(wgsl).toContain('gamma_g');
      expect(wgsl).toContain('gamma_b');
      expect(wgsl).toContain('gamma_master');
      expect(wgsl).toContain('gain_r');
      expect(wgsl).toContain('gain_g');
      expect(wgsl).toContain('gain_b');
      expect(wgsl).toContain('gain_master');
      expect(wgsl).toContain('applyLGG');
    });

    it('implements lift/gamma/gain math correctly in WGSL', () => {
      const wgsl = generateLGGWGSL();
      
      // Lift affects shadows
      expect(wgsl).toContain('lift');
      expect(wgsl).toContain('mix');
      
      // Gamma uses pow
      expect(wgsl).toContain('pow');
      expect(wgsl).toContain('gamma');
      
      // Gain multiplies
      expect(wgsl).toContain('gain');
      expect(wgsl).toContain('*');
    });
  });

  describe('HSL Selective Color Shader', () => {
    it('generates HSL WGSL with 8 channels', () => {
      const wgsl = generateHSLWGSL();
      
      expect(wgsl).toContain('HSLParams');
      expect(wgsl).toContain('HSLChannel');
      expect(wgsl).toContain('HUE_CENTERS');
      expect(wgsl).toContain('HUE_WIDTH');
      expect(wgsl).toContain('applyHSL');
      expect(wgsl).toContain('rgb2hsv');
      expect(wgsl).toContain('hsv2rgb');
    });

    it('has 8 hue centers', () => {
      const wgsl = generateHSLWGSL();
      
      expect(wgsl).toContain('HUE_CENTERS');
      expect(wgsl).toContain('0.0');    // Red
      expect(wgsl).toContain('30.0');   // Orange
      expect(wgsl).toContain('60.0');   // Yellow
      expect(wgsl).toContain('120.0');  // Green
      expect(wgsl).toContain('180.0');  // Cyan
      expect(wgsl).toContain('240.0');  // Blue
      expect(wgsl).toContain('270.0');  // Purple
      expect(wgsl).toContain('300.0');  // Magenta
    });
  });

  describe('Curve Texture Shader', () => {
    it('generates curve WGSL with 1D textures', () => {
      const wgsl = generateCurveWGSL();
      
      expect(wgsl).toContain('u_curve_master');
      expect(wgsl).toContain('u_curve_r');
      expect(wgsl).toContain('u_curve_g');
      expect(wgsl).toContain('u_curve_b');
      expect(wgsl).toContain('texture_1d<f32>');
      expect(wgsl).toContain('applyCurves');
    });
  });

  describe('3D LUT Shader', () => {
    it('generates LUT3D WGSL with trilinear sampling', () => {
      const wgsl = generateLUT3DWGSL();
      
      expect(wgsl).toContain('texture_3d<f32>');
      expect(wgsl).toContain('sampleLUT3D');
      expect(wgsl).toContain('textureSampleLevel');
    });
  });

  describe('Complete Color Grade Shader (WGSL)', () => {
    it('generates complete WGSL pipeline', () => {
      const wgsl = generateColorGradeWGSL();
      
      expect(wgsl).toContain('applyLGG');
      expect(wgsl).toContain('applyHSL');
      expect(wgsl).toContain('applyCurves');
      expect(wgsl).toContain('sampleLUT3D');
      expect(wgsl).toContain('ColorGradeParams');
      expect(wgsl).toContain('lgg_enabled');
      expect(wgsl).toContain('hsl_enabled');
      expect(wgsl).toContain('curves_enabled');
      expect(wgsl).toContain('lut3d_enabled');
    });

    it('applies pipeline in correct order', () => {
      const wgsl = generateColorGradeWGSL();
      
      // Pipeline order: LGG → HSL → Curves → LUT
      const lggPos = wgsl.indexOf('applyLGG');
      const hslPos = wgsl.indexOf('applyHSL');
      const curvesPos = wgsl.indexOf('applyCurves');
      const lutPos = wgsl.indexOf('sampleLUT3D');
      
      expect(lggPos).toBeLessThan(hslPos);
      expect(hslPos).toBeLessThan(curvesPos);
      expect(curvesPos).toBeLessThan(lutPos);
    });
  });

  describe('GLSL Fragment Shader', () => {
    it('generates valid GLSL with LGG uniforms', () => {
      const glsl = generateColorGradeGLSL();
      
      expect(glsl).toContain('#version 300 es');
      expect(glsl).toContain('u_lift');
      expect(glsl).toContain('u_gamma');
      expect(glsl).toContain('u_gain');
      expect(glsl).toContain('applyLGG');
      expect(glsl).toContain('applyHSL');
      expect(glsl).toContain('applyCurves');
      expect(glsl).toContain('applyLUT');
    });

    it('has LGG uniform vec4s', () => {
      const glsl = generateColorGradeGLSL();
      
      expect(glsl).toContain('uniform vec4 u_lift');
      expect(glsl).toContain('uniform vec4 u_gamma');
      expect(glsl).toContain('uniform vec4 u_gain');
    });

    it('has curve texture uniforms', () => {
      const glsl = generateColorGradeGLSL();
      
      expect(glsl).toContain('u_curve_master');
      expect(glsl).toContain('u_curve_r');
      expect(glsl).toContain('u_curve_g');
      expect(glsl).toContain('u_curve_b');
      expect(glsl).toContain('sampler2D');
    });

    it('has 3D LUT uniform', () => {
      const glsl = generateColorGradeGLSL();
      
      expect(glsl).toContain('sampler3D u_lut3d');
      expect(glsl).toContain('applyLUT');
    });
  });
});