import type { Segment } from '../core/timeline/segment';
import type { Track } from '../core/timeline/track';
import type { ExportSettings } from '../store';
import { getMedia, getPooledElements, pauseAll } from './mediaPool';
import { compSize, renderFrame, syncMedia } from './renderer';

export interface ExportJob {
  segments: Map<string, Segment>;
  tracks: Track[];
  duration: bigint;
  aspect: string;
  settings: ExportSettings;
}

const RES_HEIGHT: Record<string, number> = { '4k': 2160, '1080p': 1080, '720p': 720, '480p': 480 };

const MIME_CANDIDATES: Record<string, string[]> = {
  mp4: ['video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4;codecs=avc1', 'video/mp4'],
  webm: ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'],
};

export function pickMime(format: string): { mime: string; ext: string } {
  const order = format === 'mp4' || format === 'mov' ? ['mp4', 'webm'] : ['webm', 'mp4'];
  for (const f of order) {
    for (const m of MIME_CANDIDATES[f]!) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) return { mime: m, ext: f };
    }
  }
  throw new Error('This browser has no supported MediaRecorder video format.');
}

let audioCtx: AudioContext | null = null;
const tapped = new WeakSet<HTMLMediaElement>();

/**
 * Real-time render of the timeline to a downloadable video file.
 * Frames are composited with the same renderer as the viewport; audio is
 * captured from the media elements through a WebAudio MediaStream.
 */
export async function runExport(job: ExportJob, onProgress: (pct: number) => void, signal: AbortSignal) {
  const { mime, ext } = pickMime(job.settings.format);
  const h = RES_HEIGHT[job.settings.resolution] ?? 720;
  const { w: cw0 } = compSize(job.aspect, h);
  const cw = cw0 - (cw0 % 2);
  const ch = h;
  const fps = Math.max(1, job.settings.framerate || 30);
  const total = Number(job.duration);
  if (total <= 0) throw new Error('Timeline is empty.');

  const canvas = document.createElement('canvas');
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas unavailable.');

  // Make sure every media element exists and is loaded before recording.
  const segs = Array.from(job.segments.values());
  for (const s of segs) getMedia(s.media.url, s.media.type);
  await Promise.all(
    getPooledElements().map(
      (el) =>
        new Promise<void>((res) => {
          if (el instanceof HTMLImageElement) {
            if (el.complete) res();
            else {
              el.onload = () => res();
              el.onerror = () => res();
            }
          } else if (el.readyState >= 2) res();
          else {
            el.addEventListener('loadeddata', () => res(), { once: true });
            el.addEventListener('error', () => res(), { once: true });
            setTimeout(res, 4000);
          }
        }),
    ),
  );

  // Audio routing
  audioCtx = audioCtx ?? new AudioContext();
  await audioCtx.resume();
  const dest = audioCtx.createMediaStreamDestination();
  for (const el of getPooledElements()) {
    if (el instanceof HTMLImageElement) continue;
    if (!tapped.has(el)) {
      const src = audioCtx.createMediaElementSource(el);
      src.connect(audioCtx.destination);
      (el as HTMLMediaElement & { __src?: MediaElementAudioSourceNode }).__src = src;
      tapped.add(el);
    }
    (el as HTMLMediaElement & { __src?: MediaElementAudioSourceNode }).__src?.connect(dest);
  }

  const stream = canvas.captureStream(fps);
  dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const recorder = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: job.settings.bitrate });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise<void>((res) => (recorder.onstop = () => res()));

  const frameDur = 1_000_000 / fps;
  let cancelled = false;
  try {
    recorder.start(250);
    const startWall = performance.now();
    await new Promise<void>((resolve, reject) => {
      const tick = () => {
        if (signal.aborted) {
          cancelled = true;
          return resolve();
        }
        const elapsedUs = (performance.now() - startWall) * 1000;
        const t = BigInt(Math.floor(Math.min(elapsedUs, total - 1) / frameDur) * Math.round(frameDur));
        try {
          syncMedia(job.segments.values(), job.tracks, t, true, 1, 1);
          renderFrame(ctx, cw, ch, { segments: job.segments.values(), tracks: job.tracks, t, aspect: job.aspect });
        } catch (e) {
          return reject(e);
        }
        onProgress(Math.min(99, (elapsedUs / total) * 100));
        if (elapsedUs >= total) return resolve();
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  } finally {
    pauseAll();
    if (recorder.state !== 'inactive') recorder.stop();
    await stopped;
    for (const el of getPooledElements()) {
      if (el instanceof HTMLImageElement) continue;
      try {
        (el as HTMLMediaElement & { __src?: MediaElementAudioSourceNode }).__src?.disconnect(dest);
      } catch {
        /* already disconnected */
      }
    }
  }
  if (cancelled) throw new DOMException('Export cancelled', 'AbortError');

  const blob = new Blob(chunks, { type: mime.split(';')[0] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `cuttingboard-export-${Date.now()}.${ext}`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
