const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { createProfile, setSettings, playRound, readQuestion, typeAnswer, correctAnswer } = require('./helpers');

const APPS = [
  {
    url: '/velka/', title: 'Velká násobilka', op: 'mul2',
    valid: (q) => q.a >= 2 && q.a <= 9 && q.b >= 11 && q.b <= 99 && q.b % 10 !== 0,
    hint: (q) => `${q.a} × ${q.b - (q.b % 10)} + ${q.a} × ${q.b % 10}`,
  },
  {
    url: '/deleni/', title: 'Dělení', op: 'div2',
    valid: (q) => q.a >= 2 && q.a <= 9 && q.b >= 11 && q.b <= 99 && q.b % 10 !== 0,
    hint: (q) => `${q.a * q.b} : ${q.a} = ${q.b}, protože`,
  },
  {
    url: '/polovice/', title: 'Poloviny', op: 'half',
    valid: (q) => q.b === 2 && q.a % 2 === 0 && (q.a <= 200 || (q.a % 10 === 0 && q.a <= 1000)),
    hint: (q) => `Polovina z ${q.a} je ${q.a / 2}`,
  },
];

for (const app of APPS) {
  test.describe(app.title, () => {
    test('plays a round of valid examples', async ({ page }) => {
      await createProfile(page, 'Ema', app.url);
      await expect(page.locator('#screen-home .app-title')).toHaveText(app.title);
      await setSettings(page, { count: 5 });
      await page.click('#btn-start');
      const asked = await playRound(page, { hint: true });
      expect(asked).toHaveLength(5);
      for (const q of asked) {
        expect(q.op).toBe(app.op);
        expect(app.valid(q), JSON.stringify(q)).toBe(true);
      }
      await expect(page.locator('#summary-text')).toContainText('0 chyb');
    });

    test('wrong answer shows a hint and waits for Dál', async ({ page }) => {
      await createProfile(page, 'Ema', app.url);
      await setSettings(page, { count: 5 });
      await page.click('#btn-start');
      const q = await readQuestion(page);
      await typeAnswer(page, correctAnswer(q.op, q.a, q.b) + 1);
      await expect(page.locator('#feedback')).toContainText(app.hint(q));
      await expect(page.locator('#btn-next')).toBeVisible();
      // no timer: still on the same question after the small table's delay
      await page.waitForTimeout(1800);
      await expect(page.locator('#progress')).toHaveText('1 / 6');
      await page.keyboard.press('Enter');
      await expect(page.locator('#progress')).toHaveText('2 / 6');
      await expect(page.locator('#btn-next')).toBeHidden();
      await expect(page.locator('#feedback')).toHaveText('');

      const rest = await playRound(page, { hint: true });
      expect(rest.filter((x) => x.a === q.a && x.b === q.b)).toHaveLength(1);
      await expect(page.locator('#summary-text')).toContainText('1 chyba');

      await page.click('#btn-summary-stats');
      const cell = app.op === 'half'
        ? page.locator(`#heatmap .cell[data-a="${q.a}"]`)
        : page.locator(`#heatmap .cell[data-group="${q.a}:${Math.floor(q.b / 10)}"]`);
      await expect(cell).toHaveClass(/err/);
      await cell.click();
      await expect(page.locator('#fact-history')).toContainText(`= ${correctAnswer(q.op, q.a, q.b)}`);
    });

    test('has its own storage and links to the other apps', async ({ page }) => {
      await createProfile(page, 'Ema', app.url);
      const links = page.locator('#screen-home .app-link');
      await expect(links).toHaveCount(3);
      await page.click('#screen-home .app-link:has-text("Malá násobilka")');
      await expect(page).toHaveURL(/\/$/);
      await expect(page.locator('#screen-profiles .app-title')).toHaveText('Malá násobilka');
      await expect(page.locator('#profile-list button.profile')).toHaveCount(0);
      await page.goBack();
      await expect(page.locator('#screen-home h1')).toHaveText('Ema');
    });
  });
}

test('small table refuses an export from another app', async ({ page }) => {
  await createProfile(page, 'Ema', '/velka/');
  await page.click('#btn-settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  expect(download.suggestedFilename()).toMatch(/^velka-nasobilka-Ema-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  expect(JSON.parse(fs.readFileSync(file, 'utf8')).mode).toBe('velka');

  await createProfile(page, 'Jan', '/');
  await page.click('#btn-settings');
  await page.setInputFiles('#import-file', file);
  await expect(page.locator('#notice')).toContainText('z jiné aplikace');
});

test('big table picks one fact per group until the groups run out', async ({ page }) => {
  await page.goto('/velka/');
  const groups = await page.evaluate(async () => {
    const { pickRound } = await import('/stats.js');
    const { MODES } = await import('/modes.js');
    const mode = MODES.velka;
    const picked = pickRound({ rounds: [] }, { ...mode.defaults, questionsPerRound: 72 }, mode);
    return new Set(picked.map((f) => mode.groupOf(f))).size;
  });
  expect(groups).toBe(72);
});

test('histogram range follows the orange threshold', async ({ page }) => {
  await createProfile(page, 'Ema', '/deleni/');
  await setSettings(page, { count: 5 });
  await page.click('#btn-start');
  await playRound(page, { hint: true });
  await page.click('#btn-summary-stats');
  await page.click('#stats-tabs .tab[data-tab="histogram"]');
  await expect(page.locator('#histogram text', { hasText: '40+' })).toHaveCount(1);
});
