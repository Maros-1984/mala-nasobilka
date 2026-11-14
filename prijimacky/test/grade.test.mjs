import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeTask, expectedText, normalizeText, parseNumber } from '../grade.js';

const yesno = (id, answer) => ({ id, type: 'yesno', answer });

test('normalizeText trims, collapses spaces, lower-cases, drops final dot, keeps diacritics', () => {
  assert.equal(normalizeText('  Škůdce.  '), 'škůdce');
  assert.equal(normalizeText('a   b'), 'a b');
  assert.notEqual(normalizeText('skudce'), normalizeText('škůdce'));
});

test('parseNumber ignores spaces and accepts decimal comma', () => {
  assert.equal(parseNumber('80 000'), 80000);
  assert.equal(parseNumber('4,5'), 4.5);
  assert.equal(parseNumber(' 4.5 '), 4.5);
  assert.ok(Number.isNaN(parseNumber('abc')));
  assert.ok(Number.isNaN(parseNumber('')));
});

test('single choice task earns the task points', () => {
  const task = { parts: [{ id: '1', type: 'choice', options: ['A', 'B', 'C', 'D'], answer: 'C' }], scoring: { type: 'sum' } };
  assert.equal(gradeTask(task, 1, { 1: 'C' }).points, 1);
  assert.equal(gradeTask(task, 1, { 1: 'B' }).points, 0);
  assert.equal(gradeTask(task, 1, {}).points, 0);
});

test('count scoring for an ANO/NE battery', () => {
  const task = {
    parts: [yesno('4.1', 'N'), yesno('4.2', 'N'), yesno('4.3', 'A'), yesno('4.4', 'N')],
    scoring: { type: 'count', table: { 4: 2, 3: 1 } },
  };
  assert.equal(gradeTask(task, 2, { '4.1': 'N', '4.2': 'N', '4.3': 'A', '4.4': 'N' }).points, 2);
  assert.equal(gradeTask(task, 2, { '4.1': 'N', '4.2': 'N', '4.3': 'A', '4.4': 'A' }).points, 1);
  assert.equal(gradeTask(task, 2, { '4.1': 'A', '4.2': 'A', '4.3': 'A', '4.4': 'N' }).points, 0);
  const r = gradeTask(task, 2, { '4.1': 'N' });
  assert.deepEqual(r.parts.map((p) => p.correct), [true, false, false, false]);
});

test('sum scoring with numbers, units and partial credit', () => {
  const task = {
    parts: [
      { id: '4.1', type: 'number', answer: '150', points: 2, partial: [{ answer: '50', points: 1 }] },
      { id: '4.2', type: 'number', answer: '100', points: 2 },
      { id: '4.3', type: 'number', answer: '24', unit: 'min', points: 1 },
    ],
    scoring: { type: 'sum' },
  };
  assert.equal(gradeTask(task, 5, { '4.1': '150', '4.2': '100', '4.3': '24' }).points, 5);
  const r = gradeTask(task, 5, { '4.1': '50', '4.2': '1 00', '4.3': '25' });
  assert.equal(r.points, 3);
  assert.equal(r.parts[0].correct, false);
  assert.equal(r.parts[0].points, 1);
});

test('number accepts alternatives', () => {
  const task = { parts: [{ id: '2', type: 'number', answer: '0.5', accept: ['1.5'], points: 2 }], scoring: { type: 'sum' } };
  assert.equal(gradeTask(task, 2, { 2: '0,5' }).points, 2);
  assert.equal(gradeTask(task, 2, { 2: '1,50' }).points, 2);
});

test('text answers need exact diacritics', () => {
  const task = { parts: [{ id: '6.1', type: 'text', answer: 'škůdce', points: 1 }, { id: '6.2', type: 'text', answer: 'zápěstí', accept: ['zápěstím'], points: 1 }], scoring: { type: 'sum' } };
  assert.equal(gradeTask(task, 2, { '6.1': 'Škůdce', '6.2': 'zápěstím' }).points, 2);
  assert.equal(gradeTask(task, 2, { '6.1': 'skůdce', '6.2': 'zapěstí' }).points, 0);
});

test('set scoring counts missing and wrong items as errors', () => {
  const part = { id: '12', type: 'set', kind: 'text', answer: ['vsi', 'slaměnou', 'medvědovi', 'vybraných'], table: { 0: 4, 1: 3, 2: 2, 3: 1 } };
  const task = { parts: [part], scoring: { type: 'sum' } };
  assert.equal(gradeTask(task, 4, { 12: 'vsi, slaměnou, medvědovi, vybraných' }).points, 4);
  assert.equal(gradeTask(task, 4, { 12: 'Vybraných; vsi, slaměnou' }).points, 3);
  // CERMAT example: náramě, vsi, vybraných, nezbitné → 4 errors → 0 points
  assert.equal(gradeTask(task, 4, { 12: 'náramě, vsi, vybraných, nezbitné' }).points, 0);
  assert.equal(gradeTask(task, 4, {}).points, 0);
});

test('number set accepts space separated values', () => {
  const part = { id: '2', type: 'set', kind: 'number', answer: ['10', '13', '14'], table: { 0: 3, 1: 2, 2: 1 } };
  const task = { parts: [part], scoring: { type: 'sum' } };
  assert.equal(gradeTask(task, 3, { 2: '14 10 13' }).points, 3);
  assert.equal(gradeTask(task, 3, { 2: '10, 13' }).points, 2);
  assert.equal(gradeTask(task, 3, { 2: '10, 13, 15' }).points, 1);
});

test('set items can list alternatives', () => {
  const part = { id: '17', type: 'set', kind: 'text', answer: ['vydali|vydali se', 'šli'], table: { 0: 2, 1: 1 } };
  const task = { parts: [part], scoring: { type: 'sum' } };
  assert.equal(gradeTask(task, 2, { 17: 'vydali se, šli' }).points, 2);
  assert.equal(gradeTask(task, 2, { 17: 'šli, vydali' }).points, 2);
  assert.equal(gradeTask(task, 2, { 17: 'vydali, vydali se' }).points, 0);
  assert.equal(expectedText(part), 'vydali / vydali se, šli');
});

test('all scoring for ordering tasks', () => {
  const slots = ['F', 'A', 'D'].map((answer, i) => ({ id: `13.${i + 1}`, type: 'match', options: ['A', 'B', 'C', 'D', 'E', 'F'], answer }));
  const task = { parts: slots, scoring: { type: 'all', points: 3 } };
  assert.equal(gradeTask(task, 3, { '13.1': 'F', '13.2': 'A', '13.3': 'D' }).points, 3);
  assert.equal(gradeTask(task, 3, { '13.1': 'F', '13.2': 'A', '13.3': 'B' }).points, 0);
});

test('self parts earn the points the child picked, capped at the maximum', () => {
  const task = {
    parts: [
      { id: '7.1', type: 'self', points: 3, answer: 'viz řešení' },
      { id: '7.2', type: 'self', points: 3, answer: 'viz řešení' },
    ],
    scoring: { type: 'sum' },
  };
  const r = gradeTask(task, 6, { '7.1': 2, '7.2': 9 });
  assert.equal(r.points, 5);
  assert.equal(r.needsSelf, false);
  assert.equal(gradeTask(task, 6, { '7.1': 2 }).needsSelf, true);
});

test('expectedText formats the right answer for display', () => {
  assert.equal(expectedText(yesno('4.1', 'A')), 'ANO');
  assert.equal(expectedText({ type: 'number', answer: '80000', unit: 'Kč' }), '80 000 Kč');
  assert.equal(expectedText({ type: 'number', answer: '4.5', unit: 'cm' }), '4,5 cm');
  assert.equal(expectedText({ type: 'set', answer: ['a', 'b'] }), 'a, b');
});
