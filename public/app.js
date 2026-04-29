// === State ===
let currentUser = null;
let pendingResetToken = null;
let timerState = 'stopped'; // stopped, running, paused
let timerStart_ts = null;
let timerPaused_ts = null;
let timerElapsed = 0; // ms accumulated before current run
let timerInterval = null;
let pipWindow = null;
let pipInterval = null;
let entriesData = [];
let reportData = [];
let entriesReqId = 0;
let reportsReqId = 0;
let sortField = 'date';
let sortDir = 'desc';
let editingUserId = null;
let editingCustomerId = null;
let editingEntryId = null;
let customersList = []; // full customer objects {id, name, ...}
let descTags = []; // { text, ms, fromDate, toDate, customerId }
let sectionStart_ts = null;
let sectionElapsed = 0;

// === Persistence helpers ===
function saveTimerState() {
  const state = {
    timerState,
    timerElapsed,
    timerStart_ts,
    sectionElapsed,
    sectionStart_ts,
    customerId: document.getElementById('track-customer') ? document.getElementById('track-customer').value : '',
    descInput: document.getElementById('track-desc') ? document.getElementById('track-desc').value : '',
    descTags: descTags.map(tag => ({
      text: tag.text, ms: tag.ms,
      fromDate: tag.fromDate ? tag.fromDate.getTime() : null,
      toDate: tag.toDate ? tag.toDate.getTime() : null,
      customerId: tag.customerId || ''
    })),
    pendingSections
  };
  localStorage.setItem('tt_timer_state', JSON.stringify(state));
}

function restoreTimerState() {
  const raw = localStorage.getItem('tt_timer_state');
  if (!raw) return false;
  try {
    const state = JSON.parse(raw);
    descTags = (state.descTags || []).map(t => ({
      text: t.text, ms: t.ms,
      fromDate: t.fromDate ? new Date(t.fromDate) : null,
      toDate: t.toDate ? new Date(t.toDate) : null,
      customerId: t.customerId || ''
    }));
    pendingSections = state.pendingSections || [];
    if (state.customerId) document.getElementById('track-customer').value = state.customerId;
    if (state.descInput) document.getElementById('track-desc').value = state.descInput;
    renderDescTags();

    if (state.timerState === 'running') {
      timerElapsed = state.timerElapsed || 0;
      timerStart_ts = state.timerStart_ts;
      sectionElapsed = state.sectionElapsed || 0;
      sectionStart_ts = state.sectionStart_ts;
      timerState = 'running';
      updateTimerButtons();
      timerInterval = setInterval(updateTimerDisplay, 250);
      updateTimerDisplay();
      return true;
    } else if (state.timerState === 'paused') {
      timerElapsed = state.timerElapsed || 0;
      sectionElapsed = state.sectionElapsed || 0;
      timerState = 'paused';
      updateTimerButtons();
      document.getElementById('timer-display').textContent = msToHMS(timerElapsed);
      return true;
    } else if (state.timerState === 'stopped' && pendingSections.length > 0) {
      timerState = 'stopped';
      updateTimerButtons();
      renderSaveModalSections();
      document.getElementById('save-modal').style.display = '';
      return true;
    }
  } catch {}
  return false;
}

function clearTimerState() { localStorage.removeItem('tt_timer_state'); }

// === Password reset hash detection ===
function handleResetHash() {
  const m = location.hash.match(/^#reset\?token=([A-Za-z0-9_\-]+)$/);
  if (!m) return false;

  pendingResetToken = m[1];
  history.replaceState(null, '', location.pathname);

  const login = document.getElementById('login-screen');
  const app   = document.getElementById('app');
  const emailReq = document.getElementById('email-required-modal');
  if (login)    login.style.display = 'none';
  if (app)      app.style.display = 'none';
  if (emailReq) emailReq.style.display = 'none';

  const pw1 = document.getElementById('reset-new-pw');
  const pw2 = document.getElementById('reset-confirm-pw');
  const errEl = document.getElementById('reset-error');
  if (pw1) pw1.value = '';
  if (pw2) pw2.value = '';
  if (errEl) errEl.textContent = '';

  document.getElementById('reset-modal').style.display = '';
  return true;
}

// === Init ===
document.addEventListener('DOMContentLoaded', async () => {
  const savedTheme = localStorage.getItem('tt_theme') || 'dark';
  if (savedTheme !== 'light' && !localStorage.getItem('tt_dark_variant')) {
    localStorage.setItem('tt_dark_variant', savedTheme);
  }
  setTheme(savedTheme);
  setLang(currentLang);

  // Event listeners (always set up)
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });
  document.querySelectorAll('th[data-sort]').forEach(th => {
    th.addEventListener('click', () => {
      const field = th.dataset.sort;
      if (sortField === field) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
      else { sortField = field; sortDir = 'asc'; }
      renderEntries();
    });
  });
  document.getElementById('login-pass').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
  document.getElementById('filter-customer').addEventListener('change', loadEntries);
  document.getElementById('filter-user').addEventListener('change', loadEntries);
  document.getElementById('filter-date-range').addEventListener('change', () => {
    onDateRangeChange();
    if (document.getElementById('filter-date-range').value !== 'custom') loadEntries();
  });
  document.getElementById('filter-from').addEventListener('change', loadEntries);
  document.getElementById('filter-to').addEventListener('change', loadEntries);
  document.getElementById('report-customer').addEventListener('change', loadReports);
  document.getElementById('report-user').addEventListener('change', loadReports);
  document.getElementById('report-date-range').addEventListener('change', () => {
    onReportDateRangeChange();
    if (document.getElementById('report-date-range').value !== 'custom') loadReports();
  });
  document.getElementById('report-from').addEventListener('change', loadReports);
  document.getElementById('report-to').addEventListener('change', loadReports);
  document.getElementById('track-desc').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = e.target.value.trim();
      if (!text) return;
      addDescSection(text);
      e.target.value = '';
    }
  });

  // Account modal: ESC to close
  document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    const modal = document.getElementById('account-modal');
    if (modal && modal.style.display !== 'none' && modal.style.display !== '') {
      closeAccountModal();
    }
  });
  // Account modal: click-outside to close
  const accountModal = document.getElementById('account-modal');
  if (accountModal) {
    accountModal.addEventListener('click', e => {
      if (e.target === e.currentTarget) closeAccountModal();
    });
  }

  window.addEventListener('hashchange', () => { handleResetHash(); });

  // Check for password reset token in URL hash before normal auth flow
  if (handleResetHash()) return;

  const modeResp = await fetch('/auth/mode');
  const { mode } = await modeResp.json();
  if (mode === 'oidc') {
    document.getElementById('login-local').style.display = 'none';
    document.getElementById('login-oidc').style.display = '';
  } else {
    document.getElementById('forgot-link').style.display = '';
  }

  try {
    const resp = await fetch('/auth/me');
    if (resp.ok) { currentUser = await resp.json(); showApp(); }
  } catch {}
});

// === Auth ===
async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;
  const errEl = document.getElementById('login-error');
  errEl.textContent = '';
  try {
    const resp = await fetch('/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await resp.json();
    if (!resp.ok) { errEl.textContent = data.error; return; }
    currentUser = data;
    showApp();
  } catch (err) { errEl.textContent = 'Connection error'; }
}

function doOidcLogin() { window.location.href = '/auth/oidc/login'; }

async function doLogout() {
  await fetch('/auth/logout', { method: 'POST' });
  currentUser = null;
  document.getElementById('tab-users').style.display = 'none';
  document.getElementById('th-user').style.display = 'none';
  document.getElementById('filter-user').style.display = 'none';
  document.getElementById('report-user').style.display = 'none';
  document.getElementById('account-btn').style.display = 'none';
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = '';
}

function showApp() {
  document.getElementById('login-screen').style.display = 'none';
  if (currentUser.email === null && currentUser.hasPassword) {
    document.getElementById('email-required-modal').style.display = '';
    return;
  }
  revealApp();
}

function revealApp() {
  document.getElementById('email-required-modal').style.display = 'none';
  document.getElementById('app').style.display = '';
  document.getElementById('user-info').textContent = `${currentUser.username} (${currentUser.role})`;
  document.getElementById('account-btn').style.display = '';
  if (currentUser.role === 'admin') {
    document.getElementById('tab-users').style.display = '';
    document.getElementById('th-user').style.display = '';
    document.getElementById('filter-user').style.display = '';
    document.getElementById('report-user').style.display = '';
    loadUsers();
    loadUserFilters();
  }
  loadCustomers().then(() => {
    if (!restoreTimerState()) {
      const lastId = localStorage.getItem('tt_last_customer_id');
      if (lastId) document.getElementById('track-customer').value = lastId;
    }
  });
  const validTabs = ['tracker', 'entries', 'reports', 'customers', 'users'];
  const hash = location.hash.replace('#', '');
  switchTab(validTabs.includes(hash) ? hash : 'tracker');
}

// === Tabs ===
function switchTab(tab) {
  if (tab === 'users' && (!currentUser || currentUser.role !== 'admin')) return;
  location.hash = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
  document.querySelectorAll('.panel').forEach(p => p.style.display = 'none');
  document.getElementById(`panel-${tab}`).style.display = '';
  if (tab === 'entries') loadEntries();
  if (tab === 'reports') loadReports();
  if (tab === 'users') loadUsers();
  if (tab === 'customers') loadCustomersList();
}

// === Customers ===
async function loadCustomers() {
  try {
    const resp = await fetch('/api/customers');
    customersList = await resp.json();
    populateCustomerSelect('track-customer', true);
    populateCustomerSelect('add-entry-customer', false);
    populateCustomerFilter('filter-customer');
    populateCustomerFilter('report-customer');
  } catch {}
}

function populateCustomerSelect(id, addPlaceholder) {
  const sel = document.getElementById(id);
  const val = sel.value;
  sel.innerHTML = '';
  if (addPlaceholder) {
    sel.innerHTML = `<option value="" data-i18n="selectCustomer">${t('selectCustomer')}</option>`;
  }
  customersList.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  sel.value = val;
}

function populateCustomerFilter(id) {
  const sel = document.getElementById(id);
  const val = sel.value;
  sel.innerHTML = `<option value="" data-i18n="allCustomers">${t('allCustomers')}</option>`;
  customersList.forEach(c => {
    const opt = document.createElement('option');
    opt.value = c.id;
    opt.textContent = c.name;
    sel.appendChild(opt);
  });
  sel.value = val;
}

async function loadCustomersList() {
  try {
    const resp = await fetch('/api/customers');
    const custs = await resp.json();
    const tbody = document.getElementById('customers-body');
    tbody.innerHTML = '';
    custs.forEach(c => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(c.name)}</td>
        <td>${esc(c.contact_person)}</td>
        <td>${esc(c.email)}</td>
        <td>${esc(c.phone)}</td>
        <td>${esc(c.city)}</td>
        <td>
          <button onclick="editCustomer(${c.id})">${t('edit')}</button>
          <button class="btn-danger" onclick="deleteCustomer(${c.id})">${t('delete')}</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch {}
}

function showAddCustomer() {
  editingCustomerId = null;
  document.getElementById('customer-modal-title').textContent = t('addCustomer');
  ['cust-name','cust-contact','cust-email','cust-phone','cust-address','cust-city','cust-zip','cust-country','cust-notes'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('customer-modal').style.display = '';
}

async function editCustomer(id) {
  const resp = await fetch('/api/customers');
  const custs = await resp.json();
  const c = custs.find(x => x.id === id);
  if (!c) return;
  editingCustomerId = id;
  document.getElementById('customer-modal-title').textContent = t('editCustomer');
  document.getElementById('cust-name').value = c.name || '';
  document.getElementById('cust-contact').value = c.contact_person || '';
  document.getElementById('cust-email').value = c.email || '';
  document.getElementById('cust-phone').value = c.phone || '';
  document.getElementById('cust-address').value = c.address || '';
  document.getElementById('cust-city').value = c.city || '';
  document.getElementById('cust-zip').value = c.zip || '';
  document.getElementById('cust-country').value = c.country || '';
  document.getElementById('cust-notes').value = c.notes || '';
  document.getElementById('customer-modal').style.display = '';
}

function closeCustomerModal() {
  document.getElementById('customer-modal').style.display = 'none';
  editingCustomerId = null;
}

async function saveCustomer() {
  const body = {
    name: document.getElementById('cust-name').value.trim(),
    contact_person: document.getElementById('cust-contact').value.trim(),
    email: document.getElementById('cust-email').value.trim(),
    phone: document.getElementById('cust-phone').value.trim(),
    address: document.getElementById('cust-address').value.trim(),
    city: document.getElementById('cust-city').value.trim(),
    zip: document.getElementById('cust-zip').value.trim(),
    country: document.getElementById('cust-country').value.trim(),
    notes: document.getElementById('cust-notes').value.trim(),
  };
  if (!body.name) return;
  if (editingCustomerId) {
    await fetch(`/api/customers/${editingCustomerId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
  } else {
    await fetch('/api/customers', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
    });
  }
  closeCustomerModal();
  loadCustomers();
  loadCustomersList();
}

async function deleteCustomer(id) {
  if (!confirm(t('confirmDeleteCustomer'))) return;
  const resp = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
  if (!resp.ok) {
    const data = await resp.json();
    alert(data.error || t('customerInUse'));
    return;
  }
  loadCustomers();
  loadCustomersList();
}

async function loadUserFilters() {
  try {
    const resp = await fetch('/api/users');
    const users = await resp.json();
    ['filter-user', 'report-user'].forEach(id => {
      const sel = document.getElementById(id);
      sel.innerHTML = `<option value="" data-i18n="allUsers">${t('allUsers')}</option>`;
      users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.username;
        sel.appendChild(opt);
      });
    });
  } catch {}
}

// === Timer ===
function timerStart() {
  const customerId = document.getElementById('track-customer').value;
  if (!customerId) {
    alert(t('customerSelectRequired'));
    document.getElementById('track-customer').focus();
    return;
  }
  const now = Date.now();
  timerState = 'running';
  timerStart_ts = now;
  timerElapsed = 0;
  sectionStart_ts = now;
  sectionElapsed = 0;
  updateTimerButtons();
  timerInterval = setInterval(updateTimerDisplay, 250);
  updateTimerDisplay();
  saveTimerState();
}

function timerPause() {
  const now = Date.now();
  timerState = 'paused';
  timerElapsed += now - timerStart_ts;
  sectionElapsed += now - sectionStart_ts;
  timerPaused_ts = now;
  updateTimerButtons();
  clearInterval(timerInterval);
  saveTimerState();
}

function timerResume() {
  const now = Date.now();
  timerState = 'running';
  timerStart_ts = now;
  sectionStart_ts = now;
  updateTimerButtons();
  timerInterval = setInterval(updateTimerDisplay, 250);
  saveTimerState();
}

let pendingSections = [];

function timerStop() {
  if (timerState === 'stopped') return;
  const nowTs = Date.now();
  const now = new Date(nowTs);
  let remainingSectionMs = sectionElapsed;
  if (timerState === 'running') remainingSectionMs += nowTs - sectionStart_ts;
  const pendingDesc = document.getElementById('track-desc').value.trim();
  if (pendingDesc || remainingSectionMs > 0) {
    descTags.push({
      text: pendingDesc || '—', ms: remainingSectionMs,
      fromDate: new Date(nowTs - remainingSectionMs), toDate: now,
      customerId: document.getElementById('track-customer').value
    });
    document.getElementById('track-desc').value = '';
    renderDescTags();
  }
  clearInterval(timerInterval);
  timerState = 'stopped';
  updateTimerButtons();
  pendingSections = descTags.map(tag => ({
    text: tag.text,
    minutes: Math.round(tag.ms / 60000),
    date: tag.toDate ? formatDate(tag.toDate) : formatDate(now),
    time_from: tag.fromDate ? formatTime(tag.fromDate) : '',
    time_to: tag.toDate ? formatTime(tag.toDate) : '',
    customer_id: tag.customerId || document.getElementById('track-customer').value
  }));
  renderSaveModalSections();
  document.getElementById('save-modal').style.display = '';
  saveTimerState();
}

function renderSaveModalSections() {
  const container = document.getElementById('save-sections');
  container.innerHTML = '';
  let totalMin = 0;
  pendingSections.forEach((s, i) => {
    totalMin += s.minutes;
    const row = document.createElement('div');
    row.className = 'save-section-row';
    const topLine = document.createElement('div');
    topLine.className = 'save-section-top';
    const custSelect = document.createElement('select');
    custSelect.className = 'save-section-customer';
    customersList.forEach(c => {
      const opt = document.createElement('option');
      opt.value = c.id;
      opt.textContent = c.name;
      custSelect.appendChild(opt);
    });
    custSelect.value = s.customer_id;
    custSelect.addEventListener('change', e => {
      pendingSections[i].customer_id = e.target.value;
      saveTimerState();
    });
    const removeBtn = document.createElement('span');
    removeBtn.className = 'save-section-remove';
    removeBtn.dataset.index = i;
    removeBtn.innerHTML = '&times;';
    const timeSpan = document.createElement('span');
    timeSpan.className = 'save-section-time';
    timeSpan.textContent = `${s.time_from} → ${s.time_to} (${s.minutes} min)`;
    topLine.appendChild(custSelect);
    topLine.appendChild(timeSpan);
    topLine.appendChild(removeBtn);
    row.appendChild(topLine);
    const bottomHTML = document.createElement('div');
    bottomHTML.className = 'save-section-top';
    bottomHTML.innerHTML = `
      <input type="text" class="save-section-desc" value="${esc(s.text).replace(/"/g, '&quot;')}">
    `;
    row.appendChild(bottomHTML);
    bottomHTML.querySelector('.save-section-desc').addEventListener('input', e => {
      pendingSections[i].text = e.target.value;
      saveTimerState();
    });
    removeBtn.addEventListener('click', () => {
      pendingSections.splice(i, 1);
      descTags.splice(i, 1);
      renderDescTags();
      renderSaveModalSections();
      saveTimerState();
    });
    container.appendChild(row);
  });
  document.getElementById('save-total-info').textContent = `${totalMin} min`;
}

async function confirmSave() {
  for (const section of pendingSections) {
    if (!section.customer_id) { alert(t('customerSelectRequired')); return; }
  }
  try {
    let lastCustomerId = '';
    for (const section of pendingSections) {
      await fetch('/api/entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer_id: parseInt(section.customer_id, 10),
          description: section.text, date: section.date,
          time_from: section.time_from, time_to: section.time_to,
          minutes: section.minutes
        })
      });
      lastCustomerId = section.customer_id;
    }
    if (lastCustomerId) localStorage.setItem('tt_last_customer_id', lastCustomerId);
    showNotification(t('entrySaved'));
    loadCustomers();
  } catch {}
  document.getElementById('save-modal').style.display = 'none';
  resetTimer();
}

function discardSave() {
  document.getElementById('save-modal').style.display = 'none';
  resetTimer();
}

function resetTimer() {
  timerElapsed = 0; timerStart_ts = null;
  sectionStart_ts = null; sectionElapsed = 0;
  pendingSections = [];
  document.getElementById('timer-display').textContent = '00:00:00';
  const lastId = localStorage.getItem('tt_last_customer_id');
  if (lastId) document.getElementById('track-customer').value = lastId;
  descTags = [];
  renderDescTags();
  document.getElementById('track-desc').value = '';
  clearTimerState();
}

function renderDescTags() {
  const container = document.getElementById('desc-tags');
  container.innerHTML = '';
  descTags.forEach((tag, i) => {
    const el = document.createElement('span');
    el.className = 'desc-tag';
    const mins = Math.round(tag.ms / 60000);
    const timeLabel = tag.ms > 0 ? ` (${mins} min)` : '';
    const cust = customersList.find(c => String(c.id) === String(tag.customerId));
    const custLabel = cust ? `<span class="desc-tag-customer">${esc(cust.name)}</span> ` : '';
    el.innerHTML = `${custLabel}${esc(tag.text)}${timeLabel}<span class="desc-tag-remove" data-index="${i}">&times;</span>`;
    el.querySelector('.desc-tag-remove').addEventListener('click', () => {
      descTags.splice(i, 1);
      renderDescTags();
    });
    container.appendChild(el);
  });
}

function updateTimerButtons() {
  document.getElementById('btn-start').style.display = timerState === 'stopped' ? '' : 'none';
  document.getElementById('btn-pause').style.display = timerState === 'running' ? '' : 'none';
  document.getElementById('btn-resume').style.display = timerState === 'paused' ? '' : 'none';
  document.getElementById('btn-stop').style.display = timerState !== 'stopped' ? '' : 'none';
  updatePipButtons();
}

function updateTimerDisplay() {
  let total = timerElapsed;
  if (timerState === 'running') total += Date.now() - timerStart_ts;
  const str = msToHMS(total);
  document.getElementById('timer-display').textContent = str;
  updatePipTimer(str);
}

function msToHMS(ms) {
  const s = Math.floor(ms / 1000);
  return String(Math.floor(s / 3600)).padStart(2, '0') + ':' +
    String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' +
    String(s % 60).padStart(2, '0');
}

function formatTime(d) { return d.toTimeString().slice(0, 5); }
function formatDate(d) { return d.toISOString().slice(0, 10); }

function addDescSection(text) {
  if (!text) return;
  const currentCustomerId = document.getElementById('track-customer').value;
  if (timerState === 'stopped') {
    descTags.push({ text, ms: 0, fromDate: null, toDate: null, customerId: currentCustomerId });
  } else {
    const now = Date.now();
    let sectionMs = sectionElapsed;
    if (timerState === 'running') sectionMs += now - sectionStart_ts;
    descTags.push({ text, ms: sectionMs, fromDate: new Date(now - sectionMs), toDate: new Date(now), customerId: currentCustomerId });
    sectionElapsed = 0;
    sectionStart_ts = (timerState === 'running') ? now : null;
  }
  renderDescTags();
  renderPipTags();
  saveTimerState();
}

// === Picture-in-Picture ===
const PIP_PALETTE_TOKENS = [
  '--bg', '--bg-card', '--bg-input', '--bg-header', '--bg-hover', '--bg-elevated',
  '--text', '--text-muted', '--text-dim',
  '--accent', '--accent-hover', '--accent-subtle', '--accent-glow',
  '--danger', '--danger-subtle',
  '--border', '--border-subtle',
  '--radius', '--radius-sm', '--radius-lg',
  '--shadow',
];

function buildPipPaletteCss() {
  const cs = getComputedStyle(document.documentElement);
  const decls = PIP_PALETTE_TOKENS
    .map(name => `${name}: ${cs.getPropertyValue(name).trim()};`)
    .filter(d => !d.endsWith(': ;'))
    .join(' ');
  return `:root { ${decls} }`;
}

function applyPipTheme(doc) {
  const theme = document.documentElement.getAttribute('data-theme') || 'dark';
  doc.documentElement.setAttribute('data-theme', theme);
  let paletteEl = doc.getElementById('pip-palette');
  if (!paletteEl) {
    paletteEl = doc.createElement('style');
    paletteEl.id = 'pip-palette';
    doc.head.insertBefore(paletteEl, doc.head.firstChild);
  }
  paletteEl.textContent = buildPipPaletteCss();
}

const pipStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@400&family=Outfit:wght@400;500&display=swap');
  body {
    font-family: 'DM Mono', monospace;
    background: var(--bg);
    color: var(--text);
    display: flex; flex-direction: column; align-items: center; justify-content: center;
    height: 100vh; margin: 0; gap: 8px; padding: 10px;
    -webkit-font-smoothing: antialiased; box-sizing: border-box;
  }
  * { box-sizing: border-box; }
  .pip-timer {
    font-size: 2.2rem; font-weight: 400; color: var(--text);
    font-variant-numeric: tabular-nums; letter-spacing: 0.04em;
  }
  .pip-controls { display: flex; gap: 6px; }
  .pip-controls button {
    padding: 5px 14px; border: none; border-radius: var(--radius-sm);
    font-size: 0.8rem; cursor: pointer;
    font-family: 'Outfit', sans-serif; font-weight: 500;
  }
  .pip-controls button.hidden { display: none; }
  #pip-play  { background: var(--accent); color: var(--bg); }
  #pip-play:hover  { background: var(--accent-hover); }
  #pip-pause { background: var(--bg-hover); color: var(--text); }
  #pip-pause:hover { background: var(--bg-elevated); }
  #pip-stop  { background: transparent; border: 1px solid var(--danger); color: var(--danger); }
  #pip-stop:hover  { background: var(--danger-subtle); }
  .pip-topic-input {
    width: 90%; padding: 5px 8px;
    border: 1px solid var(--border); border-radius: var(--radius-sm);
    background: var(--bg-input); color: var(--text);
    font-family: 'Outfit', sans-serif; font-size: 0.75rem; outline: none;
  }
  .pip-topic-input:focus { border-color: var(--accent); }
  .pip-topic-input::placeholder { color: var(--text-dim); }
  .pip-tags {
    display: flex; flex-wrap: wrap; gap: 3px; width: 90%;
    justify-content: center; max-height: 40px; overflow-y: auto;
  }
  .pip-tag {
    display: inline-flex; align-items: center; gap: 3px;
    background: var(--accent-subtle); color: var(--accent);
    padding: 1px 6px; border-radius: 99px; font-size: 0.65rem;
    font-family: 'Outfit', sans-serif; border: 1px solid var(--accent-subtle);
  }
  .pip-tag-x { cursor: pointer; opacity: 0.6; font-size: 0.7rem; }
  .pip-tag-x:hover { opacity: 1; }
  [data-theme="terminal"] body {
    background:
      radial-gradient(circle at 1px 1px, rgba(0, 212, 170, 0.04) 1px, transparent 0) 0 0 / 24px 24px,
      var(--bg);
  }
`;

function openPiP() {
  if ('documentPictureInPicture' in window) {
    window.documentPictureInPicture.requestWindow({ width: 340, height: 240 }).then(win => {
      pipWindow = win;
      const doc = win.document;
      applyPipTheme(doc);
      const style = doc.createElement('style');
      style.textContent = pipStyles;
      doc.head.appendChild(style);
      doc.body.innerHTML = `
        <div class="pip-timer" id="pip-time">${document.getElementById('timer-display').textContent}</div>
        <div class="pip-controls">
          <button id="pip-play">▶</button><button id="pip-pause">⏸</button><button id="pip-stop">⏹</button>
        </div>
        <div class="pip-tags" id="pip-tags"></div>
        <input type="text" class="pip-topic-input" id="pip-topic" placeholder="${t('descriptionPh')}">`;
      doc.getElementById('pip-play').onclick = () => { if (timerState === 'stopped') timerStart(); else if (timerState === 'paused') timerResume(); };
      doc.getElementById('pip-pause').onclick = () => { if (timerState === 'running') timerPause(); };
      doc.getElementById('pip-stop').onclick = () => timerStop();
      doc.getElementById('pip-topic').addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          const text = e.target.value.trim();
          if (!text) return;
          addDescSection(text);
          e.target.value = '';
          // Also clear main input
          document.getElementById('track-desc').value = '';
        }
      });
      updatePipButtons();
      renderPipTags();
      win.addEventListener('pagehide', () => { pipWindow = null; });
    }).catch(() => openPipPopup());
    return;
  }
  openPipPopup();
}

function openPipPopup() {
  const popup = window.open('', 'pip-timer', 'width=340,height=240,toolbar=no,menubar=no');
  if (!popup) return;
  pipWindow = popup;
  popup.document.write(`<!DOCTYPE html><html><head><style id="pip-palette"></style><style>${pipStyles}</style></head><body>
    <div class="pip-timer" id="pip-time">${document.getElementById('timer-display').textContent}</div>
    <div class="pip-controls"><button id="pip-play">▶</button><button id="pip-pause">⏸</button><button id="pip-stop">⏹</button></div>
    <div class="pip-tags" id="pip-tags"></div>
    <input type="text" class="pip-topic-input" id="pip-topic" placeholder="${t('descriptionPh')}">
  </body></html>`);
  popup.document.close();
  applyPipTheme(popup.document);
  popup.document.getElementById('pip-play').onclick = () => { if (timerState === 'stopped') timerStart(); else if (timerState === 'paused') timerResume(); };
  popup.document.getElementById('pip-pause').onclick = () => { if (timerState === 'running') timerPause(); };
  popup.document.getElementById('pip-stop').onclick = () => timerStop();
  popup.document.getElementById('pip-topic').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = e.target.value.trim();
      if (!text) return;
      addDescSection(text);
      e.target.value = '';
      document.getElementById('track-desc').value = '';
    }
  });
  updatePipButtons();
  renderPipTags();
  popup.addEventListener('beforeunload', () => { pipWindow = null; });
}

function updatePipButtons() {
  if (!pipWindow) return;
  try {
    const doc = pipWindow.document;
    const play = doc.getElementById('pip-play');
    if (!play) return;
    play.classList.toggle('hidden', timerState === 'running');
    doc.getElementById('pip-pause').classList.toggle('hidden', timerState !== 'running');
    doc.getElementById('pip-stop').classList.toggle('hidden', timerState === 'stopped');
  } catch { pipWindow = null; }
}

function updatePipTimer(str) {
  if (!pipWindow) return;
  try {
    const el = pipWindow.document.getElementById('pip-time');
    if (el) el.textContent = str;
    updatePipButtons();
  } catch { pipWindow = null; }
}

function renderPipTags() {
  if (!pipWindow) return;
  try {
    const container = pipWindow.document.getElementById('pip-tags');
    if (!container) return;
    container.innerHTML = '';
    descTags.forEach((tag, i) => {
      const el = pipWindow.document.createElement('span');
      el.className = 'pip-tag';
      const mins = Math.round(tag.ms / 60000);
      const timeLabel = tag.ms > 0 ? ` (${mins}m)` : '';
      el.innerHTML = `${esc(tag.text)}${timeLabel} <span class="pip-tag-x" data-i="${i}">&times;</span>`;
      el.querySelector('.pip-tag-x').addEventListener('click', () => {
        descTags.splice(i, 1);
        renderDescTags();
        renderPipTags();
        saveTimerState();
      });
      container.appendChild(el);
    });
  } catch {}
}

// === Notifications ===
function toggleNotifications() {
  const chk = document.getElementById('chk-notify');
  if (chk.checked) {
    Notification.requestPermission().then(perm => {
      if (perm === 'granted') showNotification(t('notifEnabled'));
      else { alert(t('notifDenied')); chk.checked = false; }
    });
  }
}

function showNotification(msg) {
  if (document.getElementById('chk-notify').checked && Notification.permission === 'granted') {
    new Notification('ClockClock', { body: msg });
  }
}

// === Theme ===
function setTheme(name) {
  document.documentElement.setAttribute('data-theme', name);
  localStorage.setItem('tt_theme', name);
  if (name !== 'light') localStorage.setItem('tt_dark_variant', name);
  document.querySelectorAll('.theme-toggle').forEach(btn => {
    btn.textContent = name === 'light' ? '🌙' : '☀️';
  });
  document.querySelectorAll('[data-theme-pick]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-theme-pick') === name);
  });
  if (pipWindow) {
    try { applyPipTheme(pipWindow.document); }
    catch { pipWindow = null; }
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  if (current === 'light') {
    setTheme(localStorage.getItem('tt_dark_variant') || 'dark');
  } else {
    setTheme('light');
  }
}

// === Date range helpers ===
function getDateRange(rangeId, fromId, toId) {
  const range = document.getElementById(rangeId).value;
  const today = new Date();
  let dateFrom = '', dateTo = '';
  switch (range) {
    case 'today': dateFrom = dateTo = formatDate(today); break;
    case 'week': {
      const mon = new Date(today);
      mon.setDate(today.getDate() - ((today.getDay() + 6) % 7));
      dateFrom = formatDate(mon); dateTo = formatDate(today); break;
    }
    case 'month': dateFrom = formatDate(today).slice(0, 8) + '01'; dateTo = formatDate(today); break;
    case 'custom': dateFrom = document.getElementById(fromId).value; dateTo = document.getElementById(toId).value; break;
  }
  return { dateFrom, dateTo };
}

function onDateRangeChange() {
  document.getElementById('custom-dates').style.display = document.getElementById('filter-date-range').value === 'custom' ? '' : 'none';
}
function onReportDateRangeChange() {
  document.getElementById('report-custom-dates').style.display = document.getElementById('report-date-range').value === 'custom' ? '' : 'none';
}

// === Entries ===
async function loadEntries() {
  const myId = ++entriesReqId;
  const { dateFrom, dateTo } = getDateRange('filter-date-range', 'filter-from', 'filter-to');
  const customerId = document.getElementById('filter-customer').value;
  const userId = document.getElementById('filter-user').value;
  const params = new URLSearchParams();
  if (customerId) params.set('customerId', customerId);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  if (userId) params.set('userId', userId);
  try {
    const resp = await fetch(`/api/entries?${params}`);
    const data = await resp.json();
    if (myId !== entriesReqId) return;
    entriesData = data;
    renderEntries();
  } catch {}
}

function renderEntries() {
  const sorted = [...entriesData].sort((a, b) => {
    let va = a[sortField] || a.customer_name, vb = b[sortField] || b.customer_name;
    if (sortField === 'minutes') { va = Number(va); vb = Number(vb); }
    if (va < vb) return sortDir === 'asc' ? -1 : 1;
    if (va > vb) return sortDir === 'asc' ? 1 : -1;
    return 0;
  });
  document.querySelectorAll('th[data-sort]').forEach(th => {
    const existing = th.querySelector('.sort-arrow');
    if (existing) existing.remove();
    if (th.dataset.sort === sortField) {
      const arrow = document.createElement('span');
      arrow.className = 'sort-arrow';
      arrow.textContent = sortDir === 'asc' ? '▲' : '▼';
      th.appendChild(arrow);
    }
  });
  const isAdmin = currentUser && currentUser.role === 'admin';
  const tbody = document.getElementById('entries-body');
  tbody.innerHTML = '';
  sorted.forEach(e => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(e.customer_name || e.customer)}</td>
      <td>${esc(e.date)}</td>
      <td>${esc(e.time_from)}</td>
      <td>${esc(e.time_to)}</td>
      <td>${e.minutes}</td>
      <td>${esc(e.description)}</td>
      ${isAdmin ? `<td>${esc(e.username)}</td>` : ''}
      <td>
        <button onclick="editEntry(${e.id})">${t('edit')}</button>
        <button class="btn-danger" onclick="deleteEntry(${e.id})">${t('delete')}</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function deleteEntry(id) {
  if (!confirm(t('confirmDelete'))) return;
  await fetch(`/api/entries/${id}`, { method: 'DELETE' });
  loadEntries();
}

// === CSV Export ===
function exportCsv() {
  const isAdmin = currentUser && currentUser.role === 'admin';
  const headers = [t('csvCustomer'), t('csvDate'), t('csvFrom'), t('csvTo'), t('csvMinutes'), t('csvDescription')];
  if (isAdmin) headers.push(t('csvUser'));
  const rows = entriesData.map(e => {
    const row = [e.customer_name || e.customer, e.date, e.time_from, e.time_to, e.minutes, e.description];
    if (isAdmin) row.push(e.username);
    return row.map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(',');
  });
  const csv = '\uFEFF' + headers.join(',') + '\n' + rows.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `clockclock_${formatDate(new Date())}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

// === Manual Entry ===
function showAddEntry() {
  editingEntryId = null;
  const now = new Date();
  const lastId = localStorage.getItem('tt_last_customer_id');
  if (lastId) document.getElementById('add-entry-customer').value = lastId;
  document.getElementById('add-entry-desc').value = '';
  document.getElementById('add-entry-date').value = formatDate(now);
  document.getElementById('add-entry-from').value = '';
  document.getElementById('add-entry-to').value = '';
  document.getElementById('add-entry-duration').textContent = '';
  document.getElementById('add-entry-title').textContent = t('addEntry');
  document.getElementById('add-entry-modal').style.display = '';
  document.getElementById('add-entry-from').onchange = updateAddEntryDuration;
  document.getElementById('add-entry-to').onchange = updateAddEntryDuration;
}

function editEntry(id) {
  const entry = entriesData.find(e => e.id === id);
  if (!entry) return;
  editingEntryId = id;
  document.getElementById('add-entry-customer').value = entry.customer_id || '';
  document.getElementById('add-entry-desc').value = entry.description || '';
  document.getElementById('add-entry-date').value = entry.date;
  document.getElementById('add-entry-from').value = entry.time_from;
  document.getElementById('add-entry-to').value = entry.time_to;
  document.getElementById('add-entry-title').textContent = t('editEntry');
  document.getElementById('add-entry-modal').style.display = '';
  document.getElementById('add-entry-from').onchange = updateAddEntryDuration;
  document.getElementById('add-entry-to').onchange = updateAddEntryDuration;
  updateAddEntryDuration();
}

function updateAddEntryDuration() {
  const from = document.getElementById('add-entry-from').value;
  const to = document.getElementById('add-entry-to').value;
  const el = document.getElementById('add-entry-duration');
  if (from && to) {
    const [fh, fm] = from.split(':').map(Number);
    const [th, tm] = to.split(':').map(Number);
    let mins = (th * 60 + tm) - (fh * 60 + fm);
    if (mins < 0) mins += 1440;
    el.textContent = `${mins} min`;
  } else { el.textContent = ''; }
}

function closeAddEntry() { document.getElementById('add-entry-modal').style.display = 'none'; }

async function saveManualEntry() {
  const customerId = document.getElementById('add-entry-customer').value;
  if (!customerId) { alert(t('customerSelectRequired')); return; }
  const date = document.getElementById('add-entry-date').value;
  const time_from = document.getElementById('add-entry-from').value;
  const time_to = document.getElementById('add-entry-to').value;
  const description = document.getElementById('add-entry-desc').value.trim();
  if (!date || !time_from || !time_to) return;
  const [fh, fm] = time_from.split(':').map(Number);
  const [th, tm] = time_to.split(':').map(Number);
  let minutes = (th * 60 + tm) - (fh * 60 + fm);
  if (minutes < 0) minutes += 1440;
  try {
    if (editingEntryId) {
      await fetch(`/api/entries/${editingEntryId}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: parseInt(customerId, 10), date, time_from, time_to, minutes, description })
      });
    } else {
      await fetch('/api/entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer_id: parseInt(customerId, 10), date, time_from, time_to, minutes, description })
      });
    }
    localStorage.setItem('tt_last_customer_id', customerId);
    loadCustomers(); loadEntries();
  } catch {}
  closeAddEntry();
}

// === Reports ===
async function loadReports() {
  const myId = ++reportsReqId;
  const { dateFrom, dateTo } = getDateRange('report-date-range', 'report-from', 'report-to');
  const customerId = document.getElementById('report-customer').value;
  const userId = document.getElementById('report-user').value;
  const params = new URLSearchParams();
  if (customerId) params.set('customerId', customerId);
  if (dateFrom) params.set('dateFrom', dateFrom);
  if (dateTo) params.set('dateTo', dateTo);
  if (userId) params.set('userId', userId);
  try {
    const resp = await fetch(`/api/entries?${params}`);
    const data = await resp.json();
    if (myId !== reportsReqId) return;
    reportData = data;
    const totalEntries = reportData.length;
    const totalMinutes = reportData.reduce((s, e) => s + e.minutes, 0);
    document.getElementById('rpt-total').textContent = totalEntries;
    document.getElementById('rpt-minutes').textContent = totalMinutes;
    document.getElementById('rpt-hours').textContent = (totalMinutes / 60).toFixed(1);
    const byCustomer = {};
    reportData.forEach(e => {
      const name = e.customer_name || e.customer;
      if (!byCustomer[name]) byCustomer[name] = { count: 0, minutes: 0, id: e.customer_id };
      byCustomer[name].count++;
      byCustomer[name].minutes += e.minutes;
    });
    const tbody = document.getElementById('report-body');
    tbody.innerHTML = '';
    Object.keys(byCustomer).sort().forEach(c => {
      const { count, minutes } = byCustomer[c];
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${esc(c)}</td><td>${count}</td><td>${minutes}</td><td>${(minutes / 60).toFixed(1)}</td>`;
      tbody.appendChild(tr);
    });
  } catch {}
}

// === PDF Export ===
function exportReportPdf() {
  if (!reportData || reportData.length === 0) { loadReports().then(() => exportReportPdf()); return; }

  const range = document.getElementById('report-date-range').value;
  let dateLabel = t('allTime');
  if (range === 'today') dateLabel = t('today');
  else if (range === 'week') dateLabel = t('thisWeek');
  else if (range === 'month') dateLabel = t('thisMonth');
  else if (range === 'custom') {
    const from = document.getElementById('report-from').value;
    const to = document.getElementById('report-to').value;
    dateLabel = `${from || '...'} — ${to || '...'}`;
  }

  const byCustomer = {};
  reportData.forEach(e => {
    const name = e.customer_name || e.customer;
    if (!byCustomer[name]) byCustomer[name] = { entries: [], minutes: 0, customerId: e.customer_id };
    byCustomer[name].entries.push(e);
    byCustomer[name].minutes += e.minutes;
  });

  const getCustomerInfo = (custId) => customersList.find(c => c.id === custId) || {};

  let html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title> </title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 11px; color: #222; margin: 20px; }
    .date-range { font-size: 12px; color: #666; margin-bottom: 16px; }
    .customer-block { margin-bottom: 18px; page-break-inside: avoid; }
    .customer-name { font-size: 13px; font-weight: bold; margin-bottom: 2px; }
    .customer-info { font-size: 10px; color: #666; margin-bottom: 6px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 4px; }
    th { text-align: left; border-bottom: 1px solid #ccc; padding: 3px 6px; font-size: 10px; color: #666; }
    td { padding: 3px 6px; border-bottom: 1px solid #eee; font-size: 11px; }
    .total-row { font-weight: bold; border-top: 1px solid #999; }
    .grand-total { margin-top: 16px; font-size: 12px; font-weight: bold; border-top: 2px solid #333; padding-top: 6px; }
  </style></head><body>`;

  html += `<div class="date-range">${dateLabel}</div>`;

  let grandMinutes = 0;
  Object.keys(byCustomer).sort().forEach(name => {
    const group = byCustomer[name];
    const info = getCustomerInfo(group.customerId);
    grandMinutes += group.minutes;
    html += `<div class="customer-block"><div class="customer-name">${esc(name)}</div>`;
    const parts = [];
    if (info.contact_person) parts.push(info.contact_person);
    if (info.email) parts.push(info.email);
    if (info.phone) parts.push(info.phone);
    const addrParts = [info.address, info.zip, info.city, info.country].filter(Boolean);
    if (addrParts.length) parts.push(addrParts.join(', '));
    if (parts.length) html += `<div class="customer-info">${esc(parts.join(' | '))}</div>`;
    html += `<table><thead><tr><th>${t('thDate')}</th><th>${t('thFrom')}</th><th>${t('thTo')}</th><th>${t('thMinutes')}</th><th>${t('thDescription')}</th></tr></thead><tbody>`;
    group.entries.sort((a, b) => a.date.localeCompare(b.date) || a.time_from.localeCompare(b.time_from)).forEach(e => {
      html += `<tr><td>${e.date}</td><td>${e.time_from}</td><td>${e.time_to}</td><td>${e.minutes}</td><td>${esc(e.description)}</td></tr>`;
    });
    html += `<tr class="total-row"><td colspan="3">${t('total')}</td><td>${group.minutes}</td><td>${(group.minutes / 60).toFixed(1)} h</td></tr>`;
    html += `</tbody></table></div>`;
  });

  html += `<div class="grand-total">${t('total')}: ${grandMinutes} min / ${(grandMinutes / 60).toFixed(1)} h</div>`;
  html += `</body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
  win.onload = () => { win.print(); };
}

// === Users management ===
async function loadUsers() {
  if (currentUser.role !== 'admin') return;
  try {
    const resp = await fetch('/api/users');
    const users = await resp.json();
    const tbody = document.getElementById('users-body');
    tbody.innerHTML = '';
    users.forEach(u => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${esc(u.username)}</td>
        <td>${esc(u.email || '')}</td>
        <td>${esc(u.role)}</td>
        <td>${u.created_at ? u.created_at.slice(0, 10) : ''}</td>
        <td>
          <button onclick="editUser(${u.id}, '${esc(u.username)}', '${esc(u.role)}', '${esc(u.email || '')}')">${t('edit')}</button>
          <button class="btn-danger" onclick="deleteUser(${u.id})">${t('delete')}</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  } catch {}
}

function showAddUser() {
  editingUserId = null;
  document.getElementById('user-modal-title').textContent = t('addUser');
  document.getElementById('modal-username').value = '';
  document.getElementById('modal-email').value = '';
  document.getElementById('modal-password').value = '';
  document.getElementById('modal-role').value = 'user';
  document.getElementById('user-modal-error').textContent = '';
  document.getElementById('user-modal').style.display = '';
}

function editUser(id, username, role, email) {
  editingUserId = id;
  document.getElementById('user-modal-title').textContent = t('editUser');
  document.getElementById('modal-username').value = username;
  document.getElementById('modal-email').value = email || '';
  document.getElementById('modal-password').value = '';
  document.getElementById('modal-role').value = role;
  document.getElementById('user-modal-error').textContent = '';
  document.getElementById('user-modal').style.display = '';
}

function closeUserModal() { document.getElementById('user-modal').style.display = 'none'; editingUserId = null; }

async function saveUser() {
  const username = document.getElementById('modal-username').value.trim();
  const password = document.getElementById('modal-password').value;
  const role = document.getElementById('modal-role').value;
  const email = document.getElementById('modal-email').value.trim();
  const errEl = document.getElementById('user-modal-error');
  errEl.textContent = '';
  if (!username) return;
  let resp;
  if (editingUserId) {
    const body = { username, role };
    if (password) body.password = password;
    if (email) body.email = email;
    resp = await fetch(`/api/users/${editingUserId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } else {
    if (!password) return;
    resp = await fetch('/api/users', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password, role, email }) });
  }
  if (!resp.ok) {
    const data = await resp.json();
    const msgs = { email_invalid: t('emailInvalid'), email_taken: t('emailTaken'), password_too_short: t('passwordTooShort'), password_same_as_username: t('passwordSameAsUsername') };
    errEl.textContent = msgs[data.error] || data.error;
    return;
  }
  closeUserModal(); loadUsers(); loadUserFilters();
}

async function deleteUser(id) {
  if (!confirm(t('confirmDeleteUser'))) return;
  await fetch(`/api/users/${id}`, { method: 'DELETE' });
  loadUsers(); loadUserFilters();
}

// === Account modal ===
function showAccountModal() {
  document.getElementById('account-email-display').value = currentUser.email || '';
  const hasPassword = currentUser.hasPassword;
  document.getElementById('account-sso-banner').style.display = hasPassword ? 'none' : '';
  document.getElementById('account-change-email-btn').style.display = hasPassword ? '' : 'none';
  document.getElementById('account-change-pw-btn').style.display = hasPassword ? '' : 'none';
  showAccountMain();
  document.getElementById('account-modal').style.display = '';
}

function showAccountMain() {
  document.getElementById('account-main').style.display = '';
  document.getElementById('account-email-form').style.display = 'none';
  document.getElementById('account-pw-form').style.display = 'none';
}

function showAccountChangeEmail() {
  document.getElementById('account-new-email').value = '';
  document.getElementById('account-email-current-pw').value = '';
  document.getElementById('account-email-error').textContent = '';
  document.getElementById('account-email-pw-row').style.display = currentUser.email ? '' : 'none';
  document.getElementById('account-main').style.display = 'none';
  document.getElementById('account-email-form').style.display = '';
}

function showAccountChangePassword() {
  document.getElementById('account-current-pw').value = '';
  document.getElementById('account-new-pw').value = '';
  document.getElementById('account-confirm-pw').value = '';
  document.getElementById('account-pw-error').textContent = '';
  document.getElementById('account-main').style.display = 'none';
  document.getElementById('account-pw-form').style.display = '';
}

function closeAccountModal() {
  document.getElementById('account-modal').style.display = 'none';
}

async function submitChangePassword() {
  const current_password = document.getElementById('account-current-pw').value;
  const new_password = document.getElementById('account-new-pw').value;
  const confirm_password = document.getElementById('account-confirm-pw').value;
  const errEl = document.getElementById('account-pw-error');
  errEl.textContent = '';
  if (new_password !== confirm_password) { errEl.textContent = t('passwordsDontMatch'); return; }
  const resp = await fetch('/auth/change-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ current_password, new_password })
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msgs = { password_too_short: t('passwordTooShort'), password_same_as_username: t('passwordSameAsUsername') };
    errEl.textContent = msgs[data.error] || data.error;
    return;
  }
  closeAccountModal();
}

async function submitChangeEmail() {
  const new_email = document.getElementById('account-new-email').value.trim();
  const current_password = document.getElementById('account-email-current-pw').value;
  const errEl = document.getElementById('account-email-error');
  errEl.textContent = '';
  const body = { new_email };
  if (currentUser.email) body.current_password = current_password;
  const resp = await fetch('/auth/change-email', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msgs = { email_invalid: t('emailInvalid'), email_taken: t('emailTaken') };
    errEl.textContent = msgs[data.error] || data.error;
    return;
  }
  currentUser.email = data.email;
  document.getElementById('account-email-display').value = data.email;
  showAccountMain();
}

// === Forgot / Reset password ===
function showForgotModal() {
  document.getElementById('forgot-email').value = '';
  document.getElementById('forgot-error').textContent = '';
  document.getElementById('forgot-form').style.display = '';
  document.getElementById('forgot-success').style.display = 'none';
  document.getElementById('forgot-modal').style.display = '';
}

function closeForgotModal() {
  document.getElementById('forgot-modal').style.display = 'none';
}

async function submitForgot() {
  const email = document.getElementById('forgot-email').value.trim();
  const errEl = document.getElementById('forgot-error');
  errEl.textContent = '';
  if (!email) { errEl.textContent = t('emailInvalid'); return; }
  const resp = await fetch('/auth/forgot-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, lang: currentLang })
  });
  if (resp.ok) {
    document.getElementById('forgot-form').style.display = 'none';
    document.getElementById('forgot-success').style.display = '';
  }
}

async function submitReset() {
  const new_password = document.getElementById('reset-new-pw').value;
  const confirm_password = document.getElementById('reset-confirm-pw').value;
  const errEl = document.getElementById('reset-error');
  errEl.textContent = '';
  if (new_password !== confirm_password) { errEl.textContent = t('passwordsDontMatch'); return; }
  const resp = await fetch('/auth/reset-password', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: pendingResetToken, new_password })
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msgs = { invalid_token: t('invalidToken'), password_too_short: t('passwordTooShort'), password_same_as_username: t('passwordSameAsUsername') };
    errEl.textContent = msgs[data.error] || data.error;
    return;
  }
  pendingResetToken = null;
  document.getElementById('reset-modal').style.display = 'none';
  document.getElementById('login-screen').style.display = '';
}

// === Email required ===
async function submitRequiredEmail() {
  const new_email = document.getElementById('email-required-input').value.trim();
  const errEl = document.getElementById('email-required-error');
  errEl.textContent = '';
  const resp = await fetch('/auth/change-email', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ new_email })
  });
  const data = await resp.json();
  if (!resp.ok) {
    const msgs = { email_invalid: t('emailInvalid'), email_taken: t('emailTaken') };
    errEl.textContent = msgs[data.error] || data.error;
    return;
  }
  currentUser.email = data.email;
  revealApp();
}

// === Utility ===
function esc(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
