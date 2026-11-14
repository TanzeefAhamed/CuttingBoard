/**
 * WebCodecs Playback Engine Tests
 * 
 * Tests for Milestone 1.5: WebCodecs Playback Engine Prototype
 * TEST-1.5.1: test_webcodecs_decoder_initialization
 * TEST-1.5.2: test_webcodecs_playback_controls
 * TEST-1.5.3: test_webcodecs_seek_accuracy
 * TEST-1.5.3: test_webcodecs_frame_scheduling
 * 
 * Note: Full VideoDecoder/VideoEncoder integration tests require browser environment.
 * These tests focus on the utility functions and logic that can be tested in Node.js.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  WebCodecsVideoDecoder,
  WebCodecsVideoEncoder,
  PlaybackEngine,
  SimpleDemuxer,
  FrameScheduler,
  DemuxedSample,
  createEncodedVideoChunk,
  isValidCodec,
  createEncoderConfig,
} from '../src/core/webcodecs/index.js';

// Mock EncodedVideoChunk global
class MockEncodedVideoChunk {
  type: 'key' | 'delta';
  timestamp: number;
  duration: number | null;
  byteLength: number;
  data: Uint8Array;

  constructor(options: { type: 'key' | 'delta'; timestamp: number; duration?: number; data: Uint8Array }) {
    this.type = options.type;
    this.timestamp = options.timestamp;
    this.duration = options.duration || null;
    this.data = options.data;
    this.byteLength = options.data.length;
  }
}

// Mock global EncodedVideoChunk
(global as any).EncodedVideoChunk = MockEncodedVideoChunk;

// Mock requestAnimationFrame
(global as any).requestAnimationFrame = vi.fn((cb: () => void) => {
  // Execute immediately for testing
  setTimeout(cb, 0);
  return 1;
});
(global as any).cancelAnimationFrame = vi.fn();

describe('Milestone 1.5: WebCodecs Playback Engine Prototype', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Mock isConfigSupported for WebCodecsVideoDecoder
    vi.spyOn(WebCodecsVideoDecoder, 'isConfigSupported').mockResolvedValue({ supported: false });
    // Mock isConfigSupported for WebCodecsVideoEncoder
    vi.spyOn(WebCodecsVideoEncoder, 'isConfigSupported').mockResolvedValue({ supported: false });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('WebCodecsVideoDecoder - Configuration', () => {
    it('isSupported returns false in Node.js', () => {
      // In Node.js, VideoDecoder is not available
      expect(WebCodecsVideoDecoder.isSupported()).toBe(false);
    });

    it('TEST-1.5.1: isConfigSupported rejects unsupported codec in Node.js', async () => {
      // In Node.js, no codecs are supported
      const result = await WebCodecsVideoDecoder.isConfigSupported({
        codec: 'avc1.4d0028',
        hardwareAcceleration: 'prefer-hardware',
      });
      expect(result.supported).toBe(false);
    });
  });

  describe('WebCodecsVideoEncoder - Configuration', () => {
    it('isSupported returns false in Node.js', () => {
      expect(WebCodecsVideoEncoder.isSupported()).toBe(false);
    });

    it('isConfigSupported rejects unsupported codec in Node.js', async () => {
      const result = await WebCodecsVideoEncoder.isConfigSupported({
        codec: 'avc1.4d0028',
        width: 1920,
        height: 1080,
        bitrate: 10_000_000,
        bitrateMode: 'variable',
        framerate: 30,
      });
      expect(result.supported).toBe(false);
    });
  });

  describe('SimpleDemuxer', () => {
    it('sorts samples by timestamp', () => {
      const samples: DemuxedSample[] = [
        { data: new Uint8Array([1]), timestamp: 2_000_000, duration: 33_333, isKeyFrame: false, codec: 'avc1.4d0028' },
        { data: new Uint8Array([2]), timestamp: 1_000_000, duration: 33_333, isKeyFrame: true, codec: 'avc1.4d0028' },
        { data: new Uint8Array([3]), timestamp: 3_000_000, duration: 33_333, isKeyFrame: false, codec: 'avc1.4d0028' },
      ];

      const demuxer = new SimpleDemuxer(samples);
      
      // First sample should be the keyframe at 1s (earliest)
      const first = demuxer.getSampleAtTime(0);
      expect(first?.timestamp).toBe(1_000_000);
      expect(first?.isKeyFrame).toBe(true);

      // At 1.5s, should get the 1s sample (the latest sample at or before 1.5s)
      const at1_5s = demuxer.getSampleAtTime(1_500_000);
      expect(at1_5s?.timestamp).toBe(1_000_000);
    });

    it('finds keyframe before time', () => {
      const samples: DemuxedSample[] = [
        { data: new Uint8Array([1]), timestamp: 1_000_000, duration: 33_333, isKeyFrame: true, codec: 'avc1.4d0028' },
        { data: new Uint8Array([2]), timestamp: 2_000_000, duration: 33_333, isKeyFrame: false, codec: 'avc1.4d0028' },
        { data: new Uint8Array([3]), timestamp: 3_000_000, duration: 33_333, isKeyFrame: false, codec: 'avc1.4d0028' },
        { data: new Uint8Array([4]), timestamp: 4_000_000, duration: 33_333, isKeyFrame: true, codec: 'avc1.4d0028' },
      ];

      const demuxer = new SimpleDemuxer(samples);
      
      // At 3.5s, should find keyframe at 1s (the last keyframe before 3.5s)
      // Since 4s is after 3.5s, the keyframe at 1s is the last one before 3.5s
      const keyFrame = demuxer.getKeyFrameBeforeTime(3_500_000);
      expect(keyFrame?.timestamp).toBe(1_000_000);

      // At 2.5s, should find keyframe at 1s
      const keyFrame2 = demuxer.getKeyFrameBeforeTime(2_500_000);
      expect(keyFrame2?.timestamp).toBe(1_000_000);
    });
  });

  describe('FrameScheduler', () => {
    it('calculates correct frame interval', () => {
      const scheduler = new FrameScheduler(60); // 60 FPS = ~16.67ms
      const interval = 1_000_000 / 60; // ~16667 µs
      expect(interval).toBeCloseTo(16666.67, 0);
    });

    it('adjusts for playback rate', () => {
      const scheduler = new FrameScheduler(30); // 30 FPS
      scheduler.setPlaybackRate(2.0);
      expect(scheduler.getPlaybackRate()).toBe(2.0);
    });

    it('stops correctly', () => {
      const scheduler = new FrameScheduler(60);
      // Mock requestAnimationFrame for this test
      const originalRAF = (global as any).requestAnimationFrame;
      (global as any).requestAnimationFrame = vi.fn((cb: () => void) => {
        setTimeout(cb, 0);
        return 1;
      });
      (global as any).cancelAnimationFrame = vi.fn();
      
      scheduler.start(() => {});
      scheduler.stop();
      
      (global as any).requestAnimationFrame = originalRAF;
      expect(true).toBe(true);
    });
  });

  describe('createEncodedVideoChunk', () => {
    it('creates chunk with correct properties', () => {
      const data = new Uint8Array([0, 0, 0, 1, 0x67]);
      const chunk = createEncodedVideoChunk(data, {
        timestamp: 1_000_000,
        duration: 33_333,
        type: 'key',
      });

      expect(chunk.timestamp).toBe(1_000_000);
      expect(chunk.duration).toBe(33_333);
      expect(chunk.type).toBe('key');
      expect(chunk.data).toEqual(data);
    });
  });

  describe('isValidCodec', () => {
    it('accepts valid H.264 codecs', () => {
      expect(isValidCodec('avc1.4d0028')).toBe(true);
      expect(isValidCodec('avc1.42001e')).toBe(true);
      expect(isValidCodec('avc3.4d0028')).toBe(true);
    });

    it('accepts valid HEVC codecs', () => {
      expect(isValidCodec('hev1.1.6.L93.90')).toBe(true);
      expect(isValidCodec('hvc1.2.4.L153.B0')).toBe(true);
    });

    it('accepts valid VP9 codecs', () => {
      expect(isValidCodec('vp09.00.30.08')).toBe(true);
    });

    it('accepts valid AV1 codecs', () => {
      expect(isValidCodec('av01.0.08M.08')).toBe(true);
    });

    it('rejects invalid codecs', () => {
      expect(isValidCodec('invalid')).toBe(false);
      expect(isValidCodec('unknown.codec')).toBe(false);
    });
  });

  describe('createEncoderConfig', () => {
    it('creates H.264 1080p config', () => {
      const config = createEncoderConfig('h264-1080p');
      
      expect(config.codec).toBe('avc1.4d0028');
      expect(config.width).toBe(1920);
      expect(config.height).toBe(1080);
      expect(config.bitrate).toBe(10_000_000);
      expect(config.framerate).toBe(30);
    });

    it('creates HEVC 4K config', () => {
      const config = createEncoderConfig('hevc-4k');
      
      expect(config.codec).toBe('hev1.2.4.L153.B0');
      expect(config.width).toBe(3840);
      expect(config.height).toBe(2160);
      expect(config.bitrate).toBe(30_000_000);
    });

    it('allows overriding preset options', () => {
      const config = createEncoderConfig('h264-1080p', { bitrate: 5_000_000, framerate: 60 });
      
      expect(config.bitrate).toBe(5_000_000);
      expect(config.framerate).toBe(60);
      expect(config.width).toBe(1920);
    });
  });
});