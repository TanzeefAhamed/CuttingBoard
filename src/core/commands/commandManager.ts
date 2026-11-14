/**
 * Command Manager - Integrates Command Pattern with Timeline
 * Provides high-level API for executing commands with automatic history management.
 */

import { produce } from 'immer';
import { Timeline } from '../timeline/timeline.js';
import { Segment } from '../timeline/segment.js';
import { Track, TrackType } from '../timeline/track.js';
import { TimePoint, TimeRange, Microseconds } from '../timeline/types.js';
import {
  Command,
  CommandHistory,
  createCommandHistory,
  canUndo,
  canRedo,
  pushCommand,
  undoCommand,
  redoCommand,
} from './types.js';
import {
  createAddSegmentCommand,
  createRemoveSegmentCommand,
  createMoveSegmentCommand,
  createSplitSegmentCommand,
  createTrimSegmentCommand,
  createAddTrackCommand,
  createRemoveTrackCommand,
  createReorderTracksCommand,
  createSetPlayheadCommand,
  createSetPlaybackCommand,
  createSetPlaybackSpeedCommand,
  createSetInOutPointsCommand,
  createSetSegmentPropertyCommand,
  PropertyChange,
} from './timelineCommands.js';

export interface CommandManager {
  timeline: Timeline;
  history: CommandHistory;
  
  // Command execution
  executeCommand(command: Command): Timeline;
  
  // Undo/Redo
  undo(): { timeline: Timeline; command: Command } | null;
  redo(): { timeline: Timeline; command: Command } | null;
  
  // Convenience methods for common operations
  addSegment(trackId: string, segment: Segment): Timeline;
  removeSegment(trackId: string, segmentId: string, ripple?: boolean): Timeline;
  moveSegment(trackId: string, segmentId: string, newStart: TimePoint): Timeline;
  splitSegment(trackId: string, segmentId: string, splitTime: TimePoint): Timeline;
  trimSegment(trackId: string, segmentId: string, newTargetRange: TimeRange): Timeline;
  
  addTrack(track: Track): Timeline;
  removeTrack(trackId: string): Timeline;
  reorderTracks(trackIds: string[]): Timeline;
  
  setPlayhead(time: TimePoint): Timeline;
  setPlayback(isPlaying: boolean): Timeline;
  setPlaybackSpeed(speed: number): Timeline;
  setInOutPoints(inPoint?: TimePoint, outPoint?: TimePoint): Timeline;
  
  setSegmentProperty(segmentId: string, propertyPath: string, value: any): Timeline;
  
  // State queries
  canUndo(): boolean;
  canRedo(): boolean;
  getHistory(): CommandHistory;
}

/**
 * Creates a new command manager with the given timeline.
 */
export function createCommandManager(initialTimeline: Timeline, maxHistoryDepth: number = 100): CommandManager {
  const history = createCommandHistory(maxHistoryDepth);
  
  return {
    timeline: initialTimeline,
    history,
    
    executeCommand(command: Command) {
      const newTimeline = command.execute(this.timeline);
      this.history = pushCommand(this.history, command);
      this.timeline = newTimeline;
      return newTimeline;
    },
    
    undo() {
      const result = undoCommand(this.history);
      if (!result) return null;
      
      const undoneTimeline = result.command.undo(this.timeline);
      this.history = result.history;
      this.timeline = undoneTimeline;
      return { timeline: undoneTimeline, command: result.command };
    },
    
    redo() {
      const result = redoCommand(this.history);
      if (!result) return null;
      
      const redoneTimeline = result.command.redo(this.timeline);
      this.history = result.history;
      this.timeline = redoneTimeline;
      return { timeline: redoneTimeline, command: result.command };
    },
    
    // Convenience methods
    addSegment(trackId: string, segment: Segment) {
      const command = createAddSegmentCommand(trackId, segment);
      return this.executeCommand(command);
    },
    
    removeSegment(trackId: string, segmentId: string, ripple: boolean = false) {
      // Need to find the segment first for undo
      const track = this.timeline.tracks.find(t => t.id === trackId);
      const segment = track?.segments.find(s => s.id === segmentId);
      if (!segment) throw new Error(`Segment ${segmentId} not found on track ${trackId}`);
      
      const command = createRemoveSegmentCommand(trackId, segmentId, segment, ripple);
      return this.executeCommand(command);
    },
    
    moveSegment(trackId: string, segmentId: string, newStart: TimePoint) {
      const track = this.timeline.tracks.find(t => t.id === trackId);
      const segment = track?.segments.find(s => s.id === segmentId);
      if (!segment) throw new Error(`Segment ${segmentId} not found on track ${trackId}`);
      
      const oldStart = segment.targetTimerange.start;
      const command = createMoveSegmentCommand(trackId, segmentId, newStart, oldStart);
      return this.executeCommand(command);
    },
    
    splitSegment(trackId: string, segmentId: string, splitTime: TimePoint) {
      const track = this.timeline.tracks.find(t => t.id === trackId);
      const segment = track?.segments.find(s => s.id === segmentId);
      if (!segment) throw new Error(`Segment ${segmentId} not found on track ${trackId}`);
      
      const command = createSplitSegmentCommand(trackId, segmentId, splitTime, segment);
      return this.executeCommand(command);
    },
    
    trimSegment(trackId: string, segmentId: string, newTargetRange: TimeRange) {
      const track = this.timeline.tracks.find(t => t.id === trackId);
      const segment = track?.segments.find(s => s.id === segmentId);
      if (!segment) throw new Error(`Segment ${segmentId} not found on track ${trackId}`);
      
      const command = createTrimSegmentCommand(trackId, segment, newTargetRange);
      return this.executeCommand(command);
    },
    
    addTrack(track: Track) {
      const command = createAddTrackCommand(track);
      return this.executeCommand(command);
    },
    
    removeTrack(trackId: string) {
      const track = this.timeline.tracks.find(t => t.id === trackId);
      if (!track) throw new Error(`Track ${trackId} not found`);
      
      const command = createRemoveTrackCommand(track);
      return this.executeCommand(command);
    },
    
    reorderTracks(trackIds: string[]) {
      const oldOrder = this.timeline.tracks.map(t => t.id);
      const command = createReorderTracksCommand(trackIds, oldOrder);
      return this.executeCommand(command);
    },
    
    setPlayhead(time: TimePoint) {
      const oldTime = this.timeline.playhead;
      const command = createSetPlayheadCommand(time, oldTime);
      return this.executeCommand(command);
    },
    
    setPlayback(isPlaying: boolean) {
      const wasPlaying = this.timeline.isPlaying;
      const command = createSetPlaybackCommand(isPlaying, wasPlaying);
      return this.executeCommand(command);
    },
    
    setPlaybackSpeed(speed: number) {
      const oldSpeed = this.timeline.playbackSpeed;
      const command = createSetPlaybackSpeedCommand(speed, oldSpeed);
      return this.executeCommand(command);
    },
    
    setInOutPoints(inPoint?: TimePoint, outPoint?: TimePoint) {
      const oldInPoint = this.timeline.inPoint;
      const oldOutPoint = this.timeline.outPoint;
      const command = createSetInOutPointsCommand(inPoint, outPoint, oldInPoint, oldOutPoint);
      return this.executeCommand(command);
    },
    
    setSegmentProperty(segmentId: string, propertyPath: string, value: any) {
      // Need to get current value for undo
      let oldValue: any;
      for (const track of this.timeline.tracks) {
        const segment = track.segments.find(s => s.id === segmentId);
        if (segment) {
          oldValue = getNestedProperty(segment, propertyPath);
          break;
        }
      }
      
      const command = createSetSegmentPropertyCommand(segmentId, propertyPath, oldValue, value);
      return this.executeCommand(command);
    },
    
    canUndo() {
      return canUndo(this.history);
    },
    
    canRedo() {
      return canRedo(this.history);
    },
    
    getHistory() {
      return this.history;
    },
  };
}

function getNestedProperty(obj: any, path: string): any {
  const keys = path.split('.');
  let current = obj;
  for (const key of keys) {
    if (!current) return undefined;
    current = current[key];
  }
  return current;
}

/**
 * Creates a command manager with a default empty timeline.
 */
export function createDefaultCommandManager(maxHistoryDepth: number = 100): CommandManager {
  const initialTimeline = {
    id: 'default',
    name: 'Untitled Project',
    fps: { numerator: 30n, denominator: 1n },
    canvasWidth: 1920,
    canvasHeight: 1080,
    backgroundColor: '#000000',
    backgroundMode: 'color' as const,
    blurLevel: 1,
    tracks: [],
    playhead: { value: 0n },
    isPlaying: false,
    playbackSpeed: 1.0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return createCommandManager(initialTimeline, maxHistoryDepth);
}