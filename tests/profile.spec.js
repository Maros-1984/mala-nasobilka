const { test, expect } = require('@playwright/test');

test('create a profile, select it, survives reload', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#screen-profiles h1')).toHaveText('Kdo hraje?');

  await page.fill('#new-profile-name', 'Ema');
  await page.click('#btn-add-profile');
  const emaButton = page.locator('#profile-list button.profile:has-text("Ema")');
  await expect(emaButton).toBeVisible();

  await emaButton.click();
  await expect(page.locator('#screen-home')).toBeVisible();
  await expect(page.locator('#screen-home h1')).toHaveText('Ema');

  await page.reload();
  await expect(page.locator('#screen-home h1')).toHaveText('Ema');

  // switch profile and delete it (two-step inline confirmation, no dialogs)
  await page.click('#btn-switch-profile');
  await expect(page.locator('#screen-profiles')).toBeVisible();
  await page.click('#profile-list .delete:near(:text("Ema"))');
  await page.click('#profile-list .confirm-delete');
  await expect(emaButton).toHaveCount(0);
});
