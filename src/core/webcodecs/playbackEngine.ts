/**
 * WebCodecs Playback Engine
 * 
 * High-level playback engine that manages video decoding, frame scheduling,
 * and rendering to a canvas. Supports variable speed, seeking, and frame-accurate
 * control for NLE-style playback.
 */

import { WebCodecsVideoDecoder, DecodedFrame, VideoDecoderConfig, createEncodedVideoChunk, isValidCodec } from './videoDecoder.js';
import { WebCodecsVideoEncoder, VideoEncoderConfig, EncodedChunk, createEncoderConfig } from './videoEncoder.js';

export interface PlaybackEngineConfig {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  videoElement?: HTMLVideoElement; // Fallback for unsupported browsers
  decoderConfig: VideoDecoderConfig;
  enableHardwareAcceleration?: boolean;
}

export interface PlaybackState {
  currentTime: number; // microseconds
  duration: number; // microseconds
  playbackRate: number; // 1.0 = normal
  isPlaying: boolean;
  bufferedStart: number; // microseconds
  bufferedEnd: number; // microseconds
}

export interface PlaybackEvents {
  onTimeUpdate: (currentTime: number) => void;
  onStateChange: (state: PlaybackState) => void;
  onError: (error: Error) => void;
  onFrameReady: (frame: VideoFrame, timestamp: number) => void;
  onBufferUpdate: (start: number, end: number) => void;
  onEnded: () => void;
}

export interface DemuxedSample {
  data: Uint8Array;
  timestamp: number; // microseconds
  duration: number; // microseconds
  isKeyFrame: boolean;
  codec: string;
}

/**
 * Simple in-memory demuxer for testing
 * In production, this would be replaced with a proper MP4/WebM demuxer
 */
export class SimpleDemuxer {
  private samples: DemuxedSample[] = [];
  private currentIndex = 0;
  private codec = '';
  private duration = 0;

  constructor(samples: DemuxedSample[]) {
    this.samples = samples.sort((a, b) => a.timestamp - b.timestamp);
    this.codec = samples[0]?.codec || 'avc1.4d0028';
    this.duration = samples.length > 0 
      ? Math.max(...samples.map(s => s.timestamp + s.duration)) 
      : 0;
  }

  getCodec(): string {
    return this.codec;
  }

  getDuration(): number {
    return this.duration;
  }

  getSampleAtTime(time: number): DemuxedSample | null {
    // Find the sample at or before the given time
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (this.samples[i].timestamp <= time) {
        return this.samples[i];
      }
    }
    return this.samples[0] || null;
  }

  getNextSample(currentIndex: number): DemuxedSample | null {
    if (currentIndex + 1 < this.samples.length) {
      return this.samples[currentIndex + 1];
    }
    return null;
  }

  getKeyFrameBeforeTime(time: number): DemuxedSample | null {
    for (let i = this.samples.length - 1; i >= 0; i--) {
      if (this.samples[i].timestamp <= time && this.samples[i].isKeyFrame) {
        return this.samples[i];
      }
    }
    return null;
  }

  reset(): void {
    this.currentIndex = 0;
  }
}

/**
 * Frame scheduler for smooth playback at variable speeds
 */
export class FrameScheduler {
  private targetFPS: number;
  private frameInterval: number; // microseconds
  private lastFrameTime = 0;
  private accumulatedTime = 0;
  private playbackRate = 1.0;
  private isRunning = false;
  private animationFrameId: number | null = null;
  private lastPerformanceTime = 0;

  constructor(targetFPS: number = 60) {
    this.targetFPS = targetFPS;
    this.frameInterval = Math.round(1_000_000 / targetFPS); // microseconds
  }

  setPlaybackRate(rate: number): void {
    this.playbackRate = Math.max(0.01, Math.min(100, rate));
  }

  getPlaybackRate(): number {
    return this.playbackRate;
  }

  setTargetFPS(fps: number): void {
    this.targetFPS = fps;
    this.frameInterval = Math.round(1_000_000 / fps);
  }

  start(onTick: (deltaTime: number, currentTime: number) => void): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastPerformanceTime = performance.now();
    this.tick(onTick);
  }

  stop(): void {
    this.isRunning = false;
    if (this.animationFrameId !== null) {
      cancelAnimationFrame(this.animationFrameId);
      this.animationFrameId = null;
    }
  }

  private tick(callback: (deltaTime: number, currentTime: number) => void): void {
    if (!this.isRunning) return;

    const now = performance.now();
    const deltaMs = now - this.lastPerformanceTime;
    this.lastPerformanceTime = now;

    // Convert to microseconds and apply playback rate
    const deltaTime = Math.round(deltaMs * 1000 * this.playbackRate);
    this.accumulatedTime += deltaTime;

    const currentTime = Date.now() * 1000; // Approximate current time in microseconds

    if (this.accumulatedTime >= this.frameInterval) {
      callback(this.accumulatedTime, currentTime);
      this.accumulatedTime = 0;
    }

    this.animationFrameId = requestAnimationFrame(() => this.tick(callback));
  }

  seek(time: number): void {
    this.accumulatedTime = 0;
  }

  reset(): void {
    this.accumulatedTime = 0;
    this.lastPerformanceTime = 0;
  }
}

/**
 * Main Playback Engine
 */
export class PlaybackEngine {
  private config: PlaybackEngineConfig;
  private events: PlaybackEvents | null = null;
  private decoder: WebCodecsVideoDecoder | null = null;
  private scheduler: FrameScheduler;
  private demuxer: SimpleDemuxer | null = null;
  private state: PlaybackState;
  private currentFrame: VideoFrame | null = null;
  private pendingSeek: number | null = null;
  private isDestroyed = false;
  private mediaSource: MediaSource | null = null;
  private sourceBuffer: SourceBuffer | null = null;

  constructor(config: PlaybackEngineConfig) {
    this.config = config;
    this.scheduler = new FrameScheduler(60);
    this.state = {
      currentTime: 0,
      duration: 0,
      playbackRate: 1.0,
      isPlaying: false,
      bufferedStart: 0,
      bufferedEnd: 0,
    };
  }

  /**
   * Initialize the playback engine with a demuxer
   */
  async initialize(demuxer: SimpleDemuxer, events: PlaybackEvents): Promise<void> {
    this.events = events;
    this.demuxer = demuxer;
    this.state.duration = demuxer.getDuration();

    // Check codec support
    const codec = demuxer.getCodec();
    if (!isValidCodec(codec)) {
      throw new Error(`Unsupported codec: ${codec}`);
    }

    // Initialize decoder
    this.decoder = new WebCodecsVideoDecoder();
    const decoderConfig: VideoDecoderConfig = {
      codec: demuxer.getCodec(),
      hardwareAcceleration: this.config.enableHardwareAcceleration !== false ? 'prefer-hardware' : 'prefer-software',
      optimizeForLatency: true,
    };

    await this.decoder.initialize(decoderConfig, {
      onFrame: this.handleDecodedFrame.bind(this),
      onError: this.handleDecoderError.bind(this),
    });

    // Set up canvas
    const canvas = this.config.canvas;
    const ctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    if (!ctx) {
      throw new Error('Could not get 2D context from canvas');
    }

    // Set canvas size to match video
    const firstSample = demuxer.getSampleAtTime(0);
    if (firstSample) {
      // Note: In real implementation, we'd parse width/height from codec data
      canvas.width = 1920;
      canvas.height = 1080;
    }

    // Update state
    this.state.duration = demuxer.getDuration();
    this.state.bufferedEnd = demuxer.getDuration();
    this.events?.onStateChange({ ...this.state });
    this.events?.onBufferUpdate(0, this.state.duration);
  }

  /**
   * Handle decoded frame from decoder
   */
  private handleDecodedFrame(frame: DecodedFrame): void {
    if (this.isDestroyed) return;

    this.currentFrame = frame.frame;
    this.state.currentTime = frame.timestamp;
    
    // Render frame to canvas
    this.renderFrame(frame.frame);
    
    // Notify events
    this.events?.onFrameReady(frame.frame, frame.timestamp);
    this.events?.onTimeUpdate(frame.timestamp);
    this.events?.onStateChange({ ...this.state });
  }

  /**
   * Handle decoder error
   */
  private handleDecoderError(error: Error): void {
    this.events?.onError(error);
  }

  /**
   * Render a video frame to the canvas
   */
  private renderFrame(frame: VideoFrame): void {
    const canvas = this.config.canvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw frame
    ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
  }

  /**
   * Play the video
   */
  play(): void {
    if (this.state.isPlaying || this.isDestroyed) return;
    
    this.state.isPlaying = true;
    this.scheduler.setPlaybackRate(this.state.playbackRate);
    this.scheduler.start(this.handleSchedulerTick.bind(this));
    this.events?.onStateChange({ ...this.state });
  }

  /**
   * Pause the video
   */
  pause(): void {
    if (!this.state.isPlaying) return;
    
    this.state.isPlaying = false;
    this.scheduler.stop();
    this.events?.onStateChange({ ...this.state });
  }

  /**
   * Toggle play/pause
   */
  togglePlay(): void {
    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Handle scheduler tick
   */
  private handleSchedulerTick(deltaTime: number, currentTime: number): void {
    if (this.isDestroyed || !this.state.isPlaying || !this.demuxer) return;

    // Update current time based on playback rate
    this.state.currentTime += Math.round(deltaTime * this.state.playbackRate);
    
    // Check if we've reached the end
    if (this.state.currentTime >= this.state.duration) {
      this.state.currentTime = this.state.duration;
      this.pause();
      this.events?.onEnded();
      return;
    }

    // Handle pending seek
    if (this.pendingSeek !== null) {
      this.performSeek(this.pendingSeek);
      this.pendingSeek = null;
      return;
    }

    // Get next sample to decode
    const nextTime = this.state.currentTime;
    const sample = this.demuxer!.getSampleAtTime(nextTime);
    
    if (sample) {
      // Create encoded chunk
      const chunk = createEncodedVideoChunk(sample.data, {
        timestamp: sample.timestamp,
        duration: sample.duration,
        type: sample.isKeyFrame ? 'key' : 'delta',
      });

      // Decode the chunk
      this.decoder!.decode(chunk).catch(error => {
        this.events?.onError(error);
      });
    }
  }

  /**
   * Perform a seek operation
   */
  private performSeek(targetTime: number): void {
    if (!this.demuxer || !this.decoder) return;

    // Clamp to valid range
    targetTime = Math.max(0, Math.min(targetTime, this.state.duration));
    
    // Find keyframe before target time
    const keyFrame = this.demuxer!.getKeyFrameBeforeTime(targetTime);
    if (!keyFrame) return;

    // Reset decoder
    this.decoder!.reset().then(() => {
      // Decode from keyframe
      const chunk = createEncodedVideoChunk(keyFrame.data, {
        timestamp: keyFrame.timestamp,
        duration: keyFrame.duration,
        type: 'key',
      });
      
      this.state.currentTime = keyFrame.timestamp;
      this.decoder!.decode(chunk).catch(error => {
        this.events?.onError(error);
      });
    });
  }

  /**
   * Seek to a specific time
   */
  seek(time: number): void {
    if (this.isDestroyed) return;
    
    time = Math.max(0, Math.min(time, this.state.duration));
    this.pendingSeek = time;
    
    // If not playing, decode the frame immediately
    if (!this.state.isPlaying) {
      this.performSeek(time);
    }
  }

  /**
   * Set playback rate
   */
  setPlaybackRate(rate: number): void {
    rate = Math.max(0.01, Math.min(100, rate));
    this.state.playbackRate = rate;
    this.scheduler.setPlaybackRate(rate);
    this.events?.onStateChange({ ...this.state });
  }

  /**
   * Get current playback state
   */
  getState(): PlaybackState {
    return { ...this.state };
  }

  /**
   * Get current frame for external rendering
   */
  getCurrentFrame(): VideoFrame | null {
    return this.currentFrame;
  }

  /**
   * Destroy the playback engine
   */
  destroy(): void {
    this.isDestroyed = true;
    this.scheduler.stop();
    
    if (this.decoder) {
      this.decoder.destroy();
      this.decoder = null;
    }
    
    if (this.currentFrame) {
      this.currentFrame.close();
      this.currentFrame = null;
    }
    
    this.demuxer = null;
    this.events = null;
  }
}

/**
 * Create a playback engine for a video file
 * This is a factory function that handles the full pipeline
 */
export async function createPlaybackEngine(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  videoSource: { samples: DemuxedSample[] },
  events: PlaybackEvents
): Promise<PlaybackEngine> {
  const config: PlaybackEngineConfig = {
    canvas,
    decoderConfig: { codec: '', hardwareAcceleration: 'prefer-hardware' }, // Will be overridden
    enableHardwareAcceleration: true,
  };

  const demuxer = new SimpleDemuxer(videoSource.samples);
  const codec = demuxer.getCodec();
  
  const configWithCodec: PlaybackEngineConfig = {
    ...config,
    decoderConfig: { ...config.decoderConfig, codec },
  };

  const engine = new PlaybackEngine(configWithCodec);
  await engine.initialize(demuxer, events);
  
  return engine;
}

/**
 * Export current frame as image data
 */
export function exportFrameAsImageData(frame: VideoFrame, format: 'png' | 'jpeg' = 'png', quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const canvas = new OffscreenCanvas(frame.displayWidth, frame.displayHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      reject(new Error('Could not get OffscreenCanvas context'));
      return;
    }
    
    ctx.drawImage(frame, 0, 0);
    
    canvas.convertToBlob({ type: `image/${format}`, quality }).then(resolve).catch(reject);
   });
 }

/**
 * Calculate optimal canvas size for a video frame
 */
export function calculateCanvasSize(frame: VideoFrame, maxWidth: number, maxHeight: number): { width: number; height: number } {
  const aspectRatio = frame.displayWidth / frame.displayHeight;
  
  let width = frame.displayWidth;
  let height = frame.displayHeight;
  
  if (width > maxWidth) {
    width = maxWidth;
    height = width / aspectRatio;
  }
  
  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspectRatio;
  }
  
  return { width: Math.round(width), height: Math.round(height) };
}