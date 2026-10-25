import {chromium,expect,type Page} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.REVIEW_BASE_URL||'http://127.0.0.1:31900';
const db=process.env.REVIEW_DB_CONTAINER||'ticketrush-visual-review-m3b-postgres-1';
if(!db.startsWith('ticketrush-visual-review-')||!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Dedicated review stack required');
const request=async(path:string,body?:unknown)=>{const r=await fetch(base+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});if(!r.ok)throw new Error(`${path}: ${r.status}`);return r.json();};
const events=await request('/events');if(events.totalElements!==1||!events.content[0].description.includes('[dev-seated-v1]'))throw new Error('Exactly one clean dev-seated event required');
const event=events.content[0];const accounts:Record<string,{email:string;password:string}>={};
for(const role of ['USER','STAFF','ADMIN']){
 const account={email:`review-${role.toLowerCase()}-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};const user=await request('/auth/register',account);
 if(!/^[0-9a-f-]{36}$/.test(user.id))throw new Error('Invalid fixture UUID');
 if(role!=='USER')execFileSync('docker',['exec',db,'psql','-U','ticketrush','-d','ticketrush','-v','ON_ERROR_STOP=1','-c',`BEGIN;DELETE FROM user_roles WHERE user_id='${user.id}';INSERT INTO user_roles(user_id,role_id) SELECT '${user.id}',id FROM roles WHERE name='${role}';COMMIT;`],{stdio:'pipe',windowsHide:true});accounts[role]=account;
}
const folder='docs/screenshots/m3b';await mkdir(folder,{recursive:true});const browser=await chromium.launch();
const spa=async(p:Page,path:string)=>p.evaluate(path=>{history.pushState({},'',path);dispatchEvent(new PopStateEvent('popstate'));},path);
async function login(p:Page,role:string){await p.goto(base+'/login');await p.getByLabel('Email',{exact:true}).fill(accounts[role].email);await p.getByLabel('Mật khẩu',{exact:true}).fill(accounts[role].password);await p.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(p).not.toHaveURL(/\/login/);}
async function capture(p:Page,name:string,fullPage=true){await p.evaluate(()=>window.scrollTo(0,0));await p.screenshot({path:`${folder}/${name}.png`,fullPage,animations:'disabled'});}
try{
 const user=await browser.newPage({viewport:{width:1440,height:1000}});await user.goto(base+'/events');await expect(user.getByRole('heading',{level:3})).toHaveCount(1);await capture(user,'public');
 await login(user,'USER');await capture(user,'user');await spa(user,`/events/${event.id}/queue`);await expect(user).toHaveURL(/\/select$/);await user.getByRole('button',{name:'Chọn Stand A',exact:true}).click();await expect(user.locator('[data-seat-id]').first()).toBeVisible();await capture(user,'seat-map');
 await user.getByRole('button',{name:'Tự chọn ghế liền nhau'}).click();await expect(user.locator('[data-seat-id][aria-pressed=true]')).toHaveCount(2);await user.getByRole('button',{name:'Giữ vé',exact:true}).click();await expect(user).toHaveURL(/\/checkout\//);await expect(user.getByRole('button',{name:'Tạo đơn và thanh toán'})).toBeEnabled();await capture(user,'checkout');
 const issued=user.waitForResponse(r=>/\/orders\/[^/]+\/tickets$/.test(r.url())&&r.ok());await user.getByRole('button',{name:'Tạo đơn và thanh toán'}).click();await expect(user.getByRole('status')).toHaveText('Đã thanh toán',{timeout:30000});const tickets=await(await issued).json();await spa(user,'/account/tickets');await expect(user.getByRole('img',{name:/QR vé/})).toHaveCount(2);await capture(user,'wallet');
 const staff=await browser.newPage({viewport:{width:1440,height:1000}});await login(staff,'STAFF');await staff.getByLabel('Mã vé',{exact:true}).fill(tickets[0].ticketCode);await staff.getByRole('button',{name:'Ghi nhận vào cổng',exact:true}).click();await expect(staff.getByRole('status')).toContainText('Đã ghi nhận vào cổng');await capture(staff,'staff-gate');
 const admin=await browser.newPage({viewport:{width:1440,height:1000}});await login(admin,'ADMIN');await expect(admin.getByRole('link',{name:event.title,exact:true})).toBeVisible();await capture(admin,'admin-dashboard');await spa(admin,`/admin/events/${event.id}`);await expect(admin.getByRole('heading',{name:event.title})).toBeVisible();await capture(admin,'admin-event');
 await admin.getByRole('button',{name:'Quản lý ghế',exact:true}).click();await admin.getByLabel('Khu vực',{exact:true}).selectOption({label:'Stand A'});const seat=admin.locator('[data-admin-seat][data-status=AVAILABLE]').first();const seatId=await seat.getAttribute('data-admin-seat');await seat.click();await admin.getByLabel('Lý do',{exact:true}).fill('Visual review');await admin.getByRole('button',{name:'Chặn ghế',exact:true}).click();await expect(admin.locator(`[data-admin-seat="${seatId}"]`)).toHaveAttribute('data-status','BLOCKED');await capture(admin,'admin-seat-management');
 await spa(admin,'/admin/operations');await expect(admin.getByText('UP',{exact:true})).toBeVisible();await capture(admin,'operations');
 await writeFile(`${folder}/provenance.json`,JSON.stringify({project:db.replace('-postgres-1',''),seed:'[dev-seated-v1]',eventId:event.id,viewport:{width:1440,height:1000},accounts:'Random local review accounts; no credentials retained',payment:'Existing mock gateway signed webhook',sourceCommit:process.env.REVIEW_COMMIT||'working-tree'},null,2));
}finally{await browser.close();}
