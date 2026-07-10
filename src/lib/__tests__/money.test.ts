import { describe, expect, it } from 'vitest';
import { invoiceTotals, lineTotal } from '../money';
import { emptyInvoice } from '../workspace';
import type { Invoice } from '../types';

function invoiceWith(overrides: Partial<Invoice>): Invoice {
  return { ...emptyInvoice('client', 'GBP', 'classic'), ...overrides };
}

describe('lineTotal', () => {
  it('multiplies quantity by unit price', () => {
    expect(lineTotal({ quantity: 15, unitPrice: 500 })).toBe(7500);
  });

  it('rounds fractional currency to two decimals without binary drift', () => {
    // 0.1 * 3 is 0.30000000000000004 in binary floating point.
    expect(lineTotal({ quantity: 3, unitPrice: 0.1 })).toBe(0.3);
    expect(lineTotal({ quantity: 1.005, unitPrice: 100 })).toBe(100.5);
  });

  it('treats invalid numbers as zero', () => {
    expect(lineTotal({ quantity: Number.NaN, unitPrice: 100 })).toBe(0);
  });
});

describe('invoiceTotals', () => {
  it('sums many lines without floating point error', () => {
    const invoice = invoiceWith({
      taxRate: 0,
      items: Array.from({ length: 10 }, (_, index) => ({
        id: `item_${index}`,
        description: 'Line',
        quantity: 1,
        unitPrice: 0.1
      }))
    });
    // Naive summation of 0.1 ten times is 0.9999999999999999.
    expect(invoiceTotals(invoice).subtotal).toBe(1);
    expect(invoiceTotals(invoice).total).toBe(1);
  });

  it('applies discount before tax', () => {
    const invoice = invoiceWith({
      discountPercent: 10,
      taxRate: 20,
      items: [{ id: 'a', description: 'Work', quantity: 1, unitPrice: 1000 }]
    });
    const totals = invoiceTotals(invoice);
    expect(totals.subtotal).toBe(1000);
    expect(totals.discount).toBe(100);
    expect(totals.tax).toBe(180); // 20% of 900
    expect(totals.total).toBe(1080);
  });

  it('computes tax on the subtotal', () => {
    const invoice = invoiceWith({
      taxRate: 20,
      items: [{ id: 'a', description: 'Work', quantity: 10, unitPrice: 55 }]
    });
    const totals = invoiceTotals(invoice);
    expect(totals.subtotal).toBe(550);
    expect(totals.tax).toBe(110);
    expect(totals.total).toBe(660);
  });

  it('reports the full total as due when unpaid and nothing when paid', () => {
    const items = [{ id: 'a', description: 'Work', quantity: 1, unitPrice: 200 }];
    expect(invoiceTotals(invoiceWith({ status: 'sent', taxRate: 0, items })).amountDue).toBe(200);
    const paid = invoiceTotals(invoiceWith({ status: 'paid', taxRate: 0, items }));
    expect(paid.amountPaid).toBe(200);
    expect(paid.amountDue).toBe(0);
  });

  it('tracks a partial payment', () => {
    const invoice = invoiceWith({
      status: 'sent',
      taxRate: 0,
      amountPaid: 75,
      items: [{ id: 'a', description: 'Work', quantity: 1, unitPrice: 200 }]
    });
    const totals = invoiceTotals(invoice);
    expect(totals.amountPaid).toBe(75);
    expect(totals.amountDue).toBe(125);
  });

  it('ignores negative or out-of-range rates', () => {
    const invoice = invoiceWith({
      discountPercent: -5,
      taxRate: 250,
      items: [{ id: 'a', description: 'Work', quantity: 1, unitPrice: 100 }]
    });
    const totals = invoiceTotals(invoice);
    expect(totals.discount).toBe(0);
    expect(totals.taxRate).toBe(100);
    expect(totals.total).toBe(200);
  });
});
