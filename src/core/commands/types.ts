export enum CommandType {
  ADD_TRACK = 'ADD_TRACK',
  REMOVE_TRACK = 'REMOVE_TRACK',
  ADD_SEGMENT = 'ADD_SEGMENT',
  REMOVE_SEGMENT = 'REMOVE_SEGMENT',
  MOVE_SEGMENT = 'MOVE_SEGMENT',
  TRIM_SEGMENT = 'TRIM_SEGMENT',
  SPLIT_SEGMENT = 'SPLIT_SEGMENT',
  UPDATE_SEGMENT = 'UPDATE_SEGMENT',
  UPDATE_TRACK = 'UPDATE_TRACK',
  SET_PLAYHEAD = 'SET_PLAYHEAD',
  SET_ZOOM = 'SET_ZOOM',
  SET_IN_POINT = 'SET_IN_POINT',
  SET_OUT_POINT = 'SET_OUT_POINT',
  SET_PLAYBACK_SPEED = 'SET_PLAYBACK_SPEED',
  SET_CANVAS_ASPECT_RATIO = 'SET_CANVAS_ASPECT_RATIO',
  SET_SAFE_AREA = 'SET_SAFE_AREA',
}

export interface Command {
  id: string;
  type: CommandType;
  timestamp: number;
  payload: any;
  undo: (state: any) => any;
  redo: (state: any) => any;
}

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

export class UndoRedoManager {
  private undoStack: Command[] = [];
  private redoStack: Command[] = [];
  private maxHistory: number = 100;

  execute(command: Command): void {
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack.shift();
    }
    this.redoStack = [];
  }

  undo(): Command | null {
    if (this.undoStack.length === 0) return null;
    const command = this.undoStack.pop()!;
    this.redoStack.push(command);
    return command;
  }

  redo(): Command | null {
    if (this.redoStack.length === 0) return null;
    const command = this.redoStack.pop()!;
    this.undoStack.push(command);
    return command;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  getUndoStack(): Command[] {
    return [...this.undoStack];
  }

  getRedoStack(): Command[] {
    return [...this.redoStack];
  }

  setMaxHistory(max: number): void {
    this.maxHistory = max;
    if (this.undoStack.length > this.maxHistory) {
      this.undoStack = this.undoStack.slice(-this.maxHistory);
    }
  }
}