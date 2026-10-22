// Undo/redo as a bounded snapshot history of the editable document.
// Snapshots are cheap (structural sharing is not needed at <= 500 nodes) and make every
// edit — canvas, inspector, AI apply, import — undoable through one mechanism.

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
}

export const HISTORY_LIMIT = 200;

export function initHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export function push<T>(h: History<T>, next: T): History<T> {
  if (Object.is(next, h.present)) return h;
  const past = [...h.past, h.present];
  if (past.length > HISTORY_LIMIT) past.shift();
  return { past, present: next, future: [] };
}

/** Replace the present without creating an undo step (e.g. mid-drag positions). */
export function replace<T>(h: History<T>, next: T): History<T> {
  return { ...h, present: next };
}

export function undo<T>(h: History<T>): History<T> {
  if (h.past.length === 0) return h;
  const previous = h.past[h.past.length - 1];
  return { past: h.past.slice(0, -1), present: previous, future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (h.future.length === 0) return h;
  const [next, ...rest] = h.future;
  return { past: [...h.past, h.present], present: next, future: rest };
}
