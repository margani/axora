import type { Client, Invoice, Timesheet, Workspace } from './types';
import { addDays, emptyClient, emptyInvoice, normalizeWorkspace, todayIso, uid } from './workspace';

/**
 * A realistic multi-client demo workspace used for local development and for the
 * "Load sample data" onboarding action. It intentionally contains invoices in
 * several states (paid, sent, overdue, draft) so every dashboard and status view
 * has something meaningful to show.
 */
export function demoWorkspace(): Workspace {
  const today = todayIso();
  const year = new Date().getFullYear();
  const month = new Date().getMonth() + 1;
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevMonthYear = month === 1 ? year - 1 : year;

  const acme = client({
    name: 'Acme Digital Ltd',
    contactName: 'Sam Taylor',
    address: '1 Client Square\nBristol\nBS1 1AA',
    email: 'sam@acme-digital.test',
    companyNumber: '87654321',
    vatNumber: 'GB987654321',
    notes: 'Monthly product engineering retainer. Use the invoice number as the payment reference.',
    defaultHourlyRate: 550,
    defaultInvoiceTemplate: 'modern',
    defaultServiceDescription: 'Product engineering',
    defaultTaxRate: 20
  });

  const meridian = client({
    name: 'Meridian Studio',
    contactName: 'Priya Nair',
    address: '18 Bridge Road\nManchester\nM1 4ES',
    email: 'accounts@meridian.test',
    defaultHourlyRate: 480,
    defaultInvoiceTemplate: 'classic',
    defaultServiceDescription: 'Design & front-end consulting',
    defaultTaxRate: 20
  });

  const northwind = client({
    name: 'Northwind Analytics',
    contactName: 'Jordan Lee',
    address: '7 Harbour View\nEdinburgh\nEH6 6QP',
    email: 'finance@northwind.test',
    defaultHourlyRate: 600,
    defaultInvoiceTemplate: 'compact',
    defaultServiceDescription: 'Data platform advisory',
    defaultTaxRate: 0
  });

  const acmeSheet = timesheet({
    title: 'Product engineering',
    clientId: acme.id,
    month: prevMonth,
    year: prevMonthYear,
    hourlyRate: 550,
    entries: [
      ['2026-06-03', 8, 'Feature planning and implementation'],
      ['2026-06-04', 7, 'Bug fixes and release support'],
      ['2026-06-05', 6, 'Code review and pairing']
    ]
  });

  const meridianSheet = timesheet({
    title: 'Design consulting',
    clientId: meridian.id,
    month: prevMonth,
    year: prevMonthYear,
    hourlyRate: 480,
    entries: [
      ['2026-06-10', 5, 'Design system audit'],
      ['2026-06-11', 4, 'Component refactor']
    ]
  });

  const paidInvoice = invoice({
    invoiceNumber: 'INV-2026-001',
    clientId: acme.id,
    issueDate: addDays(today, -45),
    dueDate: addDays(today, -31),
    status: 'paid',
    paidDate: addDays(today, -28),
    taxRate: 20,
    timesheetId: acmeSheet.id,
    items: [{ description: 'Product engineering — May 2026', quantity: 21, unitPrice: 550 }]
  });

  const overdueInvoice = invoice({
    invoiceNumber: 'INV-2026-002',
    clientId: meridian.id,
    issueDate: addDays(today, -40),
    dueDate: addDays(today, -12),
    status: 'sent',
    sentDate: addDays(today, -40),
    taxRate: 20,
    timesheetId: meridianSheet.id,
    items: [{ description: 'Design consulting — May 2026', quantity: 9, unitPrice: 480 }]
  });

  const sentInvoice = invoice({
    invoiceNumber: 'INV-2026-003',
    clientId: acme.id,
    issueDate: addDays(today, -8),
    dueDate: addDays(today, 6),
    status: 'sent',
    sentDate: addDays(today, -8),
    taxRate: 20,
    items: [{ description: 'Product engineering — June 2026', quantity: 21, unitPrice: 550 }]
  });

  const draftInvoice = invoice({
    invoiceNumber: 'INV-2026-004',
    clientId: northwind.id,
    issueDate: today,
    dueDate: addDays(today, 30),
    status: 'draft',
    taxRate: 0,
    items: [{ description: 'Data platform advisory — June 2026', quantity: 10, unitPrice: 600 }]
  });

  const invoices = [draftInvoice, sentInvoice, overdueInvoice, paidInvoice];

  return normalizeWorkspace({
    version: 4,
    profile: {
      companyName: 'Northstar Contracting Ltd',
      contactName: 'Alex Morgan',
      address: '42 Market Street\nLondon\nEC1A 1AA',
      email: 'alex@northstar.test',
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
    clients: [acme, meridian, northwind],
    billingPeriods: [],
    timesheets: [acmeSheet, meridianSheet],
    invoices,
    activity: [
      event('invoice', `Marked ${paidInvoice.invoiceNumber} paid`),
      event('invoice', `Sent ${overdueInvoice.invoiceNumber}`),
      event('created', 'Added June timesheet for Acme Digital Ltd')
    ],
    settings: {
      currency: 'GBP',
      invoiceTemplate: 'classic',
      companyLogo: '',
      invoicePrefix: 'INV',
      nextInvoiceNumber: 5,
      defaultTaxRate: 20
    }
  });
}

function client(overrides: Partial<Client>): Client {
  return { ...emptyClient(), id: uid('client'), ...overrides };
}

function timesheet(config: {
  title: string;
  clientId: string;
  month: number;
  year: number;
  hourlyRate: number;
  entries: Array<[string, number, string]>;
}): Timesheet {
  return {
    id: uid('timesheet'),
    title: config.title,
    clientId: config.clientId,
    month: config.month,
    year: config.year,
    hourlyRate: config.hourlyRate,
    currency: 'GBP',
    entryMode: 'simple',
    archived: false,
    lastPdfGeneratedAt: '',
    entries: config.entries.map(([date, hours, description]) => ({
      id: uid('entry'),
      date,
      hours,
      timeTrackingMode: 'duration' as const,
      startTime: '09:00',
      endTime: '17:30',
      breakMinutes: 30,
      description,
      billable: true
    }))
  };
}

function invoice(
  config: Omit<Partial<Invoice>, 'items'> & { items: Array<{ description: string; quantity: number; unitPrice: number }> }
): Invoice {
  const { items, ...rest } = config;
  return {
    ...emptyInvoice(config.clientId ?? '', 'GBP', config.template ?? 'classic'),
    ...rest,
    items: items.map((item) => ({ id: uid('item'), ...item })),
    notes: 'Payment by bank transfer. Please include the invoice number as the reference.'
  };
}

function event(type: 'invoice' | 'created', message: string) {
  return { id: uid('activity'), at: new Date().toISOString(), type: type as never, message };
}
