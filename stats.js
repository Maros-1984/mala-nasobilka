// Facts, adaptive picking, derived statistics and SVG charts.
// Pure functions except the render* helpers, which write into a given DOM node.

export const OPS = ['mul', 'div'];

export const FACTS = [];
for (const op of OPS) for (let a = 1; a <= 10; a++) for (let b = 1; b <= 10; b++) FACTS.push({ op, a, b });

export function factKey(op, a, b) {
  return `${op}:${a}x${b}`;
}

export function answerOf(op, a, b) {
  return op === 'mul' ? a * b : b;
}

export function questionText(op, a, b) {
  return op === 'mul' ? `${a} × ${b}` : `${a * b} : ${a}`;
}

export function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((x, y) => x - y);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/** All answers of a profile in chronological order, each tagged with its round. */
export function allAnswers(profile) {
  const out = [];
  for (const r of profile.rounds) for (const ans of r.answers) out.push({ ...ans, roundId: r.id, roundAt: r.startedAt });
  return out;
}

export function recentAttempts(profile, op, a, b, n = 5) {
  const all = allAnswers(profile).filter((x) => x.op === op && x.a === a && x.b === b);
  return all.slice(-n);
}

export function levelOf(medianMs, settings) {
  if (medianMs == null) return null;
  if (medianMs < settings.greenMs) return 'green';
  if (medianMs < settings.orangeMs) return 'orange';
  return 'red';
}

export function factStats(profile, op, a, b, settings) {
  const attempts = allAnswers(profile).filter((x) => x.op === op && x.a === a && x.b === b);
  const recent = attempts.slice(-5);
  const med = median(recent.map((x) => x.ms));
  const errors = recent.filter((x) => !x.correct).length;
  return { seen: recent.length > 0, median: med, errors, attempts, level: levelOf(med, settings) };
}

export function weightOf(stats, settings) {
  if (!stats.seen) return 8;
  const over = Math.max(0, Math.min(3, (stats.median - settings.greenMs) / settings.greenMs));
  return 1 + over + 2 * stats.errors;
}

function opsFor(settings) {
  return settings.ops === 'both' ? OPS : [settings.ops];
}

/** Weighted sampling without replacement; refills the pool when exhausted. */
export function pickRound(profile, settings, rng = Math.random) {
  const ops = opsFor(settings);
  const pool = FACTS.filter((f) => ops.includes(f.op)).map((f) => ({
    ...f,
    w: weightOf(factStats(profile, f.op, f.a, f.b, settings), settings),
  }));
  const picked = [];
  let remaining = [...pool];
  while (picked.length < settings.questionsPerRound) {
    if (!remaining.length) remaining = [...pool];
    const total = remaining.reduce((s, f) => s + f.w, 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < remaining.length - 1; idx++) {
      r -= remaining[idx].w;
      if (r <= 0) break;
    }
    const [f] = remaining.splice(idx, 1);
    picked.push({ op: f.op, a: f.a, b: f.b });
  }
  return separateNeighbours(picked);
}

function sameFact(x, y) {
  return x.op === y.op && x.a === y.a && x.b === y.b;
}

function separateNeighbours(list) {
  for (let i = 1; i < list.length; i++) {
    if (!sameFact(list[i], list[i - 1])) continue;
    const j = list.findIndex((f, k) => k > i && !sameFact(f, list[i - 1]) && (k + 1 >= list.length || !sameFact(f, list[k + 1])));
    if (j > 0) [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}

// ---------- Derived data for charts ----------

export const HIST_BIN_MS = 500;
export const HIST_MAX_MS = 10000;

/** 21 bins: [0,0.5), [0.5,1) ... [9.5,10), [10,∞). */
export function histogramBins(answers) {
  const n = HIST_MAX_MS / HIST_BIN_MS + 1;
  const bins = Array.from({ length: n }, (_, i) => ({ from: i * HIST_BIN_MS, to: i < n - 1 ? (i + 1) * HIST_BIN_MS : Infinity, correct: 0, wrong: 0 }));
  for (const ans of answers) {
    const i = Math.min(n - 1, Math.floor(ans.ms / HIST_BIN_MS));
    if (ans.correct) bins[i].correct++;
    else bins[i].wrong++;
  }
  return bins;
}

export function roundSeries(profile) {
  return profile.rounds
    .filter((r) => r.answers.length)
    .map((r) => ({
      id: r.id,
      date: r.startedAt,
      n: r.answers.length,
      medianMs: median(r.answers.map((x) => x.ms)),
      errorRate: r.answers.filter((x) => !x.correct).length / r.answers.length,
    }));
}

export function formatSeconds(ms, digits = 1) {
  return (ms / 1000).toFixed(digits).replace('.', ',') + ' s';
}

export function formatDate(ts) {
  const d = new Date(ts);
  return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ---------- Renderers ----------

export function renderHeatmap(container, profile, op, settings, onCell) {
  container.innerHTML = '';
  const frag = document.createDocumentFragment();
  const corner = el('div', 'hdr corner', op === 'mul' ? '×' : ':');
  frag.appendChild(corner);
  for (let b = 1; b <= 10; b++) frag.appendChild(el('div', 'hdr', String(b)));
  for (let a = 1; a <= 10; a++) {
    frag.appendChild(el('div', 'hdr', String(a)));
    for (let b = 1; b <= 10; b++) {
      const s = factStats(profile, op, a, b, settings);
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell' + (s.seen ? ` seen ${s.level}` : '') + (s.errors ? ' err' : '');
      cell.dataset.a = String(a);
      cell.dataset.b = String(b);
      cell.title = `${questionText(op, a, b)} = ${answerOf(op, a, b)}`;
      cell.textContent = s.seen ? (s.median / 1000).toFixed(1).replace('.', ',') : '';
      cell.addEventListener('click', () => onCell(a, b, s, cell));
      frag.appendChild(cell);
    }
  }
  container.appendChild(frag);
}

export function renderFactHistory(container, op, a, b, stats) {
  const rows = [...stats.attempts].reverse().map(
    (x) => `<tr><td>${formatDate(x.roundAt)}</td><td>${formatSeconds(x.ms)}</td><td class="${x.correct ? 'ok' : 'wrong'}">${x.correct ? '✓' : `✗ (${x.given})`}</td></tr>`,
  );
  container.hidden = false;
  container.innerHTML = `<h3>${questionText(op, a, b)} = ${answerOf(op, a, b)}</h3>` +
    (rows.length ? `<table><tbody>${rows.join('')}</tbody></table>` : '<p class="muted">Ešte nehrané.</p>');
}

function niceStep(raw) {
  const pow = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-9))));
  const f = raw / pow;
  const nice = f <= 1 ? 1 : f <= 2 ? 2 : f <= 5 ? 5 : 10;
  return Math.max(1, nice * pow);
}

const SVG_NS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs = {}, text) {
  const n = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  return n;
}
function el(tag, cls, text) {
  const n = document.createElement(tag);
  n.className = cls;
  if (text != null) n.textContent = text;
  return n;
}

export function renderHistogram(svg, answers) {
  svg.innerHTML = '';
  const W = 640, H = 320, L = 44, R = 16, T = 40, B = 44;
  const bins = histogramBins(answers);
  const rawMax = Math.max(1, ...bins.map((x) => x.correct + x.wrong));
  const step = niceStep(rawMax / 5);
  const maxCount = Math.ceil(rawMax / step) * step;
  const plotW = W - L - R, plotH = H - T - B;
  const bw = plotW / bins.length;
  const y = (v) => T + plotH - (v / maxCount) * plotH;

  // legend
  svg.appendChild(svgEl('rect', { x: L, y: 12, width: 12, height: 12, class: 'bar ok legend-sw' }));
  svg.appendChild(svgEl('text', { x: L + 18, y: 22 }, 'správne'));
  svg.appendChild(svgEl('rect', { x: L + 90, y: 12, width: 12, height: 12, class: 'bar wrong legend-sw' }));
  svg.appendChild(svgEl('text', { x: L + 108, y: 22 }, 'chyba'));

  // y grid + labels
  for (let v = 0; v <= maxCount; v += step) {
    svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'grid' }));
    svg.appendChild(svgEl('text', { x: L - 6, y: y(v) + 4, 'text-anchor': 'end' }, String(v)));
  }
  svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: T + plotH, y2: T + plotH, class: 'axis' }));

  bins.forEach((bin, i) => {
    const x = L + i * bw + 1;
    const w = Math.max(1, bw - 2);
    if (bin.correct) {
      svg.appendChild(svgEl('rect', { x, y: y(bin.correct), width: w, height: y(0) - y(bin.correct), class: 'bar ok', rx: 2 }))
        .appendChild(svgEl('title', {}, `${label(bin)}: ${bin.correct} správne`));
    }
    if (bin.wrong) {
      const top = y(bin.correct + bin.wrong);
      svg.appendChild(svgEl('rect', { x, y: top, width: w, height: y(bin.correct) - top - (bin.correct ? 1 : 0), class: 'bar wrong', rx: 2 }))
        .appendChild(svgEl('title', {}, `${label(bin)}: ${bin.wrong} chýb`));
    }
    if (i % 2 === 0) {
      svg.appendChild(svgEl('text', { x: L + i * bw, y: H - B + 16, 'text-anchor': 'middle' }, i === bins.length - 1 ? '10+' : String(bin.from / 1000)));
    }
  });
  svg.appendChild(svgEl('text', { x: L + plotW / 2, y: H - 8, 'text-anchor': 'middle' }, 'čas odpovede (s)'));
  if (!answers.length) svg.appendChild(svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'empty' }, 'Zatiaľ žiadne odpovede'));

  function label(bin) {
    return bin.to === Infinity ? `${bin.from / 1000} s a viac` : `${bin.from / 1000}–${bin.to / 1000} s`;
  }
}

/** Two stacked panels sharing the x axis (round index): median time, then error rate. No dual axis. */
export function renderTrend(svg, series) {
  svg.innerHTML = '';
  const W = 640, H = 320, L = 44, R = 16;
  if (!series.length) {
    svg.appendChild(svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'empty' }, 'Zatiaľ žiadne kolá'));
    return;
  }
  const n = series.length;
  const pad = 24;
  const plotW = W - L - R - 2 * pad;
  const xOf = (i) => L + pad + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);

  // panel 1: median seconds
  const p1 = { top: 28, h: 130 };
  const maxSec = Math.max(1, Math.ceil(Math.max(...series.map((s) => s.medianMs)) / 1000));
  const y1 = (ms) => p1.top + p1.h - (ms / 1000 / maxSec) * p1.h;
  svg.appendChild(svgEl('text', { x: L, y: 18, class: 'title' }, 'Medián času (s)'));
  for (let i = 0; i <= 4; i++) {
    const v = (maxSec * i) / 4;
    svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y1(v * 1000), y2: y1(v * 1000), class: 'grid' }));
    svg.appendChild(svgEl('text', { x: L - 6, y: y1(v * 1000) + 4, 'text-anchor': 'end' }, v.toFixed(1).replace('.', ',')));
  }
  const d = series.map((s, i) => `${i ? 'L' : 'M'}${xOf(i).toFixed(1)},${y1(s.medianMs).toFixed(1)}`).join(' ');
  svg.appendChild(svgEl('path', { d, class: 'line' }));
  series.forEach((s, i) => {
    const c = svgEl('circle', { cx: xOf(i), cy: y1(s.medianMs), r: 5, class: 'point' });
    c.appendChild(svgEl('title', {}, `${formatDate(s.date)} · ${s.n} odpovedí · medián ${formatSeconds(s.medianMs)}`));
    svg.appendChild(c);
  });

  // panel 2: error rate %
  const p2 = { top: 196, h: 90 };
  const maxErr = Math.max(0.1, ...series.map((s) => s.errorRate));
  const y2 = (rate) => p2.top + p2.h - (rate / maxErr) * p2.h;
  svg.appendChild(svgEl('text', { x: L, y: p2.top - 10, class: 'title' }, 'Chybovosť (%)'));
  for (let i = 0; i <= 2; i++) {
    const v = (maxErr * i) / 2;
    svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y2(v), y2: y2(v), class: 'grid' }));
    svg.appendChild(svgEl('text', { x: L - 6, y: y2(v) + 4, 'text-anchor': 'end' }, Math.round(v * 100)));
  }
  const bw = Math.min(24, Math.max(6, plotW / n / 2));
  series.forEach((s, i) => {
    const h = y2(0) - y2(s.errorRate);
    const r = svgEl('rect', { x: xOf(i) - bw / 2, y: y2(s.errorRate), width: bw, height: Math.max(0, h), class: 'bar err', rx: 2 });
    r.appendChild(svgEl('title', {}, `${formatDate(s.date)} · ${Math.round(s.errorRate * 100)} % chýb`));
    svg.appendChild(r);
  });
  svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y2(0), y2: y2(0), class: 'axis' }));

  // x labels: round index, thinned
  const every = Math.ceil(n / 10);
  series.forEach((s, i) => {
    if (i % every === 0 || i === n - 1) svg.appendChild(svgEl('text', { x: xOf(i), y: H - 8, 'text-anchor': 'middle' }, String(i + 1)));
  });
}
