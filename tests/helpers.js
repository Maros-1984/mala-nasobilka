// Shared UI helpers for the Playwright scenarios.
const { expect } = require('@playwright/test');

async function createProfile(page, name = 'Ema') {
  await page.goto('/');
  await page.fill('#new-profile-name', name);
  await page.click('#btn-add-profile');
  await page.click(`#profile-list button.profile:has-text("${name}")`);
  await expect(page.locator('#screen-home h1')).toHaveText(name);
}

async function setSettings(page, { count, ops, green, orange } = {}) {
  await page.click('#btn-settings');
  if (count !== undefined) await page.fill('#set-count', String(count));
  if (ops !== undefined) await page.selectOption('#set-ops', ops);
  if (green !== undefined) await page.fill('#set-green', String(green));
  if (orange !== undefined) await page.fill('#set-orange', String(orange));
  await page.click('#btn-save-settings');
  await expect(page.locator('#screen-home')).toBeVisible();
}

function correctAnswer(op, a, b) {
  return op === 'mul' ? a * b : b;
}

async function readQuestion(page) {
  const q = page.locator('#question');
  await expect(q).toBeVisible();
  return {
    op: await q.getAttribute('data-op'),
    a: Number(await q.getAttribute('data-a')),
    b: Number(await q.getAttribute('data-b')),
  };
}

async function typeAnswer(page, value) {
  for (const ch of String(value)) {
    await page.click(`.numpad button[data-key="${ch}"]`);
  }
  await page.click('.numpad button[data-key="ok"]');
}

/** Plays until the summary screen shows. `wrongOn` = zero-based indexes to answer wrongly. */
async function playRound(page, { wrongOn = [] } = {}) {
  const asked = [];
  let i = 0;
  while (!(await page.locator('#screen-summary').isVisible())) {
    const q = await readQuestion(page);
    asked.push(q);
    const correct = correctAnswer(q.op, q.a, q.b);
    if (wrongOn.includes(i)) {
      await typeAnswer(page, correct + 1);
      await expect(page.locator('#feedback')).toContainText('Správně:');
      await expect(page.locator('#feedback')).not.toContainText('Správně:', { timeout: 5000 });
    } else {
      await typeAnswer(page, correct);
    }
    i++;
    if (i > 500) throw new Error('round never ended');
  }
  return asked;
}

module.exports = { createProfile, setSettings, correctAnswer, readQuestion, typeAnswer, playRound };
