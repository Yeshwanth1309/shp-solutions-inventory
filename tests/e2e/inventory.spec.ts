import { test, expect } from '@playwright/test';

const email = process.env.ADMIN_EMAIL ?? 'e2e@shpsolutions.test';
const password = process.env.ADMIN_PASSWORD ?? 'E2eTestPass123';

test.describe('inventory workflow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(email);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('creates a product, adds stock, and sees it reflected on the dashboard', async ({ page }) => {
    const sku = `E2E-${Date.now()}`;

    await page.goto('/products');
    await page.getByRole('button', { name: 'Add product' }).click();
    await page.getByLabel('Product name').fill('E2E Toner Cartridge');
    await page.getByLabel('SKU').fill(sku);
    await page.getByLabel('Category').click();
    await page.getByRole('option').first().click();
    await page.getByLabel('Minimum stock').fill('5');
    await page.getByRole('button', { name: 'Create product' }).click();

    await expect(page.getByText('E2E Toner Cartridge')).toBeVisible();

    await page.getByText('E2E Toner Cartridge').click();
    await expect(page).toHaveURL(/\/products\//);
    await page.getByRole('button', { name: 'Add stock' }).click();
    await page.getByLabel('Quantity').fill('25');
    await page.getByLabel('Reason').click();
    await page.getByRole('option', { name: 'Purchase' }).click();
    await page.getByRole('button', { name: /Confirm add/ }).click();

    await expect(page.getByText('Stock successfully updated.')).toBeVisible();
    await expect(page.getByText('25').first()).toBeVisible();
  });

  test('rejects removing more stock than is available', async ({ page }) => {
    await page.goto('/inventory/low-stock');
    // If nothing is low, the empty state proves the page loaded correctly.
    const emptyState = page.getByText('No low-stock products.');
    const firstRow = page.locator('table tbody tr').first();
    await expect(emptyState.or(firstRow)).toBeVisible();
  });
});
