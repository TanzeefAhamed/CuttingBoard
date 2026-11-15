/**
 * Injects programmatic test media on boot so that WebCodecs playback and WebGL
 * compositing can be verified without requiring OS native file picker interactions.
 */

import { useStore, type MediaItem } from '../store';
import type { Microseconds } from '../core/timeline/types';

export function initSampleMedia() {
  const store = useStore.getState();

  const hasVideo = store.mediaItems.some((m) => m.id === 'sample-video-clip');
  const hasImage = store.mediaItems.some((m) => m.id === 'sample-image-clip');

  if (!hasVideo) {
    const videoItem: MediaItem = {
      id: 'sample-video-clip',
      name: 'Sample Video (WebCodecs).mp4',
      type: 'video',
      url: '/sample.mp4',
      duration: 12.03,
      width: 1124,
      height: 738,
      createdAt: Date.now(),
    };
    store.addMedia(videoItem);
  }

  if (!hasImage) {
    const imageItem: MediaItem = {
      id: 'sample-image-clip',
      name: 'Sample Graphic.png',
      type: 'image',
      url: '/sample.png',
      width: 640,
      height: 360,
      createdAt: Date.now(),
    };
    store.addMedia(imageItem);
  }

  // If timeline is empty, add the sample video to Track 1
  if (useStore.getState().segments.size === 0) {
    useStore.getState().addMediaToTimeline('sample-video-clip', { start: 0n as Microseconds });
  }
}
