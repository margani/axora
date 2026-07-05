export type Currency = 'GBP' | 'USD' | 'EUR' | string;
export type InvoiceTemplate = 'classic' | 'modern' | 'compact';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void';

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
  defaultHourlyRate: number;
  defaultCurrency: Currency;
  defaultPaymentTermsDays: number;
  defaultInvoiceTemplate: InvoiceTemplate;
};

export type TimesheetEntry = {
  id: string;
  date: string;
  hours: number;
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
  archived: boolean;
  lastPdfGeneratedAt: string;
};

export type Workspace = {
  version: 2;
  profile: Profile;
  clients: Client[];
  timesheets: Timesheet[];
  invoices: Invoice[];
  settings: {
    currency: Currency;
    invoiceTemplate: InvoiceTemplate;
    companyLogo: string;
  };
};
