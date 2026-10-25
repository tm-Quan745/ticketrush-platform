import {test,expect,type Page} from '@playwright/test';
import {readFileSync,writeFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
const fixture=()=>JSON.parse(readFileSync('.tmp/e2e-accounts.json','utf8'));
async function spa(page:Page,path:string){await page.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);}
async function login(page:Page,role:string){await page.goto('/login');await page.getByLabel('Email',{exact:true}).fill(fixture().accounts[role].email);await page.getByLabel('Mật khẩu',{exact:true}).fill(fixture().accounts[role].password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).not.toHaveURL(/\/login/);}
test('USER wallet QR and snapshot -> STAFF USED -> second scan refused -> ADMIN refund refused',async({browser})=>{
 const buyer=await browser.newContext(),staff=await browser.newContext(),admin=await browser.newContext();
 try{
 const p=await buyer.newPage();await login(p,'USER');await spa(p,`/events/${fixture().seatEventId}/queue`);await expect(p).toHaveURL(/\/select$/);await p.getByRole('button',{name:'Chọn Stand A',exact:true}).click();await p.getByRole('button',{name:'Tự chọn ghế liền nhau'}).click();await expect(p.locator('[data-seat-id][aria-pressed=true]')).toHaveCount(2);await p.getByRole('button',{name:'Giữ vé',exact:true}).click();await expect(p).toHaveURL(/\/checkout\//);
 const issued=p.waitForResponse(r=>/\/orders\/[^/]+\/tickets$/.test(r.url())&&r.ok());await p.getByRole('button',{name:'Tạo đơn và thanh toán'}).click();await expect(p.getByRole('status')).toHaveText('Đã thanh toán',{timeout:30000});const tickets=await(await issued).json();const orderId=new URL(p.url()).pathname.split('/').pop()!;
 await spa(p,'/account/tickets');await expect(p.getByRole('img',{name:`QR vé ${tickets[0].ticketCode}`,exact:true})).toBeVisible();await expect(p.getByTestId('ticket-seat').first()).toContainText('Stand A');await expect(p.getByTestId('ticket-seat').first()).toContainText('Hàng');
 const g=await staff.newPage();await login(g,'STAFF');await g.getByLabel('Mã vé',{exact:true}).fill(tickets[0].ticketCode);await g.getByRole('button',{name:'Ghi nhận vào cổng',exact:true}).click();await expect(g.getByRole('status')).toContainText('Đã ghi nhận vào cổng');await expect(g.getByRole('status')).toContainText('Stand A');await expect(g.getByRole('status')).toContainText('Đã vào cổng lúc');
 const second=g.waitForResponse(r=>r.url().endsWith('/gate/tickets/check-in'));await g.getByRole('button',{name:'Ghi nhận vào cổng',exact:true}).click();expect((await second).status()).toBe(409);await expect(g.getByRole('status')).toContainText('Vé đã được sử dụng');
 const a=await admin.newPage();await login(a,'ADMIN');await spa(a,'/admin/orders');a.on('dialog',dialog=>dialog.accept());const refund=a.waitForResponse(r=>r.url().endsWith(`/orders/${orderId}/refund`));await a.locator(`[data-order-id="${orderId}"]`).getByRole('button',{name:'Hoàn tiền',exact:true}).click();expect((await refund).status()).toBe(409);await expect(a.getByRole('alert')).toHaveText('Không thể hoàn tiền vì có vé đã được sử dụng.');
 await p.getByRole('button',{name:'Cập nhật ví vé',exact:true}).click();await expect(p.getByText('● Đã sử dụng',{exact:true}).first()).toBeVisible();
 }finally{await buyer.close();await staff.close();await admin.close();}
});
test('ADMIN creates stadium event, maps tiers, publishes and blocks versioned seat visible to USER',async({browser})=>{
 const admin=await browser.newContext(),buyer=await browser.newContext();
 try{
 const a=await admin.newPage();await login(a,'ADMIN');await spa(a,'/admin/events/new');await a.getByLabel('Tên sự kiện',{exact:true}).fill(`E2E admin stadium ${randomUUID()}`);await a.getByLabel('Mẫu sân vận động',{exact:true}).selectOption({label:'TicketRush Stadium'});
 await expect(a.getByLabel('Tên hạng vé',{exact:true})).toHaveCount(5);
 const created=a.waitForResponse(r=>r.url().endsWith('/admin/events')&&r.request().method()==='POST');await a.getByRole('button',{name:'Tạo bản nháp',exact:true}).click();const event=await(await created).json();
 const journal=fixture();journal.eventIds.push(event.id);writeFileSync('.tmp/e2e-accounts.json',JSON.stringify(journal));
 await expect(a).toHaveURL(new RegExp(`/admin/events/${event.id}$`));await a.getByRole('button',{name:'Hạng vé',exact:true}).click();await expect(a.getByRole('heading',{name:'Ánh xạ khu vực → hạng vé'})).toBeVisible();await a.getByRole('button',{name:'Lưu ánh xạ',exact:true}).click();
 await a.getByRole('button',{name:'Thông tin',exact:true}).click();await a.getByRole('button',{name:'Xuất bản',exact:true}).click();await expect(a.getByText('Đã xuất bản',{exact:true})).toBeVisible();
 await a.getByRole('button',{name:'Quản lý ghế',exact:true}).click();await a.getByLabel('Khu vực',{exact:true}).selectOption({label:'Stand A'});const seat=a.locator('[data-admin-seat][data-status="AVAILABLE"]').first();const id=await seat.getAttribute('data-admin-seat');await seat.click();await a.getByLabel('Lý do',{exact:true}).fill('E2E blocked seat');const blocked=a.waitForResponse(r=>r.url().endsWith('/seats/block'));await a.getByRole('button',{name:'Chặn ghế',exact:true}).click();expect((await blocked).ok()).toBe(true);await expect(a.locator(`[data-admin-seat="${id}"]`)).toHaveAttribute('data-status','BLOCKED');
 const p=await buyer.newPage();await login(p,'USER');await spa(p,`/events/${event.id}/queue`);await expect(p).toHaveURL(/\/select$/);await p.getByRole('button',{name:'Chọn Stand A',exact:true}).click();await expect(p.locator(`[data-seat-id="${id}"]`)).toHaveAttribute('data-state','blocked');
 }finally{await admin.close();await buyer.close();}
});
