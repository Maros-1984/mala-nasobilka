const { test, expect } = require('@playwright/test');
const { createProfile, setSettings, readQuestion, typeAnswer, correctAnswer } = require('./helpers');

// Count oscillators created, so we can tell whether a sound was played without hearing it.
async function spyOscillators(page) {
  await page.addInitScript(() => {
    window.__osc = 0;
    const orig = AudioContext.prototype.createOscillator;
    AudioContext.prototype.createOscillator = function () { window.__osc++; return orig.call(this); };
  });
}

test('sound is on by default and plays on correct and wrong answers', async ({ page }) => {
  await spyOscillators(page);
  await createProfile(page, 'Ema');
  await page.click('#btn-settings');
  await expect(page.locator('#set-sound')).toBeChecked();
  await page.click('#btn-cancel-settings');

  await page.click('#btn-start');
  let q = await readQuestion(page);
  await typeAnswer(page, correctAnswer(q.op, q.a, q.b));
  expect(await page.evaluate(() => window.__osc)).toBe(3);

  q = await readQuestion(page);
  await typeAnswer(page, correctAnswer(q.op, q.a, q.b) + 1);
  expect(await page.evaluate(() => window.__osc)).toBe(6);
});

test('sound switch is global, persists, and silences answers', async ({ page }) => {
  await spyOscillators(page);
  await createProfile(page, 'Ema');
  await setSettings(page, { count: 5, sound: false });

  await page.reload();
  await page.click('#btn-settings');
  await expect(page.locator('#set-sound')).not.toBeChecked();
  await page.click('#btn-cancel-settings');

  // another profile sees the same switch
  await page.click('#btn-switch-profile');
  await page.fill('#new-profile-name', 'Jan');
  await page.click('#btn-add-profile');
  await page.click('#profile-list button.profile:has-text("Jan")');
  await page.click('#btn-settings');
  await expect(page.locator('#set-sound')).not.toBeChecked();
  await page.click('#btn-cancel-settings');

  await page.click('#btn-start');
  const q = await readQuestion(page);
  await typeAnswer(page, correctAnswer(q.op, q.a, q.b));
  expect(await page.evaluate(() => window.__osc)).toBe(0);
});
