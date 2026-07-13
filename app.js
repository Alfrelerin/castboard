/* ============================================
   Dickmanns' CastBoard - Main Application Logic
   Firebase Edition (cloud sync across devices)
   ============================================ */

// ---- Firebase Config ----
const firebaseConfig = {
  apiKey: "AIzaSyAYQXv9dkKwcldUoUGBJH6PvSAHoB248mE",
  authDomain: "castboard-8bda8.firebaseapp.com",
  projectId: "castboard-8bda8",
  storageBucket: "castboard-8bda8.firebasestorage.app",
  messagingSenderId: "838332611412",
  appId: "1:838332611412:web:fdf35a4ee30ec71bc026c1",
};

firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
// Fix for Safari: force long polling to completely avoid WebChannel CORS issues
db.settings({ experimentalForceLongPolling: true });

// ---- Cloud Store (Firestore) ----
let currentUser = null;
let firestoreUnsubscribe = null;

function userCastingsRef() {
  return db.collection('users').doc(currentUser.uid).collection('castings');
}

function userSettingsRef() {
  return db.collection('users').doc(currentUser.uid).collection('settings');
}

const store = {
  async getAll() {
    const snap = await userCastingsRef().get();
    return snap.docs.map(d => d.data());
  },

  async put(casting) {
    await userCastingsRef().doc(casting.id).set(casting);
  },

  async delete(id) {
    await userCastingsRef().doc(id).delete();
  },

  async clear() {
    const snap = await userCastingsRef().get();
    const batch = db.batch();
    snap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();
  },

  // Real-time listener: calls onUpdate(castings[]) whenever data changes
  listen(onUpdate) {
    if (firestoreUnsubscribe) firestoreUnsubscribe();
    firestoreUnsubscribe = userCastingsRef().onSnapshot(snap => {
      const data = snap.docs.map(d => {
        const c = d.data();
        // Migrate removed statuses
        if (c.status === 'filming') { c.status = 'booked'; userCastingsRef().doc(c.id).update({ status: 'booked' }).catch(() => {}); }
        return c;
      });
      onUpdate(data);
    });
  },

  stopListening() {
    if (firestoreUnsubscribe) {
      firestoreUnsubscribe();
      firestoreUnsubscribe = null;
    }
  }
};

// ---- Dismissed Gmail IDs (Firestore-backed, syncs across devices) ----
async function getDismissedGmailIds() {
  try {
    const doc = await userSettingsRef().doc('dismissed_gmail_ids').get();
    if (doc.exists) {
      return new Set(doc.data().ids || []);
    }
  } catch (e) { console.warn('getDismissedGmailIds error:', e); }
  return new Set();
}

async function addDismissedGmailId(gmailId) {
  const ids = await getDismissedGmailIds();
  ids.add(gmailId);
  await userSettingsRef().doc('dismissed_gmail_ids').set({ ids: [...ids] });
}

async function dismissCasting(castingId) {
  const casting = castings.find(c => c.id === castingId);
  if (!casting) return;
  if (casting.gmailId) {
    await addDismissedGmailId(casting.gmailId);
  }
  await store.delete(castingId);
  closeAllModals();
  toast('Casting descartado — no volverá a importarse', 'success');
}

// ---- Status Config (3 groups) ----
const STATUSES = {
  pending:   { label: 'Pendiente',           color: '#a78bfa', icon: '📋', group: 'proceso' },
  recorded:  { label: 'Grabado no enviado',  color: '#c4b5fd', icon: '🎬', group: 'proceso' },
  sent:      { label: 'Enviado',             color: '#818cf8', icon: '📤', group: 'proceso' },
  callback:  { label: 'Callback',            color: '#fbbf24', icon: '📞', group: 'respuesta' },
  optioned:  { label: 'Opcionada',           color: '#60a5fa', icon: '⭐', group: 'respuesta' },
  rejected:  { label: 'Opción caída',        color: '#9ca3af', icon: '📉', group: 'respuesta' },
  booked:    { label: 'Aceptada',            color: '#34d399', icon: '✅', group: 'respuesta' },
  declined:  { label: 'Rechazado',           color: '#94a3b8', icon: '🚫', group: 'rechazada' },
};

const STATUS_GROUPS = [
  { key: 'proceso',   label: 'En proceso',   statuses: ['pending', 'recorded', 'sent'] },
  { key: 'respuesta', label: 'Con respuesta', statuses: ['callback', 'optioned', 'rejected', 'booked'] },
  { key: 'rechazada', label: 'Rechazada',     statuses: ['declined'] },
];

const ALL_STATUSES = STATUS_GROUPS.flatMap(g => g.statuses);

// ---- Color Themes ----
const THEMES = {
  violeta:  { accent: '#a78bfa', accentLight: '#c4b5fd', accentGlow: 'rgba(167,139,250,0.2)', label: 'Violeta' },
  rosa:     { accent: '#f472b6', accentLight: '#f9a8d4', accentGlow: 'rgba(244,114,182,0.2)', label: 'Rosa' },
  dorado:   { accent: '#fbbf24', accentLight: '#fde68a', accentGlow: 'rgba(251,191,36,0.2)', label: 'Dorado' },
  azul:     { accent: '#60a5fa', accentLight: '#93c5fd', accentGlow: 'rgba(96,165,250,0.2)', label: 'Azul' },
  verde:    { accent: '#34d399', accentLight: '#6ee7b7', accentGlow: 'rgba(52,211,153,0.2)', label: 'Verde' },
  coral:    { accent: '#fb923c', accentLight: '#fdba74', accentGlow: 'rgba(251,146,60,0.2)', label: 'Coral' },
};

function applyTheme(themeKey) {
  const theme = THEMES[themeKey] || THEMES.violeta;
  document.documentElement.style.setProperty('--accent', theme.accent);
  document.documentElement.style.setProperty('--accent-light', theme.accentLight);
  document.documentElement.style.setProperty('--accent-glow', theme.accentGlow);
  localStorage.setItem('castboard_theme', themeKey);
}

// ---- Confetti ----
function launchConfetti() {
  const canvas = document.createElement('canvas');
  canvas.id = 'confetti-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;z-index:99999;pointer-events:none;';
  document.body.appendChild(canvas);
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const ctx = canvas.getContext('2d');

  const colors = ['#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#fbbf24','#a78bfa'];
  const particles = [];
  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      w: Math.random() * 10 + 5,
      h: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 4,
      vy: Math.random() * 3 + 2,
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
      opacity: 1,
    });
  }

  let frame = 0;
  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    let alive = false;
    particles.forEach(p => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05;
      p.rotation += p.rotSpeed;
      if (frame > 60) p.opacity -= 0.01;
      if (p.opacity <= 0) return;
      alive = true;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rotation * Math.PI / 180);
      ctx.globalAlpha = Math.max(0, p.opacity);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      ctx.restore();
    });
    frame++;
    if (alive && frame < 200) {
      requestAnimationFrame(animate);
    } else {
      canvas.remove();
    }
  }
  requestAnimationFrame(animate);
}

// ---- Birthday Check ----
function checkBirthday() {
  const now = new Date();
  const isBirthday = now.getMonth() === 4 && now.getDate() === 14; // May = 4 (0-indexed)
  const dismissedKey = 'castboard_bday_dismissed_' + now.getFullYear();

  if (isBirthday && !sessionStorage.getItem(dismissedKey)) {
    const birthYear = 1996;
    const age = now.getFullYear() - birthYear;
    showBirthdayModal(age);
    sessionStorage.setItem(dismissedKey, 'true');
  }
}

function showBirthdayModal(age) {
  const overlay = document.createElement('div');
  overlay.className = 'birthday-overlay';
  overlay.innerHTML = `
    <div class="birthday-card">
      <div class="birthday-emoji">🎂</div>
      <h1 class="birthday-title">MUCHAS FELICIDADES LAURA!!!</h1>
      <p class="birthday-age">Hoy cumples ${age} anitos</p>
      <p class="birthday-hearts">&lt;3 :)</p>
      <button class="btn btn-primary birthday-close" style="margin-top:20px;">Gracias! 💜</button>
    </div>
  `;
  document.body.appendChild(overlay);
  launchConfetti();

  overlay.querySelector('.birthday-close').addEventListener('click', () => {
    overlay.classList.add('birthday-fade-out');
    setTimeout(() => overlay.remove(), 500);
  });
}

// ---- App State ----
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
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function localDateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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
  const timeStr = casting.deadlineTime || casting.time || '';
  let urgency = 'ok';
  let label = '';
  if (diff < 0) { urgency = 'overdue'; label = `Vencida hace ${Math.abs(diff)}d`; }
  else if (diff === 0) { urgency = 'today'; label = 'Hoy' + (timeStr ? ' a las ' + timeStr : ''); }
  else if (diff === 1) { urgency = 'urgent'; label = 'Manana' + (timeStr ? ' a las ' + timeStr : ''); }
  else if (diff <= 3) { urgency = 'urgent'; label = `En ${diff} dias` + (timeStr ? ' (' + timeStr + ')' : ''); }
  else { label = formatDate(casting.deadline) + (timeStr ? ' a las ' + timeStr : ''); }
  return { urgency, label, diff };
}

function getFilteredCastings() {
  let filtered = castings.filter(c => !c.archived);
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
    const d = new Date(casting.date + 'T' + casting.time);
    d.setHours(d.getHours() + 2);
    const endStr = d.toISOString().split('T')[0];
    const endTime = d.toTimeString().slice(0, 5);
    dtend = `DTEND:${toICalDate(endStr, endTime)}`;
  } else if (casting.date) {
    dtstart = `DTSTART;VALUE=DATE:${toICalDate(casting.date)}`;
    if (casting.dateEnd) {
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

  const eventsByDate = {};
  function addEvent(dateKey, casting, eventType) {
    if (!eventsByDate[dateKey]) eventsByDate[dateKey] = [];
    eventsByDate[dateKey].push({ ...casting, _eventType: eventType });
  }

  filtered.forEach(c => {
    if (c.archived) return;
    const isPendingOrRecorded = c.status === 'pending' || c.status === 'recorded';

    if (isPendingOrRecorded && c.date && c.deadline) {
      // Range: start date through day before deadline
      const start = new Date(c.date + 'T12:00:00');
      const end = new Date(c.deadline + 'T12:00:00');
      let d = new Date(start);
      while (d < end) {
        addEvent(localDateKey(d), c, 'range');
        d.setDate(d.getDate() + 1);
      }
      // Deadline day: red with clock icon
      addEvent(c.deadline, c, 'deadline');
    } else if (isPendingOrRecorded && c.deadline) {
      addEvent(c.deadline, c, 'deadline');
    } else if (c.date) {
      addEvent(c.date, c, 'casting');
    }
    // Multi-day events for non-pending (e.g. booked shoots)
    if (c.dateEnd && c.date && !isPendingOrRecorded) {
      let d = new Date(c.date + 'T12:00:00');
      const end = new Date(c.dateEnd + 'T12:00:00');
      d.setDate(d.getDate() + 1);
      while (d <= end) {
        addEvent(localDateKey(d), c, 'casting');
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
      ${events.slice(0, 3).map(e => {
        const cls = e._eventType === 'deadline' ? 'calendar-deadline' : e._eventType === 'range' ? 'calendar-range' : `status-${e.status}`;
        const prefix = e._eventType === 'deadline' ? '⏰ ' : e._eventType === 'range' ? '· ' : '';
        const suffix = e._eventType === 'deadline' && (e.deadlineTime || e.time) ? ' ' + (e.deadlineTime || e.time) : '';
        const titleAttr = e._eventType === 'deadline' ? '⏰ Deadline: ' + e.project : e.project;
        return `<div class="calendar-event ${cls}" data-id="${e.id}" title="${titleAttr}">${prefix}${e.project}${suffix}</div>`;
      }).join('')}
      ${events.length > 3 ? `<div style="font-size:0.65rem;color:var(--text-muted);">+${events.length - 3} mas</div>` : ''}
    </div>`;
  }

  const totalCells = startDay + daysInMonth;
  const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
  for (let i = 1; i <= remaining; i++) {
    html += `<div class="calendar-day other-month"><div class="calendar-day-number">${i}</div></div>`;
  }

  html += '</div>';

  // Empty state: show motivational message when no castings at all
  if (castings.length === 0) {
    html += `
      <div class="empty-state-hero">
        <div class="empty-state-photo-wrapper">
          <img class="empty-state-photo" src="laura-photo.jpeg"
               onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';"
               alt="Laura">
          <div class="empty-state-photo-fallback" style="display:none;">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>
          </div>
        </div>
        <p class="empty-state-title">Todavia no hay castings</p>
        <p class="empty-state-subtitle">Pulsa "+" para anadir tu primer casting o conecta Gmail para importarlos automaticamente</p>
      </div>
    `;
  }

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

const FICTION_TYPES = ['cine', 'serie', 'corto'];

function renderKanban() {
  const el = document.getElementById('view-kanban');
  const filtered = getFilteredCastings();

  el.innerHTML = STATUS_GROUPS.map(group => {
    const columns = [];
    group.statuses.forEach(status => {
      if (status === 'sent') {
        const allSent = filtered.filter(c => c.status === 'sent');
        const fiction = allSent.filter(c => FICTION_TYPES.includes((c.projectType || '').toLowerCase()));
        const other = allSent.filter(c => !FICTION_TYPES.includes((c.projectType || '').toLowerCase()));
        fiction.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        other.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        columns.push({ status: 'sent', items: fiction, label: 'Enviado — Ficción', icon: '🎭' });
        columns.push({ status: 'sent-other', items: other, label: 'Enviado — Fifth', icon: '📤' });
      } else {
        const items = filtered.filter(c => c.status === status);
        items.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
        columns.push({ status, items });
      }
    });

    return `
      <div class="kanban-group">
        <div class="kanban-group-title group-${group.key}">${group.label}</div>
        <div class="kanban-group-columns">
          ${columns.map(col => {
            const colLabel = col.label || STATUSES[col.status].label;
            const colIcon = col.icon || STATUSES[col.status].icon;
            const colColor = STATUSES[col.status === 'sent-other' ? 'sent' : col.status].color;
            return `
            <div class="kanban-column">
              <div class="kanban-column-header">
                <div class="kanban-column-dot" style="background:${colColor}"></div>
                <span class="kanban-column-title">${colLabel}</span>
                <span class="kanban-column-count">${col.items.length}</span>
              </div>
              <div class="kanban-cards" data-status="${col.status}">
                ${col.items.length === 0 ? `
                  <div class="empty-state" style="padding:20px;">
                    <div style="font-size:1.5rem;opacity:0.3;">${colIcon}</div>
                    <div style="font-size:0.8rem;margin-top:4px;">Sin elementos</div>
                  </div>
                ` : col.items.map(c => `
                  <div class="kanban-card fade-in" data-id="${c.id}" draggable="true">
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
                      ${c.projectType ? `<span class="tag" style="background:rgba(0,0,0,0.04);color:var(--text-secondary)">${c.projectType}</span>` : ''}
                    </div>
                  </div>
                `).join('')}
              </div>
            </div>
          `}).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Click to open detail
  el.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('click', () => {
      const casting = castings.find(c => c.id === card.dataset.id);
      if (casting) openDetail(casting);
    });
  });

  // Drag & Drop
  el.querySelectorAll('.kanban-card').forEach(card => {
    card.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', card.dataset.id);
      card.classList.add('dragging');
      setTimeout(() => card.style.opacity = '0.4', 0);
    });
    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
      card.style.opacity = '';
      document.querySelectorAll('.kanban-cards.drag-over').forEach(z => z.classList.remove('drag-over'));
    });
  });

  el.querySelectorAll('.kanban-cards').forEach(zone => {
    zone.addEventListener('dragover', e => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });
    zone.addEventListener('drop', async e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const castingId = e.dataTransfer.getData('text/plain');
      let newStatus = zone.dataset.status;
      // sent-other is a virtual column — actual status is 'sent'
      if (newStatus === 'sent-other') newStatus = 'sent';
      const casting = castings.find(c => c.id === castingId);
      if (!casting || casting.status === newStatus) return;
      casting.status = newStatus;
      await DB.save(casting);
      // Celebration for booked or callback
      if (['booked', 'callback'].includes(newStatus)) {
        launchConfetti();
        showToast(`${STATUSES[newStatus].icon} ${casting.project} → ${STATUSES[newStatus].label}`);
      } else {
        showToast(`${STATUSES[newStatus].icon} ${casting.project} → ${STATUSES[newStatus].label}`);
      }
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
      ${casting.tarifas && casting.tarifas.length > 0 ? `
        <div class="detail-field">
          <span class="detail-field-icon">💰</span>
          <div>
            <div class="detail-field-label">Tarifas</div>
            ${casting.tarifas.map(t => {
              const typeLabels = { rodaje: 'Rodaje', derechos: 'Derechos', derechos_rodaje: 'Derechos + Rodaje' };
              return `<div class="detail-field-value" style="margin-bottom:2px;">${t.amount.toLocaleString('es-ES')} € — ${typeLabels[t.type] || t.type}</div>`;
            }).join('')}
            ${casting.tarifas.length > 1 ? `<div class="detail-field-value" style="font-weight:700;margin-top:4px;color:var(--success);">Total: ${casting.tarifas.reduce((s,t) => s + t.amount, 0).toLocaleString('es-ES')} €</div>` : ''}
          </div>
        </div>
      ` : ''}
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
        <button class="btn btn-sm" id="btn-dismiss-casting" style="background:#ef4444;color:#fff;">🚫 Descartar (falso positivo)</button>
      </div>
    </div>` : ''}

    ${(!casting.needsReview && casting.source === 'gmail') ? `
    <div style="text-align:right;margin-bottom:8px;">
      <button class="btn btn-sm" id="btn-dismiss-casting" style="background:#ef4444;color:#fff;font-size:0.78rem;">🚫 Descartar (no es un casting)</button>
    </div>` : ''}

    ${casting.notes ? `
    <div class="detail-section">
      <div class="detail-section-title">Notas</div>
      <p style="font-size:0.9rem;color:var(--text-secondary);line-height:1.6;white-space:pre-wrap;">${escapeHtml(casting.notes)}</p>
    </div>` : ''}

    <div style="text-align:center;margin:16px 0 8px;">
      <button class="btn btn-secondary btn-sm" id="btn-archive-casting">
        ${casting.archived ? '📂 Desarchivar' : '📦 Archivar'}
      </button>
    </div>

    <div class="detail-section">
      <div class="detail-section-title">Metadatos</div>
      ${detailField(null, 'Origen', casting.source === 'gmail' ? 'Importado de Gmail' : 'Entrada manual')}
      ${detailField(null, 'Creado', new Date(casting.createdAt).toLocaleString('es-ES'))}
      ${casting.updatedAt ? detailField(null, 'Actualizado', new Date(casting.updatedAt).toLocaleString('es-ES')) : ''}
      ${casting.archived ? detailField(null, 'Estado', '📦 Archivado') : ''}
    </div>
  `;

  body.querySelectorAll('.detail-status-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const oldStatus = casting.status;
      casting.status = btn.dataset.status;
      casting.updatedAt = Date.now();
      await store.put(casting);

      // Confetti for celebration-worthy status changes
      const celebrationStatuses = ['booked', 'callback'];
      if (celebrationStatuses.includes(casting.status) && oldStatus !== casting.status) {
        toast(`${casting.project} — ${STATUSES[casting.status].label}! 🎉`, 'success');
        launchConfetti();
      } else {
        toast(`Estado cambiado a "${STATUSES[casting.status].label}"`);
      }

      openDetail(casting);
    });
  });

  document.getElementById('btn-verify-casting')?.addEventListener('click', async () => {
    await markAsReviewed(casting.id);
    casting.needsReview = false;
    openDetail(casting);
  });
  document.getElementById('btn-edit-and-verify')?.addEventListener('click', () => {
    closeAllModals();
    openForm(casting);
  });

  document.getElementById('btn-dismiss-casting')?.addEventListener('click', async () => {
    if (!confirm('¿Descartar este casting? Si vino de Gmail, no volverá a importarse.')) return;
    await dismissCasting(casting.id);
  });

  document.getElementById('btn-edit').onclick = () => {
    closeAllModals();
    openForm(casting);
  };

  document.getElementById('btn-export-ical').onclick = () => {
    exportICalSingle(casting);
  };

  document.getElementById('btn-archive-casting')?.addEventListener('click', async () => {
    casting.archived = !casting.archived;
    casting.updatedAt = Date.now();
    await DB.save(casting);
    toast(casting.archived ? '📦 Casting archivado' : '📂 Casting desarchivado');
    openDetail(casting);
  });

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

// ---- Tarifas (fees) ----
let currentTarifas = [];

function renderTarifas() {
  const list = document.getElementById('f-tarifas-list');
  list.innerHTML = currentTarifas.map((t, i) => `
    <div class="tarifa-row" data-index="${i}">
      <input type="number" class="form-input tarifa-amount" value="${t.amount || ''}" placeholder="0" min="0" step="0.01" style="width:100px;">
      <span style="color:var(--text-muted);font-size:0.85rem;">€</span>
      <select class="form-select tarifa-type" style="flex:1;">
        <option value="rodaje" ${t.type === 'rodaje' ? 'selected' : ''}>Rodaje</option>
        <option value="derechos" ${t.type === 'derechos' ? 'selected' : ''}>Derechos</option>
        <option value="derechos_rodaje" ${t.type === 'derechos_rodaje' ? 'selected' : ''}>Derechos + Rodaje</option>
      </select>
      <button type="button" class="btn btn-ghost btn-icon tarifa-remove" title="Quitar">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  `).join('');

  list.querySelectorAll('.tarifa-row').forEach((row, i) => {
    row.querySelector('.tarifa-amount').addEventListener('input', e => { currentTarifas[i].amount = parseFloat(e.target.value) || 0; });
    row.querySelector('.tarifa-type').addEventListener('change', e => { currentTarifas[i].type = e.target.value; });
    row.querySelector('.tarifa-remove').addEventListener('click', () => { currentTarifas.splice(i, 1); renderTarifas(); });
  });
}

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
    document.getElementById('f-deadline').value = casting.deadline || '';
    document.getElementById('f-deadline-time').value = casting.deadlineTime || casting.time || '';
    document.getElementById('f-date-end').value = casting.dateEnd || '';
    document.getElementById('f-location').value = casting.location || '';
    document.getElementById('f-director').value = casting.director || '';
    document.getElementById('f-company').value = casting.company || '';
    document.getElementById('f-type').value = casting.projectType || '';
    document.getElementById('f-notes').value = casting.notes || '';
    currentTarifas = (casting.tarifas || []).map(t => ({ ...t }));
  } else {
    title.textContent = 'Nuevo Casting';
    deleteBtn.style.display = 'none';
    document.getElementById('casting-form').reset();
    currentTarifas = [];
    if (presetDate) {
      document.getElementById('f-date').value = presetDate;
    }
  }

  renderTarifas();
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

  const oldCasting = editingId ? castings.find(c => c.id === editingId) : null;
  const isEditing = !!editingId;

  const casting = {
    id: editingId || genId(),
    project,
    character: document.getElementById('f-character').value.trim(),
    role: document.getElementById('f-role').value.trim(),
    status: document.getElementById('f-status').value,
    date: document.getElementById('f-date').value,
    time: '', // deprecated, kept for compat
    deadline: document.getElementById('f-deadline').value,
    deadlineTime: document.getElementById('f-deadline-time').value,
    dateEnd: document.getElementById('f-date-end').value,
    location: document.getElementById('f-location').value.trim(),
    director: document.getElementById('f-director').value.trim(),
    company: document.getElementById('f-company').value.trim(),
    projectType: document.getElementById('f-type').value,
    notes: document.getElementById('f-notes').value.trim(),
    tarifas: currentTarifas.filter(t => t.amount > 0),
    source: oldCasting?.source || 'manual',
    gmailId: oldCasting?.gmailId || null,
    needsReview: oldCasting ? false : false, // editing always clears review flag
    createdAt: oldCasting?.createdAt || Date.now(),
    updatedAt: isEditing ? Date.now() : null,
  };

  // Check if status changed to a celebration-worthy state
  const celebrationStatuses = ['booked', 'callback'];
  const isNewCelebration = celebrationStatuses.includes(casting.status) &&
    (!oldCasting || oldCasting.status !== casting.status);

  await store.put(casting);
  closeAllModals();

  if (isNewCelebration) {
    const statusLabel = STATUSES[casting.status]?.label || casting.status;
    toast(`${casting.project} — ${statusLabel}! 🎉`, 'success');
    launchConfetti();
  } else {
    toast(isEditing ? 'Casting actualizado' : 'Casting creado', 'success');
  }
  editingId = null;
}

async function deleteCasting() {
  if (!editingId) return;
  if (!confirm('Seguro que quieres eliminar este casting?')) return;
  await store.delete(editingId);
  closeAllModals();
  toast('Casting eliminado');
  editingId = null;
}

// ---- Gmail Integration ----

const DEFAULT_KEYWORDS = 'casting, callback, audicion, audición, self-tape, selftape, personaje, papel, director de casting, directora de casting, rodaje, grabacion, grabación, prueba cámara, prueba de cámara, videobook, audition, casting call, screen test, fitting, wardrobe fitting, table read, recall, shortlist, sides, shooting, call sheet, casting director';

let autoSyncInterval = null;
const AUTO_SYNC_MS = 3 * 60 * 1000;

// ---- Email Body Parser ----

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

  let projectName = subject
    .replace(/^(re:|fwd:|fw:|rv:)\s*/gi, '')
    .replace(/casting\s*[-:]\s*/i, '')
    .replace(/convocatoria\s*[-:]\s*/i, '')
    .trim();
  result.project = projectName || subject;

  if (/callback|segunda prueba|segunda fase|te hemos seleccionado para.*prueba|recall|called back|second round/i.test(text)) {
    result.detectedStatus = 'callback';
  } else if (/opcionad[ao]|en opci[oó]n|shortlist|preseleccionad|on hold|penciled|avail check/i.test(text)) {
    result.detectedStatus = 'optioned';
  } else if (/confirmad[ao]|seleccionad[ao]|enhorabuena.*papel|felicidades.*papel|has sido elegid|you('ve| have) been (selected|cast|booked)|congratulations|you got the (part|role)/i.test(text)) {
    result.detectedStatus = 'booked';
  } else if (/no ha sido posible|lamentablemente|no.*seleccionad|descartad|no.*elegid|unfortunately|not been selected|went another direction|decided to go with/i.test(text)) {
    result.detectedStatus = 'rejected';
  }

  const charMatch = body.match(/personaje[:\s]+["']?([^"'\n,]{2,40})["']?/i)
    || body.match(/papel(?:\s+de)?[:\s]+["']?([^"'\n,]{2,40})["']?/i)
    || body.match(/character[:\s]+["']?([^"'\n,]{2,40})["']?/i)
    || body.match(/(?:role|part)\s+of[:\s]+["']?([^"'\n,]{2,40})["']?/i);
  if (charMatch) result.character = charMatch[1].trim();

  const roleMatch = body.match(/rol[:\s]+["']?([^"'\n,]{2,30})["']?/i)
    || body.match(/(protagonista|antagonista|secundari[oa]|figurante|extra|figuraci[oó]n|reparto principal)/i)
    || body.match(/(lead|supporting|guest star|co-star|recurring|featured|background|principal|day player)/i);
  if (roleMatch) result.role = roleMatch[1].trim();

  const months = { enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6, julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12, january:1, february:2, march:3, april:4, may:5, june:6, july:7, august:8, september:9, october:10, november:11, december:12 };
  const allMonthNames = Object.keys(months).join('|');
  const dateMatch1 = body.match(new RegExp(`(\\d{1,2})\\s+de\\s+(${allMonthNames})(?:\\s+(?:de\\s+)?(\\d{4}))?`, 'i'));
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

  if (!result.date && emailDate) {
    try {
      const d = new Date(emailDate);
      if (!isNaN(d)) result.date = d.toISOString().split('T')[0];
    } catch(e) {}
  }

  const timeMatch = body.match(/(\d{1,2})[:\.](\d{2})\s*(?:h|hrs?|horas?)?/i)
    || body.match(/a las\s+(\d{1,2})[:\.]?(\d{2})?/i);
  if (timeMatch) {
    const h = String(timeMatch[1]).padStart(2, '0');
    const m = String(timeMatch[2] || '00').padStart(2, '0');
    result.time = `${h}:${m}`;
  }

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

  const locMatch = body.match(/(?:direcci[oó]n|ubicaci[oó]n|lugar|localizaci[oó]n|d[oó]nde|location|address|venue|studio|where)[:\s]+([^\n]{5,60})/i)
    || body.match(/(?:calle|avda\.?|avenida|plaza|estudio|plat[oó])\s+[^\n]{3,50}/i);
  if (locMatch) result.location = (locMatch[1] || locMatch[0]).trim();

  const dirMatch = body.match(/(?:director(?:a)?\s+de\s+casting|casting\s+director|CD)[:\s]+([^\n]{3,40})/i)
    || body.match(/(?:casting\s+(?:por|de|by))[:\s]+([^\n]{3,40})/i);
  if (dirMatch) result.director = dirMatch[1].trim();

  const compMatch = body.match(/(?:productora|producci[oó]n|agencia|produc\.?|production|agency|produced by|production company)[:\s]+([^\n]{3,40})/i);
  if (compMatch) {
    result.company = compMatch[1].trim();
  } else if (from) {
    const fromMatch = from.match(/(?:^|\s)([^<@]+?)(?:\s*<|$)/);
    if (fromMatch) result.company = fromMatch[1].trim();
  }

  if (/pel[ií]cula|largometraje|cine|feature film|movie/i.test(text)) result.projectType = 'cine';
  else if (/serie|temporada|cap[ií]tulo|episodio|tv\s*series|episode|season/i.test(text)) result.projectType = 'serie';
  else if (/cortometraje|corto|short\s*film/i.test(text)) result.projectType = 'corto';
  else if (/anuncio|spot|publicidad|comercial|commercial|advert|ad\s*campaign/i.test(text)) result.projectType = 'publicidad';
  else if (/teatro|obra|escena|theatre|theater|play|stage/i.test(text)) result.projectType = 'teatro';
  else if (/videoclip|v[ií]deo\s*musical|music\s*video/i.test(text)) result.projectType = 'videoclip';

  return result;
}

function decodeEmailBody(payload) {
  if (!payload) return '';
  if (payload.body?.data) {
    return atob(payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
  }
  if (payload.parts) {
    let textPart = payload.parts.find(p => p.mimeType === 'text/plain');
    if (!textPart) textPart = payload.parts.find(p => p.mimeType === 'text/html');
    if (textPart?.body?.data) {
      let decoded = atob(textPart.body.data.replace(/-/g, '+').replace(/_/g, '/'));
      if (textPart.mimeType === 'text/html') {
        decoded = decoded.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
      }
      return decoded;
    }
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

function formatSyncTime() {
  const now = new Date();
  return now.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }) + ' ' +
         now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

async function gmailAutoSync(silent = true) {
  if (!gmailToken || !gmailConnected) {
    console.log('Gmail sync skipped: token=' + !!gmailToken + ' connected=' + gmailConnected);
    if (!silent) toast('Gmail no conectado. Pulsa "Conectar Gmail" primero.', 'error');
    return;
  }

  const keywords = localStorage.getItem('gmail_keywords') || DEFAULT_KEYWORDS;
  // Use date-only for the Gmail query (after:), not for display
  const lastSyncDate = localStorage.getItem('gmail_last_sync_date') || '';

  try {
    let queryParts = keywords.split(',').map(k => k.trim()).filter(Boolean);
    let query = queryParts.map(k => `"${k}"`).join(' OR ');
    if (lastSyncDate) {
      query += ` after:${lastSyncDate}`;
    } else {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      query += ` after:${thirtyDaysAgo.toISOString().split('T')[0].replace(/-/g, '/')}`;
    }

    console.log('Gmail sync query:', query);

    const searchUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=20`;
    const res = await fetch(searchUrl, { headers: { Authorization: `Bearer ${gmailToken}` } });

    if (res.status === 401) {
      gmailConnected = false;
      gmailToken = null;
      stopAutoSync();
      if (!silent) toast('Sesion de Gmail expirada. Reconecta desde el boton de Gmail.', 'error');
      renderGmailPanel();
      return;
    }

    if (!res.ok) {
      console.error('Gmail API error:', res.status, await res.text());
      if (!silent) toast('Error de Gmail API: ' + res.status, 'error');
      return;
    }

    const data = await res.json();
    console.log('Gmail sync found', data.messages?.length || 0, 'messages matching keywords');

    if (!data.messages || data.messages.length === 0) {
      localStorage.setItem('gmail_last_sync_date', new Date().toISOString().split('T')[0].replace(/-/g, '/'));
      localStorage.setItem('gmail_last_sync', formatSyncTime());
      if (!silent) toast('No se encontraron emails nuevos de casting', 'info');
      return;
    }

    const existingGmailIds = new Set(castings.filter(c => c.gmailId).map(c => c.gmailId));
    const dismissedIds = await getDismissedGmailIds();

    let imported = 0;
    let skippedExisting = 0;
    let skippedDismissed = 0;

    for (const msg of data.messages) {
      if (existingGmailIds.has(msg.id)) { skippedExisting++; continue; }
      if (dismissedIds.has(msg.id)) { skippedDismissed++; continue; }

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

      console.log('Processing email:', subject, '| from:', from);

      const parsed = parseEmailBody(subject, body, from, emailDate);

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

    localStorage.setItem('gmail_last_sync_date', new Date().toISOString().split('T')[0].replace(/-/g, '/'));
    localStorage.setItem('gmail_last_sync', formatSyncTime());

    console.log(`Gmail sync done: ${imported} imported, ${skippedExisting} already existed, ${skippedDismissed} dismissed`);

    if (imported > 0) {
      toast(`${imported} casting(s) importado(s) desde Gmail`, 'success');
    } else if (!silent) {
      toast(`${data.messages.length} emails encontrados pero ya estaban importados o descartados`, 'info');
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

async function markAsReviewed(castingId) {
  const casting = castings.find(c => c.id === castingId);
  if (!casting) return;
  casting.needsReview = false;
  casting.updatedAt = Date.now();
  await store.put(casting);
  toast('Casting verificado', 'success');
}

// ---- Gmail Panel UI ----

function renderGmailPanel() {
  const body = document.getElementById('gmail-body');
  const lastSync = localStorage.getItem('gmail_last_sync') || 'Nunca';
  const pendingReview = castings.filter(c => c.needsReview).length;

  body.innerHTML = `
    <div class="gmail-status">
      <div class="gmail-dot ${gmailConnected ? 'connected' : 'disconnected'}"></div>
      <span class="gmail-status-text">${gmailConnected ? 'Conectado — sincronizacion automatica activa' : 'No conectado a Gmail'}</span>
      ${gmailConnected
        ? '<button class="btn btn-sm btn-secondary" id="btn-gmail-disconnect">Desconectar</button>'
        : '<button class="btn btn-sm btn-primary" id="btn-gmail-connect">Conectar Gmail</button>'
      }
    </div>

    ${gmailConnected ? `
      <div style="font-size:0.8rem;color:var(--text-muted);margin-bottom:16px;">
        Ultima sincronizacion: ${lastSync || 'Nunca'}
        ${pendingReview > 0 ? ` — <span style="color:var(--warning);font-weight:700;">${pendingReview} casting(s) por revisar</span>` : ' — Todo al dia'}
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
        <p>Pulsa "Conectar Gmail" para autorizar el acceso de lectura a tu Gmail. Solo se leeran los emails, no se modificara ni enviara nada.</p>
        <p>Una vez conectado, los emails de casting se importaran automaticamente cada 3 minutos.</p>
      </div>
    `}
  `;

  document.getElementById('btn-gmail-connect')?.addEventListener('click', gmailConnect);
  document.getElementById('btn-gmail-disconnect')?.addEventListener('click', gmailDisconnect);
  document.getElementById('btn-gmail-sync-now')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-gmail-sync-now');
    if (btn) { btn.disabled = true; btn.textContent = 'Sincronizando...'; }
    await gmailAutoSync(false);
    renderGmailPanel();
  });
  document.getElementById('btn-save-keywords')?.addEventListener('click', () => {
    const kw = document.getElementById('gmail-keywords')?.value || '';
    localStorage.setItem('gmail_keywords', kw);
    toast('Palabras clave guardadas', 'success');
  });
}

async function gmailConnect() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope(GMAIL_SCOPES);
    provider.setCustomParameters({ prompt: 'consent' });

    let result;
    try {
      // Try popup first (works on most browsers)
      result = await auth.signInWithPopup(provider);
    } catch (popupErr) {
      // If popup blocked (common in Safari), fall back to redirect
      if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/popup-closed-by-user') {
        console.log('Popup blocked, falling back to redirect...');
        toast('Redirigiendo a Google para conectar Gmail...', 'info');
        // Store flag so we know to check for Gmail token on redirect return
        sessionStorage.setItem('castboard_gmail_redirect', 'true');
        await auth.signInWithRedirect(provider);
        return; // Page will redirect
      }
      throw popupErr;
    }

    console.log('Gmail connect result:', result);
    handleGmailResult(result);
  } catch (err) {
    console.error('Gmail connect error code:', err.code, 'message:', err.message);
    toast('Error al conectar con Gmail: ' + err.message, 'error');
  }
}

function handleGmailResult(result) {
  const accessToken = result.credential?.accessToken;
  console.log('Access token obtained:', !!accessToken);

  if (accessToken) {
    gmailToken = accessToken;
    gmailConnected = true;
    renderGmailPanel();
    toast('Conectado a Gmail. Buscando emails...', 'success');
    gmailAutoSync(false).then(() => renderGmailPanel());
    startAutoSync();
  } else {
    toast('No se pudo obtener el token de Gmail. Intenta de nuevo.', 'error');
    console.log('result.credential:', result.credential);
  }
}

function gmailDisconnect() {
  stopAutoSync();
  gmailToken = null;
  gmailConnected = false;
  renderGmailPanel();
  toast('Desconectado de Gmail');
}

// ---- Auth: Login / Logout ----

async function loginWithGoogle() {
  try {
    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope(GMAIL_SCOPES);

    let result;
    try {
      result = await auth.signInWithPopup(provider);
    } catch (popupErr) {
      if (popupErr.code === 'auth/popup-blocked' || popupErr.code === 'auth/popup-closed-by-user') {
        console.log('Popup blocked on login, using redirect...');
        sessionStorage.setItem('castboard_gmail_redirect', 'true');
        await auth.signInWithRedirect(provider);
        return;
      }
      throw popupErr;
    }

    // Grab Gmail token (compat SDK: result.credential directly)
    handleGmailResult(result);
  } catch (err) {
    console.error('Login error:', err);
    toast('Error al iniciar sesion: ' + err.message, 'error');
  }
}

async function logout() {
  stopAutoSync();
  store.stopListening();
  gmailToken = null;
  gmailConnected = false;
  castings = [];
  currentUser = null;
  await auth.signOut();
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
        if (item.status === 'casting') item.status = 'pending';
        await store.put(item);
      }
    }
    toast(`${data.length} castings importados`, 'success');
  } catch (err) {
    toast('Error al importar: ' + err.message, 'error');
  }
}

// ---- Statistics ----

function renderStatsView() {
  const el = document.getElementById('view-stats');
  if (!el) return;

  const now = new Date();
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  // Group castings by month (last 6 months)
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(thisYear, thisMonth - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('es-ES', { month: 'short' });
    const monthCastings = castings.filter(c => (c.date || '').startsWith(key) || (!c.date && c.createdAt && new Date(c.createdAt).getMonth() === d.getMonth() && new Date(c.createdAt).getFullYear() === d.getFullYear()));
    months.push({ key, label, castings: monthCastings, count: monthCastings.length });
  }

  const maxCount = Math.max(...months.map(m => m.count), 1);
  const totalAll = castings.length;
  const accepted = castings.filter(c => c.status === 'booked').length;
  const callbacks = castings.filter(c => c.status === 'callback').length;
  const pending = castings.filter(c => c.status === 'pending' || c.status === 'recorded' || c.status === 'sent').length;
  const rejected = castings.filter(c => c.status === 'rejected').length;
  const declined = castings.filter(c => c.status === 'declined').length;
  const rate = totalAll > 0 ? Math.round((accepted / totalAll) * 100) : 0;

  // By project type
  const byType = {};
  castings.forEach(c => {
    const t = c.projectType || 'sin tipo';
    byType[t] = (byType[t] || 0) + 1;
  });

  el.innerHTML = `
    <div class="stats-section">
      <h3 class="stats-section-title">Resumen general</h3>
      <div class="stats-overview">
        <div class="stats-overview-item">
          <span class="stats-overview-number" style="color:var(--accent)">${totalAll}</span>
          <span class="stats-overview-label">Total castings</span>
        </div>
        <div class="stats-overview-item">
          <span class="stats-overview-number" style="color:var(--success)">${accepted}</span>
          <span class="stats-overview-label">Aceptados</span>
        </div>
        <div class="stats-overview-item">
          <span class="stats-overview-number" style="color:var(--warning)">${callbacks}</span>
          <span class="stats-overview-label">Callbacks</span>
        </div>
        <div class="stats-overview-item">
          <span class="stats-overview-number" style="color:var(--info)">${pending}</span>
          <span class="stats-overview-label">En proceso</span>
        </div>
        <div class="stats-overview-item">
          <span class="stats-overview-number" style="color:var(--rejected)">${rejected}</span>
          <span class="stats-overview-label">Opción caída</span>
        </div>
        <div class="stats-overview-item">
          <span class="stats-overview-number" style="color:var(--declined)">${declined}</span>
          <span class="stats-overview-label">Rechazados</span>
        </div>
      </div>
      ${totalAll > 0 ? `
        <div class="stats-rate">
          <div class="stats-rate-bar">
            <div class="stats-rate-fill" style="width:${rate}%;background:var(--success);"></div>
          </div>
          <span class="stats-rate-label">Tasa de aceptacion: <strong>${rate}%</strong> (${accepted}/${totalAll})</span>
        </div>
      ` : ''}
    </div>

    <div class="stats-section">
      <h3 class="stats-section-title">Ultimos 6 meses</h3>
      <div class="stats-chart">
        ${months.map(m => `
          <div class="stats-bar-col">
            <div class="stats-bar-value">${m.count}</div>
            <div class="stats-bar-track">
              <div class="stats-bar-fill" style="height:${(m.count / maxCount) * 100}%"></div>
            </div>
            <div class="stats-bar-label">${m.label}</div>
          </div>
        `).join('')}
      </div>
    </div>

    ${Object.keys(byType).length > 0 ? `
      <div class="stats-section">
        <h3 class="stats-section-title">Por tipo de proyecto</h3>
        <div class="stats-type-list">
          ${Object.entries(byType).sort((a,b) => b[1] - a[1]).map(([type, count]) => `
            <div class="stats-type-row">
              <span class="stats-type-name">${type}</span>
              <div class="stats-type-bar-track">
                <div class="stats-type-bar-fill" style="width:${(count / totalAll) * 100}%"></div>
              </div>
              <span class="stats-type-count">${count}</span>
            </div>
          `).join('')}
        </div>
      </div>
    ` : ''}
  `;
}

// ---- Theme Picker (in Settings) ----

function renderThemePicker() {
  const container = document.getElementById('theme-picker');
  if (!container) return;
  const currentTheme = localStorage.getItem('castboard_theme') || 'violeta';
  container.innerHTML = Object.entries(THEMES).map(([key, t]) => `
    <button class="theme-swatch ${key === currentTheme ? 'active' : ''}" data-theme="${key}" style="background:${t.accent};" title="${t.label}"></button>
  `).join('');
  container.querySelectorAll('.theme-swatch').forEach(btn => {
    btn.addEventListener('click', () => {
      applyTheme(btn.dataset.theme);
      container.querySelectorAll('.theme-swatch').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });
}

// ---- Render All ----

function renderAll() {
  renderStats();
  renderFilters();

  // Hide search/filters on stats view (they don't apply)
  const searchEl = document.querySelector('.search-container');
  const filterEl = document.getElementById('filter-bar');
  if (currentView === 'stats') {
    if (searchEl) searchEl.style.display = 'none';
    if (filterEl) filterEl.style.display = 'none';
  } else {
    if (searchEl) searchEl.style.display = '';
    if (filterEl) filterEl.style.display = '';
  }

  if (currentView === 'calendar') {
    renderCalendar();
  } else if (currentView === 'stats') {
    renderStatsView();
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

  document.getElementById('btn-settings').addEventListener('click', () => {
    // Update user info in settings
    if (currentUser) {
      document.getElementById('settings-user-info').textContent =
        `Conectado como: ${currentUser.displayName || currentUser.email}`;
    }
    renderThemePicker();
    openModal('modal-settings');
  });

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
  document.getElementById('btn-add-tarifa').addEventListener('click', () => {
    currentTarifas.push({ amount: 0, type: 'rodaje' });
    renderTarifas();
  });

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

  // Logout button
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    if (confirm('¿Cerrar sesion? Tus datos se mantienen en la nube.')) {
      await logout();
    }
  });

  // Login button
  document.getElementById('btn-login')?.addEventListener('click', loginWithGoogle);
}

// ---- Service Worker ----

function registerSW() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').then(reg => {
      // Check for updates every 60s
      setInterval(() => reg.update(), 60000);
      reg.addEventListener('updatefound', () => {
        const newSW = reg.installing;
        newSW.addEventListener('statechange', () => {
          if (newSW.state === 'activated') {
            window.location.reload();
          }
        });
      });
    }).catch(err => {
      console.log('SW registration failed:', err);
    });
  }
}

// ---- Auth State Observer & Init ----

function showLoginScreen() {
  document.getElementById('login-screen').classList.remove('hidden');
}

function hideLoginScreen() {
  document.getElementById('login-screen').classList.add('hidden');
}

function onUserSignedIn(user) {
  currentUser = user;
  hideLoginScreen();

  // Show user avatar
  const avatar = document.getElementById('user-avatar');
  if (user.photoURL) {
    avatar.src = user.photoURL;
    avatar.style.display = '';
  }

  // Start real-time listener — this keeps castings synced across devices
  store.listen((data) => {
    castings = data;
    // Migrate old statuses
    castings.forEach(c => {
      if (c.status === 'casting') c.status = 'pending';
    });
    renderAll();
  });

  // Start Gmail auto-sync if we have a token
  if (gmailToken && gmailConnected) {
    startAutoSync();
    setTimeout(() => gmailAutoSync(true), 2000);
  }

  // Check birthday
  checkBirthday();

  console.log("Dickmanns' CastBoard initialized for", user.displayName || user.email);
}

function onUserSignedOut() {
  currentUser = null;
  castings = [];
  gmailToken = null;
  gmailConnected = false;
  store.stopListening();
  stopAutoSync();
  showLoginScreen();

  const avatar = document.getElementById('user-avatar');
  avatar.style.display = 'none';
}

// ---- Main Init ----

async function init() {
  // Apply saved theme
  const savedTheme = localStorage.getItem('castboard_theme');
  if (savedTheme) applyTheme(savedTheme);

  setupEvents();
  registerSW();

  // Check if returning from a Gmail redirect (Safari fallback)
  try {
    const redirectResult = await auth.getRedirectResult();
    if (redirectResult && redirectResult.credential) {
      console.log('Got redirect result with credential');
      if (sessionStorage.getItem('castboard_gmail_redirect')) {
        sessionStorage.removeItem('castboard_gmail_redirect');
        handleGmailResult(redirectResult);
      }
    }
  } catch (err) {
    console.warn('getRedirectResult error:', err);
  }

  // Listen for auth state changes
  auth.onAuthStateChanged((user) => {
    if (user) {
      onUserSignedIn(user);
    } else {
      onUserSignedOut();
    }
  });
}

init();
