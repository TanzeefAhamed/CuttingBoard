/**
 * CapCut Draft JSON Parser & Serializer
 * 
 * Handles bidirectional compatibility with CapCut's native project structure
 * (`draft_content.json` and `draft_meta_info.json`).
 */

import Ajv, { JSONSchemaType } from 'ajv';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { Timeline } from '../timeline/timeline.js';
import { Segment } from '../timeline/segment.js';
import { Track, TrackType } from '../timeline/track.js';
import { TimePoint, TimeRange, Microseconds, µs, RationalTime, FRAMERATES } from '../timeline/types.js';
import { MediaReference, SegmentTransform, BlendMode } from '../timeline/segment.js';
import * as capcutSchema from './capcutSchema.json' with { type: 'json' };

// Type definitions for CapCut draft structure
export interface CapCutDraftContent {
  canvas_config: { width: number; height: number; ratio: string };
  color_space: number;
  config: Record<string, any>;
  cover: { type: string; cover_id: string };
  create_time: number;
  duration: number;
  extra_info: Record<string, any>;
  fps: number;
  free_render_index_mode_on: boolean;
  group_container: { maps: Array<{ id: string; sub_id: string }> };
  id: string;
  is_drop_frame_timecode: boolean;
  keyframe_graph_list: any[];
  keyframes: any[];
  last_modified_platform: number;
  lyrics_effects: any[];
  materials: CapCutMaterials;
  mutable_config: Record<string, any>;
  name: string;
  new_version: string;
  path: string;
  platform: string;
  relationships: CapCutRelationship[];
  render_index_track_mode_on: boolean;
  retouch_cover: Record<string, any>;
  source: Record<string, any>;
  static_cover_image_path: string;
  time_marks: any[];
  tracks: CapCutTrack[];
  uneven_animation_template_info: Record<string, any>;
  update_time: number;
  version: string;
}

export interface CapCutMaterials {
  audios: CapCutAudio[];
  videos: CapCutVideo[];
  images: CapCutImage[];
  texts: CapCutText[];
  stickers: CapCutSticker[];
  effects: CapCutEffect[];
  transitions: CapCutTransition[];
  [key: string]: any[];
}

export interface CapCutAudio {
  id: string;
  type: string;
  path: string;
  duration: number;
  name?: string;
  width?: number;
  height?: number;
  [key: string]: any;
}

export interface CapCutVideo {
  id: string;
  type: string;
  path: string;
  duration: number;
  width: number;
  height: number;
  name?: string;
  fps?: number;
  [key: string]: any;
}

export interface CapCutImage {
  id: string;
  type: string;
  path: string;
  width: number;
  height: number;
  duration: number;
  name?: string;
  [key: string]: any;
}

export interface CapCutText {
  id: string;
  type: string;
  content: string;
  font: string;
  style: Record<string, any>;
  [key: string]: any;
}

export interface CapCutSticker {
  id: string;
  type: string;
  resource_id: string;
  [key: string]: any;
}

export interface CapCutEffect {
  id: string;
  type: string;
  [key: string]: any;
}

export interface CapCutTransition {
  id: string;
  type: string;
  [key: string]: any;
}

export interface CapCutTrack {
  id: string;
  type: string;
  flag: number;
  segments: CapCutSegment[];
}

export interface CapCutSegment {
  id: string;
  material_id: string;
  target_timerange: { start: number; duration: number };
  source_timerange: { start: number; duration: number };
  clip?: Record<string, any>;
  caption_info?: Record<string, any>;
  cartoon?: Record<string, any>;
  color_correct_alg_result?: Record<string, any>;
  common_keyframes?: Record<string, any>;
  desc?: string;
  digital_human_template_group_id?: string;
  enable_adjust?: boolean;
  enable_adjust_mask?: boolean;
  enable_color_correct_adjust?: boolean;
  enable_color_curves?: boolean;
  enable_color_match_adjust?: boolean;
  enable_color_wheels?: boolean;
  enable_hsl?: boolean;
  enable_lut?: boolean;
  enable_smart_color_adjust?: boolean;
  enable_video_mask?: boolean;
  extra_material_refs?: any[];
  group_id?: string;
  hdr_settings?: Record<string, any>;
  intensifies_audio?: boolean;
  is_loop?: boolean;
  is_placeholder?: boolean;
  is_tone_modify?: boolean;
  keyframe_refs?: any[];
  last_nonzero_volume?: number;
  lyric_keyframes?: any[];
  raw_segment_id?: string;
  render_index?: number;
  render_timerange?: { start: number; duration: number };
  responsive_layout?: Record<string, any>;
  reverse?: boolean;
  speed?: number;
  state?: number;
  template_id?: string;
  template_scene?: Record<string, any>;
  track_attribute?: number;
  track_render_index?: number;
  uniform_scale?: Record<string, any>;
  visible?: boolean;
  volume?: number;
  [key: string]: any;
}

export interface CapCutRelationship {
  id: string;
  material_id: string;
  target_timerange: { start: number; duration: number };
}

export interface CapCutMetaInfo {
  draft_id: string;
  draft_name: string;
  tm_draft_create: number;
  tm_draft_modified: number;
  draft_root_path: string;
  draft_fold_path: string;
  draft_timeline_materials_size?: number;
}

/**
 * Parser for CapCut draft files.
 */
export class CapCutDraftParser {
  private ajv: Ajv;
  private validate: (data: any) => boolean;

  constructor() {
    this.ajv = new Ajv({ strict: false, allErrors: true });
    this.validate = this.ajv.compile(capcutSchema as JSONSchemaType<CapCutDraftContent>);
  }

  /**
   * Parse a CapCut draft_content.json file.
   */
  parseDraftContent(jsonString: string): CapCutDraftContent {
    const data = JSON.parse(jsonString);
    if (!this.validate(data)) {
      throw new Error(`Invalid CapCut draft: ${this.ajv.errorsText(this.validate.errors)}`);
    }
    return data;
  }

  /**
   * Parse a CapCut draft_meta_info.json file.
   */
  parseMetaInfo(jsonString: string): CapCutMetaInfo {
    return JSON.parse(jsonString);
  }

  /**
   * Convert CapCut draft to internal Timeline model.
   */
  draftToTimeline(draft: CapCutDraftContent, meta?: CapCutMetaInfo): Timeline {
    const fps = draft.fps ? FRAMERATES[draft.fps.toString()] || FRAMERATES['30'] : FRAMERATES['30'];
    
    const timeline = {
      id: meta?.draft_id || draft.id || crypto.randomUUID(),
      name: meta?.draft_name || draft.name || 'Untitled',
      fps,
      canvasWidth: draft.canvas_config?.width || 1920,
      canvasHeight: draft.canvas_config?.height || 1080,
      backgroundColor: '#000000',
      backgroundMode: 'color' as const,
      blurLevel: 1,
      tracks: [] as any[],
      playhead: { value: 0n } as any,
      isPlaying: false,
      playbackSpeed: 1.0,
      createdAt: meta?.tm_draft_create || draft.create_time || Date.now(),
      updatedAt: meta?.tm_draft_modified || draft.update_time || Date.now(),
    };

    // Build material lookup maps
    const materialMaps = {
      videos: new Map(draft.materials.videos?.map(v => [v.id, v]) || []),
      audios: new Map(draft.materials.audios?.map(a => [a.id, a]) || []),
      images: new Map(draft.materials.images?.map(i => [i.id, i]) || []),
      texts: new Map(draft.materials.texts?.map(t => [t.id, t]) || []),
      stickers: new Map(draft.materials.stickers?.map(s => [s.id, s]) || []),
    };

    // Convert tracks
    for (const capcutTrack of draft.tracks) {
      const trackType = this.mapTrackType(capcutTrack.type);
      const track = {
        id: capcutTrack.id,
        name: `${trackType} ${capcutTrack.flag}`,
        type: trackType,
        isPrimary: capcutTrack.flag === 0 && trackType === 'video',
        rippleEnabled: capcutTrack.flag === 0 && trackType === 'video',
        order: capcutTrack.flag,
        locked: false,
        visible: true,
        muted: false,
        volume: 1.0,
        segments: [] as any[],
      };

      // Convert segments
      for (const capcutSegment of capcutTrack.segments) {
        const material = this.findMaterial(capcutSegment.material_id, materialMaps);
        if (!material) {
          console.warn(`Material ${capcutSegment.material_id} not found for segment ${capcutSegment.id}`);
          continue;
        }

        const segment = this.convertSegment(capcutSegment, material, capcutTrack.type);
        track.segments.push(segment);
      }

      // Sort segments by target start time
      track.segments.sort((a: any, b: any) => Number(a.targetTimerange.start.value - b.targetTimerange.start.value));
      timeline.tracks.push(track);
    }

    // Sort tracks by order
    timeline.tracks.sort((a: any, b: any) => a.order - b.order);

    return timeline;
  }

  private mapTrackType(capcutType: string): TrackType {
    switch (capcutType) {
      case 'video': return 'video';
      case 'audio': return 'audio';
      case 'text': return 'text';
      case 'adjustment': return 'adjustment';
      default: return 'video';
    }
  }

  private findMaterial(materialId: string, materialMaps: any): any {
    for (const map of Object.values(materialMaps)) {
      if (map.has(materialId)) return map.get(materialId);
    }
    return null;
  }

  private convertSegment(capcutSegment: CapCutSegment, material: any, trackType: string): Segment {
    const mediaRef: MediaReference = {
      id: material.id,
      type: this.mapMaterialType(trackType, material.type),
      url: material.path,
      duration: µs(material.duration || 0),
      metadata: material,
    };

    const transform = this.extractTransform(capcutSegment);

    return {
      id: capcutSegment.id,
      trackId: '', // Will be set by timeline
      type: trackType,
      targetTimerange: {
        start: { value: µs(capcutSegment.target_timerange.start) } as any,
        duration: µs(capcutSegment.target_timerange.duration),
      } as any,
      sourceTimerange: {
        start: { value: µs(capcutSegment.source_timerange.start) } as any,
        duration: µs(capcutSegment.source_timerange.duration),
      } as any,
      media: mediaRef,
      transform,
      isFreezeFrame: false,
      reverse: capcutSegment.reverse || false,
      speed: capcutSegment.speed || 1.0,
      instanceId: crypto.randomUUID(),
    };
  }

  private mapMaterialType(trackType: string, materialType: string): 'video' | 'audio' | 'image' | 'text' {
    if (trackType === 'video') return 'video';
    if (trackType === 'audio') return 'audio';
    if (trackType === 'text') return 'text';
    if (trackType === 'image' || materialType === 'image') return 'image';
    return 'video';
  }

  private extractTransform(segment: CapCutSegment): SegmentTransform {
    return {
      position: { x: segment.clip?.x || 0, y: segment.clip?.y || 0 },
      scale: { x: segment.clip?.scale_x || 1, y: segment.clip?.scale_y || 1 },
      rotation: segment.clip?.rotation || 0,
      anchor: { x: 0.5, y: 0.5 },
      opacity: segment.volume !== undefined ? segment.volume : 1,
      blendMode: 'normal' as BlendMode,
    };
  }
}

/**
 * Serializer for CapCut draft files.
 */
export class CapCutDraftSerializer {
  private parser: CapCutDraftParser;

  constructor() {
    this.parser = new CapCutDraftParser();
  }

  /**
   * Convert internal Timeline to CapCut draft format.
   */
  timelineToDraft(timeline: Timeline): { content: CapCutDraftContent; meta: CapCutMetaInfo } {
    const content: CapCutDraftContent = {
      canvas_config: {
        width: timeline.canvasWidth,
        height: timeline.canvasHeight,
        ratio: `${timeline.canvasWidth}:${timeline.canvasHeight}`,
      },
      color_space: 0,
      config: {},
      cover: { type: 'none', cover_id: '' },
      create_time: timeline.createdAt,
      duration: Number(timeline.duration || 0),
      extra_info: {},
      fps: timeline.fps.numerator === 30n ? 30 : 
           timeline.fps.numerator === 60n ? 60 :
           timeline.fps.numerator === 24n ? 24 : 30,
      free_render_index_mode_on: false,
      group_container: { maps: [] },
      id: timeline.id,
      is_drop_frame_timecode: false,
      keyframe_graph_list: [],
      keyframes: [],
      last_modified_platform: 0,
      lyrics_effects: [],
      materials: this.extractMaterials(timeline),
      mutable_config: {},
      name: timeline.name,
      new_version: '1.0',
      path: '',
      platform: 'windows',
      relationships: this.extractRelationships(timeline),
      render_index_track_mode_on: false,
      retouch_cover: {},
      source: {},
      static_cover_image_path: '',
      time_marks: [],
      tracks: this.extractTracks(timeline),
      uneven_animation_template_info: {},
      update_time: timeline.updatedAt,
      version: '1.0',
    };

    const meta: CapCutMetaInfo = {
      draft_id: timeline.id,
      draft_name: timeline.name,
      tm_draft_create: timeline.createdAt,
      tm_draft_modified: timeline.updatedAt,
      draft_root_path: '',
      draft_fold_path: '',
    };

    return { content, meta };
  }

  private extractMaterials(timeline: Timeline): CapCutMaterials {
    const materials: CapCutMaterials = {
      audios: [],
      videos: [],
      images: [],
      texts: [],
      stickers: [],
      effects: [],
      transitions: [],
    };

    const seenMaterials = new Set<string>();

    for (const track of timeline.tracks) {
      for (const segment of track.segments) {
        const materialId = segment.media.id;
        if (seenMaterials.has(materialId)) continue;
        seenMaterials.add(materialId);

        const media = segment.media;
        const baseMaterial = {
          id: media.id,
          type: media.type,
          path: media.url,
          duration: Number(media.duration),
          name: media.metadata?.name || '',
        };

        switch (media.type) {
          case 'video':
            materials.videos.push({
              ...baseMaterial,
              width: media.metadata?.width || 1920,
              height: media.metadata?.height || 1080,
              fps: media.metadata?.fps || 30,
            });
            break;
          case 'audio':
            materials.audios.push(baseMaterial);
            break;
          case 'image':
            materials.images.push({
              ...baseMaterial,
              width: media.metadata?.width || 1920,
              height: media.metadata?.height || 1080,
            });
            break;
          case 'text':
            materials.texts.push({
              ...baseMaterial,
              content: media.metadata?.content || '',
              font: media.metadata?.font || 'Arial',
              style: media.metadata?.style || {},
            });
            break;
        }
      }
    }

    return materials;
  }

  private extractRelationships(timeline: Timeline): CapCutRelationship[] {
    const relationships: CapCutRelationship[] = [];

    for (const track of timeline.tracks) {
      for (const segment of track.segments) {
        relationships.push({
          id: segment.id,
          material_id: segment.media.id,
          target_timerange: {
            start: Number(segment.targetTimerange.start.value),
            duration: Number(segment.targetTimerange.duration),
          },
        });
      }
    }

    return relationships;
  }

  private extractTracks(timeline: Timeline): CapCutTrack[] {
    return timeline.tracks.map(track => ({
      id: track.id,
      type: track.type,
      flag: track.order,
      segments: track.segments.map(segment => ({
        id: segment.id,
        material_id: segment.media.id,
        target_timerange: {
          start: Number(segment.targetTimerange.start.value),
          duration: Number(segment.targetTimerange.duration),
        },
        source_timerange: {
          start: Number(segment.sourceTimerange.start.value),
          duration: Number(segment.sourceTimerange.duration),
        },
        clip: {
          x: segment.transform.position.x,
          y: segment.transform.position.y,
          scale_x: segment.transform.scale.x,
          scale_y: segment.transform.scale.y,
          rotation: segment.transform.rotation,
        },
        volume: segment.transform.opacity,
        speed: segment.speed,
        reverse: segment.reverse,
        visible: segment.transform.opacity > 0,
      })),
    }));
  }

  /**
   * Write draft files to disk.
   */
  writeDraft(timeline: Timeline, outputDir: string): void {
    const { content, meta } = this.timelineToDraft(timeline);
    
    // Create output directory
    mkdirSync(outputDir, { recursive: true });
    
    // Write draft_content.json
    writeFileSync(
      join(outputDir, 'draft_content.json'),
      JSON.stringify(content, null, 2),
      'utf-8'
    );
    
    // Write draft_meta_info.json
    writeFileSync(
      join(outputDir, 'draft_meta_info.json'),
      JSON.stringify(meta, null, 2),
      'utf-8'
    );
  }
}

/**
 * High-level API for CapCut draft import/export.
 */
export class CapCutDraftIO {
  private parser: CapCutDraftParser;
  private serializer: CapCutDraftSerializer;

  constructor() {
    this.parser = new CapCutDraftParser();
    this.serializer = new CapCutDraftSerializer();
  }

  /**
   * Import a CapCut project from a folder.
   */
  importProject(projectDir: string): { timeline: Timeline; content: CapCutDraftContent; meta: CapCutMetaInfo } {
    const contentPath = join(projectDir, 'draft_content.json');
    const metaPath = join(projectDir, 'draft_meta_info.json');

    if (!existsSync(contentPath)) {
      throw new Error(`draft_content.json not found in ${projectDir}`);
    }

    const contentJson = readFileSync(contentPath, 'utf-8');
    const content = this.parser.parseDraftContent(contentJson);

    let meta: CapCutMetaInfo = {
      draft_id: content.id,
      draft_name: content.name,
      tm_draft_create: content.create_time,
      tm_draft_modified: content.update_time,
      draft_root_path: projectDir,
      draft_fold_path: projectDir,
    };

    if (existsSync(metaPath)) {
      const metaJson = readFileSync(metaPath, 'utf-8');
      meta = this.parser.parseMetaInfo(metaJson);
    }

    const timeline = this.parser.draftToTimeline(content, meta);
    return { timeline, content, meta };
  }

  /**
   * Export a timeline to a CapCut-compatible project folder.
   */
  exportProject(timeline: Timeline, outputDir: string): void {
    this.serializer.writeDraft(timeline, outputDir);
  }

  /**
   * Validate a CapCut draft file without importing.
   */
  validateDraft(projectDir: string): { valid: boolean; errors?: string } {
    try {
      const contentPath = join(projectDir, 'draft_content.json');
      const contentJson = readFileSync(contentPath, 'utf-8');
      this.parser.parseDraftContent(contentJson);
      return { valid: true };
    } catch (error) {
      return { valid: false, errors: error instanceof Error ? error.message : String(error) };
    }
  }
}