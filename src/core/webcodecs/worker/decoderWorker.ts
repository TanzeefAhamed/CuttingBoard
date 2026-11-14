/**
 * Dedicated Worker for WebCodecs VideoDecoder
 * 
 * Runs VideoDecoder in a Dedicated Worker to offload decoding from main thread.
 * Communicates via MessagePort with transferable EncodedVideoChunk and VideoFrame.
 */

/// <reference lib="webworker" />

import type { VideoDecoderConfig, DecodedFrame, VideoDecoderEvents } from '../videoDecoder.js';

// Worker message types
type WorkerMessageType = 
  | 'initialize'
  | 'decode'
  | 'flush'
  | 'reset'
  | 'destroy'
  | 'frameReady'
  | 'error'
  | 'configChange';

interface WorkerMessage<T = any> {
  type: WorkerMessageType;
  payload: T;
  requestId?: number;
}

interface InitializePayload {
  config: {
    codec: string;
    hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
    optimizeForLatency?: boolean;
  };
}

interface DecodePayload {
  chunk: EncodedVideoChunk;
  requestId: number;
}

interface FrameReadyPayload {
  frame: VideoFrame;
  timestamp: number;
  duration: number;
  requestId: number;
}

interface ErrorPayload {
  error: string;
  requestId?: number;
}

// Frame pool for reuse
class FramePool {
  private pool: VideoFrame[] = [];
  private maxSize = 16;

  acquire(): VideoFrame | null {
    return this.pool.pop() ?? null;
  }

  release(frame: VideoFrame): void {
    if (this.pool.length < this.maxSize) {
      this.pool.push(frame);
    } else {
      frame.close();
    }
  }

  clear(): void {
    for (const frame of this.pool) {
      frame.close();
    }
    this.pool = [];
  }
}

// LRU Frame Cache with directional prefetch support
class FrameCache {
  private cache = new Map<number, VideoFrame>(); // timestamp -> VideoFrame
  private accessOrder: number[] = []; // timestamps in access order (oldest first)
  private maxSize: number;
  private pendingDecodes = new Set<number>(); // timestamps currently being decoded

  constructor(maxSize: number = 30) {
    this.maxSize = maxSize;
  }

  has(timestamp: number): boolean {
    return this.cache.has(timestamp);
  }

  get(timestamp: number): VideoFrame | undefined {
    const frame = this.cache.get(timestamp);
    if (frame) {
      // Update access order (move to end = most recent)
      this.accessOrder = this.accessOrder.filter(t => t !== timestamp);
      this.accessOrder.push(timestamp);
    }
    return frame;
  }

  set(timestamp: number, frame: VideoFrame): void {
    // If at capacity, evict LRU
    if (this.cache.size >= this.maxSize && !this.cache.has(timestamp)) {
      this.evictLRU();
    }
    
    this.cache.set(timestamp, frame);
    this.accessOrder = this.accessOrder.filter(t => t !== timestamp);
    this.accessOrder.push(timestamp);
  }

  private evictLRU(): void {
    const lruTimestamp = this.accessOrder.shift();
    if (lruTimestamp !== undefined) {
      const frame = this.cache.get(lruTimestamp);
      if (frame) {
        frame.close();
      }
      this.cache.delete(lruTimestamp);
    }
  }

  // Mark timestamp as being decoded (for prefetch tracking)
  markPending(timestamp: number): void {
    this.pendingDecodes.add(timestamp);
  }

  clearPending(timestamp: number): void {
    this.pendingDecodes.delete(timestamp);
  }

  isPending(timestamp: number): boolean {
    return this.pendingDecodes.has(timestamp);
  }

  // Get timestamps that should be prefetched based on current playhead and direction
  getPrefetchCandidates(currentTime: number, direction: 'forward' | 'backward', count: number): number[] {
    const candidates: number[] = [];
    const timestamps = Array.from(this.cache.keys()).sort((a, b) => a - b);
    
    if (direction === 'forward') {
      // Find timestamps after current time
      const future = timestamps.filter(t => t > currentTime && !this.pendingDecodes.has(t));
      candidates.push(...future.slice(0, count));
    } else {
      // Find timestamps before current time
      const past = timestamps.filter(t => t < currentTime && !this.pendingDecodes.has(t)).reverse();
      candidates.push(...past.slice(0, count));
    }
    
    return candidates;
  }

  size(): number {
    return this.cache.size;
  }

  clear(): void {
    for (const frame of this.cache.values()) {
      frame.close();
    }
    this.cache.clear();
    this.accessOrder = [];
    this.pendingDecodes.clear();
  }
}

// Worker state
let decoder: VideoDecoder | null = null;
let framePool = new FramePool();
let frameCache = new FrameCache(30);
let currentConfig: { codec: string; hardwareAcceleration: string; optimizeForLatency: boolean } | null = null;
let isDestroyed = false;
let pendingRequests = new Map<number, { resolve: (value: VideoFrame) => void; reject: (error: Error) => void }>();
let requestIdCounter = 0;
let currentPlayhead = 0;
let playbackDirection: 'forward' | 'backward' = 'forward';
let isPlaying = false;

// Helper to send message to main thread
function postMessage<T>(type: WorkerMessageType, payload: T, requestId?: number): void {
  self.postMessage({ type, payload, requestId } as any, 
    // Transfer VideoFrame if present
    payload && 'frame' in payload ? [payload.frame] : undefined
  );
}

// Handle decoded frame from VideoDecoder
function handleFrame(frame: VideoFrame): void {
  const timestamp = frame.timestamp;
  const duration = frame.duration || 0;
  
  // Add to cache
  frameCache.set(timestamp, frame);
  frameCache.clearPending(timestamp);
  
  // Notify main thread
  postMessage('frameReady', {
    frame,
    timestamp: frame.timestamp,
    duration: frame.duration || 0,
  });
}

// Handle decoder error
function handleError(error: DOMException): void {
  postMessage('error', { error: error.message });
}

// Initialize VideoDecoder
async function initializeDecoder(config: InitializePayload['config']): Promise<void> {
  if (typeof VideoDecoder === 'undefined') {
    throw new Error('VideoDecoder not supported in this environment');
  }

  // Check config support
  const support = await VideoDecoder.isConfigSupported({
    codec: config.codec,
    hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
    optimizeForLatency: config.optimizeForLatency || false,
  });

  if (!support.supported) {
    throw new Error(`Codec configuration not supported: ${config.codec}`);
  }

  currentConfig = {
    codec: config.codec,
    hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
    optimizeForLatency: config.optimizeForLatency || false,
  };

  // Create decoder
  const decoderInstance = new VideoDecoder({
    output: handleFrame,
    error: handleError,
  });

  decoderInstance.configure({
    codec: config.codec,
    hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
    optimizeForLatency: config.optimizeForLatency || false,
  });

  decoder = decoderInstance;
  
  postMessage('configChange', { config: currentConfig });
}

// Process decode queue
function processDecodeQueue(): void {
  // This is handled by VideoDecoder's internal queue
  // We just need to ensure we're feeding it
}

// Handle incoming decode request
function handleDecode(chunk: EncodedVideoChunk, requestId: number): void {
  if (!decoder) {
    postMessage('error', { error: 'Decoder not initialized' }, requestId);
    return;
  }

  try {
    // Store resolve/reject for this request
    const promise = new Promise<VideoFrame>((resolve, reject) => {
      // We'll resolve when the frame comes back via handleFrame
      // Store the requestId to match later
    });
    
    // For now, we'll use a simpler approach: the frame comes back via handleFrame
    // and we need to match it to the request. Since VideoDecoder doesn't give us
    // a direct way to correlate, we'll use the frame's timestamp to match.
    
    // Store the pending request
    pendingRequests.set(requestId, {
      resolve: (frame: VideoFrame) => {
        self.postMessage({
          type: 'frameReady',
          payload: {
            frame,
            timestamp: frame.timestamp,
            duration: frame.duration || 0,
          },
          requestId,
        }, [frame]);
      },
      reject: (error: Error) => {
        self.postMessage({
          type: 'error',
          payload: { error: error.message },
          requestId,
        });
      },
    });

    decoder.decode(chunk);
  } catch (error) {
    postMessage('error', { error: error instanceof Error ? error.message : String(error) }, requestId);
  }
}

// Handle incoming messages from main thread
self.onmessage = async (event: MessageEvent) => {
  const { type, payload, requestId } = event.data as { type: string; payload: any; requestId?: number };

  try {
    switch (type) {
      case 'initialize': {
        await initializeDecoder(payload.config);
        postMessage('initialized', { success: true }, requestId);
        break;
      }

      case 'decode': {
        const { chunk, requestId: decodeRequestId } = payload;
        handleDecode(chunk, decodeRequestId);
        break;
      }

      case 'flush': {
        if (decoder) {
          await decoder.flush();
        }
        postMessage('flushed', { success: true }, requestId);
        break;
      }

      case 'reset': {
        if (decoder) {
          await decoder.reset();
          frameCache.clear();
          framePool = new FramePool();
        }
        postMessage('reset', { success: true }, requestId);
        break;
      }

      case 'destroy': {
        if (decoder) {
          decoder.close();
          decoder = null;
        }
        frameCache.clear();
        framePool = new FramePool();
        pendingRequests.clear();
        isDestroyed = true;
        postMessage('destroyed', { success: true }, requestId);
        break;
      }

      case 'setPlayhead': {
        currentPlayhead = payload.timestamp;
        playbackDirection = payload.direction;
        isPlaying = payload.isPlaying;
        
        // Trigger prefetch
        if (isPlaying) {
          prefetchFrames();
        }
        break;
      }

      case 'prefetch': {
        prefetchFrames();
        break;
      }

      default:
        console.warn('Unknown message type:', type);
    }
  } catch (error) {
    postMessage('error', { 
      error: error instanceof Error ? error.message : String(error),
      requestId 
    });
  }
});

// Prefetch frames based on playhead and direction
function prefetchFrames(): void {
  if (!decoder || isDestroyed || !isPlaying) return;

  const candidates = frameCache.getPrefetchCandidates(currentPlayhead, playbackDirection, 5);
  
  // In a real implementation, we'd request these frames from the demuxer
  // For now, this is a placeholder for the prefetch logic
  console.log('Prefetch candidates:', candidates);
}

// Handle frame from decoder (called by VideoDecoder's output callback)
function handleFrame(frame: VideoFrame): void {
  const timestamp = frame.timestamp;
  const duration = frame.duration || 0;
  
  // Add to cache
  frameCache.set(timestamp, frame);
  
  // Find matching pending request
  // Since we can't directly correlate, we'll broadcast to all pending requests
  // that match this timestamp (simplified approach)
  for (const [requestId, request] of pendingRequests.entries()) {
    // In a real implementation, we'd match by timestamp
    // For now, we'll resolve the first pending request
    request.resolve(frame);
    pendingRequests.delete(requestId);
    break;
  }
  
  // Notify main thread
  postMessage('frameReady', {
    frame,
    timestamp: frame.timestamp,
    duration: frame.duration || 0,
  }, undefined, [frame]);
}

export {}; // Make this a module