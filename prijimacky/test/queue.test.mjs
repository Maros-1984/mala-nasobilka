import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterPool, createQueue, taskKey } from '../queue.js';

const index = {
  tests: [
    { id: 'C5A_2026', subject: 'CJ', year: 2026 },
    { id: 'M5A_2026', subject: 'MA', year: 2026 },
    { id: 'M5A_2019', subject: 'MA', year: 2019 },
  ],
  tasks: [
    { t: 'C5A_2026', n: 1, points: 1, group: 'g1-3' },
    { t: 'C5A_2026', n: 2, points: 1, group: 'g1-3' },
    { t: 'C5A_2026', n: 3, points: 1, group: 'g1-3' },
    { t: 'C5A_2026', n: 4, points: 2, group: null },
    { t: 'M5A_2026', n: 1, points: 4, group: null },
    { t: 'M5A_2026', n: 2, points: 3, group: null },
    { t: 'M5A_2019', n: 1, points: 2, group: null },
  ],
};

const all = { subjects: ['CJ', 'MA'], points: [1, 2, 3, 4, 5, 6], yearFrom: 2015, yearTo: 2026 };

// deterministic rng
function rng(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

test('filterPool filters by subject, points and years', () => {
  assert.equal(filterPool(index, all).length, 7);
  assert.equal(filterPool(index, { ...all, subjects: ['MA'] }).length, 3);
  assert.equal(filterPool(index, { ...all, points: [1] }).length, 3);
  assert.equal(filterPool(index, { ...all, yearFrom: 2021 }).length, 6);
  assert.equal(filterPool(index, { ...all, subjects: [] }).length, 0);
});

test('queue serves every task once per cycle, then starts over', () => {
  const pool = filterPool(index, all);
  const q = createQueue(pool, { rng: rng(3) });
  const seen = [];
  for (let i = 0; i < pool.length; i++) {
    const t = q.next();
    seen.push(taskKey(t));
    q.report(t, true);
  }
  assert.equal(new Set(seen).size, pool.length);
  assert.ok(q.next(), 'the queue never runs dry');
});

test('tasks sharing a source text come consecutively and in task order', () => {
  const pool = filterPool(index, all);
  for (let seed = 1; seed < 30; seed++) {
    const q = createQueue(pool, { rng: rng(seed) });
    const order = [];
    for (let i = 0; i < pool.length; i++) {
      const t = q.next();
      order.push(taskKey(t));
      q.report(t, true);
    }
    const i1 = order.indexOf('C5A_2026#1');
    assert.deepEqual(order.slice(i1, i1 + 3), ['C5A_2026#1', 'C5A_2026#2', 'C5A_2026#3']);
  }
});

test('a wrong task comes back later, not immediately', () => {
  const pool = filterPool(index, all);
  const q = createQueue(pool, { rng: rng(5), retryGap: 3 });
  const first = q.next();
  q.report(first, false);
  const next3 = [q.next(), q.next(), q.next()];
  next3.forEach((t) => q.report(t, true));
  assert.ok(!next3.some((t) => taskKey(t) === taskKey(first)));
  const rest = [];
  for (let i = 0; i < pool.length; i++) {
    const t = q.next();
    rest.push(taskKey(t));
    q.report(t, true);
  }
  assert.ok(rest.includes(taskKey(first)));
});

test('already solved tasks are skipped until everything is solved', () => {
  const pool = filterPool(index, all);
  const solved = new Set(pool.slice(0, 6).map(taskKey));
  const q = createQueue(pool, { rng: rng(2), solved });
  const t = q.next();
  assert.equal(taskKey(t), taskKey(pool[6]));
  q.report(t, true);
  assert.ok(q.next(), 'after all are solved it cycles through everything again');
});

test('empty pool gives null', () => {
  const q = createQueue([], {});
  assert.equal(q.next(), null);
});
