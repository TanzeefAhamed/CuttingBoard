/**
 * Shared pool of decoded media elements keyed by URL. The compositor draws from
 * these elements; the playback clock keeps their currentTime in sync.
 */

type PoolEl = HTMLVideoElement | HTMLAudioElement | HTMLImageElement;

const pool = new Map<string, PoolEl>();

export function getMedia(url: string, type: 'video' | 'audio' | 'image' | 'text' | 'shape'): PoolEl | null {
  if (type === 'text' || type === 'shape') return null;
  const key = `${type}:${url}`;
  let el = pool.get(key);
  if (el) return el;
  if (type === 'image') {
    const img = new Image();
    img.src = url;
    el = img;
  } else {
    const m = document.createElement(type) as HTMLVideoElement | HTMLAudioElement;
    m.preload = 'auto';
    m.src = url;
    if (m instanceof HTMLVideoElement) m.playsInline = true;
    el = m;
  }
  pool.set(key, el);
  return el;
}

export function getPooledElements(): PoolEl[] {
  return Array.from(pool.values());
}

export function pauseAll() {
  for (const el of pool.values()) {
    if (!(el instanceof HTMLImageElement) && !el.paused) el.pause();
  }
}

export function isDrawable(el: PoolEl | null): el is HTMLVideoElement | HTMLImageElement {
  if (!el) return false;
  if (el instanceof HTMLImageElement) return el.complete && el.naturalWidth > 0;
  if (el instanceof HTMLVideoElement) return el.readyState >= 2 && el.videoWidth > 0;
  return false;
}

/** Drop pooled elements whose URL is no longer referenced. */
export function releaseUnused(liveUrls: Set<string>) {
  for (const [key, el] of pool) {
    const url = key.slice(key.indexOf(':') + 1);
    if (!liveUrls.has(url)) {
      if (!(el instanceof HTMLImageElement)) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
      pool.delete(key);
    }
  }
}
