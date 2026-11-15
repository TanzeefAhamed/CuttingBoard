import type { Segment, SegmentFilters, BlendMode } from '../core/timeline/segment';
import { DEFAULT_CROP, DEFAULT_FILTERS } from '../core/timeline/segment';
import type { Track } from '../core/timeline/track';
import { getMedia, isDrawable } from './mediaPool';
import { WebGLCompositor, type LayerRenderParams } from '../core/webcodecs/webglCompositor';
import { decodeVideoFrame } from './webcodecsDecoder';

export const ASPECTS: Record<string, number> = {
  '16:9': 16 / 9,
  '9:16': 9 / 16,
  '1:1': 1,
  '4:3': 4 / 3,
  '21:9': 21 / 9,
};

/** Logical composition size (height 1080) for an aspect ratio. */
export function compSize(aspect: string, height = 1080): { w: number; h: number } {
  const r = ASPECTS[aspect] ?? 16 / 9;
  return { w: Math.round(height * r), h: height };
}

export function segmentEnd(s: Segment): bigint {
  return s.targetTimerange.start.value + s.targetTimerange.duration;
}

export function isActive(s: Segment, t: bigint): boolean {
  return t >= s.targetTimerange.start.value && t < segmentEnd(s);
}

/** Seconds into the source media for a timeline time. */
export function sourceTimeSeconds(s: Segment, t: bigint): number {
  const into = Number(t - s.targetTimerange.start.value) * s.speed;
  const srcStart = Number(s.sourceTimerange.start.value);
  const srcDur = Number(s.sourceTimerange.duration);
  const us = s.reverse ? srcStart + srcDur - into : srcStart + into;
  return Math.max(0, us / 1_000_000);
}

export function filterString(f?: SegmentFilters): string {
  const x = { ...DEFAULT_FILTERS, ...f };
  const parts: string[] = [];
  if (x.blur > 0) parts.push(`blur(${x.blur}px)`);
  if (x.brightness !== 100) parts.push(`brightness(${x.brightness}%)`);
  if (x.contrast !== 100) parts.push(`contrast(${x.contrast}%)`);
  if (x.saturation !== 100) parts.push(`saturate(${x.saturation}%)`);
  if (x.hue !== 0) parts.push(`hue-rotate(${x.hue}deg)`);
  if (x.effect === 'grayscale') parts.push('grayscale(100%)');
  if (x.effect === 'sepia') parts.push('sepia(100%)');
  if (x.effect === 'invert') parts.push('invert(100%)');
  return parts.length ? parts.join(' ') : 'none';
}

const BLEND: Record<string, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
  hue: 'hue',
  saturation: 'saturation',
};

/**
 * Sync media element playback with the timeline clock.
 * Called every frame by both viewport and exporter.
 */
export function syncMedia(
  segments: Iterable<Segment>,
  tracks: Track[],
  t: bigint,
  playing: boolean,
  speed: number,
  masterVolume: number,
) {
  const trackMap = new Map(tracks.map((tr) => [tr.id, tr]));
  for (const s of segments) {
    if (s.media.type !== 'video' && s.media.type !== 'audio') continue;
    const el = getMedia(s.media.url, s.media.type) as HTMLVideoElement | HTMLAudioElement | null;
    if (!el) continue;
    const track = trackMap.get(s.trackId);
    const active = isActive(s, t);
    if (!active) {
      if (!el.paused && !hasOtherActive(segments, s, t)) el.pause();
      continue;
    }
    const target = sourceTimeSeconds(s, t);
    const muted = track?.muted || masterVolume === 0;
    el.muted = !!muted;
    el.volume = Math.max(0, Math.min(1, (s.volume ?? 1) * (track?.volume ?? 1) * masterVolume));
    const rate = Math.max(0.0625, Math.min(16, s.speed * (playing ? speed : 1)));
    if (playing && !s.reverse && !s.isFreezeFrame) {
      if (el.playbackRate !== rate) el.playbackRate = rate;
      if (el.paused || Math.abs(el.currentTime - target) > 0.35) {
        if (Math.abs(el.currentTime - target) > 0.05) el.currentTime = target;
      }
      if (el.paused) void el.play().catch(() => undefined);
    } else {
      if (!el.paused) el.pause();
      if (Math.abs(el.currentTime - target) > 0.02 && !el.seeking) el.currentTime = target;
    }
  }
}

function hasOtherActive(segments: Iterable<Segment>, self: Segment, t: bigint): boolean {
  for (const s of segments) {
    if (s !== self && s.media.url === self.media.url && s.media.type === self.media.type && isActive(s, t)) return true;
  }
  return false;
}

/**
 * Composite the timeline at time `t` into a canvas context of size cw x ch.
 * The composition frame (aspect) is letterboxed inside the canvas.
 */
export function renderFrame(
  ctx: CanvasRenderingContext2D,
  cw: number,
  ch: number,
  opts: {
    segments: Iterable<Segment>;
    tracks: Track[];
    t: bigint;
    aspect: string;
    background?: string;
    letterboxFill?: string | null;
  },
) {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.filter = 'none';
  if (opts.letterboxFill === null) ctx.clearRect(0, 0, cw, ch);
  else {
    ctx.fillStyle = opts.letterboxFill ?? '#000';
    ctx.fillRect(0, 0, cw, ch);
  }

  const comp = compSize(opts.aspect);
  const scale = Math.min(cw / comp.w, ch / comp.h);
  const fw = comp.w * scale;
  const fh = comp.h * scale;
  const ox = (cw - fw) / 2;
  const oy = (ch - fh) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(ox, oy, fw, fh);
  ctx.clip();
  ctx.fillStyle = opts.background ?? '#0b0f19';
  ctx.fillRect(ox, oy, fw, fh);

  // Lower track index = higher layer. Draw bottom-up.
  const order = new Map(opts.tracks.map((tr, i) => [tr.id, i]));
  const trackMap = new Map(opts.tracks.map((tr) => [tr.id, tr]));
  const active = Array.from(opts.segments)
    .filter((s) => s.media.type !== 'audio' && isActive(s, opts.t) && trackMap.get(s.trackId)?.visible !== false)
    .sort((a, b) => (order.get(b.trackId) ?? 0) - (order.get(a.trackId) ?? 0));

  for (const s of active) {
    const el = getMedia(s.media.url, s.media.type);
    if (!isDrawable(el)) continue;
    const sw = el instanceof HTMLVideoElement ? el.videoWidth : el.naturalWidth;
    const sh = el instanceof HTMLVideoElement ? el.videoHeight : el.naturalHeight;

    const crop = { ...DEFAULT_CROP, ...s.crop };
    const cx0 = (crop.left / 100) * sw;
    const cy0 = (crop.top / 100) * sh;
    const cwid = Math.max(1, sw * (1 - (crop.left + crop.right) / 100));
    const chei = Math.max(1, sh * (1 - (crop.top + crop.bottom) / 100));

    // contain-fit the (cropped) source inside the composition
    const fit = Math.min(comp.w / sw, comp.h / sh);
    const dw = cwid * fit;
    const dh = chei * fit;

    const tr = s.transform;
    ctx.save();
    ctx.translate(ox + fw / 2 + tr.position.x * scale, oy + fh / 2 + tr.position.y * scale);
    ctx.rotate(tr.rotation);
    ctx.scale(tr.scale.x * scale, tr.scale.y * scale);
    ctx.globalAlpha = Math.max(0, Math.min(1, tr.opacity));
    ctx.globalCompositeOperation = BLEND[tr.blendMode] ?? 'source-over';
    ctx.filter = filterString(s.filters);
    ctx.drawImage(el, cx0, cy0, cwid, chei, -dw * tr.anchor.x, -dh * tr.anchor.y, dw, dh);
    ctx.restore();
  }
  ctx.restore();

  return { ox, oy, fw, fh, scale };
}

export interface RenderWebGLOptions {
  segments: Iterable<Segment>;
  tracks: Track[];
  t: bigint;
  aspect: string;
  background?: string;
  letterboxFill?: string | null;
}

/**
 * Composite the timeline at time `t` directly through WebCodecs and WebGL 2 Compositor.
 */
export async function renderWebGLFrame(
  compositor: WebGLCompositor,
  gl: WebGL2RenderingContext,
  cw: number,
  ch: number,
  opts: RenderWebGLOptions
) {
  const comp = compSize(opts.aspect);
  const scale = Math.min(cw / comp.w, ch / comp.h);
  const fw = Math.max(1, Math.round(comp.w * scale));
  const fh = Math.max(1, Math.round(comp.h * scale));
  const ox = Math.round((cw - fw) / 2);
  const oy = Math.round((ch - fh) / 2);

  // Clear full canvas in black (letterbox)
  gl.viewport(0, 0, cw, ch);
  gl.scissor(0, 0, cw, ch);
  gl.enable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  // Clear composition area with dark background
  gl.scissor(ox, oy, fw, fh);
  gl.clearColor(0.043, 0.059, 0.098, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.disable(gl.SCISSOR_TEST);

  // Viewport to composition box
  gl.viewport(ox, oy, fw, fh);

  const order = new Map(opts.tracks.map((tr, i) => [tr.id, i]));
  const trackMap = new Map(opts.tracks.map((tr) => [tr.id, tr]));
  const active = Array.from(opts.segments)
    .filter((s) => s.media.type !== 'audio' && isActive(s, opts.t) && trackMap.get(s.trackId)?.visible !== false)
    .sort((a, b) => (order.get(b.trackId) ?? 0) - (order.get(a.trackId) ?? 0));

  for (const s of active) {
    let sourceDrawable: VideoFrame | HTMLVideoElement | HTMLImageElement | null = null;
    let sw = 1920;
    let sh = 1080;
    let videoFrameToClose: VideoFrame | null = null;

    if (s.media.type === 'video') {
      const srcSec = sourceTimeSeconds(s, opts.t);
      const decoded = await decodeVideoFrame(s.media.url, srcSec);
      if (decoded.frame) {
        sourceDrawable = decoded.frame;
        sw = decoded.frame.displayWidth;
        sh = decoded.frame.displayHeight;
        videoFrameToClose = decoded.frame;
      } else if (decoded.fallbackElement && decoded.fallbackElement.readyState >= 2) {
        sourceDrawable = decoded.fallbackElement;
        sw = decoded.fallbackElement.videoWidth || 1920;
        sh = decoded.fallbackElement.videoHeight || 1080;
      }
    } else if (s.media.type === 'image') {
      const el = getMedia(s.media.url, 'image');
      if (isDrawable(el)) {
        sourceDrawable = el as HTMLImageElement;
        sw = (el as HTMLImageElement).naturalWidth || 1920;
        sh = (el as HTMLImageElement).naturalHeight || 1080;
      }
    } else if (s.media.type === 'text') {
      const text = (s.media.metadata?.text as string) || 'Sample Text';
      const fontSize = (s.media.metadata?.fontSize as number) || 44;
      const color = (s.media.metadata?.color as string) || '#ffffff';
      const textCanvas = document.createElement('canvas');
      textCanvas.width = 1920;
      textCanvas.height = 1080;
      const tCtx = textCanvas.getContext('2d')!;
      tCtx.clearRect(0, 0, 1920, 1080);
      tCtx.font = `bold ${fontSize * 1.8}px "Inter", sans-serif`;
      tCtx.textAlign = 'center';
      tCtx.textBaseline = 'middle';
      tCtx.lineWidth = 6;
      tCtx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      tCtx.strokeText(text, 960, 540);
      tCtx.fillStyle = color;
      tCtx.fillText(text, 960, 540);
      sourceDrawable = textCanvas;
      sw = 1920;
      sh = 1080;
    } else if (s.media.type === 'shape') {
      const shapeType = (s.media.metadata?.shapeType as string) || 'rectangle';
      const color = (s.media.metadata?.color as string) || '#3b82f6';
      const strokeColor = (s.media.metadata?.strokeColor as string) || '#ffffff';
      const shapeCanvas = document.createElement('canvas');
      shapeCanvas.width = 1920;
      shapeCanvas.height = 1080;
      const sCtx = shapeCanvas.getContext('2d')!;
      sCtx.clearRect(0, 0, 1920, 1080);
      sCtx.fillStyle = color;
      sCtx.strokeStyle = strokeColor;
      sCtx.lineWidth = 8;

      if (shapeType === 'circle') {
        sCtx.beginPath();
        sCtx.arc(960, 540, 240, 0, Math.PI * 2);
        sCtx.fill();
        sCtx.stroke();
      } else if (shapeType === 'arrow') {
        sCtx.beginPath();
        sCtx.moveTo(760, 480);
        sCtx.lineTo(1060, 480);
        sCtx.lineTo(1060, 400);
        sCtx.lineTo(1200, 540);
        sCtx.lineTo(1060, 680);
        sCtx.lineTo(1060, 600);
        sCtx.lineTo(760, 600);
        sCtx.closePath();
        sCtx.fill();
        sCtx.stroke();
      } else if (shapeType === 'device-macbook') {
        sCtx.fillStyle = '#1e293b';
        sCtx.beginPath();
        sCtx.roundRect(560, 280, 800, 500, 16);
        sCtx.fill();
        sCtx.strokeStyle = '#64748b';
        sCtx.stroke();
        sCtx.fillStyle = '#0f172a';
        sCtx.fillRect(590, 310, 740, 440);
        sCtx.fillStyle = '#334155';
        sCtx.beginPath();
        sCtx.roundRect(500, 780, 920, 24, [0, 0, 12, 12]);
        sCtx.fill();
        sCtx.fillStyle = '#64748b';
        sCtx.fillRect(920, 780, 80, 6);
      } else if (shapeType === 'device-iphone') {
        sCtx.fillStyle = '#0f172a';
        sCtx.beginPath();
        sCtx.roundRect(800, 200, 320, 680, 44);
        sCtx.fill();
        sCtx.strokeStyle = '#475569';
        sCtx.stroke();
        sCtx.fillStyle = '#000';
        sCtx.beginPath();
        sCtx.roundRect(915, 220, 90, 26, 13);
        sCtx.fill();
      } else {
        sCtx.beginPath();
        sCtx.roundRect(660, 360, 600, 360, 24);
        sCtx.fill();
        sCtx.stroke();
      }
      sourceDrawable = shapeCanvas;
      sw = 1920;
      sh = 1080;
    }

    if (!sourceDrawable) continue;

    const crop = { ...DEFAULT_CROP, ...s.crop };
    const filters = { ...DEFAULT_FILTERS, ...s.filters };

    // Contain-fit source inside comp
    const fit = Math.min(comp.w / sw, comp.h / sh);
    const dw = sw * fit;
    const dh = sh * fit;

    const sx = (dw / comp.w) * s.transform.scale.x;
    const sy = (dh / comp.h) * s.transform.scale.y;

    const layerParams: LayerRenderParams = {
      source: sourceDrawable,
      width: sw,
      height: sh,
      transform: {
        position: { x: s.transform.position.x, y: s.transform.position.y },
        scale: { x: sx, y: sy },
        rotation: s.transform.rotation,
        anchor: s.transform.anchor,
        opacity: s.transform.opacity,
        blendMode: (s.transform.blendMode as BlendMode) || 'normal',
      },
      crop,
      colorGrade: s.colorGrade,
      adjustments: {
        brightness: filters.brightness,
        contrast: filters.contrast,
        saturation: filters.saturation,
        hue: filters.hue,
        blur: filters.blur,
        temperature: s.colorGrade?.temperature ?? 0,
        tint: s.colorGrade?.tint ?? 0,
      },
      mask: s.aiEffects?.portraitMatting
        ? {
            type: 'radial',
            feather: 0.25,
            invert: false,
            center: { x: 0.5, y: 0.5 },
            size: { x: 0.4, y: 0.6 },
          }
        : undefined,
      filterEffect: filters.effect !== 'none' ? (filters.effect as any) : undefined,
    };

    try {
      compositor.renderLayer(layerParams, comp.w, comp.h);
    } catch (e) {
      console.warn('renderLayer error', e);
    } finally {
      if (videoFrameToClose) {
        videoFrameToClose.close();
      }
    }
  }

  return { ox, oy, fw, fh, scale, comp };
}
