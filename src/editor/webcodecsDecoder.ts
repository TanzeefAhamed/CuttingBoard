/**
 * WebCodecs Video Decoder Cache & Player
 *
 * Provides hardware-accelerated video frame decoding via WebCodecs VideoDecoder
 * and mediabunny's VideoSampleSink.
 */

import { ALL_FORMATS, Input, UrlSource, VideoSampleSink } from 'mediabunny';

interface VideoDecoderInstance {
  input: Input;
  sink: VideoSampleSink;
  duration: number;
  width: number;
  height: number;
  codec: string;
}

const decoderCache = new Map<string, Promise<VideoDecoderInstance>>();
const fallbackVideos = new Map<string, HTMLVideoElement>();

export async function getWebCodecsDecoder(url: string): Promise<VideoDecoderInstance | null> {
  if (typeof VideoDecoder === 'undefined') {
    return null;
  }

  if (decoderCache.has(url)) {
    return decoderCache.get(url)!;
  }

  const promise = (async () => {
    try {
      const input = new Input({
        source: new UrlSource(url),
        formats: ALL_FORMATS,
      });

      const track = await input.getPrimaryVideoTrack();
      if (!track) return null as any;

      const sink = new VideoSampleSink(track);
      const duration = await track.computeDuration();
      const width = await track.getDisplayWidth();
      const height = await track.getDisplayHeight();

      return {
        input,
        sink,
        duration,
        width,
        height,
        codec: track.codec ?? 'h264',
      };
    } catch (e) {
      console.warn('WebCodecs decoder init failed for', url, e);
      return null as any;
    }
  })();

  decoderCache.set(url, promise);
  return promise;
}

/**
 * Decodes a frame at the specified timestamp in seconds.
 * Returns a VideoFrame (must be closed by the caller after use) or HTMLVideoElement fallback.
 */
export async function decodeVideoFrame(
  url: string,
  timeSeconds: number
): Promise<{ frame: VideoFrame | null; fallbackElement?: HTMLVideoElement }> {
  const dec = await getWebCodecsDecoder(url);

  if (dec && dec.sink) {
    try {
      const clamped = Math.max(0, Math.min(timeSeconds, dec.duration || timeSeconds));
      const sample = await dec.sink.getSample(clamped);
      if (sample) {
        return { frame: sample.toVideoFrame() };
      }
    } catch (e) {
      // If WebCodecs sink fails or sample is null, fall through to fallback video element
    }
  }

  // Fallback video element for environments without WebCodecs or on decode boundary
  let vid = fallbackVideos.get(url);
  if (!vid) {
    vid = document.createElement('video');
    vid.src = url;
    vid.preload = 'auto';
    vid.muted = true;
    vid.playsInline = true;
    fallbackVideos.set(url, vid);
  }

  if (Math.abs(vid.currentTime - timeSeconds) > 0.05 && !vid.seeking) {
    vid.currentTime = Math.max(0, timeSeconds);
  }

  return { frame: null, fallbackElement: vid };
}

export function releaseDecoder(url: string) {
  decoderCache.delete(url);
  const v = fallbackVideos.get(url);
  if (v) {
    v.removeAttribute('src');
    v.load();
    fallbackVideos.delete(url);
  }
}
