import { describe, expect, it } from 'vitest';
import { buildInvoiceDoc, buildTimesheetDoc } from '../pdf';
import { sampleWorkspace } from '../../routes/[...view]/__tests__/fixture';

describe('PDF generation', () => {
  it('renders an invoice for each template without throwing', () => {
    const workspace = sampleWorkspace();
    for (const template of ['classic', 'modern', 'compact'] as const) {
      const invoice = { ...workspace.invoices[0], template };
      const doc = buildInvoiceDoc(workspace, invoice);
      expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
    }
  });

  it('renders using a captured snapshot when present', () => {
    const workspace = sampleWorkspace();
    const invoice = {
      ...workspace.invoices[0],
      snapshot: {
        capturedAt: '2026-06-01T00:00:00.000Z',
        business: {
          companyName: 'Snapshot Co',
          contactName: '',
          address: '1 Old Street',
          email: 'old@snapshot.test',
          phone: '',
          companyNumber: '',
          vatNumber: 'GB000',
          bankName: 'Old Bank',
          accountName: 'Snapshot Co',
          sortCode: '00-00-00',
          accountNumber: '00000000',
          iban: ''
        },
        client: { name: 'Frozen Client', contactName: '', address: 'Old address', email: '', companyNumber: '', vatNumber: '' }
      }
    };
    const doc = buildInvoiceDoc(workspace, invoice);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });

  it('renders a timesheet without throwing', () => {
    const workspace = sampleWorkspace();
    const doc = buildTimesheetDoc(workspace, workspace.timesheets[0]);
    expect(doc.getNumberOfPages()).toBeGreaterThanOrEqual(1);
  });
});
