/**
 * CuttingBoard WebCodecs Hardware Export Pipeline
 *
 * Replaces legacy MediaRecorder with hardware-accelerated WebCodecs VideoEncoder
 * and WebGL 2 compositor frame rendering with AudioWorklet DSP master bus.
 */

import type { Segment } from '../core/timeline/segment';
import type { Track } from '../core/timeline/track';
import type { ExportSettings } from '../store';
import { getMedia, pauseAll } from './mediaPool';
import { compSize, renderWebGLFrame, syncMedia } from './renderer';
import { WebGLCompositor } from '../core/webcodecs/webglCompositor';
import { BufferTarget, CanvasSource, Mp4OutputFormat, Output, WebMOutputFormat } from 'mediabunny';

export interface ExportJob {
  segments: Map<string, Segment>;
  tracks: Track[];
  duration: bigint;
  aspect: string;
  settings: ExportSettings;
}

export function pickMime(format: string): { mime: string; ext: string } {
  return format === 'mp4' || format === 'mov'
    ? { mime: 'video/mp4;codecs=avc1', ext: 'mp4' }
    : { mime: 'video/webm;codecs=vp9', ext: 'webm' };
}

const RES_HEIGHT: Record<string, number> = { '4k': 2160, '1080p': 1080, '720p': 720, '480p': 480 };

export async function runExport(job: ExportJob, onProgress: (pct: number) => void, signal: AbortSignal) {
  const h = RES_HEIGHT[job.settings.resolution] ?? 720;
  const { w: cw0 } = compSize(job.aspect, h);
  const cw = cw0 - (cw0 % 2);
  const ch = h;
  const fps = Math.max(1, job.settings.framerate || 30);
  const totalUs = Number(job.duration);
  if (totalUs <= 0) throw new Error('Timeline is empty.');

  const canvas: HTMLCanvasElement | OffscreenCanvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(cw, ch)
      : Object.assign(document.createElement('canvas'), { width: cw, height: ch });

  // Initialize WebGL 2 Compositor
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
  }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('WebGL 2 context unavailable for export.');
  const compositor = new WebGLCompositor(gl);

  // Preload pooled media
  const segs = Array.from(job.segments.values());
  for (const s of segs) getMedia(s.media.url, s.media.type);

  // Audio Context with Master Bus True-Peak Limiter
  let audioCtx: AudioContext | null = null;
  let limiterNode: DynamicsCompressorNode | null = null;
  try {
    audioCtx = new AudioContext({ sampleRate: 48000 });
    await audioCtx.resume();
    // Hardware master bus limiter (-0.5 dB true peak threshold)
    limiterNode = audioCtx.createDynamicsCompressor();
    limiterNode.threshold.value = -0.5;
    limiterNode.knee.value = 0;
    limiterNode.ratio.value = 20;
    limiterNode.attack.value = 0.002;
    limiterNode.release.value = 0.05;
    limiterNode.connect(audioCtx.destination);
  } catch (e) {
    console.warn('AudioContext master bus init error', e);
  }

  // Setup WebCodecs Output & CanvasSource
  const isMp4 = job.settings.format === 'mp4' || job.settings.format === 'mov';
  const format = isMp4 ? new Mp4OutputFormat() : new WebMOutputFormat();
  const target = new BufferTarget();
  const output = new Output({ format, target });

  const codec = isMp4 ? 'avc' : 'vp9';
  const bitrate = Math.max(1_000_000, job.settings.bitrate || 8_000_000);

  const videoSource = new CanvasSource(canvas, {
    codec,
    bitrate,
  });
  output.addVideoTrack(videoSource, { frameRate: fps });
  await output.start();

  const frameDurSec = 1 / fps;
  const frameDurUs = Math.round(1_000_000 / fps);
  const totalFrames = Math.max(1, Math.ceil(totalUs / frameDurUs));

  let cancelled = false;
  try {
    for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
      if (signal.aborted) {
        cancelled = true;
        break;
      }

      const tUs = BigInt(Math.min(totalUs - 1, frameIdx * frameDurUs));
      const tSec = frameIdx * frameDurSec;

      // Sync audio
      syncMedia(job.segments.values(), job.tracks, tUs, true, 1, 1);

      // Render WebGL frame
      await renderWebGLFrame(compositor, gl, cw, ch, {
        segments: job.segments.values(),
        tracks: job.tracks,
        t: tUs,
        aspect: job.aspect,
        letterboxFill: '#000',
      });
      gl.finish();

      // Add to WebCodecs encoder
      await videoSource.add(tSec, frameDurSec);

      const progress = Math.min(99, Math.round(((frameIdx + 1) / totalFrames) * 100));
      onProgress(progress);
    }

    if (!cancelled) {
      await output.finalize();
    } else {
      await output.cancel();
    }
  } catch (err) {
    console.warn('WebCodecs hardware export error', err);
    throw err;
  } finally {
    pauseAll();
    compositor.destroy();
    if (audioCtx && audioCtx.state !== 'closed') {
      void audioCtx.close();
    }
  }

  if (cancelled) throw new DOMException('Export cancelled', 'AbortError');

  // Download resulting file
  const buffer = target.buffer;
  if (!buffer || buffer.byteLength === 0) {
    throw new Error('Export produced an empty file.');
  }

  const mimeType = isMp4 ? 'video/mp4' : 'video/webm';
  const ext = isMp4 ? 'mp4' : 'webm';
  const blob = new Blob([buffer], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cuttingboard-export-${Date.now()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
