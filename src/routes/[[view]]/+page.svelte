<script lang="ts">
  import { onMount } from 'svelte';
  import {
    Archive,
    BriefcaseBusiness,
    CalendarDays,
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
  import type { ActivityEvent, BillingPeriod, Client, Invoice, Timesheet, Workspace } from '$lib/types';
  import { generateInvoicePdf, generateTimesheetPdf } from '$lib/pdf';
  import {
    activity,
    billableMinutes,
    clientDefaults,
    clearWorkspace,
    clientName,
    downloadJson,
    emptyBillingPeriod,
    emptyClient,
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
    timesheetTotal
  } from '$lib/workspace';

  type View = 'dashboard' | 'billing' | 'clients' | 'records' | 'settings';

  let workspace: Workspace = sampleWorkspace();
  let activeView: View = 'billing';
  let selectedPeriodId = '';
  let selectedClientId = '';
  let lastSaved = '';
  let saveStatus: 'saved' | 'saving' | 'unsaved' = 'saved';
  let ready = false;
  let message = '';
  let searchQuery = '';
  let showArchivedPeriods = false;
  let clearConfirmText = '';
  let saveTimer: ReturnType<typeof setTimeout>;
  let fileInput: HTMLInputElement;
  let logoInput: HTMLInputElement;

  $: activePeriods = workspace.billingPeriods.filter((period) => showArchivedPeriods || !period.archived);
  $: selectedPeriod = workspace.billingPeriods.find((period) => period.id === selectedPeriodId);
  $: selectedTimesheet = selectedPeriod ? periodTimesheet(selectedPeriod) : undefined;
  $: selectedInvoice = selectedPeriod ? periodInvoice(selectedPeriod) : undefined;
  $: selectedClient = workspace.clients.find((client) => client.id === selectedClientId);
  $: totalOutstanding = workspace.invoices
    .filter((invoice) => !invoice.archived && invoice.status !== 'paid' && invoice.status !== 'void')
    .reduce((sum, invoice) => sum + invoiceTotal(invoice), 0);
  $: currentMonthPeriods = currentClientPeriods();
  $: recentActivity = [...workspace.activity].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 8);
  $: periodHistory = selectedPeriod
    ? workspace.activity.filter((event) => event.billingPeriodId === selectedPeriod.id).sort((a, b) => b.at.localeCompare(a.at))
    : [];
  $: outstandingInvoices = workspace.invoices
    .filter((invoice) => !invoice.archived && invoice.status !== 'paid' && invoice.status !== 'void')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  $: searchResults = buildSearchResults(searchQuery);

  const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
    { id: 'billing', label: 'Billing Periods', icon: CalendarDays },
    { id: 'dashboard', label: 'Current Work', icon: LayoutDashboard },
    { id: 'clients', label: 'Clients', icon: BriefcaseBusiness },
    { id: 'records', label: 'Records', icon: ReceiptText },
    { id: 'settings', label: 'Settings', icon: Settings }
  ];

  const viewPaths: Record<View, string> = {
    billing: '/',
    dashboard: '/dashboard',
    clients: '/clients',
    records: '/records',
    settings: '/settings'
  };

  function viewFromPath(pathname: string): View {
    const found = Object.entries(viewPaths).find(([, path]) => path === pathname);
    return (found?.[0] as View | undefined) ?? 'billing';
  }

  onMount(() => {
    const loaded = loadWorkspace();
    workspace = loaded.workspace;
    lastSaved = loaded.savedAt;
    selectedPeriodId = workspace.billingPeriods.find((period) => !period.archived)?.id ?? workspace.billingPeriods[0]?.id ?? '';
    selectedClientId = workspace.clients[0]?.id ?? '';
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

  function periodTimesheet(period: BillingPeriod) {
    return workspace.timesheets.find((timesheet) => timesheet.id === period.timesheetId);
  }

  function periodInvoice(period: BillingPeriod) {
    return workspace.invoices.find((invoice) => invoice.id === period.invoiceId);
  }

  function periodTitle(period: BillingPeriod) {
    return `${clientName(workspace.clients, period.clientId)} · ${monthName(period.month)} ${period.year}`;
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

  function invoiceStatus(period: BillingPeriod) {
    return periodInvoice(period)?.status || (period.status === 'paid' ? 'paid' : 'not created');
  }

  function currentClientPeriods() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();
    return workspace.clients.map((client) => {
      const period = workspace.billingPeriods.find((item) => item.clientId === client.id && item.month === month && item.year === year);
      return { client, period };
    });
  }

  function createBillingPeriod(clientId = workspace.clients[0]?.id ?? '', month = new Date().getMonth() + 1, year = new Date().getFullYear()) {
    const client = workspace.clients.find((item) => item.id === clientId);
    const defaults = clientDefaults(client, workspace);
    const timesheet = emptyTimesheet(clientId, defaults.currency, defaults.hourlyRate);
    timesheet.month = month;
    timesheet.year = year;
    timesheet.title = `${monthName(month)} ${year} Timesheet`;
    timesheet.entries = [];
    const period = {
      ...emptyBillingPeriod(clientId, month, year),
      timesheetId: timesheet.id
    };
    addActivity(activity(`Created billing period ${periodTitle(period)}`, 'created', period.id));
    replaceWorkspace(
      { ...workspace, timesheets: [timesheet, ...workspace.timesheets], billingPeriods: [period, ...workspace.billingPeriods] },
      'Billing period created'
    );
    selectedPeriodId = period.id;
    switchView('billing');
  }

  function createNextMonth(period: BillingPeriod) {
    const next = nextMonth(period.month, period.year);
    createBillingPeriod(period.clientId, next.month, next.year);
  }

  function addEntry(period: BillingPeriod) {
    const timesheet = periodTimesheet(period);
    if (!timesheet) return;
    const entry = emptyTimesheetEntry();
    entry.description = `${monthName(period.month)} work`;
    timesheet.entries = [...timesheet.entries, entry];
    addActivity(activity(`Added entry to ${periodTitle(period)}`, 'updated', period.id));
    touch('Entry added');
  }

  function removeEntry(period: BillingPeriod, entryId: string) {
    const timesheet = periodTimesheet(period);
    if (!timesheet) return;
    timesheet.entries = timesheet.entries.filter((entry) => entry.id !== entryId);
    addActivity(activity(`Removed entry from ${periodTitle(period)}`, 'updated', period.id));
    touch('Entry removed');
  }

  function generateInvoiceForPeriod(period: BillingPeriod) {
    const timesheet = periodTimesheet(period);
    if (!timesheet) return;
    const defaults = clientDefaults(workspace.clients.find((client) => client.id === period.clientId), workspace);
    const invoice =
      periodInvoice(period) ??
      invoiceFromTimesheet(timesheet, nextInvoiceNumber(workspace.invoices), defaults.paymentTermsDays, defaults.invoiceTemplate);
    if (!period.invoiceId) {
      period.invoiceId = invoice.id;
      workspace.invoices = [invoice, ...workspace.invoices];
    }
    period.status = invoice.status === 'paid' ? 'paid' : 'invoiced';
    addActivity(activity(`Generated Invoice ${invoice.invoiceNumber}`, 'invoice', period.id));
    touch('Invoice generated');
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
    addActivity(activity(`Generated PDF for ${periodTitle(period)}`, 'pdf', period.id));
    touch('PDF generated');
  }

  function markPaid(period: BillingPeriod) {
    const invoice = periodInvoice(period);
    if (invoice) invoice.status = 'paid';
    period.status = 'paid';
    addActivity(activity(`Marked ${periodTitle(period)} as paid`, 'payment', period.id));
    touch('Marked paid');
  }

  function archivePeriod(period: BillingPeriod, archived = true) {
    period.archived = archived;
    period.status = archived ? 'archived' : periodInvoice(period) ? 'invoiced' : 'active';
    const timesheet = periodTimesheet(period);
    const invoice = periodInvoice(period);
    if (timesheet) timesheet.archived = archived;
    if (invoice) invoice.archived = archived;
    addActivity(activity(`${archived ? 'Archived' : 'Restored'} ${periodTitle(period)}`, 'archive', period.id));
    touch(archived ? 'Billing period archived' : 'Billing period restored');
  }

  function addClient() {
    const client = emptyClient();
    replaceWorkspace({ ...workspace, clients: [client, ...workspace.clients] }, 'Client created');
    selectedClientId = client.id;
  }

  function deleteClient(client: Client) {
    if (!confirm(`Delete ${client.name || 'this client'}? Billing periods keep their client id.`)) return;
    replaceWorkspace({ ...workspace, clients: workspace.clients.filter((item) => item.id !== client.id) }, 'Client deleted');
    selectedClientId = workspace.clients.find((item) => item.id !== client.id)?.id ?? '';
  }

  async function importWorkspace(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const imported = normalizeWorkspace(JSON.parse(text));
      workspace = imported;
      addActivity(activity('Imported workspace', 'import'));
      selectedPeriodId = workspace.billingPeriods[0]?.id ?? '';
      selectedClientId = workspace.clients[0]?.id ?? '';
      touch('Workspace imported');
    } catch (error) {
      message = error instanceof Error ? error.message : 'Could not import workspace.';
    } finally {
      input.value = '';
    }
  }

  function exportWorkspace() {
    addActivity(activity('Exported workspace', 'export'));
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
    selectedPeriodId = workspace.billingPeriods[0]?.id ?? '';
    selectedClientId = workspace.clients[0]?.id ?? '';
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

  function pdfDate(value: string | undefined) {
    return value ? formatDateTime(value) : 'Never';
  }

  function buildSearchResults(query: string) {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    const periodResults = workspace.billingPeriods
      .filter((period) => periodTitle(period).toLowerCase().includes(needle))
      .map((item) => ({ type: 'Billing Period', label: periodTitle(item), detail: invoiceStatus(item), id: item.id }));
    const clientResults = workspace.clients
      .filter((client) => client.name.toLowerCase().includes(needle))
      .map((item) => ({ type: 'Client', label: item.name || 'Untitled client', detail: item.email, id: item.id }));
    const invoiceResults = workspace.invoices
      .filter((invoice) => invoice.invoiceNumber.toLowerCase().includes(needle))
      .map((item) => ({ type: 'Invoice', label: item.invoiceNumber, detail: clientName(workspace.clients, item.clientId), id: item.id }));
    return [...periodResults, ...clientResults, ...invoiceResults].slice(0, 8);
  }

  function openSearchResult(result: { type: string; id: string }) {
    searchQuery = '';
    if (result.type === 'Client') {
      selectedClientId = result.id;
      switchView('clients');
    } else if (result.type === 'Billing Period') {
      selectedPeriodId = result.id;
      switchView('billing');
    } else {
      const period = workspace.billingPeriods.find((item) => item.invoiceId === result.id);
      if (period) {
        selectedPeriodId = period.id;
        switchView('billing');
      } else {
        switchView('records');
      }
    }
  }
</script>

<svelte:head>
  <title>Axora</title>
  <meta name="description" content="Axora is a local-first monthly paperwork workspace for independent contractors." />
</svelte:head>

<div class="app-shell">
  <aside class="sidebar">
    <div class="brand">
      <FileText size={26} />
      <div>
        <strong>Axora</strong>
        <span>Monthly paperwork</span>
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
          <input bind:value={searchQuery} placeholder="Search monthly work, clients, invoices" />
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
        <button class="secondary" onclick={() => fileInput.click()} title="Import Workspace"><Upload size={17} /><span>Import</span></button>
        <button class="secondary" onclick={exportWorkspace} title="Export Workspace"><Download size={17} /><span>Export</span></button>
        <input class="clear-input" bind:value={clearConfirmText} placeholder="Type DELETE" aria-label="Type DELETE to clear data" />
        <button class="danger" onclick={clearLocal} title="Clear Local Data"><Trash2 size={17} /><span>Clear</span></button>
      </div>
    </header>

    {#if message}
      <div class="notice">{message}</div>
    {/if}

    {#if activeView === 'dashboard'}
      <section class="hero-band">
        <div>
          <span>Current Month</span>
          <h2>{monthName(new Date().getMonth() + 1)} {new Date().getFullYear()}</h2>
        </div>
        <button onclick={() => createBillingPeriod()}><Plus size={16} /> New Billing Period</button>
      </section>
      <section class="period-grid">
        {#each currentMonthPeriods as item}
          <article class="period-card">
            <div>
              <h3>{item.client.name || 'Untitled client'}</h3>
              <small>{item.period ? invoiceStatus(item.period) : 'No period yet'}</small>
            </div>
            <div class="period-metrics">
              <strong>{item.period ? formatHours(periodHours(item.period)) : '0.00h'}</strong>
              <b>{item.period ? formatMoney(periodValue(item.period), periodCurrency(item.period)) : formatMoney(0, item.client.defaultCurrency)}</b>
            </div>
            <div class="actions">
              {#if item.period}
                <button onclick={() => { selectedPeriodId = item.period!.id; switchView('billing'); }}>Open</button>
                <button class="secondary" onclick={() => generateInvoiceForPeriod(item.period!)}><ReceiptText size={16} /> Invoice</button>
              {:else}
                <button onclick={() => createBillingPeriod(item.client.id)}>Start month</button>
              {/if}
            </div>
          </article>
        {/each}
      </section>
      <section class="split">
        <div>
          <div class="section-title"><h2>Recent activity</h2><History size={18} /></div>
          <div class="activity-list">
            {#each recentActivity as event}
              <div class="activity-item"><strong>{event.message}</strong><small>{formatDateTime(event.at)}</small></div>
            {/each}
          </div>
        </div>
        <div>
          <div class="section-title"><h2>Outstanding invoices</h2><strong>{formatMoney(totalOutstanding, workspace.settings.currency)}</strong></div>
          <div class="list">
            {#each outstandingInvoices.slice(0, 5) as invoice}
              <button class="row" onclick={() => openSearchResult({ type: 'Invoice', id: invoice.id })}>
                <span><strong>{invoice.invoiceNumber}</strong><small>{clientName(workspace.clients, invoice.clientId)} · due {invoice.dueDate}</small></span>
                <b>{formatMoney(invoiceTotal(invoice), invoice.currency)}</b>
              </button>
            {/each}
          </div>
        </div>
      </section>
    {:else if activeView === 'billing'}
      <section class="billing-layout">
        <div class="list-panel">
          <div class="section-title">
            <h2>Billing Periods</h2>
            <div class="actions">
              <label class="inline-check"><input type="checkbox" bind:checked={showArchivedPeriods} /> Archived</label>
              <button onclick={() => createBillingPeriod()}><Plus size={16} /> New</button>
            </div>
          </div>
          <div class="period-list">
            {#each activePeriods as period}
              <button class="period-row" class:active={selectedPeriodId === period.id} onclick={() => (selectedPeriodId = period.id)}>
                <span><strong>{periodTitle(period)}</strong><small>Invoice: {invoiceStatus(period)}</small></span>
                <b>{formatHours(periodHours(period))}</b>
              </button>
            {/each}
          </div>
        </div>

        <div class="editor period-detail">
          {#if selectedPeriod && selectedTimesheet}
            <div class="record-header">
              <div>
                <h2>{periodTitle(selectedPeriod)}</h2>
                <p>{selectedPeriod.status} · Invoice: {invoiceStatus(selectedPeriod)}</p>
                <div class="record-meta">
                  <span>{formatHours(periodHours(selectedPeriod))}</span>
                  <span>{formatMoney(periodValue(selectedPeriod), periodCurrency(selectedPeriod))}</span>
                  <span>{selectedTimesheet.currency} · {formatMoney(selectedTimesheet.hourlyRate, selectedTimesheet.currency)}/h</span>
                </div>
              </div>
              <div class="actions">
                <button onclick={() => generateInvoiceForPeriod(selectedPeriod)}><ReceiptText size={16} /> Generate Invoice</button>
                <button class="secondary" onclick={() => generatePeriodPdf(selectedPeriod)}><Download size={16} /> PDF</button>
                <button class="secondary" onclick={() => createNextMonth(selectedPeriod)}><Copy size={16} /> Create Next Month</button>
                <button class="secondary" onclick={() => archivePeriod(selectedPeriod, !selectedPeriod.archived)}>
                  {#if selectedPeriod.archived}<RotateCcw size={16} /> Restore{:else}<Archive size={16} /> Archive{/if}
                </button>
                <button class="secondary" onclick={() => markPaid(selectedPeriod)}><CheckCircle2 size={16} /> Paid</button>
              </div>
            </div>

            <section class="workflow-section">
              <div class="section-title">
                <h3>Timesheet Entries</h3>
                <button onclick={() => addEntry(selectedPeriod)}><Plus size={16} /> Add Hours</button>
              </div>
              <div class="entry-list" oninput={() => touch('Hours saved')}>
                {#each selectedTimesheet.entries as entry}
                  <div class="entry-grid simple">
                    <label>Date <input type="date" bind:value={entry.date} /></label>
                    <label>Hours <input type="number" min="0" step="0.25" bind:value={entry.hours} /></label>
                    <label class="check"><input type="checkbox" bind:checked={entry.billable} onchange={() => touch('Hours saved')} /> Billable</label>
                    <label class="description">Description <input bind:value={entry.description} /></label>
                    <span class="duration">{formatHours(Number(entry.hours || 0) * 60)}</span>
                    <button class="icon danger-icon" onclick={() => removeEntry(selectedPeriod, entry.id)} title="Remove entry"><Trash2 size={16} /></button>
                  </div>
                {/each}
              </div>
            </section>

            <section class="workflow-section">
              <div class="section-title"><h3>Invoice</h3>{#if selectedInvoice}<i class="status">{selectedInvoice.status}</i>{/if}</div>
              {#if selectedInvoice}
                <div class="invoice-summary">
                  <strong>{selectedInvoice.invoiceNumber}</strong>
                  <span>Issue {selectedInvoice.issueDate} · Due {selectedInvoice.dueDate}</span>
                  <b>{formatMoney(invoiceTotal(selectedInvoice), selectedInvoice.currency)}</b>
                </div>
                <div class="entry-list" oninput={() => touch('Invoice saved')}>
                  {#each selectedInvoice.items as item}
                    <div class="item-grid">
                      <label>Description <input bind:value={item.description} /></label>
                      <label>Quantity <input type="number" min="0" step="0.01" bind:value={item.quantity} /></label>
                      <label>Unit price <input type="number" min="0" step="0.01" bind:value={item.unitPrice} /></label>
                      <span class="duration">{formatMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0), selectedInvoice.currency)}</span>
                      <button class="icon danger-icon" onclick={() => { selectedInvoice.items = selectedInvoice.items.filter((row) => row.id !== item.id); touch('Item removed'); }} title="Remove item"><Trash2 size={16} /></button>
                    </div>
                  {/each}
                  <button class="secondary" onclick={() => { selectedInvoice.items = [...selectedInvoice.items, emptyInvoiceItem()]; touch('Item added'); }}><Plus size={16} /> Add Invoice Item</button>
                </div>
              {:else}
                <div class="empty-state"><button onclick={() => generateInvoiceForPeriod(selectedPeriod)}><ReceiptText size={16} /> Generate invoice from hours</button></div>
              {/if}
            </section>

            <section class="workflow-section">
              <div class="section-title"><h3>Generated PDFs</h3><button class="secondary" onclick={() => generatePeriodPdf(selectedPeriod)}><Download size={16} /> Regenerate</button></div>
              <div class="pdf-grid">
                <div><strong>Timesheet PDF</strong><span>{pdfDate(selectedTimesheet.lastPdfGeneratedAt)}</span></div>
                <div><strong>Invoice PDF</strong><span>{pdfDate(selectedInvoice?.lastPdfGeneratedAt)}</span></div>
              </div>
            </section>

            <section class="workflow-section">
              <h3>Notes</h3>
              <textarea rows="4" bind:value={selectedPeriod.notes} oninput={() => touch('Notes saved')}></textarea>
            </section>

            <section class="workflow-section">
              <div class="section-title"><h3>History</h3><History size={18} /></div>
              <div class="activity-list">
                {#each periodHistory as event}
                  <div class="activity-item"><strong>{event.message}</strong><small>{formatDateTime(event.at)}</small></div>
                {/each}
              </div>
            </section>
          {:else}
            <div class="empty-state">Create a billing period to start this month’s paperwork.</div>
          {/if}
        </div>
      </section>
    {:else if activeView === 'clients'}
      <section class="work-area">
        <div class="list-panel">
          <div class="section-title"><h2>Clients</h2><button onclick={addClient}><Plus size={16} /> New</button></div>
          <div class="list">
            {#each workspace.clients as client}
              <button class="row" class:active={selectedClientId === client.id} onclick={() => (selectedClientId = client.id)}>
                <span><strong>{client.name || 'Untitled client'}</strong><small>{client.email || client.contactName || 'No contact details'}</small></span>
              </button>
            {/each}
          </div>
        </div>
        <div class="editor">
          {#if selectedClient}
            <div class="editor-head"><h2>{selectedClient.name || 'New client'}</h2><button class="danger" onclick={() => deleteClient(selectedClient)}><Trash2 size={16} /> Delete</button></div>
            <div class="form-grid" oninput={() => touch('Client saved')}>
              <label>Name <input bind:value={selectedClient.name} /></label>
              <label>Contact name <input bind:value={selectedClient.contactName} /></label>
              <label>Email <input type="email" bind:value={selectedClient.email} /></label>
              <label>Phone <input bind:value={selectedClient.phone} /></label>
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
          {/if}
        </div>
      </section>
    {:else if activeView === 'records'}
      <section class="split">
        <div>
          <div class="section-title"><h2>Timesheets</h2><small>Internal records</small></div>
          <div class="list">
            {#each workspace.timesheets.slice(0, 8) as timesheet}
              <div class="record-card"><strong>{timesheet.title}</strong><span>{clientName(workspace.clients, timesheet.clientId)} · {formatHours(billableMinutes(timesheet))}</span></div>
            {/each}
          </div>
        </div>
        <div>
          <div class="section-title"><h2>Invoices</h2><small>Internal records</small></div>
          <div class="list">
            {#each workspace.invoices.slice(0, 8) as invoice}
              <div class="record-card"><strong>{invoice.invoiceNumber}</strong><span>{clientName(workspace.clients, invoice.clientId)} · {invoice.status}</span><b>{formatMoney(invoiceTotal(invoice), invoice.currency)}</b></div>
            {/each}
          </div>
        </div>
      </section>
    {:else if activeView === 'settings'}
      <section class="editor full">
        <div class="editor-head"><h2>Profile and defaults</h2></div>
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
          <label>Payment terms days <input type="number" min="0" bind:value={workspace.profile.paymentTermsDays} /></label>
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
