# Axora

A local-first SvelteKit SPA for freelancers and contractors to manage clients, timesheets, and invoices without accounts, cookies, backend services, cloud storage, or a database.

The app stores data in the browser with `localStorage` and lets the user import/export one portable versioned `workspace.json` file.

## Features

- **Dashboard** with revenue and hours summaries and a "Needs attention" panel
  surfacing overdue invoices, draft invoices, and uninvoiced timesheets.
- **Client-centred workspace** — each client has an overview, timesheets,
  invoices, notes, and settings, with per-client defaults (rate, currency,
  payment terms, tax rate, template, service description). Clients can be
  archived or deleted.
- **Timesheets** — multiple timesheets per client and per month, editable title
  and rate, simple (hours) or detailed (start/end/break) entries, running
  totals, and PDF export.
- **Invoices** — create manually, generate from a timesheet (with a persistent
  link back to the source), or duplicate. Fully editable: number, status, issue
  and due dates, currency, PO reference, discount, tax/VAT, template and notes.
- **Correct money** — every currency figure is computed in integer minor units
  (decimal-safe), with a subtotal → discount → tax → total → amount-due
  breakdown shown in the app and the PDF.
- **Invoice statuses** — draft, sent, paid, overdue (derived automatically from
  the due date) and void, with recorded sent/paid dates.
- **Immutable issued invoices** — supplier and client details are snapshotted
  when an invoice is marked sent or paid, so later edits to the business profile
  or a client do not change an already-issued invoice.
- **Reliable invoice numbering** — a persistent, configurable counter (prefix +
  year + sequence) that never reuses a number after a delete or collides after
  a duplicate.
- **Live invoice preview** beside the editor that mirrors the PDF and updates as
  you type, plus **partial-payment recording** that marks an invoice paid once
  it is settled in full.
- **Three PDF templates** — Classic, Modern, and Compact, kept close to the
  in-app preview.
- **Light and dark themes** with a sidebar toggle (light / dark / follow the
  system), built on a modern design-token system.
- **Local-first** — autosave to `localStorage` with a trustworthy save-status
  indicator, portable `workspace.json` import/export, and a one-click "clear
  local data".
- Empty first-run workspace in production, with optional local demo data or a
  "Load sample data" action in Settings.

## Tech

- SvelteKit
- TypeScript
- Static SPA build
- `localStorage` persistence
- Client-side PDF generation with `jspdf`
- Icons from `@lucide/svelte`

## Getting Started

Install dependencies:

```sh
npm install
```

Run the development server:

```sh
npm run dev
```

To seed demo data in an empty local browser for development testing, run with:

```sh
VITE_ENABLE_DEMO_DATA=true npm run dev
```

Open:

```text
http://localhost:5173/
```

## Checks

Run the unit, integration, and PDF tests:

```sh
npm run test
```

Run Svelte and TypeScript checks:

```sh
npm run check
```

Build the static app:

```sh
npm run build
```

Preview the production build:

```sh
npm run preview
```

## Cloudflare Pages Deployment

Build command:

```sh
npm run build
```

Output directory:

```text
build
```

Node.js version:

```text
22
```

Deployment steps:

- Push to GitHub
- Create a Cloudflare Pages project
- Connect the repository
- Use build command `npm run build`
- Use output directory `build`
- Deploy

## Architecture

- **`src/routes/[...view]/+page.svelte`** — the single-page application shell,
  routing (path ↔ view), and all view rendering.
- **`src/lib/types.ts`** — the `Workspace` domain model.
- **`src/lib/workspace.ts`** — workspace construction, normalization/migration,
  persistence, invoice numbering, statuses, snapshots, and derived billing
  periods. This is the domain layer.
- **`src/lib/money.ts`** — decimal-safe money and the single `invoiceTotals`
  engine used by the UI, the PDF, and the dashboard so figures never drift.
- **`src/lib/pdf.ts`** — `jspdf` document builders for invoices and timesheets.
- **`src/lib/InvoicePreview.svelte`** — the in-app live invoice preview.
- **`src/lib/theme.ts`** — light/dark/system theme preference (persisted to
  `localStorage`, applied via a `data-theme` attribute on the root element).
- **`src/lib/demoWorkspace.ts`** — the sample/demo dataset.

### Data Model

The workspace is versioned (`version: 4`) and migrated forward on load; older
files are normalized and missing fields are backfilled with defaults.

- **`profile`** — business/supplier details, bank details, default payment terms.
- **`settings`** — `currency`, `invoiceTemplate`, `companyLogo`, `invoicePrefix`,
  `nextInvoiceNumber` (persistent counter), `defaultTaxRate`.
- **`clients[]`** — contact and billing details plus per-client defaults
  (`defaultHourlyRate`, `defaultCurrency`, `defaultPaymentTermsDays`,
  `defaultTaxRate`, `defaultInvoiceTemplate`, `defaultServiceDescription`),
  `notes`, and an `archived` flag.
- **`timesheets[]`** — `title`, `clientId`, `month`/`year`, `hourlyRate`,
  `currency`, and `entries[]` (date, hours or start/end/break, billable,
  description).
- **`invoices[]`** — `invoiceNumber`, `clientId`, `issueDate`/`dueDate`,
  `status`, `currency`, `items[]`, `discountPercent`, `taxRate`, `poReference`,
  `notes`, `amountPaid`, `sentDate`/`paidDate`, `timesheetId` (link to the
  source timesheet), and a `snapshot` of supplier/client details captured when
  the invoice is issued.
- **`billingPeriods[]`** — a derived per-client-month index linking timesheets
  to their invoices (rebuilt on load; not authored directly).
- **`activity[]`** — an append-only activity log.

Invoice styling inherits **business default → client preference → per-invoice
override**. Monetary values inherit **business default tax rate → client default
tax rate → per-invoice tax rate**.

## Privacy

All data stays in the browser unless the user exports a workspace file. There is no backend, account system, authentication, analytics, cloud sync, or external SaaS storage.
