const { test, expect } = require('@playwright/test');
const fs = require('node:fs');
const { createProfile, setSettings, playRound } = require('./helpers');

async function seenCells(page) {
  await page.click('#heatmap-op button[data-op="mul"]');
  const mul = await page.locator('#heatmap .cell.seen').count();
  await page.click('#heatmap-op button[data-op="div"]');
  const div = await page.locator('#heatmap .cell.seen').count();
  return mul + div;
}

test('heatmap shows played facts, errors, and per-fact history', async ({ page }) => {
  await createProfile(page, 'Ema');
  await setSettings(page, { count: 5 });
  await page.click('#btn-start');
  const asked = await playRound(page, { wrongOn: [0] });
  await page.click('#btn-summary-stats');

  await expect(page.locator('#tab-heatmap')).toBeVisible();
  // 5 distinct facts (the wrong one was re-asked, still one cell)
  expect(await seenCells(page)).toBe(5);

  const wrong = asked[0];
  await page.click(`#heatmap-op button[data-op="${wrong.op}"]`);
  const cell = page.locator(`#heatmap .cell[data-a="${wrong.a}"][data-b="${wrong.b}"]`);
  await expect(cell).toHaveClass(/err/);
  await expect(cell).not.toHaveText('');

  await cell.click();
  await expect(page.locator('#fact-history')).toBeVisible();
  await expect(page.locator('#fact-history tbody tr')).toHaveCount(2);
  await expect(page.locator('#fact-history td.wrong')).toHaveCount(1);
});

test('histogram and trend render after two rounds', async ({ page }) => {
  await createProfile(page, 'Ema');
  await setSettings(page, { count: 5 });
  await page.click('#btn-start');
  await playRound(page);
  await page.click('#btn-again');
  await playRound(page, { wrongOn: [1] });
  await page.click('#btn-summary-stats');

  await page.click('#stats-tabs .tab[data-tab="histogram"]');
  await expect(page.locator('#hist-total')).toHaveText('6 odpovědí');
  expect(await page.locator('#histogram rect.bar.ok').count()).toBeGreaterThan(0);
  expect(await page.locator('#histogram rect.bar.wrong').count()).toBeGreaterThan(0);
  await page.click('#hist-filter button[data-filter="all"]');
  await expect(page.locator('#hist-total')).toHaveText('11 odpovědí');

  await page.click('#stats-tabs .tab[data-tab="trend"]');
  await expect(page.locator('#trend circle.point')).toHaveCount(2);
  await expect(page.locator('#trend rect.bar.err')).toHaveCount(2);
});

test('export then import into a clean browser restores the profile', async ({ page, context }) => {
  await createProfile(page, 'Ema');
  await setSettings(page, { count: 5 });
  await page.click('#btn-start');
  await playRound(page);
  await page.click('#btn-summary-stats');
  const before = await seenCells(page);
  expect(before).toBe(5);

  await page.click('#btn-stats-home');
  await page.click('#btn-settings');
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('#btn-export')]);
  expect(download.suggestedFilename()).toMatch(/^nasobilka-Ema-\d{4}-\d{2}-\d{2}\.json$/);
  const file = await download.path();
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  expect(json.version).toBe(1);
  expect(json.profiles[0].rounds[0].answers).toHaveLength(5);

  await context.clearCookies();
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.locator('#screen-profiles')).toBeVisible();
  await expect(page.locator('#profile-list button.profile')).toHaveCount(0);

  // need a profile to reach settings; import replaces/adds by id
  await createProfile(page, 'Dočasný');
  await page.click('#btn-settings');
  await page.setInputFiles('#import-file', file);
  await expect(page.locator('#notice')).toContainText('Import hotov');

  await page.click('#btn-switch-profile');
  await page.click('#profile-list button.profile:has-text("Ema")');
  await page.click('#btn-stats');
  expect(await seenCells(page)).toBe(5);
});

test('invalid import file shows a notice and changes nothing', async ({ page }) => {
  await createProfile(page, 'Ema');
  await page.click('#btn-settings');
  await page.setInputFiles('#import-file', { name: 'x.json', mimeType: 'application/json', buffer: Buffer.from('{not json') });
  await expect(page.locator('#notice')).toContainText('není platný JSON');
  await expect(page.locator('#screen-settings')).toBeVisible();
});
