<script lang="ts">
  import { onMount } from 'svelte';
  import {
    BriefcaseBusiness,
    CalendarDays,
    Copy,
    Download,
    FileInput,
    FileText,
    LayoutDashboard,
    Plus,
    ReceiptText,
    Settings,
    Trash2,
    Upload
  } from '@lucide/svelte';
  import type { Client, Invoice, Timesheet } from '$lib/types';
  import { generateInvoicePdf, generateTimesheetPdf } from '$lib/pdf';
  import {
    billableMinutes,
    clearWorkspace,
    clientName,
    downloadJson,
    duplicateInvoice,
    duplicateTimesheet,
    emptyClient,
    emptyInvoice,
    emptyInvoiceItem,
    emptyTimesheet,
    emptyTimesheetEntry,
    entryMinutes,
    formatHours,
    formatMoney,
    invoiceFromTimesheet,
    invoiceTotal,
    loadWorkspace,
    monthName,
    nextInvoiceNumber,
    normalizeWorkspace,
    sampleWorkspace,
    saveWorkspace,
    timesheetTotal
  } from '$lib/workspace';
  import type { Workspace } from '$lib/types';

  type View = 'dashboard' | 'timesheets' | 'invoices' | 'clients' | 'settings';
  type Mode = 'list' | 'edit';

  let workspace: Workspace = sampleWorkspace();
  let activeView: View = 'dashboard';
  let timesheetMode: Mode = 'list';
  let invoiceMode: Mode = 'list';
  let selectedClientId = '';
  let selectedTimesheetId = '';
  let selectedInvoiceId = '';
  let lastSaved = '';
  let ready = false;
  let message = '';
  let fileInput: HTMLInputElement;

  $: selectedClient = workspace.clients.find((client) => client.id === selectedClientId);
  $: selectedTimesheet = workspace.timesheets.find((timesheet) => timesheet.id === selectedTimesheetId);
  $: selectedInvoice = workspace.invoices.find((invoice) => invoice.id === selectedInvoiceId);
  $: totalOutstanding = workspace.invoices
    .filter((invoice) => invoice.status !== 'paid' && invoice.status !== 'void')
    .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);

  const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'timesheets', label: 'Timesheets', icon: CalendarDays },
    { id: 'invoices', label: 'Invoices', icon: ReceiptText },
    { id: 'clients', label: 'Clients', icon: BriefcaseBusiness },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const viewPaths: Record<View, string> = {
    dashboard: '/',
    timesheets: '/timesheets',
    invoices: '/invoices',
    clients: '/clients',
    settings: '/settings'
  };

  function viewFromPath(pathname: string): View {
    const found = Object.entries(viewPaths).find(([, path]) => path === pathname);
    return (found?.[0] as View | undefined) ?? 'dashboard';
  }

  onMount(() => {
    const loaded = loadWorkspace();
    workspace = loaded.workspace;
    lastSaved = loaded.savedAt;
    selectedClientId = workspace.clients[0]?.id ?? '';
    selectedTimesheetId = workspace.timesheets[0]?.id ?? '';
    selectedInvoiceId = workspace.invoices[0]?.id ?? '';
    activeView = viewFromPath(window.location.pathname);
    ready = true;
    const onPopState = () => {
      activeView = viewFromPath(window.location.pathname);
      message = '';
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  });

  function touch(note = 'Saved locally') {
    if (!ready) return;
    lastSaved = saveWorkspace(workspace);
    message = note;
  }

  function replaceWorkspace(next: Workspace, note = 'Saved locally') {
    workspace = next;
    touch(note);
  }

  function switchView(view: View, push = true) {
    activeView = view;
    message = '';
    const path = viewPaths[view];
    if (push && window.location.pathname !== path) {
      history.pushState({}, '', path);
    }
  }

  function addClient() {
    const client = emptyClient();
    replaceWorkspace({ ...workspace, clients: [client, ...workspace.clients] }, 'Client created');
    selectedClientId = client.id;
  }

  function deleteClient(client: Client) {
    if (!confirm(`Delete ${client.name || 'this client'}? Timesheets and invoices will keep their client id.`)) return;
    replaceWorkspace({ ...workspace, clients: workspace.clients.filter((item) => item.id !== client.id) }, 'Client deleted');
    selectedClientId = workspace.clients.find((item) => item.id !== client.id)?.id ?? '';
  }

  function addTimesheet() {
    const timesheet = emptyTimesheet(workspace.clients[0]?.id ?? '', workspace.settings.currency);
    replaceWorkspace({ ...workspace, timesheets: [timesheet, ...workspace.timesheets] }, 'Timesheet created');
    selectedTimesheetId = timesheet.id;
    timesheetMode = 'edit';
    switchView('timesheets');
  }

  function saveTimesheetEdit() {
    touch('Timesheet saved');
    timesheetMode = 'list';
  }

  function deleteTimesheet(timesheet: Timesheet) {
    if (!confirm(`Delete ${timesheet.title || 'this timesheet'}?`)) return;
    replaceWorkspace({ ...workspace, timesheets: workspace.timesheets.filter((item) => item.id !== timesheet.id) }, 'Timesheet deleted');
    selectedTimesheetId = workspace.timesheets.find((item) => item.id !== timesheet.id)?.id ?? '';
    timesheetMode = 'list';
  }

  function copyTimesheet(timesheet: Timesheet) {
    const copy = duplicateTimesheet(timesheet);
    replaceWorkspace({ ...workspace, timesheets: [copy, ...workspace.timesheets] }, 'Timesheet duplicated');
    selectedTimesheetId = copy.id;
  }

  function createInvoiceFrom(ts: Timesheet) {
    const invoice = invoiceFromTimesheet(
      ts,
      nextInvoiceNumber(workspace.invoices),
      Number(workspace.profile.paymentTermsDays || 14),
      workspace.settings.invoiceTemplate
    );
    replaceWorkspace({ ...workspace, invoices: [invoice, ...workspace.invoices] }, 'Invoice created from timesheet');
    selectedInvoiceId = invoice.id;
    switchView('invoices');
    invoiceMode = 'edit';
  }

  function addInvoice() {
    const invoice = emptyInvoice(workspace.clients[0]?.id ?? '', workspace.settings.currency, workspace.settings.invoiceTemplate);
    invoice.invoiceNumber = nextInvoiceNumber(workspace.invoices);
    replaceWorkspace({ ...workspace, invoices: [invoice, ...workspace.invoices] }, 'Invoice created');
    selectedInvoiceId = invoice.id;
    invoiceMode = 'edit';
    switchView('invoices');
  }

  function saveInvoiceEdit() {
    touch('Invoice saved');
    invoiceMode = 'list';
  }

  function deleteInvoice(invoice: Invoice) {
    if (!confirm(`Delete invoice ${invoice.invoiceNumber || ''}?`)) return;
    replaceWorkspace({ ...workspace, invoices: workspace.invoices.filter((item) => item.id !== invoice.id) }, 'Invoice deleted');
    selectedInvoiceId = workspace.invoices.find((item) => item.id !== invoice.id)?.id ?? '';
    invoiceMode = 'list';
  }

  function copyInvoice(invoice: Invoice) {
    const copy = duplicateInvoice(invoice);
    replaceWorkspace({ ...workspace, invoices: [copy, ...workspace.invoices] }, 'Invoice duplicated');
    selectedInvoiceId = copy.id;
  }

  async function importWorkspace(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = normalizeWorkspace(JSON.parse(text));
      workspace = imported;
      selectedClientId = workspace.clients[0]?.id ?? '';
      selectedTimesheetId = workspace.timesheets[0]?.id ?? '';
      selectedInvoiceId = workspace.invoices[0]?.id ?? '';
      touch('Workspace imported');
    } catch (error) {
      message = error instanceof Error ? error.message : 'Could not import workspace.';
    } finally {
      input.value = '';
    }
  }

  function clearLocal() {
    if (!confirm('Clear local browser data and reload the sample workspace? Export first if you need this data.')) return;
    clearWorkspace();
    workspace = sampleWorkspace();
    selectedClientId = workspace.clients[0]?.id ?? '';
    selectedTimesheetId = workspace.timesheets[0]?.id ?? '';
    selectedInvoiceId = workspace.invoices[0]?.id ?? '';
    lastSaved = '';
    message = 'Local data cleared. Sample data is loaded but not saved.';
  }

  function savedLabel() {
    if (!lastSaved) return 'Not saved yet';
    return new Date(lastSaved).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }
</script>

<svelte:head>
  <title>Axora</title>
  <meta
    name="description"
    content="Axora is a local-first workspace for contractor timesheets, invoices, clients, and portable workspace files."
  />
</svelte:head>

<div class="app-shell">
  <aside class="sidebar">
    <div class="brand">
      <FileText size={26} />
      <div>
        <strong>Axora</strong>
        <span>Local workspace</span>
      </div>
    </div>
    <nav>
      {#each navItems as item}
        <button class:active={activeView === item.id} onclick={() => switchView(item.id)} title={item.label}>
          <svelte:component this={item.icon} size={18} />
          <span>{item.label}</span>
        </button>
      {/each}
    </nav>
  </aside>

  <main>
    <header class="topbar">
      <div>
        <h1>{navItems.find((item) => item.id === activeView)?.label}</h1>
        <p>Last saved: {savedLabel()}</p>
      </div>
      <div class="top-actions">
        <input bind:this={fileInput} class="file-input" type="file" accept="application/json,.json" onchange={importWorkspace} />
        <button class="secondary" onclick={() => fileInput.click()} title="Import Workspace">
          <Upload size={17} />
          <span>Import Workspace</span>
        </button>
        <button class="secondary" onclick={() => downloadJson(workspace)} title="Export Workspace">
          <Download size={17} />
          <span>Export Workspace</span>
        </button>
        <button class="danger" onclick={clearLocal} title="Clear Local Data">
          <Trash2 size={17} />
          <span>Clear Local Data</span>
        </button>
      </div>
    </header>

    {#if message}
      <div class="notice">{message}</div>
    {/if}

    {#if activeView === 'dashboard'}
      <section class="dashboard-grid">
        <div class="metric">
          <span>Clients</span>
          <strong>{workspace.clients.length}</strong>
        </div>
        <div class="metric">
          <span>Timesheets</span>
          <strong>{workspace.timesheets.length}</strong>
        </div>
        <div class="metric">
          <span>Invoices</span>
          <strong>{workspace.invoices.length}</strong>
        </div>
        <div class="metric">
          <span>Outstanding</span>
          <strong>{formatMoney(totalOutstanding, workspace.settings.currency)}</strong>
        </div>
      </section>
      <section class="split">
        <div>
          <div class="section-title">
            <h2>Recent timesheets</h2>
            <button onclick={addTimesheet}><Plus size={16} /> New</button>
          </div>
          <div class="list">
            {#each workspace.timesheets.slice(0, 4) as timesheet}
              <button class="row" onclick={() => { selectedTimesheetId = timesheet.id; switchView('timesheets'); timesheetMode = 'edit'; }}>
                <span>
                  <strong>{timesheet.title}</strong>
                  <small>{clientName(workspace.clients, timesheet.clientId)} · {formatHours(billableMinutes(timesheet))}</small>
                </span>
                <b>{formatMoney(timesheetTotal(timesheet), timesheet.currency)}</b>
              </button>
            {/each}
          </div>
        </div>
        <div>
          <div class="section-title">
            <h2>Recent invoices</h2>
            <button onclick={addInvoice}><Plus size={16} /> New</button>
          </div>
          <div class="list">
            {#each workspace.invoices.slice(0, 4) as invoice}
              <button class="row" onclick={() => { selectedInvoiceId = invoice.id; switchView('invoices'); invoiceMode = 'edit'; }}>
                <span>
                  <strong>{invoice.invoiceNumber}</strong>
                  <small>{clientName(workspace.clients, invoice.clientId)} · {invoice.status}</small>
                </span>
                <b>{formatMoney(invoiceTotal(invoice), invoice.currency)}</b>
              </button>
            {/each}
          </div>
        </div>
      </section>
    {:else if activeView === 'clients'}
      <section class="work-area">
        <div class="list-panel">
          <div class="section-title">
            <h2>Clients</h2>
            <button onclick={addClient}><Plus size={16} /> New</button>
          </div>
          <div class="list">
            {#each workspace.clients as client}
              <button class="row" class:active={selectedClientId === client.id} onclick={() => (selectedClientId = client.id)}>
                <span>
                  <strong>{client.name || 'Untitled client'}</strong>
                  <small>{client.email || client.contactName || 'No contact details'}</small>
                </span>
              </button>
            {/each}
          </div>
        </div>
        <div class="editor">
          {#if selectedClient}
            <div class="editor-head">
              <h2>{selectedClient.name || 'New client'}</h2>
              <button class="danger" onclick={() => deleteClient(selectedClient)}><Trash2 size={16} /> Delete</button>
            </div>
            <div class="form-grid" oninput={() => touch()}>
              <label>Name <input bind:value={selectedClient.name} /></label>
              <label>Contact name <input bind:value={selectedClient.contactName} /></label>
              <label>Email <input type="email" bind:value={selectedClient.email} /></label>
              <label>Phone <input bind:value={selectedClient.phone} /></label>
              <label>Company number <input bind:value={selectedClient.companyNumber} /></label>
              <label>VAT number <input bind:value={selectedClient.vatNumber} /></label>
              <label class="wide">Address <textarea rows="5" bind:value={selectedClient.address}></textarea></label>
            </div>
          {:else}
            <div class="empty-state">Create a client to start assigning timesheets and invoices.</div>
          {/if}
        </div>
      </section>
    {:else if activeView === 'timesheets'}
      {#if timesheetMode === 'list'}
        <section>
          <div class="section-title">
            <h2>Timesheets</h2>
            <button onclick={addTimesheet}><Plus size={16} /> New Timesheet</button>
          </div>
          <div class="table">
            <div class="table-head"><span>Title</span><span>Month</span><span>Client</span><span>Total</span><span></span></div>
            {#each workspace.timesheets as timesheet}
              <div class="table-row">
                <span><strong>{timesheet.title}</strong></span>
                <span>{monthName(timesheet.month)} {timesheet.year}</span>
                <span>{clientName(workspace.clients, timesheet.clientId)}</span>
                <span>{formatMoney(timesheetTotal(timesheet), timesheet.currency)}</span>
                <span class="row-actions">
                  <button class="icon" onclick={() => { selectedTimesheetId = timesheet.id; timesheetMode = 'edit'; }} title="Edit timesheet"><FileInput size={16} /></button>
                  <button class="icon" onclick={() => copyTimesheet(timesheet)} title="Duplicate timesheet"><Copy size={16} /></button>
                  <button class="icon" onclick={() => generateTimesheetPdf(workspace, timesheet)} title="Generate PDF"><Download size={16} /></button>
                  <button class="icon" onclick={() => createInvoiceFrom(timesheet)} title="Create invoice"><ReceiptText size={16} /></button>
                  <button class="icon danger-icon" onclick={() => deleteTimesheet(timesheet)} title="Delete timesheet"><Trash2 size={16} /></button>
                </span>
              </div>
            {/each}
          </div>
        </section>
      {:else if selectedTimesheet}
        <section class="editor full">
          <div class="editor-head">
            <h2>Edit timesheet</h2>
            <div class="actions">
              <button class="secondary" onclick={() => generateTimesheetPdf(workspace, selectedTimesheet)}><Download size={16} /> PDF</button>
              <button class="secondary" onclick={() => createInvoiceFrom(selectedTimesheet)}><ReceiptText size={16} /> Invoice</button>
              <button onclick={saveTimesheetEdit}>Done</button>
            </div>
          </div>
          <div class="form-grid" oninput={() => touch()}>
            <label class="wide">Title <input bind:value={selectedTimesheet.title} /></label>
            <label>Client
              <select bind:value={selectedTimesheet.clientId}>
                <option value="">No client</option>
                {#each workspace.clients as client}
                  <option value={client.id}>{client.name}</option>
                {/each}
              </select>
            </label>
            <label>Month <input type="number" min="1" max="12" bind:value={selectedTimesheet.month} /></label>
            <label>Year <input type="number" min="2000" max="2100" bind:value={selectedTimesheet.year} /></label>
            <label>Hourly rate <input type="number" min="0" step="0.01" bind:value={selectedTimesheet.hourlyRate} /></label>
            <label>Currency <input bind:value={selectedTimesheet.currency} /></label>
          </div>
          <div class="summary-strip">
            <span>Billable {formatHours(billableMinutes(selectedTimesheet))}</span>
            <strong>{formatMoney(timesheetTotal(selectedTimesheet), selectedTimesheet.currency)}</strong>
          </div>
          <div class="entry-list" oninput={() => touch()}>
            <div class="entry-head">
              <h3>Entries</h3>
              <button onclick={() => { selectedTimesheet.entries = [...selectedTimesheet.entries, emptyTimesheetEntry()]; touch('Entry added'); }}><Plus size={16} /> Add Entry</button>
            </div>
            {#each selectedTimesheet.entries as entry}
              <div class="entry-grid">
                <label>Date <input type="date" bind:value={entry.date} /></label>
                <label>Start <input type="time" bind:value={entry.startTime} /></label>
                <label>End <input type="time" bind:value={entry.endTime} /></label>
                <label>Break <input type="number" min="0" step="5" bind:value={entry.breakMinutes} /></label>
                <label class="check"><input type="checkbox" bind:checked={entry.billable} onchange={() => touch()} /> Billable</label>
                <label class="description">Description <input bind:value={entry.description} /></label>
                <span class="duration">{formatHours(entryMinutes(entry))}</span>
                <button class="icon danger-icon" onclick={() => { selectedTimesheet.entries = selectedTimesheet.entries.filter((item) => item.id !== entry.id); touch('Entry removed'); }} title="Remove entry"><Trash2 size={16} /></button>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    {:else if activeView === 'invoices'}
      {#if invoiceMode === 'list'}
        <section>
          <div class="section-title">
            <h2>Invoices</h2>
            <button onclick={addInvoice}><Plus size={16} /> New Invoice</button>
          </div>
          <div class="table">
            <div class="table-head"><span>Invoice</span><span>Client</span><span>Due</span><span>Status</span><span>Total</span><span></span></div>
            {#each workspace.invoices as invoice}
              <div class="table-row six">
                <span><strong>{invoice.invoiceNumber}</strong></span>
                <span>{clientName(workspace.clients, invoice.clientId)}</span>
                <span>{invoice.dueDate}</span>
                <span><i class="status">{invoice.status}</i></span>
                <span>{formatMoney(invoiceTotal(invoice), invoice.currency)}</span>
                <span class="row-actions">
                  <button class="icon" onclick={() => { selectedInvoiceId = invoice.id; invoiceMode = 'edit'; }} title="Edit invoice"><FileInput size={16} /></button>
                  <button class="icon" onclick={() => copyInvoice(invoice)} title="Duplicate invoice"><Copy size={16} /></button>
                  <button class="icon" onclick={() => generateInvoicePdf(workspace, invoice)} title="Generate PDF"><Download size={16} /></button>
                  <button class="icon danger-icon" onclick={() => deleteInvoice(invoice)} title="Delete invoice"><Trash2 size={16} /></button>
                </span>
              </div>
            {/each}
          </div>
        </section>
      {:else if selectedInvoice}
        <section class="editor full">
          <div class="editor-head">
            <h2>Edit invoice</h2>
            <div class="actions">
              <button class="secondary" onclick={() => generateInvoicePdf(workspace, selectedInvoice)}><Download size={16} /> PDF</button>
              <button onclick={saveInvoiceEdit}>Done</button>
            </div>
          </div>
          <div class="form-grid" oninput={() => touch()}>
            <label>Invoice number <input bind:value={selectedInvoice.invoiceNumber} /></label>
            <label>Client
              <select bind:value={selectedInvoice.clientId}>
                <option value="">No client</option>
                {#each workspace.clients as client}
                  <option value={client.id}>{client.name}</option>
                {/each}
              </select>
            </label>
            <label>Issue date <input type="date" bind:value={selectedInvoice.issueDate} /></label>
            <label>Due date <input type="date" bind:value={selectedInvoice.dueDate} /></label>
            <label>Status
              <select bind:value={selectedInvoice.status}>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="overdue">Overdue</option>
                <option value="void">Void</option>
              </select>
            </label>
            <label>Currency <input bind:value={selectedInvoice.currency} /></label>
            <label>Template
              <select bind:value={selectedInvoice.template}>
                <option value="classic">Classic</option>
                <option value="modern">Modern</option>
                <option value="compact">Compact</option>
              </select>
            </label>
          </div>
          <div class="summary-strip">
            <span>Subtotal</span>
            <strong>{formatMoney(invoiceTotal(selectedInvoice), selectedInvoice.currency)}</strong>
          </div>
          <div class="entry-list" oninput={() => touch()}>
            <div class="entry-head">
              <h3>Items</h3>
              <button onclick={() => { selectedInvoice.items = [...selectedInvoice.items, emptyInvoiceItem()]; touch('Item added'); }}><Plus size={16} /> Add Item</button>
            </div>
            {#each selectedInvoice.items as item}
              <div class="item-grid">
                <label>Description <input bind:value={item.description} /></label>
                <label>Quantity <input type="number" min="0" step="0.01" bind:value={item.quantity} /></label>
                <label>Unit price <input type="number" min="0" step="0.01" bind:value={item.unitPrice} /></label>
                <span class="duration">{formatMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0), selectedInvoice.currency)}</span>
                <button class="icon danger-icon" onclick={() => { selectedInvoice.items = selectedInvoice.items.filter((row) => row.id !== item.id); touch('Item removed'); }} title="Remove item"><Trash2 size={16} /></button>
              </div>
            {/each}
            <label class="wide notes">Notes <textarea rows="4" bind:value={selectedInvoice.notes}></textarea></label>
          </div>
        </section>
      {/if}
    {:else if activeView === 'settings'}
      <section class="editor full">
        <div class="editor-head">
          <h2>Profile and defaults</h2>
        </div>
        <div class="form-grid" oninput={() => touch()}>
          <label>Company name <input bind:value={workspace.profile.companyName} /></label>
          <label>Contact name <input bind:value={workspace.profile.contactName} /></label>
          <label>Email <input type="email" bind:value={workspace.profile.email} /></label>
          <label>Phone <input bind:value={workspace.profile.phone} /></label>
          <label>Company number <input bind:value={workspace.profile.companyNumber} /></label>
          <label>VAT number <input bind:value={workspace.profile.vatNumber} /></label>
          <label class="wide">Address <textarea rows="4" bind:value={workspace.profile.address}></textarea></label>
          <label>Bank name <input bind:value={workspace.profile.bankName} /></label>
          <label>Account name <input bind:value={workspace.profile.accountName} /></label>
          <label>Sort code <input bind:value={workspace.profile.sortCode} /></label>
          <label>Account number <input bind:value={workspace.profile.accountNumber} /></label>
          <label>IBAN <input bind:value={workspace.profile.iban} /></label>
          <label>Payment terms days <input type="number" min="0" bind:value={workspace.profile.paymentTermsDays} /></label>
          <label>Default currency <input bind:value={workspace.settings.currency} /></label>
          <label>Default invoice template
            <select bind:value={workspace.settings.invoiceTemplate}>
              <option value="classic">Classic</option>
              <option value="modern">Modern</option>
              <option value="compact">Compact</option>
            </select>
          </label>
        </div>
      </section>
    {/if}
  </main>
</div>
