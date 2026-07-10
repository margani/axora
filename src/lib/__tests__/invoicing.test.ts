import { describe, expect, it } from 'vitest';
import {
  duplicateInvoice,
  effectiveStatus,
  emptyInvoice,
  emptyWorkspace,
  formatInvoiceNumber,
  highestInvoiceSequence,
  isOverdue,
  nextInvoiceNumber
} from '../workspace';
import type { Invoice } from '../types';

function invoiceWith(overrides: Partial<Invoice>): Invoice {
  return { ...emptyInvoice('client', 'GBP', 'classic'), ...overrides };
}

describe('invoice numbering', () => {
  it('formats numbers with a prefix, year and zero padding', () => {
    expect(formatInvoiceNumber('INV', 2026, 7)).toBe('INV-2026-007');
    expect(formatInvoiceNumber('ACME-', 2026, 42)).toBe('ACME-2026-042');
  });

  it('uses a persistent counter that does not depend on the invoice count', () => {
    const workspace = emptyWorkspace();
    workspace.settings.nextInvoiceNumber = 8;
    const { invoiceNumber, nextCounter } = nextInvoiceNumber(workspace);
    expect(invoiceNumber).toContain('-008');
    expect(nextCounter).toBe(9);
  });

  it('does not reuse a number after invoices are deleted (counter only moves forward)', () => {
    const workspace = emptyWorkspace();
    // Simulate having issued three invoices then deleting them all.
    workspace.settings.nextInvoiceNumber = 4;
    const { invoiceNumber } = nextInvoiceNumber(workspace);
    expect(invoiceNumber).toContain('-004');
  });

  it('derives the next counter from the highest existing sequence when migrating', () => {
    expect(
      highestInvoiceSequence([
        invoiceWith({ invoiceNumber: 'INV-2026-001' }),
        invoiceWith({ invoiceNumber: 'INV-2026-012' }),
        invoiceWith({ invoiceNumber: 'INV-2026-003' })
      ])
    ).toBe(12);
  });
});

describe('duplicateInvoice', () => {
  it('creates a fresh draft with a new number and cleared payment state', () => {
    const original = invoiceWith({
      invoiceNumber: 'INV-2026-001',
      status: 'paid',
      amountPaid: 500,
      paidDate: '2026-06-01',
      sentDate: '2026-05-20',
      snapshot: null,
      items: [{ id: 'a', description: 'Work', quantity: 1, unitPrice: 500 }]
    });
    const copy = duplicateInvoice(original, 'INV-2026-002', 14);
    expect(copy.invoiceNumber).toBe('INV-2026-002');
    expect(copy.status).toBe('draft');
    expect(copy.amountPaid).toBe(0);
    expect(copy.paidDate).toBe('');
    expect(copy.sentDate).toBe('');
    expect(copy.id).not.toBe(original.id);
    expect(copy.items[0].id).not.toBe(original.items[0].id);
  });
});

describe('overdue detection', () => {
  it('marks an unpaid invoice past its due date as overdue', () => {
    const invoice = invoiceWith({ status: 'sent', dueDate: '2026-01-01' });
    expect(isOverdue(invoice, '2026-02-01')).toBe(true);
    expect(effectiveStatus(invoice, '2026-02-01')).toBe('overdue');
  });

  it('does not mark paid invoices as overdue', () => {
    const invoice = invoiceWith({ status: 'paid', dueDate: '2026-01-01' });
    expect(isOverdue(invoice, '2026-02-01')).toBe(false);
    expect(effectiveStatus(invoice, '2026-02-01')).toBe('paid');
  });

  it('does not mark invoices due in the future as overdue', () => {
    const invoice = invoiceWith({ status: 'sent', dueDate: '2026-12-01' });
    expect(isOverdue(invoice, '2026-02-01')).toBe(false);
    expect(effectiveStatus(invoice, '2026-02-01')).toBe('sent');
  });
});
