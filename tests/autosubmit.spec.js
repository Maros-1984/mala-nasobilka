const { test, expect } = require('@playwright/test');
const { createProfile, setSettings, readQuestion, correctAnswer } = require('./helpers');

async function typeDigits(page, value) {
  for (const ch of String(value)) await page.click(`.numpad button[data-key="${ch}"]`);
}

test('correct answer submits itself without OK', async ({ page }) => {
  await createProfile(page, 'Ema');
  await setSettings(page, { count: 5 });
  await page.click('#btn-start');
  const q = await readQuestion(page);
  await typeDigits(page, correctAnswer(q.op, q.a, q.b));
  await expect(page.locator('#progress')).toHaveText('2 / 5');
});

test('wrong full-length answer waits for OK and hints the button', async ({ page }) => {
  await createProfile(page, 'Ema');
  await setSettings(page, { count: 5 });
  await page.click('#btn-start');
  const q = await readQuestion(page);
  const wrong = correctAnswer(q.op, q.a, q.b) + 1;
  await typeDigits(page, wrong);
  await expect(page.locator('#progress')).toHaveText('1 / 5');
  await expect(page.locator('.numpad .ok')).toHaveClass(/hint/);
  await page.click('.numpad button[data-key="ok"]');
  await expect(page.locator('#feedback')).toContainText('Správně:');
});

test('corrected answer is recorded as correct with firstTry', async ({ page }) => {
  await createProfile(page, 'Ema');
  await setSettings(page, { count: 5 });
  await page.click('#btn-start');
  const q = await readQuestion(page);
  const correct = correctAnswer(q.op, q.a, q.b);
  // same digit count, otherwise the first full-length attempt would be a shorter prefix
  const wrong = correct % 10 === 9 ? correct - 1 : correct + 1;
  await typeDigits(page, wrong);
  for (let i = 0; i < String(wrong).length; i++) await page.click('.numpad button[data-key="back"]');
  await typeDigits(page, correct);
  await expect(page.locator('#progress')).toHaveText('2 / 5');

  await page.click('#btn-abort');
  await page.click('#btn-stats');
  await page.click(`#heatmap-op button[data-op="${q.op}"]`);
  const cell = page.locator(`#heatmap .cell[data-a="${q.a}"][data-b="${q.b}"]`);
  await expect(cell).toHaveClass(/fix/);
  await expect(cell).not.toHaveClass(/err/);
  await cell.click();
  await expect(page.locator('#fact-history td.ok')).toContainText(`nejdřív ${wrong}`);
});
