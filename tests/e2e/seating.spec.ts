import {test,expect,type Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const fixture=()=>JSON.parse(readFileSync('.tmp/e2e-accounts.json','utf8'));
async function spa(page:Page,path:string){await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);}
async function login(page:Page,role='USER'){
 await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(fixture().accounts[role].email);await page.getByLabel('Mật khẩu',{exact:true}).fill(fixture().accounts[role].password);
 await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).toHaveURL(/\/events$/);
}
async function select(page:Page){
 await spa(page,`/events/${fixture().seatEventId}/queue`);await expect(page).toHaveURL(/\/select$/);
 await page.getByRole('button',{name:'Chọn Stand A',exact:true}).click();await expect(page.locator('[data-seat-id][data-state="available"]').first()).toBeVisible();
}
async function pay(page:Page){
 await page.getByRole('button',{name:'Giữ vé',exact:true}).click();await expect(page).toHaveURL(/\/checkout\//);
 await page.screenshot({path:'.tmp/e2e-screenshots/checkout.png',fullPage:true});
 await page.getByRole('button',{name:'Tạo đơn và thanh toán'}).click();await expect(page.getByRole('status')).toHaveText('Đã thanh toán',{timeout:30000});
 await expect(page.getByTestId('ticket-seat').first()).toContainText('Stand A');await expect(page.getByTestId('ticket-seat').first()).toContainText('Hàng');
 await expect(page.getByRole('img',{name:/^QR vé/}).first()).toBeVisible();
}
test('seated manual purchase from catalog uses geometry, compact ETag status and ticket snapshot',async({page})=>{
 await login(page);await page.getByRole('textbox',{name:'Tìm sự kiện'}).fill('E2E reserved seating');await page.getByRole('button',{name:'Tìm sự kiện',exact:true}).click();await expect(page.getByRole('heading',{level:3})).toHaveCount(1);await page.screenshot({path:'.tmp/e2e-screenshots/user.png',fullPage:true});await page.getByRole('button',{name:'Xem sự kiện',exact:true}).click();await expect(page.getByRole('heading',{level:1})).toContainText('E2E reserved seating');
 await page.getByRole('link',{name:/Đặt vé/}).first().click();await expect(page).toHaveURL(/\/select$/);await page.getByRole('button',{name:'Chọn Stand A',exact:true}).click();
 const seatId=await page.locator('[data-seat-id][data-state="available"]').first().getAttribute('data-seat-id');const seat=page.locator(`[data-seat-id="${seatId}"]`);await seat.click();await expect(seat).toHaveAttribute('aria-pressed','true');
 const unchanged=page.waitForResponse(r=>r.url().endsWith('/seats')&&r.status()===304);await unchanged;
 await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:'.tmp/e2e-screenshots/seat-map.png',fullPage:true});await pay(page);
 const paidPath=new URL(page.url()).pathname;await page.getByRole('link',{name:'Ví vé',exact:true}).click();await expect(page).toHaveURL(/\/account\/tickets$/);await expect(page.locator(`a[href="${paidPath}"]`)).toBeVisible();await page.screenshot({path:'.tmp/e2e-screenshots/wallet.png',fullPage:true});
});
test('Auto-Pick replaces selection atomically and buys adjacent server suggestions',async({page})=>{
 await login(page);await select(page);await page.locator('[data-seat-id][data-state="available"]').first().click();
 const suggested=page.waitForResponse(r=>r.url().endsWith('/seats/suggest'));
 await page.getByRole('button',{name:'Tự chọn ghế liền nhau'}).click();const data=await(await suggested).json();expect(data.seatIds).toHaveLength(2);
 await expect(page.locator('[data-seat-id][aria-pressed="true"]')).toHaveCount(2);
 expect(await page.locator('[data-seat-id][aria-pressed="true"]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-seat-id')).sort())).toEqual([...data.seatIds].sort());
 await pay(page);await expect(page.getByTestId('ticket-seat')).toHaveCount(2);
});
test('mobile 375px selects two adjacent seats and holds without page overflow',async({page})=>{
 await page.setViewportSize({width:375,height:812});await login(page);await select(page);
 const suggestion=page.waitForResponse(r=>r.url().endsWith('/seats/suggest'));
 await page.getByRole('button',{name:'Tự chọn ghế liền nhau'}).click();
 const {seatIds}=await(await suggestion).json();expect(seatIds).toHaveLength(2);
 // Exercise manual selection too: toggle the suggested pair off and on.
 for(const id of seatIds){await page.locator(`[data-seat-id="${id}"]`).click();}
 for(const id of seatIds){await page.locator(`[data-seat-id="${id}"]`).click();}
 await expect(page.locator('[data-seat-id][aria-pressed="true"]')).toHaveCount(2);
 await expect(page.locator('[data-aisle="true"]').first()).toBeAttached();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Giữ vé',exact:true}).click();await expect(page).toHaveURL(/\/checkout\//);
 await expect(page.getByRole('button',{name:'Tạo đơn và thanh toán'})).toBeEnabled();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 const holdId=new URL(page.url()).pathname.split('/').pop();
 const auth=await page.request.post('/api/v1/auth/login',{data:fixture().accounts.USER});expect(auth.ok()).toBe(true);
 const cancelled=await page.request.delete(`/api/v1/reservations/${holdId}`,{headers:{Authorization:`Bearer ${(await auth.json()).accessToken}`}});expect(cancelled.ok()).toBe(true);
});
test('two browser contexts compete for the same seat; loser sees 409 and recovery',async({browser})=>{
 const a=await browser.newContext(),b=await browser.newContext();const p=await a.newPage(),q=await b.newPage();
 try{await login(p);await login(q,'USER2');await select(p);await select(q);
 const target=await p.locator('[data-seat-id][data-state="available"]').first().getAttribute('data-seat-id');
 await p.locator(`[data-seat-id="${target}"]`).click();await q.locator(`[data-seat-id="${target}"]`).click();
 const rp=p.waitForResponse(r=>r.url().endsWith('/reservations')&&r.request().method()==='POST'),rq=q.waitForResponse(r=>r.url().endsWith('/reservations')&&r.request().method()==='POST');
 await Promise.all([p.getByRole('button',{name:'Giữ vé',exact:true}).click(),q.getByRole('button',{name:'Giữ vé',exact:true}).click()]);const results=await Promise.all([rp,rq]);expect(results.map(r=>r.status()).sort()).toEqual([201,409]);
 const loser=results[0].status()===409?p:q;await expect(loser.getByRole('alert')).toContainText('Ghế vừa được người khác giữ');await expect(loser.locator('[data-seat-id][aria-pressed="true"]')).toHaveCount(0);await expect(loser.getByTestId('seat-notice')).toHaveText('Đã cập nhật trạng thái ghế');await expect(loser.locator(`[data-seat-id="${target}"]`)).toHaveAttribute('data-state','unavailable');
 const winner=results[0].status()===201?p:q;await winner.getByRole('button',{name:'Tạo đơn và thanh toán'}).click();await expect(winner.getByRole('status')).toHaveText('Đã thanh toán',{timeout:30000});
 }finally{await a.close();await b.close();}
});
test('expired real hold uses server expiry and disables checkout without a fake reset',async({page})=>{
 await login(page,'USER2');await select(page);await page.locator('[data-seat-id][data-state="available"]').first().click();await page.getByRole('button',{name:'Giữ vé',exact:true}).click();await expect(page).toHaveURL(/\/checkout\//);
 const id=new URL(page.url()).pathname.split('/').pop()!;expect(id).toMatch(/^[0-9a-f-]{36}$/);
 await spa(page,`/events/${fixture().seatEventId}/select`);await page.getByRole('button',{name:'Chọn Stand A',exact:true}).click();await expect(page.locator('[data-seat-id][data-state="mine"]')).toHaveCount(1);await page.getByRole('link',{name:'Tiếp tục thanh toán lượt giữ vé'}).click();await expect(page).toHaveURL(new RegExp(`/checkout/${id}$`));
 // Local fixture time compression only; API, transaction and UI remain real.
 execFileSync('docker',['exec',process.env.E2E_DB_CONTAINER!,'psql','-U',process.env.E2E_DB_USER||'ticketrush','-d',process.env.E2E_DB_NAME||'ticketrush','-v','ON_ERROR_STOP=1','-c',`BEGIN; UPDATE reservations SET expires_at=now()+interval '2 seconds' WHERE id='${id}'; UPDATE event_seats SET expires_at=(SELECT expires_at FROM reservations WHERE id='${id}') WHERE reservation_id='${id}'; COMMIT;`],{stdio:'pipe',windowsHide:true});
 await spa(page,'/account/profile');await expect(page.getByRole('heading',{name:'Hồ sơ'})).toBeVisible();await spa(page,`/checkout/${id}`);
 await expect(page.getByRole('timer')).toHaveText('Thời gian giữ vé: 0:00',{timeout:10000});await expect(page.getByRole('button',{name:'Tạo đơn và thanh toán'})).toBeDisabled();await expect(page.getByText('Lượt giữ vé đã hết hạn. Vui lòng chọn lại.')).toBeVisible();
});
