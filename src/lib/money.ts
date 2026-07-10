import type { Invoice, InvoiceItem } from './types';

/**
 * Money handling for Axora.
 *
 * All arithmetic that produces a currency figure is done in integer minor units
 * (pence/cents) so we never accumulate binary floating-point error across a list
 * of invoice lines. Values only return to major units (e.g. pounds) at the very
 * end, rounded half-up to two decimal places.
 */

/** Round a major-unit value to whole minor units (half away from zero). */
export function toMinor(value: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

/** Convert integer minor units back to a major-unit number with 2 decimals. */
export function toMajor(minor: number): number {
  return Math.round(minor) / 100;
}

/** A single invoice line total, in minor units. */
export function lineTotalMinor(item: Pick<InvoiceItem, 'quantity' | 'unitPrice'>): number {
  const quantity = Number(item.quantity);
  const unitPrice = Number(item.unitPrice);
  if (!Number.isFinite(quantity) || !Number.isFinite(unitPrice)) return 0;
  // Quantities may be fractional (hours), so multiply in major units then round to minor.
  return Math.round(quantity * unitPrice * 100);
}

/** A single invoice line total, in major units (2 decimals). */
export function lineTotal(item: Pick<InvoiceItem, 'quantity' | 'unitPrice'>): number {
  return toMajor(lineTotalMinor(item));
}

export type InvoiceTotals = {
  subtotal: number;
  discountRate: number;
  discount: number;
  taxRate: number;
  tax: number;
  total: number;
  amountPaid: number;
  amountDue: number;
};

/**
 * Compute every monetary figure for an invoice from its lines, discount and tax
 * settings. This is the single source of truth used by the UI, the PDF and the
 * dashboard so the numbers can never drift between them.
 */
export function invoiceTotals(invoice: Invoice): InvoiceTotals {
  const subtotalMinor = (invoice.items ?? []).reduce((sum, item) => sum + lineTotalMinor(item), 0);

  const discountRate = clampRate(invoice.discountPercent);
  const discountMinor = Math.round((subtotalMinor * discountRate) / 100);
  const netMinor = subtotalMinor - discountMinor;

  const taxRate = clampRate(invoice.taxRate);
  const taxMinor = Math.round((netMinor * taxRate) / 100);
  const totalMinor = netMinor + taxMinor;

  const amountPaidMinor = invoice.status === 'paid' ? totalMinor : clampMinor(toMinor(invoice.amountPaid), totalMinor);
  const amountDueMinor = Math.max(0, totalMinor - amountPaidMinor);

  return {
    subtotal: toMajor(subtotalMinor),
    discountRate,
    discount: toMajor(discountMinor),
    taxRate,
    tax: toMajor(taxMinor),
    total: toMajor(totalMinor),
    amountPaid: toMajor(amountPaidMinor),
    amountDue: toMajor(amountDueMinor)
  };
}

/** The headline invoice amount (subtotal − discount + tax). */
export function invoiceTotal(invoice: Invoice): number {
  return invoiceTotals(invoice).total;
}

/** The invoice subtotal before discount and tax. */
export function invoiceSubtotal(invoice: Invoice): number {
  return invoiceTotals(invoice).subtotal;
}

function clampRate(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n > 100 ? 100 : n;
}

function clampMinor(value: number, max: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value > max ? max : value;
}
