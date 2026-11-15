import { produce } from 'immer';
import { Command, CommandType, UndoRedoManager } from './types';
import { Timeline } from '../timeline/timeline';
import { Track, TrackType } from '../timeline/track';
import { Segment } from '../timeline/segment';
import { TimePoint, TimeRange, Microseconds, µs, µsFromFrames, toSeconds, toFrames } from '../timeline/types';

export interface CommandManagerState {
  undoStack: Command[];
  redoStack: Command[];
  maxHistory: number;
}

export const initialCommandManagerState: CommandManagerState = {
  undoStack: [],
  redoStack: [],
  maxHistory: 100,
};

export class CommandManager {
  private state: CommandManagerState;

  constructor(initialState: CommandManagerState = initialCommandManagerState) {
    this.state = initialState;
  }

  getState(): CommandManagerState {
    return this.state;
  }

  executeCommand(command: Command): void {
    this.state = produce(this.state, (draft) => {
      draft.undoStack.push(command);
      if (draft.undoStack.length > draft.maxHistory) {
        draft.undoStack.shift();
      }
      draft.redoStack = [];
    });
  }

  undo(): Command | null {
    if (this.state.undoStack.length === 0) return null;

    const command = this.state.undoStack.pop()!;
    this.state = produce(this.state, (draft) => {
      draft.redoStack.push(command);
    });
    return command;
  }

  redo(): Command | null {
    if (this.state.redoStack.length === 0) return null;

    const command = this.state.redoStack.pop()!;
    this.state = produce(this.state, (draft) => {
      draft.undoStack.push(command);
    });
    return command;
  }

  canUndo(): boolean {
    return this.state.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.state.redoStack.length > 0;
  }

  clear(): void {
    this.state = produce(this.state, (draft) => {
      draft.undoStack = [];
      draft.redoStack = [];
    });
  }

  getUndoStack(): Command[] {
    return [...this.state.undoStack];
  }

  getRedoStack(): Command[] {
    return [...this.state.redoStack];
  }
}

export function createAddTrackCommand(track: Track): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.ADD_TRACK,
    timestamp: Date.now(),
    payload: { track },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createRemoveTrackCommand(trackId: string): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.REMOVE_TRACK,
    timestamp: Date.now(),
    payload: { trackId },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createAddSegmentCommand(segment: any, trackId: string): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.ADD_SEGMENT,
    timestamp: Date.now(),
    payload: { segment, trackId },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createRemoveSegmentCommand(segmentId: string): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.REMOVE_SEGMENT,
    timestamp: Date.now(),
    payload: { segmentId },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createMoveSegmentCommand(segmentId: string, newStart: bigint): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.MOVE_SEGMENT,
    timestamp: Date.now(),
    payload: { segmentId, newStart },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createTrimSegmentCommand(segmentId: string, newDuration: bigint): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.TRIM_SEGMENT,
    timestamp: Date.now(),
    payload: { segmentId, newDuration },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createSplitSegmentCommand(segmentId: string, splitTime: bigint): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.SPLIT_SEGMENT,
    timestamp: Date.now(),
    payload: { segmentId, splitTime },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createUpdateSegmentCommand(segmentId: string, updates: any): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.UPDATE_SEGMENT,
    timestamp: Date.now(),
    payload: { segmentId, updates },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createUpdateTrackCommand(trackId: string, updates: any): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.UPDATE_TRACK,
    timestamp: Date.now(),
    payload: { trackId, updates },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createSetPlayheadCommand(time: bigint): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.SET_PLAYHEAD,
    timestamp: Date.now(),
    payload: { time },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createSetZoomCommand(zoom: number): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.SET_ZOOM,
    timestamp: Date.now(),
    payload: { zoom },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createSetInPointCommand(time: bigint | null): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.SET_IN_POINT,
    timestamp: Date.now(),
    payload: { time },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createSetOutPointCommand(time: bigint | null): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.SET_OUT_POINT,
    timestamp: Date.now(),
    payload: { time },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createSetPlaybackSpeedCommand(speed: number): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.SET_PLAYBACK_SPEED,
    timestamp: Date.now(),
    payload: { speed },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createSetCanvasAspectRatioCommand(ratio: string): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.SET_CANVAS_ASPECT_RATIO,
    timestamp: Date.now(),
    payload: { ratio },
    undo: (state) => state,
    redo: (state) => state,
  };
}

export function createSetSafeAreaCommand(safeArea: any): Command {
  return {
    id: crypto.randomUUID(),
    type: CommandType.SET_SAFE_AREA,
    timestamp: Date.now(),
    payload: { safeArea },
    undo: (state) => state,
    redo: (state) => state,
  };
}