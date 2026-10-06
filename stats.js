// Facts, adaptive picking, derived statistics and SVG charts.
// Pure functions except the render* helpers, which write into a given DOM node.

export function factKey(op, a, b) {
  return `${op}:${a}x${b}`;
}

// Ops: mul/div = small table (1..10), mul2/div2 = 2..9 × 11..99, half = a / 2 (b is always 2).
// For div and div2 the shown example is (a·b) : a and the answer is b.
export function answerOf(op, a, b) {
  if (op === 'mul' || op === 'mul2') return a * b;
  if (op === 'half') return a / 2;
  return b;
}

export function questionText(op, a, b) {
  if (op === 'mul' || op === 'mul2') return `${a} × ${b}`;
  if (op === 'half') return `Polovina z ${a}`;
  return `${a * b} : ${a}`;
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

/** Attempts per fact (chronological), keyed by factKey. Build once per render or round. */
export function attemptsByFact(profile) {
  const index = new Map();
  allAnswers(profile).forEach((x, seq) => {
    const k = factKey(x.op, x.a, x.b);
    if (!index.has(k)) index.set(k, []);
    index.get(k).push({ ...x, seq });
  });
  return index;
}

/** Attempts of several facts merged in chronological order. */
export function groupAttempts(facts, index) {
  if (facts.length === 1) return index.get(factKey(facts[0].op, facts[0].a, facts[0].b)) || [];
  return facts.flatMap((f) => index.get(factKey(f.op, f.a, f.b)) || []).sort((x, y) => x.seq - y.seq);
}

export function levelOf(medianMs, settings) {
  if (medianMs == null) return null;
  if (medianMs < settings.greenMs) return 'green';
  if (medianMs < settings.orangeMs) return 'orange';
  return 'red';
}

/** Stats over the last 5 attempts (of one fact, or of a group of facts). */
export function statsOf(attempts, settings) {
  const recent = attempts.slice(-5);
  const med = median(recent.map((x) => x.ms));
  const errors = recent.filter((x) => !x.correct).length;
  const corrected = recent.filter((x) => x.correct && x.firstTry != null).length;
  return { seen: recent.length > 0, median: med, errors, corrected, attempts, level: levelOf(med, settings) };
}

export function weightOf(stats, settings) {
  if (!stats.seen) return 8;
  const over = Math.max(0, Math.min(3, (stats.median - settings.greenMs) / settings.greenMs));
  return 1 + over + 2 * stats.errors;
}

/**
 * Weighted sampling of the mode's groups without replacement (refilled when exhausted),
 * then a random fact of the picked group, preferring facts not yet in this round.
 * In the small table every fact is its own group.
 */
export function pickRound(profile, settings, mode, rng = Math.random) {
  const index = attemptsByFact(profile);
  const groups = new Map();
  for (const f of mode.facts(settings)) {
    const g = mode.groupOf(f);
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(f);
  }
  const pool = [...groups.values()].map((facts) => ({ facts, w: weightOf(statsOf(groupAttempts(facts, index), settings), settings) }));
  const picked = [];
  const used = new Set();
  let remaining = [...pool];
  while (picked.length < settings.questionsPerRound) {
    if (!remaining.length) remaining = [...pool];
    const total = remaining.reduce((s, g) => s + g.w, 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < remaining.length - 1; idx++) {
      r -= remaining[idx].w;
      if (r <= 0) break;
    }
    const [g] = remaining.splice(idx, 1);
    const fresh = g.facts.filter((f) => !used.has(factKey(f.op, f.a, f.b)));
    const from = fresh.length ? fresh : g.facts;
    const f = from[Math.floor(rng() * from.length)];
    used.add(factKey(f.op, f.a, f.b));
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

/** Histogram range: 10 s for the small table, otherwise ~2× the orange threshold in whole 10 s. */
export function histogramMaxMs(settings) {
  return Math.max(10000, Math.ceil((2 * settings.orangeMs) / 10000) * 10000);
}

/** 21 bins: 20 equal ones up to maxMs, then [maxMs,∞). */
export function histogramBins(answers, maxMs = 10000) {
  const binMs = maxMs / 20;
  const n = 21;
  const bins = Array.from({ length: n }, (_, i) => ({ from: i * binMs, to: i < n - 1 ? (i + 1) * binMs : Infinity, correct: 0, wrong: 0 }));
  for (const ans of answers) {
    const i = Math.min(n - 1, Math.floor(ans.ms / binMs));
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

/**
 * Renders the mode's grids. A cell holds one fact or a group of facts; its colour is the
 * median of the group's last 5 attempts. onCell(cell, facts, stats, element).
 */
export function renderHeatmap(container, grids, index, settings, onCell) {
  container.innerHTML = '';
  for (const grid of grids) {
    if (grid.caption) container.appendChild(el('h3', 'grid-caption', grid.caption));
    const g = el('div', 'heatmap-grid');
    g.style.gridTemplateColumns = `auto repeat(${grid.cols.length}, 1fr)`;
    g.style.maxWidth = `${(grid.cols.length + 1) * 64}px`;
    g.appendChild(el('div', 'hdr corner', grid.corner));
    for (const c of grid.cols) g.appendChild(el('div', 'hdr', c));
    for (const row of grid.rows) {
      g.appendChild(el('div', 'hdr', row.label));
      for (const spec of row.cells) {
        if (!spec) {
          g.appendChild(el('div', 'cell blank'));
          continue;
        }
        const s = statsOf(groupAttempts(spec.facts, index), settings);
        const cell = document.createElement('button');
        cell.type = 'button';
        cell.className = 'cell' + (s.seen ? ` seen ${s.level}` : '') + (s.errors ? ' err' : s.corrected ? ' fix' : '');
        if (spec.facts.length === 1) {
          const f = spec.facts[0];
          cell.dataset.a = String(f.a);
          cell.dataset.b = String(f.b);
          cell.title = spec.title || `${questionText(f.op, f.a, f.b)} = ${answerOf(f.op, f.a, f.b)}`;
        } else {
          cell.dataset.group = spec.group;
          cell.title = spec.title;
        }
        cell.textContent = s.seen ? (s.median / 1000).toFixed(1).replace('.', ',') : '';
        cell.addEventListener('click', () => onCell(spec, s, cell));
        g.appendChild(cell);
      }
    }
    container.appendChild(g);
  }
}

/** Detail of a grouped cell: every fact with its median and attempt counts. */
export function renderGroupDetail(container, spec, index, settings) {
  const rows = spec.facts.map((f) => {
    const s = statsOf(groupAttempts([f], index), settings);
    const wrong = s.attempts.filter((x) => !x.correct).length;
    return `<tr><td>${questionText(f.op, f.a, f.b)} = ${answerOf(f.op, f.a, f.b)}</td>` +
      `<td>${s.seen ? formatSeconds(s.median) : '–'}</td>` +
      `<td>${s.attempts.length}×</td>` +
      `<td class="${wrong ? 'wrong' : ''}">${wrong ? `${wrong} ✗` : ''}</td></tr>`;
  });
  container.hidden = false;
  container.innerHTML = `<h3>${spec.title}</h3><table><tbody>${rows.join('')}</tbody></table>`;
}

export function renderFactHistory(container, op, a, b, stats) {
  const rows = [...stats.attempts].reverse().map(
    (x) => `<tr><td>${formatDate(x.roundAt)}</td><td>${formatSeconds(x.ms)}</td><td class="${x.correct ? 'ok' : 'wrong'}">${x.correct ? (x.firstTry != null ? `✓ (nejdřív ${x.firstTry})` : '✓') : `✗ (${x.given})`}</td></tr>`,
  );
  container.hidden = false;
  container.innerHTML = `<h3>${questionText(op, a, b)} = ${answerOf(op, a, b)}</h3>` +
    (rows.length ? `<table><tbody>${rows.join('')}</tbody></table>` : '<p class="muted">Ještě nehráno.</p>');
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

export function renderHistogram(svg, answers, maxMs = 10000) {
  svg.innerHTML = '';
  const W = 640, H = 320, L = 44, R = 16, T = 40, B = 44;
  const bins = histogramBins(answers, maxMs);
  const rawMax = Math.max(1, ...bins.map((x) => x.correct + x.wrong));
  const step = niceStep(rawMax / 5);
  const maxCount = Math.ceil(rawMax / step) * step;
  const plotW = W - L - R, plotH = H - T - B;
  const bw = plotW / bins.length;
  const y = (v) => T + plotH - (v / maxCount) * plotH;

  // legend
  svg.appendChild(svgEl('rect', { x: L, y: 12, width: 12, height: 12, class: 'bar ok legend-sw' }));
  svg.appendChild(svgEl('text', { x: L + 18, y: 22 }, 'správně'));
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
        .appendChild(svgEl('title', {}, `${label(bin)}: ${bin.correct} správně`));
    }
    if (bin.wrong) {
      const top = y(bin.correct + bin.wrong);
      svg.appendChild(svgEl('rect', { x, y: top, width: w, height: y(bin.correct) - top - (bin.correct ? 1 : 0), class: 'bar wrong', rx: 2 }))
        .appendChild(svgEl('title', {}, `${label(bin)}: ${bin.wrong} chyb`));
    }
    if (i % 2 === 0) {
      svg.appendChild(svgEl('text', { x: L + i * bw, y: H - B + 16, 'text-anchor': 'middle' }, i === bins.length - 1 ? `${maxMs / 1000}+` : String(bin.from / 1000).replace('.', ',')));
    }
  });
  svg.appendChild(svgEl('text', { x: L + plotW / 2, y: H - 8, 'text-anchor': 'middle' }, 'čas odpovědi (s)'));
  if (!answers.length) svg.appendChild(svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'empty' }, 'Zatím žádné odpovědi'));

  function label(bin) {
    const sec = (ms) => String(ms / 1000).replace('.', ',');
    return bin.to === Infinity ? `${sec(bin.from)} s a více` : `${sec(bin.from)}–${sec(bin.to)} s`;
  }
}

/** Two stacked panels sharing the x axis (round index): median time, then error rate. No dual axis. */
export function renderTrend(svg, series) {
  svg.innerHTML = '';
  const W = 640, H = 320, L = 44, R = 16;
  if (!series.length) {
    svg.appendChild(svgEl('text', { x: W / 2, y: H / 2, 'text-anchor': 'middle', class: 'empty' }, 'Zatím žádná kola'));
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
    c.appendChild(svgEl('title', {}, `${formatDate(s.date)} · ${s.n} odpovědí · medián ${formatSeconds(s.medianMs)}`));
    svg.appendChild(c);
  });

  // panel 2: error rate %
  const p2 = { top: 196, h: 90 };
  const maxErr = Math.max(0.1, ...series.map((s) => s.errorRate));
  const y2 = (rate) => p2.top + p2.h - (rate / maxErr) * p2.h;
  svg.appendChild(svgEl('text', { x: L, y: p2.top - 10, class: 'title' }, 'Chybovost (%)'));
  for (let i = 0; i <= 2; i++) {
    const v = (maxErr * i) / 2;
    svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y2(v), y2: y2(v), class: 'grid' }));
    svg.appendChild(svgEl('text', { x: L - 6, y: y2(v) + 4, 'text-anchor': 'end' }, Math.round(v * 100)));
  }
  const bw = Math.min(24, Math.max(6, plotW / n / 2));
  series.forEach((s, i) => {
    const h = y2(0) - y2(s.errorRate);
    const r = svgEl('rect', { x: xOf(i) - bw / 2, y: y2(s.errorRate), width: bw, height: Math.max(0, h), class: 'bar err', rx: 2 });
    r.appendChild(svgEl('title', {}, `${formatDate(s.date)} · ${Math.round(s.errorRate * 100)} % chyb`));
    svg.appendChild(r);
  });
  svg.appendChild(svgEl('line', { x1: L, x2: W - R, y1: y2(0), y2: y2(0), class: 'axis' }));

  // x labels: round index, thinned
  const every = Math.ceil(n / 10);
  series.forEach((s, i) => {
    if (i % every === 0 || i === n - 1) svg.appendChild(svgEl('text', { x: xOf(i), y: H - 8, 'text-anchor': 'middle' }, String(i + 1)));
  });
}
