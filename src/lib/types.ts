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
};

export type TimesheetEntry = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  description: string;
  billable: boolean;
};

export type Timesheet = {
  id: string;
  title: string;
  clientId: string;
  month: number;
  year: number;
  hourlyRate: number;
  currency: Currency;
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
};

export type Workspace = {
  version: 1;
  profile: Profile;
  clients: Client[];
  timesheets: Timesheet[];
  invoices: Invoice[];
  settings: {
    currency: Currency;
    invoiceTemplate: InvoiceTemplate;
  };
};
