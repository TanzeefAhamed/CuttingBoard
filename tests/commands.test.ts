/**
 * Undo/Redo Command System Tests
 * 
 * Tests for Milestone 1.3: Transactional Undo/Redo System (Immer)
 * TEST-8.4: test_undo_redo_transactional_rollback
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { produce } from 'immer';
import {
  createCommandHistory,
  canUndo,
  canRedo,
  pushCommand,
  undoCommand,
  redoCommand,
} from '../src/core/commands/types.js';
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
} from '../src/core/commands/timelineCommands.js';
import {
  createCommandManager,
  createDefaultCommandManager,
} from '../src/core/commands/commandManager.js';
import { createTimeline, createPrimaryVideoTrack, createVideoTrack, createAudioTrack } from '../src/core/timeline/timeline.js';
import { createSegment, TrackType } from '../src/core/timeline/segment.js';
import { TimePoint, TimeRange, Microseconds, µs } from '../src/core/timeline/types.js';
import { Track } from '../src/core/timeline/track.js';

describe('Milestone 1.3: Transactional Undo/Redo System (Immer)', () => {
  const testMedia = {
    id: 'media-1',
    type: 'video' as const,
    url: 'file:///test.mp4',
    duration: 10_000_000n as Microseconds,
  };

  describe('Command History', () => {
    it('creates empty history', () => {
      const history = createCommandHistory(100);
      expect(history.past).toEqual([]);
      expect(history.future).toEqual([]);
      expect(history.maxDepth).toBe(100);
    });

    it('canUndo returns false for empty history', () => {
      const history = createCommandHistory(100);
      expect(canUndo(history)).toBe(false);
    });

    it('canRedo returns false for empty history', () => {
      const history = createCommandHistory(100);
      expect(canRedo(history)).toBe(false);
    });

    it('pushCommand adds to past and clears future', () => {
      const history = createCommandHistory(100);
      const command = { id: '1', description: 'test', timestamp: Date.now(), execute: (t: any) => t, undo: (t: any) => t, redo: (t: any) => t };
      
      const newHistory = pushCommand(history, command);
      expect(newHistory.past.length).toBe(1);
      expect(newHistory.future.length).toBe(0);
    });

    it('undoCommand moves command from past to future', () => {
      const history = createCommandHistory(100);
      const command = { id: '1', description: 'test', timestamp: Date.now(), execute: (t: any) => t, undo: (t: any) => t, redo: (t: any) => t };
      const historyWithCommand = pushCommand(history, command);
      
      const result = undoCommand(historyWithCommand);
      expect(result).not.toBeNull();
      expect(result!.history.past.length).toBe(0);
      expect(result!.history.future.length).toBe(1);
      expect(result!.command.id).toBe('1');
    });

    it('redoCommand moves command from future to past', () => {
      const history = createCommandHistory(100);
      const command = { id: '1', description: 'test', timestamp: Date.now(), execute: (t: any) => t, undo: (t: any) => t, redo: (t: any) => t };
      let historyWithCommand = pushCommand(history, command);
      
      const undoResult = undoCommand(historyWithCommand);
      if (!undoResult) throw new Error('Undo failed');
      
      const redoResult = redoCommand(undoResult.history);
      expect(redoResult).not.toBeNull();
      expect(redoResult!.history.past.length).toBe(1);
      expect(redoResult!.history.future.length).toBe(0);
      expect(redoResult!.command.id).toBe('1');
    });

    it('pushCommand after undo clears future', () => {
      const history = createCommandHistory(100);
      const cmd1 = { id: '1', description: 'test1', timestamp: Date.now(), execute: (t: any) => t, undo: (t: any) => t, redo: (t: any) => t };
      const cmd2 = { id: '2', description: 'test2', timestamp: Date.now(), execute: (t: any) => t, undo: (t: any) => t, redo: (t: any) => t };
      
      let h = pushCommand(history, cmd1);
      h = pushCommand(h, cmd2);
      
      const undoResult = undoCommand(h);
      if (!undoResult) throw new Error('Undo failed');
      
      // Push new command after undo - should clear future
      const cmd3 = { id: '3', description: 'test3', timestamp: Date.now(), execute: (t: any) => t, undo: (t: any) => t, redo: (t: any) => t };
      const hAfterPush = pushCommand(undoResult.history, cmd3);
      
      expect(hAfterPush.past.length).toBe(2); // cmd1, cmd3
      expect(hAfterPush.future.length).toBe(0); // future cleared
    });

    it('maxDepth trims old commands', () => {
      const history = createCommandHistory(3);
      const makeCmd = (id: string) => ({ id, description: id, timestamp: Date.now(), execute: (t: any) => t, undo: (t: any) => t, redo: (t: any) => t });
      
      let h = pushCommand(history, makeCmd('1'));
      h = pushCommand(h, makeCmd('2'));
      h = pushCommand(h, makeCmd('3'));
      expect(h.past.length).toBe(3);
      
      h = pushCommand(h, makeCmd('4'));
      expect(h.past.length).toBe(3);
      expect(h.past.map(c => c.id)).toEqual(['2', '3', '4']); // '1' trimmed
    });
  });

  describe('Individual Commands', () => {
    let timeline: any;

    beforeEach(() => {
      timeline = createTimeline({ id: 'tl-1', name: 'Test' });
      timeline = createPrimaryVideoTrack(timeline);
    });

    const testSegment = createSegment({
      id: 'seg-1',
      trackId: 'video-primary',
      type: 'video',
      targetStart: TimePoint.fromSeconds(1),
      targetDuration: 5_000_000n as Microseconds,
      sourceStart: TimePoint.zero(),
      sourceDuration: 5_000_000n as Microseconds,
      media: {
        id: 'media-1',
        type: 'video' as const,
        url: 'file:///test.mp4',
        duration: 10_000_000n as Microseconds,
      },
    });

    it('createAddSegmentCommand - execute adds, undo removes, redo adds', () => {
      const command = createAddSegmentCommand('video-primary', testSegment);
      
      let newTl = command.execute(timeline);
      expect(newTl.tracks[0].segments.length).toBe(1);
      
      newTl = command.undo(newTl);
      expect(newTl.tracks[0].segments.length).toBe(0);
      
      newTl = command.redo(newTl);
      expect(newTl.tracks[0].segments.length).toBe(1);
    });

    it('createRemoveSegmentCommand - execute removes, undo restores', () => {
      timeline = addSegmentToTrack(timeline, 'video-primary', testSegment);
      
      const command = createRemoveSegmentCommand('video-primary', 'seg-1', testSegment);
      
      let newTl = command.execute(timeline);
      expect(newTl.tracks[0].segments.length).toBe(0);
      
      newTl = command.undo(newTl);
      expect(newTl.tracks[0].segments.length).toBe(1);
      
      newTl = command.redo(newTl);
      expect(newTl.tracks[0].segments.length).toBe(0);
    });

    it('createMoveSegmentCommand - execute moves, undo restores position', () => {
      timeline = addSegmentToTrack(timeline, 'video-primary', testSegment);
      
      const newStart = TimePoint.fromSeconds(5);
      const command = createMoveSegmentCommand('video-primary', 'seg-1', newStart, TimePoint.fromSeconds(1));
      
      let newTl = command.execute(timeline);
      const movedSegment = newTl.tracks[0].segments.find(s => s.id === 'seg-1');
      expect(movedSegment!.targetTimerange.start.value).toBe(5_000_000n);
      
      newTl = command.undo(newTl);
      const restoredSegment = newTl.tracks[0].segments.find(s => s.id === 'seg-1');
      expect(restoredSegment!.targetTimerange.start.value).toBe(1_000_000n);
      
      newTl = command.redo(newTl);
      const redoneSegment = newTl.tracks[0].segments.find(s => s.id === 'seg-1');
      expect(redoneSegment!.targetTimerange.start.value).toBe(5_000_000n);
    });

    it('createSplitSegmentCommand - execute splits, undo restores original', () => {
      timeline = addSegmentToTrack(timeline, 'video-primary', testSegment);
      
      const splitTime = TimePoint.fromSeconds(3);
      const command = createSplitSegmentCommand('video-primary', 'seg-1', splitTime, testSegment);
      
      let newTl = command.execute(timeline);
      expect(newTl.tracks[0].segments.length).toBe(2);
      const left = newTl.tracks[0].segments.find(s => s.id === 'seg-1_left');
      const right = newTl.tracks[0].segments.find(s => s.id === 'seg-1_right');
      expect(left).toBeDefined();
      expect(right).toBeDefined();
      expect(left!.targetTimerange.duration).toBe(2_000_000n);
      expect(right!.targetTimerange.duration).toBe(3_000_000n);
      
      newTl = command.undo(newTl);
      expect(newTl.tracks[0].segments.length).toBe(1);
      const restored = newTl.tracks[0].segments[0];
      expect(restored.targetTimerange.start.value).toBe(1_000_000n);
      expect(restored.targetTimerange.duration).toBe(5_000_000n);
    });

    it('createTrimSegmentCommand - execute trims, undo restores', () => {
      timeline = addSegmentToTrack(timeline, 'video-primary', testSegment);
      
      const newRange = TimeRange.fromStartEnd(
        TimePoint.fromSeconds(2),
        TimePoint.fromSeconds(4)
      );
      const command = createTrimSegmentCommand('video-primary', testSegment, newRange);
      
      let newTl = command.execute(timeline);
      const trimmed = newTl.tracks[0].segments[0];
      expect(trimmed.targetTimerange.start.value).toBe(2_000_000n);
      expect(trimmed.targetTimerange.end.value).toBe(4_000_000n);
      
      newTl = command.undo(newTl);
      const restored = newTl.tracks[0].segments[0];
      // Original segment was at 1s with 5s duration (1-6s)
      expect(restored.targetTimerange.start.value).toBe(1_000_000n);
      expect(restored.targetTimerange.end.value).toBe(6_000_000n);
    });

    it('createAddTrackCommand - execute adds, undo removes', () => {
      const newTrack: Track = {
        id: 'video-2',
        name: 'Video 2',
        type: 'video',
        isPrimary: false,
        rippleEnabled: false,
        order: 1,
        locked: false,
        visible: true,
        muted: false,
        volume: 1.0,
        segments: [],
      };
      
      const command = createAddTrackCommand(newTrack);
      
      let newTl = command.execute(timeline);
      expect(newTl.tracks.length).toBe(2);
      
      newTl = command.undo(newTl);
      expect(newTl.tracks.length).toBe(1);
      
      newTl = command.redo(newTl);
      expect(newTl.tracks.length).toBe(2);
    });

    it('createRemoveTrackCommand - execute removes, undo restores', () => {
      const newTrack: Track = {
        id: 'video-2',
        name: 'Video 2',
        type: 'video',
        isPrimary: false,
        rippleEnabled: false,
        order: 1,
        locked: false,
        visible: true,
        muted: false,
        volume: 1.0,
        segments: [],
      };
      
      timeline = addTrack(timeline, newTrack);
      
      const command = createRemoveTrackCommand(newTrack);
      
      let newTl = command.execute(timeline);
      expect(newTl.tracks.length).toBe(1);
      
      newTl = command.undo(newTl);
      expect(newTl.tracks.length).toBe(2);
    });

    it('createReorderTracksCommand - execute reorders, undo restores order', () => {
      const track2: Track = {
        id: 'video-2',
        name: 'Video 2',
        type: 'video',
        isPrimary: false,
        rippleEnabled: false,
        order: 1,
        locked: false,
        visible: true,
        muted: false,
        volume: 1.0,
        segments: [],
      };
      
      timeline = addTrack(timeline, track2);
      
      const newOrder = ['video-2', 'video-primary'];
      const oldOrder = ['video-primary', 'video-2'];
      const command = createReorderTracksCommand(newOrder, oldOrder);
      
      let newTl = command.execute(timeline);
      expect(newTl.tracks[0].id).toBe('video-2');
      expect(newTl.tracks[1].id).toBe('video-primary');
      
      newTl = command.undo(newTl);
      expect(newTl.tracks[0].id).toBe('video-primary');
      expect(newTl.tracks[1].id).toBe('video-2');
    });

    it('createSetPlayheadCommand - execute sets, undo restores', () => {
      const newTime = TimePoint.fromSeconds(10);
      const command = createSetPlayheadCommand(newTime, timeline.playhead);
      
      let newTl = command.execute(timeline);
      expect(newTl.playhead.value).toBe(10_000_000n);
      
      newTl = command.undo(newTl);
      expect(newTl.playhead.value).toBe(0n);
    });

    it('createSetPlaybackCommand - execute toggles, undo restores', () => {
      const command = createSetPlaybackCommand(true, false);
      
      let newTl = command.execute(timeline);
      expect(newTl.isPlaying).toBe(true);
      
      newTl = command.undo(newTl);
      expect(newTl.isPlaying).toBe(false);
    });

    it('createSetPlaybackSpeedCommand - execute sets speed, undo restores', () => {
      const command = createSetPlaybackSpeedCommand(2.0, 1.0);
      
      let newTl = command.execute(timeline);
      expect(newTl.playbackSpeed).toBe(2.0);
      
      newTl = command.undo(newTl);
      expect(newTl.playbackSpeed).toBe(1.0);
    });

    it('createSetInOutPointsCommand - execute sets, undo restores', () => {
      const inPoint = TimePoint.fromSeconds(2);
      const outPoint = TimePoint.fromSeconds(8);
      const command = createSetInOutPointsCommand(inPoint, outPoint, undefined, undefined);
      
      let newTl = command.execute(timeline);
      expect(newTl.inPoint!.value).toBe(2_000_000n);
      expect(newTl.outPoint!.value).toBe(8_000_000n);
      
      newTl = command.undo(newTl);
      expect(newTl.inPoint).toBeUndefined();
      expect(newTl.outPoint).toBeUndefined();
    });
  });

  describe('Command Manager Integration', () => {
    it('TEST-8.4: creates manager with default timeline', () => {
      const manager = createDefaultCommandManager();
      
      expect(manager.timeline).toBeDefined();
      expect(manager.history).toBeDefined();
      expect(manager.canUndo()).toBe(false);
      expect(manager.canRedo()).toBe(false);
    });

    it('TEST-8.4: addSegment and undo/redo', () => {
      const manager = createDefaultCommandManager();
      manager.timeline = createPrimaryVideoTrack(manager.timeline);
      
      const segment = createSegment({
        id: 'seg-1',
        trackId: 'video-primary',
        type: 'video',
        targetStart: TimePoint.zero(),
        targetDuration: 5_000_000n as Microseconds,
        sourceStart: TimePoint.zero(),
        sourceDuration: 5_000_000n as Microseconds,
        media: {
          id: 'media-1',
          type: 'video' as const,
          url: 'file:///test.mp4',
          duration: 10_000_000n as Microseconds,
        },
      });
      
      // Add segment
      manager.addSegment('video-primary', segment);
      expect(manager.timeline.tracks[0].segments.length).toBe(1);
      expect(manager.canUndo()).toBe(true);
      
      // Undo
      const undoResult = manager.undo();
      expect(undoResult).not.toBeNull();
      expect(manager.timeline.tracks[0].segments.length).toBe(0);
      expect(manager.canRedo()).toBe(true);
      
      // Redo
      const redoResult = manager.redo();
      expect(redoResult).not.toBeNull();
      expect(manager.timeline.tracks[0].segments.length).toBe(1);
    });

    it('TEST-8.4: moveSegment and undo/redo', () => {
      const manager = createDefaultCommandManager();
      manager.timeline = createPrimaryVideoTrack(manager.timeline);
      
      const segment = createSegment({
        id: 'seg-1',
        trackId: 'video-primary',
        type: 'video',
        targetStart: TimePoint.zero(),
        targetDuration: 5_000_000n as Microseconds,
        sourceStart: TimePoint.zero(),
        sourceDuration: 5_000_000n as Microseconds,
        media: {
          id: 'media-1',
          type: 'video' as const,
          url: 'file:///test.mp4',
          duration: 10_000_000n as Microseconds,
        },
      });
      
      manager.addSegment('video-primary', segment);
      
      // Move segment
      manager.moveSegment('video-primary', 'seg-1', TimePoint.fromSeconds(3));
      expect(manager.timeline.tracks[0].segments[0].targetTimerange.start.value).toBe(3_000_000n);
      
      // Undo
      manager.undo();
      expect(manager.timeline.tracks[0].segments[0].targetTimerange.start.value).toBe(0n);
      
      // Redo
      manager.redo();
      expect(manager.timeline.tracks[0].segments[0].targetTimerange.start.value).toBe(3_000_000n);
    });

    it('TEST-8.4: splitSegment and undo/redo', () => {
      const manager = createDefaultCommandManager();
      manager.timeline = createPrimaryVideoTrack(manager.timeline);
      
      const segment = createSegment({
        id: 'seg-1',
        trackId: 'video-primary',
        type: 'video',
        targetStart: TimePoint.zero(),
        targetDuration: 10_000_000n as Microseconds,
        sourceStart: TimePoint.zero(),
        sourceDuration: 10_000_000n as Microseconds,
        media: {
          id: 'media-1',
          type: 'video' as const,
          url: 'file:///test.mp4',
          duration: 10_000_000n as Microseconds,
        },
      });
      
      manager.addSegment('video-primary', segment);
      
      // Split at 4 seconds
      manager.splitSegment('video-primary', 'seg-1', TimePoint.fromSeconds(4));
      expect(manager.timeline.tracks[0].segments.length).toBe(2);
      
      // Undo
      manager.undo();
      expect(manager.timeline.tracks[0].segments.length).toBe(1);
      expect(manager.timeline.tracks[0].segments[0].targetTimerange.duration).toBe(10_000_000n);
      
      // Redo
      manager.redo();
      expect(manager.timeline.tracks[0].segments.length).toBe(2);
    });

    it('TEST-8.4: multiple operations with undo/redo chain', () => {
      const manager = createDefaultCommandManager();
      manager.timeline = createPrimaryVideoTrack(manager.timeline);
      
      const segment = createSegment({
        id: 'seg-1',
        trackId: 'video-primary',
        type: 'video',
        targetStart: TimePoint.zero(),
        targetDuration: 10_000_000n as Microseconds,
        sourceStart: TimePoint.zero(),
        sourceDuration: 10_000_000n as Microseconds,
        media: {
          id: 'media-1',
          type: 'video' as const,
          url: 'file:///test.mp4',
          duration: 10_000_000n as Microseconds,
        },
      });
      
      // 5 sequential edits
      manager.addSegment('video-primary', segment);           // 1. Add
      manager.moveSegment('video-primary', 'seg-1', TimePoint.fromSeconds(2)); // 2. Move
      manager.splitSegment('video-primary', 'seg-1', TimePoint.fromSeconds(5)); // 3. Split
      manager.trimSegment('video-primary', 'seg-1_left', TimeRange.fromStartEnd(TimePoint.fromSeconds(1), TimePoint.fromSeconds(4))); // 4. Trim
      manager.setPlayhead(TimePoint.fromSeconds(3)); // 5. Set playhead
      
      // Verify final state
      expect(manager.timeline.tracks[0].segments.length).toBe(2); // Split created 2
      expect(manager.timeline.playhead.value).toBe(3_000_000n);
      
      // Undo 5 times
      for (let i = 0; i < 5; i++) {
        const result = manager.undo();
        expect(result).not.toBeNull();
      }
      
      // Should be back to initial empty state
      expect(manager.timeline.tracks[0].segments.length).toBe(0);
      expect(manager.timeline.playhead.value).toBe(0n);
      
      // Redo 5 times
      for (let i = 0; i < 5; i++) {
        const result = manager.redo();
        expect(result).not.toBeNull();
      }
      
      // Should be back to final state
      expect(manager.timeline.tracks[0].segments.length).toBe(2);
      expect(manager.timeline.playhead.value).toBe(3_000_000n);
    });

    it('TEST-8.4: add/remove track with undo/redo', () => {
      const manager = createDefaultCommandManager();
      manager.timeline = createPrimaryVideoTrack(manager.timeline);
      
      // Add a track
      manager.addTrack({
        id: 'video-2',
        name: 'Video 2',
        type: 'video',
        isPrimary: false,
        rippleEnabled: false,
        order: 1,
        locked: false,
        visible: true,
        muted: false,
        volume: 1.0,
        segments: [],
      });
      
      expect(manager.timeline.tracks.length).toBe(2);
      
      // Undo
      manager.undo();
      expect(manager.timeline.tracks.length).toBe(1);
      
      // Redo
      manager.redo();
      expect(manager.timeline.tracks.length).toBe(2);
    });

    it('TEST-8.4: reorderTracks with undo/redo', () => {
      const manager = createDefaultCommandManager();
      manager.timeline = createPrimaryVideoTrack(manager.timeline);
      manager.timeline = createVideoTrack(manager.timeline);
      
      // Initial order: video-primary, video-2
      expect(manager.timeline.tracks[0].id).toBe('video-primary');
      expect(manager.timeline.tracks[1].id).toBe('video-2');
      
      // Reorder
      manager.reorderTracks(['video-2', 'video-primary']);
      expect(manager.timeline.tracks[0].id).toBe('video-2');
      expect(manager.timeline.tracks[1].id).toBe('video-primary');
      
      // Undo
      manager.undo();
      expect(manager.timeline.tracks[0].id).toBe('video-primary');
      expect(manager.timeline.tracks[1].id).toBe('video-2');
      
      // Redo
      manager.redo();
      expect(manager.timeline.tracks[0].id).toBe('video-2');
    });

    it('TEST-8.4: playback controls with undo/redo', () => {
      const manager = createDefaultCommandManager();
      
      // Play
      manager.setPlayback(true);
      expect(manager.timeline.isPlaying).toBe(true);
      
      manager.undo();
      expect(manager.timeline.isPlaying).toBe(false);
      
      manager.redo();
      expect(manager.timeline.isPlaying).toBe(true);
      
      // Speed
      manager.setPlaybackSpeed(2.0);
      expect(manager.timeline.playbackSpeed).toBe(2.0);
      
      manager.undo();
      expect(manager.timeline.playbackSpeed).toBe(1.0);
      
      manager.redo();
      expect(manager.timeline.playbackSpeed).toBe(2.0);
    });

    it('TEST-8.4: in/out points with undo/redo', () => {
      const manager = createDefaultCommandManager();
      
      manager.setInOutPoints(TimePoint.fromSeconds(2), TimePoint.fromSeconds(8));
      expect(manager.timeline.inPoint!.value).toBe(2_000_000n);
      expect(manager.timeline.outPoint!.value).toBe(8_000_000n);
      
      manager.undo();
      expect(manager.timeline.inPoint).toBeUndefined();
      expect(manager.timeline.outPoint).toBeUndefined();
      
      manager.redo();
      expect(manager.timeline.inPoint!.value).toBe(2_000_000n);
    });
  });
});

// Import helpers used in tests
function addSegmentToTrack(timeline: any, trackId: string, segment: any) {
  // This is a test helper - in real code use the actual function
  const trackIndex = timeline.tracks.findIndex((t: any) => t.id === trackId);
  if (trackIndex === -1) throw new Error('Track not found');
  
  const newTracks = [...timeline.tracks];
  newTracks[trackIndex] = {
    ...newTracks[trackIndex],
    segments: [...newTracks[trackIndex].segments, segment].sort((a: any, b: any) => 
      a.targetTimerange.start.value < b.targetTimerange.start.value ? -1 : 1
    ),
  };
  
  return { ...timeline, tracks: newTracks };
}

function addTrack(timeline: any, track: any) {
  const newTracks = [...timeline.tracks, track];
  newTracks.sort((a: any, b: any) => a.order - b.order);
  return { ...timeline, tracks: newTracks };
}