/* ============================================
   Dickmanns' CastBoard - Main Application Logic
   ============================================ */

// ---- Data Store (IndexedDB) ----
const DB_NAME = 'castboard';
const DB_VERSION = 1;
const STORE_NAME = 'castings';

class Store {
  constructor() {
    this.db = null;
  }

  async init() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
          store.createIndex('status', 'status', { unique: false });
          store.createIndex('date', 'date', { unique: false });
        }
      };
      req.onsuccess = (e) => { this.db = e.target.result; resolve(); };
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async getAll() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async put(casting) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(casting);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async delete(id) {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }

  async clear() {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  }
}

// ---- Status Config (3 groups) ----
const STATUSES = {
  // Group 1: En proceso (sin respuesta)
  pending:   { label: 'Pendiente',           color: '#8b5cf6', icon: '📋', group: 'proceso' },
  recorded:  { label: 'Grabado no enviado',  color: '#a78bfa', icon: '🎬', group: 'proceso' },
  sent:      { label: 'Enviado',             color: '#6366f1', icon: '📤', group: 'proceso' },
  // Group 2: Con respuesta
  callback:  { label: 'Callback',            color: '#f59e0b', icon: '📞', group: 'respuesta' },
  optioned:  { label: 'Opcionada',           color: '#3b82f6', icon: '⭐', group: 'respuesta' },
  rejected:  { label: 'Rechazada',           color: '#6b7280', icon: '✗',  group: 'respuesta' },
  // Group 3: Aceptada
  booked:    { label: 'Aceptada',            color: '#10b981', icon: '✅', group: 'aceptada' },
  filming:   { label: 'En rodaje',           color: '#ec4899', icon: '🎥', group: 'aceptada' },
};

const STATUS_GROUPS = [
  { key: 'proceso',   label: 'En proceso',   statuses: ['pending', 'recorded', 'sent'] },
  { key: 'respuesta', label: 'Con respuesta', statuses: ['callback', 'optioned', 'rejected'] },
  { key: 'aceptada',  label: 'Aceptada',      statuses: ['booked', 'filming'] },
];

const ALL_STATUSES = STATUS_GROUPS.flatMap(g => g.statuses);

// ---- App State ----
let store;
let castings = [];
let currentView = 'calendar';
let currentFilter = 'all';
let searchQuery = '';
let calendarDate = new Date();
let editingId = null;
let currentDetailCasting = null;

// ---- Gmail State ----
let gmailConnected = false;
let gmailToken = null;
const GMAIL_CLIENT_ID = localStorage.getItem('gmail_client_id') || '';
const GMAIL_SCOPES = 'https://www.googleapis.com/auth/gmail.readonly';

// ---- SVG Icons ----
const ICONS = {
  calendar: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  location: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>',
  user: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>',
  star: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
  film: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/><line x1="17" y1="17" x2="22" y2="17"/></svg>',
  building: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2" ry="2"/><line x1="9" y1="6" x2="9" y2="6.01"/><line x1="15" y1="6" x2="15" y2="6.01"/><line x1="9" y1="10" x2="9" y2="10.01"/><line x1="15" y1="10" x2="15" y2="10.01"/><line x1="9" y1="14" x2="9" y2="14.01"/><line x1="15" y1="14" x2="15" y2="14.01"/><path d="M9 18h6v4H9z"/></svg>',
  chevronLeft: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 18 9 12 15 6"/></svg>',
  chevronRight: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>',
};

// ---- Utility Functions ----
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function toast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  container.appendChild(el);
  setTimeout(() => el.remove(), 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function deadlineInfo(casting) {
  if (!casting.deadline || (casting.status !== 'pending' && casting.status !== 'recorded')) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const dl = new Date(casting.deadline + 'T00:00:00');
  const diff = Math.ceil((dl - today) / (1000 * 60 * 60 * 24));
  let urgency = 'ok';
  let label = '';
  if (diff < 0) { urgency = 'overdue'; label = `Vencida hace ${Math.abs(diff)}d`; }
  else if (diff === 0) { urgency = 'today'; label = 'Hoy'; }
  else if (diff === 1) { urgency = 'urgent'; label = 'Manana'; }
  else if (diff <= 3) { urgency = 'urgent'; label = `En ${diff} dias`; }
  else { label = formatDate(casting.deadline); }
  return { urgency, label, diff };
}

function getFilteredCastings() {
  let filtered = [...castings];
  if (currentFilter !== 'all') {
    filtered = filtered.filter(c => c.status === currentFilter);
  }
  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(c =>
      (c.project || '').toLowerCase().includes(q) ||
      (c.character || '').toLowerCase().includes(q) ||
      (c.role || '').toLowerCase().includes(q) ||
      (c.location || '').toLowerCase().includes(q) ||
      (c.director || '').toLowerCase().includes(q) ||
      (c.company || '').toLowerCase().includes(q) ||
      (c.notes || '').toLowerCase().includes(q)
    );
  }
  return filtered;
}

// ---- iCal Export ----

function toICalDate(dateStr, timeStr) {
  if (!dateStr) return '';
  const d = dateStr.replace(/-/g, '');
  if (timeStr) {
    const t = timeStr.replace(/:/g, '') + '00';
    return d + 'T' + t;
  }
  return d;
}

function generateICalEvent(casting) {
  const uid = casting.id + '@castboard';
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const summary = casting.project + (casting.character ? ` - ${casting.character}` : '') + (casting.role ? ` (${casting.role})` : '');

  let dtstart = '';
  let dtend = '';

  if (casting.date && casting.time) {
    dtstart = `DTSTART:${toICalDate(casting.date, casting.time)}`;
    // Default 2h duration
    const d = new Date(casting.date + 'T' + casting.time);
    d.setHours(d.getHours() + 2);
    const endStr = d.toISOString().split('T')[0];
    const endTime = d.toTimeString().slice(0, 5);
    dtend = `DTEND:${toICalDate(endStr, endTime)}`;
  } else if (casting.date) {
    dtstart = `DTSTART;VALUE=DATE:${toICalDate(casting.date)}`;
    if (casting.dateEnd) {
      // iCal DATE end is exclusive, so add 1 day
      const end = new Date(casting.dateEnd + 'T00:00:00');
      end.setDate(end.getDate() + 1);
      dtend = `DTEND;VALUE=DATE:${end.toISOString().split('T')[0].replace(/-/g, '')}`;
    } else {
      const end = new Date(casting.date + 'T00:00:00');
      end.setDate(end.getDate() + 1);
      dtend = `DTEND;VALUE=DATE:${end.toISOString().split('T')[0].replace(/-/g, '')}`;
    }
  } else {
    return '';
  }

  const description = [
    casting.character ? `Personaje: ${casting.character}` : '',
    casting.role ? `Rol: ${casting.role}` : '',
    casting.director ? `Director/a casting: ${casting.director}` : '',
    casting.company ? `Productora: ${casting.company}` : '',
    STATUSES[casting.status] ? `Estado: ${STATUSES[casting.status].label}` : '',
    casting.notes ? `\\nNotas: ${casting.notes.replace(/\n/g, '\\n')}` : '',
  ].filter(Boolean).join('\\n');

  const location = casting.location ? `LOCATION:${casting.location.replace(/,/g, '\\,')}` : '';

  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    dtstart,
    dtend,
    `SUMMARY:${summary}`,
    description ? `DESCRIPTION:${description}` : '',
    location,
    `STATUS:CONFIRMED`,
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
}

function exportICalSingle(casting) {
  const event = generateICalEvent(casting);
  if (!event) { toast('Este casting no tiene fecha asignada', 'error'); return; }

  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//Dickmanns' CastBoard//ES",
    'CALSCALE:GREGORIAN',
    event,
    'END:VCALENDAR',
  ].join('\r\n');

  downloadFile(ical, `casting-${casting.project.replace(/[^a-zA-Z0-9]/g, '_')}.ics`, 'text/calendar');
  toast('Evento exportado. Abrelo para anadirlo a tu calendario.', 'success');
}

function exportICalAll() {
  const events = castings.map(c => generateICalEvent(c)).filter(Boolean);
  if (events.length === 0) { toast('No hay castings con fecha para exportar', 'error'); return; }

  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    "PRODID:-//Dickmanns' CastBoard//ES",
    'CALSCALE:GREGORIAN',
    "X-WR-CALNAME:Dickmanns' CastBoard",
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');

  downloadFile(ical, `castboard-todos-${new Date().toISOString().split('T')[0]}.ics`, 'text/calendar');
  toast(`${events.length} evento(s) exportados`, 'success');
}

function downloadFile(content, filename, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---- Render Functions ----

function renderStats() {
  const el = document.getElementById('stats-bar');
  const counts = {};
  ALL_STATUSES.forEach(s => counts[s] = 0);
  castings.forEach(c => { if (counts[c.status] !== undefined) counts[c.status]++; });

  // Show group totals
  el.innerHTML = STATUS_GROUPS.map(g => {
    const total = g.statuses.reduce((sum, s) => sum + counts[s], 0);
    return `
      <div class="stat-card">
        <div class="stat-number" style="color:${STATUSES[g.statuses[0]].color}">${total}</div>
        <div class="stat-label">${g.label}</div>
      </div>
    `;
  }).join('') + `
    <div class="stat-card">
      <div class="stat-number" style="color:var(--text-primary)">${castings.length}</div>
      <div class="stat-label">Total</div>
    </div>
  `;
}

function renderFilters() {
  const el = document.getElementById('filter-bar');
  const items = [{ key: 'all', label: 'Todos' }, ...ALL_STATUSES.map(s => ({ key: s, label: STATUSES[s].label }))];
  el.innerHTML = items.map(f =>
    `<button class="filter-chip ${currentFilter === f.key ? 'active' : ''}" data-filter="${f.key}">${f.label}</button>`
  ).join('');
}

// ---- Calendar ----

function renderCalendar() {
  const el = document.getElementById('view-calendar');
  const year = calendarDate.getFullYear();
  const month = calendarDate.getMonth();
  const today = new Date();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDay = (firstDay.getDay() + 6) % 7;
  const daysInMonth = lastDay.getDate();
  const monthName = calendarDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  const dayNames = ['Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab', 'Dom'];
  const filtered = getFilteredCastings();

  // Build events map
  const eventsByDate = {};
  filtered.forEach(c => {
    if (c.date) {
      if (!eventsByDate[c.date]) eventsByDate[c.date] = [];
      eventsByDate[c.date].push(c);
    }
    if (c.dateEnd && c.date) {
      let d = new Date(c.date + 'T00:00:00');
      const end = new Date(c.dateEnd + 'T00:00:00');
      d.setDate(d.getDate() + 1);
      while (d <= end) {
        const key = d.toISOString().split('T')[0];
        if (!eventsByDate[key]) eventsByDate[key] = [];
        eventsByDate[key].push(c);
        d.setDate(d.getDate() + 1);
      }
    }
  });

  let html = `
    <div class="calendar-header">
      <button class="btn btn-ghost btn-icon" id="cal-prev">${ICONS.chevronLeft}</button>
      <h2 class="calendar-title">${monthName}</h2>
      <button class="btn btn-ghost btn-icon" id="cal-next">${ICONS.chevronRight}</button>
    </div>
    <div class="calendar-grid">
      ${dayNames.map(d => `<div class="calendar-day-header">${d}</div>`).join('')}
  `;

  const prevMonthLastDay = new Date(year, month, 0).getDate();
  for (let i = startDay - 1; i >= 0; i--) {
    html += `<div class="calendar-day other-month"><div class="calendar-day-number">${prevMonthLastDay - i}</div></div>`;
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isToday = today.getFullYear() === year && today.getMonth() === month && today.getDate() === day;
    const events = eventsByDate[dateStr] || [];

    html += `<div class="calendar-day ${isToday ? 'today' : ''}" data-date="${dateStr}">
      <div class="calendar-day-number">${day}</div>
      ${events.slice(0, 3).map(e => `
        <div class="calendar-event status-${e.status}" data-id="${e.id}" title="${e.project}">
          ${e.project}
        </div>
      `).join('')}
      ${events.length > 3 ? `<div style="font-size:0.65rem;color:var(--text-muted);">+${events.length - 3} mas</div>` : ''}
    </div>`;
  }

  const totalCells = startDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remaining; i++) {
    html += `<div class="calendar-day other-month"><div class="calendar-day-number">${i}</div></div>`;
  }

  html += '</div>';
  el.innerHTML = html;

  document.getElementById('cal-prev')?.addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() - 1);
    renderCalendar();
  });
  document.getElementById('cal-next')?.addEventListener('click', () => {
    calendarDate.setMonth(calendarDate.getMonth() + 1);
    renderCalendar();
  });

  el.querySelectorAll('.calendar-event').forEach(ev => {
    ev.addEventListener('click', (e) => {
      e.stopPropagation();
      const casting = castings.find(c => c.id === ev.dataset.id);
      if (casting) openDetail(casting);
    });
  });

  el.querySelectorAll('.calendar-day:not(.other-month)').forEach(day => {
    day.addEventListener('click', () => openForm(null, day.dataset.date));
  });
}

// ---- Kanban (Grouped) ----

function renderKanban() {
  const el = document.getElementById('view-kanban');
  const filtered = getFilteredCastings();

  el.innerHTML = STATUS_GROUPS.map(group => {
    const columns = group.statuses.map(status => {
      const items = filtered.filter(c => c.status === status);
      items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
      return { status, items };
    });

    return `
      <div class="kanban-group">
        <div class="kanban-group-title group-${group.key}">${group.label}</div>
        <div class="kanban-group-columns">
          ${columns.map(col => `
            <div class="kanban-column">
              <div class="kanban-column-header">
                <div class="kanban-column-dot" style="background:${STATUSES[col.status].color}"></div>
                <span class="kanban-column-title">${STATUSES[col.status].label}</span>
                <span class="kanban-column-count">${col.items.length}</span>
              </div>
              <div class="kanban-cards" data-status="${col.status}">
                ${col.items.length === 0 ? `
                  <div class="empty-state" style="padding:20px;">
                    <div style="font-size:1.5rem;opacity:0.3;">${STATUSES[col.status].icon}</div>
                    <div style="font-size:0.8rem;margin-top:4px;">Sin elementos</div>
                  </div>
                ` : col.items.map(c => `
                  <div class="kanban-card fade-in" data-id="${c.id}">
                    <div class="kanban-card-title">${escapeHtml(c.project)}</div>
                    <div class="kanban-card-meta">
                      ${c.character || c.role ? `<div class="kanban-card-meta-item">${ICONS.user} ${escapeHtml(c.character || '')}${c.character && c.role ? ' — ' : ''}${escapeHtml(c.role || '')}</div>` : ''}
                      ${c.date ? `<div class="kanban-card-meta-item">${ICONS.calendar} ${formatDate(c.date)}${c.time ? ' ' + c.time : ''}</div>` : ''}
                      ${c.location ? `<div class="kanban-card-meta-item">${ICONS.location} ${escapeHtml(c.location)}</div>` : ''}
                      ${c.company ? `<div class="kanban-card-meta-item">${ICONS.building} ${escapeHtml(c.company)}</div>` : ''}
                      ${(() => { const dl = deadlineInfo(c); return dl ? `<div class="kanban-card-meta-item deadline-${dl.urgency}">⏰ Limite: ${dl.label}</div>` : ''; })()}
                    </div>
                    <div class="kanban-card-tags">
                      <span class="tag ${c.source === 'gmail' ? 'tag-gmail' : 'tag-manual'}">${c.source === 'gmail' ? 'Gmail' : 'Manual'}</span>
                      ${c.needsReview ? '<span class="tag tag-review">Por revisar</span>' : ''}
                      ${c.projectType ? `<span class="tag" style="background:rgba(255,255,255,0.05);color:var(--text-secondary)">${c.projectType}</span>` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  el.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('click', () => {
      const casting = castings.find(c => c.id === card.dataset.id);
      if (casting) openDetail(casting);
    });
  });
}

// ---- Detail View ----

function openDetail(casting) {
  currentDetailCasting = casting;
  document.getElementById('detail-title').textContent = casting.project;

  const body = document.getElementById('detail-body');
  body.innerHTML = `
    ${STATUS_GROUPS.map(group => `
      <div class="detail-status-group">
        <div class="detail-status-group-label">${group.label}</div>
        <div class="detail-status-group-btns">
          ${group.statuses.map(s => `
            <button class="detail-status-btn ${s} ${casting.status === s ? 'active' : ''}" data-status="${s}">
              ${STATUSES[s].icon} ${STATUSES[s].label}
            </button>
          `).join('')}
        </div>
      </div>
    `).join('')}

    <div class="detail-section" style="margin-top:8px;">
      <div class="detail-section-title">Informacion del casting</div>
      ${detailField(ICONS.user, 'Personaje', casting.character)}
      ${detailField(ICONS.star, 'Rol', casting.role)}
      ${detailField(ICONS.calendar, 'Fecha', (casting.date ? formatDate(casting.date) : '') + (casting.time ? ' a las ' + casting.time : '') + (casting.dateEnd ? ' — ' + formatDate(casting.dateEnd) : ''))}
      ${(() => { const dl = deadlineInfo(casting); return dl ? detailField('⏰', 'Fecha limite', `<span class="deadline-text-${dl.urgency}">${dl.label}</span>`, true) : ''; })()}
      ${detailField(ICONS.location, 'Ubicacion', casting.location)}
      ${detailField(ICONS.user, 'Director/a de casting', casting.director)}
      ${detailField(ICONS.building, 'Productora / Agencia', casting.company)}
      ${detailField(ICONS.film, 'Tipo de proyecto', casting.projectType)}
    </div>

    ${casting.needsReview ? `
    <div style="background:rgba(245,158,11,0.1);border:1px solid rgba(245,158,11,0.3);border-radius:var(--radius-sm);padding:14px;margin-bottom:16px;">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">
        <span style="font-size:1.1rem;">⚠️</span>
        <span style="font-weight:700;color:var(--warning);font-size:0.9rem;">Importado automaticamente — Por revisar</span>
      </div>
      <p style="font-size:0.82rem;color:var(--text-secondary);margin-bottom:12px;">
        Este casting fue importado de Gmail. Revisa que los datos extraidos sean correctos y pulsa "Verificar" para confirmarlo.
      </p>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button class="btn btn-primary btn-sm" id="btn-verify-casting">Verificar datos correctos</button>
        <button class="btn btn-secondary btn-sm" id="btn-edit-and-verify">Editar y corregir</button>
        <button class="btn btn-sm" id="btn-dismiss-casting" style="background:var(--rejected);color:#fff;">🚫 Descartar (falso positivo)</button>
      </div>
    </div>` : ''}

    ${(!casting.needsReview && casting.source === 'gmail') ? `
    <div style="text-align:right;margin-bottom:8px;">
      <button class="btn btn-sm" id="btn-dismiss-casting" style="background:var(--rejected);color:#fff;font-size:0.78rem;">🚫 Descartar (no es un casting)</button>
    </div>` : ''}

    ${casting.notes ? `
    <div class="detail-section">
      <div class="detail-section-title">Notas</div>
      <p style="font-size:0.9rem;color:var(--text-secondary);line-height:1.6;white-space:pre-wrap;">${escapeHtml(casting.notes)}</p>
    </div>` : ''}

    <div class="detail-section">
      <div class="detail-section-title">Metadatos</div>
      ${detailField(null, 'Origen', casting.source === 'gmail' ? 'Importado de Gmail' : 'Entrada manual')}
      ${detailField(null, 'Creado', new Date(casting.createdAt).toLocaleString('es-ES'))}
      ${casting.updatedAt ? detailField(null, 'Actualizado', new Date(casting.updatedAt).toLocaleString('es-ES')) : ''}
    </div>
  `;

  // Status change buttons
  body.querySelectorAll('.detail-status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      casting.status = btn.dataset.status;
      casting.updatedAt = Date.now();
      await store.put(casting);
      castings = await store.getAll();
      openDetail(casting);
      renderAll();
      toast(`Estado cambiado a "${STATUSES[casting.status].label}"`);
    });
  });

  // Verify buttons (only if needsReview)
  document.getElementById('btn-verify-casting')?.addEventListener('click', async () => {
    await markAsReviewed(casting.id);
    casting.needsReview = false;
    openDetail(casting);
  });
  document.getElementById('btn-edit-and-verify')?.addEventListener('click', () => {
    closeAllModals();
    openForm(casting);
  });

  // Dismiss button (false positive from Gmail)
  document.getElementById('btn-dismiss-casting')?.addEventListener('click', async () => {
    if (!confirm('¿Descartar este casting? Si vino de Gmail, no volverá a importarse.')) return;
    await dismissCasting(casting.id);
  });

  // Edit button
  document.getElementById('btn-edit').onclick = () => {
    closeAllModals();
    openForm(casting);
  };

  // Export iCal button
  document.getElementById('btn-export-ical').onclick = () => {
    exportICalSingle(casting);
  };

  openModal('modal-detail');
}

function detailField(icon, label, value, rawHtml = false) {
  if (!value) return '';
  return `
    <div class="detail-field">
      ${icon ? `<div class="detail-field-icon">${icon}</div>` : '<div style="width:14px;"></div>'}
      <div class="detail-field-content">
        <div class="detail-field-label">${label}</div>
        <div class="detail-field-value">${rawHtml ? value : escapeHtml(value)}</div>
      </div>
    </div>
  `;
}

// ---- Form (Create/Edit) ----

function openForm(casting = null, presetDate = null) {
  editingId = casting ? casting.id : null;
  const title = document.getElementById('modal-form-title');
  const deleteBtn = document.getElementById('btn-delete');

  if (casting) {
    title.textContent = 'Editar Casting';
    deleteBtn.style.display = 'inline-flex';
    document.getElementById('f-project').value = casting.project || '';
    document.getElementById('f-character').value = casting.character || '';
    document.getElementById('f-role').value = casting.role || '';
    document.getElementById('f-status').value = casting.status || 'pending';
    document.getElementById('f-date').value = casting.date || '';
    document.getElementById('f-time').value = casting.time || '';
    document.getElementById('f-deadline').value = casting.deadline || '';
    document.getElementById('f-date-end').value = casting.dateEnd || '';
    document.getElementById('f-location').value = casting.location || '';
    document.getElementById('f-director').value = casting.director || '';
    document.getElementById('f-company').value = casting.company || '';
    document.getElementById('f-type').value = casting.projectType || '';
    document.getElementById('f-notes').value = casting.notes || '';
  } else {
    title.textContent = 'Nuevo Casting';
    deleteBtn.style.display = 'none';
    document.getElementById('casting-form').reset();
    if (presetDate) {
      document.getElementById('f-date').value = presetDate;
    }
  }

  updateDeadlineVisibility();
  openModal('modal-form');
  setTimeout(() => document.getElementById('f-project').focus(), 300);
}

function updateDeadlineVisibility() {
  const status = document.getElementById('f-status').value;
  const deadlineGroup = document.getElementById('deadline-group');
  if (status === 'pending' || status === 'recorded') {
    deadlineGroup.style.display = '';
  } else {
    deadlineGroup.style.display = 'none';
  }
}

async function saveCasting() {
  const project = document.getElementById('f-project').value.trim();
  if (!project) {
    toast('El nombre del proyecto es obligatorio', 'error');
    return;
  }

  const casting = {
    id: editingId || genId(),
    project,
    character: document.getElementById('f-character').value.trim(),
    role: document.getElementById('f-role').value.trim(),
    status: document.getElementById('f-status').value,
    date: document.getElementById('f-date').value,
    time: document.getElementById('f-time').value,
    deadline: document.getElementById('f-deadline').value,
    dateEnd: document.getElementById('f-date-end').value,
    location: document.getElementById('f-location').value.trim(),
    director: document.getElementById('f-director').value.trim(),
    company: document.getElementById('f-company').value.trim(),
    projectType: document.getElementById('f-type').value,
    notes: document.getElementById('f-notes').value.trim(),
    source: editingId ? (castings.find(c => c.id === editingId)?.source || 'manual') : 'manual',
    createdAt: editingId ? (castings.find(c => c.id === editingId)?.createdAt || Date.now()) : Date.now(),
    updatedAt: editingId ? Date.now() : null,
  };

  await store.put(casting);
  castings = await store.getAll();
  closeAllModals();
  renderAll();
  toast(editingId ? 'Casting actualizado' : 'Casting creado', 'success');
  editingId = null;
}

async function deleteCasting() {
  if (!editingId) return;
  if (!confirm('Seguro que quieres eliminar este casting?')) return;
  await store.delete(editingId);
  castings = await store.getAll();
  closeAllModals();
  renderAll();
  toast('Casting eliminado');
  editingId = null;
}

// ---- Gmail Integration ----

// Default keywords optimized for casting emails in Spanish + English
const DEFAULT_KEYWORDS = 'casting, callback, audicion, audición, self-tape, selftape, personaje, papel, director de casting, directora de casting, rodaje, grabacion, grabación, prueba cámara, prueba de cámara, videobook, audition, casting call, screen test, fitting, wardrobe fitting, table read, recall, shortlist, sides, shooting, call sheet, casting director';

// Auto-sync interval (3 minutes)
let autoSyncInterval = null;
const AUTO_SYNC_MS = 3 * 60 * 1000;

// ---- Dismissed Gmail IDs (false positives that should never re-import) ----
function getDismissedGmailIds() {
  try {
    return new Set(JSON.parse(localStorage.getItem('dismissed_gmail_ids') || '[]'));
  } catch { return new Set(); }
}

function addDismissedGmailId(gmailId) {
  const ids = getDismissedGmailIds();
  ids.add(gmailId);
  localStorage.setItem('dismissed_gmail_ids', JSON.stringify([...ids]));
}

async function dismissCasting(castingId) {
  const casting = castings.find(c => c.id === castingId);
  if (!casting) return;
  // If it came from Gmail, remember the ID so it never comes back
  if (casting.gmailId) {
    addDismissedGmailId(casting.gmailId);
  }
  await store.delete(castingId);
  castings = await store.getAll();
  closeAllModals();
  renderAll();
  toast('Casting descartado — no volverá a importarse', 'success');
}

// ---- Email Body Parser ----
// Extracts structured data from email text using pattern matching

function parseEmailBody(subject, body, from, emailDate) {
  const text = (subject + ' ' + body).toLowerCase();
  const result = {
    project: '',
    character: '',
    role: '',
    date: '',
    time: '',
    deadline: '',
    location: '',
    director: '',
    company: '',
    projectType: '',
    detectedStatus: 'pending',
  };

  // --- Project name: use subject, cleaned up ---
  let projectName = subject
    .replace(/^(re:|fwd:|fw:|rv:)\s*/gi, '')
    .replace(/casting\s*[-:]\s*/i, '')
    .replace(/convocatoria\s*[-:]\s*/i, '')
    .trim();
  result.project = projectName || subject;

  // --- Detect status from content (ES + EN) ---
  if (/callback|segunda prueba|segunda fase|te hemos seleccionado para.*prueba|recall|called back|second round/i.test(text)) {
    result.detectedStatus = 'callback';
  } else if (/opcionad[ao]|en opci[oó]n|shortlist|preseleccionad|on hold|penciled|avail check/i.test(text)) {
    result.detectedStatus = 'optioned';
  } else if (/confirmad[ao]|seleccionad[ao]|enhorabuena.*papel|felicidades.*papel|has sido elegid|you('ve| have) been (selected|cast|booked)|congratulations|you got the (part|role)/i.test(text)) {
    result.detectedStatus = 'booked';
  } else if (/no ha sido posible|lamentablemente|no.*seleccionad|descartad|no.*elegid|unfortunately|not been selected|went another direction|decided to go with/i.test(text)) {
    result.detectedStatus = 'rejected';
  }

  // --- Character / Role (ES + EN) ---
  const charMatch = body.match(/personaje[:\s]+["']?([^"'\n,]{2,40})["']?/i)
    || body.match(/papel(?:\s+de)?[:\s]+["']?([^"'\n,]{2,40})["']?/i)
    || body.match(/character[:\s]+["']?([^"'\n,]{2,40})["']?/i)
    || body.match(/(?:role|part)\s+of[:\s]+["']?([^"'\n,]{2,40})["']?/i);
  if (charMatch) result.character = charMatch[1].trim();

  const roleMatch = body.match(/rol[:\s]+["']?([^"'\n,]{2,30})["']?/i)
    || body.match(/(protagonista|antagonista|secundari[oa]|figurante|extra|figuraci[oó]n|reparto principal)/i)
    || body.match(/(lead|supporting|guest star|co-star|recurring|featured|background|principal|day player)/i);
  if (roleMatch) result.role = roleMatch[1].trim();

  // --- Dates (Spanish + English formats) ---
  // "15 de marzo", "March 15", "15/03/2026", "2026-03-15"
  const months = { enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6, julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12, january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };
  const allMonthNames = Object.keys(months).join('|');
  const dateMatch1 = body.match(new RegExp(`(\\d{1,2})\\s+de\\s+(${allMonthNames})(?:\\s+(?:de\\s+)?(\\d{4}))?`, 'i'));
  // English: "March 15, 2026" or "March 15 2026"
  const dateMatchEN = !dateMatch1 && body.match(new RegExp(`(${allMonthNames})\\s+(\\d{1,2})(?:[,\\s]+(\\d{4}))?`, 'i'));
  const dateMatch2 = body.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/);
  const dateMatch3 = body.match(/(\d{4})-(\d{2})-(\d{2})/);

  if (dateMatch1) {
    const day = parseInt(dateMatch1[1]);
    const mon = months[dateMatch1[2].toLowerCase()];
    const year = dateMatch1[3] ? parseInt(dateMatch1[3]) : new Date().getFullYear();
    result.date = `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  } else if (dateMatchEN) {
    const mon = months[dateMatchEN[1].toLowerCase()];
    const day = parseInt(dateMatchEN[2]);
    const year = dateMatchEN[3] ? parseInt(dateMatchEN[3]) : new Date().getFullYear();
    result.date = `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  } else if (dateMatch2) {
    const day = parseInt(dateMatch2[1]);
    const mon = parseInt(dateMatch2[2]);
    const year = parseInt(dateMatch2[3]);
    result.date = `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
  } else if (dateMatch3) {
    result.date = dateMatch3[0];
  }

  // Fallback: use email date
  if (!result.date && emailDate) {
    try {
      const d = new Date(emailDate);
      if (!isNaN(d)) result.date = d.toISOString().split('T')[0];
    } catch(e) {}
  }

  // --- Time ---
  const timeMatch = body.match(/(\d{1,2})[:\.](\d{2})\s*(?:h|hrs?|horas?)?/i)
    || body.match(/a las\s+(\d{1,2})[:\.]?(\d{2})?/i);
  if (timeMatch) {
    const h = String(timeMatch[1]).padStart(2, '0');
    const m = String(timeMatch[2] || '00').padStart(2, '0');
    result.time = `${h}:${m}`;
  }

  // --- Deadline ---
  const deadlineMatch = body.match(/(?:fecha\s*l[ií]mite|plazo|enviar\s*antes\s*(?:del?)?|deadline)[:\s]+(\d{1,2})\s+de\s+(\w+)(?:\s+(?:de\s+)?(\d{4}))?/i)
    || body.match(/(?:fecha\s*l[ií]mite|plazo|antes\s*del?)[:\s]+(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})/i);
  if (deadlineMatch) {
    if (months[deadlineMatch[2]?.toLowerCase()]) {
      const day = parseInt(deadlineMatch[1]);
      const mon = months[deadlineMatch[2].toLowerCase()];
      const year = deadlineMatch[3] ? parseInt(deadlineMatch[3]) : new Date().getFullYear();
      result.deadline = `${year}-${String(mon).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    } else if (deadlineMatch[3]) {
      result.deadline = `${deadlineMatch[3]}-${String(deadlineMatch[2]).padStart(2,'0')}-${String(deadlineMatch[1]).padStart(2,'0')}`;
    }
  }

  // --- Location (ES + EN) ---
  const locMatch = body.match(/(?:direcci[oó]n|ubicaci[oó]n|lugar|localizaci[oó]n|d[oó]nde|location|address|venue|studio|where)[:\s]+([^\n]{5,60})/i)
    || body.match(/(?:calle|avda\.?|avenida|plaza|estudio|plat[oó])\s+[^\n]{3,50}/i);
  if (locMatch) result.location = (locMatch[1] || locMatch[0]).trim();

  // --- Director de casting (ES + EN) ---
  const dirMatch = body.match(/(?:director(?:a)?\s+de\s+casting|casting\s+director|CD)[:\s]+([^\n]{3,40})/i)
    || body.match(/(?:casting\s+(?:por|de|by))[:\s]+([^\n]{3,40})/i);
  if (dirMatch) result.director = dirMatch[1].trim();

  // --- Company (ES + EN, from sender or body) ---
  const compMatch = body.match(/(?:productora|producci[oó]n|agencia|produc\.?|production|agency|produced by|production company)[:\s]+([^\n]{3,40})/i);
  if (compMatch) {
    result.company = compMatch[1].trim();
  } else if (from) {
    const fromMatch = from.match(/(?:^|\s)([^<@]+?)(?:\s*<|$)/);
    if (fromMatch) result.company = fromMatch[1].trim();
  }

  // --- Project type (ES + EN) ---
  if (/pel[ií]cula|largometraje|cine|feature film|movie/i.test(text)) result.projectType = 'cine';
  else if (/serie|temporada|cap[ií]tulo|episodio|tv\s*series|episode|season/i.test(text)) result.projectType = 'serie';
  else if (/cortometraje|corto|short\s*film/i.test(text)) result.projectType = 'corto';
  else if (/anuncio|spot|publicidad|comercial|commercial|advert|ad\s*campaign/i.test(text)) result.projectType = 'publicidad';
  else if (/teatro|obra|escena|theatre|theater|play|stage/i.test(text)) result.projectType = 'teatro';
  else if (/videoclip|v[ií]deo\s*musical|music\s*video/i.test(text)) result.projectType = 'videoclip';

  return result;
}

// ---- Decode email body from Gmail API ----

function decodeEmailBody(payload) {
  if (!payload) return '';

  // Simple text body
  if (payload.body?.data) {
    return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
  }

  // Multipart: look for text/plain first, then text/html
  if (payload.parts) {
    let textPart = payload.parts.find(p => p.mimeType === 'text/plain');
    if (!textPart) textPart = payload.parts.find(p => p.mimeType === 'text/html');
    if (textPart?.body?.data) {
      let decoded = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      // Strip HTML tags if it was HTML
      if (textPart.mimeType === 'text/html') {
        decoded = decoded.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
      }
      return decoded;
    }
    // Nested multipart
    for (const part of payload.parts) {
      if (part.parts) {
        const nested = decodeEmailBody(part);
        if (nested) return nested;
      }
    }
  }
  return '';
}

// ---- Auto-sync: fetch new emails and auto-import ----

async function gmailAutoSync(silent = true) {
  if (!gmailToken || !gmailConnected) return;

  const keywords = localStorage.getItem('gmail_keywords') || DEFAULT_KEYWORDS;
  const lastSync = localStorage.getItem('gmail_last_sync') || '';

  try {
    // Build query: keywords + only emails after last sync
    let queryParts = keywords.split(',').map(k => k.trim()).filter(Boolean);
    let query = queryParts.map(k => `"${k}"`).join(' OR ');
    if (lastSync) {
      query += ` after:${lastSync}`;
    } else {
      // First sync: only last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      query += ` after:${thirtyDaysAgo.toISOString().split('T')[0].replace(/-/g, '/')}`;
    }

    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`;
    const res = await fetch(searchUrl, { headers: { Authorization: `Bearer ${gmailToken}` } });

    if (res.status === 401) {
      gmailConnected = false;
      gmailToken = null;
      localStorage.removeItem('gmail_token');
      stopAutoSync();
      if (!silent) toast('Sesion de Gmail expirada. Vuelve a conectar.', 'error');
      return;
    }

    const data = await res.json();
    if (!data.messages || data.messages.length === 0) {
      // Update last sync time even if no results
      localStorage.setItem('gmail_last_sync', new Date().toISOString().split('T')[0].replace(/-/g, '/'));
      return;
    }

    // Get existing gmail IDs to skip duplicates + dismissed IDs (false positives)
    const existingGmailIds = new Set(castings.filter(c => c.gmailId).map(c => c.gmailId));
    const dismissedIds = getDismissedGmailIds();

    let imported = 0;
    for (const msg of data.messages) {
      // Skip if already imported or previously dismissed as false positive
      if (existingGmailIds.has(msg.id)) continue;
      if (dismissedIds.has(msg.id)) continue;

      // Fetch full message to get body
      const msgRes = await fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
        { headers: { Authorization: `Bearer ${gmailToken}` } }
      );
      if (!msgRes.ok) continue;

      const msgData = await msgRes.json();
      const headers = {};
      (msgData.payload?.headers || []).forEach(h => { headers[h.name.toLowerCase()] = h.value; });

      const subject = headers.subject || '';
      const from = headers.from || '';
      const emailDate = headers.date || '';
      const body = decodeEmailBody(msgData.payload) || msgData.snippet || '';

      // Parse the email
      const parsed = parseEmailBody(subject, body, from, emailDate);

      // Create casting with needsReview flag
      const casting = {
        id: genId(),
        project: parsed.project,
        character: parsed.character,
        role: parsed.role,
        status: parsed.detectedStatus,
        date: parsed.date,
        time: parsed.time,
        deadline: parsed.deadline,
        dateEnd: '',
        location: parsed.location,
        director: parsed.director,
        company: parsed.company,
        projectType: parsed.projectType,
        notes: `Auto-importado de Gmail\nDe: ${from}\nFecha email: ${emailDate}\n\n${msgData.snippet || ''}`,
        source: 'gmail',
        gmailId: msg.id,
        needsReview: true,
        createdAt: Date.now(),
        updatedAt: null,
      };

      await store.put(casting);
      imported++;
    }

    // Update last sync timestamp
    localStorage.setItem('gmail_last_sync', new Date().toISOString().split('T')[0].replace(/-/g, '/'));

    if (imported > 0) {
      castings = await store.getAll();
      renderAll();
      toast(`${imported} casting(s) importado(s) automaticamente desde Gmail`, 'success');
    }

  } catch (err) {
    console.error('Gmail auto-sync error:', err);
    if (!silent) toast('Error al sincronizar con Gmail: ' + err.message, 'error');
  }
}

function startAutoSync() {
  if (autoSyncInterval) return;
  autoSyncInterval = setInterval(() => gmailAutoSync(true), AUTO_SYNC_MS);
  console.log('Gmail auto-sync started (every 3 min)');
}

function stopAutoSync() {
  if (autoSyncInterval) {
    clearInterval(autoSyncInterval);
    autoSyncInterval = null;
    console.log('Gmail auto-sync stopped');
  }
}

// ---- Mark casting as reviewed ----

async function markAsReviewed(castingId) {
  const casting = castings.find(c => c.id === castingId);
  if (!casting) return;
  casting.needsReview = false;
  casting.updatedAt = Date.now();
  await store.put(casting);
  castings = await store.getAll();
  renderAll();
  toast('Casting verificado', 'success');
}

// ---- Gmail Panel UI ----

function renderGmailPanel() {
  const body = document.getElementById('gmail-body');

  if (!GMAIL_CLIENT_ID) {
    body.innerHTML = `
      <div class="setup-info">
        <h3>Configurar conexion con Gmail</h3>
        <p>Para leer emails de casting automaticamente, necesitas crear unas credenciales gratuitas de Google. Es un proceso de una sola vez:</p>
        <p><strong>1.</strong> Ve a <a href="https://console.cloud.google.com" target="_blank" style="color:var(--accent-light);">Google Cloud Console</a></p>
        <p><strong>2.</strong> Crea un proyecto nuevo (ej: "CastBoard")</p>
        <p><strong>3.</strong> En "APIs y servicios" > "Biblioteca", activa <code>Gmail API</code></p>
        <p><strong>4.</strong> En "Credenciales", crea un <code>ID de cliente OAuth 2.0</code> de tipo "Aplicacion web"</p>
        <p><strong>5.</strong> En "Origenes de JavaScript autorizados" anade la URL donde alojes la app (ej: <code>https://tunombre.github.io</code>)</p>
        <p><strong>6.</strong> Copia el Client ID y pegalo aqui abajo:</p>
      </div>
      <div class="form-group">
        <label class="form-label">Client ID de Google</label>
        <input type="text" class="form-input" id="gmail-client-id" placeholder="xxxx.apps.googleusercontent.com">
      </div>
      <button class="btn btn-primary" id="btn-save-gmail-id" style="width:100%;">Guardar y conectar</button>
    `;
    document.getElementById('btn-save-gmail-id')?.addEventListener('click', () => {
      const id = document.getElementById('gmail-client-id').value.trim();
      if (id) {
        localStorage.setItem('gmail_client_id', id);
        toast('Client ID guardado. Recarga la pagina para conectar.', 'success');
        setTimeout(() => location.reload(), 1500);
      }
    });
    return;
  }

  const lastSync = localStorage.getItem('gmail_last_sync') || 'Nunca';
  const pendingReview = castings.filter(c => c.needsReview).length;

  body.innerHTML = `
    <div class="gmail-status">
      <div class="gmail-dot ${gmailConnected ? 'connected' : 'disconnected'}"></div>
      <span class="gmail-status-text">${gmailConnected ? 'Conectado — sincronizacion automatica activa' : 'No conectado'}</span>
      ${gmailConnected
        ? '<button class="btn btn-sm btn-secondary" id="btn-gmail-disconnect">Desconectar</button>'
        : '<button class="btn btn-sm btn-primary" id="btn-gmail-connect">Conectar</button>'
      }
    </div>

    ${gmailConnected ? `
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px;">
        Ultima sincronizacion: ${lastSync}
        ${pendingReview > 0 ? ` — <span style="color:var(--warning);font-weight:700;">${pendingReview} casting(s) por revisar</span>` : ''}
      </div>

      <button class="btn btn-primary" id="btn-gmail-sync-now" style="width:100%;margin-bottom:16px;">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
        Sincronizar ahora
      </button>

      <div class="config-section">
        <h3>Palabras clave de busqueda</h3>
        <div class="form-group">
          <textarea class="form-textarea" id="gmail-keywords" style="min-height:60px;font-size:0.82rem;">${localStorage.getItem('gmail_keywords') || DEFAULT_KEYWORDS}</textarea>
          <p style="font-size:0.72rem;color:var(--text-muted);margin-top:4px;">
            Separadas por comas. Los emails que contengan alguna de estas palabras se importaran automaticamente.
          </p>
        </div>
        <button class="btn btn-secondary btn-sm" id="btn-save-keywords">Guardar palabras clave</button>
      </div>

      <div class="config-section">
        <h3>Como funciona</h3>
        <div class="setup-info" style="margin-bottom:0;">
          <p>La app revisa tu Gmail cada 3 minutos mientras esta abierta. Cuando encuentra un email nuevo con las palabras clave, lo importa automaticamente como casting con la etiqueta "Por revisar".</p>
          <p>Si cambias manualmente el estado de un casting, la siguiente sincronizacion no lo sobreescribira (cada email se importa una sola vez).</p>
          <p>Los datos extraidos (fecha, hora, ubicacion, personaje...) son aproximados y conviene revisarlos.</p>
        </div>
      </div>
    ` : `
      <div class="setup-info">
        <p>Pulsa "Conectar" para autorizar el acceso de lectura a tu Gmail. Solo se leeran los emails, no se modificara ni enviara nada.</p>
        <p>Una vez conectado, los emails de casting se importaran automaticamente cada 3 minutos.</p>
      </div>
    `}

    <div class="config-section" style="margin-top:20px;">
      <h3>Cambiar Client ID</h3>
      <div class="form-group">
        <input type="text" class="form-input" id="gmail-client-id-change" value="${GMAIL_CLIENT_ID}" placeholder="xxxx.apps.googleusercontent.com">
      </div>
      <button class="btn btn-secondary btn-sm" id="btn-change-gmail-id">Actualizar Client ID</button>
    </div>
  `;

  document.getElementById('btn-gmail-connect')?.addEventListener('click', gmailConnect);
  document.getElementById('btn-gmail-disconnect')?.addEventListener('click', gmailDisconnect);
  document.getElementById('btn-gmail-sync-now')?.addEventListener('click', async () => {
    toast('Sincronizando...', 'info');
    await gmailAutoSync(false);
    renderGmailPanel(); // refresh panel stats
  });
  document.getElementById('btn-save-keywords')?.addEventListener('click', () => {
    const kw = document.getElementById('gmail-keywords')?.value || '';
    localStorage.setItem('gmail_keywords', kw);
    toast('Palabras clave guardadas', 'success');
  });
  document.getElementById('btn-change-gmail-id')?.addEventListener('click', () => {
    const id = document.getElementById('gmail-client-id-change').value.trim();
    if (id) {
      localStorage.setItem('gmail_client_id', id);
      toast('Client ID actualizado. Recarga la pagina.', 'success');
      setTimeout(() => location.reload(), 1500);
    }
  });
}

async function gmailConnect() {
  try {
    const clientId = localStorage.getItem('gmail_client_id');
    if (!clientId) { toast('Configura el Client ID primero', 'error'); return; }
    if (!window.google?.accounts) {
      await loadScript('https://accounts.google.com/gsi/client');
    }
    const tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: GMAIL_SCOPES,
      callback: async (response) => {
        if (response.access_token) {
          gmailToken = response.access_token;
          gmailConnected = true;
          localStorage.setItem('gmail_token', gmailToken);
          renderGmailPanel();
          toast('Conectado a Gmail. Buscando emails...', 'success');
          // Immediate first sync
          await gmailAutoSync(false);
          renderGmailPanel();
          startAutoSync();
        }
      },
    });
    tokenClient.requestAccessToken();
  } catch (err) {
    console.error('Gmail connect error:', err);
    toast('Error al conectar con Gmail: ' + err.message, 'error');
  }
}

function gmailDisconnect() {
  stopAutoSync();
  const tokenToRevoke = gmailToken;
  gmailToken = null;
  gmailConnected = false;
  localStorage.removeItem('gmail_token');
  if (window.google?.accounts && tokenToRevoke) {
    google.accounts.oauth2.revoke(tokenToRevoke);
  }
  renderGmailPanel();
  toast('Desconectado de Gmail');
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

// ---- Modals ----

function openModal(id) {
  closeAllModals();
  document.getElementById('modal-overlay').classList.add('active');
  document.getElementById(id).classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeAllModals() {
  document.getElementById('modal-overlay').classList.remove('active');
  document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
  document.body.style.overflow = '';
}

// ---- Export / Import ----

function exportData() {
  const data = JSON.stringify(castings, null, 2);
  downloadFile(data, `castboard-backup-${new Date().toISOString().split('T')[0]}.json`, 'application/json');
  toast('Datos exportados', 'success');
}

async function importData(file) {
  try {
    const text = await file.text();
    const data = JSON.parse(text);
    if (!Array.isArray(data)) throw new Error('Formato invalido');
    for (const item of data) {
      if (item.id && item.project) {
        // Migrate old statuses
        if (item.status === 'casting') item.status = 'pending';
        await store.put(item);
      }
    }
    castings = await store.getAll();
    renderAll();
    toast(`${data.length} castings importados`, 'success');
  } catch (err) {
    toast('Error al importar: ' + err.message, 'error');
  }
}

// ---- Render All ----

function renderAll() {
  renderStats();
  renderFilters();
  if (currentView === 'calendar') {
    renderCalendar();
  } else {
    renderKanban();
  }
}

// ---- Event Listeners ----

function setupEvents() {
  document.querySelectorAll('.view-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.view-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentView = tab.dataset.view;
      document.querySelectorAll('.view-content').forEach(v => v.style.display = 'none');
      document.getElementById(`view-${currentView}`).style.display = '';
      renderAll();
    });
  });

  document.getElementById('btn-new').addEventListener('click', () => openForm());

  document.getElementById('btn-gmail').addEventListener('click', () => {
    renderGmailPanel();
    openModal('modal-gmail');
  });

  document.getElementById('btn-settings').addEventListener('click', () => openModal('modal-settings'));

  document.getElementById('modal-overlay').addEventListener('click', closeAllModals);
  document.getElementById('modal-form-close').addEventListener('click', closeAllModals);
  document.getElementById('modal-detail-close').addEventListener('click', closeAllModals);
  document.getElementById('modal-gmail-close').addEventListener('click', closeAllModals);
  document.getElementById('modal-settings-close').addEventListener('click', closeAllModals);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllModals();
  });

  document.getElementById('f-status').addEventListener('change', updateDeadlineVisibility);
  document.getElementById('btn-save').addEventListener('click', saveCasting);
  document.getElementById('btn-delete').addEventListener('click', deleteCasting);
  document.getElementById('btn-cancel').addEventListener('click', closeAllModals);

  document.getElementById('search-input').addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderAll();
  });

  document.getElementById('filter-bar').addEventListener('click', (e) => {
    const chip = e.target.closest('.filter-chip');
    if (chip) {
      currentFilter = chip.dataset.filter;
      renderAll();
    }
  });

  document.getElementById('btn-export')?.addEventListener('click', exportData);
  document.getElementById('btn-import')?.addEventListener('change', (e) => {
    if (e.target.files[0]) importData(e.target.files[0]);
  });
  document.getElementById('btn-export-all-ical')?.addEventListener('click', exportICalAll);
}

// ---- Service Worker ----

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(err => {
      console.log('SW registration failed:', err);
    });
  }
}

// ---- Init ----

async function init() {
  store = new Store();
  await store.init();
  castings = await store.getAll();

  // Migrate old "casting" status to "pending"
  let migrated = false;
  for (const c of castings) {
    if (c.status === 'casting') {
      c.status = 'pending';
      await store.put(c);
      migrated = true;
    }
  }
  if (migrated) castings = await store.getAll();

  const savedToken = localStorage.getItem('gmail_token');
  if (savedToken) {
    gmailToken = savedToken;
    gmailConnected = true;
    // Start auto-sync and do an immediate check
    startAutoSync();
    setTimeout(() => gmailAutoSync(true), 2000);
  }

  setupEvents();
  renderAll();
  registerSW();

  console.log("Dickmanns' CastBoard initialized with", castings.length, 'castings');
}

init();
