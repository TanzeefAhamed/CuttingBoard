/**
 * WebCodecs VideoEncoder Wrapper
 * 
 * Provides a high-level interface for hardware-accelerated video encoding
 * using the WebCodecs API with support for multiple codecs and bitrate modes.
 */

export interface VideoEncoderConfig {
  codec: string;
  width: number;
  height: number;
  bitrate?: number; // bits per second
  bitrateMode?: 'constant' | 'variable' | 'cq'; // CBR, VBR, CQ
  framerate: number; // frames per second
  hardwareAcceleration?: 'prefer-hardware' | 'prefer-software' | 'no-preference';
  latencyMode?: 'realtime' | 'quality';
  alpha?: boolean;
  bitDepth?: number;
  colorSpace?: 'srgb' | 'p3' | 'rec2020';
  colorPrimaries?: 'bt709' | 'bt470m' | 'bt470bg' | 'bt2020';
  transferFunction?: 'srgb' | 'pq' | 'hlg';
}

export interface EncodedChunk {
  chunk: EncodedVideoChunk;
  metadata: {
    timestamp: number; // microseconds
    duration: number; // microseconds
    type: 'key' | 'delta';
    byteLength: number;
  };
}

export interface VideoEncoderEvents {
  onChunk: (chunk: EncodedChunk) => void;
  onError: (error: Error) => void;
}

/**
 * WebCodecs VideoEncoder wrapper with chunk management
 */
export class WebCodecsVideoEncoder {
  private encoder: VideoEncoder | null = null;
  private config: VideoEncoderConfig | null = null;
  private events: VideoEncoderEvents | null = null;
  private pendingChunks = 0;
  private isDestroyed = false;
  private chunkQueue: Array<{ chunk: EncodedVideoChunk; metadata: EncodedChunk['metadata'] }> = [];
  private isProcessing = false;

  /**
   * Check if WebCodecs VideoEncoder is supported
   */
  static isSupported(): boolean {
    return typeof VideoEncoder !== 'undefined';
  }

  /**
   * Check if a codec configuration is supported
   */
  static async isConfigSupported(config: VideoEncoderConfig): Promise<boolean> {
    if (!this.isSupported()) return false;
    
    try {
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
      return support.supported;
    } catch {
      return false;
    }
  }

  /**
   * Initialize the encoder with the given configuration
   */
  async initialize(config: VideoEncoderConfig, events: VideoEncoderEvents): Promise<void> {
    if (!WebCodecsVideoEncoder.isSupported()) {
      throw new Error('WebCodecs VideoEncoder is not supported in this environment');
    }

    const supported = await WebCodecsVideoEncoder.isConfigSupported(config);
    if (!supported) {
      throw new Error(`Encoder configuration not supported: ${config.codec} ${config.width}x${config.height}`);
    }

    this.config = config;
    this.events = events;

    this.encoder = new VideoEncoder({
      output: this.handleChunk.bind(this),
      error: this.handleError.bind(this),
    });

    this.encoder.configure({
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
  }

  /**
   * Encode a video frame
   */
  encode(frame: VideoFrame, options?: { keyFrame?: boolean }): Promise<void> {
    if (!this.encoder || this.isDestroyed) {
      throw new Error('Encoder not initialized or destroyed');
    }

    return new Promise((resolve, reject) => {
      try {
        this.encoder!.encode(frame, options);
        this.pendingChunks++;
        // The chunk will be delivered via the output callback
        // We'll resolve when the chunk is output
        const checkOutput = () => {
          if (this.chunkQueue.length > 0) {
            this.processChunkQueue();
            resolve();
          } else {
            setTimeout(checkOutput, 1);
          }
        };
        checkOutput();
      } catch (error) {
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  /**
   * Process the chunk output queue
   */
  private processChunkQueue(): void {
    while (this.chunkQueue.length > 0) {
      const { chunk, metadata } = this.chunkQueue.shift()!;
      this.pendingChunks--;
      this.events?.onChunk({ chunk, metadata });
    }
  }

  /**
   * Handle encoded chunk from the encoder
   */
  private handleChunk(chunk: EncodedVideoChunk, metadata: EncodedVideoChunkMetadata): void {
    const encodedChunk: EncodedChunk = {
      chunk,
      metadata: {
        timestamp: chunk.timestamp,
        duration: chunk.duration || 0,
        type: chunk.type,
        byteLength: chunk.byteLength,
      },
    };

    this.chunkQueue.push({ chunk, metadata: encodedChunk.metadata });
    this.processChunkQueue();
  }

  /**
   * Handle encoder error
   */
  private handleError(error: DOMException): void {
    this.events?.onError(error);
  }

  /**
   * Flush the encoder - waits for all pending frames to be encoded
   */
  async flush(): Promise<void> {
    if (!this.encoder || this.isDestroyed) return;
    
    await this.encoder.flush();
    
    // Wait for all pending chunks to be processed
    while (this.pendingChunks > 0) {
      await new Promise(resolve => setTimeout(resolve, 1));
    }
  }

  /**
   * Reset the encoder state
   */
  async reset(): Promise<void> {
    if (!this.encoder || this.isDestroyed) return;
    
    await this.encoder.reset();
    this.chunkQueue = [];
    this.pendingChunks = 0;
  }

  /**
   * Get the current encode queue size
   */
  get encodeQueueSize(): number {
    return this.encoder?.encodeQueueSize || 0;
  }

  /**
   * Get the encoder state
   */
  get state(): 'unconfigured' | 'configured' | 'closed' | undefined {
    return this.encoder?.state;
  }

  /**
   * Destroy the encoder and clean up resources
   */
  destroy(): void {
    this.isDestroyed = true;
    
    // Close the encoder
    if (this.encoder) {
      try {
        this.encoder.close();
      } catch {
        // Ignore errors during cleanup
      }
      this.encoder = null;
    }
    
    this.config = null;
    this.events = null;
    this.chunkQueue = [];
    this.pendingChunks = 0;
  }
}

/**
 * Helper to create a VideoEncoder configuration for common codecs
 */
export function createEncoderConfig(preset: 'h264-1080p' | 'h264-4k' | 'hevc-1080p' | 'hevc-4k' | 'av1-1080p' | 'vp9-1080p', options?: Partial<VideoEncoderConfig>): VideoEncoderConfig {
  const presets: Record<string, VideoEncoderConfig> = {
    'h264-1080p': {
      codec: 'avc1.4d0028',
      width: 1920,
      height: 1080,
      bitrate: 10_000_000,
      bitrateMode: 'variable',
      framerate: 30,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'quality',
    },
    'h264-4k': {
      codec: 'avc1.4d0028',
      width: 3840,
      height: 2160,
      bitrate: 40_000_000,
      bitrateMode: 'variable',
      framerate: 30,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'quality',
    },
    'hevc-1080p': {
      codec: 'hev1.2.4.L153.B0',
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
      bitrateMode: 'variable',
      framerate: 30,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'quality',
    },
    'hevc-4k': {
      codec: 'hev1.2.4.L153.B0',
      width: 3840,
      height: 2160,
      bitrate: 30_000_000,
      bitrateMode: 'variable',
      framerate: 30,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'quality',
    },
    'av1-1080p': {
      codec: 'av01.0.08M.08',
      width: 1920,
      height: 1080,
      bitrate: 6_000_000,
      bitrateMode: 'variable',
      framerate: 30,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'quality',
    },
    'vp9-1080p': {
      codec: 'vp09.00.30.08',
      width: 1920,
      height: 1080,
      bitrate: 8_000_000,
      bitrateMode: 'variable',
      framerate: 30,
      hardwareAcceleration: 'prefer-hardware',
      latencyMode: 'quality',
    },
  };

  const base = presets[preset] || presets['h264-1080p'];
  return { ...base, ...options };
}

/**
 * Helper to check if a codec string is valid for VideoEncoder
 */
export function isValidEncoderCodec(codec: string): boolean {
  const validCodecs = [
    'avc1', 'avc3', // H.264
    'hev1', 'hvc1', // HEVC
    'vp09', 'vp9', // VP9
    'av01', 'av1', // AV1
    'vp8', // VP8
  ];
  
  return validCodecs.some(c => codec.startsWith(c)) || /^(avc1|avc3|hev1|hvc1|vp09|vp9|av01|av1|vp8)\./.test(codec);
}