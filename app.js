const CFG = window.CFG || { shop: 'فروشگاه خوراک دام و طیور', phone: '' };
const publicPreview = !CFG.url || CFG.url.includes('YOUR-PROJECT') || !CFG.key || CFG.key.includes('YOUR-ANON-KEY');
const sb = publicPreview ? null : supabase.createClient(CFG.url, CFG.key);
const EMPTY_DB = () => ({ products: [], sales: [], purchases: [], expenses: [], returns: [], parties: [], bank_transactions: [] });
const readLocal = key => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const normalizeDB = source => Object.fromEntries(Object.keys(EMPTY_DB()).map(key => [key, Array.isArray(source?.[key]) ? source[key] : []]));
const saveLocal = (key, value) => localStorage.setItem(key, JSON.stringify(value));
let db = publicPreview ? EMPTY_DB() : normalizeDB(readLocal('db'));
let queue = publicPreview ? [] : (readLocal('q') || []);
let role = publicPreview ? 'viewer' : readLocal('role');
let user = publicPreview ? 'پیش‌نمایش عمومی' : readLocal('user');
let tab = 'dash';
let charts = [];
let cart = [{}];
let busy = false;
let lastSavedInvoiceNo = '';
const invoice = { day: '', customer: '', ctype: 'خرده', pay: 'نقدی' };
const PAYMENTS = ['نقدی', 'کارت‌خوان', 'بانکی', 'نسیه', 'چک'];
const MONTHS = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const ICONS = {
  dash: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  sales: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 12h7M9 16h7"/>',
  stock: '<path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="M3 7v10l9 4 9-4V7M12 11v10"/>',
  purchases: '<path d="M3 7h12v11H3zM15 11h4l2 3v4h-6z"/><circle cx="7" cy="19" r="2"/><circle cx="18" cy="19" r="2"/>',
  returns: '<path d="M9 14 4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-2"/>',
  parties: '<circle cx="9" cy="8" r="3"/><path d="M3 20v-1a6 6 0 0 1 12 0v1M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 5v1"/>',
  expenses: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M3 9h18M16 14h2"/>',
  bank: '<path d="m3 9 9-6 9 6M5 10v9M10 10v9M14 10v9M19 10v9M3 21h18M2 9h20"/>',
  reports: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4.5 4.5"/>',
  leaf: '<path d="M20 4c-9 0-15 3-15 10a6 6 0 0 0 6 6c7 0 10-7 9-16Z"/><path d="M4 21c3-5 7-8 13-11"/>'
};
const $ = selector => document.querySelector(selector);
const number = value => Number(value) || 0;
const format = value => Math.round(number(value)).toLocaleString('fa-IR');
const formatQuantity = value => number(value).toLocaleString('fa-IR', { maximumFractionDigits: 3 });
const money = value => `${format(value)} تومان`;
const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dateObj = value => new Date(`${value || today()}T12:00:00`);
const formatDate = value => dateObj(value).toLocaleDateString('fa-IR-u-ca-persian');
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const amount = sale => number(sale.qty) * number(sale.price);
const profit = sale => number(sale.qty) * (number(sale.price) - number(sale.cost));
const sum = (items, selector) => items.reduce((total, item) => total + selector(item), 0);
const product = id => db.products.find(item => item.id == id);
const isAdmin = () => role === 'admin';
const sortedByDay = rows => rows.slice().sort((a, b) => String(b.day || '').localeCompare(String(a.day || '')));

function persianMonthKey(day) {
  const parts = new Intl.DateTimeFormat('en-u-ca-persian-nu-latn', { year: 'numeric', month: '2-digit' }).formatToParts(dateObj(day));
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year || values.relatedYear}-${values.month}`;
}
function currentPersianMonth() { return persianMonthKey(today()); }
let selectedReportMonth = currentPersianMonth();
let selectedDashboardMonth = currentPersianMonth();
function monthLabel(key) {
  const [year, month] = String(key).split('-');
  return `${MONTHS[Number(month) - 1] || ''} ${year || ''}`;
}
function monthOptions(selected = currentPersianMonth(), count = 12) {
  const options = [];
  const base = dateObj(today());
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    const day = new Date(base);
    day.setMonth(day.getMonth() - offset);
    const key = persianMonthKey(day.toISOString().slice(0, 10));
    if (!options.some(option => option.key === key)) options.push({ key, label: monthLabel(key) });
  }
  if (!options.some(option => option.key === selected)) options.push({ key: selected, label: monthLabel(selected) });
  return options;
}
function toast(message, type = 'success') {
  const node = document.createElement('div');
  node.className = `toast toast-${type}`;
  node.setAttribute('role', 'status');
  node.textContent = message;
  document.body.append(node);
  setTimeout(() => node.remove(), 3600);
}
function persist() {
  if (!publicPreview) {
    saveLocal('db', db);
    saveLocal('q', queue);
  }
}
function setStatus() {
  const node = $('#connection-status');
  if (!node) return;
  const online = navigator.onLine;
  node.innerHTML = `<span class="status-dot ${online ? 'is-online' : 'is-offline'}"></span><span>${online ? 'آنلاین' : 'آفلاین'}</span>${queue.length ? `<span class="pending-count">${format(queue.length)} تغییر در انتظار همگام‌سازی</span>` : ''}`;
  node.setAttribute('aria-label', online ? 'اتصال اینترنت برقرار است' : 'بدون اتصال اینترنت');
}

function inventoryLedger() { return InventoryMath.calculateInventory(db.products, db.purchases, db.sales, db.returns); }
function stocks() { return Object.fromEntries(inventoryLedger().map(row => [row.product.id, row.current])); }
function put(table, row) {
  if (publicPreview) return;
  const index = db[table].findIndex(item => item.id == row.id);
  if (index < 0) db[table].push(row); else db[table][index] = row;
  queue.push({ table, op: 'upsert', row });
  persist();
  sync();
}
function removeRow(table, id) {
  if (publicPreview) return;
  db[table] = db[table].filter(item => item.id != id);
  queue.push({ table, op: 'delete', id });
  persist();
  sync();
}
async function sync() {
  if (publicPreview || !sb || !navigator.onLine || busy || !user) return;
  busy = true;
  try {
    while (queue.length) {
      const job = queue[0];
      const result = job.op === 'upsert'
        ? await sb.from(job.table).upsert(job.row)
        : await sb.from(job.table).delete().eq('id', job.id);
      if (result.error) {
        toast(`خطا در ذخیره: ${result.error.message}`, 'error');
        throw result.error;
      }
      queue.shift();
      persist();
      setStatus();
    }
    const fresh = {};
    for (const table of Object.keys(EMPTY_DB())) {
      const result = await sb.from(table).select('*').limit(50000);
      if (result.error) throw result.error;
      fresh[table] = result.data || [];
    }
    if (!queue.length) {
      db = normalizeDB(fresh);
      persist();
    }
    setStatus();
    if (!document.activeElement?.matches('input,select,textarea')) render();
  } catch (error) {
    console.warn(error);
  } finally {
    busy = false;
  }
}

const NAV_ITEMS = [
  ['dash', 'پیشخوان', 'dash'],
  ['sales', 'فروش و فاکتور', 'sales'],
  ['stock', 'فهرست کالاها', 'stock'],
  ['purchases', 'خریدها', 'purchases'],
  ['returns', 'برگشت کالا', 'returns'],
  ['parties', 'حساب اشخاص', 'parties'],
  ['expenses', 'هزینه‌ها', 'expenses'],
  ['bank', 'بانک و قرض', 'bank'],
  ['reports', 'گزارش ماهانه', 'reports']
];
const PAGE_COPY = {
  dash: ['پیشخوان مدیریتی', 'خلاصه‌ای روشن از فروش، سود، موجودی و حساب‌های فروشگاه.'],
  sales: ['فروش و فاکتور', 'ثبت سریع فروش و دسترسی به فاکتورهای اخیر.'],
  stock: ['فهرست کالاها', 'قیمت‌ها و موجودی قابل پیگیری، با هشدار نقطه سفارش.'],
  purchases: ['خریدها', 'ورود کالا و نگهداری اطلاعات تأمین‌کننده و روش پرداخت.'],
  returns: ['برگشت کالا', 'ثبت دلیل و پیگیری کالاهای برگشتی و اثر آن‌ها بر موجودی.'],
  parties: ['حساب اشخاص', 'نمای یکپارچه مانده مشتریان و تأمین‌کنندگان.'],
  expenses: ['هزینه‌ها', 'ثبت و دسته‌بندی مخارج روزمره فروشگاه.'],
  bank: ['بانک و قرض', 'ثبت واریزی‌ها، برداشت‌ها و اقساط برای ردیابی مانده.'],
  reports: ['گزارش ماهانه', 'مقایسه فروش خالص، سود و هزینه‌ها در ماه‌های مختلف.']
};
function icon(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.dash}</svg>`; }
function navLink([key, label, symbol]) {
  return `<button class="nav-link ${tab === key ? 'is-active' : ''}" onclick="go('${key}')" ${tab === key ? 'aria-current="page"' : ''}>${icon(symbol)}<span>${label}</span>${key === 'returns' && db.returns.length ? `<small>${format(db.returns.length)}</small>` : ''}</button>`;
}
function go(nextTab) { tab = nextTab; render(); }
function accountLabel() {
  if (publicPreview) return 'حالت پیش‌نمایش';
  return `${escapeHTML(user || 'کاربر')} · ${isAdmin() ? 'مدیر' : 'فقط مشاهده'}`;
}
function loginView() {
  $('#app').innerHTML = `<div class="login-screen"><div class="login-card"><div class="brand-mark">${icon('leaf')}</div><p class="eyebrow">سامانه مدیریت فروشگاه</p><h1>${escapeHTML(CFG.shop)}</h1><p class="login-copy">برای ادامه با حساب موجود وارد شوید.</p><form class="login-form" onsubmit="return doLogin(event)"><label for="login-user">نام کاربری</label><input id="login-user" autocomplete="username" placeholder="نام کاربری" required><label for="login-password">رمز عبور</label><input id="login-password" type="password" autocomplete="current-password" placeholder="رمز عبور" required><button class="button button-primary" type="submit">ورود به پنل</button></form></div></div>`;
}
async function doLogin(event) {
  event.preventDefault();
  const username = $('#login-user').value.trim().toLowerCase();
  const password = $('#login-password').value;
  const result = await sb.auth.signInWithPassword({ email: `${username}@shop.local`, password });
  if (result.error) toast('نام کاربری یا رمز عبور درست نیست.', 'error'); else await boot();
  return false;
}
async function logout() {
  if (queue.length && !confirm('تغییرات همگام‌نشده باقی می‌مانند. از پنل خارج می‌شوید؟')) return;
  await sb?.auth.signOut().catch(() => {});
  ['db', 'q', 'user', 'role'].forEach(key => localStorage.removeItem(key));
  location.reload();
}
async function boot() {
  invoice.day = today();
  if (publicPreview) {
    user = 'پیش‌نمایش عمومی'; role = 'viewer'; db = EMPTY_DB(); queue = []; render(); return;
  }
  try {
    const { data } = await sb.auth.getSession();
    if (data.session) {
      user = data.session.user.email.split('@')[0];
      if (navigator.onLine) {
        const profile = await sb.from('profiles').select('role').eq('id', data.session.user.id).single();
        if (profile.data) role = profile.data.role;
      }
      saveLocal('user', user); saveLocal('role', role);
      render(); sync(); return;
    }
  } catch (error) { console.warn(error); }
  if (user && !navigator.onLine) render(); else loginView();
}
function render() {
  charts.forEach(chart => chart.destroy());
  charts = [];
  const [title, description] = PAGE_COPY[tab] || PAGE_COPY.dash;
  $('#app').innerHTML = `<div class="app-shell">
    <aside class="sidebar"><a class="brand" href="#" onclick="go('dash');return false"><span class="brand-mark">${icon('leaf')}</span><span class="brand-copy"><b>${escapeHTML(CFG.shop)}</b><small>مدیریت فروشگاه</small></span></a>
      <div class="nav-caption">منوی اصلی</div><nav class="side-nav" aria-label="منوی اصلی">${NAV_ITEMS.map(navLink).join('')}</nav>
      <div class="sidebar-footer"><span class="sidebar-footer-mark">${icon('stock')}</span><div><b>دفتر فروشگاه</b><small>ثبت منظم، تصمیم مطمئن</small></div></div>
    </aside>
    <div class="workspace"><header class="topbar"><div class="topbar-mobile-brand"><span class="brand-mark">${icon('leaf')}</span><b>${escapeHTML(CFG.shop)}</b></div><div id="connection-status" class="connection-status"></div><div class="topbar-user"><span class="avatar">${icon('parties')}</span><span>${accountLabel()}</span>${!publicPreview ? '<button class="button button-quiet button-small" onclick="logout()">خروج</button>' : ''}</div></header>
      <main class="main-content"><section class="page-heading"><div><p class="eyebrow">پنل مدیریتی فروشگاه خوراک دام و طیور</p><h1>${title}</h1><p>${description}</p></div><div class="date-card"><span>امروز</span><b>${formatDate(today())}</b></div></section><div class="page-content">${(V[tab] || V.dash)()}</div></main>
    </div>
    <nav class="mobile-nav" aria-label="ناوبری موبایل">${NAV_ITEMS.map(navLink).join('')}</nav>
  </div>`;
  setStatus();
  if (tab === 'dash') drawCharts();
}
const V = {};
function table(headers, rows, empty = 'هنوز موردی ثبت نشده است.') {
  return `<div class="table-wrap"><table><thead><tr>${headers.map(header => `<th>${header}</th>`).join('')}</tr></thead><tbody>${rows.length ? rows.map(row => `<tr>${row.map(cell => `<td>${cell ?? ''}</td>`).join('')}</tr>`).join('') : `<tr><td class="empty-cell" colspan="${headers.length}"><span class="empty-mark">${icon('leaf')}</span><b>${empty}</b><small>با ثبت یک مورد، اطلاعات این بخش اینجا نمایش داده می‌شود.</small></td></tr>`}</tbody></table></div>`;
}
function card(title, body, options = {}) {
  return `<section class="panel ${options.className || ''}"><div class="panel-heading"><div><h2>${title}</h2>${options.subtitle ? `<p>${options.subtitle}</p>` : ''}</div>${options.action || ''}</div>${body}</section>`;
}
function metric(label, value, detail, tone = 'green', symbol = 'reports') {
  return `<article class="metric metric-${tone}"><div class="metric-top"><span>${label}</span><span class="metric-icon">${icon(symbol)}</span></div><strong>${value}</strong><small>${detail}</small></article>`;
}
function toolbar(searchId, placeholder, action = '', handler = 'filterRows') {
  return `<div class="toolbar"><label class="search-box">${icon('search')}<input id="${searchId}" type="search" placeholder="${placeholder}" oninput="${handler}('${searchId}', this.value)"></label>${action}</div>`;
}
function filterRows(inputId, value) {
  const tableNode = document.querySelector(`[data-filter-table="${inputId}"]`);
  if (!tableNode) return;
  const query = value.trim().toLocaleLowerCase();
  tableNode.querySelectorAll('tbody tr').forEach(row => { row.hidden = query && !row.textContent.toLocaleLowerCase().includes(query); });
}
function reportFor(month) {
  const sales = db.sales.filter(row => persianMonthKey(row.day) === month);
  const returns = db.returns.filter(row => persianMonthKey(row.day) === month);
  const expenses = db.expenses.filter(row => persianMonthKey(row.day) === month);
  const grossSales = sum(sales, amount);
  const returned = sum(returns, row => number(row.qty) * number(row.price));
  const netSales = grossSales - returned;
  const costOfGoods = sum(sales, row => number(row.qty) * number(row.cost)) - sum(returns, row => number(row.qty) * number(row.cost));
  const grossProfit = netSales - costOfGoods;
  const expenseTotal = sum(expenses, row => number(row.amount));
  return { grossSales, returned, netSales, costOfGoods, grossProfit, expenseTotal, netProfit: grossProfit - expenseTotal, margin: netSales ? grossProfit / netSales : 0 };
}
function allReportMonths() {
  const keys = new Set([currentPersianMonth()]);
  [...db.sales, ...db.returns, ...db.expenses].forEach(row => { if (row.day) keys.add(persianMonthKey(row.day)); });
  return [...keys].sort();
}
function partyBalances() {
  const parties = new Map();
  db.parties.forEach(row => parties.set(row.name, { ...row, receivable: number(row.opening_balance), payable: 0 }));
  const ensure = (name, kind) => {
    const clean = String(name || '').trim();
    if (!clean) return null;
    if (!parties.has(clean)) parties.set(clean, { id: '', name: clean, kind, phone: '', opening_balance: 0, receivable: 0, payable: 0 });
    return parties.get(clean);
  };
  db.sales.filter(row => ['نسیه', 'چک'].includes(row.pay)).forEach(row => { const party = ensure(row.customer, 'مشتری'); if (party) party.receivable += amount(row); });
  db.purchases.filter(row => ['نسیه', 'چک'].includes(row.pay)).forEach(row => { const party = ensure(row.supplier, 'تأمین‌کننده'); if (party) party.payable += number(row.qty) * number(row.price); });
  return [...parties.values()].map(party => ({ ...party, balance: number(party.receivable) - number(party.payable) })).sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}
function accountTotals() {
  const accounts = partyBalances();
  return {
    receivable: sum(accounts, item => Math.max(0, item.balance)),
    payable: sum(accounts, item => Math.max(0, -item.balance))
  };
}

V.dash = () => {
  const todaySales = sum(db.sales.filter(row => row.day === today()), amount) - sum(db.returns.filter(row => row.day === today()), row => number(row.qty) * number(row.price));
  const report = reportFor(selectedDashboardMonth);
  const stock = stocks();
  const low = db.products.filter(item => number(stock[item.id]) <= number(item.reorder));
  const accounts = accountTotals();
  const recentInvoices = groupInvoices().slice(0, 5).map(group => [escapeHTML(group.no), formatDate(group.day), escapeHTML(group.customer || 'مشتری گذری'), money(group.total)]);
  const lowRows = low.slice(0, 5).map(item => [escapeHTML(item.name), escapeHTML(item.unit || '—'), format(stock[item.id]), `<span class="badge ${number(stock[item.id]) <= 0 ? 'badge-red' : 'badge-amber'}">${number(stock[item.id]) <= 0 ? 'ناموجود' : 'نیاز به سفارش'}</span>`]);
  return `<div class="welcome-strip"><div><span class="welcome-label">خلاصه مالی ماهانه</span><h2>فروشگاه در یک نگاه</h2><p>فروش امروز و عملکرد ${monthLabel(selectedDashboardMonth)}</p></div><div class="welcome-actions"><label class="field dashboard-month-select"><span>ماه گزارش</span><select onchange="setDashboardMonth(this.value)">${monthOptions(selectedDashboardMonth, 12).map(option => `<option value="${option.key}" ${option.key === selectedDashboardMonth ? 'selected' : ''}>${option.label}</option>`).join('')}</select></label><button class="button button-primary" onclick="go('sales')">${icon('sales')}ثبت فروش</button><button class="button button-secondary" onclick="go('purchases')">${icon('purchases')}ثبت خرید</button></div></div>
    <div class="metrics-grid">${metric('فروش خالص امروز', money(todaySales), 'پس از کسر برگشتی‌ها', 'green', 'sales')}${metric('سود ناخالص ماه', money(report.grossProfit), 'پیش از کسر هزینه‌ها', 'amber', 'reports')}${metric('هزینه ماه', money(report.expenseTotal), 'ثبت‌شده در ماه جاری', 'coral', 'expenses')}${metric('سود خالص ماه', money(report.netProfit), 'سود ناخالص منهای هزینه', report.netProfit < 0 ? 'coral' : 'green', 'bank')}${metric('کالای نیازمند سفارش', format(low.length), 'بر اساس نقطه سفارش کالا', low.length ? 'amber' : 'green', 'stock')}${metric('طلب / بدهی اشخاص', `${format(accounts.receivable)} / ${format(accounts.payable)}`, 'طلب از مشتری / بدهی به تأمین‌کننده', 'slate', 'parties')}</div>
    <div class="dashboard-charts"><div class="chart-panel">${card('روند فروش روزانه', '<div class="chart-area"><canvas id="daily-chart" aria-label="نمودار فروش روزانه"></canvas></div>', { subtitle: '۳۰ روز گذشته · مبالغ به تومان' })}</div><div class="chart-panel">${card('مقایسه ماهانه', '<div class="chart-area"><canvas id="monthly-chart" aria-label="نمودار مقایسه ماهانه"></canvas></div>', { subtitle: 'فروش خالص، سود خالص و هزینه' })}</div></div>
    <div class="dashboard-lists">${card('آخرین فاکتورها', table(['شماره فاکتور', 'تاریخ', 'مشتری', 'مبلغ خالص'], recentInvoices), { action: '<button class="text-button" onclick="go(\'sales\')">مشاهده همه</button>' })}${card('هشدار موجودی', table(['کالا', 'واحد', 'موجودی', 'وضعیت'], lowRows, 'همه کالاها موجودی کافی دارند.'), { action: '<button class="text-button" onclick="go(\'stock\')">فهرست کالاها</button>' })}</div>`;
};
function setDashboardMonth(value) { selectedDashboardMonth = value; render(); }
function drawCharts() {
  if (typeof Chart === 'undefined') return;
  const dailyCanvas = $('#daily-chart');
  const monthlyCanvas = $('#monthly-chart');
  if (!dailyCanvas || !monthlyCanvas) return;
  Chart.defaults.font.family = 'Vazirmatn, Tahoma, sans-serif';
  const days = [...Array(30)].map((_, index) => {
    const day = new Date(); day.setDate(day.getDate() - 29 + index);
    return new Date(day.getTime() - day.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  });
  const valuesByDay = days.map(day => sum(db.sales.filter(row => row.day === day), amount) - sum(db.returns.filter(row => row.day === day), row => number(row.qty) * number(row.price)));
  charts.push(new Chart(dailyCanvas, { type: 'line', data: { labels: days.map(day => dateObj(day).toLocaleDateString('fa-IR-u-ca-persian', { month: 'numeric', day: 'numeric' })), datasets: [{ label: 'فروش خالص', data: valuesByDay, borderColor: '#1e4d3a', backgroundColor: 'rgba(30,77,58,.12)', fill: true, tension: .32, pointRadius: 2 }] }, options: chartOptions() }));
  const months = monthOptions(currentPersianMonth(), 6).map(option => option.key);
  charts.push(new Chart(monthlyCanvas, { type: 'bar', data: { labels: months.map(monthLabel), datasets: [{ label: 'فروش خالص', data: months.map(month => reportFor(month).netSales), backgroundColor: '#1e4d3a', borderRadius: 5 }, { label: 'سود خالص', data: months.map(month => reportFor(month).netProfit), backgroundColor: '#c58a32', borderRadius: 5 }, { label: 'هزینه', data: months.map(month => reportFor(month).expenseTotal), backgroundColor: '#b95345', borderRadius: 5 }] }, options: chartOptions() }));
}
function chartOptions() {
  return { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { position: 'bottom', labels: { usePointStyle: true, boxWidth: 7, padding: 18 } }, tooltip: { rtl: true, callbacks: { label: context => `${context.dataset.label}: ${format(context.parsed.y)} تومان` } } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { callback: value => format(value) } } } };
}

function groupInvoices() {
  const groups = {};
  db.sales.forEach(row => {
    const key = row.invoice || row.id;
    const group = groups[key] ||= { no: row.invoice || '—', day: row.day, customer: row.customer, pay: row.pay, total: 0 };
    group.total += amount(row);
  });
  db.returns.forEach(row => { if (row.invoice && groups[row.invoice]) groups[row.invoice].total -= number(row.qty) * number(row.price); });
  return Object.values(groups).sort((a, b) => String(b.day).localeCompare(String(a.day)) || String(b.no).localeCompare(String(a.no), 'en', { numeric: true }));
}
const unitPrice = id => {
  const item = product(id) || {};
  return invoice.ctype === 'عمده' ? number(item.wholesale || item.retail) : number(item.retail);
};
function chooseProduct(index, id) { cart[index].product_id = id; cart[index].price = unitPrice(id); render(); }
function refreshPrices() { cart.forEach(item => { if (item.product_id) item.price = unitPrice(item.product_id); }); render(); }
function updateInvoiceTotal() {
  const node = $('#invoice-total');
  if (node) node.textContent = money(sum(cart, item => number(item.qty) * number(item.price)));
}
V.sales = () => {
  const stock = stocks();
  const create = isAdmin() ? `<section class="panel sale-panel"><div class="panel-heading"><div><h2>ثبت فاکتور فروش</h2><p>اقلام فاکتور را انتخاب کنید؛ قیمت متناسب با نوع مشتری پیشنهاد می‌شود.</p></div><span class="form-kicker">فروش جدید</span></div><div class="form-grid form-grid-four">
    <label class="field"><span>تاریخ</span><input type="date" value="${invoice.day}" oninput="invoice.day=this.value"></label><label class="field"><span>نام مشتری</span><input value="${escapeHTML(invoice.customer)}" oninput="invoice.customer=this.value" placeholder="اختیاری"></label>
    <label class="field"><span>نوع مشتری</span><select onchange="invoice.ctype=this.value;refreshPrices()">${optionList(['خرده', 'عمده'], invoice.ctype)}</select></label><label class="field"><span>روش پرداخت</span><select onchange="invoice.pay=this.value">${optionList(PAYMENTS, invoice.pay)}</select></label></div>
    <div class="invoice-lines">${cart.map((item, index) => `<div class="invoice-line"><label class="field product-select"><span>کالا</span><select onchange="chooseProduct(${index}, this.value)"><option value="">انتخاب کالا</option>${db.products.map(entry => `<option value="${escapeHTML(entry.id)}" ${entry.id == item.product_id ? 'selected' : ''}>${escapeHTML(entry.name)} · موجودی ${format(stock[entry.id])} ${escapeHTML(entry.unit || '')}</option>`).join('')}</select></label><label class="field"><span>تعداد / کیلو</span><input type="number" min="0.01" step="any" inputmode="decimal" placeholder="0" value="${item.qty ?? ''}" oninput="cart[${index}].qty=Number(this.value);updateInvoiceTotal()"></label><label class="field"><span>قیمت واحد (تومان)</span><input type="number" min="0" step="any" inputmode="numeric" placeholder="0" value="${item.price ?? ''}" oninput="cart[${index}].price=Number(this.value);updateInvoiceTotal()"></label><button class="icon-button line-remove" title="حذف ردیف" aria-label="حذف ردیف" onclick="cart.splice(${index},1);if(!cart.length)cart=[{}];render()">×</button></div>`).join('')}</div>
    <div class="invoice-footer"><button class="button button-secondary" onclick="cart.push({});render()">＋ افزودن ردیف</button><div class="invoice-total"><span>جمع فاکتور</span><b id="invoice-total">${money(sum(cart, item => number(item.qty) * number(item.price)))}</b></div><button class="button button-primary" onclick="saveInvoice()">ثبت فاکتور</button></div></section>` : '';
  const latestInvoiceAction = lastSavedInvoiceNo && db.sales.some(row => row.invoice === lastSavedInvoiceNo) ? `<section class="invoice-success-card"><div><span class="invoice-success-mark">✓</span><div><b>فاکتور ${escapeHTML(lastSavedInvoiceNo)} ثبت شد</b><small>نسخهٔ چاپی را برای تحویل به مشتری صادر کنید.</small></div></div><button class="button button-primary" onclick="printInvoice('${escapeHTML(lastSavedInvoiceNo)}')">صدور فاکتور چاپی</button></section>` : '';
  const rows = groupInvoices().slice(0, 100).map(group => [escapeHTML(group.no), formatDate(group.day), escapeHTML(group.customer || 'مشتری گذری'), `<span class="badge badge-neutral">${escapeHTML(group.pay || '—')}</span>`, money(group.total), `<div class="row-actions"><button class="button button-secondary button-small" onclick="printInvoice('${escapeHTML(group.no)}')">صدور / چاپ فاکتور</button>${isAdmin() ? `<button class="icon-button danger-button" title="حذف فاکتور" onclick="deleteInvoice('${escapeHTML(group.no)}')">×</button>` : ''}</div>`]);
  return `${create}${latestInvoiceAction}${card('فاکتورهای اخیر', `${toolbar('sales-search', 'جست‌وجو در شماره فاکتور یا مشتری')}${table(['شماره', 'تاریخ', 'مشتری', 'پرداخت', 'مبلغ خالص', 'عملیات'], rows, 'هنوز فاکتوری ثبت نشده است.')}`, { subtitle: 'نمایش ۱۰۰ فاکتور اخیر · مبالغ به تومان' })}`.replace('<table>', '<table data-filter-table="sales-search">');
};
function saveInvoice() {
  const lines = cart.filter(item => item.product_id && number(item.qty) > 0);
  if (!lines.length) return toast('برای ثبت، دست‌کم یک ردیف کالا و تعداد وارد کنید.', 'error');
  const stock = stocks();
  for (const item of lines) {
    if (number(item.qty) > number(stock[item.product_id]) && !confirm(`موجودی «${product(item.product_id)?.name}» کافی نیست. بااین‌حال ثبت شود؟`)) return;
  }
  const next = db.sales.reduce((max, row) => Math.max(max, Number(String(row.invoice).replace(/\D/g, '')) || 0), 1000) + 1;
  const invoiceNo = `F-${next}`;
  lines.forEach(item => put('sales', { id: uid(), day: invoice.day, invoice: invoiceNo, customer: invoice.customer.trim(), ctype: invoice.ctype, pay: invoice.pay, product_id: item.product_id, qty: number(item.qty), price: number(item.price), cost: number(product(item.product_id)?.buy) }));
  cart = [{}]; invoice.customer = ''; invoice.day = today(); lastSavedInvoiceNo = invoiceNo;
  toast(`فاکتور ${invoiceNo} ثبت شد؛ نسخهٔ چاپی از همین صفحه قابل صدور است.`); render();
}
function deleteInvoice(numberText) {
  if (db.returns.some(row => row.invoice === numberText)) return toast('برای این فاکتور برگشت ثبت شده؛ ابتدا برگشت را بررسی کنید.', 'error');
  if (!confirm(`فاکتور ${numberText} حذف شود؟ موجودی انبار برمی‌گردد.`)) return;
  db.sales.filter(row => row.invoice === numberText).forEach(row => removeRow('sales', row.id));
  render();
}
function printInvoice(numberText) {
  const rows = db.sales.filter(row => row.invoice === numberText);
  if (!rows.length) return;
  const first = rows[0];
  const total = sum(rows, amount);
  const returned = sum(db.returns.filter(row => row.invoice === numberText), row => number(row.qty) * number(row.price));
  const netTotal = total - returned;
  const lineHTML = rows.map((row, index) => {
    const item = product(row.product_id) || {};
    return `<tr><td>${format(index + 1)}</td><td class="item-name">${escapeHTML(item.name || 'کالای حذف‌شده')}</td><td>${escapeHTML(item.code || '—')}</td><td>${escapeHTML(item.unit || '—')}</td><td>${format(row.qty)}</td><td>${format(row.price)}</td><td>${format(amount(row))}</td></tr>`;
  }).join('');
  const printWindow = open('', '_blank');
  if (!printWindow) return toast('اجازه باز شدن پنجره فاکتور را بدهید.', 'error');
  printWindow.document.write(`<!doctype html><html dir="rtl" lang="fa"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>فاکتور فروش ${escapeHTML(numberText)}</title><style>
    @page{size:A4 portrait;margin:13mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#25362d;font-family:Tahoma,Arial,sans-serif;font-size:12px;line-height:1.8}.invoice{width:100%;max-width:190mm;margin:0 auto}.top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;padding:0 0 14px;border-bottom:3px solid #1e4d3a}.store h1{margin:0 0 3px;color:#1e4d3a;font-size:22px}.store p,.doc-meta p{margin:1px 0;color:#627168;font-size:11px}.doc-title{margin:0 0 5px;color:#1e4d3a;font-size:18px}.doc-no{display:inline-block;padding:2px 10px;border-radius:6px;background:#edf4ef;color:#1e4d3a;font-weight:700}.customer-box{display:grid;grid-template-columns:1fr 1fr;gap:5px 18px;margin:14px 0;padding:10px 13px;border:1px solid #dce5de;border-radius:7px;background:#fbfcfa}.customer-box p{margin:0}.customer-box b{color:#40554a}table{width:100%;border-collapse:collapse;font-size:10px}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}th,td{padding:7px 6px;border:1px solid #d9e2db;text-align:center}th{background:#1e4d3a;color:#fff;font-weight:700}td.item-name{text-align:right;font-weight:600}.totals{width:min(100%,82mm);margin:12px 0 0 auto;border:1px solid #dce5de;border-radius:7px;overflow:hidden}.total-row{display:flex;justify-content:space-between;gap:12px;padding:5px 10px;border-bottom:1px solid #e8eee9}.total-row:last-child{border:0;background:#edf4ef;color:#1e4d3a;font-size:14px;font-weight:700}.total-row.returned{color:#a4493e}.thanks{margin:13px 0 10px;color:#63736a;text-align:center;font-size:10px}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;break-inside:avoid;page-break-inside:avoid}.sign-card{min-height:62mm;padding:9px 11px;border:1px solid #cfdad1;border-radius:7px;break-inside:avoid;page-break-inside:avoid}.sign-card h2{margin:0 0 6px;padding-bottom:5px;border-bottom:1px solid #e2e9e3;color:#1e4d3a;font-size:13px}.sign-line{display:flex;align-items:end;gap:6px;margin-top:7px;color:#526258;font-size:10px}.line{height:17px;flex:1;border-bottom:1px dotted #88968c}.stamp-label{margin-top:8px;color:#526258;font-size:10px}.stamp-box{height:20mm;margin-top:3px;border:1px dashed #aebbb0;border-radius:5px}.print-note{margin-top:10px;color:#8a958d;text-align:center;font-size:9px}@media print{body{print-color-adjust:exact;-webkit-print-color-adjust:exact}.invoice{max-width:none}.sign-card{border-color:#aebbb0}}
  </style></head><body><main class="invoice"><header class="top"><div class="store"><h1>${escapeHTML(CFG.shop)}</h1><p>${CFG.phone ? `تماس: ${escapeHTML(CFG.phone)}` : 'فروش و پخش خوراک دام و طیور'}</p></div><div class="doc-meta"><h2 class="doc-title">فاکتور فروش</h2><p>شماره: <span class="doc-no">${escapeHTML(numberText)}</span></p><p>تاریخ: ${formatDate(first.day)}</p></div></header><section class="customer-box"><p><b>خریدار:</b> ${escapeHTML(first.customer || 'مشتری گذری')}</p><p><b>نوع مشتری:</b> ${escapeHTML(first.ctype || '—')}</p><p><b>روش پرداخت:</b> ${escapeHTML(first.pay || '—')}</p><p><b>تعداد اقلام:</b> ${format(rows.length)} ردیف</p></section><table><thead><tr><th>ردیف</th><th>شرح کالا</th><th>کد</th><th>واحد</th><th>مقدار</th><th>قیمت واحد (تومان)</th><th>مبلغ (تومان)</th></tr></thead><tbody>${lineHTML}</tbody></table><section class="totals"><div class="total-row"><span>جمع فاکتور</span><b>${money(total)}</b></div>${returned ? `<div class="total-row returned"><span>کسر برگشتی</span><b>${money(returned)}</b></div>` : ''}<div class="total-row"><span>مبلغ قابل پرداخت</span><b>${money(netTotal)}</b></div></section><p class="thanks">از خرید شما سپاسگزاریم.</p><section class="signatures"><div class="sign-card"><h2>خریدار / مشتری</h2><div class="sign-line"><span>نام و نام خانوادگی</span><span class="line"></span></div><div class="sign-line"><span>امضا</span><span class="line"></span></div><div class="stamp-label">محل مهر / اثر انگشت خریدار</div><div class="stamp-box"></div></div><div class="sign-card"><h2>فروشنده</h2><div class="sign-line"><span>نام فروشنده</span><span class="line"></span></div><div class="sign-line"><span>امضا</span><span class="line"></span></div><div class="stamp-label">محل مهر فروشگاه</div><div class="stamp-box"></div></div></section><p class="print-note">برای نگهداری نسخه دیجیتال، در پنجره چاپ گزینهٔ «ذخیره به‌صورت PDF» را انتخاب کنید.</p></main><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300));<\/script></body></html>`);
  printWindow.document.close();
}

V.stock = () => {
  const ledger = inventoryLedger();
  const summary = InventoryMath.summarizeInventory(ledger);
  const statusLabels = { critical: 'بحرانی / ناموجود', reorder: 'نیاز به سفارش', sufficient: 'کافی' };
  const sorted = ledger.slice().sort((a, b) => String(a.product.code || '').localeCompare(String(b.product.code || ''), 'fa'));
  const rows = sorted.map(record => {
    const item = record.product;
    const badge = record.status === 'critical' ? 'badge-red' : record.status === 'reorder' ? 'badge-amber' : 'badge-green';
    const orderButton = isAdmin() && record.status !== 'sufficient' ? `<button class="button button-secondary button-small" onclick="addPurchase('${escapeHTML(item.id)}')">ثبت خرید</button>` : '';
    const actions = isAdmin() ? `<div class="row-actions">${orderButton}<button class="button button-secondary button-small" onclick="editProduct('${escapeHTML(item.id)}')">ویرایش</button></div>` : '—';
    return [
      `<span data-stock-product="${escapeHTML(item.id)}">${escapeHTML(item.code || '—')}</span>`,
      `<b>${escapeHTML(item.name)}</b><small class="cell-subtitle">${escapeHTML(item.category || 'بدون دسته')}</small>`,
      escapeHTML(item.unit || '—'), money(item.buy), money(item.retail), money(item.wholesale),
      formatQuantity(record.opening), formatQuantity(record.purchased), formatQuantity(record.sold), formatQuantity(record.returned),
      `<b>${formatQuantity(record.current)}</b>`, formatQuantity(record.reorder),
      `<span class="badge ${badge}" data-stock-status="${record.status}" data-stock-category="${escapeHTML(item.category || '')}">${statusLabels[record.status]}</span>`,
      money(record.value),
      record.status === 'sufficient' ? '—' : formatQuantity(record.orderGap),
      actions
    ];
  });
  const categories = [...new Set(db.products.map(item => String(item.category || '').trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'fa'));
  const categoryOptions = `<option value="">همهٔ دسته‌ها</option>${categories.map(category => `<option value="${escapeHTML(category)}">${escapeHTML(category)}</option>`).join('')}<option value="__uncategorized__">بدون دسته</option>`;
  const add = `<div class="stock-actions"><button class="button button-secondary" onclick="exportStockCSV()">دریافت CSV</button>${isAdmin() ? '<button class="button button-primary" onclick="editProduct()">＋ افزودن کالا</button>' : ''}</div>`;
  const filters = `<div class="stock-filters"><label class="stock-filter"><span>وضعیت انبار</span><select id="stock-status" onchange="filterStockRows()"><option value="">همهٔ وضعیت‌ها</option><option value="critical">بحرانی / ناموجود</option><option value="reorder">نیاز به سفارش</option><option value="sufficient">کافی</option></select></label><label class="stock-filter"><span>دستهٔ کالا</span><select id="stock-category" onchange="filterStockRows()">${categoryOptions}</select></label></div>`;
  const metrics = `<div class="metrics-grid stock-summary">${metric('تعداد کالاها', format(summary.productCount), 'کالاهای ثبت‌شده', 'green', 'stock')}${metric('نیازمند سفارش', format(summary.reorderCount), 'موجودی مثبت تا نقطه سفارش', 'amber', 'purchases')}${metric('بحرانی / ناموجود', format(summary.criticalCount), 'موجودی صفر یا منفی', 'coral', 'returns')}${metric('ارزش موجودی', money(summary.stockValue), 'ارزش موجودی مثبت × قیمت خرید', 'slate', 'reports')}</div>`;
  const body = `${metrics}${toolbar('stock-search', 'جست‌وجوی نام یا کد کالا', add, 'filterStockRows')}${filters}${table(['کد', 'نام کالا / دسته', 'واحد', 'قیمت خرید', 'خرده‌فروشی', 'عمده‌فروشی', 'موجودی اولیه', 'خرید تجمیعی', 'فروش تجمیعی', 'برگشتی', 'موجودی فعلی', 'نقطه سفارش', 'وضعیت', 'ارزش موجودی', 'کسری تا سفارش', 'عملیات'], rows, 'فهرست کالاها خالی است.').replace('<table>', '<table data-filter-table="stock-search">')}`;
  return card('موجودی و قیمت‌ها', body, { subtitle: 'مانده = موجودی اولیه + خرید تجمیعی + برگشتی − فروش تجمیعی؛ وضعیت بر پایه نقطه سفارش محاسبه می‌شود.' });
};
function stockMatchesFilters(record) {
  const query = ($('#stock-search')?.value || '').trim().toLocaleLowerCase();
  const status = $('#stock-status')?.value || '';
  const category = $('#stock-category')?.value || '';
  const item = record.product;
  const searchable = `${item.code || ''} ${item.name || ''} ${item.category || ''}`.toLocaleLowerCase();
  if (query && !searchable.includes(query)) return false;
  if (status && record.status !== status) return false;
  if (category === '__uncategorized__' && String(item.category || '').trim()) return false;
  if (category && category !== '__uncategorized__' && String(item.category || '').trim() !== category) return false;
  return true;
}
function filterStockRows() {
  const tableNode = document.querySelector('[data-filter-table="stock-search"]');
  if (!tableNode) return;
  const visible = new Set(inventoryLedger().filter(stockMatchesFilters).map(row => String(row.product.id)));
  tableNode.querySelectorAll('tbody tr').forEach(row => {
    const productNode = row.querySelector('[data-stock-product]');
    if (productNode) row.hidden = !visible.has(productNode.getAttribute('data-stock-product'));
  });
}
function exportStockCSV() {
  const rows = inventoryLedger().filter(stockMatchesFilters);
  const statusLabels = { critical: 'بحرانی / ناموجود', reorder: 'نیاز به سفارش', sufficient: 'کافی' };
  const csvCell = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
  const headings = ['کد کالا', 'نام کالا', 'دسته کالا', 'واحد', 'قیمت خرید (تومان)', 'قیمت فروش خرده (تومان)', 'قیمت فروش عمده (تومان)', 'موجودی اولیه', 'خرید تجمیعی', 'فروش تجمیعی', 'برگشتی', 'موجودی فعلی', 'نقطه سفارش', 'کسری تا سفارش', 'وضعیت انبار', 'ارزش موجودی (تومان)'];
  const data = rows.map(record => {
    const item = record.product;
    return [item.code, item.name, item.category, item.unit, number(item.buy), number(item.retail), number(item.wholesale), record.opening, record.purchased, record.sold, record.returned, record.current, record.reorder, record.orderGap, statusLabels[record.status], record.value];
  });
  const contents = [headings, ...data].map(row => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([`\ufeff${contents}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = `inventory-${today()}.csv`; document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function editProduct(id) {
  const item = product(id) || { id: uid(), code: '', name: '', category: '', unit: 'کیلو', buy: 0, retail: 0, wholesale: 0, opening: 0, reorder: 0 };
  showForm(id ? 'ویرایش کالا' : 'افزودن کالا', [
    { key: 'code', label: 'کد کالا', required: true }, { key: 'name', label: 'نام کالا', required: true }, { key: 'category', label: 'دسته کالا' }, { key: 'unit', label: 'واحد', placeholder: 'مثلاً کیسه ۲۵ کیلویی' },
    { key: 'buy', label: 'قیمت خرید (تومان)', type: 'number' }, { key: 'retail', label: 'قیمت فروش خرده (تومان)', type: 'number' }, { key: 'wholesale', label: 'قیمت فروش عمده (تومان)', type: 'number' }, { key: 'opening', label: 'موجودی اولیه', type: 'number' }, { key: 'reorder', label: 'نقطه سفارش', type: 'number' }
  ], item, values => { put('products', { ...item, ...values }); toast('اطلاعات کالا ذخیره شد.'); render(); });
}

V.purchases = () => {
  const add = isAdmin() ? '<button class="button button-primary" onclick="addPurchase()">＋ ثبت خرید</button>' : '';
  const rows = sortedByDay(db.purchases).slice(0, 200).map(row => [formatDate(row.day), escapeHTML(product(row.product_id)?.name || 'کالای حذف‌شده'), format(row.qty), money(row.price), money(number(row.qty) * number(row.price)), escapeHTML(row.supplier || '—'), `<span class="badge badge-neutral">${escapeHTML(row.pay || '—')}</span>`, isAdmin() ? `<button class="icon-button danger-button" title="حذف خرید" onclick="deleteRecord('purchases','${escapeHTML(row.id)}')">×</button>` : '']);
  return card('سوابق خرید', `${toolbar('purchase-search', 'جست‌وجوی کالا یا تأمین‌کننده', add)}${table(['تاریخ', 'کالا', 'مقدار', 'قیمت واحد', 'مبلغ کل', 'تأمین‌کننده', 'پرداخت', ''], rows, 'هنوز خریدی ثبت نشده است.')}`.replace('<table>', '<table data-filter-table="purchase-search">'), { subtitle: 'خریدهای ثبت‌شده به موجودی انبار اضافه می‌شوند.' });
};
function addPurchase(prefillProductId = '') {
  if (!db.products.length) return toast('ابتدا یک کالا به فهرست اضافه کنید.', 'error');
  const selectedProduct = product(prefillProductId);
  showForm('ثبت خرید', [
    { key: 'day', label: 'تاریخ', type: 'date', required: true }, { key: 'product_id', label: 'کالا', options: db.products.map(item => ({ value: item.id, label: item.name })), required: true }, { key: 'qty', label: 'مقدار / تعداد', type: 'number', required: true }, { key: 'price', label: 'قیمت واحد خرید (تومان)', type: 'number', required: true }, { key: 'supplier', label: 'تأمین‌کننده' }, { key: 'pay', label: 'روش پرداخت', options: PAYMENTS }, { key: 'note', label: 'توضیحات' }
  ], { day: today(), product_id: prefillProductId, price: selectedProduct?.buy || '', pay: 'نقدی' }, values => {
    put('purchases', { id: uid(), ...values, qty: number(values.qty), price: number(values.price) });
    const item = product(values.product_id);
    if (item && values.price) put('products', { ...item, buy: number(values.price) });
    toast('خرید ثبت شد و به موجودی اضافه شد.'); render();
  });
}

V.returns = () => {
  const add = isAdmin() ? '<button class="button button-primary" onclick="addReturn()">＋ ثبت برگشت</button>' : '';
  const rows = sortedByDay(db.returns).slice(0, 200).map(row => [formatDate(row.day), escapeHTML(row.invoice || '—'), escapeHTML(product(row.product_id)?.name || 'کالای حذف‌شده'), escapeHTML(row.customer || '—'), format(row.qty), money(row.price), money(number(row.qty) * number(row.price)), escapeHTML(row.reason || '—'), isAdmin() ? `<button class="icon-button danger-button" title="حذف برگشت" onclick="deleteRecord('returns','${escapeHTML(row.id)}')">×</button>` : '']);
  return card('سوابق برگشت کالا', `${toolbar('return-search', 'جست‌وجوی فاکتور یا کالا', add)}${table(['تاریخ', 'فاکتور', 'کالا', 'مشتری', 'مقدار', 'قیمت واحد', 'مبلغ برگشت', 'دلیل', ''], rows, 'هنوز برگشتی ثبت نشده است.')}`.replace('<table>', '<table data-filter-table="return-search">'), { subtitle: 'برگشتی‌های ثبت‌شده به موجودی اضافه و از فروش خالص کسر می‌شوند.' });
};
function addReturn() {
  const eligibleSales = db.sales.map(sale => {
    const alreadyReturned = sum(db.returns.filter(row => row.sale_id === sale.id), row => number(row.qty));
    return { sale, remaining: number(sale.qty) - alreadyReturned };
  }).filter(item => item.remaining > 0).map(({ sale, remaining }) => ({
    value: sale.id,
    label: `${sale.invoice || 'بدون شماره'} · ${product(sale.product_id)?.name || 'کالای حذف‌شده'} · مانده ${format(remaining)}`
  }));
  if (!eligibleSales.length) return toast('فاکتور فروش با مقدار قابل برگشت پیدا نشد.', 'error');
  showForm('ثبت برگشت کالا', [
    { key: 'day', label: 'تاریخ', type: 'date', required: true }, { key: 'sale_id', label: 'فاکتور و ردیف کالای فروخته‌شده', options: eligibleSales, required: true }, { key: 'qty', label: 'تعداد / مقدار برگشتی', type: 'number', min: 0.001, required: true }, { key: 'reason', label: 'دلیل برگشت' }
  ], { day: today(), qty: '' }, values => {
    const sale = db.sales.find(row => row.id === values.sale_id);
    if (!sale) return toast('ردیف فروش انتخاب‌شده پیدا نشد.', 'error');
    const alreadyReturned = sum(db.returns.filter(row => row.sale_id === sale.id), row => number(row.qty));
    const remaining = number(sale.qty) - alreadyReturned;
    if (number(values.qty) <= 0 || number(values.qty) > remaining) return toast(`مقدار برگشت باید بیشتر از صفر و حداکثر ${format(remaining)} باشد.`, 'error');
    put('returns', { id: uid(), sale_id: sale.id, day: values.day, invoice: sale.invoice || '', product_id: sale.product_id, customer: sale.customer || '', qty: number(values.qty), price: number(sale.price), cost: number(sale.cost), reason: values.reason });
    toast('برگشت کالا ثبت شد و موجودی اصلاح شد.'); render();
  });
}
function deleteRecord(tableName, id) {
  if (!confirm('این مورد حذف شود؟')) return;
  removeRow(tableName, id); render();
}

V.parties = () => {
  const accounts = partyBalances();
  const totals = accountTotals();
  const add = isAdmin() ? '<button class="button button-primary" onclick="editParty()">＋ افزودن طرف حساب</button>' : '';
  const rows = accounts.map(row => {
    const status = row.balance > 0 ? '<span class="badge badge-amber">طلب از مشتری</span>' : row.balance < 0 ? '<span class="badge badge-red">بدهی به تأمین‌کننده</span>' : '<span class="badge badge-green">تسویه</span>';
    const actions = isAdmin() && row.id ? `<button class="button button-secondary button-small" onclick="editParty('${escapeHTML(row.id)}')">ویرایش</button>` : '';
    return [escapeHTML(row.name), `<span class="badge badge-neutral">${escapeHTML(row.kind || 'طرف حساب')}</span>`, escapeHTML(row.phone || '—'), money(Math.max(0, row.balance)), money(Math.max(0, -row.balance)), status, actions];
  });
  return `<div class="metrics-grid metrics-grid-two">${metric('طلب از مشتریان', money(totals.receivable), 'فروش‌های ثبت‌شده به‌صورت نسیه', 'amber', 'parties')}${metric('بدهی به تأمین‌کنندگان', money(totals.payable), 'خریدهای نسیه و چکی', 'coral', 'purchases')}</div>${card('بدهکاران و بستانکاران', `${toolbar('party-search', 'جست‌وجوی نام یا شماره تماس', add)}${table(['نام شخص / شرکت', 'نوع حساب', 'شماره تماس', 'طلب ما', 'بدهی ما', 'وضعیت', ''], rows, 'با ثبت خرید و فروش نسیه، مانده‌ها در این قسمت جمع می‌شوند.')}`.replace('<table>', '<table data-filter-table="party-search">'), { subtitle: 'مانده محاسباتی از مانده آغازین و اسناد نسیه/چکی است؛ ثبت تسویه‌های جداگانه در این نسخه موجود نیست.' })}`;
};
function editParty(id) {
  const party = db.parties.find(row => row.id == id) || { id: uid(), name: '', kind: 'مشترک', phone: '', opening_balance: 0 };
  showForm(id ? 'ویرایش طرف حساب' : 'افزودن طرف حساب', [
    { key: 'name', label: 'نام شخص / شرکت', required: true }, { key: 'kind', label: 'نوع حساب', options: ['مشتری', 'تأمین‌کننده', 'مشترک'] }, { key: 'phone', label: 'شماره تماس' }, { key: 'opening_balance', label: 'مانده آغازین (تومان)', type: 'number', note: 'مثبت: طلب از طرف حساب؛ منفی: بدهی ما به او.' }
  ], party, values => { put('parties', { ...party, ...values, opening_balance: number(values.opening_balance) }); toast('طرف حساب ذخیره شد.'); render(); });
}

V.expenses = () => {
  const add = isAdmin() ? '<button class="button button-primary" onclick="addExpense()">＋ ثبت هزینه</button>' : '';
  const rows = sortedByDay(db.expenses).slice(0, 200).map(row => [formatDate(row.day), escapeHTML(row.title), `<span class="badge badge-neutral">${escapeHTML(row.category || '—')}</span>`, money(row.amount), escapeHTML(row.pay || '—'), escapeHTML(row.note || '—'), isAdmin() ? `<button class="icon-button danger-button" title="حذف هزینه" onclick="deleteRecord('expenses','${escapeHTML(row.id)}')">×</button>` : '']);
  return card('هزینه‌های فروشگاه', `${toolbar('expense-search', 'جست‌وجوی عنوان یا دسته هزینه', add)}${table(['تاریخ', 'عنوان', 'دسته', 'مبلغ', 'پرداخت', 'توضیحات', ''], rows, 'هنوز هزینه‌ای ثبت نشده است.')}`.replace('<table>', '<table data-filter-table="expense-search">'), { subtitle: 'هزینه‌های ثبت‌شده در گزارش سود خالص لحاظ می‌شوند.' });
};
function addExpense() {
  showForm('ثبت هزینه', [
    { key: 'day', label: 'تاریخ', type: 'date', required: true }, { key: 'title', label: 'عنوان هزینه', required: true }, { key: 'category', label: 'دسته', options: ['اجاره', 'حقوق', 'آب و برق و گاز', 'حمل و نقل', 'اداری', 'لوازم مصرفی', 'سایر'] }, { key: 'amount', label: 'مبلغ (تومان)', type: 'number', required: true }, { key: 'pay', label: 'روش پرداخت', options: PAYMENTS }, { key: 'note', label: 'توضیحات' }
  ], { day: today(), pay: 'نقدی', category: 'سایر' }, values => { put('expenses', { id: uid(), ...values, amount: number(values.amount) }); toast('هزینه ثبت شد.'); render(); });
}

function bankBalance() { return sum(db.bank_transactions, row => number(row.deposit) - number(row.withdrawal)); }
V.bank = () => {
  const balance = bankBalance();
  const add = isAdmin() ? '<button class="button button-primary" onclick="addBankTransaction()">＋ ثبت تراکنش</button>' : '';
  const rows = sortedByDay(db.bank_transactions).map(row => [formatDate(row.day), escapeHTML(row.title), `<span class="badge badge-neutral">${escapeHTML(row.kind || '—')}</span>`, row.deposit ? `<span class="positive-amount">${money(row.deposit)}</span>` : '—', row.withdrawal ? `<span class="negative-amount">${money(row.withdrawal)}</span>` : '—', money(number(row.deposit) - number(row.withdrawal)), isAdmin() ? `<button class="icon-button danger-button" title="حذف تراکنش" onclick="deleteRecord('bank_transactions','${escapeHTML(row.id)}')">×</button>` : '']);
  return `<div class="metrics-grid metrics-grid-two">${metric('مانده دفتر بانک/صندوق', money(balance), 'جمع واریزی‌ها منهای برداشت‌ها', balance < 0 ? 'coral' : 'green', 'bank')}${metric('تعداد رویدادهای ثبت‌شده', format(db.bank_transactions.length), 'شامل افتتاحیه، واریز و برداشت', 'slate', 'reports')}</div>${card('گردش بانک و قرض', `${toolbar('bank-search', 'جست‌وجوی شرح تراکنش', add)}${table(['تاریخ', 'شرح تراکنش', 'نوع', 'واریز', 'برداشت', 'اثر بر مانده', ''], rows, 'برای آغاز محاسبه، مانده افتتاحیه را ثبت کنید.')}`.replace('<table>', '<table data-filter-table="bank-search">'), { subtitle: 'مانده از ابتدای دوره با جمع تراکنش‌های ثبت‌شده محاسبه می‌شود.' })}`;
};
function addBankTransaction() {
  showForm('ثبت تراکنش بانک / قرض', [
    { key: 'day', label: 'تاریخ', type: 'date', required: true }, { key: 'kind', label: 'نوع تراکنش', options: ['مانده افتتاحیه', 'واریز', 'برداشت', 'دریافت وام', 'پرداخت قسط وام'] }, { key: 'amount', label: 'مبلغ (تومان)', type: 'number', required: true }, { key: 'title', label: 'شرح تراکنش', required: true }
  ], { day: today(), kind: 'واریز' }, values => {
    const outgoing = ['برداشت', 'پرداخت قسط وام'].includes(values.kind);
    put('bank_transactions', { id: uid(), day: values.day, title: values.title, kind: values.kind, deposit: outgoing ? 0 : number(values.amount), withdrawal: outgoing ? number(values.amount) : 0 });
    toast('تراکنش ثبت شد.'); render();
  });
}

V.reports = () => {
  const options = monthOptions(selectedReportMonth, 12).map(item => `<option value="${item.key}" ${selectedReportMonth === item.key ? 'selected' : ''}>${item.label}</option>`).join('');
  const report = reportFor(selectedReportMonth);
  const dataRows = allReportMonths().reverse().map(month => {
    const row = reportFor(month);
    return [monthLabel(month), money(row.grossSales), money(row.returned), money(row.netSales), money(row.costOfGoods), money(row.grossProfit), money(row.expenseTotal), `<b>${money(row.netProfit)}</b>`, `${format(row.margin * 100)}٪`];
  });
  return `<section class="report-toolbar"><div><span class="eyebrow">خلاصه عملکرد</span><h2>${monthLabel(selectedReportMonth)}</h2><p>محاسبات بر اساس سوابق ثبت‌شده در پنل</p></div><div class="report-actions"><label class="field"><span>انتخاب ماه</span><select onchange="setReportMonth(this.value)">${options}</select></label><button class="button button-secondary" onclick="exportReport()">دریافت CSV</button></div></section>
    <div class="metrics-grid">${metric('فروش کل', money(report.grossSales), 'مجموع فاکتورهای ماه', 'green', 'sales')}${metric('برگشتی‌ها', money(report.returned), 'مبلغ برگشت ثبت‌شده', 'coral', 'returns')}${metric('فروش خالص', money(report.netSales), 'فروش کل منهای برگشتی', 'slate', 'reports')}${metric('بهای تمام‌شده', money(report.costOfGoods), 'مبنای قیمت خرید کالاها', 'slate', 'stock')}${metric('سود ناخالص', money(report.grossProfit), 'فروش خالص منهای بهای تمام‌شده', 'amber', 'reports')}${metric('هزینه‌ها', money(report.expenseTotal), 'هزینه‌های ثبت‌شده', 'coral', 'expenses')}${metric('سود خالص', money(report.netProfit), 'سود ناخالص منهای هزینه‌ها', report.netProfit < 0 ? 'coral' : 'green', 'bank')}${metric('حاشیه سود', `${format(report.margin * 100)}٪`, 'سود ناخالص تقسیم بر فروش خالص', 'amber', 'reports')}</div>
    ${card('گزارش ماهانه', table(['ماه', 'فروش کل', 'برگشتی‌ها', 'فروش خالص', 'بهای تمام‌شده', 'سود ناخالص', 'هزینه‌ها', 'سود خالص', 'حاشیه سود'], dataRows, 'برای گزارش‌گیری، فروش و هزینه ثبت کنید.'), { subtitle: 'مبالغ به تومان · ماه‌ها بر مبنای تقویم شمسی' })}`;
};
function setReportMonth(value) { selectedReportMonth = value; render(); }
function exportReport() {
  const row = reportFor(selectedReportMonth);
  const lines = [
    ['شاخص', 'مقدار (تومان)'],
    ['ماه', monthLabel(selectedReportMonth)], ['فروش کل', row.grossSales], ['برگشتی‌ها', row.returned], ['فروش خالص', row.netSales], ['بهای تمام‌شده', row.costOfGoods], ['سود ناخالص', row.grossProfit], ['هزینه‌ها', row.expenseTotal], ['سود خالص', row.netProfit], ['حاشیه سود', `${(row.margin * 100).toFixed(1)}%`]
  ];
  const csv = '\uFEFF' + lines.map(line => line.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = `گزارش-${selectedReportMonth}.csv`; link.click(); URL.revokeObjectURL(url);
}

function optionList(options, selected) {
  return options.map(option => {
    const value = typeof option === 'object' ? option.value : option;
    const label = typeof option === 'object' ? option.label : option;
    return `<option value="${escapeHTML(value)}" ${value == selected ? 'selected' : ''}>${escapeHTML(label)}</option>`;
  }).join('');
}
function showForm(title, fields, initial, save) {
  const dialog = document.createElement('dialog');
  const inputs = fields.map(field => {
    const id = `field-${field.key}`;
    const required = field.required ? 'required' : '';
    let control;
    if (field.options) control = `<select id="${id}" name="${field.key}" ${required}><option value="">انتخاب کنید</option>${optionList(field.options, initial[field.key])}</select>`;
    else if (field.type === 'textarea') control = `<textarea id="${id}" name="${field.key}" placeholder="${escapeHTML(field.placeholder || '')}" ${required}>${escapeHTML(initial[field.key] ?? '')}</textarea>`;
    else control = `<input id="${id}" name="${field.key}" type="${field.type || 'text'}" ${field.type === 'number' ? `min="${field.min ?? 0}" step="any" inputmode="decimal"` : ''} value="${escapeHTML(initial[field.key] ?? '')}" placeholder="${escapeHTML(field.placeholder || '')}" ${required}>`;
    return `<label class="field" for="${id}"><span>${field.label}${field.required ? ' <i>*</i>' : ''}</span>${control}${field.note ? `<small>${field.note}</small>` : ''}</label>`;
  }).join('');
  dialog.className = 'app-dialog';
  dialog.innerHTML = `<form method="dialog" class="dialog-form"><div class="dialog-heading"><div><p class="eyebrow">فرم اطلاعات</p><h2>${title}</h2></div><button class="icon-button" type="button" aria-label="بستن" onclick="this.closest('dialog').close('cancel')">×</button></div><div class="dialog-fields">${inputs}</div><div class="dialog-actions"><button class="button button-secondary" value="cancel" formnovalidate>انصراف</button><button class="button button-primary" value="save">ذخیره اطلاعات</button></div></form>`;
  document.body.append(dialog);
  dialog.showModal();
  dialog.addEventListener('close', () => {
    if (dialog.returnValue === 'save') {
      const values = {};
      fields.forEach(field => {
        const control = dialog.querySelector(`[name="${field.key}"]`);
        values[field.key] = field.type === 'number' ? number(control.value) : control.value;
      });
      save(values);
    }
    dialog.remove();
  }, { once: true });
}

addEventListener('online', () => { setStatus(); sync(); });
addEventListener('offline', setStatus);
setInterval(sync, 60000);
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(error => console.warn(error));
boot();
