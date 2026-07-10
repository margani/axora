import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { demoWorkspace } from '$lib/demoWorkspace';
import { SAVED_AT_KEY, STORAGE_KEY } from '$lib/workspace';
import Page from '../+page.svelte';

function seedWorkspace(savedAt = '2026-07-07T14:32:00.000Z') {
  const workspace = { ...demoWorkspace(), lastSavedAt: savedAt };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  localStorage.removeItem(SAVED_AT_KEY);
  return workspace;
}

async function renderTimesheetDetail() {
  window.history.pushState({}, '', '/clients/example-client/timesheets/june-2026');
  render(Page);
  await screen.findAllByRole('heading', { name: 'June 2026' });
}

describe('save status UI integration', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it('renders not saved only before a successful save and never with the saved badge', async () => {
    render(Page);

    expect(await screen.findByText('Last saved: Not saved yet')).toBeInTheDocument();
    expect(screen.queryByText('Saved ✓')).not.toBeInTheDocument();
  });

  it('hydrates a saved timestamp from workspace storage without the legacy savedAt key', async () => {
    seedWorkspace();

    await renderTimesheetDetail();

    expect(screen.queryByText('Last saved: Not saved yet')).not.toBeInTheDocument();
    expect(screen.getByText('Saved ✓')).toBeInTheDocument();
    expect(screen.getByText(/Last saved:/)).toHaveTextContent(/Last saved: (just now|.+)/);
  });

  it('updates save status and entry row after saving a timesheet entry, then preserves status after reload', async () => {
    seedWorkspace();
    await renderTimesheetDetail();

    await fireEvent.click(screen.getAllByRole('button', { name: /Edit/i })[0]);
    const description = screen.getByPlaceholderText('Work description');
    await fireEvent.input(description, { target: { value: 'Updated implementation notes' } });
    await fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(
      () => {
        expect(screen.queryByText('Last saved: Not saved yet')).not.toBeInTheDocument();
        expect(screen.getByText('Saved ✓')).toBeInTheDocument();
        expect(screen.getByText('Updated implementation notes')).toBeInTheDocument();
      },
      { timeout: 1500 }
    );

    const savedWorkspace = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    expect(savedWorkspace.lastSavedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(localStorage.getItem(SAVED_AT_KEY)).toBe(savedWorkspace.lastSavedAt);

    cleanup();
    await renderTimesheetDetail();

    expect(screen.queryByText('Last saved: Not saved yet')).not.toBeInTheDocument();
    expect(screen.getByText('Saved ✓')).toBeInTheDocument();
    expect(screen.getByText('Updated implementation notes')).toBeInTheDocument();
  });
});
