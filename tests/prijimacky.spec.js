// End-to-end scenarios for the entrance exam app, run against small encrypted fixture data.
const { test, expect } = require('@playwright/test');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const KEY = crypto.createHash('sha256').update('fixture').digest();
const KEY_TEXT = KEY.toString('base64url');
const DIR = path.resolve(__dirname, '..', 'prijimacky', 'test-fixture');
const URL_OK = `/prijimacky/?data=test-fixture#k=${KEY_TEXT}`;
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const ai = { source: 'ai', md: 'Postup **krok za krokem**.\n\n- první\n- druhý' };
const cermat = { source: 'cermat', md: 'Komentář CERMAT.' };

const index = {
  tests: [
    { id: 'FX_M', subject: 'MA', year: 2026, term: '1. řádný termín', source: { test: 'https://example.invalid/t.pdf' } },
    { id: 'FX_C', subject: 'CJ', year: 2019, term: '2. řádný termín', source: {} },
  ],
  tasks: [
    { t: 'FX_M', n: 1, points: 3, group: null },
    { t: 'FX_M', n: 2, points: 6, group: null },
    { t: 'FX_C', n: 1, points: 1, group: 'g1-2' },
    { t: 'FX_C', n: 2, points: 2, group: 'g1-2' },
  ],
};

const blobs = {
  FX_M: {
    id: 'FX_M',
    groups: {},
    tasks: {
      1: {
        points: 3, group: null, crops: [PIXEL], keyCrops: [],
        parts: [
          { id: '1.1', type: 'number', answer: '150', unit: 'lahví', points: 2 },
          { id: '1.2', type: 'number', answer: '24', unit: 'min', points: 1 },
        ],
        scoring: { type: 'sum' },
        keyNote: 'Jiná jednotka = ztráta bodu.',
        explanation: ai,
      },
      2: {
        points: 6, group: null, crops: [PIXEL], keyCrops: [PIXEL],
        parts: [
          { id: '2.1', type: 'self', points: 3, answer: 'viz řešení' },
          { id: '2.2', type: 'self', points: 3, answer: 'viz řešení' },
        ],
        scoring: { type: 'sum' },
        explanation: ai,
      },
    },
  },
  FX_C: {
    id: 'FX_C',
    groups: { 'g1-2': [PIXEL] },
    tasks: {
      1: {
        points: 1, group: 'g1-2', crops: [PIXEL], keyCrops: [],
        parts: [{ id: '1', type: 'choice', options: ['A', 'B', 'C', 'D'], answer: 'C' }],
        scoring: { type: 'sum' },
        explanation: cermat,
      },
      2: {
        points: 2, group: 'g1-2', crops: [PIXEL], keyCrops: [],
        parts: ['A', 'N', 'N', 'A'].map((answer, i) => ({ id: `2.${i + 1}`, type: 'yesno', answer })),
        scoring: { type: 'count', table: { 4: 2, 3: 1 } },
        explanation: cermat,
      },
    },
  },
};

function encrypt(obj, file) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', KEY, iv);
  const body = Buffer.concat([c.update(JSON.stringify(obj)), c.final(), c.getAuthTag()]);
  fs.writeFileSync(path.join(DIR, file), Buffer.concat([iv, body]));
}

test.beforeAll(() => {
  fs.mkdirSync(DIR, { recursive: true });
  encrypt(index, 'index.bin');
  for (const [id, blob] of Object.entries(blobs)) encrypt(blob, `${id}.bin`);
});

async function open(page) {
  await page.goto(URL_OK);
  await expect(page.locator('#filter')).toBeVisible();
}

async function pick(page, { subjects, points, yearFrom }) {
  for (const box of await page.locator('#subjects input').all()) {
    await box.setChecked(subjects.includes(await box.getAttribute('value')), { force: true });
  }
  for (const box of await page.locator('#points input').all()) {
    await box.setChecked(points.includes(Number(await box.getAttribute('value'))), { force: true });
  }
  if (yearFrom) await page.selectOption('#yearFrom', String(yearFrom));
}

test('without a key the lock screen asks for the link', async ({ page }) => {
  await page.goto('/prijimacky/?data=test-fixture');
  await expect(page.locator('#lock')).toBeVisible();
  await page.fill('#lockInput', `http://x/prijimacky/#k=${KEY_TEXT}`);
  await page.click('#lockForm button');
  await expect(page.locator('#filter')).toBeVisible();
});

test('a wrong key is rejected', async ({ page }) => {
  await page.goto(`/prijimacky/?data=test-fixture#k=${'A'.repeat(43)}`);
  await expect(page.locator('#lock')).toBeVisible();
  await expect(page.locator('#lockMsg')).toContainText('Klíč nesedí');
});

test('the key is remembered and removed from the address bar', async ({ page }) => {
  await open(page);
  expect(page.url()).not.toContain('#k=');
  await page.goto('/prijimacky/?data=test-fixture');
  await expect(page.locator('#filter')).toBeVisible();
});

test('the year filter defaults to recent years', async ({ page }) => {
  await open(page);
  await expect(page.locator('#yearFrom')).toHaveValue('2026');
  await expect(page.locator('#poolInfo')).toContainText('Vybráno 2 úloh');
});

test('numbers are graded per part with partial points and an AI label', async ({ page }) => {
  await open(page);
  await pick(page, { subjects: ['MA'], points: [3] });
  await page.click('#start');
  await expect(page.locator('#meta')).toContainText('úloha 1');
  await page.fill('.part[data-part="1.1"] input', '150');
  await page.fill('.part[data-part="1.2"] input', '7');
  await page.click('#evaluate');
  await expect(page.locator('#summary')).toContainText('2 / 3 b.');
  await expect(page.locator('.part[data-part="1.1"]')).toHaveClass(/ok/);
  await expect(page.locator('.part[data-part="1.2"]')).toContainText('správně: 24 min');
  await expect(page.locator('.explanation.ai h3')).toContainText('AI');
  await expect(page.locator('.explanation strong')).toHaveText('krok za krokem');
  await expect(page.locator('.keynote')).toContainText('Jiná jednotka');
  await page.click('#next');
  // the only task in the pool was wrong, so it comes back
  await expect(page.locator('#meta')).toContainText('úloha 1');
  await expect(page.locator('#result')).toBeHidden();
});

test('self-assessed tasks wait for the rating', async ({ page }) => {
  await open(page);
  await pick(page, { subjects: ['MA'], points: [6] });
  await page.click('#start');
  await page.click('#evaluate');
  await expect(page.locator('#next')).toBeDisabled();
  await expect(page.locator('.keycrops img')).toHaveCount(1);
  await page.locator('.part[data-part="2.1"] .rate button', { hasText: '3 b.' }).click();
  await expect(page.locator('#next')).toBeDisabled();
  await page.locator('.part[data-part="2.2"] .rate button', { hasText: '2 b.' }).click();
  await expect(page.locator('#summary')).toContainText('5 / 6 b.');
  await expect(page.locator('#next')).toBeEnabled();
});

test('tasks sharing a source text come together with the text', async ({ page }) => {
  await open(page);
  await pick(page, { subjects: ['CJ'], points: [1, 2], yearFrom: 2019 });
  await page.click('#start');
  await expect(page.locator('#meta')).toContainText('úloha 1');
  await expect(page.locator('#source img')).toHaveCount(1);
  await page.locator('.opt', { hasText: 'C' }).click();
  await page.click('#evaluate');
  await expect(page.locator('#summary')).toContainText('1 / 1 b.');
  await expect(page.locator('.explanation.cermat h3')).toContainText('CERMAT');
  await page.click('#next');
  await expect(page.locator('#meta')).toContainText('úloha 2');
  await expect(page.locator('#source img')).toHaveCount(1);
  for (const [id, label] of [['2.1', 'ANO'], ['2.2', 'NE'], ['2.3', 'NE'], ['2.4', 'NE']]) {
    await page.locator(`.part[data-part="${id}"] .opt`, { hasText: label }).click();
  }
  await page.click('#evaluate');
  await expect(page.locator('#summary')).toContainText('1 / 2 b.');
  await page.click('#next');
  await page.click('#back');
  await expect(page.locator('#stats')).toContainText('Čeština: 2 úloh, 2 / 3 b.');
});
