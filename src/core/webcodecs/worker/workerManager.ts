/**
 * Worker Manager - Main thread interface for WebCodecs workers
 * 
 * Manages communication with Dedicated Workers for VideoDecoder and VideoEncoder.
 * Handles message passing, request/response correlation, and lifecycle management.
 */

import type { VideoDecoderConfig, DecodedFrame, VideoEncoderConfig, EncodedChunk } from '../index.js';

// Worker message types
type WorkerMessageType = 
  | 'initialize'
  | 'decode'
  | 'encode'
  | 'flush'
  | 'reset'
  | 'destroy'
  | 'setPlayhead'
  | 'prefetch'
  | 'frameReady'
  | 'chunkReady'
  | 'error'
  | 'initialized'
  | 'flushed'
  | 'reset'
  | 'destroyed'
  | 'configChange';

interface WorkerMessage<T = any> {
  type: WorkerMessageType;
  payload: T;
  requestId?: number;
}

// Worker interface
interface WorkerInterface {
  initialize(config: any): Promise<void>;
  terminate(): void;
  postMessage(message: any, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((error: ErrorEvent) => void) | null;
}

// Request tracking
interface PendingRequest<T = any> {
  resolve: (value: T) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * Manages a Dedicated Worker with request/response correlation
 */
export class WorkerManager {
  private worker: Worker | null = null;
  private workerUrl: string;
  private pendingRequests = new Map<number, PendingRequest<any>>();
  private requestIdCounter = 0;
  private isInitialized = false;
  private eventHandlers = new Map<string, Set<(payload: any) => void>>();
  private initializationPromise: Promise<void> | null = null;

  constructor(workerUrl: string) {
    this.workerUrl = workerUrl;
  }

  /**
   * Initialize the worker
   */
  async initialize(config: any): Promise<void> {
    if (this.worker) {
      throw new Error('Worker already initialized');
    }

    this.worker = new Worker(this.workerUrl, { type: 'module' });
    this.setupEventHandlers();

    return new Promise((resolve, reject) => {
      const requestId = this.nextRequestId();
      this.addPendingRequest(requestId, resolve, reject);

      this.worker!.postMessage({
        type: 'initialize',
        payload: { config },
        requestId,
      });
    });
  }

  /**
   * Set up event handlers for worker messages
   */
  private setupEventHandlers(): void {
    if (!this.worker) return;

    this.worker.onmessage = (event: MessageEvent) => {
      const { type, payload, requestId } = event.data as { type: string; payload: any; requestId?: number };

      // Handle request/response correlation
      if (requestId !== undefined && this.pendingRequests.has(requestId)) {
        const request = this.pendingRequests.get(requestId)!;
        this.pendingRequests.delete(requestId);

        if (type === 'error') {
          request.reject(new Error(payload.error));
        } else {
          request.resolve(payload);
        }
        return;
      }

      // Handle async events (frameReady, chunkReady, error, configChange)
      this.emit(type, payload);
    };

    this.worker.onerror = (error: ErrorEvent) => {
      this.emit('error', new Error(error.message));
    };
  }

  /**
   * Send a message to the worker and wait for response
   */
  async send<T = any>(type: string, payload: any): Promise<T> {
    if (!this.worker || this.worker.terminated) {
      throw new Error('Worker not available');
    }

    return new Promise((resolve, reject) => {
      const requestId = this.nextRequestId();
      this.addPendingRequest(requestId, resolve, reject);

      this.worker!.postMessage({
        type,
        payload,
        requestId,
      });
    });
  }

  /**
   * Send a message without waiting for response (fire and forget)
   */
  postMessage(type: string, payload: any, transfer?: Transferable[]): void {
    if (!this.worker || this.worker.terminated) {
      console.warn('Worker not available for postMessage');
      return;
    }

    this.worker.postMessage({ type, payload }, transfer);
  }

  /**
   * Add event listener for async events
   */
  on(event: string, handler: (payload: any) => void): () => void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);

    // Return unsubscribe function
    return () => {
      this.eventHandlers.get(event)?.delete(handler);
    };
  }

  /**
   * Emit event to all handlers
   */
  private emit(event: string, payload: any): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(payload);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      }
    }
  }

  /**
   * Add pending request with timeout
   */
  private addPendingRequest<T>(requestId: number, resolve: (value: T) => void, reject: (error: Error) => void): void {
    this.pendingRequests.set(requestId, {
      resolve,
      reject,
      timestamp: Date.now(),
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (this.pendingRequests.has(requestId)) {
        this.pendingRequests.delete(requestId);
        reject(new Error('Request timeout'));
      }
    }, 30000);
  }

  /**
   * Generate next request ID
   */
  private nextRequestId(): number {
    return ++this.requestIdCounter;
  }

  /**
   * Terminate the worker
   */
  terminate(): void {
    if (this.worker) {
      this.worker.terminate();
      this.worker = null;
    }
    this.isInitialized = false;
    this.initializationPromise = null;

    // Reject all pending requests
    for (const [, request] of this.pendingRequests) {
      request.reject(new Error('Worker terminated'));
    }
    this.pendingRequests.clear();
  }

  /**
   * Check if worker is initialized
   */
  get initialized(): boolean {
    return this.worker !== null && !this.worker.terminated;
  }
}

/**
 * Decoder Worker Manager - specialized for VideoDecoder
 */
export class DecoderWorkerManager extends WorkerManager {
  private frameCache = new Map<number, VideoFrame>();
  private currentPlayhead = 0;
  private playbackDirection: 'forward' | 'backward' = 'forward';
  private isPlaying = false;

  constructor() {
    super(new URL('../worker/decoderWorker.ts', import.meta.url).toString());
  }

  async initialize(config: { codec: string; hardwareAcceleration?: string; optimizeForLatency?: boolean }): Promise<void> {
    await this.initialize({ config });
  }

  async decode(chunk: EncodedVideoChunk): Promise<VideoFrame> {
    return this.send('decode', { chunk });
  }

  async flush(): Promise<void> {
    await this.send('flush', {});
  }

  async reset(): Promise<void> {
    await this.send('reset', {});
    this.clearFrameCache();
  }

  async destroy(): Promise<void> {
    await this.send('destroy', {});
    this.terminate();
  }

  setPlayhead(timestamp: number, direction: 'forward' | 'backward', isPlaying: boolean): void {
    this.postMessage('setPlayhead', { timestamp, direction, isPlaying });
  }

  prefetch(): void {
    this.postMessage('prefetch', {});
  }

  // Frame cache management
  getFrame(timestamp: number): VideoFrame | undefined {
    return this.frameCache.get(timestamp);
  }

  setFrame(timestamp: number, frame: VideoFrame): void {
    this.frameCache.set(timestamp, frame);
  }

  hasFrame(timestamp: number): boolean {
    return this.frameCache.has(timestamp);
  }

  clearFrameCache(): void {
    this.frameCache.clear();
  }

  // Event handlers
  onFrameReady(handler: (frame: DecodedFrame) => void): () => void {
    return this.on('frameReady', handler);
  }

  onError(handler: (error: Error) => void): () => void {
    return this.on('error', handler);
  }

  onConfigChange(handler: (config: any) => void): () => void {
    return this.on('configChange', handler);
  }
}

/**
 * Encoder Worker Manager - specialized for VideoEncoder
 */
export class EncoderWorkerManager extends WorkerManager {
  constructor() {
    super(new URL('../worker/encoderWorker.ts', import.meta.url).toString());
  }

  async initialize(config: {
    codec: string;
    width: number;
    height: number;
    bitrate?: number;
    bitrateMode?: 'constant' | 'variable' | 'cq';
    framerate: number;
    hardwareAcceleration?: string;
    latencyMode?: 'realtime' | 'quality';
    alpha?: boolean;
    bitDepth?: number;
    colorSpace?: 'srgb' | 'p3' | 'rec2020';
    colorPrimaries?: 'bt709' | 'bt470m' | 'bt470bg' | 'bt2020';
    transferFunction?: 'srgb' | 'pq' | 'hlg';
  }): Promise<void> {
    await this.initialize({ config });
  }

  async encode(frame: VideoFrame, options?: { keyFrame?: boolean }): Promise<EncodedVideoChunk> {
    return this.send('encode', { frame, options });
  }

  async flush(): Promise<void> {
    await this.send('flush', {});
  }

  async reset(): Promise<void> {
    await this.send('reset', {});
  }

  async destroy(): Promise<void> {
    await this.send('destroy', {});
    this.terminate();
  }

  // Event handlers
  onChunkReady(handler: (chunk: EncodedChunk) => void): () => void {
    return this.on('chunkReady', handler);
  }

  onError(handler: (error: Error) => void): () => void {
    return this.on('error', handler);
  }

  onConfigChange(handler: (config: any) => void): () => void {
    return this.on('configChange', handler);
  }
}

/**
 * Combined Pipeline Manager - manages both decoder and encoder workers
 */
export class PipelineManager {
  public decoder: DecoderWorkerManager;
  public encoder: EncoderWorkerManager | null = null;
  private isInitialized = false;

  constructor() {
    this.decoder = new DecoderWorkerManager();
  }

  /**
   * Initialize the decoder pipeline
   */
  async initializeDecoder(config: {
    codec: string;
    hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
    optimizeForLatency?: boolean;
  }): Promise<void> {
    await this.decoder.initialize(config);
    this.isInitialized = true;
  }

  /**
   * Initialize the encoder pipeline
   */
  async initializeEncoder(config: {
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
  }): Promise<void> {
    this.encoder = new EncoderWorkerManager();
    await this.encoder.initialize(config);
  }

  /**
   * Decode a video chunk
   */
  async decode(chunk: EncodedVideoChunk): Promise<VideoFrame> {
    return this.decoder.decode(chunk);
  }

  /**
   * Encode a video frame
   */
  async encode(frame: VideoFrame, options?: { keyFrame?: boolean }): Promise<EncodedVideoChunk> {
    if (!this.encoder) {
      throw new Error('Encoder not initialized');
    }
    return this.encoder.encode(frame, options);
  }

  /**
   * Flush both pipelines
   */
  async flush(): Promise<void> {
    await this.decoder.flush();
    if (this.encoder) {
      await this.encoder.flush();
    }
  }

  /**
   * Reset both pipelines
   */
  async reset(): Promise<void> {
    await this.decoder.reset();
    if (this.encoder) {
      await this.encoder.reset();
    }
  }

  /**
   * Destroy both pipelines
   */
  async destroy(): Promise<void> {
    await this.decoder.destroy();
    if (this.encoder) {
      await this.encoder.destroy();
    }
    this.isInitialized = false;
  }

  /**
   * Set playhead position for prefetching
   */
  setPlayhead(timestamp: number, direction: 'forward' | 'backward', isPlaying: boolean): void {
    this.decoder.setPlayhead(timestamp, direction, isPlaying);
  }

  /**
   * Get decoder frame cache
   */
  getFrameCache() {
    return {
      getFrame: (timestamp: number) => this.decoder.getFrame(timestamp),
      setFrame: (timestamp: number, frame: VideoFrame) => this.decoder.setFrame(timestamp, frame),
      hasFrame: (timestamp: number) => this.decoder.hasFrame(timestamp),
      clear: () => this.decoder.clearFrameCache(),
    };
  }

  // Event handlers
  onFrameReady(handler: (frame: any) => void): () => void {
    return this.decoder.onFrameReady(handler);
  }

  onChunkReady(handler: (chunk: any) => void): () => void {
    return this.encoder?.onChunkReady(handler) ?? (() => {});
  }

  onError(handler: (error: Error) => void): () => void {
    const unsubscribeDecoder = this.decoder.onError(handler);
    const unsubscribeEncoder = this.encoder?.onError(handler) ?? (() => {});
    return () => {
      unsubscribeDecoder();
      unsubscribeEncoder();
    };
  }
}

export { WorkerManager, DecoderWorkerManager, EncoderWorkerManager, PipelineManager };