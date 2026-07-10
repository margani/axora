export type Currency = 'GBP' | 'USD' | 'EUR' | string;
export type InvoiceTemplate = 'classic' | 'modern' | 'compact';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';
export type BillingPeriodStatus = 'active' | 'review' | 'invoiced' | 'paid' | 'archived';

export type Profile = {
  companyName: string;
  contactName: string;
  address: string;
  email: string;
  phone: string;
  companyNumber: string;
  vatNumber: string;
  bankName: string;
  accountName: string;
  sortCode: string;
  accountNumber: string;
  iban: string;
  paymentTermsDays: number;
};

export type Client = {
  id: string;
  name: string;
  contactName: string;
  address: string;
  email: string;
  phone: string;
  companyNumber: string;
  vatNumber: string;
  notes: string;
  notesUpdatedAt: string;
  defaultHourlyRate: number;
  defaultCurrency: Currency;
  defaultPaymentTermsDays: number;
  defaultInvoiceTemplate: InvoiceTemplate | '';
  defaultServiceDescription: string;
  defaultTaxRate: number;
  archived: boolean;
};

export type TimesheetEntry = {
  id: string;
  date: string;
  hours: number;
  timeTrackingMode: 'duration' | 'time';
  startTime: string;
  endTime: string;
  breakMinutes: number;
  description: string;
  billable: boolean;
};

export type TimesheetEntryMode = 'simple' | 'detailed';

export type Timesheet = {
  id: string;
  title: string;
  clientId: string;
  month: number;
  year: number;
  hourlyRate: number;
  currency: Currency;
  entryMode: TimesheetEntryMode;
  archived: boolean;
  lastPdfGeneratedAt: string;
  entries: TimesheetEntry[];
};

export type InvoiceItem = {
  id: string;
  description: string;
  quantity: number;
  unitPrice: number;
};

/**
 * A point-in-time copy of the supplier and customer details captured when an
 * invoice is issued. Once captured, later edits to the business profile or the
 * client no longer alter an already-issued invoice.
 */
export type InvoiceSnapshot = {
  capturedAt: string;
  business: {
    companyName: string;
    contactName: string;
    address: string;
    email: string;
    phone: string;
    companyNumber: string;
    vatNumber: string;
    bankName: string;
    accountName: string;
    sortCode: string;
    accountNumber: string;
    iban: string;
  };
  client: {
    name: string;
    contactName: string;
    address: string;
    email: string;
    companyNumber: string;
    vatNumber: string;
  };
};

export type Invoice = {
  id: string;
  invoiceNumber: string;
  clientId: string;
  issueDate: string;
  dueDate: string;
  status: InvoiceStatus;
  currency: Currency;
  template: InvoiceTemplate;
  items: InvoiceItem[];
  notes: string;
  poReference: string;
  discountPercent: number;
  taxRate: number;
  amountPaid: number;
  sentDate: string;
  paidDate: string;
  timesheetId: string;
  snapshot: InvoiceSnapshot | null;
  archived: boolean;
  lastPdfGeneratedAt: string;
};

export type BillingPeriod = {
  id: string;
  clientId: string;
  month: number;
  year: number;
  timesheetId: string;
  invoiceId: string;
  notes: string;
  status: BillingPeriodStatus;
  archived: boolean;
  createdAt: string;
};

export type ActivityEvent = {
  id: string;
  at: string;
  type: 'created' | 'updated' | 'invoice' | 'pdf' | 'import' | 'export' | 'archive' | 'payment';
  message: string;
  billingPeriodId?: string;
};

export type WorkspaceSettings = {
  currency: Currency;
  invoiceTemplate: InvoiceTemplate;
  companyLogo: string;
  invoicePrefix: string;
  nextInvoiceNumber: number;
  defaultTaxRate: number;
};

export type Workspace = {
  version: 4;
  profile: Profile;
  clients: Client[];
  billingPeriods: BillingPeriod[];
  timesheets: Timesheet[];
  invoices: Invoice[];
  activity: ActivityEvent[];
  settings: WorkspaceSettings;
};
