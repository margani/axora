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
    MoreHorizontal,
    Plus,
    ReceiptText,
    Search,
    Settings,
    Trash2,
    Upload
  } from '@lucide/svelte';
  import type { ActivityEvent, BillingPeriod, Client, Invoice, TimesheetEntry, Workspace } from '$lib/types';
  import { generateInvoicePdf, generateTimesheetPdf } from '$lib/pdf';
  import {
    activity,
    addDays,
    billableMinutes,
    calculateTimeEntryMinutes,
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
    syncEntryDurationFromTime,
    entryMinutes,
    timesheetTotal,
    todayIso
  } from '$lib/workspace';

  type View = 'dashboard' | 'clients' | 'settings' | 'timesheetDetail' | 'invoiceDetail';
  type ClientTab = 'overview' | 'timesheets' | 'invoices' | 'notes' | 'settings';
  type SortOrder = 'newest' | 'oldest';
  type DetailMenu = '' | 'timesheet' | 'invoice';

  let workspace: Workspace = sampleWorkspace();
  let activeView: View = 'dashboard';
  let selectedClientId = '';
  let selectedPeriodId = '';
  let selectedInvoiceId = '';
  let lastSaved = '';
  let saveStatus: 'saved' | 'saving' | 'unsaved' | 'error' = 'saved';
  let ready = false;
  let message = '';
  let searchQuery = '';
  let clientTab: ClientTab = 'overview';
  let timesheetSearch = '';
  let invoiceSearch = '';
  let timesheetFilter = 'active';
  let invoiceFilter = 'active';
  let timesheetSort: SortOrder = 'newest';
  let invoiceSort: SortOrder = 'newest';
  let activityOpen = false;
  let openDetailMenu: DetailMenu = '';
  let clearConfirmOpen = false;
  let editingEntryId = '';
  let entryDraft: TimesheetEntry | undefined;
  let entryDraftOriginal: TimesheetEntry | undefined;
  let entryDraftIsNew = false;
  let saveTimer: ReturnType<typeof setTimeout>;
  let toastTimer: ReturnType<typeof setTimeout>;
  let fileInput: HTMLInputElement;
  let logoInput: HTMLInputElement;

  $: selectedClient = workspace.clients.find((client) => client.id === selectedClientId);
  $: selectedClientPeriods = selectedClient ? clientPeriods(selectedClient.id) : [];
  $: selectedPeriod = selectedClientPeriods.find((period) => period.id === selectedPeriodId) ?? selectedClientPeriods[0];
  $: selectedTimesheet = selectedPeriod ? periodTimesheet(selectedPeriod) : undefined;
  $: selectedInvoice = selectedInvoiceId ? workspace.invoices.find((invoice) => invoice.id === selectedInvoiceId) : selectedPeriod ? periodInvoice(selectedPeriod) : undefined;
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
  $: allClientActivity = selectedClient ? activityForClient(selectedClient.id) : [];
  $: clientActivity = allClientActivity.slice(0, 3);
  $: filteredClientPeriods = selectedClient ? filteredPeriods(selectedClient.id) : [];
  $: filteredClientInvoices = selectedClient ? filteredInvoices(selectedClient.id) : [];
  $: searchResults = buildSearchResults(searchQuery);
  $: effectiveSaveStatus = saveStatus === 'saved' && !lastSaved ? 'unsaved' : saveStatus;
  $: selectedEntryExists = Boolean(editingEntryId && selectedTimesheet?.entries.some((entry) => entry.id === editingEntryId));
  $: if (editingEntryId && !selectedEntryExists && !entryDraftIsNew) closeEntryEditor(false);

  const viewPaths: Record<'dashboard' | 'clients' | 'settings', string> = {
    dashboard: '/',
    clients: '/clients',
    settings: '/settings'
  };

  function viewFromPath(pathname: string): View {
    const parts = pathname.split('/').filter(Boolean);
    if (parts[0] === 'clients' && parts[1]) {
      const client = workspace.clients.find((item) => slugify(item.name || item.id) === parts[1] || item.id === parts[1]);
      if (client) {
        selectedClientId = client.id;
        if (parts[2] === 'timesheets' && parts[3]) {
          const period = clientPeriods(client.id).find((item) => periodSlug(item) === parts[3] || item.id === parts[3]);
          selectedPeriodId = period?.id ?? clientPeriods(client.id)[0]?.id ?? '';
          return 'timesheetDetail';
        }
        if (parts[2] === 'invoices' && parts[3]) {
          const invoice = clientInvoices(client.id).find((item) => invoiceSlug(item) === parts[3] || item.id === parts[3]);
          selectedInvoiceId = invoice?.id ?? '';
          selectedPeriodId = workspace.billingPeriods.find((period) => period.invoiceId === invoice?.id)?.id ?? clientPeriods(client.id)[0]?.id ?? '';
          return 'invoiceDetail';
        }
        selectedInvoiceId = '';
        selectedPeriodId = clientPeriods(client.id)[0]?.id ?? '';
        return 'clients';
      }
    }
    const found = Object.entries(viewPaths).find(([, path]) => path === pathname);
    return (found?.[0] as View | undefined) ?? 'dashboard';
  }

  onMount(() => {
    const loaded = loadWorkspace();
    workspace = loaded.workspace;
    lastSaved = loaded.savedAt;
    saveStatus = loaded.savedAt ? 'saved' : 'unsaved';
    selectedClientId = workspace.clients[0]?.id ?? '';
    selectedPeriodId = clientPeriods(selectedClientId)[0]?.id ?? '';
    activeView = viewFromPath(window.location.pathname);
    ready = true;
    const onPopState = () => {
      activeView = viewFromPath(window.location.pathname);
      openDetailMenu = '';
      closeEntryEditor(false);
      clearToast();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') openDetailMenu = '';
      if (event.key === 'Escape') clearConfirmOpen = false;
      if (event.key === 'Escape' && entryDraft) closeEntryEditor();
    };
    const onDocumentClick = (event: MouseEvent) => {
      if (event.target instanceof Element && event.target.closest('[data-detail-more]')) return;
      openDetailMenu = '';
    };
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('click', onDocumentClick);
    return () => {
      window.removeEventListener('popstate', onPopState);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('click', onDocumentClick);
      clearTimeout(toastTimer);
    };
  });

  function touch(note = 'Saved locally') {
    if (!ready) return;
    saveStatus = 'unsaved';
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveStatus = 'saving';
      try {
        lastSaved = saveWorkspace(workspace);
        saveStatus = 'saved';
      } catch (error) {
        saveStatus = 'error';
        showToast(error instanceof Error ? error.message : 'Could not save workspace.');
      }
    }, 250);
  }

  function showToast(note: string) {
    message = note;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      message = '';
    }, 3200);
  }

  function clearToast() {
    clearTimeout(toastTimer);
    message = '';
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
    clearToast();
    const path = view === 'timesheetDetail' || view === 'invoiceDetail' ? window.location.pathname : viewPaths[view];
    if (push && window.location.pathname !== path) history.pushState({}, '', path);
  }

  function openClient(clientId: string) {
    selectedClientId = clientId;
    selectedPeriodId = clientPeriods(clientId)[0]?.id ?? '';
    selectedInvoiceId = '';
    clientTab = 'overview';
    activeView = 'clients';
    const client = workspace.clients.find((item) => item.id === clientId);
    const path = client ? `/clients/${slugify(client.name || client.id)}` : '/clients';
    if (window.location.pathname !== path) history.pushState({}, '', path);
    clearToast();
  }

  function slugify(value: string) {
    return (
      value
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'item'
    );
  }

  function clientPeriods(clientId: string) {
    return workspace.billingPeriods
      .filter((period) => period.clientId === clientId)
      .sort((a, b) => b.year - a.year || b.month - a.month);
  }

  function clientInvoices(clientId: string) {
    return workspace.invoices.filter((invoice) => invoice.clientId === clientId);
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

  function periodSlug(period: BillingPeriod) {
    return slugify(periodTitle(period));
  }

  function invoiceSlug(invoice: Invoice) {
    return slugify(invoice.invoiceNumber || invoice.id);
  }

  function clientPath(client: Client) {
    return `/clients/${slugify(client.name || client.id)}`;
  }

  function timesheetPath(period: BillingPeriod) {
    const client = workspace.clients.find((item) => item.id === period.clientId);
    return `${client ? clientPath(client) : '/clients/client'}/timesheets/${periodSlug(period)}`;
  }

  function invoicePath(invoice: Invoice) {
    const client = workspace.clients.find((item) => item.id === invoice.clientId);
    return `${client ? clientPath(client) : '/clients/client'}/invoices/${invoiceSlug(invoice)}`;
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
    const latest = clientPeriods(client.id).filter((period) => !period.archived)[0];
    const next = latest ? nextMonth(latest.month, latest.year) : { month: new Date().getMonth() + 1, year: new Date().getFullYear() };
    createTimesheetForClient(client, next.month, next.year);
  }

  function duplicateTimesheetPeriod(period: BillingPeriod) {
    const next = nextMonth(period.month, period.year);
    const client = workspace.clients.find((item) => item.id === period.clientId);
    if (!client) return;
    createTimesheetForClient(client, next.month, next.year);
  }

  function openPeriod(period: BillingPeriod) {
    selectedClientId = period.clientId;
    selectedPeriodId = period.id;
    selectedInvoiceId = '';
    clientTab = 'timesheets';
    activeView = 'timesheetDetail';
    const path = timesheetPath(period);
    if (window.location.pathname !== path) history.pushState({}, '', path);
    clearToast();
  }

  function openInvoice(invoice: Invoice) {
    selectedClientId = invoice.clientId;
    selectedInvoiceId = invoice.id;
    selectedPeriodId = workspace.billingPeriods.find((period) => period.invoiceId === invoice.id)?.id ?? selectedPeriodId;
    clientTab = 'invoices';
    activeView = 'invoiceDetail';
    const path = invoicePath(invoice);
    if (window.location.pathname !== path) history.pushState({}, '', path);
    clearToast();
  }

  function backToClientTab(client: Client, tab: ClientTab) {
    selectedClientId = client.id;
    selectedInvoiceId = '';
    clientTab = tab;
    activeView = 'clients';
    openDetailMenu = '';
    const path = clientPath(client);
    if (window.location.pathname !== path) history.pushState({}, '', path);
    clearToast();
  }

  function toggleDetailMenu(menu: DetailMenu) {
    openDetailMenu = openDetailMenu === menu ? '' : menu;
  }

  function closeDetailMenu() {
    openDetailMenu = '';
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
    showToast('Invoice generated');
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
    showToast('Invoice duplicated');
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
    showToast('PDF generated');
  }

  function generateInvoicePdfOnly(invoice: Invoice) {
    generateInvoicePdf(workspace, invoice);
    invoice.lastPdfGeneratedAt = new Date().toISOString();
    addActivity(activity(`Generated PDF for ${invoice.invoiceNumber}`, 'pdf'));
    touch('Invoice PDF generated');
    showToast('Invoice PDF generated');
  }

  function markInvoicePaid(invoice: Invoice) {
    invoice.status = 'paid';
    const period = workspace.billingPeriods.find((item) => item.invoiceId === invoice.id);
    if (period) period.status = 'paid';
    addActivity(activity(`Marked Invoice ${invoice.invoiceNumber} paid`, 'payment', period?.id));
    touch('Invoice marked paid');
    showToast('Invoice marked paid');
  }

  function archiveInvoiceForClient(invoice: Invoice, archived = true) {
    invoice.archived = archived;
    const period = workspace.billingPeriods.find((item) => item.invoiceId === invoice.id);
    if (period) period.archived = archived;
    addActivity(activity(`${archived ? 'Archived' : 'Restored'} Invoice ${invoice.invoiceNumber}`, 'archive', period?.id));
    touch(archived ? 'Invoice archived' : 'Invoice restored');
    showToast(archived ? 'Invoice archived' : 'Invoice restored');
  }

  function archivePeriod(period: BillingPeriod, archived = true) {
    period.archived = archived;
    const timesheet = periodTimesheet(period);
    if (timesheet) timesheet.archived = archived;
    addActivity(activity(`${archived ? 'Archived' : 'Restored'} ${clientName(workspace.clients, period.clientId)} ${periodTitle(period)}`, 'archive', period.id));
    touch(archived ? 'Timesheet archived' : 'Timesheet restored');
    showToast(archived ? 'Timesheet archived' : 'Timesheet restored');
  }

  function addEntry(period: BillingPeriod) {
    const timesheet = periodTimesheet(period);
    if (!timesheet) return;
    const entry = emptyTimesheetEntry();
    entry.date = `${period.year}-${String(period.month).padStart(2, '0')}-01`;
    entry.description = workspace.clients.find((client) => client.id === period.clientId)?.defaultServiceDescription || `${monthName(period.month)} work`;
    openEntryEditor(entry, true);
  }

  function cloneEntry(entry: TimesheetEntry): TimesheetEntry {
    return { ...entry };
  }

  function replaceTimesheetEntries(timesheetId: string, entries: TimesheetEntry[]) {
    workspace = {
      ...workspace,
      timesheets: workspace.timesheets.map((timesheet) =>
        timesheet.id === timesheetId ? { ...timesheet, entries: entries.map(cloneEntry) } : timesheet
      )
    };
  }

  function entryDraftChanged() {
    return Boolean(entryDraft && JSON.stringify(entryDraft) !== JSON.stringify(entryDraftOriginal));
  }

  function openEntryEditor(entry: TimesheetEntry, isNew = false) {
    if (entryDraftChanged() && !confirm('Discard unsaved entry changes?')) return;
    entryDraft = cloneEntry(entry);
    entryDraftOriginal = cloneEntry(entry);
    entryDraftIsNew = isNew;
    editingEntryId = isNew ? '' : entry.id;
  }

  function closeEntryEditor(confirmUnsaved = true) {
    if (confirmUnsaved && entryDraftChanged() && !confirm('Discard unsaved entry changes?')) return;
    entryDraft = undefined;
    entryDraftOriginal = undefined;
    entryDraftIsNew = false;
    editingEntryId = '';
  }

  function saveEntryDraft(period: BillingPeriod) {
    const timesheet = periodTimesheet(period);
    if (!timesheet || !entryDraft) return;
    const error = timeEntryError(entryDraft);
    if (error) {
      showToast(error);
      return;
    }
    const wasNew = entryDraftIsNew;
    const nextEntry = cloneEntry(entryDraft);
    const nextEntries = wasNew
      ? [...timesheet.entries, nextEntry]
      : timesheet.entries.map((entry) => (entry.id === nextEntry.id ? nextEntry : entry));
    if (wasNew) {
      addActivity(activity(`Added hours to ${clientName(workspace.clients, period.clientId)} ${periodTitle(period)}`, 'updated', period.id));
    }
    replaceTimesheetEntries(timesheet.id, nextEntries);
    editingEntryId = entryDraft.id;
    entryDraftOriginal = cloneEntry(entryDraft);
    entryDraftIsNew = false;
    touch('Timesheet saved');
    showToast(wasNew ? 'Entry added' : 'Entry saved');
    closeEntryEditor(false);
  }

  function removeEntry(period: BillingPeriod, entryId: string, confirmDelete = true) {
    const timesheet = periodTimesheet(period);
    if (!timesheet) return;
    if (confirmDelete && !confirm('Delete this entry?')) return;
    replaceTimesheetEntries(timesheet.id, timesheet.entries.filter((entry) => entry.id !== entryId));
    if (editingEntryId === entryId || entryDraft?.id === entryId) closeEntryEditor(false);
    touch('Entry removed');
    showToast('Entry removed');
  }

  function deleteTimesheetPeriod(period: BillingPeriod) {
    const client = workspace.clients.find((item) => item.id === period.clientId);
    const timesheet = periodTimesheet(period);
    if (!client || !timesheet) return;
    if (!confirm(`Delete ${periodTitle(period)} timesheet?`)) return;
    workspace = {
      ...workspace,
      timesheets: workspace.timesheets.filter((item) => item.id !== timesheet.id),
      billingPeriods: workspace.billingPeriods.filter((item) => item.id !== period.id)
    };
    addActivity(activity(`Deleted ${periodTitle(period)} timesheet for ${client.name || 'client'}`, 'updated'));
    backToClientTab(client, 'timesheets');
    touch('Timesheet deleted');
    showToast('Timesheet deleted');
  }

  function deleteInvoiceForClient(invoice: Invoice) {
    const client = workspace.clients.find((item) => item.id === invoice.clientId);
    if (!client) return;
    if (!confirm(`Delete Invoice ${invoice.invoiceNumber}?`)) return;
    workspace = {
      ...workspace,
      invoices: workspace.invoices.filter((item) => item.id !== invoice.id),
      billingPeriods: workspace.billingPeriods
        .map((period) => (period.invoiceId === invoice.id ? { ...period, invoiceId: '' } : period))
        .filter((period) => period.timesheetId || period.invoiceId)
    };
    addActivity(activity(`Deleted Invoice ${invoice.invoiceNumber}`, 'updated'));
    backToClientTab(client, 'invoices');
    touch('Invoice deleted');
    showToast('Invoice deleted');
  }

  function eventValue(event: Event) {
    return (event.currentTarget as HTMLInputElement).value;
  }

  function eventNumber(event: Event) {
    return Number((event.currentTarget as HTMLInputElement).value || 0);
  }

  function setDraftTimeMode(useTime: boolean) {
    if (!entryDraft) return;
    entryDraft.timeTrackingMode = useTime ? 'time' : 'duration';
    if (useTime && !timeEntryError(entryDraft)) syncEntryDurationFromTime(entryDraft);
    entryDraft = cloneEntry(entryDraft);
  }

  function updateDraftHours(hours: number) {
    if (!entryDraft) return;
    entryDraft.hours = hours;
    entryDraft = cloneEntry(entryDraft);
  }

  function updateDraftTiming(field: 'startTime' | 'endTime' | 'breakMinutes', value: string | number) {
    if (!entryDraft) return;
    if (field === 'breakMinutes') entryDraft.breakMinutes = Number(value || 0);
    else entryDraft[field] = String(value);
    if (!timeEntryError(entryDraft)) syncEntryDurationFromTime(entryDraft);
    entryDraft = cloneEntry(entryDraft);
  }

  function timeValue(value: string) {
    const [hour, minute] = value.split(':').map(Number);
    return Number.isFinite(hour) && Number.isFinite(minute) ? hour * 60 + minute : Number.NaN;
  }

  function timeEntryError(entry: TimesheetEntry) {
    if (entry.timeTrackingMode !== 'time') return '';
    const start = timeValue(entry.startTime);
    const end = timeValue(entry.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return 'Enter a start and end time.';
    if (end <= start) return 'End time must be after start time.';
    if (Number(entry.breakMinutes || 0) < 0) return 'Break minutes cannot be negative.';
    if (calculateTimeEntryMinutes(entry) <= 0) return 'Break minutes cannot make the duration zero or negative.';
    return '';
  }

  function calculatedEntryDuration(entry: TimesheetEntry) {
    const minutes = calculateTimeEntryMinutes(entry);
    return minutes > 0 ? formatHours(minutes) : '0.00h';
  }

  function entryDurationSummary(entry: TimesheetEntry) {
    const duration = formatHours(entryMinutes(entry));
    return entry.timeTrackingMode === 'time' && entry.startTime && entry.endTime ? `${entry.startTime}–${entry.endTime} · ${duration}` : duration;
  }

  function entryModeLabel(entry: TimesheetEntry) {
    return entry.timeTrackingMode === 'time' ? 'Time' : 'Hours';
  }

  function entryAmount(entry: TimesheetEntry) {
    return selectedTimesheet && entry.billable ? formatMoney((entryMinutes(entry) / 60) * selectedTimesheet.hourlyRate, selectedTimesheet.currency) : '—';
  }

  function entryDateLabel(date: string) {
    const value = new Date(`${date}T12:00:00`);
    return Number.isNaN(value.getTime()) ? date : value.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  function entryDayLabel(date: string) {
    const value = new Date(`${date}T12:00:00`);
    return Number.isNaN(value.getTime()) ? '' : value.toLocaleDateString('en-GB', { weekday: 'short' });
  }

  function updateClientNotes(client: Client) {
    client.notesUpdatedAt = new Date().toISOString();
    touch('Client notes saved');
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
      showToast(error instanceof Error ? error.message : 'Could not import workspace.');
    } finally {
      input.value = '';
    }
  }

  function exportWorkspace() {
    addActivity(activity('Exported Workspace', 'export'));
    lastSaved = saveWorkspace(workspace);
    saveStatus = 'saved';
    downloadJson(workspace);
    showToast('Workspace exported');
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
    clearWorkspace();
    workspace = sampleWorkspace();
    selectedClientId = workspace.clients[0]?.id ?? '';
    selectedPeriodId = clientPeriods(selectedClientId)[0]?.id ?? '';
    lastSaved = '';
    saveStatus = 'unsaved';
    clearConfirmOpen = false;
    showToast('Local data cleared. Sample data is loaded but not saved.');
  }

  function savedLabel() {
    if (!lastSaved) return 'Not saved yet';
    if (Date.now() - new Date(lastSaved).getTime() < 60_000) return 'just now';
    return new Date(lastSaved).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function saveStatusLabel() {
    if (effectiveSaveStatus === 'saving') return 'Saving...';
    if (effectiveSaveStatus === 'unsaved') return '';
    if (effectiveSaveStatus === 'error') return 'Save failed';
    return 'Saved ✓';
  }

  function formatDateTime(value: string) {
    return new Date(value).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  }

  function templateLabel(value: string) {
    if (value === 'modern') return 'Modern';
    if (value === 'compact') return 'Compact';
    return 'Classic';
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

  function filteredPeriods(clientId: string) {
    const needle = timesheetSearch.trim().toLowerCase();
    return clientPeriods(clientId)
      .filter((period) => timesheetFilter === 'archived' || !period.archived)
      .filter((period) => `${periodTitle(period)} ${period.notes}`.toLowerCase().includes(needle))
      .sort((a, b) => (timesheetSort === 'newest' ? b.year - a.year || b.month - a.month : a.year - b.year || a.month - b.month));
  }

  function filteredInvoices(clientId: string) {
    const needle = invoiceSearch.trim().toLowerCase();
    return clientInvoices(clientId)
      .filter((invoice) => {
        if (invoiceFilter === 'archived') return invoice.archived;
        if (invoiceFilter === 'unpaid') return !invoice.archived && invoice.status !== 'paid' && invoice.status !== 'void';
        if (invoiceFilter === 'paid') return !invoice.archived && invoice.status === 'paid';
        return !invoice.archived;
      })
      .filter((invoice) => `${invoice.invoiceNumber} ${invoice.status} ${invoice.notes}`.toLowerCase().includes(needle))
      .sort((a, b) => (invoiceSort === 'newest' ? b.issueDate.localeCompare(a.issueDate) : a.issueDate.localeCompare(b.issueDate)));
  }

  function openSearchResult(result: { type: string; id: string }) {
    searchQuery = '';
    if (result.type === 'Client') {
      openClient(result.id);
    } else if (result.type === 'Timesheet') {
      const period = workspace.billingPeriods.find((item) => item.id === result.id);
      if (period) {
        openPeriod(period);
      }
    } else {
      const invoice = workspace.invoices.find((item) => item.id === result.id);
      if (invoice) openInvoice(invoice);
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
        <button class:active={activeView === 'clients' || activeView === 'timesheetDetail' || activeView === 'invoiceDetail'} onclick={() => switchView('clients')}>
          <BriefcaseBusiness size={18} />
          <span>Clients</span>
        </button>
        <div class="client-nav">
          {#each workspace.clients as client}
            <button class:active={(activeView === 'clients' || activeView === 'timesheetDetail' || activeView === 'invoiceDetail') && selectedClientId === client.id} onclick={() => openClient(client.id)}>
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
        <h1>
          {activeView === 'clients'
            ? selectedClient?.name || 'Clients'
            : activeView === 'timesheetDetail'
              ? selectedPeriod
                ? periodTitle(selectedPeriod)
                : 'Timesheet'
              : activeView === 'invoiceDetail'
                ? selectedInvoice?.invoiceNumber || 'Invoice'
                : activeView === 'dashboard'
                  ? 'Dashboard'
                  : 'Settings'}
        </h1>
        <p>
          Last saved: {savedLabel()}
          {#if saveStatusLabel()}
            <span class="save-status {effectiveSaveStatus}">{saveStatusLabel()}</span>
          {/if}
        </p>
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
        <button class="danger" onclick={() => (clearConfirmOpen = true)}><Trash2 size={17} /><span>Clear</span></button>
      </div>
    </header>

    {#if message}
      <div class="toast" role="status">
        <span>{message}</span>
        <button class="toast-close" aria-label="Dismiss notification" onclick={clearToast}>×</button>
      </div>
    {/if}

    {#if clearConfirmOpen}
      <div class="modal-backdrop">
        <div class="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="clear-title">
          <h2 id="clear-title">Clear all data?</h2>
          <p>This will remove the current workspace data from this browser. This action cannot be undone.</p>
          <div class="actions end">
            <button class="secondary" onclick={() => (clearConfirmOpen = false)}>Cancel</button>
            <button class="danger" onclick={clearLocal}><Trash2 size={16} /> Clear data</button>
          </div>
        </div>
      </div>
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
          <div class="client-summary">
            <div>
              <h2>{selectedClient.name || 'Untitled client'}</h2>
              <p>{selectedClient.email || selectedClient.contactName || 'Client workspace'}</p>
            </div>
            <div class="summary-metrics">
              <div><span>Outstanding</span><strong>{formatMoney(clientOutstanding(selectedClient.id), selectedClient.defaultCurrency)}</strong></div>
              <div><span>Revenue YTD</span><strong>{formatMoney(clientRevenueYtd(selectedClient.id), selectedClient.defaultCurrency)}</strong></div>
              <div><span>Hours YTD</span><strong>{formatHours(clientHoursYtd(selectedClient.id))}</strong></div>
            </div>
          </div>

          <div class="client-tabs" role="tablist" aria-label="Client sections">
            <button class:active={clientTab === 'overview'} onclick={() => (clientTab = 'overview')}>Overview</button>
            <button class:active={clientTab === 'timesheets'} onclick={() => (clientTab = 'timesheets')}>Timesheets</button>
            <button class:active={clientTab === 'invoices'} onclick={() => (clientTab = 'invoices')}>Invoices</button>
            <button class:active={clientTab === 'notes'} onclick={() => (clientTab = 'notes')}>Notes</button>
            <button class:active={clientTab === 'settings'} onclick={() => (clientTab = 'settings')}>Settings</button>
          </div>

          {#if clientTab === 'overview'}
            <section class="overview-grid">
              <div class="overview-panel">
                <div class="section-title">
                  <h2>Recent Timesheets</h2>
                  <div class="actions">
                    <button onclick={() => createTimesheetForClient(selectedClient)}><Plus size={16} /> New Timesheet</button>
                    <button class="secondary" onclick={() => (clientTab = 'timesheets')}>View All Timesheets</button>
                  </div>
                </div>
                <div class="mini-card-list">
                  {#each selectedClientPeriods.filter((period) => !period.archived).slice(0, 3) as period}
                    <article class="mini-card">
                      <div>
                        <h3>{periodTitle(period)}</h3>
                        <small>{formatHours(periodHours(period))} · {formatMoney(periodValue(period), periodCurrency(period))}</small>
                      </div>
                      <div class="actions">
                        <button onclick={() => openPeriod(period)}>Open</button>
                        <button class="secondary" onclick={() => duplicateTimesheetPeriod(period)}><Copy size={16} /> Duplicate</button>
                        <button class="secondary" onclick={() => generateInvoiceForPeriod(period)}><ReceiptText size={16} /> Invoice</button>
                      </div>
                    </article>
                  {/each}
                </div>
              </div>
              <div class="overview-panel">
                <div class="section-title">
                  <h2>Recent Invoices</h2>
                  <div class="actions">
                    <button onclick={() => createStandaloneInvoice(selectedClient)}><Plus size={16} /> New Invoice</button>
                    <button class="secondary" onclick={() => (clientTab = 'invoices')}>View All Invoices</button>
                  </div>
                </div>
                <div class="mini-card-list">
                  {#each clientInvoices(selectedClient.id).filter((invoice) => !invoice.archived).slice(0, 3) as invoice}
                    <article class="mini-card">
                      <div>
                        <h3>{invoice.invoiceNumber}</h3>
                        <small>{formatMoney(invoiceTotal(invoice), invoice.currency)} · {invoice.status}</small>
                      </div>
                      <div class="actions">
                        <button onclick={() => openInvoice(invoice)}>Open</button>
                        <button class="secondary" onclick={() => generateInvoicePdfOnly(invoice)}><Download size={16} /> PDF</button>
                      </div>
                    </article>
                  {/each}
                </div>
              </div>
            </section>

            <section class="overview-panel recent-activity-compact">
              <div class="section-title">
                <h2>Recent Activity</h2>
                <button class="secondary" onclick={() => (activityOpen = true)}>View Full Activity</button>
              </div>
              <div class="activity-list compact">
                {#each clientActivity as event}
                  <div class="activity-item"><strong>{event.message}</strong><small>{formatDateTime(event.at)}</small></div>
                {/each}
              </div>
            </section>
          {:else if clientTab === 'timesheets'}
            <section class="tab-panel">
              <div class="section-title">
                <h2>Timesheets</h2>
                <button class="secondary" onclick={() => createNextTimesheet(selectedClient)}><Copy size={16} /> Create Next Timesheet</button>
              </div>
              <div class="list-tools">
                <input bind:value={timesheetSearch} placeholder="Search timesheets" />
                <select bind:value={timesheetFilter}>
                  <option value="active">Active</option>
                  <option value="archived">Archived</option>
                </select>
                <select bind:value={timesheetSort}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
              <div class="period-grid compact">
                {#each filteredClientPeriods as period}
                  <article class="period-card">
                    <div>
                      <h3>{periodTitle(period)}</h3>
                      <small>{periodInvoice(period)?.status ?? 'No invoice'}{period.archived ? ' · Archived' : ''}</small>
                    </div>
                    <div class="period-metrics">
                      <strong>{formatHours(periodHours(period))}</strong>
                      <b>{formatMoney(periodValue(period), periodCurrency(period))}</b>
                    </div>
                    <div class="actions">
                      <button onclick={() => openPeriod(period)}>Open</button>
                      <button class="secondary" onclick={() => duplicateTimesheetPeriod(period)}><Copy size={16} /> Duplicate</button>
                      <button class="secondary" onclick={() => generateInvoiceForPeriod(period)}><ReceiptText size={16} /> Invoice</button>
                      <button class="secondary" onclick={() => archivePeriod(period)}><Archive size={16} /> Archive</button>
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          {:else if clientTab === 'invoices'}
            <section class="tab-panel">
              <div class="section-title"><h2>Invoices</h2><button class="secondary" onclick={() => createStandaloneInvoice(selectedClient)}><Plus size={16} /> New Invoice</button></div>
              <div class="list-tools">
                <input bind:value={invoiceSearch} placeholder="Search invoices" />
                <select bind:value={invoiceFilter}>
                  <option value="active">Active</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                  <option value="archived">Archived</option>
                </select>
                <select bind:value={invoiceSort}>
                  <option value="newest">Newest first</option>
                  <option value="oldest">Oldest first</option>
                </select>
              </div>
              <div class="period-grid compact">
                {#each filteredClientInvoices as invoice}
                  <article class="period-card invoice-card">
                    <div>
                      <h3>{invoice.invoiceNumber}</h3>
                      <small>{invoice.status}{invoice.archived ? ' · Archived' : ''}</small>
                    </div>
                    <div class="period-metrics">
                      <strong>{formatMoney(invoiceTotal(invoice), invoice.currency)}</strong>
                      <span>Due {invoice.dueDate}</span>
                    </div>
                    <div class="actions">
                      <button onclick={() => openInvoice(invoice)}>Open</button>
                      <button class="secondary" onclick={() => generateInvoicePdfOnly(invoice)}><Download size={16} /> PDF</button>
                      <button class="secondary" onclick={() => duplicateInvoiceForClient(invoice)}><Copy size={16} /> Duplicate</button>
                      <button class="secondary" onclick={() => markInvoicePaid(invoice)}><CheckCircle2 size={16} /> Paid</button>
                      <button class="secondary" onclick={() => archiveInvoiceForClient(invoice)}><Archive size={16} /> Archive</button>
                    </div>
                  </article>
                {/each}
              </div>
            </section>
          {:else if clientTab === 'notes'}
            <section class="tab-panel notes-panel">
              <div class="section-title">
                <h2>Notes</h2>
                <small>Last updated {selectedClient.notesUpdatedAt ? formatDateTime(selectedClient.notesUpdatedAt) : 'Never'}</small>
              </div>
              <textarea rows="14" bind:value={selectedClient.notes} oninput={() => updateClientNotes(selectedClient)}></textarea>
            </section>
          {:else if clientTab === 'settings'}
            <section class="tab-panel">
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
                    <option value="">Use workspace default ({templateLabel(workspace.settings.invoiceTemplate)})</option>
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
          {/if}
        </section>
        {#if activityOpen}
          <div class="modal-backdrop">
            <section class="wizard">
              <div class="editor-head">
                <h2>{selectedClient.name || 'Client'} Activity</h2>
                <button class="secondary" onclick={() => (activityOpen = false)}>Close</button>
              </div>
              <div class="activity-list">
                {#each allClientActivity as event}
                  <div class="activity-item"><strong>{event.message}</strong><small>{formatDateTime(event.at)}</small></div>
                {/each}
              </div>
            </section>
          </div>
        {/if}
      {:else}
        <div class="empty-state"><button onclick={addClient}><Plus size={16} /> Create Client</button></div>
      {/if}
    {:else if activeView === 'timesheetDetail'}
      {#if selectedClient && selectedPeriod && selectedTimesheet}
        <section class="client-workspace">
          <div class="client-summary">
            <div>
              <h2>{selectedClient.name || 'Untitled client'}</h2>
              <p>{selectedClient.email || selectedClient.contactName || 'Client workspace'}</p>
            </div>
            <div class="summary-metrics">
              <div><span>Outstanding</span><strong>{formatMoney(clientOutstanding(selectedClient.id), selectedClient.defaultCurrency)}</strong></div>
              <div><span>Revenue YTD</span><strong>{formatMoney(clientRevenueYtd(selectedClient.id), selectedClient.defaultCurrency)}</strong></div>
              <div><span>Hours YTD</span><strong>{formatHours(clientHoursYtd(selectedClient.id))}</strong></div>
            </div>
          </div>

          <div class="client-tabs" role="tablist" aria-label="Client sections">
            <button onclick={() => backToClientTab(selectedClient, 'overview')}>Overview</button>
            <button class="active" onclick={() => backToClientTab(selectedClient, 'timesheets')}>Timesheets</button>
            <button onclick={() => backToClientTab(selectedClient, 'invoices')}>Invoices</button>
            <button onclick={() => backToClientTab(selectedClient, 'notes')}>Notes</button>
            <button onclick={() => backToClientTab(selectedClient, 'settings')}>Settings</button>
          </div>

          <section class="tab-panel workspace-detail">
            <div class="detail-card">
              <div>
                <button class="context-link" onclick={() => backToClientTab(selectedClient, 'timesheets')}>← Back</button>
                <small>{periodInvoice(selectedPeriod)?.status ?? 'No invoice'}{selectedPeriod.archived ? ' · Archived' : ''}</small>
                <h2>{periodTitle(selectedPeriod)}</h2>
                <div class="record-meta">
                  <span>{formatHours(periodHours(selectedPeriod))}</span>
                  <span>{formatMoney(periodValue(selectedPeriod), periodCurrency(selectedPeriod))}</span>
                  <span>{selectedTimesheet.currency} · {formatMoney(selectedTimesheet.hourlyRate, selectedTimesheet.currency)}/h</span>
                </div>
              </div>
              <div class="actions">
                <button class="secondary" onclick={() => generatePeriodPdf(selectedPeriod)}><Download size={16} /> PDF</button>
                <button onclick={() => generateInvoiceForPeriod(selectedPeriod)}><ReceiptText size={16} /> Generate Invoice</button>
                <div class="more-menu-wrap" data-detail-more>
                  <button class="secondary more-button" aria-haspopup="menu" aria-expanded={openDetailMenu === 'timesheet'} aria-label="More timesheet actions" onclick={() => toggleDetailMenu('timesheet')}>
                    <MoreHorizontal size={16} /> More
                  </button>
                  {#if openDetailMenu === 'timesheet'}
                    <div class="more-menu" role="menu">
                      <button role="menuitem" onclick={() => { duplicateTimesheetPeriod(selectedPeriod); closeDetailMenu(); }}><Copy size={16} /> Duplicate</button>
                      <button role="menuitem" onclick={() => { archivePeriod(selectedPeriod); closeDetailMenu(); }}><Archive size={16} /> Archive</button>
                      <button class="danger-menu-item" role="menuitem" onclick={() => { deleteTimesheetPeriod(selectedPeriod); closeDetailMenu(); }}><Trash2 size={16} /> Delete</button>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
            <div class="section-title">
              <h2>Entries</h2>
              <button onclick={() => addEntry(selectedPeriod)}><Plus size={16} /> Add Entry</button>
            </div>
            <div class:has-editor={Boolean(entryDraft)} class="entries-workspace">
              <div class="entry-list">
                <div class="entry-list-header" aria-hidden="true">
                  <span>Date</span>
                  <span>Time / Hours</span>
                  <span>Billable</span>
                  <span>Total</span>
                  <span>Mode</span>
                  <span>Actions</span>
                </div>
                {#if selectedTimesheet.entries.length}
                  {#each selectedTimesheet.entries as entry}
                    <div class:active={editingEntryId === entry.id} class="entry-summary-row">
                      <button class="entry-summary-main" aria-label={`Edit entry for ${entryDateLabel(entry.date)}`} onclick={() => openEntryEditor(entry)}>
                        <span class="entry-date">
                          <strong>{entryDateLabel(entry.date)}</strong>
                          <small>{entryDayLabel(entry.date)}</small>
                        </span>
                        <span>
                          <strong>{entryDurationSummary(entry)}</strong>
                          {#if entry.description}
                            <small>{entry.description}</small>
                          {/if}
                        </span>
                        <span class:muted={!entry.billable}>{entry.billable ? 'Billable' : 'Non-billable'}</span>
                        <span>{entryAmount(entry)}</span>
                        <span>{entryModeLabel(entry)}</span>
                      </button>
                      <div class="entry-row-actions">
                        <button class="secondary compact" onclick={() => openEntryEditor(entry)}>Edit</button>
                        <button class="icon danger-icon" aria-label="Delete entry" onclick={() => removeEntry(selectedPeriod, entry.id)}><Trash2 size={16} /></button>
                      </div>
                    </div>
                  {/each}
                {:else}
                  <div class="entry-list-empty">
                    <p>No entries yet.</p>
                    <button onclick={() => addEntry(selectedPeriod)}><Plus size={16} /> Add Entry</button>
                  </div>
                {/if}
              </div>

              {#if entryDraft}
                <aside class="entry-editor-panel" aria-label="Timesheet entry editor">
                  <div class="editor-head compact-head">
                    <div>
                      <span>{entryDraftIsNew ? 'New entry' : 'Editing entry'}</span>
                      <h3>{entryDraft.date ? entryDateLabel(entryDraft.date) : 'Timesheet entry'}</h3>
                    </div>
                    <button class="secondary compact" onclick={() => closeEntryEditor()}>Close</button>
                  </div>

                  <div class="entry-editor-form">
                    <label>Date <input type="date" bind:value={entryDraft.date} /></label>
                    <label>Mode
                      <select value={entryDraft.timeTrackingMode} onchange={(event) => setDraftTimeMode(eventValue(event) === 'time')}>
                        <option value="duration">Hours only</option>
                        <option value="time">Start / End time</option>
                      </select>
                    </label>

                    {#if entryDraft.timeTrackingMode === 'time'}
                      <div class="time-editor-grid">
                        <label>Start <input type="time" value={entryDraft.startTime} oninput={(event) => updateDraftTiming('startTime', eventValue(event))} /></label>
                        <label>End <input type="time" value={entryDraft.endTime} oninput={(event) => updateDraftTiming('endTime', eventValue(event))} /></label>
                        <label>Break <input type="number" min="0" step="5" value={entryDraft.breakMinutes} oninput={(event) => updateDraftTiming('breakMinutes', eventNumber(event))} /></label>
                      </div>
                      <div class:error={Boolean(timeEntryError(entryDraft))} class="duration editor-total">
                        <span>Calculated: {calculatedEntryDuration(entryDraft)}</span>
                        {#if timeEntryError(entryDraft)}
                          <small>{timeEntryError(entryDraft)}</small>
                        {/if}
                      </div>
                    {:else}
                      <label>Hours <input type="number" min="0" step="0.25" value={entryDraft.hours} oninput={(event) => updateDraftHours(eventNumber(event))} /></label>
                    {/if}

                    <label class="inline-check"><input type="checkbox" bind:checked={entryDraft.billable} /> Billable</label>
                    <label class="wide">Description <textarea rows="5" placeholder="Work description" bind:value={entryDraft.description}></textarea></label>
                  </div>

                  <div class="entry-editor-actions">
                    <button class="secondary" onclick={() => closeEntryEditor()}>Cancel</button>
                    <button onclick={() => saveEntryDraft(selectedPeriod)}><CheckCircle2 size={16} /> Save changes</button>
                  </div>
                </aside>
              {/if}
            </div>
          </section>
        </section>
      {:else}
        <div class="empty-state">Timesheet not found.</div>
      {/if}
    {:else if activeView === 'invoiceDetail'}
      {#if selectedClient && selectedInvoice}
        <section class="client-workspace">
          <div class="client-summary">
            <div>
              <h2>{selectedClient.name || 'Untitled client'}</h2>
              <p>{selectedClient.email || selectedClient.contactName || 'Client workspace'}</p>
            </div>
            <div class="summary-metrics">
              <div><span>Outstanding</span><strong>{formatMoney(clientOutstanding(selectedClient.id), selectedClient.defaultCurrency)}</strong></div>
              <div><span>Revenue YTD</span><strong>{formatMoney(clientRevenueYtd(selectedClient.id), selectedClient.defaultCurrency)}</strong></div>
              <div><span>Hours YTD</span><strong>{formatHours(clientHoursYtd(selectedClient.id))}</strong></div>
            </div>
          </div>

          <div class="client-tabs" role="tablist" aria-label="Client sections">
            <button onclick={() => backToClientTab(selectedClient, 'overview')}>Overview</button>
            <button onclick={() => backToClientTab(selectedClient, 'timesheets')}>Timesheets</button>
            <button class="active" onclick={() => backToClientTab(selectedClient, 'invoices')}>Invoices</button>
            <button onclick={() => backToClientTab(selectedClient, 'notes')}>Notes</button>
            <button onclick={() => backToClientTab(selectedClient, 'settings')}>Settings</button>
          </div>

          <section class="tab-panel workspace-detail">
            <div class="detail-card">
              <div>
                <button class="context-link" onclick={() => backToClientTab(selectedClient, 'invoices')}>← Back</button>
                <small>{selectedInvoice.status}{selectedInvoice.archived ? ' · Archived' : ''}</small>
                <h2>{selectedInvoice.invoiceNumber}</h2>
                <div class="record-meta">
                  <span>{formatMoney(invoiceTotal(selectedInvoice), selectedInvoice.currency)}</span>
                  <span>Due {selectedInvoice.dueDate}</span>
                  <span>Issue {selectedInvoice.issueDate}</span>
                  <span>Template: {templateLabel(selectedInvoice.template)}</span>
                </div>
              </div>
              <div class="actions">
                <button class="secondary" onclick={() => generateInvoicePdfOnly(selectedInvoice)}><Download size={16} /> PDF</button>
                {#if selectedInvoice.status !== 'paid'}
                  <button onclick={() => markInvoicePaid(selectedInvoice)}><CheckCircle2 size={16} /> Mark Paid</button>
                {/if}
                <div class="more-menu-wrap" data-detail-more>
                  <button class="secondary more-button" aria-haspopup="menu" aria-expanded={openDetailMenu === 'invoice'} aria-label="More invoice actions" onclick={() => toggleDetailMenu('invoice')}>
                    <MoreHorizontal size={16} /> More
                  </button>
                  {#if openDetailMenu === 'invoice'}
                    <div class="more-menu" role="menu">
                      <button role="menuitem" onclick={() => { duplicateInvoiceForClient(selectedInvoice); closeDetailMenu(); }}><Copy size={16} /> Duplicate</button>
                      <button role="menuitem" onclick={() => { archiveInvoiceForClient(selectedInvoice); closeDetailMenu(); }}><Archive size={16} /> Archive</button>
                      <button class="danger-menu-item" role="menuitem" onclick={() => { deleteInvoiceForClient(selectedInvoice); closeDetailMenu(); }}><Trash2 size={16} /> Delete</button>
                    </div>
                  {/if}
                </div>
              </div>
            </div>
            <div class="section-title">
              <h2>Invoice details</h2>
              <strong>{formatMoney(invoiceTotal(selectedInvoice), selectedInvoice.currency)}</strong>
            </div>
            <div class="form-grid invoice-options" oninput={() => touch('Invoice saved')}>
              <label>Invoice Template
                <select bind:value={selectedInvoice.template}>
                  <option value="classic">Classic</option>
                  <option value="modern">Modern</option>
                  <option value="compact">Compact</option>
                </select>
              </label>
            </div>
            <div class="entry-list" oninput={() => touch('Invoice saved')}>
              {#each selectedInvoice.items as item}
                <div class="item-grid">
                  <label>Description <input bind:value={item.description} /></label>
                  <label>Quantity <input type="number" min="0" step="0.01" bind:value={item.quantity} /></label>
                  <label>Unit price <input type="number" min="0" step="0.01" bind:value={item.unitPrice} /></label>
                  <span class="duration">{formatMoney(Number(item.quantity || 0) * Number(item.unitPrice || 0), selectedInvoice.currency)}</span>
                  <button class="icon danger-icon" aria-label="Delete invoice item" onclick={() => { selectedInvoice.items = selectedInvoice.items.filter((row) => row.id !== item.id); touch('Item removed'); }}><Trash2 size={16} /></button>
                </div>
              {/each}
              <button class="secondary" onclick={() => { selectedInvoice.items = [...selectedInvoice.items, emptyInvoiceItem()]; touch('Item added'); }}><Plus size={16} /> Add Invoice Item</button>
            </div>
          </section>
        </section>
      {:else}
        <div class="empty-state">Invoice not found.</div>
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
          <label>Workspace Default Template
            <select bind:value={workspace.settings.invoiceTemplate}>
              <option value="classic">Classic</option>
              <option value="modern">Modern</option>
              <option value="compact">Compact</option>
            </select>
          </label>
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
