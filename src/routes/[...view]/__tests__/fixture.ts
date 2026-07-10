import type { Workspace } from '$lib/types';
import { emptyClient, emptyInvoice, emptyTimesheet, normalizeWorkspace } from '$lib/workspace';

/**
 * A small, deterministic workspace used by the page integration tests. It is
 * intentionally independent of the marketing demo data so the tests stay stable
 * when the demo content changes.
 */
export function sampleWorkspace(): Workspace {
  const client = { ...emptyClient(), id: 'client_example', name: 'Example Client', defaultTaxRate: 0 };

  const timesheet = {
    ...emptyTimesheet(client.id, 'GBP', 500),
    id: 'timesheet_june',
    title: 'June 2026',
    month: 6,
    year: 2026,
    entries: [
      {
        id: 'entry_1',
        date: '2026-06-03',
        hours: 8,
        timeTrackingMode: 'duration' as const,
        startTime: '09:00',
        endTime: '17:30',
        breakMinutes: 30,
        description: 'Feature planning and implementation',
        billable: true
      }
    ]
  };

  const invoice = {
    ...emptyInvoice(client.id, 'GBP', 'classic'),
    id: 'invoice_1',
    invoiceNumber: 'INV-2026-001',
    issueDate: '2026-06-30',
    dueDate: '2026-07-14',
    taxRate: 0,
    timesheetId: timesheet.id,
    items: [{ id: 'item_1', description: 'Product engineering services', quantity: 15, unitPrice: 500 }]
  };

  return normalizeWorkspace({
    version: 4,
    profile: { companyName: 'Northstar Contracting Ltd' },
    clients: [client],
    timesheets: [timesheet],
    invoices: [invoice],
    settings: { currency: 'GBP', invoiceTemplate: 'classic', nextInvoiceNumber: 2 }
  });
}
