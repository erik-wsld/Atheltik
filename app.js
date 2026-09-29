'use strict';

const STORE_KEY = 'hbfit.v1';
const DAY = 864e5;
const SECTION_KEYS = ['warmup', 'A', 'B', 'cooldown'];

// Alle Übungen nach id, mit ihrem Abschnitt
const EX = {};
for (const key of SECTION_KEYS) for (const e of PLAN[key].items) EX[e.id] = { ...e, section: key };

const $ = sel => document.querySelector(sel);
const app = $('#app');
const tabbar = $('#tabbar');
const timerEl = $('#timer');
const modalEl = $('#modal');
const ui = { open: null, scrollTo: null, rpe: null };

// ---------- Speicher ----------

function defaults() {
  return {
    settings: { days: [1, 4], startDate: null, gameDate: null, sound: true, voice: true, lastBackup: null },
    history: [],
    active: null,
    videos: {},
    videoLandscape: {}, // Übungen, deren Video quer statt hochkant angezeigt wird
  };
}

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return normalize(JSON.parse(raw));
  } catch (e) { /* ignorieren, mit Standardwerten starten */ }
  return defaults();
}

function normalize(s) {
  const d = defaults();
  return { ...d, ...s, settings: { ...d.settings, ...(s.settings || {}) }, history: s.history || [], videos: s.videos || {}, videoLandscape: s.videoLandscape || {} };
}

let state = load();

function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
  catch (e) { toast('Speichern nicht möglich – privater Modus oder Speicher voll?'); }
}

// Als Home-Bildschirm-App gestartet? Nur dann löscht iOS die Daten nicht nach 7 Tagen ohne Nutzung.
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isMobile = () => navigator.maxTouchPoints > 0;
const storageInfo = { persisted: null };

function backupDue() {
  if (!state.history.length) return false;
  const last = state.settings.lastBackup;
  return !last || Date.now() - last > 30 * DAY;
}

function installHint() {
  if (isStandalone() || !isMobile()) return '';
  return `<p class="note warn">${ICONS.warn}<span><b>Noch nicht installiert:</b> Öffne das Teilen-Menü und wähle „Zum Home-Bildschirm“. Trainiere danach nur noch über das App-Symbol, sonst kann iOS deine Daten nach 7 Tagen ohne Nutzung löschen.</span></p>`;
}

// ---------- Datum ----------

const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const dayDiff = (a, b) => Math.round((startOfDay(b) - startOfDay(a)) / DAY);
const pad = n => String(n).padStart(2, '0');
const toISO = d => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };
const fromISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const fmt = (d, o) => new Intl.DateTimeFormat('de-DE', o).format(new Date(d));
const fmtDay = d => fmt(d, { weekday: 'short', day: 'numeric', month: 'short' });
const fmtDayLong = d => fmt(d, { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = d => fmt(d, { day: 'numeric', month: 'numeric' });
const fmtTime = d => fmt(d, { hour: '2-digit', minute: '2-digit' });
const fmtClock = sec => sec >= 3600
  ? `${Math.floor(sec / 3600)}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`
  : `${Math.floor(sec / 60)}:${pad(sec % 60)}`;
const fmtDur = sec => { const m = Math.round(sec / 60); return m < 60 ? `${m} Min.` : `${Math.floor(m / 60)} h ${m % 60} Min.`; };
const WEEKDAYS = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function relDay(d) {
  const n = dayDiff(new Date(), d);
  if (n === 0) return 'Heute';
  if (n === 1) return 'Morgen';
  if (n === 2) return 'Übermorgen';
  if (n === -1) return 'Gestern';
  if (n < 0) return `vor ${-n} Tagen`;
  return `in ${n} Tagen`;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- Programm & Vorgaben ----------

function sessions() { return [...state.history].sort((a, b) => a.start - b.start); }
function lastSession() { const h = sessions(); return h[h.length - 1] || null; }

function programStart() {
  return state.settings.startDate ? fromISO(state.settings.startDate) : startOfDay(new Date());
}
function weekOf(date) { return Math.max(1, Math.floor(dayDiff(programStart(), date) / 7) + 1); }
const phaseOf = w => (w <= 2 ? 1 : w <= 4 ? 2 : 3);

function setsFor(ex, phase) { return ex.sets + (ex.prog4 && phase >= 2 ? 1 : 0); }
function targetVal(ex, phase) { return phase === 1 || !ex.target.max ? ex.target.min : ex.target.max; }
function restFor(ex, phase) {
  if (ex.restSec != null) return ex.restSec;
  return ex.section === 'warmup' || ex.section === 'cooldown' ? 0 : PHASES[phase].rest;
}

function rangeText(t) {
  if (t.kind === 'time') {
    if (t.max) return `${t.min}–${t.max} Sek.`;
    return t.min >= 60 && t.min % 60 === 0 ? `${t.min / 60} Min.` : `${t.min} Sek.`;
  }
  return (t.max ? `${t.min}–${t.max}` : `${t.min}`) + (t.unit ? ` ${t.unit}` : '');
}

function rxText(ex, phase) {
  const t = ex.target, sets = setsFor(ex, phase);
  let v = rangeText(t);
  if (t.kind === 'reps' && !t.unit && sets === 1) v += '×';
  if (ex.perSide) v += ' pro Seite';
  if (ex.setLabels) return `je ${v}`;
  return sets > 1 ? `${sets}× ${v}` : v;
}

function phaseNotes(ex, phase) {
  return [2, 3].filter(p => phase >= p && ex.phaseNotes?.[p]).map(p => ex.phaseNotes[p]);
}

function sessionSections(type) {
  return ['warmup', type, 'cooldown'].map(key => ({ key, ...PLAN[key] }));
}
function sessionItems(type) { return sessionSections(type).flatMap(s => s.items.map(e => EX[e.id])); }

function nextPlan() {
  const last = lastSession();
  const type = last ? (last.type === 'A' ? 'B' : 'A') : 'A';
  const today = startOfDay(new Date());
  let earliest = last ? addDays(startOfDay(last.start), 2) : today;
  if (earliest < today) earliest = today;
  let date = earliest;
  const days = state.settings.days;
  if (days.length) {
    for (let i = 0; i < 7; i++) {
      const d = addDays(earliest, i);
      if (days.includes(d.getDay())) { date = d; break; }
    }
  }
  const hoursSince = last ? (Date.now() - (last.end || last.start)) / 36e5 : Infinity;
  const warnings = [];
  const game = state.settings.gameDate ? fromISO(state.settings.gameDate) : null;
  if (game && dayDiff(today, game) >= 0) {
    const gap = dayDiff(date, game);
    if (gap >= 0 && gap < 2) warnings.push(`Spiel am ${fmtDay(game)}: Die Einheit sollte spätestens 2 Tage vorher stattfinden – vorziehen oder auslassen.`);
  }
  if (hoursSince < 48) warnings.push(`Letzte Einheit ${hoursSince < 1 ? 'vor weniger als 1 Std.' : `vor ${Math.round(hoursSince)} Std.`} – empfohlen sind mindestens 48 Std. Pause.`);
  return { type, date, last, warnings };
}

// ---------- Aktive Einheit ----------

function progressOf(log) {
  let done = 0, total = 0;
  for (const sets of Object.values(log)) { total += sets.length; done += sets.filter(s => s.done).length; }
  return { done, total };
}

function firstOpenExercise() {
  const a = state.active;
  const ex = sessionItems(a.type).find(e => a.log[e.id].some(s => !s.done));
  return ex ? ex.id : null;
}

function nextPending() {
  const a = state.active;
  for (const ex of sessionItems(a.type)) {
    const i = a.log[ex.id].findIndex(s => !s.done);
    if (i >= 0) return { ex, i };
  }
  return null;
}

function startSession(type) {
  if (state.active && !confirm('Es läuft bereits eine Einheit. Diese verwerfen und neu starten?')) return;
  if (!state.settings.startDate) state.settings.startDate = toISO(new Date());
  const week = weekOf(new Date()), phase = phaseOf(week);
  const log = {};
  for (const ex of sessionItems(type)) {
    log[ex.id] = Array.from({ length: setsFor(ex, phase) }, () => ({ done: false, val: targetVal(ex, phase) }));
  }
  state.active = { type, start: Date.now(), week, log };
  save();
  ui.open = firstOpenExercise();
  location.hash = '#/session';
}

function elapsedSec() { return state.active ? Math.max(0, Math.round((Date.now() - state.active.start) / 1000)) : 0; }

function completeSet(exId, i) {
  const a = state.active;
  if (!a) return;
  a.log[exId][i].done = true;
  save();
  vibrate(30);
  const ex = EX[exId];
  if (a.log[exId].every(s => s.done)) { ui.open = firstOpenExercise(); ui.scrollTo = ui.open; }
  const next = nextPending();
  const rest = restFor(ex, phaseOf(a.week));
  if (!next) {
    render();
    speak('Geschafft. Stark!');
    setTimeout(openFinish, 400);
    return;
  }
  if (rest > 0) {
    const n = a.log[next.ex.id].length;
    runTimer([{ kind: 'rest', label: 'Pause', sub: `Als Nächstes: ${next.ex.name}${n > 1 ? ` · Satz ${next.i + 1}/${n}` : ''}`, sec: rest }],
      () => speak('Weiter geht’s'));
  }
  render();
}

function timedSteps(ex, i) {
  const a = state.active, sets = a.log[ex.id], val = sets[i].val;
  const name = ex.setLabels?.[i] || ex.name;
  const sub = sets.length > 1 && !ex.setLabels ? `${name} · Satz ${i + 1}/${sets.length}` : name;
  const work = ex.reaction ? 'reaction' : 'work';
  const steps = [{ kind: 'prep', label: 'Gleich geht’s los', sub, sec: 3 }];
  if (ex.perSide) {
    steps.push({ kind: work, label: 'Linke Seite', sub, sec: val });
    steps.push({ kind: 'switch', label: 'Seite wechseln', sub, sec: 5 });
    steps.push({ kind: work, label: 'Rechte Seite', sub, sec: val });
  } else {
    steps.push({ kind: work, label: 'Los!', sub, sec: val });
  }
  return steps;
}

// ---------- Ton, Sprache, Vibration, Display an ----------

let actx = null;
function unlockAudio() {
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    if (actx.state === 'suspended') actx.resume();
  } catch (e) { /* kein Audio verfügbar */ }
}
function beep(freq = 880, dur = 0.12, vol = 0.25) {
  if (!state.settings.sound || !actx) return;
  try {
    const o = actx.createOscillator(), g = actx.createGain(), t = actx.currentTime;
    o.frequency.value = freq;
    o.connect(g); g.connect(actx.destination);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  } catch (e) { /* ignorieren */ }
}
function speak(text) {
  if (!state.settings.voice || !('speechSynthesis' in window)) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'de-DE';
    u.rate = 1.05;
    speechSynthesis.speak(u);
  } catch (e) { /* ignorieren */ }
}
const vibrate = p => { try { navigator.vibrate?.(p); } catch (e) { /* ignorieren */ } };

let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && 'wakeLock' in navigator && document.visibilityState === 'visible') {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) { /* nicht unterstützt */ }
}

// ---------- Timer ----------

const CMDS = [
  { text: 'LINKS', arrow: '←', say: 'Links' },
  { text: 'RECHTS', arrow: '→', say: 'Rechts' },
  { text: 'VOR', arrow: '↑', say: 'Vor' },
];
const T = { steps: [], i: 0, endsAt: 0, paused: false, left: 0, iv: null, onDone: null, lastSec: null, cmd: null, cmdAt: 0 };

function runTimer(steps, onDone) {
  stopTimer();
  Object.assign(T, { steps, i: 0, onDone });
  beginStep();
  timerEl.hidden = false;
  T.iv = setInterval(tick, 100);
  tick();
}

function stopTimer() {
  clearInterval(T.iv);
  T.iv = null;
  T.steps = [];
  timerEl.hidden = true;
  timerEl.innerHTML = '';
}

function beginStep() {
  const s = T.steps[T.i];
  Object.assign(T, { endsAt: Date.now() + s.sec * 1000, paused: false, lastSec: null, cmd: null, cmdAt: Date.now() + 500 });
  renderTimer();
  if (s.kind === 'work') { beep(1046, 0.3); speak(s.label === 'Los!' ? 'Los' : s.label); }
  else if (s.kind === 'reaction') beep(1046, 0.3);
  else if (s.kind === 'switch') speak('Seite wechseln');
  else if (s.kind === 'rest') speak('Pause');
}

function tick() {
  const s = T.steps[T.i];
  if (!s) return;
  const ms = T.paused ? T.left : T.endsAt - Date.now();
  if (ms <= 0) return advance();
  const sec = Math.ceil(ms / 1000);
  if (sec !== T.lastSec) {
    T.lastSec = sec;
    if (sec <= 3 && !T.paused && s.sec > 3) beep(660, 0.1);
    const num = timerEl.querySelector('.timer-num');
    if (num) num.textContent = s.kind === 'rest' ? fmtClock(sec) : sec;
  }
  if (s.kind === 'reaction' && !T.paused && Date.now() >= T.cmdAt) newCommand();
  const bar = timerEl.querySelector('.timer-bar i');
  if (bar) bar.style.width = `${Math.min(100, (1 - ms / (s.sec * 1000)) * 100)}%`;
}

function advance() {
  T.i++;
  if (T.i >= T.steps.length) {
    beep(523, 0.5);
    vibrate([200, 100, 200]);
    const cb = T.onDone;
    stopTimer();
    if (cb) cb();
  } else {
    beginStep();
  }
}

function newCommand() {
  let c;
  do { c = CMDS[Math.floor(Math.random() * CMDS.length)]; } while (c === T.cmd && Math.random() < 0.7);
  T.cmd = c;
  T.cmdAt = Date.now() + 1100 + Math.random() * 700;
  beep(1318, 0.08);
  speak(c.say);
  const el = timerEl.querySelector('.timer-cmd');
  if (el) {
    el.innerHTML = `<span>${c.arrow}</span>${c.text}`;
    el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash');
  }
}

function renderTimer() {
  const s = T.steps[T.i];
  const compact = s.kind === 'rest';
  const sec = Math.ceil(s.sec);
  timerEl.className = `timer kind-${s.kind} ${compact ? 'compact' : 'full'}`;
  timerEl.innerHTML = `
    <div class="timer-inner" role="timer" aria-live="off">
      <div class="timer-top">
        <span class="timer-label">${esc(s.label)}</span>
        <button class="icon-btn" data-action="timer-close" aria-label="Timer beenden">${ICONS.close}</button>
      </div>
      <p class="timer-sub">${esc(s.sub || '')}</p>
      ${s.kind === 'reaction' ? '<div class="timer-cmd">Bereit …</div>' : ''}
      <div class="timer-num">${compact ? fmtClock(sec) : sec}</div>
      <div class="timer-bar"><i></i></div>
      <div class="timer-actions">
        <button class="btn ghost" data-action="timer-pause">${T.paused ? 'Fortsetzen' : 'Anhalten'}</button>
        ${compact ? '<button class="btn ghost" data-action="timer-add">+15 s</button>' : ''}
        <button class="btn primary" data-action="timer-skip">${compact ? 'Weiter' : 'Überspringen'}</button>
      </div>
    </div>`;
}

// ---------- Icons ----------

const svg = (d, extra = '') => `<svg viewBox="0 0 24 24" aria-hidden="true" ${extra}>${d}</svg>`;
const ICONS = {
  home: svg('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>'),
  history: svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
  exercises: svg('<path d="M6.5 6.5v11M17.5 6.5v11M3.5 9.5v5M20.5 9.5v5M6.5 12h11"/>'),
  settings: svg('<path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1"/><circle cx="15" cy="6" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="18" r="2"/>'),
  check: svg('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor"/>'),
  close: svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  back: svg('<path d="M15 5l-7 7 7 7"/>'),
  chevron: svg('<path d="M6 9l6 6 6-6"/>'),
  info: svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  warn: svg('<path d="M12 3 2 20h20z"/><path d="M12 10v4M12 17v.5"/>'),
};

// ---------- Ansichten ----------

function viewHome() {
  const a = state.active;
  const np = nextPlan();
  const week = weekOf(new Date());
  const phase = phaseOf(week);
  const P = PHASES[phase];
  const h = sessions();
  let html = `
    <header class="page-head">
      <p class="eyebrow">${fmtDayLong(new Date())}</p>
      <h1>Handball Athletik</h1>
    </header>
    ${installHint()}
    ${backupDue() ? `<p class="note">${ICONS.info}<span>Zeit für ein Backup: <a href="#/settings">Einstellungen → Backup exportieren</a></span></p>` : ''}`;

  if (a) {
    const { done, total } = progressOf(a.log);
    html += `
      <section class="card hero">
        <p class="eyebrow accent">Einheit läuft · <span data-elapsed>${fmtClock(elapsedSec())}</span></p>
        <h2>${PLAN[a.type].title}: ${PLAN[a.type].subtitle}</h2>
        <div class="progress"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
        <p class="muted">${done} von ${total} Sätzen erledigt</p>
        <a class="btn primary big" href="#/session">Einheit fortsetzen</a>
      </section>`;
  } else {
    const unit = PLAN[np.type];
    const other = np.type === 'A' ? 'B' : 'A';
    const rel = relDay(np.date);
    html += `
      <section class="card hero">
        <p class="eyebrow accent">Nächste Einheit · ${rel}${rel.startsWith('in') || rel === 'Übermorgen' ? ` (${fmtDay(np.date)})` : ''}</p>
        <h2>${unit.title}: ${unit.subtitle}</h2>
        <p class="muted">Warm-up · ${unit.items.length} Übungen · Cool-down · ca. 30–45 Min.</p>
        ${np.warnings.map(w => `<p class="note warn">${ICONS.warn}<span>${esc(w)}</span></p>`).join('')}
        <button class="btn primary big" data-action="start" data-type="${np.type}">${unit.title} starten</button>
        <button class="btn link" data-action="start" data-type="${other}">Stattdessen Einheit ${other} starten</button>
      </section>`;
  }

  const thisWeek = h.filter(s => weekOf(s.start) === week).length;
  const avg = h.length ? h.reduce((n, s) => n + (s.durationSec || 0), 0) / h.length : 0;
  html += `
    <section class="card">
      <div class="row between"><h3>Woche ${week}${week <= 6 ? ' von 6' : ''}</h3><span class="pill">${thisWeek}/2 Einheiten</span></div>
      <div class="weeks" aria-hidden="true">${[1, 2, 3, 4, 5, 6].map(w => `<span class="${w < week ? 'past' : w === week ? 'now' : ''}"></span>`).join('')}</div>
      <p class="phase-title">${P.title}</p>
      <ul class="ticks">${P.points.map(p => `<li>${p}</li>`).join('')}</ul>
      ${week > 6 ? `<p class="note">Die 6 Wochen sind geschafft. Halte das Niveau von Woche 5–6 oder starte einen neuen Zyklus mit gesteigerten Bändern.</p>
        <button class="btn ghost" data-action="new-cycle">Neuen 6-Wochen-Zyklus starten</button>` : ''}
    </section>

    <section class="stats">
      <div><b>${h.length}</b><span>Einheiten gesamt</span></div>
      <div><b>${h.length ? fmtDur(avg) : '–'}</b><span>Ø Dauer</span></div>
      <div><b>${np.last ? relDay(np.last.start) : '–'}</b><span>Letzte Einheit</span></div>
    </section>

    <section class="card subtle">
      <h3>Wichtig</h3>
      <ul class="ticks warn-ticks">${SAFETY.map(s => `<li>${s}</li>`).join('')}</ul>
    </section>`;
  return html;
}

function viewSession() {
  const a = state.active;
  if (!a) return `<section class="card"><h2>Keine aktive Einheit</h2><a class="btn primary" href="#/">Zur Übersicht</a></section>`;
  const phase = phaseOf(a.week), P = PHASES[phase];
  const { done, total } = progressOf(a.log);
  const allDone = done === total;
  return `
    <header class="session-head">
      <div class="row">
        <a class="icon-btn" href="#/" aria-label="Zur Übersicht">${ICONS.back}</a>
        <div class="grow">
          <strong>${PLAN[a.type].title}</strong>
          <small>Woche ${a.week} · ${done}/${total} Sätze</small>
        </div>
        <span class="clock" data-elapsed>${fmtClock(elapsedSec())}</span>
        <button class="btn primary sm" data-action="session-finish">Beenden</button>
      </div>
      <div class="progress thin"><i style="width:${total ? (done / total) * 100 : 0}%"></i></div>
    </header>

    <details class="card tip">
      <summary>${P.title}</summary>
      <ul class="ticks">${P.points.map(p => `<li>${p}</li>`).join('')}</ul>
      <ul class="ticks warn-ticks">${SAFETY.slice(0, 3).map(s => `<li>${s}</li>`).join('')}</ul>
    </details>

    ${sessionSections(a.type).map(sec => `
      <section class="section">
        <h2 class="section-title">${sec.key === a.type ? `${sec.title}: ${sec.subtitle}` : sec.title}${sec.duration ? ` <span>${sec.duration}</span>` : ''}</h2>
        ${sec.intro ? `<p class="muted section-intro">${sec.intro}</p>` : ''}
        ${sec.items.map(e => exCard(EX[e.id], a, phase)).join('')}
      </section>`).join('')}

    <section class="finish-box ${allDone ? 'ready' : ''}">
      <p>${allDone ? 'Alles erledigt – stark! 💪' : 'Fertig für heute?'}</p>
      <button class="btn primary big" data-action="session-finish">Einheit beenden & speichern</button>
    </section>`;
}

function exCard(ex, a, phase) {
  const log = a.log[ex.id];
  const doneN = log.filter(s => s.done).length;
  const complete = doneN === log.length;
  const open = ui.open === ex.id;
  const rest = restFor(ex, phase);
  const notes = phaseNotes(ex, phase);
  return `
    <article class="ex ${complete ? 'complete' : ''} ${open ? 'open' : ''}" id="ex-${ex.id}">
      <button class="ex-head" data-action="ex-open" data-ex="${ex.id}" aria-expanded="${open}">
        <span class="ring">${complete ? ICONS.check : `${doneN}/${log.length}`}</span>
        <span class="ex-title"><strong>${ex.name}</strong><small>${rxText(ex, phase)}${rest ? ` · Pause ${rest} s` : ''}</small></span>
        <span class="chev">${ICONS.chevron}</span>
      </button>
      ${open ? `
        <div class="ex-body">
          <p class="why">${ex.why}</p>
          ${notes.map(n => `<p class="note">${ICONS.info}<span><b>Progression:</b> ${n}</span></p>`).join('')}
          <div class="sets">${log.map((s, i) => setRow(ex, s, i, log.length)).join('')}</div>
          <div class="ex-foot">
            <button class="btn ghost sm" data-action="ex-info" data-ex="${ex.id}">${ICONS.info} Anleitung & Video</button>
            <button class="btn ghost sm" data-action="set-add" data-ex="${ex.id}">${ICONS.plus} Satz</button>
          </div>
        </div>` : ''}
    </article>`;
}

function setRow(ex, s, i, n) {
  const time = ex.target.kind === 'time';
  const label = ex.setLabels?.[i] || (n > 1 ? `Satz ${i + 1}` : time ? 'Dauer' : 'Wdh.');
  const unit = time ? ' s' : '';
  const d = `data-ex="${ex.id}" data-i="${i}"`;
  return `
    <div class="set ${s.done ? 'done' : ''}">
      <span class="set-label">${label}${ex.perSide ? '<small>pro Seite</small>' : ''}</span>
      <div class="stepper">
        <button data-action="set-dec" ${d} aria-label="weniger">−</button>
        <output>${s.val}${unit}</output>
        <button data-action="set-inc" ${d} aria-label="mehr">+</button>
      </div>
      ${time ? `<button class="round play" data-action="set-timer" ${d} aria-label="Timer starten">${ICONS.play}</button>` : ''}
      <button class="round check" data-action="set-toggle" ${d} aria-pressed="${s.done}" aria-label="Satz abhaken">${ICONS.check}</button>
    </div>`;
}

function viewHistory() {
  const h = sessions();
  const week = weekOf(new Date());
  const start = programStart();
  const maxW = Math.max(6, week, ...h.map(s => weekOf(s.start)));
  const rows = [];
  for (let w = 1; w <= maxW; w++) {
    const from = addDays(start, (w - 1) * 7), to = addDays(from, 6);
    const ss = h.filter(s => weekOf(s.start) === w);
    const slots = ss.map(s => `<span class="chip type-${s.type}" title="${fmtDay(s.start)}">${s.type}<small>${WEEKDAYS[new Date(s.start).getDay()]}</small></span>`);
    for (let k = ss.length; k < 2; k++) slots.push('<span class="chip empty"></span>');
    rows.push(`
      <div class="wk ${w === week ? 'now' : w > week ? 'future' : ''}">
        <span class="wk-n">W${w}</span>
        <span class="wk-d">${fmtShort(from)}–${fmtShort(to)}</span>
        <span class="wk-slots">${slots.join('')}</span>
      </div>`);
  }
  const np = nextPlan();
  return `
    <header class="page-head"><h1>Verlauf</h1></header>
    <section class="card">
      <div class="row between"><h3>Programm</h3><span class="pill">Start ${fmtShort(start)}</span></div>
      <div class="wk-grid">${rows.join('')}</div>
      ${state.active ? '' : `<p class="muted small">Als Nächstes: <b>Einheit ${np.type}</b> · ${relDay(np.date)} (${fmtDay(np.date)})</p>`}
    </section>

    <div class="row between list-head">
      <h2>Alle Einheiten</h2>
      <button class="btn ghost sm" data-action="hist-add">${ICONS.plus} Nachtragen</button>
    </div>
    ${h.length ? [...h].reverse().map(histCard).join('') : '<p class="muted empty-state">Noch keine Einheit gespeichert.</p>'}`;
}

function histCard(s) {
  const pct = s.totalSets ? Math.round((s.doneSets / s.totalSets) * 100) : null;
  const lines = s.log ? Object.entries(s.log).filter(([id]) => EX[id]).map(([id, sets]) => {
    const ex = EX[id], unit = ex.target.kind === 'time' ? ' s' : '';
    const vals = sets.map(x => (x.done ? `${x.val}${unit}` : '–')).join(' · ');
    return `<li class="${sets.every(x => x.done) ? '' : 'partial'}"><span>${ex.name}</span><span>${vals}</span></li>`;
  }).join('') : '';
  return `
    <details class="card hist">
      <summary>
        <span class="badge type-${s.type}">${s.type}</span>
        <span class="grow"><strong>${fmtDay(s.start)}</strong><small>${s.manual ? 'nachgetragen' : fmtTime(s.start)} · ${fmtDur(s.durationSec || 0)} · Woche ${s.week}</small></span>
        <span class="hist-meta">${pct != null ? `${pct}%` : ''}${s.rpe ? `<small>RPE ${s.rpe}</small>` : ''}</span>
      </summary>
      ${s.notes ? `<p class="hist-notes">${esc(s.notes)}</p>` : ''}
      ${lines ? `<ul class="log">${lines}</ul>` : ''}
      <button class="btn link danger" data-action="hist-delete" data-id="${s.id}">Eintrag löschen</button>
    </details>`;
}

function viewLibrary() {
  const phase = phaseOf(state.active ? state.active.week : weekOf(new Date()));
  return `
    <header class="page-head"><h1>Übungen</h1><p class="muted">Vorgaben für Woche ${state.active ? state.active.week : weekOf(new Date())}. Tippe für Anleitung & Video.</p></header>
    ${SECTION_KEYS.map(key => {
      const sec = PLAN[key];
      return `
        <section class="section">
          <h2 class="section-title">${sec.subtitle ? `${sec.title}: ${sec.subtitle}` : sec.title}</h2>
          <div class="card list">
            ${sec.items.map(e => `
              <button class="list-item" data-action="ex-info" data-ex="${e.id}">
                <span class="grow"><strong>${e.name}</strong><small>${rxText(EX[e.id], phase)}</small></span>
                ${state.videos[e.id] ? '<span class="pill sm">Video</span>' : ''}
                <span class="chev">${ICONS.chevron}</span>
              </button>`).join('')}
          </div>
        </section>`;
    }).join('')}`;
}

function viewSettings() {
  const st = state.settings;
  const order = [1, 2, 3, 4, 5, 6, 0];
  const days = [...st.days].sort((x, y) => order.indexOf(x) - order.indexOf(y));
  const adjacent = days.some(d => days.includes((d + 1) % 7));
  return `
    <header class="page-head"><h1>Einstellungen</h1></header>

    <section class="card">
      <h3>Trainingstage</h3>
      <p class="muted small">Einheit A und B wechseln sich ab, mit mindestens 48 Std. Pause (z. B. Mo/Do oder Di/Fr).</p>
      <div class="days">${order.map(d => `<button class="day ${st.days.includes(d) ? 'on' : ''}" data-action="day-toggle" data-d="${d}" aria-pressed="${st.days.includes(d)}">${WEEKDAYS[d]}</button>`).join('')}</div>
      ${adjacent ? `<p class="note warn">${ICONS.warn}<span>Zwei aufeinanderfolgende Tage gewählt – die App plant trotzdem mindestens 48 Std. Pause ein.</span></p>` : ''}
    </section>

    <section class="card form">
      <label><span>Programmstart (Woche 1)</span>
        <input type="date" data-setting="startDate" value="${st.startDate || ''}"></label>
      <p class="muted small">Aktuell: Woche ${weekOf(new Date())}. Wird beim ersten Training automatisch gesetzt.</p>
      <label><span>Nächstes Spiel (optional)</span>
        <input type="date" data-setting="gameDate" value="${st.gameDate || ''}"></label>
      <p class="muted small">Die App warnt, wenn eine Einheit weniger als 2 Tage vor dem Spiel liegt.</p>
    </section>

    <section class="card form">
      <label class="toggle"><span>Signaltöne im Timer</span><input type="checkbox" data-setting="sound" ${st.sound ? 'checked' : ''}></label>
      <label class="toggle"><span>Sprachansagen (z. B. „Seite wechseln“, Reaktionskommandos)</span><input type="checkbox" data-setting="voice" ${st.voice ? 'checked' : ''}></label>
      <button class="btn ghost sm" data-action="test-sound">Ton & Sprache testen</button>
    </section>

    <section class="card">
      <h3>Daten auf diesem Gerät</h3>
      <p class="muted small">Alle Daten liegen nur auf diesem Gerät im Browser. Exportiere ab und zu ein Backup – damit kannst du auch auf ein anderes Gerät umziehen.</p>
      <ul class="status">
        <li class="${isStandalone() ? 'ok' : 'bad'}">${isStandalone() ? 'Läuft als installierte App' : 'Läuft im Browser, nicht als installierte App'}</li>
        ${storageInfo.persisted == null ? '' : `<li class="${storageInfo.persisted ? 'ok' : 'bad'}">${storageInfo.persisted ? 'Dauerhafter Speicher aktiv' : 'Speicher nicht als dauerhaft markiert'}</li>`}
        <li class="${backupDue() ? 'bad' : 'ok'}">${state.settings.lastBackup ? `Letztes Backup: ${fmtDay(state.settings.lastBackup)}` : 'Noch kein Backup exportiert'}</li>
        <li class="ok">${state.history.length} Einheiten gespeichert</li>
      </ul>
      ${installHint()}
      <div class="btn-row">
        <button class="btn ghost" data-action="export">Backup exportieren</button>
        <label class="btn ghost">Backup importieren<input type="file" accept="application/json,.json" data-import hidden></label>
      </div>
      <button class="btn link danger" data-action="reset">Alle Daten löschen</button>
    </section>
    <p class="muted small center">Handball Athletik · Offline-fähig · v3</p>`;
}

// ---------- Modals ----------

function openModal(html) {
  modalEl.innerHTML = `<div class="sheet" role="dialog" aria-modal="true"><button class="icon-btn sheet-close" data-action="modal-close" aria-label="Schließen">${ICONS.close}</button>${html}</div>`;
  modalEl.hidden = false;
  document.body.classList.add('no-scroll');
  modalEl.querySelector('.sheet').scrollTop = 0;
}
function closeModal() {
  modalEl.hidden = true;
  modalEl.innerHTML = '';
  document.body.classList.remove('no-scroll');
}

function ytId(url) {
  if (!url) return null;
  const m = String(url).match(/(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

function openInfo(id) {
  const ex = EX[id];
  const week = state.active ? state.active.week : weekOf(new Date());
  const phase = phaseOf(week);
  const vid = ytId(state.videos[id]);
  const sec = PLAN[ex.section];
  const notes = phaseNotes(ex, phase);
  openModal(`
    <p class="eyebrow">${sec.subtitle ? `${sec.title} · ${sec.subtitle}` : sec.title}</p>
    <h2>${ex.name}</h2>
    <p class="rx">${rxText(ex, phase)}</p>
    ${vid ? videoEmbed(id, vid, ex.name) : ''}
    <p>${ex.why}</p>
    <h3>So geht’s</h3>
    <ol class="steps">${ex.steps.map(s => `<li>${s}</li>`).join('')}</ol>
    <h3>Darauf achten</h3>
    <ul class="ticks">${ex.cues.map(c => `<li>${c}</li>`).join('')}</ul>
    ${notes.map(n => `<p class="note">${ICONS.info}<span><b>Woche ${week}:</b> ${n}</span></p>`).join('')}
    <h3>Video</h3>
    <a class="btn ghost" href="https://www.youtube.com/results?search_query=${encodeURIComponent(ex.yt)}" target="_blank" rel="noopener">Passende Videos auf YouTube suchen ↗</a>
    <div class="video-form">
      <input id="f-video" type="url" inputmode="url" autocomplete="off" placeholder="YouTube-Link einfügen" value="${esc(state.videos[id] || '')}">
      <button class="btn primary sm" data-action="video-save" data-ex="${id}">Speichern</button>
    </div>
    <p class="muted small">Hast du ein gutes Video gefunden? Link einfügen – es erscheint dann direkt hier in der Anleitung.</p>
    ${vid ? `<button class="btn link danger" data-action="video-remove" data-ex="${id}">Video entfernen</button>` : ''}`);
}

function videoEmbed(id, vid, name) {
  const landscape = !!state.videoLandscape[id];
  const opt = (val, label) => `<button data-action="video-orient" data-ex="${id}" data-o="${val}" aria-pressed="${(val === 'landscape') === landscape}">${label}</button>`;
  return `
    <div class="video ${landscape ? 'landscape' : 'portrait'}">
      <div class="video-ratio"><iframe src="https://www.youtube-nocookie.com/embed/${vid}?rel=0&playsinline=1" title="Video: ${esc(name)}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>
    </div>
    <div class="segmented" role="group" aria-label="Videoformat">${opt('portrait', '▯ Hochkant')}${opt('landscape', '▭ Quer')}</div>`;
}

function openFinish() {
  const a = state.active;
  if (!a) return;
  const { done, total } = progressOf(a.log);
  ui.rpe = null;
  openModal(`
    <h2>${PLAN[a.type].title} beenden</h2>
    <div class="stats in-sheet">
      <div><b>${fmtDur(elapsedSec())}</b><span>Dauer</span></div>
      <div><b>${done}/${total}</b><span>Sätze</span></div>
    </div>
    ${done < total ? '<p class="muted small">Nicht alle Sätze abgehakt – du kannst trotzdem speichern.</p>' : ''}
    <h3>Wie anstrengend war es?</h3>
    <div class="rpe">${Array.from({ length: 10 }, (_, k) => `<button data-action="rpe" data-v="${k + 1}">${k + 1}</button>`).join('')}</div>
    <p class="muted small rpe-legend"><span>1 = sehr leicht</span><span>10 = maximal</span></p>
    <div class="form">
      <label><span>Dauer (Minuten)</span><input id="f-dur" type="number" inputmode="numeric" min="1" max="300" value="${Math.max(1, Math.round(elapsedSec() / 60))}"></label>
      <label><span>Notizen</span><textarea id="f-notes" rows="3" placeholder="z. B. stärkeres Band genutzt, linkes Knie gezwickt …"></textarea></label>
    </div>
    <div class="btn-col">
      <button class="btn primary big" data-action="session-save">Speichern</button>
      <button class="btn ghost" data-action="modal-close">Weiter trainieren</button>
      <button class="btn link danger" data-action="session-discard">Einheit verwerfen</button>
    </div>`);
}

function openManualAdd() {
  const np = nextPlan();
  openModal(`
    <h2>Einheit nachtragen</h2>
    <p class="muted small">Für Einheiten, die du ohne App absolviert hast.</p>
    <div class="form">
      <label><span>Datum</span><input id="m-date" type="date" value="${toISO(new Date())}" max="${toISO(new Date())}"></label>
      <label><span>Einheit</span>
        <select id="m-type"><option value="A" ${np.type === 'A' ? 'selected' : ''}>A – Schnelligkeit, Sprung & Landung</option><option value="B" ${np.type === 'B' ? 'selected' : ''}>B – Kraft, Stabilität & Rotation</option></select></label>
      <label><span>Dauer (Minuten)</span><input id="m-dur" type="number" inputmode="numeric" min="1" max="300" value="40"></label>
      <label><span>Notizen</span><textarea id="m-notes" rows="2"></textarea></label>
    </div>
    <div class="btn-col"><button class="btn primary big" data-action="hist-add-save">Speichern</button></div>`);
}

// ---------- Aktionen ----------

const actions = {
  'start': d => startSession(d.type),
  'ex-open': d => { ui.open = ui.open === d.ex ? null : d.ex; render(); },
  'ex-info': d => openInfo(d.ex),
  'set-toggle': d => {
    const set = state.active.log[d.ex][+d.i];
    if (set.done) { set.done = false; save(); render(); }
    else completeSet(d.ex, +d.i);
  },
  'set-inc': d => stepVal(d, +1),
  'set-dec': d => stepVal(d, -1),
  'set-add': d => {
    const sets = state.active.log[d.ex];
    const last = sets[sets.length - 1];
    sets.push({ done: false, val: last ? last.val : EX[d.ex].target.min });
    save(); render();
  },
  'set-timer': d => {
    const ex = EX[d.ex], i = +d.i;
    keepAwake(true);
    runTimer(timedSteps(ex, i), () => completeSet(ex.id, i));
  },
  'timer-pause': (d, el) => {
    if (T.paused) { T.endsAt = Date.now() + T.left; T.paused = false; }
    else { T.left = T.endsAt - Date.now(); T.paused = true; }
    el.textContent = T.paused ? 'Fortsetzen' : 'Anhalten';
  },
  'timer-add': () => {
    const s = T.steps[T.i];
    s.sec += 15;
    if (T.paused) T.left += 15000; else T.endsAt += 15000;
    T.lastSec = null;
    tick();
  },
  'timer-skip': () => advance(),
  'timer-close': () => { stopTimer(); window.speechSynthesis?.cancel(); },
  'session-finish': () => openFinish(),
  'rpe': (d, el) => {
    ui.rpe = +d.v;
    el.parentElement.querySelectorAll('button').forEach(b => b.classList.toggle('sel', b === el));
  },
  'session-save': () => {
    const a = state.active;
    const { done, total } = progressOf(a.log);
    const mins = Math.max(1, Math.min(300, parseInt($('#f-dur').value, 10) || Math.round(elapsedSec() / 60)));
    state.history.push({
      id: `s${Date.now()}`, type: a.type, start: a.start, end: Date.now(), durationSec: mins * 60,
      week: a.week, doneSets: done, totalSets: total, rpe: ui.rpe, notes: $('#f-notes').value.trim(), log: a.log,
    });
    state.active = null;
    save();
    stopTimer();
    closeModal();
    keepAwake(false);
    const np = nextPlan();
    location.hash = '#/';
    render();
    toast(`Gespeichert! Nächste Einheit: ${np.type} · ${relDay(np.date)} (${fmtDay(np.date)})`);
  },
  'session-discard': () => {
    if (!confirm('Einheit wirklich verwerfen? Der Fortschritt dieser Einheit geht verloren.')) return;
    state.active = null;
    save(); stopTimer(); closeModal(); keepAwake(false);
    location.hash = '#/';
    render();
  },
  'modal-close': () => closeModal(),
  'video-save': d => {
    const url = $('#f-video').value.trim();
    if (url && !ytId(url)) { toast('Das sieht nicht nach einem YouTube-Link aus.'); return; }
    if (url) state.videos[d.ex] = url; else delete state.videos[d.ex];
    save(); openInfo(d.ex); render();
    toast(url ? 'Video gespeichert' : 'Video entfernt');
  },
  'video-remove': d => { delete state.videos[d.ex]; delete state.videoLandscape[d.ex]; save(); openInfo(d.ex); render(); },
  'video-orient': (d, el) => {
    const landscape = d.o === 'landscape';
    if (landscape) state.videoLandscape[d.ex] = true; else delete state.videoLandscape[d.ex];
    save();
    // Direkt im offenen Fenster umschalten, ohne dass das Video neu lädt oder die Ansicht nach oben springt
    const box = modalEl.querySelector('.video');
    box.classList.toggle('landscape', landscape);
    box.classList.toggle('portrait', !landscape);
    el.parentElement.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', b === el));
  },
  'hist-add': () => openManualAdd(),
  'hist-add-save': () => {
    const date = $('#m-date').value;
    if (!date) { toast('Bitte ein Datum wählen'); return; }
    const start = fromISO(date); start.setHours(18, 0, 0, 0);
    const mins = Math.max(1, parseInt($('#m-dur').value, 10) || 40);
    if (!state.settings.startDate || fromISO(state.settings.startDate) > start) state.settings.startDate = date;
    state.history.push({
      id: `s${Date.now()}`, type: $('#m-type').value, start: +start, end: +start + mins * 60000, durationSec: mins * 60,
      week: weekOf(start), doneSets: null, totalSets: null, rpe: null, notes: $('#m-notes').value.trim(), manual: true,
    });
    save(); closeModal(); render();
    toast('Einheit nachgetragen');
  },
  'hist-delete': d => {
    if (!confirm('Diesen Eintrag löschen?')) return;
    state.history = state.history.filter(s => s.id !== d.id);
    save(); render();
  },
  'day-toggle': d => {
    const n = +d.d, days = state.settings.days;
    state.settings.days = days.includes(n) ? days.filter(x => x !== n) : [...days, n];
    save(); render();
  },
  'new-cycle': () => {
    if (!confirm('Neuen Zyklus ab heute starten? Die Woche springt auf 1, der Verlauf bleibt erhalten.')) return;
    state.settings.startDate = toISO(new Date());
    save(); render();
  },
  'test-sound': () => { beep(880, 0.2); setTimeout(() => beep(1046, 0.3), 250); speak('Links. Rechts. Seite wechseln.'); },
  'export': async () => {
    const name = `athletik-backup-${toISO(new Date())}.json`;
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    try {
      const file = new File([blob], name, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Athletik-Backup' });
        markBackup();
        return;
      }
    } catch (e) { if (e.name === 'AbortError') return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    markBackup();
  },
  'reset': () => {
    if (!confirm('Wirklich ALLE Daten (Verlauf, Einstellungen, Videos) löschen?')) return;
    stopTimer();
    state = defaults();
    save(); render();
    toast('Alle Daten gelöscht');
  },
};

function stepVal(d, dir) {
  const ex = EX[d.ex], set = state.active.log[d.ex][+d.i];
  const time = ex.target.kind === 'time';
  set.val = Math.max(time ? 5 : 0, set.val + dir * (time ? 5 : 1));
  save(); render();
}

document.addEventListener('click', e => {
  if (e.target === modalEl) { closeModal(); return; }
  const el = e.target.closest('[data-action]');
  if (!el) return;
  unlockAudio();
  const fn = actions[el.dataset.action];
  if (fn) { e.preventDefault(); fn(el.dataset, el, e); }
});

document.addEventListener('change', e => {
  const el = e.target;
  if (el.dataset.setting) {
    const key = el.dataset.setting;
    state.settings[key] = el.type === 'checkbox' ? el.checked : (el.value || null);
    save(); render();
  } else if (el.hasAttribute('data-import')) {
    const file = el.files[0];
    if (!file) return;
    file.text().then(txt => {
      const data = JSON.parse(txt);
      if (!Array.isArray(data.history)) throw new Error('format');
      if (!confirm(`Backup mit ${data.history.length} Einheiten importieren? Die aktuellen Daten werden ersetzt.`)) return;
      state = normalize(data);
      save(); render();
      toast('Backup importiert');
    }).catch(() => toast('Datei konnte nicht gelesen werden'));
    el.value = '';
  }
});

document.addEventListener('keydown', e => { if (e.key === 'Escape' && !modalEl.hidden) closeModal(); });

// ---------- Rendering & Routing ----------

function route() { return location.hash.replace(/^#\/?/, '').split('?')[0] || 'home'; }

const VIEWS = { home: viewHome, session: viewSession, history: viewHistory, exercises: viewLibrary, settings: viewSettings };
const TABS = [
  { r: 'home', href: '#/', label: 'Heute', icon: ICONS.home },
  { r: 'history', href: '#/history', label: 'Verlauf', icon: ICONS.history },
  { r: 'exercises', href: '#/exercises', label: 'Übungen', icon: ICONS.exercises },
  { r: 'settings', href: '#/settings', label: 'Einstellungen', icon: ICONS.settings },
];

function render() {
  const r = VIEWS[route()] ? route() : 'home';
  const y = window.scrollY;
  app.innerHTML = VIEWS[r]();
  document.body.dataset.route = r;
  tabbar.innerHTML = TABS.map(t => `<a href="${t.href}" class="${t.r === r ? 'on' : ''}" ${t.r === r ? 'aria-current="page"' : ''}>${t.icon}<span>${t.label}</span>${t.r === 'home' && state.active ? '<i class="dot"></i>' : ''}</a>`).join('');
  if (ui.scrollTo) {
    const el = document.getElementById(`ex-${ui.scrollTo}`);
    ui.scrollTo = null;
    window.scrollTo(0, y);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  } else {
    window.scrollTo(0, y);
  }
}

window.addEventListener('hashchange', () => {
  closeModal();
  if (route() === 'session' && state.active) { ui.open = ui.open || firstOpenExercise(); keepAwake(true); }
  render();
  window.scrollTo(0, 0);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    if (state.active && route() === 'session') keepAwake(true);
    render();
  }
});

setInterval(() => {
  if (!state.active) return;
  const t = fmtClock(elapsedSec());
  document.querySelectorAll('[data-elapsed]').forEach(el => { el.textContent = t; });
}, 1000);

function markBackup() {
  state.settings.lastBackup = Date.now();
  save(); render();
}

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}

// ---------- Start ----------

if (route() === 'session' && state.active) ui.open = firstOpenExercise();
if (route() === 'session' && !state.active) history.replaceState(null, '', '#/');
render();

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
navigator.storage?.persist?.()
  .then(granted => { storageInfo.persisted = granted; if (route() === 'settings') render(); })
  .catch(() => {});
