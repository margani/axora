<script lang="ts">
  import type { Invoice, Workspace } from './types';
  import { buildInvoiceSnapshot, effectiveStatus, formatMoney, invoiceTotals, lineTotal, statusLabel } from './workspace';

  let { workspace, invoice }: { workspace: Workspace; invoice: Invoice } = $props();

  const parties = $derived(invoice.snapshot ?? buildInvoiceSnapshot(workspace, invoice));
  const totals = $derived(invoiceTotals(invoice));
  const currency = $derived(invoice.currency || workspace.settings.currency);

  function lines(value: string | undefined) {
    return (value ?? '').split('\n').filter(Boolean);
  }
</script>

<div class="paper" aria-label="Invoice preview">
  <header class="paper-head">
    <div>
      <h3>Invoice</h3>
      <div class="num">{invoice.invoiceNumber || '—'}</div>
    </div>
    <div class="from">
      <strong>{parties.business.companyName || 'Your business'}</strong>
      {#each lines(parties.business.address) as line}<div>{line}</div>{/each}
      {#if parties.business.email}<div>{parties.business.email}</div>{/if}
      {#if parties.business.vatNumber}<div>VAT {parties.business.vatNumber}</div>{/if}
    </div>
  </header>

  <div class="paper-rule"></div>

  <div class="parties">
    <div>
      <span class="lbl">Bill to</span>
      <strong>{parties.client.name || 'No client'}</strong>
      {#each lines(parties.client.address) as line}<div>{line}</div>{/each}
      {#if parties.client.vatNumber}<div>VAT {parties.client.vatNumber}</div>{/if}
    </div>
    <div class="meta">
      <div><span>Issue date</span><b>{invoice.issueDate || '—'}</b></div>
      <div><span>Due date</span><b>{invoice.dueDate || '—'}</b></div>
      <div><span>Status</span><b>{statusLabel(effectiveStatus(invoice))}</b></div>
      {#if invoice.poReference}<div><span>PO / ref</span><b>{invoice.poReference}</b></div>{/if}
    </div>
  </div>

  <table class="items">
    <thead>
      <tr><th>Description</th><th class="r">Qty</th><th class="r">Unit</th><th class="r">Amount</th></tr>
    </thead>
    <tbody>
      {#each invoice.items as item}
        <tr>
          <td>{item.description || 'Item'}</td>
          <td class="r">{Number(item.quantity || 0).toLocaleString('en-GB')}</td>
          <td class="r">{formatMoney(Number(item.unitPrice || 0), currency)}</td>
          <td class="r">{formatMoney(lineTotal(item), currency)}</td>
        </tr>
      {/each}
      {#if !invoice.items.length}
        <tr><td colspan="4" class="empty">No line items yet</td></tr>
      {/if}
    </tbody>
  </table>

  <div class="paper-totals">
    <div><span>Subtotal</span><b>{formatMoney(totals.subtotal, currency)}</b></div>
    {#if totals.discount > 0}<div><span>Discount ({totals.discountRate}%)</span><b>−{formatMoney(totals.discount, currency)}</b></div>{/if}
    {#if totals.tax > 0}<div><span>Tax / VAT ({totals.taxRate}%)</span><b>{formatMoney(totals.tax, currency)}</b></div>{/if}
    <div class="grand"><span>Total</span><b>{formatMoney(totals.total, currency)}</b></div>
    {#if totals.amountPaid > 0}
      <div><span>Paid</span><b>{formatMoney(totals.amountPaid, currency)}</b></div>
      <div class="due"><span>Amount due</span><b>{formatMoney(totals.amountDue, currency)}</b></div>
    {/if}
  </div>

  {#if parties.business.bankName || parties.business.accountNumber || invoice.notes}
    <div class="paper-rule"></div>
    <div class="pay">
      <span class="lbl">Payment</span>
      {#if parties.business.accountName || parties.business.companyName}<div>Account: {parties.business.accountName || parties.business.companyName}</div>{/if}
      {#if parties.business.bankName}<div>Bank: {parties.business.bankName}</div>{/if}
      {#if parties.business.sortCode || parties.business.accountNumber}<div>Sort code {parties.business.sortCode || '—'} · Account {parties.business.accountNumber || '—'}</div>{/if}
      {#if parties.business.iban}<div>IBAN {parties.business.iban}</div>{/if}
      {#if invoice.notes}<div class="note">{invoice.notes}</div>{/if}
    </div>
  {/if}
</div>

<style>
  /* The preview represents the printed invoice, so it always uses paper (light)
     styling regardless of the app theme. */
  .paper {
    background: #ffffff;
    color: #1f2328;
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px;
    font-size: 11px;
    line-height: 1.55;
  }
  .paper-head {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  .paper-head h3 {
    font-size: 18px;
    font-weight: 700;
    letter-spacing: -0.01em;
    color: #1f2328;
  }
  .num {
    color: #555b62;
    margin-top: 2px;
  }
  .from {
    text-align: right;
    color: #40464d;
  }
  .from strong {
    color: #1f2328;
  }
  .paper-rule {
    height: 1px;
    background: #e7e9ec;
    margin: 14px 0;
  }
  .parties {
    display: flex;
    justify-content: space-between;
    gap: 16px;
  }
  .parties strong {
    display: block;
    color: #1f2328;
    margin-top: 3px;
  }
  .parties > div {
    color: #40464d;
  }
  .lbl {
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: #8a9099;
    font-weight: 700;
  }
  .meta {
    text-align: right;
    display: grid;
    gap: 3px;
  }
  .meta > div {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
  }
  .meta span {
    color: #8a9099;
  }
  .meta b {
    color: #1f2328;
    font-variant-numeric: tabular-nums;
  }
  .items {
    width: 100%;
    border-collapse: collapse;
    margin-top: 14px;
  }
  .items th {
    text-align: left;
    font-size: 9.5px;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #8a9099;
    padding: 6px 0;
    border-bottom: 1px solid #e7e9ec;
  }
  .items td {
    padding: 7px 0;
    border-bottom: 1px solid #f0f1f3;
    color: #2c3238;
    vertical-align: top;
  }
  .items .r {
    text-align: right;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    padding-left: 10px;
  }
  .items .empty {
    text-align: center;
    color: #a0a6ad;
    padding: 16px 0;
  }
  .paper-totals {
    margin-top: 12px;
    margin-left: auto;
    width: 62%;
    display: grid;
    gap: 4px;
  }
  .paper-totals > div {
    display: flex;
    justify-content: space-between;
  }
  .paper-totals span {
    color: #555b62;
  }
  .paper-totals b {
    color: #1f2328;
    font-variant-numeric: tabular-nums;
  }
  .paper-totals .grand {
    border-top: 1px solid #e7e9ec;
    margin-top: 4px;
    padding-top: 7px;
    font-size: 12.5px;
  }
  .paper-totals .grand b {
    font-weight: 700;
  }
  .paper-totals .due b {
    color: #b3261e;
  }
  .pay {
    color: #40464d;
    display: grid;
    gap: 2px;
  }
  .pay .note {
    margin-top: 6px;
    color: #555b62;
  }
</style>
