import { test, expect } from '@playwright/test';

test('login, reload and a second tab restore the profile; logout survives reload', async ({ page, context }) => {
  let active = false, rotation = 0;
  const cookie = () => `tr_refresh=fixture-${rotation}; HttpOnly; Path=/api/v1/auth; SameSite=Lax; Max-Age=604800`;
  await context.route('**/api/v1/**', async route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path.endsWith('/auth/google/config')) return route.fulfill({ json: { clientId: '' } });
    if (path.endsWith('/auth/login')) {
      expect(request.headers()['x-auth-mode']).toBe('cookie');
      active = true; rotation++;
      return route.fulfill({ headers: { 'set-cookie': cookie() }, json: { accessToken: 'access', refreshToken: null } });
    }
    if (path.endsWith('/auth/refresh')) {
      if (!active) return route.fulfill({ status: 401, json: {} });
      expect(request.headers().cookie).toContain(`tr_refresh=fixture-${rotation}`);
      expect(request.headers()['x-auth-mode']).toBe('cookie');
      rotation++;
      return route.fulfill({ headers: { 'set-cookie': cookie() }, json: { accessToken: 'access' } });
    }
    if (path.endsWith('/auth/logout')) {
      active = false;
      return route.fulfill({ status: 204, headers: { 'set-cookie': 'tr_refresh=; HttpOnly; Path=/api/v1/auth; Max-Age=0; SameSite=Lax' } });
    }
    if (path.endsWith('/auth/me')) {
      expect(request.headers().authorization).toBe('Bearer access');
      return route.fulfill({ json: { id: 'user', email: 'reload@example.test', roles: ['USER'] } });
    }
    return route.fulfill({ json: { content: [], totalPages: 0, totalElements: 0, page: 0 } });
  });
  await page.goto('/login?next=%2Faccount%2Fprofile');
  await page.locator('#auth-email').fill('reload@example.test');
  await page.locator('#auth-password').fill('a-long-test-password');
  await page.locator('.auth-submit').click();
  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(page.getByRole('definition').filter({ hasText: 'reload@example.test' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('definition').filter({ hasText: 'reload@example.test' })).toBeVisible();
  await expect(page).toHaveURL(/\/account\/profile$/);
  const second = await context.newPage();
  await second.goto('/account/profile');
  await expect(second.getByRole('definition').filter({ hasText: 'reload@example.test' })).toBeVisible();
  await Promise.all([page.reload(), second.reload()]);
  await expect(page.getByRole('definition').filter({ hasText: 'reload@example.test' })).toBeVisible();
  await expect(second.getByRole('definition').filter({ hasText: 'reload@example.test' })).toBeVisible();
  expect((await context.cookies()).find(item => item.name === 'tr_refresh')?.httpOnly).toBe(true);
  expect(await page.evaluate(() => document.cookie)).not.toContain('tr_refresh');
  expect(await page.evaluate(() => [localStorage.getItem('tr_access_token'), localStorage.getItem('tr_refresh_token')])).toEqual([null, null]);
  await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/account/profile');
  await expect(page).toHaveURL(/\/login\?next=/);
  await second.close();
});

test('temporary bootstrap failure shows retry without redirecting a protected URL', async ({ page }) => {
  let unavailable = true;
  await page.route('**/api/v1/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/refresh')) return route.fulfill(unavailable
      ? { status: 503, json: {} } : { json: { accessToken: 'access' } });
    if (path.endsWith('/me')) return route.fulfill({ json: { id: 'u', email: 'retry@example.test', roles: ['USER'] } });
    return route.fulfill({ json: { content: [], page: 0, totalPages: 0, totalElements: 0 } });
  });
  await page.goto('/account/profile');
  await expect(page.getByRole('alert')).toContainText('Máy chủ đang khởi động');
  await expect(page).toHaveURL(/\/account\/profile$/);
  unavailable = false;
  await page.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await expect(page.getByRole('definition').filter({ hasText: 'retry@example.test' })).toBeVisible();
});
