/**
 * WebCodecs VideoDecoder Wrapper
 * 
 * Provides a high-level interface for hardware-accelerated video decoding
 * using the WebCodecs API with proper frame management and error handling.
 */

export interface VideoDecoderConfig {
  codec: string;
  hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
  optimizeForLatency?: boolean;
}

export interface DecodedFrame {
  frame: VideoFrame;
  timestamp: number; // microseconds
  duration: number; // microseconds
}

export interface VideoDecoderEvents {
  onFrame: (frame: DecodedFrame) => void;
  onError: (error: Error) => void;
  onConfigChange: (config: VideoDecoderConfig) => void;
}

/**
 * WebCodecs VideoDecoder wrapper with frame pool management
 */
export class WebCodecsVideoDecoder {
  private decoder: VideoDecoder | null = null;
  private config: VideoDecoderConfig | null = null;
  private events: VideoDecoderEvents | null = null;
  private framePool: VideoFrame[] = [];
  private pendingFrames = 0;
  private isDestroyed = false;
  private decodeQueue: Array<{ chunk: EncodedVideoChunk; resolve: (frame: VideoFrame) => void; reject: (error: Error) => void }> = [];
  private isProcessing = false;

  /**
   * Check if WebCodecs is supported in the current environment
   */
  static isSupported(): boolean {
    return typeof VideoDecoder !== 'undefined' && typeof EncodedVideoChunk !== 'undefined';
  }

  /**
   * Check if a codec configuration is supported
   */
  static async isConfigSupported(config: VideoDecoderConfig): Promise<boolean> {
    if (!this.isSupported()) return false;
    
    try {
      const support = await VideoDecoder.isConfigSupported({
        codec: config.codec,
        hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
        optimizeForLatency: config.optimizeForLatency || false,
      });
      return support.supported;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the decoder with the given configuration
   */
  async initialize(config: VideoDecoderConfig, events: VideoDecoderEvents): Promise<void> {
    if (!WebCodecsVideoDecoder.isSupported()) {
      throw new Error('WebCodecs VideoDecoder is not supported in this environment');
    }

    const supported = await WebCodecsVideoDecoder.isConfigSupported(config);
    if (!supported) {
      throw new Error(`Codec configuration not supported: ${config.codec}`);
    }

    this.config = config;
    this.events = events;

    this.decoder = new VideoDecoder({
      output: this.handleFrame.bind(this),
      error: this.handleError.bind(this),
    });

    this.decoder.configure({
      codec: config.codec,
      hardwareAcceleration: config.hardwareAcceleration || 'prefer-hardware',
      optimizeForLatency: config.optimizeForLatency || false,
    });

    // Process any queued chunks
    this.processQueue();
  }

  /**
   * Decode an encoded video chunk
   * Returns a promise that resolves with the decoded frame
   */
  decode(chunk: EncodedVideoChunk): Promise<VideoFrame> {
    if (!this.decoder || this.isDestroyed) {
      throw new Error('Decoder not initialized or destroyed');
    }

    return new Promise((resolve, reject) => {
      this.decodeQueue.push({ chunk, resolve, reject });
      this.processQueue();
    });
  }

  /**
   * Process the decode queue
   */
  private processQueue(): void {
    if (this.isProcessing || this.decodeQueue.length === 0 || !this.decoder || this.isDestroyed) {
      return;
    }

    this.isProcessing = true;

    while (this.decodeQueue.length > 0 && this.decoder.decodeQueueSize < 8) {
      const { chunk, resolve, reject } = this.decodeQueue.shift()!;
      
      try {
        this.decoder.decode(chunk);
        // The frame will be delivered via the output callback
        // We store the resolve/reject for when the frame arrives
        this.pendingFrames++;
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    }

    this.isProcessing = false;
  }

  /**
   * Handle decoded frame from the decoder
   */
  private handleFrame(frame: VideoFrame): void {
    this.pendingFrames--;
    
    const decodedFrame: DecodedFrame = {
      frame,
      timestamp: frame.timestamp,
      duration: frame.duration || 0,
    };

    this.events?.onFrame(decodedFrame);
    
    // Return frame to pool after a short delay to allow rendering
    setTimeout(() => {
      if (!this.isDestroyed) {
        this.returnFrameToPool(frame);
      }
    }, 0);
  }

  /**
   * Handle decoder error
   */
  private handleError(error: DOMException): void {
    this.events?.onError(error);
  }

  /**
   * Get a frame from the pool or create a new one
   */
  private getFrameFromPool(): VideoFrame | null {
    return this.framePool.pop() || null;
  }

  /**
   * Return a frame to the pool for reuse
   */
  private returnFrameToPool(frame: VideoFrame): void {
    if (this.framePool.length < 16) { // Limit pool size
      this.framePool.push(frame);
    } else {
      frame.close();
    }
  }

  /**
   * Flush the decoder - waits for all pending frames to be output
   */
  async flush(): Promise<void> {
    if (!this.decoder || this.isDestroyed) return;
    
    await this.decoder.flush();
    
    // Wait for all pending frames to be processed
    while (this.pendingFrames > 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  /**
   * Reset the decoder state
   */
  async reset(): Promise<void> {
    if (!this.decoder || this.isDestroyed) return;
    
    await this.decoder.reset();
    this.decodeQueue = [];
    this.pendingFrames = 0;
  }

  /**
   * Get the current decode queue size
   */
  get decodeQueueSize(): number {
    return this.decoder?.decodeQueueSize || 0;
  }

  /**
   * Get the decoder state
   */
  get state(): 'unconfigured' | 'configured' | 'closed' | undefined {
    return this.decoder?.state;
  }

  /**
   * Destroy the decoder and clean up resources
   */
  destroy(): void {
    this.isDestroyed = true;
    
    // Close all pooled frames
    for (const frame of this.framePool) {
      frame.close();
    }
    this.framePool = [];
    
    // Reject all pending decode requests
    for (const { reject } of this.decodeQueue) {
      reject(new Error('Decoder destroyed'));
    }
    this.decodeQueue = [];
    
    // Close the decoder
    if (this.decoder) {
      try {
        this.decoder.close();
      } catch {
        // Ignore errors during cleanup
      }
      this.decoder = null;
    }
    
    this.config = null;
    this.events = null;
  }
}

/**
 * Helper to create an EncodedVideoChunk from raw data
 */
export function createEncodedVideoChunk(data: Uint8Array, options: {
  timestamp: number; // microseconds
  duration?: number; // microseconds
  type: 'key' | 'delta';
}): EncodedVideoChunk {
  return new EncodedVideoChunk({
    type: options.type,
    timestamp: options.timestamp,
    duration: options.duration,
    data,
  });
}

/**
 * Helper to check if a codec string is valid for VideoDecoder
 */
export function isValidCodec(codec: string): boolean {
  const validCodecs = [
    'avc1.42001e', 'avc1.42001f', 'avc1.42e01e', 'avc1.42e01f', // H.264
    'avc1.4d401e', 'avc1.4d401f', 'avc1.4d4028', // H.264 High
    'hev1.1.6.L93.90', 'hev1.2.4.L153.B0', // HEVC
    'hvc1.1.6.L93.90', 'hvc1.2.4.L153.B0',
    'vp09.00.10.08', 'vp09.00.20.08', 'vp09.00.30.08', // VP9
    'vp09.10.10.08', 'vp09.10.20.08', 'vp09.10.30.08',
    'av01.0.00M.08', 'av01.0.01M.08', 'av01.0.04M.08', 'av01.0.05M.08', // AV1
    'av01.0.08M.08', 'av01.0.09M.08', 'av01.1.04M.08', 'av01.1.05M.08',
  ];
  
  // Check for exact match or prefix match
  return validCodecs.some(c => codec.startsWith(c)) || /^(avc1|avc3|hev1|hvc1|vp09|vp9|av01|av1)\./.test(codec);
}