import { test, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = () => JSON.parse(readFileSync('.tmp/e2e-accounts.json', 'utf8'));
async function login(page: Page, role: string, next?: string) {
  await page.goto('/login' + (next ? `?next=${encodeURIComponent(next)}` : ''));
  const account = fixture().accounts[role];
  await page.getByLabel('Email', { exact: true }).fill(account.email); await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  for (let attempt = 0; attempt < 5; attempt++) {
    const responsePromise = page.waitForResponse(r => r.url().endsWith('/auth/login'));
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click(); const response = await responsePromise;
    if (response.status() !== 429) { expect(response.ok()).toBeTruthy(); break; }
    await page.waitForTimeout((Number(response.headers()['retry-after']) || 5) * 1000);
  }
  await expect(page).not.toHaveURL(/\/login/);
}
async function spaVisit(page: Page, path: string) { await page.evaluate(path => { history.pushState({}, '', path); dispatchEvent(new PopStateEvent('popstate')); }, path); }
test('anonymous private deep link preserves next; public catalog is accessible', async ({ page }) => {
  await page.goto('/events'); await expect(page.getByRole('heading', { name: 'Khám phá sự kiện' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/public.png', fullPage: true });
  await page.goto('/account/tickets'); await expect(page).toHaveURL(/\/login\?next=%2Faccount%2Ftickets/);
  await page.goto('/admin'); await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  await page.goto('/gate'); await expect(page).toHaveURL(/\/login\?next=%2Fgate/);
});
test('USER sees account pages and 403 on admin and gate; reload loses credentials', async ({ page }) => {
  await login(page, 'USER', '/account/profile'); await expect(page).toHaveURL(/\/account\/profile$/);
  await page.screenshot({ path: 'docs/screenshots/user.png', fullPage: true });
  for (const route of ['/admin', '/admin/events/new', '/gate']) { await spaVisit(page, route); await expect(page.getByRole('heading', { name: '403', exact: true })).toBeVisible(); await expect(page).toHaveURL(new RegExp(route + '$')); }
  expect(await page.evaluate(() => [localStorage.getItem('tr_access_token'), sessionStorage.getItem('tr_refresh_token')])).toEqual([null, null]);
  await page.reload(); await expect(page).toHaveURL(/\/login\?next=/);
});
test('STAFF lands at gate and cannot open buyer or admin pages', async ({ page }) => {
  await login(page, 'STAFF', '/account/orders'); await expect(page).toHaveURL(/\/gate$/); await expect(page.getByRole('heading', { name: 'Soát vé tại cổng' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/staff.png', fullPage: true });
  for (const route of ['/admin', '/admin/operations', '/account/tickets']) { await spaVisit(page, route); await expect(page.getByRole('heading', { name: '403', exact: true })).toBeVisible(); }
});
test('ADMIN lands at admin, uses operations/results and view as customer without role switching', async ({ page }) => {
  await login(page, 'ADMIN', '/events'); await expect(page).toHaveURL(/\/admin$/); await expect(page.getByRole('heading', { name: 'Quản trị TicketRush' })).toBeVisible();
  await page.screenshot({ path: 'docs/screenshots/admin.png', fullPage: true });
  await page.getByRole('link', { name: 'Operations', exact: true }).click(); await expect(page.getByRole('heading', { name: 'System Health' })).toBeVisible();
  await page.getByRole('link', { name: 'Results', exact: true }).click(); await expect(page.getByRole('heading', { name: 'Results · Performance evidence' })).toBeVisible();
  const href = await page.getByRole('link', { name: /k6 metrics/ }).getAttribute('href'); expect((await page.request.get(href!)).ok()).toBeTruthy();
  await page.getByRole('link', { name: 'View as customer' }).click(); await expect(page).toHaveURL(/\/events$/);
  await spaVisit(page, '/gate'); await expect(page.getByRole('heading', { name: '403', exact: true })).toBeVisible();
});
test('real purchase: login, queue polling, zone, reserve, pay, ticket QR', async ({ page }) => {
  const { eventId } = fixture(); const calls: string[] = []; page.on('request', r => { if (r.url().includes('/api/')) calls.push(r.method() + ' ' + new URL(r.url()).pathname); });
  await login(page, 'USER', `/events/${eventId}/queue`); await expect(page).toHaveURL(new RegExp(`/events/${eventId}/select$`));
  await page.getByRole('button', { name: 'Chọn E2E Standard', exact: true }).click(); await page.getByLabel('Số lượng', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Giữ vé', exact: true }).click(); await expect(page).toHaveURL(/\/checkout\//); await expect(page.getByRole('timer')).toContainText('Thời gian giữ vé');
  const orderRequest = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/v1/orders'));
  await page.getByRole('button', { name: 'Tạo đơn và thanh toán' }).click(); expect((await orderRequest).headers()['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
  await expect(page).toHaveURL(/\/orders\//); await expect(page.getByRole('status')).toHaveText('PAID', { timeout: 30000 });
  await expect(page.getByRole('img', { name: /^QR vé/ })).toHaveCount(2);
  expect(calls).toContain(`POST /api/v1/events/${eventId}/waiting-room/join`); expect(calls).toContain(`GET /api/v1/events/${eventId}/waiting-room/status`);
  await page.screenshot({ path: 'docs/screenshots/purchase.png', fullPage: true });
});
