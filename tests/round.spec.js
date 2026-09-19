const { test, expect } = require('@playwright/test');
const { createProfile, setSettings, playRound, readQuestion, typeAnswer, correctAnswer } = require('./helpers');

test('play a 5-question round correctly, see the summary', async ({ page }) => {
  await createProfile(page, 'Ema');
  await setSettings(page, { count: 5 });
  await page.click('#btn-start');

  await expect(page.locator('#progress')).toHaveText('1 / 5');
  const asked = await playRound(page);

  expect(asked).toHaveLength(5);
  await expect(page.locator('#summary-text')).toContainText('5 odpovědí');
  await expect(page.locator('#summary-text')).toContainText('0 chyb');
  await expect(page.locator('#summary-slowest li')).toHaveCount(3);
});

test('wrong answer shows the correct one and re-asks the fact', async ({ page }) => {
  await createProfile(page, 'Ema');
  await setSettings(page, { count: 5 });
  await page.click('#btn-start');

  const first = await readQuestion(page);
  const asked = await playRound(page, { wrongOn: [0] });

  expect(asked).toHaveLength(6);
  const repeats = asked.filter((q) => q.op === first.op && q.a === first.a && q.b === first.b);
  expect(repeats).toHaveLength(2);
  await expect(page.locator('#summary-text')).toContainText('6 odpovědí');
  await expect(page.locator('#summary-text')).toContainText('1 chyba');
});

test('division-only setting asks only division; abort keeps partial round', async ({ page }) => {
  await createProfile(page, 'Ema');
  await setSettings(page, { count: 10, ops: 'div' });
  await page.click('#btn-start');

  for (let i = 0; i < 3; i++) {
    const q = await readQuestion(page);
    expect(q.op).toBe('div');
    await expect(page.locator('#question')).toContainText(':');
    await typeAnswer(page, correctAnswer(q.op, q.a, q.b));
  }
  await page.click('#btn-abort');
  await expect(page.locator('#screen-home')).toBeVisible();
  await expect(page.locator('#home-summary')).toContainText('1 kolo');
  await expect(page.locator('#home-summary')).toContainText('3 odpovědi');
});

test('physical keyboard works too', async ({ page }) => {
  await createProfile(page, 'Ema');
  await setSettings(page, { count: 5 });
  await page.click('#btn-start');
  const q = await readQuestion(page);
  await page.keyboard.type(String(correctAnswer(q.op, q.a, q.b)));
  await page.keyboard.press('Enter');
  await expect(page.locator('#progress')).toHaveText('2 / 5');
});
