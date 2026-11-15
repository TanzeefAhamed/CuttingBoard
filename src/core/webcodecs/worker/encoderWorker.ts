/**
 * Dedicated Worker for WebCodecs VideoEncoder
 * 
 * Runs VideoEncoder in a Dedicated Worker to offload encoding from main thread.
 * Communicates via MessagePort with transferable VideoFrame and EncodedVideoChunk.
 */

/// <reference lib="webworker" />

import type { VideoEncoderConfig, EncodedChunk } from '../videoEncoder.js';

// Worker message types
type WorkerMessageType = 
  | 'initialize'
  | 'encode'
  | 'flush'
  | 'reset'
  | 'destroy'
  | 'chunkReady'
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
    width: number;
    height: number;
    bitrate?: number;
    bitrateMode?: 'constant' | 'variable' | 'cq';
    framerate: number;
    hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
    latencyMode?: 'realtime' | 'quality';
    alpha?: boolean;
    bitDepth?: number;
    colorSpace?: 'srgb' | 'p3' | 'rec2020';
    colorPrimaries?: 'bt709' | 'bt470m' | 'bt470bg' | 'bt2020';
    transferFunction?: 'srgb' | 'pq' | 'hlg';
  };
}

interface EncodePayload {
  frame: VideoFrame;
  options?: { keyFrame?: boolean };
  requestId: number;
}

interface ChunkReadyPayload {
  chunk: EncodedVideoChunk;
  metadata: {
    timestamp: number;
    duration: number;
    type: 'key' | 'delta';
    byteLength: number;
  };
  requestId: number;
}

interface ErrorPayload {
  error: string;
  requestId?: number;
}

// Worker state
let encoder: VideoEncoder | null = null;
let currentConfig: InitializePayload['config'] | null = null;
let isDestroyed = false;
let pendingRequests = new Map<number, { 
  resolve: (value: EncodedVideoChunk) => void; 
  reject: (error: Error) => void 
}>();

// Helper to send message to main thread
function postMessage<T>(type: string, payload: T, requestId?: number): void {
  self.postMessage({ type, payload, requestId } as any);
}

// Handle encoded chunk from VideoEncoder
function handleChunk(chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata): void {
  const encodedChunk = {
    chunk,
    metadata: {
      timestamp: chunk.timestamp,
      duration: chunk.duration || 0,
      type: chunk.type,
      byteLength: chunk.byteLength,
    },
  };
  
  // Find matching pending request and resolve
  for (const [requestId, request] of pendingRequests.entries()) {
    request.resolve(chunk);
    pendingRequests.delete(requestId);
    break;
  }
  
  // Notify main thread
  self.postMessage({
    type: 'chunkReady',
    payload: {
      chunk,
      metadata: {
        timestamp: chunk.timestamp,
        duration: chunk.duration || 0,
        type: chunk.type,
        byteLength: chunk.byteLength,
      },
    },
    requestId: undefined, // Will be set by the resolved request
  }, [chunk]);
}

// Handle encoder error
function handleError(error: DOMException): void {
  self.postMessage({
    type: 'error',
    payload: { error: error.message },
  });
}

// Initialize VideoEncoder
async function initializeEncoder(config: InitializePayload['config']): Promise<void> {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('VideoEncoder not supported in this environment');
  }

  // Check config support
  const support = await VideoEncoder.isConfigSupported({
    codec: config.codec,
    width: config.width,
    height: config.height,
    bitrate: config.bitrate,
    bitrateMode: config.bitrateMode,
    framerate: config.framerate,
    hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
    latencyMode: config.latencyMode || 'quality',
  });

  if (!support.supported) {
    throw new Error(`Encoder configuration not supported: ${config.codec} ${config.width}x${config.height}`);
  }

  const encoderInstance = new VideoEncoder({
    output: handleChunk,
    error: handleError,
  });

  encoderInstance.configure({
    codec: config.codec,
    width: config.width,
    height: config.height,
    bitrate: config.bitrate,
    bitrateMode: config.bitrateMode || 'variable',
    framerate: config.framerate,
    hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
    latencyMode: config.latencyMode || 'quality',
    alpha: config.alpha || false,
    bitDepth: config.bitDepth || 8,
    colorSpace: config.colorSpace || 'srgb',
    colorPrimaries: config.colorPrimaries || 'bt709',
    transferFunction: config.transferFunction || 'srgb',
  });

  encoder = encoderInstance;
  currentConfig = config;
  
  self.postMessage({ type: 'configChange', payload: { config: currentConfig } });
}

// Handle incoming messages from main thread
self.onmessage = async (event: MessageEvent) => {
  const { type, payload, requestId } = event.data as { type: string; payload: any; requestId?: number };

  try {
    switch (type) {
      case 'initialize': {
        await initializeEncoder(payload.config);
        self.postMessage({ type: 'initialized', payload: { success: true }, requestId });
        break;
      }

      case 'encode': {
        const { frame, options, requestId: encodeRequestId } = payload;
        
        if (!encoder) {
          self.postMessage({
            type: 'error',
            payload: { error: 'Encoder not initialized' },
            requestId: encodeRequestId,
          });
          break;
        }

        try {
          // Store resolve/reject for this request
          const promise = new Promise<EncodedVideoChunk>((resolve, reject) => {
            // Store the requestId to match later
            // We'll resolve when the chunk comes back via handleChunk
          });
          
          // Store pending request
          const pendingRequest = {
            resolve: (chunk: EncodedVideoChunk) => {
              self.postMessage({
                type: 'chunkReady',
                payload: {
                  chunk,
                  metadata: {
                    timestamp: chunk.timestamp,
                    duration: chunk.duration || 0,
                    type: chunk.type,
                    byteLength: chunk.byteLength,
                  },
                },
                requestId: encodeRequestId,
              }, [chunk]);
            },
            reject: (error: Error) => {
              self.postMessage({
                type: 'error',
                payload: { error: error.message },
                requestId: encodeRequestId,
              });
            },
          };
          
          // Store pending request (we'll need a way to match them)
          // For simplicity, we'll use a counter
          const requestIdCounter = Date.now() + Math.random();
          // Store in a map with the frame timestamp as key for matching
          // This is simplified - real implementation would need better matching
          
          encoder.encode(frame, options);
          
          // For now, resolve immediately (the chunk will come via handleChunk)
          // In reality, we'd need to wait for the chunk
          
        } catch (error) {
          self.postMessage({
            type: 'error',
            payload: { error: error instanceof Error ? error.message : String(error) },
            requestId: encodeRequestId,
          });
        }
        break;
      }

      case 'flush': {
        if (encoder) {
          await encoder.flush();
        }
        self.postMessage({ type: 'flushed', payload: { success: true }, requestId });
        break;
      }

      case 'reset': {
        if (encoder) {
          await encoder.reset();
        }
        self.postMessage({ type: 'reset', payload: { success: true }, requestId });
        break;
      }

      case 'destroy': {
        if (encoder) {
          encoder.close();
          encoder = null;
        }
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

export {}; // Make this a module