import { jsPDF } from 'jspdf';
import type { Client, Invoice, Profile, Timesheet, Workspace } from './types';
import { billableMinutes, entryMinutes, formatHours, formatMoney, invoiceTotal, monthName, timesheetTotal } from './workspace';

type PdfContext = {
  doc: jsPDF;
  workspace: Workspace;
  client?: Client;
};

function lines(value: string | undefined) {
  return (value ?? '').split('\n').filter(Boolean);
}

function money(value: number, currency: string) {
  return formatMoney(value, currency).replace('£', 'GBP ');
}

function addWrapped(doc: jsPDF, text: string, x: number, y: number, maxWidth: number, lineHeight = 6) {
  const wrapped = doc.splitTextToSize(text || '', maxWidth);
  doc.text(wrapped, x, y);
  return y + wrapped.length * lineHeight;
}

function findClient(workspace: Workspace, clientId: string) {
  return workspace.clients.find((client) => client.id === clientId);
}

function imageFormat(dataUrl: string) {
  if (dataUrl.startsWith('data:image/png')) return 'PNG';
  if (dataUrl.startsWith('data:image/jpeg') || dataUrl.startsWith('data:image/jpg')) return 'JPEG';
  if (dataUrl.startsWith('data:image/svg+xml')) return 'SVG';
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

function companyBlock(doc: jsPDF, profile: Profile, x: number, y: number) {
  doc.setFontSize(10);
  doc.text(profile.companyName, x, y);
  let next = y + 5;
  for (const line of lines(profile.address)) {
    doc.text(line, x, next);
    next += 5;
  }
  if (profile.email) doc.text(profile.email, x, next);
  if (profile.phone) doc.text(profile.phone, x, next + 5);
}

export function generateInvoicePdf(workspace: Workspace, invoice: Invoice) {
  const doc = new jsPDF();
  const ctx = { doc, workspace, client: findClient(workspace, invoice.clientId) };
  if (invoice.template === 'modern') renderModernInvoice(ctx, invoice);
  else if (invoice.template === 'compact') renderCompactInvoice(ctx, invoice);
  else renderClassicInvoice(ctx, invoice);
  doc.save(`${invoice.invoiceNumber || 'invoice'}.pdf`);
}

export function generateTimesheetPdf(workspace: Workspace, timesheet: Timesheet) {
  const doc = new jsPDF();
  const client = findClient(workspace, timesheet.clientId);
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
    doc.text(timesheet.entryMode === 'detailed' ? `${entry.startTime}-${entry.endTime}` : '-', 45, y);
    doc.text(timesheet.entryMode === 'detailed' ? String(entry.breakMinutes || 0) : '-', 82, y);
    doc.text(formatHours(entryMinutes(entry, timesheet.entryMode)), 105, y);
    doc.text(entry.billable ? 'Yes' : 'No', 128, y);
    y = addWrapped(doc, entry.description, 154, y, 42, 5) + 2;
  }
  y += 8;
  doc.setFont('helvetica', 'bold');
  doc.text(`Billable hours: ${formatHours(billableMinutes(timesheet))}`, 16, y);
  doc.text(`Total: ${money(timesheetTotal(timesheet), timesheet.currency)}`, 120, y);
  doc.save(`${timesheet.title || 'timesheet'}.pdf`);
}

function renderClassicInvoice({ doc, workspace, client }: PdfContext, invoice: Invoice) {
  addLogo(doc, workspace, 16, 10, 24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(24);
  doc.text('Invoice', workspace.settings.companyLogo ? 46 : 16, 20);
  doc.setFontSize(12);
  doc.text(invoice.invoiceNumber, workspace.settings.companyLogo ? 46 : 16, 30);
  companyBlock(doc, workspace.profile, 130, 20);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill to', 16, 50);
  doc.setFont('helvetica', 'normal');
  doc.text(client?.name ?? 'No client selected', 16, 58);
  lines(client?.address).forEach((line, index) => doc.text(line, 16, 66 + index * 5));
  doc.text(`Issue date: ${invoice.issueDate}`, 130, 58);
  doc.text(`Due date: ${invoice.dueDate}`, 130, 66);
  renderInvoiceTable(doc, invoice, 16, 95, 112);
  renderPaymentBlock(doc, workspace.profile, invoice, 16, 235);
}

function renderModernInvoice({ doc, workspace, client }: PdfContext, invoice: Invoice) {
  doc.setFillColor(24, 31, 42);
  doc.rect(0, 0, 210, 52, 'F');
  addLogo(doc, workspace, 16, 11, 22);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(26);
  doc.text(workspace.profile.companyName || 'Invoice', workspace.settings.companyLogo ? 44 : 16, 22);
  doc.setFontSize(11);
  doc.text(`Invoice ${invoice.invoiceNumber}`, workspace.settings.companyLogo ? 44 : 16, 36);
  doc.text(`Due ${invoice.dueDate}`, 160, 36);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Client', 16, 68);
  doc.text('Summary', 130, 68);
  doc.setFont('helvetica', 'normal');
  doc.text(client?.name ?? 'No client selected', 16, 77);
  lines(client?.address).forEach((line, index) => doc.text(line, 16, 85 + index * 5));
  doc.text(`Issued: ${invoice.issueDate}`, 130, 77);
  doc.text(`Status: ${invoice.status}`, 130, 85);
  renderInvoiceTable(doc, invoice, 16, 110, 120);
  renderPaymentBlock(doc, workspace.profile, invoice, 16, 238);
}

function renderCompactInvoice({ doc, workspace, client }: PdfContext, invoice: Invoice) {
  addLogo(doc, workspace, 12, 7, 16);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.text(`${workspace.profile.companyName} / ${invoice.invoiceNumber}`, workspace.settings.companyLogo ? 34 : 12, 15);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Client: ${client?.name ?? 'No client selected'}`, 12, 24);
  doc.text(`Issue: ${invoice.issueDate}`, 112, 24);
  doc.text(`Due: ${invoice.dueDate}`, 152, 24);
  const address = [...lines(workspace.profile.address), workspace.profile.email, workspace.profile.phone].filter(Boolean).join(' | ');
  doc.text(doc.splitTextToSize(address, 185), 12, 32);
  renderInvoiceTable(doc, invoice, 12, 50, 126);
  renderPaymentBlock(doc, workspace.profile, invoice, 12, 222);
}

function renderInvoiceTable(doc: jsPDF, invoice: Invoice, x: number, y: number, descWidth: number) {
  doc.setFont('helvetica', 'bold');
  doc.text('Description', x, y);
  doc.text('Qty', x + descWidth + 8, y);
  doc.text('Unit', x + descWidth + 32, y);
  doc.text('Total', x + descWidth + 64, y);
  doc.line(x, y + 3, 195, y + 3);
  doc.setFont('helvetica', 'normal');
  let nextY = y + 12;
  for (const item of invoice.items) {
    if (nextY > 260) {
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
  doc.setFont('helvetica', 'bold');
  doc.text(`Total: ${money(invoiceTotal(invoice), invoice.currency)}`, 142, nextY + 14);
}

function renderPaymentBlock(doc: jsPDF, profile: Profile, invoice: Invoice, x: number, y: number) {
  doc.setFont('helvetica', 'bold');
  doc.text('Payment', x, y);
  doc.setFont('helvetica', 'normal');
  doc.text(`Account: ${profile.accountName || profile.companyName}`, x, y + 8);
  doc.text(`Bank: ${profile.bankName || '-'}`, x, y + 16);
  doc.text(`Sort code: ${profile.sortCode || '-'}   Account: ${profile.accountNumber || '-'}`, x, y + 24);
  if (profile.iban) doc.text(`IBAN: ${profile.iban}`, x, y + 32);
  if (invoice.notes) addWrapped(doc, invoice.notes, x, y + 43, 170, 5);
}
