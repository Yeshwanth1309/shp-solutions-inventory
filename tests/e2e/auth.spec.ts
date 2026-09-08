import { test, expect } from '@playwright/test';

/**
 * Requires ADMIN_EMAIL / ADMIN_PASSWORD to match an account already bootstrapped
 * against the server under test (see tests/e2e/README.md).
 */
const email = process.env.ADMIN_EMAIL ?? 'e2e@shpsolutions.test';
const password = process.env.ADMIN_PASSWORD ?? 'E2eTestPass123';

test.describe('authentication', () => {
  test('rejects an unknown login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill('nobody@shpsolutions.test');
    await page.getByLabel('Password').fill('WrongPassword123');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test('signs in and lands on the dashboard', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(page.getByText('Total products')).toBeVisible();
  });

  test('an unauthenticated visitor is redirected to /login', async ({ page }) => {
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login$/);
  });
});
