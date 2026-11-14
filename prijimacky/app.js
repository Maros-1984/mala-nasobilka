import { keyText, importKey, loadEncrypted, forgetKey } from './crypto.js';
import { gradeTask, expectedText } from './grade.js';
import { filterPool, createQueue, taskKey } from './queue.js';
import { renderMarkdown } from './markdown.js';

const SUBJECT_NAMES = { CJ: 'Čeština', MA: 'Matematika' };
const DEFAULT_YEAR_FROM = 2021;
const OLD_FORMAT_BEFORE = 2017;
const ZOOMS = [560, 720, 900, 1120, 1400, 1800];
const STORE = 'prijimacky.progress';
// ?data=<dir> lets the e2e tests point the app at a fixture folder.
const DATA_DIR = /^[\w-]+$/.test(new URLSearchParams(location.search).get('data') || '')
  ? new URLSearchParams(location.search).get('data')
  : 'data';

const $ = (id) => document.getElementById(id);
const el = (tag, attrs = {}, ...children) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') e.className = v;
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
    else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat()) if (c != null) e.append(c);
  return e;
};

let key;
let index;
let progress;
let queue;
let current; // {ref, task, answers, result, recorded}
const testCache = new Map();

// ---------- storage ----------

function loadProgress() {
  let p = {};
  try {
    p = JSON.parse(localStorage.getItem(STORE)) || {};
  } catch { /* blocked or corrupt storage → start fresh */ }
  return {
    solved: new Set(p.solved || []),
    stats: p.stats || {},
    settings: p.settings || null,
    zoom: Number.isInteger(p.zoom) ? p.zoom : 1,
  };
}

function saveProgress() {
  try {
    localStorage.setItem(STORE, JSON.stringify({ ...progress, solved: [...progress.solved] }));
  } catch { /* storage blocked: progress lives only for this visit */ }
}

// ---------- screens ----------

function show(id) {
  for (const s of document.querySelectorAll('.screen')) s.hidden = s.id !== id;
  window.scrollTo(0, 0);
}

async function boot() {
  progress = loadProgress();
  applyZoom();
  const text = keyText();
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  if (!text) return showLock();
  try {
    key = await importKey(text);
    index = await loadEncrypted(`${DATA_DIR}/index.bin`, key);
  } catch (e) {
    console.error(e);
    forgetKey();
    return showLock('Klíč nesedí nebo se data nepodařilo načíst. Zkus odkaz znovu.');
  }
  setupFilter();
  show('filter');
}

function showLock(msg) {
  if (msg) $('lockMsg').textContent = msg;
  show('lock');
}

$('lockForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('lockInput').value.trim();
  const hash = v.includes('#') ? v.slice(v.indexOf('#')) : `#k=${v}`;
  keyText(hash);
  boot();
});

// ---------- filter ----------

function years() {
  return [...new Set(index.tests.map((t) => t.year))].sort((a, b) => a - b);
}

function currentFilter() {
  const checked = (id) => [...$(id).querySelectorAll('input:checked')].map((i) => i.value);
  return {
    subjects: checked('subjects'),
    points: checked('points').map(Number),
    yearFrom: Number($('yearFrom').value),
    yearTo: Number($('yearTo').value),
  };
}

function setupFilter() {
  const ys = years();
  const pts = [...new Set(index.tasks.map((t) => t.points))].sort((a, b) => a - b);
  const s = progress.settings || {
    subjects: ['CJ', 'MA'],
    points: pts,
    yearFrom: ys.find((y) => y >= DEFAULT_YEAR_FROM) ?? ys[ys.length - 1],
    yearTo: ys[ys.length - 1],
  };
  $('points').replaceChildren(...pts.map((p) => el('label', { class: 'chip' },
    el('input', { type: 'checkbox', value: p }), el('span', {}, `${p} b.`))));
  for (const i of document.querySelectorAll('#subjects input, #points input')) {
    const list = i.closest('#subjects') ? s.subjects : s.points.map(String);
    i.checked = list.includes(i.value);
  }
  const yearOptions = (sel) => ys.map((y) => el('option', { value: y, selected: y === sel },
    y < OLD_FORMAT_BEFORE ? `${y} (starší formát)` : String(y)));
  $('yearFrom').replaceChildren(...yearOptions(s.yearFrom));
  $('yearTo').replaceChildren(...yearOptions(s.yearTo));
  updatePoolInfo();
  renderStats();
}

function updatePoolInfo() {
  const f = currentFilter();
  if (f.yearFrom > f.yearTo) $('yearTo').value = f.yearFrom;
  const pool = filterPool(index, currentFilter());
  const solved = pool.filter((t) => progress.solved.has(taskKey(t))).length;
  $('poolInfo').textContent = pool.length
    ? `Vybráno ${pool.length} úloh, z toho vyřešeno ${solved}.`
    : 'Žádná úloha neodpovídá výběru.';
  $('start').disabled = !pool.length;
}

function renderStats() {
  const rows = Object.entries(progress.stats).filter(([, s]) => s.tasks);
  if (!rows.length) {
    $('stats').replaceChildren();
    return;
  }
  $('stats').replaceChildren(el('h2', {}, 'Dosud'), ...rows.map(([subj, s]) => {
    const pct = s.max ? Math.round((100 * s.points) / s.max) : 0;
    return el('p', {}, el('strong', {}, SUBJECT_NAMES[subj] || subj), `: ${s.tasks} úloh, ${s.points} / ${s.max} b. (${pct} %)`);
  }));
}

$('filter').addEventListener('change', updatePoolInfo);

$('start').addEventListener('click', () => {
  const f = currentFilter();
  progress.settings = f;
  saveProgress();
  queue = createQueue(filterPool(index, f), { solved: progress.solved });
  nextTask();
});

$('resetProgress').addEventListener('click', () => {
  if (!confirm('Opravdu smazat pokrok a statistiky v tomto zařízení?')) return;
  progress.solved.clear();
  progress.stats = {};
  saveProgress();
  updatePoolInfo();
  renderStats();
});

// ---------- task ----------

function loadTest(id) {
  if (!testCache.has(id)) {
    const p = loadEncrypted(`${DATA_DIR}/${id}.bin`, key);
    p.catch(() => testCache.delete(id));
    testCache.set(id, p);
  }
  return testCache.get(id);
}

async function nextTask() {
  const ref = queue.next();
  if (!ref) return show('filter');
  show('task');
  $('crops').replaceChildren(el('p', { class: 'muted' }, 'Načítám úlohu…'));
  $('source').replaceChildren();
  $('answers').replaceChildren();
  $('result').hidden = true;
  let test;
  try {
    test = await loadTest(ref.t);
  } catch (e) {
    console.error(e);
    $('crops').replaceChildren(el('p', {}, 'Úlohu se nepodařilo načíst. Zkontroluj připojení a zkus to znovu.'),
      el('button', { type: 'button', onclick: nextTask }, 'Zkusit znovu'));
    return;
  }
  current = { ref, test, task: test.tasks[ref.n], answers: {}, result: null, recorded: false };
  renderTask();
  // warm up the next test file while the child is working
  const upcoming = queue.peekNext();
  if (upcoming) loadTest(upcoming.t).catch(() => {});
}

function testInfo(id) {
  return index.tests.find((t) => t.id === id);
}

function renderTask() {
  const { ref, test, task } = current;
  const info = testInfo(ref.t);
  $('meta').textContent = `${SUBJECT_NAMES[info.subject]} · ${info.year} · ${info.term} · úloha ${ref.n} · ${task.points} b.`;

  const group = task.group ? test.groups[task.group] : null;
  $('taskBody').classList.toggle('has-source', !!group);
  $('source').replaceChildren(...(group || []).map((src) => el('img', { src, alt: 'Výchozí text', class: 'crop' })));
  $('crops').replaceChildren(...task.crops.map((src) => el('img', { src, alt: `Úloha ${ref.n}`, class: 'crop' })));

  const form = $('answers');
  form.replaceChildren(...task.parts.map((p) => renderPart(p, task.parts.length === 1)));
  form.append(el('button', { type: 'submit', class: 'primary big', id: 'evaluate' }, 'Vyhodnotit'));
  $('result').hidden = true;
}

function partLabel(part, single) {
  if (single && !part.label) return null;
  return el('span', { class: 'part-id' }, single ? '' : part.id, part.label ? el('span', { class: 'part-label' }, part.label) : null);
}

function optionButtons(part, options, labels = options) {
  return el('div', { class: 'options' }, options.map((o, i) => el('button', {
    type: 'button', class: 'opt', 'data-part': part.id, 'data-value': o,
    onclick: (e) => choose(part.id, o, e.currentTarget),
  }, labels[i])));
}

function renderPart(part, single) {
  const row = el('div', { class: `part part-${part.type}`, 'data-part': part.id });
  const label = partLabel(part, single);
  if (label) row.append(label);
  switch (part.type) {
    case 'choice':
    case 'match':
      row.append(optionButtons(part, part.options));
      break;
    case 'yesno':
      row.append(optionButtons(part, ['A', 'N'], ['ANO', 'NE']));
      break;
    case 'number':
    case 'text':
    case 'set': {
      const input = el('input', {
        type: 'text', inputmode: part.type === 'number' ? 'decimal' : 'text',
        autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', 'aria-label': part.id,
        placeholder: part.type === 'set' ? 'odděl čárkou' : '',
        oninput: (e) => { current.answers[part.id] = e.target.value; },
      });
      row.append(el('span', { class: 'field' }, input, part.unit ? el('span', { class: 'unit' }, part.unit) : null));
      break;
    }
    case 'self':
      row.append(el('span', { class: 'muted' }, 'Vyřeš na papír, po vyhodnocení si podle řešení přiděl body.'));
      break;
  }
  row.append(el('span', { class: 'verdict' }));
  return row;
}

function choose(partId, value, button) {
  if (current.result) return;
  const same = current.answers[partId] === value;
  current.answers[partId] = same ? undefined : value;
  for (const b of $('answers').querySelectorAll(`.opt[data-part="${CSS.escape(partId)}"]`)) {
    b.classList.toggle('selected', !same && b === button);
  }
}

$('answers').addEventListener('submit', (e) => {
  e.preventDefault();
  if (current.result) return;
  for (const i of $('answers').querySelectorAll('input, button')) i.disabled = true;
  $('evaluate').remove();
  evaluate();
});

function evaluate() {
  const { task } = current;
  current.result = gradeTask(task, task.points, current.answers);
  task.parts.forEach((part, i) => markPart(part, current.result.parts[i]));
  renderResult();
}

function markPart(part, r) {
  const row = $('answers').querySelector(`.part[data-part="${CSS.escape(part.id)}"]`);
  const verdict = row.querySelector('.verdict');
  if (part.type === 'self') {
    const buttons = [];
    for (let p = 0; p <= part.points; p++) {
      buttons.push(el('button', {
        type: 'button', class: 'opt', disabled: false,
        onclick: (e) => rateSelf(part, p, e.currentTarget),
      }, `${p} b.`));
    }
    verdict.replaceChildren(
      el('span', { class: 'expected' }, 'Vzor: ', el('strong', {}, part.answer)),
      el('span', { class: 'rate' }, 'Kolik bodů sis dal(a)? ', ...buttons),
    );
    return;
  }
  row.classList.add(r.correct ? 'ok' : 'bad');
  for (const b of row.querySelectorAll('.opt')) {
    if (b.dataset.value === part.answer || part.accept?.includes(b.dataset.value)) b.classList.add('right');
  }
  const extra = part.type === 'set' && !r.correct ? ` (chyb: ${r.errors})` : '';
  verdict.replaceChildren(r.correct
    ? el('span', { class: 'tick' }, '✓')
    : el('span', { class: 'expected' }, '✗ správně: ', el('strong', {}, expectedText(part)), extra,
      r.points ? ` – částečně ${r.points} b.` : ''));
}

function rateSelf(part, points, button) {
  current.answers[part.id] = points;
  for (const b of button.parentElement.querySelectorAll('.opt')) b.classList.toggle('selected', b === button);
  current.result = gradeTask(current.task, current.task.points, current.answers);
  renderSummary();
}

function renderResult() {
  const { task, ref } = current;
  const info = testInfo(ref.t);
  const res = $('result');
  res.replaceChildren(el('div', { id: 'summary', class: 'summary' }));
  if (task.keyNote) res.append(el('div', { class: 'keynote' }, el('h3', {}, 'Poznámka z klíče'), el('p', {}, task.keyNote)));
  if (task.keyCrops?.length) {
    res.append(el('div', { class: 'keycrops' }, el('h3', {}, 'Řešení z klíče CERMAT'),
      ...task.keyCrops.map((src) => el('img', { src, alt: 'Řešení', class: 'crop' }))));
  }
  const ex = task.explanation;
  if (ex) {
    const ai = ex.source === 'ai';
    res.append(el('div', { class: `explanation ${ai ? 'ai' : 'cermat'}` },
      el('h3', {}, ai ? '🤖 Vysvětlení vygenerované AI – může obsahovat chybu' : 'Komentované řešení CERMAT'),
      el('div', { html: renderMarkdown(ex.md) })));
  }
  const links = Object.entries({ test: 'zadání', key: 'klíč', comment: 'komentář' })
    .filter(([k]) => info.source?.[k])
    .map(([k, label]) => el('a', { href: info.source[k], target: '_blank', rel: 'noopener noreferrer' }, label));
  if (links.length) res.append(el('p', { class: 'muted small' }, 'Originál (PDF): ', ...links.flatMap((a, i) => (i ? [', ', a] : [a]))));
  res.append(el('button', { type: 'button', class: 'primary big', id: 'next', onclick: goNext }, 'Další úloha →'));
  res.hidden = false;
  renderSummary();
  $('result').scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderSummary() {
  const r = current.result;
  const cls = r.points === r.max ? 'full' : r.points > 0 ? 'part' : 'zero';
  $('summary').className = `summary ${r.needsSelf ? 'pending' : cls}`;
  $('summary').replaceChildren(r.needsSelf
    ? el('span', {}, 'Ohodnoť své řešení podle vzoru.')
    : el('span', {}, el('strong', {}, `${r.points} / ${r.max} b.`), r.points === r.max ? ' Výborně!' : ''));
  $('next').disabled = r.needsSelf;
}

function goNext() {
  const { ref, result } = current;
  if (result.needsSelf) return;
  const subject = testInfo(ref.t).subject;
  const s = (progress.stats[subject] ||= { tasks: 0, points: 0, max: 0 });
  s.tasks += 1;
  s.points += result.points;
  s.max += result.max;
  queue.report(ref, result.points === result.max);
  saveProgress();
  nextTask();
}

$('back').addEventListener('click', () => {
  updatePoolInfo();
  renderStats();
  show('filter');
});

// ---------- zoom & fullscreen ----------

function applyZoom() {
  document.documentElement.style.setProperty('--content', `${ZOOMS[progress.zoom]}px`);
  document.documentElement.style.setProperty('--ui-scale', String(1 + 0.12 * Math.max(0, progress.zoom - 1)));
}

function changeZoom(d) {
  progress.zoom = Math.max(0, Math.min(ZOOMS.length - 1, progress.zoom + d));
  applyZoom();
  saveProgress();
}

$('zoomIn').addEventListener('click', () => changeZoom(1));
$('zoomOut').addEventListener('click', () => changeZoom(-1));

const root = document.documentElement;
const canFullscreen = root.requestFullscreen || root.webkitRequestFullscreen;
if (canFullscreen && (document.fullscreenEnabled || document.webkitFullscreenEnabled)) {
  $('fullscreen').hidden = false;
  $('fullscreen').addEventListener('click', () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) {
      (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    } else {
      canFullscreen.call(root);
    }
  });
}

boot();
