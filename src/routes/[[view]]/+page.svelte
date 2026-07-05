<script lang="ts">
  import { onMount } from 'svelte';
  import {
    BriefcaseBusiness,
    CalendarDays,
    Copy,
    Download,
    FileInput,
    FileCheck,
    FileText,
    LayoutDashboard,
    Plus,
    ReceiptText,
    RotateCcw,
    Search,
    Settings,
    Archive,
    Trash2,
    Upload
  } from '@lucide/svelte';
  import type { Client, Invoice, Timesheet } from '$lib/types';
  import { generateInvoicePdf, generateTimesheetPdf } from '$lib/pdf';
  import {
    billableMinutes,
    clientDefaults,
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
  let saveStatus: 'saved' | 'saving' | 'unsaved' = 'saved';
  let ready = false;
  let message = '';
  let searchQuery = '';
  let showArchivedTimesheets = false;
  let showArchivedInvoices = false;
  let clearConfirmText = '';
  let wizardOpen = false;
  let wizardStep = 1;
  let wizardTimesheetId = '';
  let saveTimer: ReturnType<typeof setTimeout>;
  let fileInput: HTMLInputElement;
  let logoInput: HTMLInputElement;

  $: selectedClient = workspace.clients.find((client) => client.id === selectedClientId);
  $: selectedTimesheet = workspace.timesheets.find((timesheet) => timesheet.id === selectedTimesheetId);
  $: selectedInvoice = workspace.invoices.find((invoice) => invoice.id === selectedInvoiceId);
  $: activeInvoices = workspace.invoices.filter((invoice) => showArchivedInvoices || !invoice.archived);
  $: activeTimesheets = workspace.timesheets.filter((timesheet) => showArchivedTimesheets || !timesheet.archived);
  $: totalOutstanding = workspace.invoices
    .filter((invoice) => !invoice.archived && invoice.status !== 'paid' && invoice.status !== 'void')
    .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  $: paidThisYear = invoicesInYear(new Date().getFullYear(), 'paid').reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  $: revenueThisMonth = paidInvoicesInMonth(new Date().getMonth() + 1, new Date().getFullYear()).reduce(
    (sum, invoice) => sum + invoiceTotal(invoice),
    0
  );
  $: revenueThisYear = invoicesInYear(new Date().getFullYear(), 'paid').reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  $: hoursThisMonth = timesheetsInMonth(new Date().getMonth() + 1, new Date().getFullYear()).reduce(
    (sum, timesheet) => sum + billableMinutes(timesheet),
    0
  );
  $: hoursThisYear = workspace.timesheets
    .filter((timesheet) => !timesheet.archived && timesheet.year === new Date().getFullYear())
    .reduce((sum, timesheet) => sum + billableMinutes(timesheet), 0);
  $: recentInvoices = workspace.invoices.filter((invoice) => !invoice.archived).slice(0, 4);
  $: recentTimesheets = workspace.timesheets.filter((timesheet) => !timesheet.archived).slice(0, 4);
  $: upcomingUnpaidInvoices = workspace.invoices
    .filter((invoice) => !invoice.archived && invoice.status !== 'paid' && invoice.status !== 'void')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
    .slice(0, 5);
  $: searchResults = buildSearchResults(searchQuery);
  $: wizardTimesheet = workspace.timesheets.find((timesheet) => timesheet.id === wizardTimesheetId);
  $: wizardInvoice = wizardTimesheet
    ? invoiceFromTimesheet(
        wizardTimesheet,
        nextInvoiceNumber(workspace.invoices),
        clientDefaults(workspace.clients.find((client) => client.id === wizardTimesheet.clientId), workspace).paymentTermsDays,
        clientDefaults(workspace.clients.find((client) => client.id === wizardTimesheet.clientId), workspace).invoiceTemplate
      )
    : undefined;

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
    saveStatus = 'unsaved';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveStatus = 'saving';
      lastSaved = saveWorkspace(workspace);
      saveStatus = 'saved';
      message = note;
    }, 250);
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
    const client = workspace.clients[0];
    const defaults = clientDefaults(client, workspace);
    const timesheet = emptyTimesheet(client?.id ?? '', defaults.currency, defaults.hourlyRate);
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
    timesheetMode = 'edit';
  }

  function createInvoiceFrom(ts: Timesheet) {
    const defaults = clientDefaults(workspace.clients.find((client) => client.id === ts.clientId), workspace);
    const invoice = invoiceFromTimesheet(
      ts,
      nextInvoiceNumber(workspace.invoices),
      defaults.paymentTermsDays,
      defaults.invoiceTemplate
    );
    replaceWorkspace({ ...workspace, invoices: [invoice, ...workspace.invoices] }, 'Invoice created from timesheet');
    selectedInvoiceId = invoice.id;
    switchView('invoices');
    invoiceMode = 'edit';
  }

  function addInvoice() {
    const client = workspace.clients[0];
    const defaults = clientDefaults(client, workspace);
    const invoice = emptyInvoice(client?.id ?? '', defaults.currency, defaults.invoiceTemplate);
    invoice.invoiceNumber = nextInvoiceNumber(workspace.invoices);
    invoice.dueDate = new Date(new Date(`${invoice.issueDate}T12:00:00`).getTime() + defaults.paymentTermsDays * 86400000)
      .toISOString()
      .slice(0, 10);
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
    const defaults = clientDefaults(workspace.clients.find((client) => client.id === invoice.clientId), workspace);
    const copy = duplicateInvoice(invoice, workspace.invoices, defaults.paymentTermsDays);
    replaceWorkspace({ ...workspace, invoices: [copy, ...workspace.invoices] }, 'Invoice duplicated');
    selectedInvoiceId = copy.id;
    invoiceMode = 'edit';
  }

  function archiveTimesheet(timesheet: Timesheet, archived = true) {
    timesheet.archived = archived;
    touch(archived ? 'Timesheet archived' : 'Timesheet restored');
  }

  function archiveInvoice(invoice: Invoice, archived = true) {
    invoice.archived = archived;
    touch(archived ? 'Invoice archived' : 'Invoice restored');
  }

  function generateTimesheet(timesheet: Timesheet) {
    generateTimesheetPdf(workspace, timesheet);
    timesheet.lastPdfGeneratedAt = new Date().toISOString();
    touch('Timesheet PDF generated');
  }

  function generateInvoice(invoice: Invoice) {
    generateInvoicePdf(workspace, invoice);
    invoice.lastPdfGeneratedAt = new Date().toISOString();
    touch('Invoice PDF generated');
  }

  function openInvoiceWizard(timesheet?: Timesheet) {
    wizardOpen = true;
    wizardStep = 1;
    wizardTimesheetId = timesheet?.id ?? workspace.timesheets.find((item) => !item.archived)?.id ?? '';
    message = '';
  }

  function createWizardInvoice() {
    if (!wizardInvoice) return;
    replaceWorkspace({ ...workspace, invoices: [wizardInvoice, ...workspace.invoices] }, 'Invoice created from timesheet');
    selectedInvoiceId = wizardInvoice.id;
    wizardOpen = false;
    wizardStep = 1;
    switchView('invoices');
    invoiceMode = 'edit';
  }

  function updateTimesheetClient(timesheet: Timesheet) {
    const defaults = clientDefaults(workspace.clients.find((client) => client.id === timesheet.clientId), workspace);
    timesheet.hourlyRate = defaults.hourlyRate;
    timesheet.currency = defaults.currency;
    touch('Client defaults applied');
  }

  function updateInvoiceClient(invoice: Invoice) {
    const defaults = clientDefaults(workspace.clients.find((client) => client.id === invoice.clientId), workspace);
    invoice.currency = defaults.currency;
    invoice.template = defaults.invoiceTemplate;
    invoice.dueDate = new Date(new Date(`${invoice.issueDate}T12:00:00`).getTime() + defaults.paymentTermsDays * 86400000)
      .toISOString()
      .slice(0, 10);
    touch('Client defaults applied');
  }

  async function uploadLogo(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    workspace.settings.companyLogo = await fileToDataUrl(file);
    input.value = '';
    touch('Company logo saved');
  }

  function fileToDataUrl(file: File) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
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
    if (clearConfirmText !== 'DELETE') {
      message = 'Type DELETE before clearing local data.';
      return;
    }
    clearWorkspace();
    workspace = sampleWorkspace();
    selectedClientId = workspace.clients[0]?.id ?? '';
    selectedTimesheetId = workspace.timesheets[0]?.id ?? '';
    selectedInvoiceId = workspace.invoices[0]?.id ?? '';
    lastSaved = '';
    clearConfirmText = '';
    message = 'Local data cleared. Sample data is loaded but not saved.';
  }

  function savedLabel() {
    if (!lastSaved) return 'Not saved yet';
    return new Date(lastSaved).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function pdfLabel(value: string) {
    if (!value) return 'Never';
    return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function saveStatusLabel() {
    if (saveStatus === 'saving') return 'Saving...';
    if (saveStatus === 'unsaved') return 'Unsaved changes';
    return 'Saved';
  }

  function invoicesInYear(year: number, status?: string) {
    return workspace.invoices.filter(
      (invoice) => !invoice.archived && invoice.issueDate.startsWith(String(year)) && (!status || invoice.status === status)
    );
  }

  function paidInvoicesInMonth(month: number, year: number) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return workspace.invoices.filter((invoice) => !invoice.archived && invoice.status === 'paid' && invoice.issueDate.startsWith(prefix));
  }

  function timesheetsInMonth(month: number, year: number) {
    return workspace.timesheets.filter((timesheet) => !timesheet.archived && timesheet.month === month && timesheet.year === year);
  }

  function buildSearchResults(query: string) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const clientResults = workspace.clients
      .filter((client) => client.name.toLowerCase().includes(needle))
      .map((item) => ({ type: 'Client', label: item.name || 'Untitled client', detail: item.email, id: item.id }));
    const invoiceResults = workspace.invoices
      .filter((invoice) => invoice.invoiceNumber.toLowerCase().includes(needle) || clientName(workspace.clients, invoice.clientId).toLowerCase().includes(needle))
      .map((item) => ({ type: 'Invoice', label: item.invoiceNumber, detail: clientName(workspace.clients, item.clientId), id: item.id }));
    const timesheetResults = workspace.timesheets
      .filter((timesheet) => timesheet.title.toLowerCase().includes(needle) || clientName(workspace.clients, timesheet.clientId).toLowerCase().includes(needle))
      .map((item) => ({ type: 'Timesheet', label: item.title, detail: clientName(workspace.clients, item.clientId), id: item.id }));
    return [...clientResults, ...invoiceResults, ...timesheetResults].slice(0, 8);
  }

  function openSearchResult(result: { type: string; id: string }) {
    searchQuery = '';
    if (result.type === 'Client') {
      selectedClientId = result.id;
      switchView('clients');
    } else if (result.type === 'Invoice') {
      selectedInvoiceId = result.id;
      invoiceMode = 'edit';
      switchView('invoices');
    } else {
      selectedTimesheetId = result.id;
      timesheetMode = 'edit';
      switchView('timesheets');
    }
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
        <p>Last saved: {savedLabel()} <span class="save-status {saveStatus}">{saveStatusLabel()}</span></p>
      </div>
      <div class="top-actions">
        <div class="search-box">
          <Search size={16} />
          <input bind:value={searchQuery} placeholder="Search clients, invoices, timesheets" />
          {#if searchResults.length}
            <div class="search-results">
              {#each searchResults as result}
                <button class="search-result" onclick={() => openSearchResult(result)}>
                  <span>{result.type}</span>
                  <strong>{result.label}</strong>
                  <small>{result.detail}</small>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <input bind:this={fileInput} class="file-input" type="file" accept="application/json,.json" onchange={importWorkspace} />
        <button class="secondary" onclick={() => fileInput.click()} title="Import Workspace">
          <Upload size={17} />
          <span>Import Workspace</span>
        </button>
        <button class="secondary" onclick={() => downloadJson(workspace)} title="Export Workspace">
          <Download size={17} />
          <span>Export Workspace</span>
        </button>
        <input class="clear-input" bind:value={clearConfirmText} placeholder="Type DELETE" aria-label="Type DELETE to clear data" />
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
          <span>Outstanding invoices</span>
          <strong>{formatMoney(totalOutstanding, workspace.settings.currency)}</strong>
        </div>
        <div class="metric">
          <span>Paid this year</span>
          <strong>{formatMoney(paidThisYear, workspace.settings.currency)}</strong>
        </div>
        <div class="metric">
          <span>Revenue this month</span>
          <strong>{formatMoney(revenueThisMonth, workspace.settings.currency)}</strong>
        </div>
        <div class="metric">
          <span>Revenue this year</span>
          <strong>{formatMoney(revenueThisYear, workspace.settings.currency)}</strong>
        </div>
        <div class="metric">
          <span>Hours this month</span>
          <strong>{formatHours(hoursThisMonth)}</strong>
        </div>
        <div class="metric">
          <span>Hours this year</span>
          <strong>{formatHours(hoursThisYear)}</strong>
        </div>
      </section>
      <section class="split">
        <div>
          <div class="section-title">
            <h2>Recent timesheets</h2>
            <button onclick={addTimesheet}><Plus size={16} /> New</button>
          </div>
          <div class="list">
            {#each recentTimesheets as timesheet}
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
            {#each recentInvoices as invoice}
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
      <section class="list-panel dashboard-followup">
        <div class="section-title">
          <h2>Upcoming unpaid invoices</h2>
        </div>
        <div class="list">
          {#each upcomingUnpaidInvoices as invoice}
            <button class="row" onclick={() => { selectedInvoiceId = invoice.id; switchView('invoices'); invoiceMode = 'edit'; }}>
              <span>
                <strong>{invoice.invoiceNumber}</strong>
                <small>{clientName(workspace.clients, invoice.clientId)} · due {invoice.dueDate}</small>
              </span>
              <b>{formatMoney(invoiceTotal(invoice), invoice.currency)}</b>
            </button>
          {/each}
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
              <label>Default hourly rate <input type="number" min="0" step="0.01" bind:value={selectedClient.defaultHourlyRate} /></label>
              <label>Default currency <input bind:value={selectedClient.defaultCurrency} /></label>
              <label>Default payment terms <input type="number" min="0" bind:value={selectedClient.defaultPaymentTermsDays} /></label>
              <label>Default invoice template
                <select bind:value={selectedClient.defaultInvoiceTemplate}>
                  <option value="classic">Classic</option>
                  <option value="modern">Modern</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
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
            <div class="actions">
              <label class="inline-check"><input type="checkbox" bind:checked={showArchivedTimesheets} /> Show archived</label>
              <button onclick={addTimesheet}><Plus size={16} /> New Timesheet</button>
            </div>
          </div>
          <div class="table">
            <div class="table-head"><span>Title</span><span>Month</span><span>Client</span><span>Total</span><span></span></div>
            {#each activeTimesheets as timesheet}
              <div class="table-row">
                <span><strong>{timesheet.title}</strong>{#if timesheet.archived}<small>Archived</small>{/if}</span>
                <span>{monthName(timesheet.month)} {timesheet.year}</span>
                <span>{clientName(workspace.clients, timesheet.clientId)}</span>
                <span>{formatMoney(timesheetTotal(timesheet), timesheet.currency)}</span>
                <span class="row-actions">
                  <button class="icon" onclick={() => { selectedTimesheetId = timesheet.id; timesheetMode = 'edit'; }} title="Edit timesheet"><FileInput size={16} /></button>
                  <button class="icon" onclick={() => copyTimesheet(timesheet)} title="Duplicate timesheet"><Copy size={16} /></button>
                  <button class="icon" onclick={() => generateTimesheet(timesheet)} title="Generate PDF"><Download size={16} /></button>
                  <button class="icon" onclick={() => openInvoiceWizard(timesheet)} title="Generate invoice"><ReceiptText size={16} /></button>
                  {#if timesheet.archived}
                    <button class="icon" onclick={() => archiveTimesheet(timesheet, false)} title="Restore timesheet"><RotateCcw size={16} /></button>
                  {:else}
                    <button class="icon" onclick={() => archiveTimesheet(timesheet)} title="Archive timesheet"><Archive size={16} /></button>
                  {/if}
                  <button class="icon danger-icon" onclick={() => deleteTimesheet(timesheet)} title="Delete timesheet"><Trash2 size={16} /></button>
                </span>
              </div>
            {/each}
          </div>
        </section>
      {:else if selectedTimesheet}
        <section class="editor full">
          <div class="record-header">
            <div>
              <h2>{selectedTimesheet.title || 'Untitled timesheet'}</h2>
              <p>{clientName(workspace.clients, selectedTimesheet.clientId)} · {monthName(selectedTimesheet.month)} {selectedTimesheet.year}</p>
              <div class="record-meta">
                <span>Billable {formatHours(billableMinutes(selectedTimesheet))}</span>
                <span>Total {formatMoney(timesheetTotal(selectedTimesheet), selectedTimesheet.currency)}</span>
                <span>Last PDF generated: {pdfLabel(selectedTimesheet.lastPdfGeneratedAt)}</span>
              </div>
            </div>
            <div class="actions">
              <button class="secondary" onclick={() => generateTimesheet(selectedTimesheet)}><Download size={16} /> PDF</button>
              <button class="secondary" onclick={() => openInvoiceWizard(selectedTimesheet)}><ReceiptText size={16} /> Invoice</button>
              <button class="secondary" onclick={() => copyTimesheet(selectedTimesheet)}><Copy size={16} /> Duplicate</button>
              {#if selectedTimesheet.archived}
                <button class="secondary" onclick={() => archiveTimesheet(selectedTimesheet, false)}><RotateCcw size={16} /> Restore</button>
              {:else}
                <button class="secondary" onclick={() => archiveTimesheet(selectedTimesheet)}><Archive size={16} /> Archive</button>
              {/if}
              <button class="danger" onclick={() => deleteTimesheet(selectedTimesheet)}><Trash2 size={16} /> Delete</button>
              <button onclick={saveTimesheetEdit}>Done</button>
            </div>
          </div>
          <div class="form-grid" oninput={() => touch()}>
            <label class="wide">Title <input bind:value={selectedTimesheet.title} /></label>
            <label>Client
              <select bind:value={selectedTimesheet.clientId} onchange={() => updateTimesheetClient(selectedTimesheet)}>
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
            <label>Entry mode
              <select bind:value={selectedTimesheet.entryMode}>
                <option value="simple">Simple</option>
                <option value="detailed">Detailed</option>
              </select>
            </label>
          </div>
          <div class="entry-list" oninput={() => touch()}>
            <div class="entry-head">
              <h3>Entries</h3>
              <button onclick={() => { selectedTimesheet.entries = [...selectedTimesheet.entries, emptyTimesheetEntry()]; touch('Entry added'); }}><Plus size={16} /> Add Entry</button>
            </div>
            {#each selectedTimesheet.entries as entry}
              {#if selectedTimesheet.entryMode === 'simple'}
                <div class="entry-grid simple">
                  <label>Date <input type="date" bind:value={entry.date} /></label>
                  <label>Hours <input type="number" min="0" step="0.25" bind:value={entry.hours} /></label>
                  <label class="check"><input type="checkbox" bind:checked={entry.billable} onchange={() => touch()} /> Billable</label>
                  <label class="description">Description <input bind:value={entry.description} /></label>
                  <span class="duration">{formatHours(entryMinutes(entry, selectedTimesheet.entryMode))}</span>
                  <button class="icon danger-icon" onclick={() => { selectedTimesheet.entries = selectedTimesheet.entries.filter((item) => item.id !== entry.id); touch('Entry removed'); }} title="Remove entry"><Trash2 size={16} /></button>
                </div>
              {:else}
                <div class="entry-grid">
                  <label>Date <input type="date" bind:value={entry.date} /></label>
                  <label>Start <input type="time" bind:value={entry.startTime} /></label>
                  <label>End <input type="time" bind:value={entry.endTime} /></label>
                  <label>Break <input type="number" min="0" step="5" bind:value={entry.breakMinutes} /></label>
                  <label class="check"><input type="checkbox" bind:checked={entry.billable} onchange={() => touch()} /> Billable</label>
                  <label class="description">Description <input bind:value={entry.description} /></label>
                  <span class="duration">{formatHours(entryMinutes(entry, selectedTimesheet.entryMode))}</span>
                  <button class="icon danger-icon" onclick={() => { selectedTimesheet.entries = selectedTimesheet.entries.filter((item) => item.id !== entry.id); touch('Entry removed'); }} title="Remove entry"><Trash2 size={16} /></button>
                </div>
              {/if}
            {/each}
          </div>
        </section>
      {/if}
    {:else if activeView === 'invoices'}
      {#if invoiceMode === 'list'}
        <section>
          <div class="section-title">
            <h2>Invoices</h2>
            <div class="actions">
              <label class="inline-check"><input type="checkbox" bind:checked={showArchivedInvoices} /> Show archived</label>
              <button onclick={addInvoice}><Plus size={16} /> New Invoice</button>
            </div>
          </div>
          <div class="table">
            <div class="table-head"><span>Invoice</span><span>Client</span><span>Due</span><span>Status</span><span>Total</span><span></span></div>
            {#each activeInvoices as invoice}
              <div class="table-row six">
                <span><strong>{invoice.invoiceNumber}</strong>{#if invoice.archived}<small>Archived</small>{/if}</span>
                <span>{clientName(workspace.clients, invoice.clientId)}</span>
                <span>{invoice.dueDate}</span>
                <span><i class="status">{invoice.status}</i></span>
                <span>{formatMoney(invoiceTotal(invoice), invoice.currency)}</span>
                <span class="row-actions">
                  <button class="icon" onclick={() => { selectedInvoiceId = invoice.id; invoiceMode = 'edit'; }} title="Edit invoice"><FileInput size={16} /></button>
                  <button class="icon" onclick={() => copyInvoice(invoice)} title="Duplicate invoice"><Copy size={16} /></button>
                  <button class="icon" onclick={() => generateInvoice(invoice)} title="Generate PDF"><Download size={16} /></button>
                  {#if invoice.archived}
                    <button class="icon" onclick={() => archiveInvoice(invoice, false)} title="Restore invoice"><RotateCcw size={16} /></button>
                  {:else}
                    <button class="icon" onclick={() => archiveInvoice(invoice)} title="Archive invoice"><Archive size={16} /></button>
                  {/if}
                  <button class="icon danger-icon" onclick={() => deleteInvoice(invoice)} title="Delete invoice"><Trash2 size={16} /></button>
                </span>
              </div>
            {/each}
          </div>
        </section>
      {:else if selectedInvoice}
        <section class="editor full">
          <div class="record-header">
            <div>
              <h2>{selectedInvoice.invoiceNumber || 'New invoice'}</h2>
              <p>{clientName(workspace.clients, selectedInvoice.clientId)} · due {selectedInvoice.dueDate}</p>
              <div class="record-meta">
                <span>{formatMoney(invoiceTotal(selectedInvoice), selectedInvoice.currency)}</span>
                <span>Status {selectedInvoice.status}</span>
                <span>Issue {selectedInvoice.issueDate}</span>
                <span>Last PDF generated: {pdfLabel(selectedInvoice.lastPdfGeneratedAt)}</span>
              </div>
            </div>
            <div class="actions">
              <button class="secondary" onclick={() => generateInvoice(selectedInvoice)}><Download size={16} /> PDF</button>
              <button class="secondary" onclick={() => copyInvoice(selectedInvoice)}><Copy size={16} /> Duplicate</button>
              {#if selectedInvoice.archived}
                <button class="secondary" onclick={() => archiveInvoice(selectedInvoice, false)}><RotateCcw size={16} /> Restore</button>
              {:else}
                <button class="secondary" onclick={() => archiveInvoice(selectedInvoice)}><Archive size={16} /> Archive</button>
              {/if}
              <button class="danger" onclick={() => deleteInvoice(selectedInvoice)}><Trash2 size={16} /> Delete</button>
              <button onclick={saveInvoiceEdit}>Done</button>
            </div>
          </div>
          <div class="form-grid" oninput={() => touch()}>
            <label>Invoice number <input bind:value={selectedInvoice.invoiceNumber} /></label>
            <label>Client
              <select bind:value={selectedInvoice.clientId} onchange={() => updateInvoiceClient(selectedInvoice)}>
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
          </div>
          <div class="template-picker" oninput={() => touch()}>
            <label class:active={selectedInvoice.template === 'classic'}>
              <input type="radio" bind:group={selectedInvoice.template} value="classic" />
              <span class="template-preview classic"><b>Classic</b><i></i><i></i><i></i></span>
            </label>
            <label class:active={selectedInvoice.template === 'modern'}>
              <input type="radio" bind:group={selectedInvoice.template} value="modern" />
              <span class="template-preview modern"><b>Modern</b><i></i><i></i><i></i></span>
            </label>
            <label class:active={selectedInvoice.template === 'compact'}>
              <input type="radio" bind:group={selectedInvoice.template} value="compact" />
              <span class="template-preview compact"><b>Compact</b><i></i><i></i><i></i></span>
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
        </div>
        <div class="settings-block">
          <h3>Invoice template</h3>
          <div class="template-picker" oninput={() => touch()}>
            <label class:active={workspace.settings.invoiceTemplate === 'classic'}>
              <input type="radio" bind:group={workspace.settings.invoiceTemplate} value="classic" />
              <span class="template-preview classic"><b>Classic</b><i></i><i></i><i></i></span>
            </label>
            <label class:active={workspace.settings.invoiceTemplate === 'modern'}>
              <input type="radio" bind:group={workspace.settings.invoiceTemplate} value="modern" />
              <span class="template-preview modern"><b>Modern</b><i></i><i></i><i></i></span>
            </label>
            <label class:active={workspace.settings.invoiceTemplate === 'compact'}>
              <input type="radio" bind:group={workspace.settings.invoiceTemplate} value="compact" />
              <span class="template-preview compact"><b>Compact</b><i></i><i></i><i></i></span>
            </label>
          </div>
        </div>
        <div class="settings-block">
          <h3>Company logo</h3>
          <div class="logo-tools">
            {#if workspace.settings.companyLogo}
              <img src={workspace.settings.companyLogo} alt="Company logo preview" />
            {/if}
            <input bind:this={logoInput} class="file-input" type="file" accept="image/png,image/jpeg,image/svg+xml" onchange={uploadLogo} />
            <button class="secondary" onclick={() => logoInput.click()}><Upload size={16} /> Upload Company Logo</button>
            {#if workspace.settings.companyLogo}
              <button class="secondary" onclick={() => { workspace.settings.companyLogo = ''; touch('Company logo removed'); }}><Trash2 size={16} /> Remove</button>
            {/if}
          </div>
        </div>
      </section>
    {/if}

    {#if wizardOpen}
      <div class="modal-backdrop">
        <section class="wizard">
          <div class="editor-head">
            <h2>Generate Invoice</h2>
            <button class="secondary" onclick={() => (wizardOpen = false)}>Close</button>
          </div>
          <div class="wizard-steps">
            <span class:active={wizardStep === 1}>1 Select timesheet</span>
            <span class:active={wizardStep === 2}>2 Review items</span>
            <span class:active={wizardStep === 3}>3 Create invoice</span>
          </div>
          {#if wizardStep === 1}
            <div class="form-grid">
              <label class="wide">Timesheet
                <select bind:value={wizardTimesheetId}>
                  {#each workspace.timesheets.filter((timesheet) => !timesheet.archived) as timesheet}
                    <option value={timesheet.id}>{timesheet.title} · {clientName(workspace.clients, timesheet.clientId)}</option>
                  {/each}
                </select>
              </label>
            </div>
            <div class="actions end">
              <button onclick={() => (wizardStep = 2)} disabled={!wizardTimesheet}>Review</button>
            </div>
          {:else if wizardStep === 2 && wizardTimesheet && wizardInvoice}
            <div class="summary-strip">
              <span>{wizardInvoice.items[0]?.description}</span>
              <strong>{wizardInvoice.items[0]?.quantity}h × {formatMoney(wizardInvoice.items[0]?.unitPrice ?? 0, wizardInvoice.currency)}</strong>
            </div>
            <div class="table compact-table">
              <div class="table-head"><span>Description</span><span>Qty</span><span>Unit</span><span>Total</span></div>
              {#each wizardInvoice.items as item}
                <div class="table-row compact-row">
                  <span>{item.description}</span>
                  <span>{item.quantity}</span>
                  <span>{formatMoney(item.unitPrice, wizardInvoice.currency)}</span>
                  <span>{formatMoney(item.quantity * item.unitPrice, wizardInvoice.currency)}</span>
                </div>
              {/each}
            </div>
            <div class="actions end">
              <button class="secondary" onclick={() => (wizardStep = 1)}>Back</button>
              <button onclick={() => (wizardStep = 3)}>Continue</button>
            </div>
          {:else if wizardStep === 3 && wizardInvoice}
            <div class="record-card">
              <strong>{wizardInvoice.invoiceNumber}</strong>
              <span>{clientName(workspace.clients, wizardInvoice.clientId)}</span>
              <span>Issue {wizardInvoice.issueDate} · Due {wizardInvoice.dueDate}</span>
              <b>{formatMoney(invoiceTotal(wizardInvoice), wizardInvoice.currency)}</b>
            </div>
            <div class="actions end">
              <button class="secondary" onclick={() => (wizardStep = 2)}>Back</button>
              <button onclick={createWizardInvoice}><FileCheck size={16} /> Create invoice</button>
            </div>
          {/if}
        </section>
      </div>
    {/if}
  </main>
</div>
