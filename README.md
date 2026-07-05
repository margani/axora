# Axora

A local-first SvelteKit SPA for freelancers and contractors to manage clients, timesheets, and invoices without accounts, cookies, backend services, cloud storage, or a database.

The app stores data in the browser with `localStorage` and lets the user import/export one portable versioned `workspace.json` file.

## Features

- Dashboard with clients, timesheets, invoices, and outstanding invoice total
- Workspace import/export as `workspace.json`
- Autosave to `localStorage` with last saved time
- Clear local browser data
- Client create, edit, and delete
- Timesheet create, edit, delete, duplicate, totals, and PDF export
- Invoice create, edit, delete, duplicate, create from timesheet, totals, and PDF export
- Three invoice PDF templates: Classic, Modern, and Compact
- Profile, payment, currency, and invoice template settings
- Sample data on first load for immediate testing

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

Open:

```text
http://localhost:5173/
```

## Checks

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

## Data Model

The workspace is intentionally simple and versioned:

```json
{
  "version": 1,
  "profile": {
    "companyName": "",
    "contactName": "",
    "address": "",
    "email": "",
    "phone": "",
    "companyNumber": "",
    "vatNumber": "",
    "bankName": "",
    "accountName": "",
    "sortCode": "",
    "accountNumber": "",
    "iban": "",
    "paymentTermsDays": 14
  },
  "clients": [],
  "timesheets": [],
  "invoices": [],
  "settings": {
    "currency": "GBP",
    "invoiceTemplate": "classic"
  }
}
```

## Privacy

All data stays in the browser unless the user exports a workspace file. There is no backend, account system, authentication, analytics, cloud sync, or external SaaS storage..
