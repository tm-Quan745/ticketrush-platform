import { test, expect } from '@playwright/test';

const googleScript = `window.google = { accounts: { id: {
  initialize(options) { this.callback = options.callback; },
  renderButton(element) {
    const button = document.createElement('button');
    button.textContent = 'Continue with Google';
    button.onclick = () => this.callback({ credential: 'provider-credential' });
    element.appendChild(button);
  }
} } };`;

test.beforeEach(async ({ page }) => {
  await page.route('**/api/v1/auth/google/config', route => route.fulfill({json:{clientId:'test-client'}}));
  await page.route('https://accounts.google.com/gsi/client', route => route.fulfill({contentType:'text/javascript',body:googleScript}));
});

test('Google button completes application login and routes to the account', async ({ page }) => {
  await page.route('**/api/v1/auth/google', route => {
    expect(route.request().postDataJSON()).toEqual({credential:'provider-credential'});
    return route.fulfill({json:{accessToken:'app-access',refreshToken:'app-refresh'}});
  });
  await page.route('**/api/v1/auth/me', route => {
    expect(route.request().headers().authorization).toBe('Bearer app-access');
    return route.fulfill({json:{id:'u',email:'person@gmail.com',roles:['USER']}});
  });
  await page.goto('/login?next=%2Faccount%2Fprofile');
  await page.getByRole('button', {name:'Continue with Google'}).click();
  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(page.getByText('person@gmail.com', {exact:true})).toBeVisible();
});

test('existing email conflict explains password login without navigating', async ({ page }) => {
  await page.route('**/api/v1/auth/google', route => route.fulfill({status:409,json:{code:'GOOGLE_ACCOUNT_CONFLICT'}}));
  await page.goto('/login');
  await page.getByRole('button', {name:'Continue with Google'}).click();
  await expect(page.getByText('Email này đã có tài khoản. Vui lòng đăng nhập bằng mật khẩu đã đăng ký.')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);
});

test('unconfigured Google login stays visible but disabled with an explanation', async ({ page }) => {
  await page.route('**/api/v1/auth/google/config', route => route.fulfill({json:{clientId:''}}));
  await page.goto('/login');
  await expect(page.locator('input[type="password"]')).toBeVisible();
  await expect(page.getByRole('button', {name:'Đăng nhập bằng Google'})).toBeVisible();
  await expect(page.getByRole('button', {name:'Đăng nhập bằng Google'})).toBeDisabled();
  await expect(page.getByRole('status')).toContainText('Đăng nhập Google chưa được bật');
});

test('Google button stays visible while configuration loads', async ({ page }) => {
  let release!: () => void;
  const waiting = new Promise<void>(resolve => { release = resolve; });
  await page.route('**/api/v1/auth/google/config', async route => {
    await waiting; await route.fulfill({json:{clientId:'test-client'}});
  });
  await page.goto('/login');
  await expect(page.getByRole('button', {name:'Đăng nhập bằng Google'})).toBeVisible();
  await expect(page.getByRole('button', {name:'Đăng nhập bằng Google'})).toBeDisabled();
  release();
  await expect(page.getByRole('button', {name:'Continue with Google'})).toBeVisible();
});

test('configuration API failure keeps Google visible and supports retry', async ({ page }) => {
  let fail = true;
  await page.route('**/api/v1/auth/google/config', route => fail
    ? route.fulfill({status:503,json:{message:'Unavailable'}})
    : route.fulfill({json:{clientId:'test-client'}}));
  await page.goto('/login');
  await expect(page.getByRole('button', {name:'Đăng nhập bằng Google'})).toBeDisabled();
  await expect(page.getByRole('button', {name:'Thử lại'})).toBeVisible();
  fail = false;
  await page.getByRole('button', {name:'Thử lại'}).click();
  await expect(page.getByRole('button', {name:'Continue with Google'})).toBeVisible();
});

test('Google script failure offers a working retry', async ({ page }) => {
  let fail = true;
  await page.route('https://accounts.google.com/gsi/client', route => fail ? route.abort() : route.fulfill({contentType:'text/javascript',body:googleScript}));
  await page.goto('/register');
  await expect(page.getByRole('button', {name:'Thử lại'})).toBeVisible();
  fail = false;
  await page.getByRole('button', {name:'Thử lại'}).click();
  await expect(page.getByRole('button', {name:'Continue with Google'})).toBeVisible();
});

for (const route of ['login', 'register']) {
  for (const theme of ['dark', 'light']) {
    for (const size of ['desktop', 'mobile']) {
      test(`${route} layout works in ${theme} mode on ${size}`, async ({ page }) => {
        await page.setViewportSize(size === 'mobile' ? {width:390,height:844} : {width:1440,height:1000});
        await page.addInitScript(value => localStorage.setItem('ticketrush_theme', value), theme);
        await page.route('**/api/v1/auth/google/config', route => route.fulfill({json:{clientId:''}}));
        await page.goto('/' + route);
        await expect(page.getByRole('banner')).toHaveCount(0);
        await expect(page.getByRole('contentinfo')).toHaveCount(0);
        await expect(page.getByRole('main')).toHaveClass(/auth-page/);
        await expect(page.getByRole('heading', {level:1})).toHaveText(route === 'register' ? 'Tạo tài khoản của bạn' : 'Đăng nhập');
        await expect(page.getByRole('button', {name:'Đăng nhập bằng Google'})).toBeVisible();
        await expect(page.getByRole('link', {name:'Về trang chính'})).toHaveCount(0);
        await expect(page.locator('button.auth-theme-toggle')).toBeVisible();
        await expect(page.locator('#auth-email')).toBeVisible();
        await expect(page.locator('.auth-submit')).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({path:`test-results/auth-${route}-${theme}-${size}.png`,fullPage:true});
      });
    }
  }
  test(`${route} email form submits credentials and supports password visibility`, async ({ page }) => {
    let registered = false;
    await page.route('**/api/v1/auth/register', async request => {
      registered = true;
      expect(request.request().postDataJSON()).toEqual({email:'person@example.com',password:'test-password-123'});
      await request.fulfill({status:201,json:{id:'u'}});
    });
    await page.route('**/api/v1/auth/login', async request => {
      expect(registered).toBe(route === 'register');
      expect(request.request().postDataJSON()).toEqual({email:'person@example.com',password:'test-password-123'});
      await request.fulfill({json:{accessToken:'a',refreshToken:'r'}});
    });
    await page.route('**/api/v1/auth/me', request => request.fulfill({json:{id:'u',email:'person@example.com',roles:['USER']}}));
    await page.route('**/api/v1/events**', request => request.fulfill({json:{content:[]}}));
    await page.goto('/' + route);
    await page.locator('#auth-email').fill('person@example.com');
    await page.locator('#auth-password').fill('test-password-123');
    await page.getByRole('button', {name:'Hiện mật khẩu'}).click();
    await expect(page.locator('#auth-password')).toHaveAttribute('type','text');
    await page.getByRole('button', {name:'Ẩn mật khẩu'}).click();
    await expect(page.locator('#auth-password')).toHaveAttribute('type','password');
    await page.locator('.auth-submit').click();
    await expect(page).toHaveURL(/\/events$/);
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.getByRole('contentinfo')).toBeVisible();
  });
}

for (const route of ['login', 'register']) {
  test(`${route} theme controls persist preference and brand link returns to events`, async ({ page }) => {
    await page.setViewportSize({width:390,height:844});
    await page.goto('/' + route);
    await page.evaluate(() => localStorage.setItem('ticketrush_theme', 'dark'));
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.locator('button.auth-theme-toggle').click();
    await expect(page.locator('html')).toHaveClass(/light/);
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/light/);
    await page.locator('button.auth-theme-toggle').click();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.route('**/api/v1/events**', request => request.fulfill({json:{content:[]}}));
    await page.getByRole('link', {name:'TicketRush', exact:true}).click();
    await expect(page).toHaveURL('/events');
    await expect(page.getByRole('banner')).toBeVisible();
    await expect(page.locator('html')).toHaveClass(/dark/);
  });
}
