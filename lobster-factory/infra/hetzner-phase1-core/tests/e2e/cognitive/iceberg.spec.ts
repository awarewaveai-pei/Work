import { test, expect } from '@playwright/test';

test('login -> iceberg -> result page nine sections', async ({ page }) => {
  const tenant = process.env.COS_TEST_TENANT_ID;
  const email = process.env.COS_TEST_EMAIL;
  const password = process.env.COS_TEST_PASSWORD;
  const projectId = process.env.COS_TEST_PROJECT_ID;
  test.skip(!tenant || !email || !password || !projectId, 'COS_TEST_TENANT_ID / COS_TEST_EMAIL / COS_TEST_PASSWORD / COS_TEST_PROJECT_ID missing');
  await page.goto('/login');
  await page.getByLabel('Tenant ID').fill(tenant!);
  await page.getByLabel('Email').fill(email!);
  await page.getByLabel('Password').fill(password!);
  await page.getByRole('button', { name: '登入' }).click();
  await page.goto('/methods');
  await page.getByPlaceholder('搜尋工具').fill('iceberg');
  await page.getByRole('link', { name: '開始使用' }).first().click();
  await expect(page.getByRole('heading', { name: /systems\.iceberg_model/ })).toBeVisible();
  await page.getByLabel('Project ID').fill(projectId!);
  await page.getByRole('button', { name: '用示範案例試一次' }).click();
  await page.getByRole('button', { name: '開始解讀' }).click();
  await expect(page.locator('[data-section="0"]')).toBeVisible();
  await expect(page.locator('[data-section]')).toHaveCount(9);
  await expect(page.locator('[data-section="1"] a[href^="#citation-"]')).toHaveCount(1);
});
