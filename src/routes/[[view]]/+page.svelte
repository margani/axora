<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Archive,
    BriefcaseBusiness,
    CheckCircle2,
    Copy,
    Download,
    FileText,
    History,
    LayoutDashboard,
    Plus,
    ReceiptText,
    RotateCcw,
    Search,
    Settings,
    Trash2,
    Upload
  } from '@lucide/svelte';
  import type { ActivityEvent, BillingPeriod, Client, Invoice, Workspace } from '$lib/types';
  import { generateInvoicePdf, generateTimesheetPdf } from '$lib/pdf';
  import {
    activity,
    addDays,
    billableMinutes,
    clientDefaults,
    clearWorkspace,
    clientName,
    downloadJson,
    duplicateInvoice,
    emptyBillingPeriod,
    emptyClient,
    emptyInvoice,
    emptyInvoiceItem,
    emptyTimesheet,
    emptyTimesheetEntry,
    formatHours,
    formatMoney,
    invoiceFromTimesheet,
    invoiceTotal,
    loadWorkspace,
    monthName,
    nextInvoiceNumber,
    nextMonth,
    normalizeWorkspace,
    sampleWorkspace,
    saveWorkspace,
    timesheetTotal,
    todayIso
  } from '$lib/workspace';

  type View = 'dashboard' | 'clients' | 'settings';

  let workspace: Workspace = sampleWorkspace();
  let activeView: View = 'dashboard';
  let selectedClientId = '';
  let selectedPeriodId = '';
  let lastSaved = '';
  let saveStatus: 'saved' | 'saving' | 'unsaved' = 'saved';
  let ready = false;
  let message = '';
  let searchQuery = '';
  let clearConfirmText = '';
  let saveTimer: ReturnType<typeof setTimeout>;
  let fileInput: HTMLInputElement;
  let logoInput: HTMLInputElement;

  $: selectedClient = workspace.clients.find((client) => client.id === selectedClientId);
  $: selectedClientPeriods = selectedClient ? clientPeriods(selectedClient.id) : [];
  $: selectedPeriod = selectedClientPeriods.find((period) => period.id === selectedPeriodId) ?? selectedClientPeriods[0];
  $: selectedTimesheet = selectedPeriod ? periodTimesheet(selectedPeriod) : undefined;
  $: selectedInvoice = selectedPeriod ? periodInvoice(selectedPeriod) : undefined;
  $: totalOutstanding = workspace.invoices
    .filter((invoice) => !invoice.archived && invoice.status !== 'paid' && invoice.status !== 'void')
    .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  $: revenueThisMonth = paidInvoicesForMonth(new Date().getMonth() + 1, new Date().getFullYear()).reduce(
    (sum, invoice) => sum + invoiceTotal(invoice),
    0
  );
  $: revenueThisYear = paidInvoicesForYear(new Date().getFullYear()).reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  $: hoursThisMonth = workspace.timesheets
    .filter((timesheet) => !timesheet.archived && timesheet.month === new Date().getMonth() + 1 && timesheet.year === new Date().getFullYear())
    .reduce((sum, timesheet) => sum + billableMinutes(timesheet), 0);
  $: hoursThisYear = workspace.timesheets
    .filter((timesheet) => !timesheet.archived && timesheet.year === new Date().getFullYear())
    .reduce((sum, timesheet) => sum + billableMinutes(timesheet), 0);
  $: recentActivity = [...workspace.activity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  $: clientActivity = selectedClient ? activityForClient(selectedClient.id).slice(0, 8) : [];
  $: searchResults = buildSearchResults(searchQuery);

  const viewPaths: Record<View, string> = {
    dashboard: '/',
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
    selectedPeriodId = clientPeriods(selectedClientId)[0]?.id ?? '';
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

  function addActivity(event: ActivityEvent) {
    workspace.activity = [event, ...workspace.activity].slice(0, 200);
  }

  function switchView(view: View, push = true) {
    activeView = view;
    message = '';
    const path = viewPaths[view];
    if (push && window.location.pathname !== path) history.pushState({}, '', path);
  }

  function openClient(clientId: string) {
    selectedClientId = clientId;
    selectedPeriodId = clientPeriods(clientId)[0]?.id ?? '';
    switchView('clients');
  }

  function clientPeriods(clientId: string) {
    return workspace.billingPeriods
      .filter((period) => period.clientId === clientId && !period.archived)
      .sort((a, b) => b.year - a.year || b.month - a.month);
  }

  function clientInvoices(clientId: string) {
    return workspace.invoices.filter((invoice) => invoice.clientId === clientId && !invoice.archived);
  }

  function periodTimesheet(period: BillingPeriod) {
    return workspace.timesheets.find((timesheet) => timesheet.id === period.timesheetId);
  }

  function periodInvoice(period: BillingPeriod) {
    return workspace.invoices.find((invoice) => invoice.id === period.invoiceId);
  }

  function periodTitle(period: BillingPeriod) {
    return `${monthName(period.month)} ${period.year}`;
  }

  function periodHours(period: BillingPeriod) {
    const timesheet = periodTimesheet(period);
    return timesheet ? billableMinutes(timesheet) : 0;
  }

  function periodValue(period: BillingPeriod) {
    const invoice = periodInvoice(period);
    const timesheet = periodTimesheet(period);
    if (invoice) return invoiceTotal(invoice);
    return timesheet ? timesheetTotal(timesheet) : 0;
  }

  function periodCurrency(period: BillingPeriod) {
    return periodInvoice(period)?.currency || periodTimesheet(period)?.currency || workspace.settings.currency;
  }

  function clientOutstanding(clientId: string) {
    return workspace.invoices
      .filter((invoice) => invoice.clientId === clientId && !invoice.archived && invoice.status !== 'paid' && invoice.status !== 'void')
      .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  }

  function clientRevenueYtd(clientId: string) {
    const year = new Date().getFullYear();
    return workspace.invoices
      .filter((invoice) => invoice.clientId === clientId && invoice.status === 'paid' && invoice.issueDate.startsWith(String(year)))
      .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  }

  function clientHoursYtd(clientId: string) {
    const year = new Date().getFullYear();
    return workspace.timesheets
      .filter((timesheet) => timesheet.clientId === clientId && !timesheet.archived && timesheet.year === year)
      .reduce((sum, timesheet) => sum + billableMinutes(timesheet), 0);
  }

  function clientHoursThisMonth(clientId: string) {
    const now = new Date();
    return workspace.timesheets
      .filter((timesheet) => timesheet.clientId === clientId && !timesheet.archived && timesheet.month === now.getMonth() + 1 && timesheet.year === now.getFullYear())
      .reduce((sum, timesheet) => sum + billableMinutes(timesheet), 0);
  }

  function paidInvoicesForMonth(month: number, year: number) {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return workspace.invoices.filter((invoice) => !invoice.archived && invoice.status === 'paid' && invoice.issueDate.startsWith(prefix));
  }

  function paidInvoicesForYear(year: number) {
    return workspace.invoices.filter((invoice) => !invoice.archived && invoice.status === 'paid' && invoice.issueDate.startsWith(String(year)));
  }

  function activityForClient(clientId: string) {
    const periodIds = new Set(workspace.billingPeriods.filter((period) => period.clientId === clientId).map((period) => period.id));
    const name = clientName(workspace.clients, clientId).toLowerCase();
    return [...workspace.activity]
      .filter((event) => (event.billingPeriodId && periodIds.has(event.billingPeriodId)) || event.message.toLowerCase().includes(name))
      .sort((a, b) => b.at.localeCompare(a.at));
  }

  function createTimesheetForClient(client: Client, month = new Date().getMonth() + 1, year = new Date().getFullYear()) {
    const defaults = clientDefaults(client, workspace);
    const timesheet = emptyTimesheet(client.id, defaults.currency, defaults.hourlyRate);
    timesheet.month = month;
    timesheet.year = year;
    timesheet.title = `${monthName(month)} ${year}`;
    timesheet.entries = [];
    const period = { ...emptyBillingPeriod(client.id, month, year), timesheetId: timesheet.id };
    workspace = {
      ...workspace,
      timesheets: [timesheet, ...workspace.timesheets],
      billingPeriods: [period, ...workspace.billingPeriods]
    };
    selectedClientId = client.id;
    selectedPeriodId = period.id;
    addActivity(activity(`Created ${periodTitle(period)} timesheet for ${client.name || 'client'}`, 'created', period.id));
    switchView('clients');
    touch('Timesheet created');
    return period;
  }

  function createNextTimesheet(client: Client) {
    const latest = clientPeriods(client.id)[0];
    const next = latest ? nextMonth(latest.month, latest.year) : { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
    createTimesheetForClient(client, next.month, next.year);
  }

  function createInvoiceForClient(client: Client) {
    const period = selectedPeriod?.clientId === client.id ? selectedPeriod : (clientPeriods(client.id)[0] ?? createTimesheetForClient(client));
    generateInvoiceForPeriod(period);
  }

  function generateInvoiceForPeriod(period: BillingPeriod) {
    const timesheet = periodTimesheet(period);
    if (!timesheet) return;
    const client = workspace.clients.find((item) => item.id === period.clientId);
    const defaults = clientDefaults(client, workspace);
    const invoice =
      periodInvoice(period) ??
      invoiceFromTimesheet(timesheet, nextInvoiceNumber(workspace.invoices), defaults.paymentTermsDays, defaults.invoiceTemplate);
    if (!period.invoiceId) {
      invoice.items[0].description = `${client?.defaultServiceDescription || 'Professional services'} - ${monthName(period.month)} ${period.year}`;
      period.invoiceId = invoice.id;
      workspace.invoices = [invoice, ...workspace.invoices];
    }
    period.status = invoice.status === 'paid' ? 'paid' : 'invoiced';
    addActivity(activity(`Created Invoice ${invoice.invoiceNumber}`, 'invoice', period.id));
    touch('Invoice generated');
  }

  function createStandaloneInvoice(client: Client) {
    const defaults = clientDefaults(client, workspace);
    const invoice = emptyInvoice(client.id, defaults.currency, defaults.invoiceTemplate);
    invoice.invoiceNumber = nextInvoiceNumber(workspace.invoices);
    invoice.dueDate = addDays(todayIso(), defaults.paymentTermsDays);
    invoice.items[0].description = client.defaultServiceDescription || 'Professional services';
    invoice.items[0].unitPrice = defaults.hourlyRate;
    workspace.invoices = [invoice, ...workspace.invoices];
    addActivity(activity(`Created Invoice ${invoice.invoiceNumber}`, 'invoice'));
    touch('Invoice created');
  }

  function duplicateInvoiceForClient(invoice: Invoice) {
    const client = workspace.clients.find((item) => item.id === invoice.clientId);
    const defaults = clientDefaults(client, workspace);
    const copy = duplicateInvoice(invoice, workspace.invoices, defaults.paymentTermsDays);
    workspace.invoices = [copy, ...workspace.invoices];
    addActivity(activity(`Duplicated Invoice ${invoice.invoiceNumber}`, 'invoice'));
    touch('Invoice duplicated');
  }

  function generatePeriodPdf(period: BillingPeriod) {
    const timesheet = periodTimesheet(period);
    const invoice = periodInvoice(period);
    const now = new Date().toISOString();
    if (timesheet) {
      generateTimesheetPdf(workspace, timesheet);
      timesheet.lastPdfGeneratedAt = now;
    }
    if (invoice) {
      generateInvoicePdf(workspace, invoice);
      invoice.lastPdfGeneratedAt = now;
    }
    addActivity(activity(`Generated PDF for ${clientName(workspace.clients, period.clientId)} ${periodTitle(period)}`, 'pdf', period.id));
    touch('PDF generated');
  }

  function generateInvoicePdfOnly(invoice: Invoice) {
    generateInvoicePdf(workspace, invoice);
    invoice.lastPdfGeneratedAt = new Date().toISOString();
    addActivity(activity(`Generated PDF for ${invoice.invoiceNumber}`, 'pdf'));
    touch('Invoice PDF generated');
  }

  function markInvoicePaid(invoice: Invoice) {
    invoice.status = 'paid';
    const period = workspace.billingPeriods.find((item) => item.invoiceId === invoice.id);
    if (period) period.status = 'paid';
    addActivity(activity(`Marked Invoice ${invoice.invoiceNumber} paid`, 'payment', period?.id));
    touch('Invoice marked paid');
  }

  function archiveInvoiceForClient(invoice: Invoice, archived = true) {
    invoice.archived = archived;
    const period = workspace.billingPeriods.find((item) => item.invoiceId === invoice.id);
    if (period) period.archived = archived;
    addActivity(activity(`${archived ? 'Archived' : 'Restored'} Invoice ${invoice.invoiceNumber}`, 'archive', period?.id));
    touch(archived ? 'Invoice archived' : 'Invoice restored');
  }

  function addEntry(period: BillingPeriod) {
    const timesheet = periodTimesheet(period);
    if (!timesheet) return;
    const entry = emptyTimesheetEntry();
    entry.description = workspace.clients.find((client) => client.id === period.clientId)?.defaultServiceDescription || `${monthName(period.month)} work`;
    timesheet.entries = [...timesheet.entries, entry];
    addActivity(activity(`Added hours to ${clientName(workspace.clients, period.clientId)} ${periodTitle(period)}`, 'updated', period.id));
    touch('Hours added');
  }

  function removeEntry(period: BillingPeriod, entryId: string) {
    const timesheet = periodTimesheet(period);
    if (!timesheet) return;
    timesheet.entries = timesheet.entries.filter((entry) => entry.id !== entryId);
    touch('Entry removed');
  }

  function addClient() {
    const client = emptyClient();
    replaceWorkspace({ ...workspace, clients: [client, ...workspace.clients] }, 'Client created');
    selectedClientId = client.id;
    switchView('clients');
  }

  function deleteClient(client: Client) {
    if (!confirm(`Delete ${client.name || 'this client'}? Timesheets and invoices keep their client id.`)) return;
    replaceWorkspace({ ...workspace, clients: workspace.clients.filter((item) => item.id !== client.id) }, 'Client deleted');
    selectedClientId = workspace.clients.find((item) => item.id !== client.id)?.id ?? '';
  }

  async function importWorkspace(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      workspace = normalizeWorkspace(JSON.parse(text));
      selectedClientId = workspace.clients[0]?.id ?? '';
      selectedPeriodId = clientPeriods(selectedClientId)[0]?.id ?? '';
      addActivity(activity('Imported Workspace', 'import'));
      touch('Workspace imported');
    } catch (error) {
      message = error instanceof Error ? error.message : 'Could not import workspace.';
    } finally {
      input.value = '';
    }
  }

  function exportWorkspace() {
    addActivity(activity('Exported Workspace', 'export'));
    lastSaved = saveWorkspace(workspace);
    downloadJson(workspace);
    message = 'Workspace exported';
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

  function clearLocal() {
    if (clearConfirmText !== 'DELETE') {
      message = 'Type DELETE before clearing local data.';
      return;
    }
    clearWorkspace();
    workspace = sampleWorkspace();
    selectedClientId = workspace.clients[0]?.id ?? '';
    selectedPeriodId = clientPeriods(selectedClientId)[0]?.id ?? '';
    lastSaved = '';
    clearConfirmText = '';
    message = 'Local data cleared. Sample data is loaded but not saved.';
  }

  function savedLabel() {
    if (!lastSaved) return 'Not saved yet';
    return new Date(lastSaved).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function saveStatusLabel() {
    if (saveStatus === 'saving') return 'Saving...';
    if (saveStatus === 'unsaved') return 'Unsaved changes';
    return 'Saved';
  }

  function formatDateTime(value: string) {
    return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function buildSearchResults(query: string) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const clientResults = workspace.clients
      .filter((client) => `${client.name} ${client.notes}`.toLowerCase().includes(needle))
      .map((item) => ({ type: 'Client', label: item.name || 'Untitled client', detail: item.email || item.notes, id: item.id }));
    const timesheetResults = workspace.billingPeriods
      .filter((period) => `${clientName(workspace.clients, period.clientId)} ${periodTitle(period)} ${period.notes}`.toLowerCase().includes(needle))
      .map((item) => ({ type: 'Timesheet', label: `${clientName(workspace.clients, item.clientId)} · ${periodTitle(item)}`, detail: `${formatHours(periodHours(item))}`, id: item.id }));
    const invoiceResults = workspace.invoices
      .filter((invoice) => `${invoice.invoiceNumber} ${clientName(workspace.clients, invoice.clientId)} ${invoice.notes}`.toLowerCase().includes(needle))
      .map((item) => ({ type: 'Invoice', label: item.invoiceNumber, detail: clientName(workspace.clients, item.clientId), id: item.id }));
    return [...clientResults, ...timesheetResults, ...invoiceResults].slice(0, 8);
  }

  function openSearchResult(result: { type: string; id: string }) {
    searchQuery = '';
    if (result.type === 'Client') {
      openClient(result.id);
    } else if (result.type === 'Timesheet') {
      const period = workspace.billingPeriods.find((item) => item.id === result.id);
      if (period) {
        selectedPeriodId = period.id;
        openClient(period.clientId);
      }
    } else {
      const invoice = workspace.invoices.find((item) => item.id === result.id);
      if (invoice) openClient(invoice.clientId);
    }
  }
</script>

<svelte:head>
  <title>Axora</title>
  <meta name="description" content="Axora is a local-first client workspace for independent contractors." />
</svelte:head>

<div class="app-shell">
  <aside class="sidebar">
    <div class="brand">
      <FileText size={26} />
      <div>
        <strong>Axora</strong>
        <span>Client workspace</span>
      </div>
    </div>
    <nav>
      <button class:active={activeView === 'dashboard'} onclick={() => switchView('dashboard')}>
        <LayoutDashboard size={18} />
        <span>Dashboard</span>
      </button>
      <div class="nav-group">
        <button class:active={activeView === 'clients'} onclick={() => switchView('clients')}>
          <BriefcaseBusiness size={18} />
          <span>Clients</span>
        </button>
        <div class="client-nav">
          {#each workspace.clients as client}
            <button class:active={activeView === 'clients' && selectedClientId === client.id} onclick={() => openClient(client.id)}>
              <span>{client.name || 'Untitled client'}</span>
            </button>
          {/each}
        </div>
      </div>
      <button class:active={activeView === 'settings'} onclick={() => switchView('settings')}>
        <Settings size={18} />
        <span>Settings</span>
      </button>
    </nav>
  </aside>

  <main>
    <header class="topbar">
      <div>
        <h1>{activeView === 'clients' ? selectedClient?.name || 'Clients' : activeView === 'dashboard' ? 'Dashboard' : 'Settings'}</h1>
        <p>Last saved: {savedLabel()} <span class="save-status {saveStatus}">{saveStatusLabel()}</span></p>
      </div>
      <div class="top-actions">
        <div class="search-box">
          <Search size={16} />
          <input bind:value={searchQuery} placeholder="Search clients, timesheets, invoices, notes" />
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
        <button class="secondary" onclick={() => fileInput.click()}><Upload size={17} /><span>Import</span></button>
        <button class="secondary" onclick={exportWorkspace}><Download size={17} /><span>Export</span></button>
        <input class="clear-input" bind:value={clearConfirmText} placeholder="Type DELETE" aria-label="Type DELETE to clear data" />
        <button class="danger" onclick={clearLocal}><Trash2 size={17} /><span>Clear</span></button>
      </div>
    </header>

    {#if message}
      <div class="notice">{message}</div>
    {/if}

    {#if activeView === 'dashboard'}
      <section class="dashboard-grid">
        <div class="metric"><span>Outstanding invoices</span><strong>{formatMoney(totalOutstanding, workspace.settings.currency)}</strong></div>
        <div class="metric"><span>Revenue this month</span><strong>{formatMoney(revenueThisMonth, workspace.settings.currency)}</strong></div>
        <div class="metric"><span>Revenue this year</span><strong>{formatMoney(revenueThisYear, workspace.settings.currency)}</strong></div>
        <div class="metric"><span>Hours this month</span><strong>{formatHours(hoursThisMonth)}</strong></div>
        <div class="metric"><span>Hours this year</span><strong>{formatHours(hoursThisYear)}</strong></div>
      </section>
      <section class="period-grid">
        {#each workspace.clients as client}
          <article class="period-card client-overview">
            <div>
              <h3>{client.name || 'Untitled client'}</h3>
              <small>{client.email || client.contactName || 'No contact details'}</small>
            </div>
            <div class="period-metrics">
              <span>Outstanding: <b>{formatMoney(clientOutstanding(client.id), client.defaultCurrency)}</b></span>
              <span>Hours this month: <b>{formatHours(clientHoursThisMonth(client.id))}</b></span>
            </div>
            <button onclick={() => openClient(client.id)}>Open Client</button>
          </article>
        {/each}
      </section>
      <section class="list-panel">
        <div class="section-title"><h2>Recent Activity</h2><History size={18} /></div>
        <div class="activity-list">
          {#each recentActivity as event}
            <div class="activity-item"><strong>{event.message}</strong><small>{formatDateTime(event.at)}</small></div>
          {/each}
        </div>
      </section>
    {:else if activeView === 'clients'}
      {#if selectedClient}
        <section class="client-workspace">
          <div class="record-header">
            <div>
              <h2>{selectedClient.name || 'Untitled client'}</h2>
              <p>{selectedClient.email || selectedClient.contactName || 'Client workspace'}</p>
              <div class="record-meta">
                <span>Outstanding {formatMoney(clientOutstanding(selectedClient.id), selectedClient.defaultCurrency)}</span>
                <span>Revenue YTD {formatMoney(clientRevenueYtd(selectedClient.id), selectedClient.defaultCurrency)}</span>
                <span>Hours YTD {formatHours(clientHoursYtd(selectedClient.id))}</span>
              </div>
            </div>
            <div class="actions">
              <button onclick={() => createTimesheetForClient(selectedClient)}><Plus size={16} /> New Timesheet</button>
              <button class="secondary" onclick={() => createStandaloneInvoice(selectedClient)}><ReceiptText size={16} /> New Invoice</button>
              <button class="secondary" onclick={() => createInvoiceForClient(selectedClient)}><ReceiptText size={16} /> Generate Invoice From Timesheet</button>
            </div>
          </div>

          <section class="workflow-section">
            <div class="section-title">
              <h2>Recent Timesheets</h2>
              <button class="secondary" onclick={() => createNextTimesheet(selectedClient)}><Copy size={16} /> Create Next Timesheet</button>
            </div>
            <div class="period-grid compact">
              {#each selectedClientPeriods.slice(0, 6) as period}
                <article class="period-card">
                  <div>
                    <h3>{periodTitle(period)}</h3>
                    <small>{periodInvoice(period)?.status ?? 'No invoice'}</small>
                  </div>
                  <div class="period-metrics">
                    <strong>{formatHours(periodHours(period))}</strong>
                    <b>{formatMoney(periodValue(period), periodCurrency(period))}</b>
                  </div>
                  <div class="actions">
                    <button onclick={() => (selectedPeriodId = period.id)}>Open</button>
                    <button class="secondary" onclick={() => createNextTimesheet(selectedClient)}><Copy size={16} /> Duplicate</button>
                    <button class="secondary" onclick={() => generateInvoiceForPeriod(period)}><ReceiptText size={16} /> Invoice</button>
                    <button class="secondary" onclick={() => generatePeriodPdf(period)}><Download size={16} /> PDF</button>
                  </div>
                </article>
              {/each}
            </div>
          </section>

          <section class="workflow-section">
            <div class="section-title"><h2>Recent Invoices</h2><small>{clientInvoices(selectedClient.id).length} invoices</small></div>
            <div class="period-grid compact">
              {#each clientInvoices(selectedClient.id).slice(0, 6) as invoice}
                <article class="period-card invoice-card">
                  <div>
                    <h3>{invoice.invoiceNumber}</h3>
                    <small>{invoice.status}</small>
                  </div>
                  <div class="period-metrics">
                    <strong>{formatMoney(invoiceTotal(invoice), invoice.currency)}</strong>
                    <span>Due {invoice.dueDate}</span>
                  </div>
                  <div class="actions">
                    <button onclick={() => selectedPeriodId = workspace.billingPeriods.find((period) => period.invoiceId === invoice.id)?.id ?? selectedPeriodId}>Open</button>
                    <button class="secondary" onclick={() => generateInvoicePdfOnly(invoice)}><Download size={16} /> PDF</button>
                    <button class="secondary" onclick={() => duplicateInvoiceForClient(invoice)}><Copy size={16} /> Duplicate</button>
                    <button class="secondary" onclick={() => markInvoicePaid(invoice)}><CheckCircle2 size={16} /> Paid</button>
                    <button class="secondary" onclick={() => archiveInvoiceForClient(invoice)}><Archive size={16} /> Archive</button>
                  </div>
                </article>
              {/each}
            </div>
          </section>

          {#if selectedPeriod && selectedTimesheet}
            <section class="workflow-section focus-panel">
              <div class="section-title">
                <h2>{periodTitle(selectedPeriod)}</h2>
                <div class="actions">
                  <button onclick={() => addEntry(selectedPeriod)}><Plus size={16} /> Add Hours</button>
                  <button class="secondary" onclick={() => generateInvoiceForPeriod(selectedPeriod)}><ReceiptText size={16} /> Generate Invoice</button>
                  <button class="secondary" onclick={() => generatePeriodPdf(selectedPeriod)}><Download size={16} /> PDF</button>
                </div>
              </div>
              <div class="entry-list" oninput={() => touch('Timesheet saved')}>
                {#each selectedTimesheet.entries as entry}
                  <div class="entry-grid simple">
                    <label>Date <input type="date" bind:value={entry.date} /></label>
                    <label>Hours <input type="number" min="0" step="0.25" bind:value={entry.hours} /></label>
                    <label class="check"><input type="checkbox" bind:checked={entry.billable} onchange={() => touch('Timesheet saved')} /> Billable</label>
                    <label class="description">Description <input bind:value={entry.description} /></label>
                    <span class="duration">{formatHours(Number(entry.hours || 0) * 60)}</span>
                    <button class="icon danger-icon" onclick={() => removeEntry(selectedPeriod, entry.id)}><Trash2 size={16} /></button>
                  </div>
                {/each}
              </div>
              {#if selectedInvoice}
                <div class="invoice-summary">
                  <strong>{selectedInvoice.invoiceNumber}</strong>
                  <span>{selectedInvoice.status} · Due {selectedInvoice.dueDate}</span>
                  <b>{formatMoney(invoiceTotal(selectedInvoice), selectedInvoice.currency)}</b>
                </div>
                <div class="entry-list" oninput={() => touch('Invoice saved')}>
                  {#each selectedInvoice.items as item}
                    <div class="item-grid">
                      <label>Description <input bind:value={item.description} /></label>
                      <label>Quantity <input type="number" min="0" step="0.01" bind:value={item.quantity} /></label>
                      <label>Unit price <input type="number" min="0" step="0.01" bind:value={item.unitPrice} /></label>
                      <span class="duration">{formatMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0), selectedInvoice.currency)}</span>
                      <button class="icon danger-icon" onclick={() => { selectedInvoice.items = selectedInvoice.items.filter((row) => row.id !== item.id); touch('Item removed'); }}><Trash2 size={16} /></button>
                    </div>
                  {/each}
                  <button class="secondary" onclick={() => { selectedInvoice.items = [...selectedInvoice.items, emptyInvoiceItem()]; touch('Item added'); }}><Plus size={16} /> Add Invoice Item</button>
                </div>
              {/if}
            </section>
          {/if}

          <section class="workflow-section">
            <h2>Notes</h2>
            <textarea rows="6" bind:value={selectedClient.notes} oninput={() => touch('Client notes saved')}></textarea>
          </section>

          <section class="workflow-section">
            <div class="section-title"><h2>Recent Activity</h2><History size={18} /></div>
            <div class="activity-list">
              {#each clientActivity as event}
                <div class="activity-item"><strong>{event.message}</strong><small>{formatDateTime(event.at)}</small></div>
              {/each}
            </div>
          </section>

          <section class="workflow-section">
            <h2>Client Settings</h2>
            <div class="form-grid" oninput={() => touch('Client settings saved')}>
              <label>Name <input bind:value={selectedClient.name} /></label>
              <label>Email <input type="email" bind:value={selectedClient.email} /></label>
              <label>Contact name <input bind:value={selectedClient.contactName} /></label>
              <label>Phone <input bind:value={selectedClient.phone} /></label>
              <label>Hourly Rate <input type="number" min="0" step="0.01" bind:value={selectedClient.defaultHourlyRate} /></label>
              <label>Currency <input bind:value={selectedClient.defaultCurrency} /></label>
              <label>Payment Terms <input type="number" min="0" bind:value={selectedClient.defaultPaymentTermsDays} /></label>
              <label>Invoice Template
                <select bind:value={selectedClient.defaultInvoiceTemplate}>
                  <option value="classic">Classic</option>
                  <option value="modern">Modern</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
              <label class="wide">Default Service Description <input bind:value={selectedClient.defaultServiceDescription} /></label>
              <label class="wide">Address <textarea rows="4" bind:value={selectedClient.address}></textarea></label>
            </div>
            <div class="actions danger-zone">
              <button class="danger" onclick={() => deleteClient(selectedClient)}><Trash2 size={16} /> Delete Client</button>
            </div>
          </section>
        </section>
      {:else}
        <div class="empty-state"><button onclick={addClient}><Plus size={16} /> Create Client</button></div>
      {/if}
    {:else if activeView === 'settings'}
      <section class="editor full">
        <div class="editor-head"><h2>Workspace Settings</h2></div>
        <div class="form-grid" oninput={() => touch('Settings saved')}>
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
          <label>Default currency <input bind:value={workspace.settings.currency} /></label>
        </div>
        <div class="settings-block">
          <h3>Company logo</h3>
          <div class="logo-tools">
            {#if workspace.settings.companyLogo}<img src={workspace.settings.companyLogo} alt="Company logo preview" />{/if}
            <input bind:this={logoInput} class="file-input" type="file" accept="image/png,image/jpeg,image/svg+xml" onchange={uploadLogo} />
            <button class="secondary" onclick={() => logoInput.click()}><Upload size={16} /> Upload Company Logo</button>
          </div>
        </div>
      </section>
    {/if}
  </main>
</div>
