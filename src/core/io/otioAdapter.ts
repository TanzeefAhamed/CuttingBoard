/**
 * OpenTimelineIO (OTIO) Adapter
 * 
 * Provides import/export functionality for OTIO format using otio.js (WASM).
 * Supports FCPXML, AAF, EDL, and other OTIO-supported formats.
 */

import { Timeline } from '../timeline/timeline.js';
import { Segment } from '../timeline/segment.js';
import { Track } from '../timeline/track.js';
import { TimePoint, TimeRange, Microseconds, µs, RationalTime } from '../timeline/types.js';

/**
 * OTIO Adapter for interoperability with professional NLEs.
 * Uses otio.js (OpenTimelineIO compiled to WASM) when available.
 */

export interface OTIOAdapter {
  /**
   * Export timeline to OTIO format (returns OTIO JSON string).
   */
  exportToOTIO(timeline: Timeline): string;
  
  /**
   * Import timeline from OTIO format.
   */
  importFromOTIO(otioJson: string): Timeline;
  
  /**
   * Export to FCPXML format (requires OTIO).
   */
  exportToFCPXML(timeline: Timeline): string;
  
  /**
   * Export to AAF format (requires OTIO).
   */
  exportToAAF(timeline: Timeline): string;
  
  /**
   * Export to EDL format (requires OTIO).
   */
  exportToEDL(timeline: Timeline): string;
}

/**
 * Creates an OTIO adapter.
 * If otio.js is not available, returns a stub that throws informative errors.
 */
export function createOTIOAdapter(): OTIOAdapter {
  let otioModule: any = null;
  let otioLoaded = false;

  async function loadOTIO(): Promise<any> {
    if (otioLoaded) return otioModule;
    
    try {
      // Try to load otio.js dynamically
      // In a real implementation, this would be: import('otio.js')
      // For now, we'll use a dynamic import pattern
      const module = await import('otio.js');
      otioModule = module;
      otioLoaded = true;
      return otioModule;
    } catch (error) {
      console.warn('otio.js not available. Install with: npm install otio.js');
      throw new Error('otio.js not available. Install with: npm install otio.js');
    }
  }

  function serializeRationalTime(rate: RationalTime): any {
    return {
      value: Number(rate.numerator) / Number(rate.denominator),
      rate: {
        numerator: Number(rate.numerator),
        denominator: Number(rate.denominator),
      },
    };
  }

  function serializeTimeRange(range: TimeRange, rate: RationalTime): any {
    const fps = Number(rate.numerator) / Number(rate.denominator);
    return {
      start_time: {
        value: Number(range.start.value) / 1_000_000 * fps,
        rate: { numerator: Number(rate.numerator), denominator: Number(rate.denominator) },
      },
      duration: {
        value: Number(range.duration) / 1_000_000 * fps,
        rate: { numerator: Number(rate.numerator), denominator: Number(rate.denominator) },
      },
    };
  }

  function serializeTransform(transform: any): any {
    return {
      translation: { x: transform.position.x, y: transform.position.y },
      scale: { x: transform.scale.x, y: transform.scale.y },
      rotation: transform.rotation,
      anchor_point: { x: transform.anchor.x, y: transform.anchor.y },
    };
  }

  return {
    async exportToOTIO(timeline: Timeline): Promise<string> {
      const otio = await loadOTIO();
      
      // Create OTIO timeline
      const otioTimeline = new otio.Timeline({
        name: timeline.name,
        global_start_time: otio.RationalTime(0, 1),
        tracks: [],
      });

      for (const track of timeline.tracks) {
        const otioTrack = new otio.Track({
          name: track.name,
          kind: track.type === 'video' ? 'Video' : track.type === 'audio' ? 'Audio' : 'Text',
        });

        for (const segment of track.segments) {
          const mediaRef = segment.media;
          
          // Create clip
          const clip = new otio.Clip({
            name: mediaRef.metadata?.name || mediaRef.id,
            source_range: otio.TimeRange(
              otio.RationalTime(
                Number(segment.sourceTimerange.start.value) / 1_000_000 * 
                (Number(timeline.fps.numerator) / Number(timeline.fps.denominator)),
                1
              ),
              otio.RationalTime(
                Number(segment.sourceTimerange.duration) / 1_000_000 * 
                (Number(timeline.fps.numerator) / Number(timeline.fps.denominator)),
                1
              )
            ),
            media_reference: new otio.ExternalReference({
              target_url: mediaRef.url,
              available_range: otio.TimeRange(
                otio.RationalTime(0, 1),
                otio.RationalTime(
                  Number(mediaRef.duration) / 1_000_000 * 
                  (Number(timeline.fps.numerator) / Number(timeline.fps.denominator)),
                  1
                )
              ),
            }),
          });

          // Add to track at correct position
          const startTime = otio.RationalTime(
            Number(segment.targetTimerange.start.value) / 1_000_000 * 
            (Number(timeline.fps.numerator) / Number(timeline.fps.denominator)),
            1
          );
          otioTrack.append(clip, startTime);
        }

        otioTimeline.tracks.push(otioTrack);
      }

      // Serialize to JSON
      return otio.adapters.write_to_string(otioTimeline, 'json');
    },

    async importFromOTIO(otioJson: string): Promise<Timeline> {
      const otio = await loadOTIO();
      
      // Parse OTIO JSON
      const otioTimeline = otio.adapters.read_from_string(otioJson, 'json');
      
      // Convert to our timeline format
      // This is a simplified implementation
      const timeline: Timeline = {
        id: otioTimeline.name || crypto.randomUUID(),
        name: otioTimeline.name || 'Imported from OTIO',
        fps: { numerator: 30n, denominator: 1n },
        canvasWidth: 1920,
        canvasHeight: 1080,
        backgroundColor: '#000000',
        backgroundMode: 'color',
        blurLevel: 1,
        tracks: [],
        playhead: { value: 0n } as any,
        isPlaying: false,
        playbackSpeed: 1.0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };

      // TODO: Full OTIO import implementation
      console.warn('OTIO import not fully implemented yet');
      
      return timeline;
    },

    async exportToFCPXML(timeline: Timeline): Promise<string> {
      const otio = await loadOTIO();
      
      // First export to OTIO, then convert to FCPXML
      const otioJson = await this.exportToOTIO(timeline);
      const otioTimeline = otio.adapters.read_from_string(otioJson, 'json');
      
      return otio.adapters.write_to_string(otioTimeline, 'fcpxml');
    },

    async exportToAAF(timeline: Timeline): Promise<string> {
      const otio = await loadOTIO();
      
      const otioJson = await this.exportToOTIO(timeline);
      const otioTimeline = otio.adapters.read_from_string(otioJson, 'json');
      
      return otio.adapters.write_to_string(otioTimeline, 'aaf');
    },

    async exportToEDL(timeline: Timeline): Promise<string> {
      const otio = await loadOTIO();
      
      const otioJson = await this.exportToOTIO(timeline);
      const otioTimeline = otio.adapters.read_from_string(otioJson, 'json');
      
      return otio.adapters.write_to_string(otioTimeline, 'edl');
    },
  };
}

/**
 * Synchronous OTIO adapter for simple cases (when otio.js is pre-loaded).
 */
export function createSyncOTIOAdapter(otioModule: any): OTIOAdapter {
  return {
    exportToOTIO(timeline: Timeline): string {
      // Synchronous implementation using pre-loaded otio
      throw new Error('Synchronous OTIO adapter not implemented yet');
    },
    
    importFromOTIO(otioJson: string): Timeline {
      throw new Error('Synchronous OTIO adapter not implemented yet');
    },
    
    exportToFCPXML(timeline: Timeline): string {
      throw new Error('Synchronous OTIO adapter not implemented yet');
    },
    
    exportToAAF(timeline: Timeline): string {
      throw new Error('Synchronous OTIO adapter not implemented yet');
    },
    
    exportToEDL(timeline: Timeline): string {
      throw new Error('Synchronous OTIO adapter not implemented yet');
    },
  };
}

/**
 * Simple EDL export without OTIO dependency.
 * Exports a basic CMX 3600 EDL format.
 */
export function exportToEDLSimple(timeline: Timeline): string {
  const lines: string[] = [];
  
  lines.push('TITLE: ' + timeline.name);
  lines.push('FCM: NON-DROP FRAME');
  lines.push('');
  
  let eventNum = 1;
  
  for (const track of timeline.tracks) {
    if (track.type !== 'video') continue;
    
    for (const segment of track.segments) {
      if (segment.media.type !== 'video') continue;
      
      const sourceStart = segment.sourceTimerange.start.value;
      const sourceEnd = segment.sourceTimerange.end.value;
      const recordStart = segment.targetTimerange.start.value;
      const recordEnd = segment.targetTimerange.end.value;
      
      // Convert microseconds to timecode (assuming 30fps)
      const fps = 30;
      const toTimecode = (us: bigint): string => {
        const totalFrames = Number(us) / 1_000_000 * 30;
        const hours = Math.floor(totalFrames / (30 * 60 * 60));
        const minutes = Math.floor((totalFrames % (30 * 60 * 60)) / (30 * 60));
        const seconds = Math.floor((totalFrames % (30 * 60)) / 30);
        const frames = Math.floor(totalFrames % 30);
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}:${frames.toString().padStart(2, '0')}`;
      };
      
      lines.push(
        `${eventNum.toString().padStart(4, '0')}  ` +
        `V     C        ${toTimecode(sourceStart)} ${toTimecode(sourceEnd)} ` +
        `${toTimecode(recordStart)} ${toTimecode(recordEnd)}` +
        ` * FROM CLIP NAME: ${segment.media.metadata?.name || segment.media.id}`
      );
      
      eventNum++;
    }
    
    return lines.join('\n');
  }
}

/**
 * Simple AAF export placeholder.
 */
export function exportToAAFSimple(timeline: Timeline): string {
  // AAF is complex binary format - would need proper library
  return `// AAF export not implemented without otio.js
// Timeline: ${timeline.name}
// Tracks: ${timeline.tracks.length}
`;
}

/**
 * Format detection for timeline files.
 */
export function detectTimelineFormat(filePath: string): 'capcut' | 'otio' | 'fcpxml' | 'aaf' | 'edl' | 'unknown' {
  const ext = filePath.toLowerCase().split('.').pop();
  const name = filePath.toLowerCase();
  
  if (name.includes('draft_content.json')) return 'capcut';
  if (ext === 'otio') return 'otio';
  if (ext === 'fcpxml') return 'fcpxml';
  if (ext === 'aaf') return 'aaf';
  if (ext === 'edl') return 'edl';
  return 'unknown';
}

export { Timeline } from '../timeline/timeline.js';