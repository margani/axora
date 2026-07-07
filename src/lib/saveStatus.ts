export type SaveStatus = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

export type SaveState = {
  status: SaveStatus;
  lastSavedAt: string | null;
};

export function initialSaveState(savedAt = ''): SaveState {
  return savedAt ? { status: 'saved', lastSavedAt: savedAt } : { status: 'idle', lastSavedAt: null };
}

export function dirtySaveState(state: SaveState): SaveState {
  return { ...state, status: 'dirty' };
}

export function savingSaveState(state: SaveState): SaveState {
  return { ...state, status: 'saving' };
}

export function savedSaveState(savedAt: string): SaveState {
  return { status: 'saved', lastSavedAt: savedAt };
}

export function errorSaveState(state: SaveState): SaveState {
  return { ...state, status: 'error' };
}

export function savedLabel(state: SaveState, now = Date.now()) {
  if (!state.lastSavedAt) return 'Not saved yet';
  if (now - new Date(state.lastSavedAt).getTime() < 60_000) return 'just now';
  return new Date(state.lastSavedAt).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export function saveStatusText(state: SaveState, now = Date.now()) {
  if (state.status === 'saving') return 'Saving...';
  if (state.status === 'error') return 'Save failed';
  return `Last saved: ${savedLabel(state, now)}`;
}

export function saveStatusBadge(state: SaveState) {
  return state.status === 'saved' && state.lastSavedAt ? 'Saved ✓' : '';
}
