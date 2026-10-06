// The four apps sharing one engine. Each URL boots one mode (see <body data-mode>).
// A mode defines its facts, the grouping used for adaptive picking, the heatmap grids
// and the hint shown after a wrong answer. Every mode keeps its data under its own key.

import { answerOf, factKey } from './stats.js';

const range = (from, to, step = 1) => {
  const out = [];
  for (let i = from; i <= to; i += step) out.push(i);
  return out;
};

/** 2..9 × 11..99 without multiples of ten. */
const BIG_A = range(2, 9);
const BIG_B = range(11, 99).filter((b) => b % 10);
const TENS = range(1, 9);

function bigFacts(op) {
  return BIG_A.flatMap((a) => BIG_B.map((b) => ({ op, a, b })));
}

/** 7 × 45 = 7 × 40 + 7 × 5 = 280 + 35 = 315 */
function decomposition(a, b) {
  const tens = b - (b % 10);
  const units = b % 10;
  return `${a} × ${tens} + ${a} × ${units} = ${a * tens} + ${a * units} = ${a * b}`;
}

/** Rows = single-digit factor, columns = tens of the two-digit one; a cell groups 9 facts. */
function bigGrid(op) {
  return [{
    corner: op === 'mul2' ? '×' : ':',
    cols: TENS.map((t) => `${t * 10}`),
    rows: BIG_A.map((a) => ({
      label: String(a),
      cells: TENS.map((t) => ({
        group: `${a}:${t}`,
        facts: BIG_B.filter((b) => Math.floor(b / 10) === t).map((b) => ({ op, a, b })),
        title: op === 'mul2' ? `${a} × ${t * 10}–${t * 10 + 9}` : `: ${a}, výsledek ${t * 10}–${t * 10 + 9}`,
      })),
    })),
  }];
}

const HALVES = [...range(2, 200, 2), ...range(210, 1000, 10)];

function halfCell(n) {
  return HALVES.includes(n) ? { facts: [{ op: 'half', a: n, b: 2 }], title: `Polovina z ${n}` } : null;
}

const smallGroups = (f) => factKey(f.op, f.a, f.b);

export const MODES = {
  mala: {
    id: 'mala',
    title: 'Malá násobilka',
    path: '',
    storageKey: 'nasobilka.v1',
    exportPrefix: 'nasobilka',
    opChoice: true,
    heatmapOps: ['mul', 'div'],
    defaults: { questionsPerRound: 30, ops: 'both', greenMs: 3000, orangeMs: 5000 },
    facts(settings) {
      const ops = settings.ops === 'both' ? ['mul', 'div'] : [settings.ops];
      return ops.flatMap((op) => range(1, 10).flatMap((a) => range(1, 10).map((b) => ({ op, a, b }))));
    },
    groupOf: smallGroups,
    grids(op) {
      return [{
        corner: op === 'mul' ? '×' : ':',
        cols: range(1, 10).map(String),
        rows: range(1, 10).map((a) => ({
          label: String(a),
          cells: range(1, 10).map((b) => ({ facts: [{ op, a, b }] })),
        })),
      }];
    },
    hint: null,
  },
  velka: {
    id: 'velka',
    title: 'Velká násobilka',
    path: 'velka/',
    storageKey: 'velka-nasobilka.v1',
    exportPrefix: 'velka-nasobilka',
    heatmapOps: ['mul2'],
    defaults: { questionsPerRound: 20, ops: 'mul2', greenMs: 6000, orangeMs: 12000 },
    facts: () => bigFacts('mul2'),
    groupOf: (f) => `${f.a}:${Math.floor(f.b / 10)}`,
    grids: () => bigGrid('mul2'),
    hint: (q) => `${q.a} × ${q.b} = ${decomposition(q.a, q.b)}`,
  },
  deleni: {
    id: 'deleni',
    title: 'Dělení',
    path: 'deleni/',
    storageKey: 'deleni.v1',
    exportPrefix: 'deleni',
    heatmapOps: ['div2'],
    defaults: { questionsPerRound: 15, ops: 'div2', greenMs: 10000, orangeMs: 20000 },
    facts: () => bigFacts('div2'),
    groupOf: (f) => `${f.a}:${Math.floor(f.b / 10)}`,
    grids: () => bigGrid('div2'),
    hint: (q) => `${q.a * q.b} : ${q.a} = ${q.b}, protože ${decomposition(q.a, q.b)}`,
  },
  polovice: {
    id: 'polovice',
    title: 'Poloviny',
    path: 'polovice/',
    storageKey: 'poloviny.v1',
    exportPrefix: 'poloviny',
    heatmapOps: ['half'],
    defaults: { questionsPerRound: 30, ops: 'half', greenMs: 2000, orangeMs: 4000 },
    facts: () => HALVES.map((n) => ({ op: 'half', a: n, b: 2 })),
    groupOf: smallGroups,
    grids: () => [
      {
        caption: 'Do 200',
        corner: '',
        cols: ['0', '2', '4', '6', '8'],
        rows: range(0, 19).map((t) => ({
          label: String(t * 10),
          cells: [0, 2, 4, 6, 8].map((u) => halfCell(t * 10 + u)),
        })),
      },
      {
        caption: 'Desítky do 1000',
        corner: '',
        cols: range(0, 9).map((t) => String(t * 10)),
        rows: range(2, 10).map((h) => ({
          label: String(h * 100),
          cells: range(0, 9).map((t) => (h * 100 + t * 10 > 200 ? halfCell(h * 100 + t * 10) : null)),
        })),
      },
    ],
    hint: (q) => `Polovina z ${q.a} je ${answerOf(q.op, q.a, q.b)}`,
  },
};

export const MODE_ORDER = ['mala', 'velka', 'polovice', 'deleni'];
