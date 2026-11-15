/**
 * Command Types for Transactional Undo/Redo System
 * 
 * Implements the Command Pattern with Immer for immutable state updates.
 */

import { produce, Draft } from 'immer';
import { Timeline } from '../timeline/timeline.js';
import { Segment } from '../timeline/segment.js';
import { Track } from '../timeline/track.js';
import { TimePoint, Microseconds } from '../timeline/types.js';

/**
 * Base command interface.
 */
export interface Command {
  /** Unique identifier for this command */
  id: string;
  /** Human-readable description */
  description: string;
  /** Timestamp when command was created */
  timestamp: number;
  
  /** Execute the command on the timeline */
  execute(timeline: Timeline): Timeline;
  
  /** Undo the command on the timeline */
  undo(timeline: Timeline): Timeline;
  
  /** Redo the command on the timeline */
  redo(timeline: Timeline): Timeline;
}

/**
 * Creates a base command with common properties.
 */
export function createCommand(description: string): Omit<Command, 'execute' | 'undo' | 'redo'> {
  return {
    id: crypto.randomUUID(),
    description,
    timestamp: Date.now(),
  };
}

/**
 * Composite command that executes multiple commands as a single unit.
 */
export function createCompositeCommand(
  description: string,
  commands: Command[]
): Command {
  return {
    ...createCommand(description),
    execute: (timeline: Timeline) => {
      return commands.reduce((tl, cmd) => cmd.execute(tl), timeline);
    },
    undo: (timeline: Timeline) => {
      // Undo in reverse order
      return [...commands].reverse().reduce((tl, cmd) => cmd.undo(tl), timeline);
    },
    redo: (timeline: Timeline) => {
      return commands.reduce((tl, cmd) => cmd.redo(tl), timeline);
    },
  };
}

/**
 * Command history stack with configurable depth.
 */
export interface CommandHistory {
  /** Past commands (can undo) */
  past: Command[];
  /** Future commands (can redo) */
  future: Command[];
  /** Maximum history depth */
  maxDepth: number;
}

export function createCommandHistory(maxDepth: number = 100): CommandHistory {
  return {
    past: [],
    future: [],
    maxDepth,
  };
}

export function canUndo(history: CommandHistory): boolean {
  return history.past.length > 0;
}

export function canRedo(history: CommandHistory): boolean {
  return history.future.length > 0;
}

export function pushCommand(history: CommandHistory, command: Command): CommandHistory {
  // Clear future when new command is pushed
  const newPast = [...history.past, command];
  
  // Trim to max depth
  if (newPast.length > history.maxDepth) {
    newPast.shift();
  }
  
  return {
    ...history,
    past: newPast,
    future: [],
  };
}

export function undoCommand(history: CommandHistory): { history: CommandHistory; command: Command } | null {
  if (!canUndo(history)) return null;
  
  const command = history.past[history.past.length - 1];
  const newPast = history.past.slice(0, -1);
  const newFuture = [command, ...history.future];
  
  return {
    history: { ...history, past: newPast, future: newFuture },
    command,
  };
}

export function redoCommand(history: CommandHistory): { history: CommandHistory; command: Command } | null {
  if (!canRedo(history)) return null;
  
  const command = history.future[0];
  const newPast = [...history.past, command];
  const newFuture = history.future.slice(1);
  
  return {
    history: { ...history, past: newPast, future: newFuture },
    command,
  };
}