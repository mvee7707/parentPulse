// @ts-check
import { test } from '@playwright/test';
import fs from 'fs';

test.use({ storageState: undefined });

test('auth setup – login and save session', async ({ page, context }) => {
  try {
    await page.goto(
      'https://sis.factsmgt.com/family-portal/en-us/school/index?familyId=1381&schoolCode=ANC'
    );

    await page.locator('#rw-district-code').fill('ANC-FL');
    await page.locator('#next').click();

    await page.getByRole('textbox', { name: 'Username' }).fill('Modular6607');
    await page.getByRole('textbox', { name: 'Password' }).fill('wvp.WUT_wjz2pkx2dug');
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Give time for MFA
    await page.waitForTimeout(60000);

    await page.waitForLoadState('networkidle', { timeout: 180000 });

    // Enter student dashboard (required for full auth)
    const studentCard = page.locator('mat-card:has-text("Student")').first();
    if (await studentCard.isVisible()) {
      await studentCard.click();
      await page.waitForLoadState('networkidle');
    }

  } finally {
    // Save state even if test fails
    try {
      const state = await context.storageState();
      fs.writeFileSync('storageState.json', JSON.stringify(state, null, 2));
      console.log('Session saved (even if test failed)');
    } catch (err) {
      console.log('Could not save session because browser was closed');
    }
  }
});
