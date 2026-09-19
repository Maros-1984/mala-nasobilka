import {
  answerOf, questionText, pickRound, median, allAnswers, factStats, roundSeries,
  renderHeatmap, renderFactHistory, renderHistogram, renderTrend, formatSeconds,
} from './stats.js';
import { unlockAudio, playCorrect, playWrong } from './sound.js';

const STORAGE_KEY = 'nasobilka.v1';
const VERSION = 1;
const WRONG_DELAY_MS = 1500;
const FLASH_MS = 250;

// ---------- storage ----------

export function defaultSettings() {
  return { questionsPerRound: 30, ops: 'both', greenMs: 3000, orangeMs: 5000 };
}

let storageBroken = false;

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: VERSION, activeProfileId: null, profiles: [] };
    const parsed = JSON.parse(raw);
    if (parsed.version > VERSION) {
      storageBroken = true;
      notice('Data jsou z novější verze hry. Nenačítám je, abych je nepřepsal.');
      return { version: VERSION, activeProfileId: null, profiles: [] };
    }
    return parsed;
  } catch {
    storageBroken = true;
    notice('Data nejde načíst ani uložit. Hra běží jen v paměti.');
    return { version: VERSION, activeProfileId: null, profiles: [] };
  }
}

function saveState() {
  if (storageBroken) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    storageBroken = true;
    notice('Data nejde uložit (úložiště je plné nebo blokované). Hra běží jen v paměti.');
  }
}

const state = loadState();

function activeProfile() {
  return state.profiles.find((p) => p.id === state.activeProfileId) || null;
}

function uid(prefix) {
  return `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

// ---------- ui helpers ----------

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

let noticeTimer = null;
function notice(text) {
  const n = $('#notice');
  n.textContent = text;
  n.hidden = false;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (n.hidden = true), 6000);
}

function showScreen(id) {
  $$('.screen').forEach((s) => (s.hidden = s.id !== id));
  window.scrollTo(0, 0);
}

// ---------- profiles ----------

function renderProfiles() {
  const list = $('#profile-list');
  list.innerHTML = '';
  for (const p of state.profiles) {
    const row = document.createElement('div');
    row.className = 'profile-row';
    const btn = document.createElement('button');
    btn.className = 'btn profile';
    btn.textContent = p.name;
    btn.addEventListener('click', () => selectProfile(p.id));
    const del = document.createElement('button');
    del.className = 'btn delete';
    del.title = 'Smazat profil';
    del.textContent = '✕';
    del.addEventListener('click', () => {
      const confirm = document.createElement('button');
      confirm.className = 'btn confirm-delete';
      confirm.textContent = 'Opravdu smazat?';
      confirm.addEventListener('click', () => {
        state.profiles = state.profiles.filter((x) => x.id !== p.id);
        if (state.activeProfileId === p.id) state.activeProfileId = null;
        saveState();
        renderProfiles();
      });
      del.replaceWith(confirm);
      setTimeout(() => confirm.isConnected && confirm.replaceWith(del), 3000);
    });
    row.append(btn, del);
    list.appendChild(row);
  }
}

function selectProfile(id) {
  state.activeProfileId = id;
  saveState();
  goHome();
}

$('#form-add-profile').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = $('#new-profile-name');
  const name = input.value.trim();
  if (!name) return;
  state.profiles.push({ id: uid('p'), name, createdAt: Date.now(), settings: defaultSettings(), rounds: [] });
  input.value = '';
  saveState();
  renderProfiles();
});

$('#btn-switch-profile').addEventListener('click', () => {
  renderProfiles();
  showScreen('screen-profiles');
});

// ---------- home ----------

function goHome() {
  const p = activeProfile();
  if (!p) {
    renderProfiles();
    showScreen('screen-profiles');
    return;
  }
  $('#home-name').textContent = p.name;
  const answers = allAnswers(p);
  const rounds = p.rounds.filter((r) => r.answers.length).length;
  $('#home-summary').textContent = rounds
    ? `${rounds} ${plural(rounds, 'kolo', 'kola', 'kol')}, ${answers.length} ${plural(answers.length, 'odpověď', 'odpovědi', 'odpovědí')}, medián ${formatSeconds(median(answers.map((x) => x.ms)))}`
    : 'Zatím žádné kolo.';
  showScreen('screen-home');
}

function plural(n, one, few, many) {
  if (n === 1) return one;
  if (n >= 2 && n <= 4) return few;
  return many;
}

$('#btn-start').addEventListener('click', startRound);
$('#btn-stats').addEventListener('click', openStats);
$('#btn-settings').addEventListener('click', openSettings);

// ---------- settings ----------

function openSettings() {
  const s = activeProfile().settings;
  $('#set-count').value = s.questionsPerRound;
  $('#set-ops').value = s.ops;
  $('#set-green').value = s.greenMs / 1000;
  $('#set-orange').value = s.orangeMs / 1000;
  $('#set-sound').checked = soundOn();
  $('#btn-wipe-confirm').hidden = true;
  $('#btn-wipe').hidden = false;
  showScreen('screen-settings');
}

$('#form-settings').addEventListener('submit', (e) => {
  e.preventDefault();
  const p = activeProfile();
  const count = Math.max(5, Math.min(200, Math.round(Number($('#set-count').value) || 30)));
  const green = Math.max(500, Math.round(Number($('#set-green').value) * 1000) || 3000);
  const orange = Math.max(green + 500, Math.round(Number($('#set-orange').value) * 1000) || 5000);
  p.settings = { questionsPerRound: count, ops: $('#set-ops').value, greenMs: green, orangeMs: orange };
  state.sound = $('#set-sound').checked;
  saveState();
  goHome();
});
$('#btn-cancel-settings').addEventListener('click', goHome);

$('#btn-wipe').addEventListener('click', () => {
  $('#btn-wipe').hidden = true;
  $('#btn-wipe-confirm').hidden = false;
  setTimeout(() => {
    $('#btn-wipe-confirm').hidden = true;
    $('#btn-wipe').hidden = false;
  }, 3000);
});
$('#btn-wipe-confirm').addEventListener('click', () => {
  activeProfile().rounds = [];
  saveState();
  goHome();
});

$('#btn-export').addEventListener('click', () => {
  const p = activeProfile();
  const payload = { version: VERSION, exportedAt: Date.now(), profiles: [p] };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  a.download = `nasobilka-${p.name.replace(/[^\w\-]+/g, '_')}-${date}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

$('#import-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    notice('Soubor není platný JSON.');
    return;
  }
  if (!data || data.version !== VERSION || !Array.isArray(data.profiles)) {
    notice('Soubor nemá očekávaný formát (verze 1).');
    return;
  }
  let imported = 0;
  for (const prof of data.profiles) {
    if (!prof || typeof prof.id !== 'string' || typeof prof.name !== 'string' || !Array.isArray(prof.rounds)) continue;
    prof.settings = { ...defaultSettings(), ...(prof.settings || {}) };
    const idx = state.profiles.findIndex((x) => x.id === prof.id);
    if (idx >= 0) state.profiles[idx] = prof;
    else state.profiles.push(prof);
    imported++;
  }
  saveState();
  notice(imported ? `Import hotov: ${imported} ${plural(imported, 'profil', 'profily', 'profilů')}.` : 'V souboru nejsou žádné profily.');
  goHome();
});

// ---------- round ----------

let round = null; // { queue, index, answers, shownAt, typed, firstTry, locked, startedAt }

function startRound() {
  const p = activeProfile();
  round = {
    queue: pickRound(p, p.settings),
    index: 0,
    answers: [],
    shownAt: 0,
    typed: '',
    firstTry: null,
    locked: false,
    startedAt: Date.now(),
  };
  showScreen('screen-round');
  showQuestion();
}

function showQuestion() {
  const q = round.queue[round.index];
  const qEl = $('#question');
  qEl.textContent = `${questionText(q.op, q.a, q.b)} = ?`;
  qEl.dataset.op = q.op;
  qEl.dataset.a = String(q.a);
  qEl.dataset.b = String(q.b);
  round.typed = '';
  round.firstTry = null;
  renderTyped();
  $('.numpad .ok').classList.remove('hint');
  $('#feedback').textContent = '';
  $('#progress').textContent = `${round.index + 1} / ${round.queue.length}`;
  round.locked = false;
  requestAnimationFrame(() => {
    round.shownAt = performance.now();
  });
}

function renderTyped() {
  $('#answer-display').textContent = round.typed || ' ';
}

function pressKey(key) {
  if (!round || round.locked) return;
  if (soundOn()) unlockAudio();
  if (key === 'back') {
    round.typed = round.typed.slice(0, -1);
    renderTyped();
  } else if (key === 'ok') {
    submitAnswer();
  } else if (/^\d$/.test(key)) {
    if (round.typed.length >= 3) return;
    if (round.typed === '' && key === '0') return;
    round.typed += key;
    renderTyped();
    const q = round.queue[round.index];
    const answer = String(answerOf(q.op, q.a, q.b));
    if (round.typed === answer) {
      submitAnswer();
    } else if (round.typed.length >= answer.length) {
      if (round.firstTry == null) round.firstTry = Number(round.typed);
      $('.numpad .ok').classList.add('hint');
    }
  }
}

/** Global (per device) sound switch; missing key means on. */
function soundOn() {
  return state.sound !== false;
}

function submitAnswer() {
  if (!round.typed) return;
  const ms = Math.round(performance.now() - round.shownAt);
  const q = round.queue[round.index];
  const given = Number(round.typed);
  const correct = given === answerOf(q.op, q.a, q.b);
  const rec = { op: q.op, a: q.a, b: q.b, given, correct, ms };
  if (round.firstTry != null && round.firstTry !== given) rec.firstTry = round.firstTry;
  round.answers.push(rec);
  round.locked = true;
  const screen = $('#screen-round');
  if (correct) {
    if (soundOn()) playCorrect();
    screen.classList.add('flash-ok');
    setTimeout(() => screen.classList.remove('flash-ok'), FLASH_MS);
    advance();
  } else {
    if (soundOn()) playWrong();
    screen.classList.add('flash-wrong');
    $('#feedback').textContent = `Správně: ${answerOf(q.op, q.a, q.b)}`;
    round.queue.push({ ...q });
    $('#progress').textContent = `${round.index + 1} / ${round.queue.length}`;
    setTimeout(() => {
      screen.classList.remove('flash-wrong');
      advance();
    }, WRONG_DELAY_MS);
  }
}

function advance() {
  round.index++;
  if (round.index >= round.queue.length) finishRound();
  else showQuestion();
}

function persistRound() {
  if (!round || !round.answers.length) return;
  activeProfile().rounds.push({ id: uid('r'), startedAt: round.startedAt, finishedAt: Date.now(), answers: round.answers });
  saveState();
}

function finishRound() {
  persistRound();
  const answers = round.answers;
  const errors = answers.filter((x) => !x.correct).length;
  $('#summary-text').textContent =
    `${answers.length} ${plural(answers.length, 'odpověď', 'odpovědi', 'odpovědí')}, ` +
    `${errors} ${plural(errors, 'chyba', 'chyby', 'chyb')}, medián ${formatSeconds(median(answers.map((x) => x.ms)))}.`;
  const slowest = [...answers].sort((x, y) => y.ms - x.ms).slice(0, 3);
  $('#summary-slowest').innerHTML = slowest
    .map((x) => `<li>${questionText(x.op, x.a, x.b)} = ${answerOf(x.op, x.a, x.b)} — ${formatSeconds(x.ms)}${x.correct ? '' : ' (chyba)'}${x.correct && x.firstTry != null ? ` (nejdřív ${x.firstTry})` : ''}</li>`)
    .join('');
  round = null;
  showScreen('screen-summary');
}

$('#btn-abort').addEventListener('click', () => {
  persistRound();
  round = null;
  goHome();
});

$('.numpad').addEventListener('click', (e) => {
  const btn = e.target.closest('button[data-key]');
  if (btn) pressKey(btn.dataset.key);
});

document.addEventListener('keydown', (e) => {
  if (!round || $('#screen-round').hidden) return;
  if (/^\d$/.test(e.key)) pressKey(e.key);
  else if (e.key === 'Backspace') pressKey('back');
  else if (e.key === 'Enter') pressKey('ok');
  else return;
  e.preventDefault();
});

$('#btn-again').addEventListener('click', startRound);
$('#btn-summary-stats').addEventListener('click', openStats);
$('#btn-summary-home').addEventListener('click', goHome);

// ---------- stats ----------

const stats = { tab: 'heatmap', op: 'mul', filter: 'last' };

function openStats() {
  showScreen('screen-stats');
  $('#fact-history').hidden = true;
  renderStats();
}

function renderStats() {
  const p = activeProfile();
  $$('#stats-tabs .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === stats.tab));
  $$('.tab-panel').forEach((panel) => (panel.hidden = panel.id !== `tab-${stats.tab}`));
  $$('#heatmap-op button').forEach((b) => b.classList.toggle('active', b.dataset.op === stats.op));
  $$('#hist-filter button').forEach((b) => b.classList.toggle('active', b.dataset.filter === stats.filter));

  if (stats.tab === 'heatmap') {
    renderHeatmap($('#heatmap'), p, stats.op, p.settings, (a, b, s, cell) => {
      $$('#heatmap .cell.selected').forEach((c) => c.classList.remove('selected'));
      cell.classList.add('selected');
      renderFactHistory($('#fact-history'), stats.op, a, b, s);
    });
  } else if (stats.tab === 'histogram') {
    const lastRound = [...p.rounds].reverse().find((r) => r.answers.length);
    const answers = stats.filter === 'last' ? (lastRound ? lastRound.answers : []) : allAnswers(p);
    $('#hist-total').textContent = `${answers.length} ${plural(answers.length, 'odpověď', 'odpovědi', 'odpovědí')}`;
    renderHistogram($('#histogram'), answers);
  } else {
    renderTrend($('#trend'), roundSeries(p));
  }
}

$('#stats-tabs').addEventListener('click', (e) => {
  const t = e.target.closest('.tab');
  if (!t) return;
  stats.tab = t.dataset.tab;
  renderStats();
});
$('#heatmap-op').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-op]');
  if (!b) return;
  stats.op = b.dataset.op;
  $('#fact-history').hidden = true;
  renderStats();
});
$('#hist-filter').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-filter]');
  if (!b) return;
  stats.filter = b.dataset.filter;
  renderStats();
});
$('#btn-stats-home').addEventListener('click', goHome);

// ---------- boot ----------

goHome();
