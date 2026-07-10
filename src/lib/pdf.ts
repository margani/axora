import { jsPDF } from 'jspdf';
import type { Invoice, InvoiceSnapshot, Timesheet, Workspace } from './types';
import {
  billableMinutes,
  buildInvoiceSnapshot,
  effectiveStatus,
  entryMinutes,
  entryTimeLabel,
  formatHours,
  invoiceTotals,
  monthName,
  statusLabel,
  timesheetTotal
} from './workspace';

type Parties = InvoiceSnapshot['business'] & { client: InvoiceSnapshot['client'] };

type PdfContext = {
  doc: jsPDF;
  workspace: Workspace;
  parties: Parties;
};

function lines(value: string | undefined) {
  return (value ?? '').split('\n').filter(Boolean);
}

/**
 * Currency is rendered as an ISO code prefix (e.g. "GBP 1,200.00") rather than a
 * symbol. jsPDF's built-in Helvetica cannot render every currency glyph, so a
 * code keeps every invoice unambiguous and correctly typeset in any currency.
 */
function money(value: number, currency: string) {
  const amount = new Intl.NumberFormat('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value || 0);
  return `${(currency || 'GBP').toUpperCase()} ${amount}`;
}

function addWrapped(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 6) {
  const wrapped = doc.splitTextToSize(text || '', maxWidth);
  doc.text(wrapped, x, y);
  return y + wrapped.length * lineHeight;
}

function imageFormat(dataUrl: string) {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  return 'PNG';
}

function addLogo(doc: jsPDF, workspace: Workspace, x: number, y: number, width = 30) {
  const logo = workspace.settings.companyLogo;
  if (!logo) return;
  try {
    doc.addImage(logo, imageFormat(logo), x, y, width, 0);
  } catch {
    // Keep PDF generation resilient if a browser cannot render a provided image format.
  }
}

/** Resolve the supplier/customer details, preferring the invoice snapshot if it exists. */
function resolveParties(workspace: Workspace, invoice: Invoice): Parties {
  const snapshot = invoice.snapshot ?? buildInvoiceSnapshot(workspace, invoice);
  return { ...snapshot.business, client: snapshot.client };
}

function companyBlock(doc: jsPDF, parties: Parties, x: number, y: number) {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(parties.companyName || 'Your business', x, y);
  doc.setFont('helvetica', 'normal');
  let next = y + 5;
  for (const line of lines(parties.address)) {
    doc.text(line, x, next);
    next += 5;
  }
  if (parties.email) {
    doc.text(parties.email, x, next);
    next += 5;
  }
  if (parties.phone) {
    doc.text(parties.phone, x, next);
    next += 5;
  }
  if (parties.vatNumber) doc.text(`VAT ${parties.vatNumber}`, x, next);
}

export function generateInvoicePdf(workspace: Workspace, invoice: Invoice) {
  const doc = new jsPDF();
  const ctx: PdfContext = { doc, workspace, parties: resolveParties(workspace, invoice) };
  if (invoice.template === 'modern') renderModernInvoice(ctx, invoice);
  else if (invoice.template === 'compact') renderCompactInvoice(ctx, invoice);
  else renderClassicInvoice(ctx, invoice);
  doc.save(`${invoice.invoiceNumber || 'invoice'}.pdf`);
}

export function generateTimesheetPdf(workspace: Workspace, timesheet: Timesheet) {
  const doc = new jsPDF();
  const client = workspace.clients.find((item) => item.id === timesheet.clientId);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(20);
  doc.text('Timesheet', 16, 20);
  doc.setFontSize(12);
  doc.text(timesheet.title, 16, 30);
  doc.setFont('helvetica', 'normal');
  doc.text(`${monthName(timesheet.month)} ${timesheet.year}`, 16, 38);
  doc.text(`Client: ${client?.name ?? 'No client'}`, 16, 46);
  doc.text(`Contractor: ${workspace.profile.companyName}`, 16, 54);

  let y = 70;
  doc.setFont('helvetica', 'bold');
  doc.text('Date', 16, y);
  doc.text('Time', 45, y);
  doc.text('Break', 82, y);
  doc.text('Hours', 105, y);
  doc.text('Billable', 128, y);
  doc.text('Description', 154, y);
  doc.line(16, y + 3, 195, y + 3);
  doc.setFont('helvetica', 'normal');
  y += 10;
  for (const entry of timesheet.entries) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }
    doc.text(entry.date, 16, y);
    doc.text(entryTimeLabel(entry), 45, y);
    doc.text(entry.timeTrackingMode === 'time' ? String(entry.breakMinutes || 0) : '-', 82, y);
    doc.text(formatHours(entryMinutes(entry)), 105, y);
    doc.text(entry.billable ? 'Yes' : 'No', 128, y);
    y = addWrapped(doc, entry.description, 154, y, 42, 5) + 2;
  }
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text(`Billable hours: ${formatHours(billableMinutes(timesheet))}`, 16, y);
  doc.text(`Total: ${money(timesheetTotal(timesheet), timesheet.currency)}`, 120, y);
  doc.save(`${timesheet.title || 'timesheet'}.pdf`);
}

function clientBlock(doc: jsPDF, parties: Parties, x: number, y: number) {
  doc.setFont('helvetica', 'normal');
  doc.text(parties.client.name || 'No client selected', x, y);
  let next = y + 5;
  for (const line of lines(parties.client.address)) {
    doc.text(line, x, next);
    next += 5;
  }
  if (parties.client.vatNumber) doc.text(`VAT ${parties.client.vatNumber}`, x, next);
}

function renderClassicInvoice({ doc, workspace, parties }: PdfContext, invoice: Invoice) {
  addLogo(doc, workspace, 16, 10, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('Invoice', workspace.settings.companyLogo ? 46 : 16, 20);
  doc.setFontSize(12);
  doc.text(invoice.invoiceNumber, workspace.settings.companyLogo ? 46 : 16, 30);
  companyBlock(doc, parties, 130, 20);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill to', 16, 52);
  clientBlock(doc, parties, 16, 60);
  metaBlock(doc, invoice, 130, 52);
  const tableEnd = renderInvoiceTable(doc, invoice, 16, 95, 112);
  renderTotals(doc, invoice, tableEnd + 6);
  renderPaymentBlock(doc, parties, invoice, 16, Math.max(tableEnd + 40, 235));
}

function renderModernInvoice({ doc, workspace, parties }: PdfContext, invoice: Invoice) {
  doc.setFillColor(24, 31, 42);
  doc.rect(0, 0, 210, 52, 'F');
  addLogo(doc, workspace, 16, 11, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text(parties.companyName || 'Invoice', workspace.settings.companyLogo ? 44 : 16, 22);
  doc.setFontSize(11);
  doc.text(`Invoice ${invoice.invoiceNumber}`, workspace.settings.companyLogo ? 44 : 16, 36);
  doc.text(`Due ${invoice.dueDate}`, 158, 36);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill to', 16, 68);
  doc.text('Details', 130, 68);
  clientBlock(doc, parties, 16, 77);
  metaBlock(doc, invoice, 130, 77);
  const tableEnd = renderInvoiceTable(doc, invoice, 16, 110, 120);
  renderTotals(doc, invoice, tableEnd + 6);
  renderPaymentBlock(doc, parties, invoice, 16, Math.max(tableEnd + 40, 238));
}

function renderCompactInvoice({ doc, workspace, parties }: PdfContext, invoice: Invoice) {
  addLogo(doc, workspace, 12, 7, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${parties.companyName} / ${invoice.invoiceNumber}`, workspace.settings.companyLogo ? 34 : 12, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Client: ${parties.client.name || 'No client selected'}`, 12, 24);
  doc.text(`Issue: ${invoice.issueDate}`, 112, 24);
  doc.text(`Due: ${invoice.dueDate}`, 152, 24);
  const address = [...lines(parties.address), parties.email, parties.phone].filter(Boolean).join(' | ');
  doc.text(doc.splitTextToSize(address, 185), 12, 32);
  const tableEnd = renderInvoiceTable(doc, invoice, 12, 50, 126);
  renderTotals(doc, invoice, tableEnd + 6);
  renderPaymentBlock(doc, parties, invoice, 12, Math.max(tableEnd + 40, 222));
}

function metaBlock(doc: jsPDF, invoice: Invoice, x: number, y: number) {
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10);
  const rows = [
    `Issue date: ${invoice.issueDate}`,
    `Due date: ${invoice.dueDate}`,
    `Status: ${statusLabel(effectiveStatus(invoice))}`
  ];
  if (invoice.poReference) rows.push(`PO / ref: ${invoice.poReference}`);
  rows.forEach((row, index) => doc.text(row, x, y + index * 6));
}

function renderInvoiceTable(doc: jsPDF, invoice: Invoice, x: number, y: number, descWidth: number) {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Description', x, y);
  doc.text('Qty', x + descWidth + 8, y);
  doc.text('Unit', x + descWidth + 32, y);
  doc.text('Total', x + descWidth + 64, y);
  doc.line(x, y + 3, 195, y + 3);
  doc.setFont('helvetica', 'normal');
  let nextY = y + 12;
  for (const item of invoice.items) {
    if (nextY > 250) {
      doc.addPage();
      nextY = 20;
    }
    const rowStart = nextY;
    nextY = addWrapped(doc, item.description, x, nextY, descWidth, 5);
    doc.text(String(item.quantity || 0), x + descWidth + 8, rowStart);
    doc.text(money(Number(item.unitPrice || 0), invoice.currency), x + descWidth + 32, rowStart);
    doc.text(money(Number(item.quantity || 0) * Number(item.unitPrice || 0), invoice.currency), x + descWidth + 64, rowStart);
    nextY += 4;
  }
  doc.line(x, nextY + 2, 195, nextY + 2);
  return nextY + 2;
}

function renderTotals(doc: jsPDF, invoice: Invoice, y: number) {
  const totals = invoiceTotals(invoice);
  const labelX = 140;
  const valueX = 195;
  let row = y + 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  const line = (label: string, value: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(label, labelX, row);
    doc.text(value, valueX, row, { align: 'right' });
    row += 6;
  };
  line('Subtotal', money(totals.subtotal, invoice.currency));
  if (totals.discount > 0) line(`Discount (${totals.discountRate}%)`, `-${money(totals.discount, invoice.currency)}`);
  if (totals.tax > 0) line(`Tax / VAT (${totals.taxRate}%)`, money(totals.tax, invoice.currency));
  line('Total', money(totals.total, invoice.currency), true);
  if (totals.amountPaid > 0 && totals.amountDue > 0) {
    line('Paid', money(totals.amountPaid, invoice.currency));
    line('Amount due', money(totals.amountDue, invoice.currency), true);
  }
  return row;
}

function renderPaymentBlock(doc: jsPDF, parties: Parties, invoice: Invoice, x: number, y: number) {
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Payment', x, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Account: ${parties.accountName || parties.companyName}`, x, y + 8);
  doc.text(`Bank: ${parties.bankName || '-'}`, x, y + 16);
  doc.text(`Sort code: ${parties.sortCode || '-'}   Account: ${parties.accountNumber || '-'}`, x, y + 24);
  let next = y + 32;
  if (parties.iban) {
    doc.text(`IBAN: ${parties.iban}`, x, next);
    next += 8;
  }
  if (invoice.notes) addWrapped(doc, invoice.notes, x, next + 3, 170, 5);
}
