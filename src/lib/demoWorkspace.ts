import type { Workspace } from './types';
import { uid } from './workspace';

export function demoWorkspace(): Workspace {
  const clientId = uid('client');
  const timesheetId = uid('timesheet');
  const invoiceId = uid('invoice');
  const periodId = uid('period');

  return {
    version: 3,
    profile: {
      companyName: 'Northstar Contracting Ltd',
      contactName: 'Alex Morgan',
      address: '42 Market Street\nLondon\nEC1A 1AA',
      email: 'alex@example.com',
      phone: '+44 20 7946 0000',
      companyNumber: '12345678',
      vatNumber: 'GB123456789',
      bankName: 'Example Bank',
      accountName: 'Northstar Contracting Ltd',
      sortCode: '12-34-56',
      accountNumber: '12345678',
      iban: 'GB29 NWBK 6016 1331 9268 19',
      paymentTermsDays: 14
    },
    clients: [
      {
        id: clientId,
        name: 'Example Client',
        contactName: 'Sam Taylor',
        address: '1 Client Square\nBristol\nBS1 1AA',
        email: 'sam@example-client.test',
        phone: '+44 117 000 0000',
        companyNumber: '87654321',
        vatNumber: 'GB987654321',
        notes: 'Monthly product engineering retainer. Use the invoice number as payment reference.',
        notesUpdatedAt: '2026-06-01T09:00:00.000Z',
        defaultHourlyRate: 500,
        defaultCurrency: 'GBP',
        defaultPaymentTermsDays: 14,
        defaultInvoiceTemplate: 'modern',
        defaultServiceDescription: 'Product Engineering Services'
      }
    ],
    billingPeriods: [
      {
        id: periodId,
        clientId,
        month: 6,
        year: 2026,
        timesheetId,
        invoiceId,
        notes: 'Monthly product engineering paperwork for Example Client.',
        status: 'invoiced',
        archived: false,
        createdAt: '2026-06-01T09:00:00.000Z'
      }
    ],
    timesheets: [
      {
        id: timesheetId,
        title: 'June 2026 Product Engineering',
        clientId,
        month: 6,
        year: 2026,
        hourlyRate: 500,
        currency: 'GBP',
        entryMode: 'simple',
        archived: false,
        lastPdfGeneratedAt: '',
        entries: [
          {
            id: uid('entry'),
            date: '2026-06-03',
            hours: 8,
            timeTrackingMode: 'duration',
            startTime: '09:00',
            endTime: '17:30',
            breakMinutes: 30,
            description: 'Feature planning and implementation',
            billable: true
          },
          {
            id: uid('entry'),
            date: '2026-06-04',
            hours: 7,
            timeTrackingMode: 'duration',
            startTime: '09:15',
            endTime: '16:45',
            breakMinutes: 30,
            description: 'Bug fixes and release support',
            billable: true
          },
          {
            id: uid('entry'),
            date: '2026-06-05',
            hours: 2,
            timeTrackingMode: 'duration',
            startTime: '10:00',
            endTime: '12:00',
            breakMinutes: 0,
            description: 'Internal admin',
            billable: false
          }
        ]
      }
    ],
    invoices: [
      {
        id: invoiceId,
        invoiceNumber: 'INV-2026-001',
        clientId,
        issueDate: '2026-06-30',
        dueDate: '2026-07-14',
        status: 'draft',
        currency: 'GBP',
        template: 'classic',
        items: [
          {
            id: uid('item'),
            description: 'Product engineering services - June 2026',
            quantity: 15,
            unitPrice: 500
          }
        ],
        notes: 'Payment by bank transfer. Please include the invoice number as reference.',
        archived: false,
        lastPdfGeneratedAt: ''
      }
    ],
    activity: [
      {
        id: uid('activity'),
        at: '2026-06-30T15:00:00.000Z',
        type: 'invoice',
        message: 'Generated Invoice INV-2026-001',
        billingPeriodId: periodId
      },
      {
        id: uid('activity'),
        at: '2026-06-05T17:00:00.000Z',
        type: 'updated',
        message: 'Added 4h to Example Client',
        billingPeriodId: periodId
      }
    ],
    settings: {
      currency: 'GBP',
      invoiceTemplate: 'classic',
      companyLogo: ''
    }
  };
}
