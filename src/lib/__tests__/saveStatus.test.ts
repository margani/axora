import { describe, expect, it } from 'vitest';
import {
  dirtySaveState,
  errorSaveState,
  initialSaveState,
  savedSaveState,
  saveStatusBadge,
  saveStatusText,
  savingSaveState
} from '../saveStatus';

describe('save status formatting', () => {
  it('shows not saved before the first successful save', () => {
    const state = initialSaveState();

    expect(state.lastSavedAt).toBeNull();
    expect(state.status).toBe('idle');
    expect(saveStatusText(state)).toBe('Last saved: Not saved yet');
    expect(saveStatusBadge(state)).toBe('');
  });

  it('shows a saved timestamp after a successful save', () => {
    const savedAt = '2026-07-07T14:32:00.000Z';
    const state = savedSaveState(savedAt);

    expect(state.lastSavedAt).toBe(savedAt);
    expect(state.status).toBe('saved');
    expect(saveStatusText(state, new Date('2026-07-07T14:32:10.000Z').getTime())).toBe('Last saved: just now');
    expect(saveStatusText(state, new Date('2026-07-07T14:34:00.000Z').getTime())).not.toContain('Not saved yet');
    expect(saveStatusBadge(state)).toBe('Saved ✓');
  });

  it('does not claim saved after a failed save', () => {
    const previouslySaved = savedSaveState('2026-07-07T14:32:00.000Z');
    const failed = errorSaveState(previouslySaved);

    expect(failed.lastSavedAt).toBe(previouslySaved.lastSavedAt);
    expect(failed.status).toBe('error');
    expect(saveStatusText(failed)).toBe('Save failed');
    expect(saveStatusBadge(failed)).toBe('');
  });

  it('keeps the previous timestamp while dirty or saving', () => {
    const saved = savedSaveState('2026-07-07T14:32:00.000Z');

    expect(dirtySaveState(saved).lastSavedAt).toBe(saved.lastSavedAt);
    expect(savingSaveState(saved).lastSavedAt).toBe(saved.lastSavedAt);
    expect(saveStatusText(savingSaveState(saved))).toBe('Saving...');
  });
});
