import type {
  ActivityEvent,
  BillingPeriod,
  BillingPeriodStatus,
  Client,
  Currency,
  Invoice,
  InvoiceItem,
  InvoiceTemplate,
  Timesheet,
  TimesheetEntry,
  TimesheetEntryMode,
  Workspace
} from './types';

export const STORAGE_KEY = 'axora.workspace.v1';
export const SAVED_AT_KEY = 'axora.savedAt';

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

export function clientDefaults(client: Client | undefined, workspace: Workspace) {
  return {
    hourlyRate: Number(client?.defaultHourlyRate || 500),
    currency: client?.defaultCurrency || workspace.settings.currency || 'GBP',
    paymentTermsDays: Number(client?.defaultPaymentTermsDays || workspace.profile.paymentTermsDays || 14),
    invoiceTemplate: isInvoiceTemplate(client?.defaultInvoiceTemplate) ? client.defaultInvoiceTemplate : workspace.settings.invoiceTemplate || 'classic'
  };
}

function isInvoiceTemplate(value: unknown): value is InvoiceTemplate {
  return value === 'classic' || value === 'modern' || value === 'compact';
}

export function monthName(month: number) {
  return new Date(2026, month - 1, 1).toLocaleString('en-GB', { month: 'long' });
}

export function nextMonth(month: number, year: number) {
  return month >= 12 ? { month: 1, year: year + 1 } : { month: month + 1, year };
}

export function periodKey(clientId: string, month: number, year: number) {
  return `${clientId}:${year}-${String(month).padStart(2, '0')}`;
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
    vatNumber: '',
    notes: '',
    notesUpdatedAt: '',
    defaultHourlyRate: 500,
    defaultCurrency: 'GBP',
    defaultPaymentTermsDays: 14,
    defaultInvoiceTemplate: '',
    defaultServiceDescription: 'Professional services'
  };
}

export function emptyTimesheet(clientId = '', currency: Currency = 'GBP', hourlyRate = 500): Timesheet {
  const now = new Date();
  return {
    id: uid('timesheet'),
    title: `${monthName(now.getMonth() + 1)} ${now.getFullYear()} Timesheet`,
    clientId,
    month: now.getMonth() + 1,
    year: now.getFullYear(),
    hourlyRate,
    currency,
    entryMode: 'simple',
    archived: false,
    lastPdfGeneratedAt: '',
    entries: [emptyTimesheetEntry()]
  };
}

export function emptyTimesheetEntry(): TimesheetEntry {
  return {
    id: uid('entry'),
    date: todayIso(),
    hours: 0,
    timeTrackingMode: 'duration',
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
    notes: 'Payment by bank transfer. Thank you.',
    archived: false,
    lastPdfGeneratedAt: ''
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

export function emptyBillingPeriod(clientId = '', month = new Date().getMonth() + 1, year = new Date().getFullYear()): BillingPeriod {
  return {
    id: uid('period'),
    clientId,
    month,
    year,
    timesheetId: '',
    invoiceId: '',
    notes: '',
    status: 'active',
    archived: false,
    createdAt: new Date().toISOString()
  };
}

export function activity(message: string, type: ActivityEvent['type'] = 'updated', billingPeriodId?: string): ActivityEvent {
  return {
    id: uid('activity'),
    at: new Date().toISOString(),
    type,
    message,
    billingPeriodId
  };
}

export function emptyWorkspace(): Workspace {
  return {
    version: 3,
    profile: {
      companyName: '',
      contactName: '',
      address: '',
      email: '',
      phone: '',
      companyNumber: '',
      vatNumber: '',
      bankName: '',
      accountName: '',
      sortCode: '',
      accountNumber: '',
      iban: '',
      paymentTermsDays: 14
    },
    clients: [],
    billingPeriods: [],
    timesheets: [],
    invoices: [],
    activity: [],
    settings: {
      currency: 'GBP',
      invoiceTemplate: 'classic',
      companyLogo: ''
    }
  };
}

export function loadWorkspace(): { workspace: Workspace; savedAt: string } {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return { workspace: emptyWorkspace(), savedAt: '' };
  const parsed = JSON.parse(raw) as Partial<Workspace> & { lastSavedAt?: string; savedAt?: string };
  let savedAt = parsed.lastSavedAt || parsed.savedAt || localStorage.getItem(SAVED_AT_KEY) || '';
  if (!savedAt) {
    savedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...parsed, version: 3, lastSavedAt: savedAt }));
    localStorage.setItem(SAVED_AT_KEY, savedAt);
  }
  return { workspace: normalizeWorkspace(parsed), savedAt };
}

export function hasSavedWorkspace() {
  return Boolean(localStorage.getItem(STORAGE_KEY));
}

export function saveWorkspace(workspace: Workspace) {
  const savedAt = new Date().toISOString();
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...workspace, version: 3, lastSavedAt: savedAt }));
  localStorage.setItem(SAVED_AT_KEY, savedAt);
  return savedAt;
}

export function clearWorkspace() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(SAVED_AT_KEY);
}

export function normalizeWorkspace(value: unknown): Workspace {
  if (!value || typeof value !== 'object') throw new Error('Workspace file is not valid JSON data.');
  const source = value as Partial<Workspace> & { version?: number };
  if (source.version && source.version > 3) throw new Error('This workspace was created by a newer version of Axora.');
  if (source.version && source.version < 1) throw new Error('Workspace version is not supported.');
  const empty = emptyWorkspace();
  const workspace: Workspace = {
    version: 3,
    profile: { ...empty.profile, ...(source.profile ?? {}) },
    clients: Array.isArray(source.clients) ? source.clients.map(normalizeClient) : [],
    billingPeriods: Array.isArray(source.billingPeriods) ? source.billingPeriods.map(normalizeBillingPeriod) : [],
    timesheets: Array.isArray(source.timesheets) ? source.timesheets.map(normalizeTimesheet) : [],
    invoices: Array.isArray(source.invoices) ? source.invoices.map(normalizeInvoice) : [],
    activity: Array.isArray(source.activity) ? source.activity.map(normalizeActivity) : [],
    settings: {
      currency: source.settings?.currency ?? 'GBP',
      invoiceTemplate: isInvoiceTemplate(source.settings?.invoiceTemplate) ? source.settings.invoiceTemplate : 'classic',
      companyLogo: source.settings?.companyLogo ?? ''
    }
  };
  return {
    ...workspace,
    billingPeriods: ensureBillingPeriods(workspace),
    activity: workspace.activity
  };
}

function normalizeClient(client: Partial<Client>): Client {
  return {
    ...emptyClient(),
    ...client,
    defaultHourlyRate: Number(client.defaultHourlyRate || 500),
    defaultCurrency: client.defaultCurrency || 'GBP',
    defaultPaymentTermsDays: Number(client.defaultPaymentTermsDays || 14),
    defaultInvoiceTemplate: isInvoiceTemplate(client.defaultInvoiceTemplate) ? client.defaultInvoiceTemplate : '',
    defaultServiceDescription: client.defaultServiceDescription || 'Professional services',
    notes: client.notes || '',
    notesUpdatedAt: client.notesUpdatedAt || ''
  };
}

function normalizeTimesheet(timesheet: Partial<Timesheet>): Timesheet {
  const entryMode = timesheet.entryMode === 'detailed' ? 'detailed' : 'simple';
  return {
    ...emptyTimesheet(),
    ...timesheet,
    entryMode,
    archived: Boolean(timesheet.archived),
    lastPdfGeneratedAt: timesheet.lastPdfGeneratedAt ?? '',
    entries: Array.isArray(timesheet.entries) ? timesheet.entries.map((entry) => normalizeTimesheetEntry(entry, entryMode)) : []
  };
}

function normalizeTimesheetEntry(entry: Partial<TimesheetEntry>, parentMode: TimesheetEntryMode = 'simple'): TimesheetEntry {
  const timeTrackingMode = entry.timeTrackingMode === 'time' || (!entry.timeTrackingMode && parentMode === 'detailed') ? 'time' : 'duration';
  const normalized: TimesheetEntry = {
    ...emptyTimesheetEntry(),
    ...entry,
    hours: Number(entry.hours || 0),
    timeTrackingMode,
    breakMinutes: Number(entry.breakMinutes || 0),
    billable: entry.billable ?? true
  };
  if (normalized.timeTrackingMode === 'time') syncEntryDurationFromTime(normalized);
  return normalized;
}

function normalizeInvoice(invoice: Partial<Invoice>): Invoice {
  return {
    ...emptyInvoice(),
    ...invoice,
    template: invoice.template === 'modern' || invoice.template === 'compact' ? invoice.template : 'classic',
    archived: Boolean(invoice.archived),
    lastPdfGeneratedAt: invoice.lastPdfGeneratedAt ?? '',
    items: Array.isArray(invoice.items) ? invoice.items : []
  };
}

function normalizeBillingPeriod(period: Partial<BillingPeriod>): BillingPeriod {
  return {
    ...emptyBillingPeriod(),
    ...period,
    status: normalizeBillingStatus(period.status),
    archived: Boolean(period.archived)
  };
}

function normalizeBillingStatus(status: unknown): BillingPeriodStatus {
  return status === 'review' || status === 'invoiced' || status === 'paid' || status === 'archived' ? status : 'active';
}

function normalizeActivity(event: Partial<ActivityEvent>): ActivityEvent {
  return {
    id: event.id || uid('activity'),
    at: event.at || new Date().toISOString(),
    type: event.type || 'updated',
    message: event.message || 'Workspace updated',
    billingPeriodId: event.billingPeriodId
  };
}

export function ensureBillingPeriods(workspace: Workspace) {
  const periods = [...workspace.billingPeriods];
  const existing = new Set(periods.map((period) => periodKey(period.clientId, period.month, period.year)));

  for (const timesheet of workspace.timesheets) {
    const key = periodKey(timesheet.clientId, timesheet.month, timesheet.year);
    const invoice = findInvoiceForPeriod(workspace.invoices, timesheet.clientId, timesheet.month, timesheet.year);
    const found = periods.find((period) => periodKey(period.clientId, period.month, period.year) === key);
    if (found) {
      found.timesheetId ||= timesheet.id;
      found.invoiceId ||= invoice?.id ?? '';
      found.status = statusForPeriod(found, invoice);
      found.archived = found.archived || timesheet.archived || Boolean(invoice?.archived);
      continue;
    }
    periods.push({
      ...emptyBillingPeriod(timesheet.clientId, timesheet.month, timesheet.year),
      timesheetId: timesheet.id,
      invoiceId: invoice?.id ?? '',
      status: invoice?.status === 'paid' ? 'paid' : invoice ? 'invoiced' : 'active',
      archived: timesheet.archived || Boolean(invoice?.archived)
    });
    existing.add(key);
  }

  for (const invoice of workspace.invoices) {
    const date = new Date(`${invoice.issueDate || todayIso()}T12:00:00`);
    const month = date.getMonth() + 1;
    const year = date.getFullYear();
    const key = periodKey(invoice.clientId, month, year);
    if (existing.has(key)) continue;
    periods.push({
      ...emptyBillingPeriod(invoice.clientId, month, year),
      invoiceId: invoice.id,
      status: invoice.status === 'paid' ? 'paid' : 'invoiced',
      archived: invoice.archived
    });
  }

  return periods.sort((a, b) => b.year - a.year || b.month - a.month || clientName(workspace.clients, a.clientId).localeCompare(clientName(workspace.clients, b.clientId)));
}

function statusForPeriod(period: BillingPeriod, invoice?: Invoice) {
  if (period.archived) return 'archived';
  if (invoice?.status === 'paid') return 'paid';
  if (invoice) return 'invoiced';
  return period.status === 'review' ? 'review' : 'active';
}

export function findInvoiceForPeriod(invoices: Invoice[], clientId: string, month: number, year: number) {
  const monthText = monthName(month).toLowerCase();
  return invoices.find((invoice) => {
    if (invoice.clientId !== clientId) return false;
    const invoiceText = `${invoice.issueDate} ${invoice.items.map((item) => item.description).join(' ')}`.toLowerCase();
    return invoiceText.includes(`${year}`) && (invoiceText.includes(monthText) || invoice.issueDate.startsWith(`${year}-${String(month).padStart(2, '0')}`));
  });
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
  const next = nextMonth(Number(timesheet.month || 1), Number(timesheet.year || new Date().getFullYear()));
  return {
    ...structuredClone(timesheet),
    id: uid('timesheet'),
    title: `${monthName(next.month)} ${next.year} Timesheet`,
    month: next.month,
    year: next.year,
    archived: false,
    lastPdfGeneratedAt: '',
    entries: [emptyTimesheetEntry()]
  };
}

export function duplicateInvoice(invoice: Invoice, invoices: Invoice[], paymentTermsDays = 14): Invoice {
  const issueDate = todayIso();
  return {
    ...structuredClone(invoice),
    id: uid('invoice'),
    invoiceNumber: nextInvoiceNumber(invoices),
    issueDate,
    dueDate: addDays(issueDate, paymentTermsDays),
    status: 'draft',
    archived: false,
    lastPdfGeneratedAt: '',
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
    notes: 'Payment by bank transfer. Thank you.',
    archived: false,
    lastPdfGeneratedAt: ''
  };
}

export function calculateTimeEntryMinutes(entry: TimesheetEntry) {
  const [startHour, startMinute] = entry.startTime.split(':').map(Number);
  const [endHour, endMinute] = entry.endTime.split(':').map(Number);
  if ([startHour, startMinute, endHour, endMinute].some((part) => Number.isNaN(part))) return 0;
  return endHour * 60 + endMinute - (startHour * 60 + startMinute) - Number(entry.breakMinutes || 0);
}

export function syncEntryDurationFromTime(entry: TimesheetEntry) {
  const minutes = calculateTimeEntryMinutes(entry);
  entry.hours = minutes > 0 ? Number((minutes / 60).toFixed(2)) : 0;
  return minutes;
}

export function entryMinutes(entry: TimesheetEntry, _mode: TimesheetEntryMode = 'simple') {
  return Math.max(0, Math.round(Number(entry.hours || 0) * 60));
}

export function entryTimeLabel(entry: TimesheetEntry) {
  return entry.timeTrackingMode === 'time' && entry.startTime && entry.endTime ? `${entry.startTime}-${entry.endTime}` : '-';
}

export function billableMinutes(timesheet: Timesheet) {
  return timesheet.entries.filter((entry) => entry.billable).reduce((sum, entry) => sum + entryMinutes(entry, timesheet.entryMode), 0);
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
