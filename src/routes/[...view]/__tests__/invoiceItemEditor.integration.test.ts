import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVED_AT_KEY, STORAGE_KEY } from '$lib/workspace';
import Page from '../+page.svelte';
import { sampleWorkspace } from './fixture';

function seedWorkspace(savedAt = '2026-07-07T14:32:00.000Z') {
  const workspace = { ...sampleWorkspace(), lastSavedAt: savedAt };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  localStorage.setItem(SAVED_AT_KEY, savedAt);
}

async function renderInvoiceDetail() {
  window.history.pushState({}, '', '/clients/example-client/invoices/inv-2026-001');
  render(Page);
  await screen.findAllByRole('heading', { name: 'INV-2026-001' });
}

describe('invoice item side editor', () => {
  beforeEach(() => {
    localStorage.clear();
    window.history.pushState({}, '', '/');
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('edits, adds, and deletes invoice items without stale list or save status', async () => {
    seedWorkspace();
    await renderInvoiceDetail();

    await fireEvent.click(screen.getAllByRole('button', { name: /Edit/i })[0]);
    await fireEvent.input(screen.getByPlaceholderText('Item description'), { target: { value: 'Updated invoice services' } });
    await fireEvent.input(screen.getByLabelText('Rate'), { target: { value: '750' } });
    await fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(screen.queryByText('Last saved: Not saved yet')).not.toBeInTheDocument();
      expect(screen.getByText('Saved ✓')).toBeInTheDocument();
      expect(screen.getByText('Updated invoice services')).toBeInTheDocument();
      expect(screen.getAllByText('£11,250.00').length).toBeGreaterThan(0);
    });

    await fireEvent.click(screen.getByRole('button', { name: /Add Item/i }));
    await fireEvent.input(screen.getByPlaceholderText('Item description'), { target: { value: 'Additional support' } });
    await fireEvent.input(screen.getByLabelText('Quantity'), { target: { value: '2' } });
    await fireEvent.input(screen.getByLabelText('Rate'), { target: { value: '100' } });
    await fireEvent.click(screen.getByRole('button', { name: /Save changes/i }));

    await waitFor(() => {
      expect(screen.getByText('Additional support')).toBeInTheDocument();
      expect(screen.getAllByText('£11,450.00').length).toBeGreaterThan(0);
    });

    vi.spyOn(window, 'confirm').mockReturnValue(true);
    await fireEvent.click(screen.getAllByRole('button', { name: 'Delete invoice item' })[1]);

    await waitFor(() => {
      expect(screen.queryByText('Additional support')).not.toBeInTheDocument();
      expect(screen.getAllByText('£11,250.00').length).toBeGreaterThan(0);
    });
  });
});
