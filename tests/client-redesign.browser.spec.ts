import {test,expect,type Page} from '@playwright/test';

for (const theme of ['dark', 'light']) test(`auth palette and breadcrumbs in ${theme} mode`, async ({ page }) => {
 await page.addInitScript(theme => localStorage.setItem('ticketrush_theme', theme), theme);
 await page.route('**/api/v1/**', route => route.fulfill({ status: route.request().url().endsWith('/auth/refresh') ? 401 : 200, json: {} }));
 await page.goto('/login');
 const crumbs = page.getByRole('navigation', { name: 'Đường dẫn trang' });
 await expect(crumbs.locator('[aria-current="page"]')).toHaveText('Đăng nhập');
 await expect(page.locator('.auth-submit')).toHaveCSS('background-color', 'rgb(100, 80, 181)');
 await expect(page.locator('.auth-submit')).toHaveCSS('color', 'rgb(255, 255, 255)');
 await page.locator('#auth-email').fill('buyer@example.test');
 await page.locator('#auth-password').fill('sample-password');
 await page.screenshot({ path: `test-results/auth-${theme}-desktop.png`, fullPage: true });
 await page.setViewportSize({ width: 390, height: 844 });
 await page.screenshot({ path: `test-results/auth-${theme}-mobile.png`, fullPage: true });
 expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
 await page.getByRole('navigation', { name: 'Tài khoản', exact: true }).getByRole('link', { name: 'Đăng ký', exact: true }).click();
 await expect(crumbs.locator('[aria-current="page"]')).toHaveText('Đăng ký');
 await expect(page.getByRole('heading', { name: 'Tạo tài khoản của bạn' })).toBeVisible();
 await crumbs.getByRole('link', { name: 'Trang chủ' }).click();
 await expect(page).toHaveURL(/\/$/);
});

async function fixtures(page:Page,theme='dark') {
 await page.addInitScript(theme=>localStorage.setItem('ticketrush_theme',theme),theme);
 const requests:URL[]=[];
 const events=Array.from({length:6},(_,i)=>({id:`event-${i}`,title:['Đêm nhạc Những miền ký ức','Live concert — Chạm vào thanh âm','Một tối cùng Jazz'][i%3],description:'Một cuộc hẹn dành cho những người yêu âm nhạc.',venueName:'Nhà hát Thành phố',venueAddress:'Quận 1, TP. Hồ Chí Minh',imageUrl:'',startTime:'2030-12-20T12:00:00Z',endTime:'2030-12-20T15:00:00Z',saleStartTime:'2020-01-01T00:00:00Z',saleEndTime:'2030-12-20T11:00:00Z',status:'PUBLISHED',createdAt:'2026-01-01T00:00:00Z',updatedAt:'2026-01-01T00:00:00Z'}));
 const tickets=Array.from({length:47},(_,i)=>({id:`ticket-${i}`,orderId:`order-${i}`,eventId:`event-${i%3}`,tierId:'tier',ticketCode:`ticket-code-${i}`,status:i%3===0?'USED':i%3===1?'VALID':'CANCELLED',issuedAt:'2026-10-25T00:00:00Z',eventTitle:events[i%3].title,tierName:i%2?'VIP':'Standard',venue:'Nhà hát Thành phố',seat:{sectionName:'Khán đài A',rowLabel:'A',number:i+1}}));
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());requests.push(url);const path=url.pathname;
  if(path.endsWith('/auth/refresh'))return route.fulfill({json:{accessToken:'fixture'}});
  if(path.endsWith('/auth/me'))return route.fulfill({json:{id:'buyer',email:'buyer@example.test',roles:['USER']}});
  if(path.endsWith('/orders/me/tickets')){
   const page=Number(url.searchParams.get('page')||0),size=Number(url.searchParams.get('size')||9),status=url.searchParams.get('status'),query=(url.searchParams.get('query')||'').toLowerCase();
   const filtered=tickets.filter(ticket=>(!status||status===ticket.status)&&(!query||ticket.tierName.toLowerCase().includes(query)||ticket.eventTitle.toLowerCase().includes(query)));
   return route.fulfill({json:{content:filtered.slice(page*size,(page+1)*size),page,size,totalPages:Math.ceil(filtered.length/size),totalElements:filtered.length}});
  }
  if(path==='/api/v1/events')return route.fulfill({json:{content:events,page:0,size:12,totalPages:1,totalElements:6}});
  if(path.match(/\/events\/event-\d$/))return route.fulfill({json:{event:events[0],tiers:[]}});
  return route.fulfill({json:{content:[],page:0,size:9,totalPages:0,totalElements:0}});
 });
 return requests;
}

for(const theme of ['dark','light'])test(`catalog and mobile navigation in ${theme} mode`,async({page})=>{
 await fixtures(page,theme);await page.goto('/events');
 await expect(page.getByRole('heading',{name:/Có những khoảnh khắc/})).toBeVisible();
 await expect(page.getByRole('navigation',{name:'Đường dẫn trang'}).locator('[aria-current="page"]')).toHaveText('Sự kiện');
 await expect(page.getByRole('navigation',{name:'Điều hướng chính'}).getByRole('link',{name:'Khám phá'})).toHaveAttribute('aria-current','page');
 await page.screenshot({path:`test-results/client-events-${theme}-desktop.png`});
 await page.getByLabel('Tìm kiếm sự kiện',{exact:true}).fill('Jazz');
 const searched=page.waitForRequest(request=>request.url().includes('/events?')&&new URL(request.url()).searchParams.get('keyword')==='Jazz');
 await page.getByRole('button',{name:'Tìm kiếm',exact:true}).click();await searched;
 await expect(page.getByRole('heading',{name:'Kết quả cho “Jazz”'})).toBeVisible();
 await page.setViewportSize({width:390,height:844});
 await expect(page.locator('#site-navigation')).not.toBeVisible();
 await page.getByRole('button',{name:'Mở menu',exact:true}).click();
 await expect(page.locator('#site-navigation')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Mở menu',exact:true})).toBeFocused();
 await page.screenshot({path:`test-results/client-events-${theme}-mobile.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Mở menu',exact:true}).click();
 await page.locator('#site-navigation').getByRole('link',{name:'Ví vé',exact:true}).click();
 await expect(page).toHaveURL(/\/account\/tickets$/);await expect(page.locator('#site-navigation')).not.toBeVisible();
 await expect(page.getByTestId('wallet-ticket')).toHaveCount(9);
 await page.screenshot({path:`test-results/client-wallet-${theme}-mobile.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('wallet requests bounded pages, filters across all tickets and resets pagination',async({page})=>{
 const requests=await fixtures(page);await page.goto('/account/tickets');
 await expect(page.getByTestId('wallet-ticket')).toHaveCount(9);
 await expect(page.getByRole('navigation',{name:'Phân trang vé'})).toContainText('47 vé');
 await page.screenshot({path:'test-results/client-wallet-desktop.png'});
 await page.getByRole('navigation',{name:'Phân trang vé'}).getByRole('button',{name:'Trang sau',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'Phân trang vé'})).toContainText('Trang 2 / 6');
 expect(requests.some(url=>url.pathname.endsWith('/orders/me/tickets')&&url.searchParams.get('page')==='1')).toBe(true);
 await page.getByLabel('Trạng thái',{exact:true}).selectOption('VALID');
 await expect(page.getByRole('navigation',{name:'Phân trang vé'})).toContainText('Trang 1 / 2');
 await expect(page.getByTestId('wallet-ticket')).toHaveCount(9);
 await page.getByLabel('Mỗi trang',{exact:true}).selectOption('18');
 await expect(page.getByTestId('wallet-ticket')).toHaveCount(16);
 await page.getByLabel('Tìm vé',{exact:true}).fill('no-match');await page.getByRole('button',{name:'Tìm kiếm',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Không tìm thấy kết quả phù hợp'})).toBeVisible();
 await page.getByRole('button',{name:'Xóa bộ lọc',exact:true}).click();await expect(page.getByTestId('wallet-ticket')).toHaveCount(18);
 expect(requests.filter(url=>/^\/api\/v1\/orders\/[^/]+\/tickets$/.test(url.pathname)&&!url.pathname.endsWith('/me/tickets'))).toHaveLength(0);
 await page.getByRole('navigation',{name:'Danh mục ví vé'}).getByRole('button',{name:'Đơn hàng',exact:true}).click();
 await expect(page.getByRole('navigation',{name:'Phân trang đơn hàng'})).toBeVisible();
});

test('event detail banner is readable on desktop and mobile',async({page})=>{
 await fixtures(page,'light');await page.goto('/events/event-0');
 await expect(page.locator('.event-banner h1')).toHaveText('Đêm nhạc Những miền ký ức');
 await page.screenshot({path:'test-results/client-event-detail-desktop.png'});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'test-results/client-event-detail-mobile.png'});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
