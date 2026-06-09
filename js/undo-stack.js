import { serialize, deserialize } from './persistence.js';

const MAX_SNAPSHOTS = 50;

let stack = [];
let cursor = -1;

export function initSnapshot() {
  stack = [serialize()];
  cursor = 0;
}

export function snapshot() {
  stack = stack.slice(0, cursor + 1);
  stack.push(serialize());
  if (stack.length > MAX_SNAPSHOTS) {
    stack.shift();
  }
  cursor = stack.length - 1;
}

export function undo() {
  if (!canUndo()) return false;
  cursor--;
  deserialize(stack[cursor]);
  return true;
}

export function redo() {
  if (!canRedo()) return false;
  cursor++;
  deserialize(stack[cursor]);
  return true;
}

export function canUndo() {
  return cursor > 0;
}

export function canRedo() {
  return cursor < stack.length - 1;
}

export function clear() {
  stack = [serialize()];
  cursor = 0;
}
