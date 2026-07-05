import type { Client, Invoice, InvoiceItem, InvoiceTemplate, Timesheet, TimesheetEntry, Workspace } from './types';

export const STORAGE_KEY = 'contractor-paperwork-kit.workspace.v1';
export const SAVED_AT_KEY = 'contractor-paperwork-kit.savedAt';

export function uid(prefix: string) {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

export function addDays(date: string, days: number) {
  const next = new Date(`${date}T12:00:00`);
  next.setDate(next.getDate() + days);
  return next.toISOString().slice(0, 10);
}

export function monthName(month: number) {
  return new Date(2026, month - 1, 1).toLocaleString('en-GB', { month: 'long' });
}

export function emptyClient(): Client {
  return {
    id: uid('client'),
    name: '',
    contactName: '',
    address: '',
    email: '',
    phone: '',
    companyNumber: '',
    vatNumber: ''
  };
}

export function emptyTimesheet(clientId = '', currency = 'GBP'): Timesheet {
  const now = new Date();
  return {
    id: uid('timesheet'),
    title: `${monthName(now.getMonth() + 1)} ${now.getFullYear()} Timesheet`,
    clientId,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    hourlyRate: 500,
    currency,
    entries: [emptyTimesheetEntry()]
  };
}

export function emptyTimesheetEntry(): TimesheetEntry {
  return {
    id: uid('entry'),
    date: todayIso(),
    startTime: '09:00',
    endTime: '17:30',
    breakMinutes: 30,
    description: '',
    billable: true
  };
}

export function emptyInvoice(clientId = '', currency = 'GBP', template: InvoiceTemplate = 'classic'): Invoice {
  const issueDate = todayIso();
  return {
    id: uid('invoice'),
    invoiceNumber: nextInvoiceNumber([]),
    clientId,
    issueDate,
    dueDate: addDays(issueDate, 14),
    status: 'draft',
    currency,
    template,
    items: [emptyInvoiceItem()],
    notes: 'Payment by bank transfer. Thank you.'
  };
}

export function emptyInvoiceItem(): InvoiceItem {
  return {
    id: uid('item'),
    description: '',
    quantity: 1,
    unitPrice: 0
  };
}

export function sampleWorkspace(): Workspace {
  const clientId = uid('client');
  const timesheetId = uid('timesheet');
  const invoiceId = uid('invoice');
  return {
    version: 1,
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
        name: 'Aqovia Labs',
        contactName: 'Sam Taylor',
        address: '1 Client Square\nBristol\nBS1 1AA',
        email: 'sam@aqovia.example',
        phone: '+44 117 000 0000',
        companyNumber: '87654321',
        vatNumber: 'GB987654321'
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
        entries: [
          {
            id: uid('entry'),
            date: '2026-06-03',
            startTime: '09:00',
            endTime: '17:30',
            breakMinutes: 30,
            description: 'Feature planning and implementation',
            billable: true
          },
          {
            id: uid('entry'),
            date: '2026-06-04',
            startTime: '09:15',
            endTime: '16:45',
            breakMinutes: 30,
            description: 'Bug fixes and release support',
            billable: true
          },
          {
            id: uid('entry'),
            date: '2026-06-05',
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
        notes: 'Payment by bank transfer. Please include the invoice number as reference.'
      }
    ],
    settings: {
      currency: 'GBP',
      invoiceTemplate: 'classic'
    }
  };
}

export function loadWorkspace(): { workspace: Workspace; savedAt: string } {
  const raw = localStorage.getItem(STORAGE_KEY);
  const savedAt = localStorage.getItem(SAVED_AT_KEY) ?? '';
  if (!raw) return { workspace: sampleWorkspace(), savedAt: '' };
  return { workspace: normalizeWorkspace(JSON.parse(raw)), savedAt };
}

export function saveWorkspace(workspace: Workspace) {
  const savedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
  localStorage.setItem(SAVED_AT_KEY, savedAt);
  return savedAt;
}

export function clearWorkspace() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SAVED_AT_KEY);
}

export function normalizeWorkspace(value: unknown): Workspace {
  if (!value || typeof value !== 'object') throw new Error('Workspace file is not valid JSON data.');
  const source = value as Partial<Workspace>;
  if (source.version !== 1) throw new Error('Only workspace version 1 is supported.');
  return {
    version: 1,
    profile: { ...sampleWorkspace().profile, ...(source.profile ?? {}) },
    clients: Array.isArray(source.clients) ? source.clients : [],
    timesheets: Array.isArray(source.timesheets) ? source.timesheets : [],
    invoices: Array.isArray(source.invoices) ? source.invoices : [],
    settings: {
      currency: source.settings?.currency ?? 'GBP',
      invoiceTemplate: source.settings?.invoiceTemplate ?? 'classic'
    }
  };
}

export function downloadJson(workspace: Workspace) {
  const blob = new Blob([JSON.stringify(workspace, null, 2)], { type: 'application/json' });
  downloadBlob(blob, 'workspace.json');
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function duplicateTimesheet(timesheet: Timesheet): Timesheet {
  return {
    ...structuredClone(timesheet),
    id: uid('timesheet'),
    title: `${timesheet.title} copy`,
    entries: timesheet.entries.map((entry) => ({ ...entry, id: uid('entry') }))
  };
}

export function duplicateInvoice(invoice: Invoice): Invoice {
  return {
    ...structuredClone(invoice),
    id: uid('invoice'),
    invoiceNumber: `${invoice.invoiceNumber}-COPY`,
    status: 'draft',
    items: invoice.items.map((item) => ({ ...item, id: uid('item') }))
  };
}

export function invoiceFromTimesheet(timesheet: Timesheet, invoiceNumber: string, paymentTermsDays: number, template: string): Invoice {
  const issueDate = todayIso();
  const hours = billableMinutes(timesheet) / 60;
  return {
    id: uid('invoice'),
    invoiceNumber,
    clientId: timesheet.clientId,
    issueDate,
    dueDate: addDays(issueDate, paymentTermsDays),
    status: 'draft',
    currency: timesheet.currency,
    template: template === 'modern' || template === 'compact' ? template : 'classic',
    items: [
      {
        id: uid('item'),
        description: `${timesheet.title} - ${monthName(timesheet.month)} ${timesheet.year}`,
        quantity: Number(hours.toFixed(2)),
        unitPrice: timesheet.hourlyRate
      }
    ],
    notes: 'Payment by bank transfer. Thank you.'
  };
}

export function entryMinutes(entry: TimesheetEntry) {
  const [startHour, startMinute] = entry.startTime.split(':').map(Number);
  const [endHour, endMinute] = entry.endTime.split(':').map(Number);
  if ([startHour, startMinute, endHour, endMinute].some((part) => Number.isNaN(part))) return 0;
  let minutes = endHour * 60 + endMinute - (startHour * 60 + startMinute) - Number(entry.breakMinutes || 0);
  if (minutes < 0) minutes += 24 * 60;
  return Math.max(0, minutes);
}

export function billableMinutes(timesheet: Timesheet) {
  return timesheet.entries.filter((entry) => entry.billable).reduce((sum, entry) => sum + entryMinutes(entry), 0);
}

export function timesheetTotal(timesheet: Timesheet) {
  return (billableMinutes(timesheet) / 60) * Number(timesheet.hourlyRate || 0);
}

export function invoiceSubtotal(invoice: Invoice) {
  return invoice.items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unitPrice || 0), 0);
}

export const invoiceTotal = invoiceSubtotal;

export function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: currency || 'GBP' }).format(value || 0);
}

export function formatHours(minutes: number) {
  return `${(minutes / 60).toFixed(2)}h`;
}

export function clientName(clients: Client[], clientId: string) {
  return clients.find((client) => client.id === clientId)?.name ?? 'No client';
}

export function nextInvoiceNumber(invoices: Invoice[]) {
  const year = new Date().getFullYear();
  const next = invoices.length + 1;
  return `INV-${year}-${String(next).padStart(3, '0')}`;
}
