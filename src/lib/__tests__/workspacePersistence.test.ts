import { beforeEach, describe, expect, it, vi } from 'vitest';
import { demoWorkspace } from '../demoWorkspace';
import { clearWorkspace, loadWorkspace, saveWorkspace, SAVED_AT_KEY, STORAGE_KEY } from '../workspace';

describe('workspace persistence save timestamp', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
  });

  it('starts empty without a saved timestamp', () => {
    const loaded = loadWorkspace();

    expect(loaded.savedAt).toBe('');
    expect(loaded.workspace.clients).toEqual([]);
  });

  it('persists lastSavedAt with the workspace data and hydrates it', () => {
    const workspace = demoWorkspace();
    const savedAt = saveWorkspace(workspace);
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

    expect(savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(raw.lastSavedAt).toBe(savedAt);
    expect(localStorage.getItem(SAVED_AT_KEY)).toBe(savedAt);

    const loaded = loadWorkspace();
    expect(loaded.savedAt).toBe(savedAt);
    expect(loaded.workspace.clients[0]?.name).toBe('Example Client');
  });

  it('hydrates lastSavedAt from workspace payload if the legacy savedAt key is missing', () => {
    const workspace = { ...demoWorkspace(), lastSavedAt: '2026-07-07T14:32:00.000Z' };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));

    const loaded = loadWorkspace();

    expect(loaded.savedAt).toBe('2026-07-07T14:32:00.000Z');
  });

  it('migrates legacy saved workspace data that has no timestamp instead of returning null saved state', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(demoWorkspace()));

    const loaded = loadWorkspace();
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');

    expect(loaded.savedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(raw.lastSavedAt).toBe(loaded.savedAt);
    expect(localStorage.getItem(SAVED_AT_KEY)).toBe(loaded.savedAt);
  });

  it('updates lastSavedAt on a later save', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-07T14:32:00.000Z'));
    const workspace = demoWorkspace();
    const firstSavedAt = saveWorkspace(workspace);

    vi.setSystemTime(new Date('2026-07-07T14:35:00.000Z'));
    const secondSavedAt = saveWorkspace({ ...workspace, clients: [{ ...workspace.clients[0], name: 'Updated Client' }] });

    expect(secondSavedAt).not.toBe(firstSavedAt);
    expect(secondSavedAt).toBe('2026-07-07T14:35:00.000Z');
    expect(loadWorkspace().savedAt).toBe(secondSavedAt);
  });

  it('does not update lastSavedAt if localStorage write fails', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('storage failed');
    });

    expect(() => saveWorkspace(demoWorkspace())).toThrow('storage failed');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(localStorage.getItem(SAVED_AT_KEY)).toBeNull();

    setItem.mockRestore();
  });

  it('clearing localStorage resets hydration to not saved', () => {
    saveWorkspace(demoWorkspace());
    clearWorkspace();

    const loaded = loadWorkspace();
    expect(loaded.savedAt).toBe('');
    expect(loaded.workspace.clients).toEqual([]);
  });
});
