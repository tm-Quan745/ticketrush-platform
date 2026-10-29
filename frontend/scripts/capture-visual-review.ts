import {chromium, expect} from '@playwright/test';
import {randomBytes,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';

// Dedicated disposable screenshot stack only; never the E2E/measurement database.
const base=process.env.REVIEW_BASE_URL || 'http://127.0.0.1:31900';
const db=process.env.REVIEW_DB_CONTAINER || 'ticketrush-visual-review-postgres-1';
if(!db.startsWith('ticketrush-visual-review-') || !['localhost','127.0.0.1'].includes(new URL(base).hostname))throw new Error('Dedicated local review stack required');
const api=async(path:string,body?:unknown,token?:string)=>{
 const response=await fetch(base+'/api/v1'+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},body:body===undefined?undefined:JSON.stringify(body)});
 if(!response.ok)throw new Error(`${path}: ${response.status}`);return response.json();
};
const events=await api('/events');
if(events.totalElements!==1 || !events.content[0].description.includes('[dev-seated-v1]'))throw new Error('Expected exactly one clean dev-seated event');
const event=events.content[0];
const account={email:`review-${randomUUID()}@example.test`,password:randomBytes(24).toString('base64url')};
await api('/auth/register',account);
await mkdir('../docs/screenshots/m3a-2',{recursive:true});
const browser=await chromium.launch();
const evidence:any[]=[];
try{
 for(const [name,width,height] of [['mobile',375,812],['desktop',1440,1000]] as const){
 const context=await browser.newContext({viewport:{width,height},isMobile:name==='mobile',hasTouch:name==='mobile'});const page=await context.newPage();
 await page.goto(base+'/events');await expect(page.getByRole('heading',{level:3})).toHaveCount(1);
 await page.screenshot({path:`../docs/screenshots/m3a-2/${name}-catalogue.png`,fullPage:true});
 await page.goto(base+'/login');await page.getByLabel('Email',{exact:true}).fill(account.email);await page.getByLabel('Mật khẩu',{exact:true}).fill(account.password);await page.getByRole('button',{name:'Đăng nhập',exact:true}).click();await expect(page).toHaveURL(/\/events$/);
 await page.evaluate(id=>{history.pushState({},'',`/events/${id}/queue`);dispatchEvent(new PopStateEvent('popstate'));},event.id);
 await expect(page).toHaveURL(/\/select$/);await page.getByRole('button',{name:'Chọn Stand A',exact:true}).click();
 await expect(page.locator('[data-aisle=true]').first()).toBeAttached();
 await page.screenshot({path:`../docs/screenshots/m3a-2/${name}-seat-map.png`,fullPage:true});
 await page.getByRole('button',{name:'Tự chọn ghế liền nhau'}).click();await expect(page.locator('[data-seat-id][aria-pressed=true]')).toHaveCount(2);
 await expect(page.getByRole('button',{name:'Giữ vé',exact:true})).toBeEnabled();await expect(page.getByRole('button',{name:'Giữ vé',exact:true})).toHaveCSS('opacity','1');
 await page.locator('.seat-scroll').evaluate(node=>{const aisle=node.querySelector('[data-aisle=true]') as HTMLElement;node.scrollLeft=aisle.offsetLeft-180;window.scrollTo(0,node.getBoundingClientRect().top+scrollY-150);});await page.screenshot({path:`../docs/screenshots/m3a-2/${name}-grid.png`});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.getByRole('button',{name:'Giữ vé',exact:true}).click();await expect(page).toHaveURL(/\/checkout\//);
 const pay=page.getByRole('button',{name:'Tạo đơn và thanh toán'});await expect(pay).toBeEnabled();await expect(page.getByRole('heading',{name:event.title})).toBeVisible();
 await expect(pay).toHaveCSS('color','rgb(255, 255, 255)');await expect(pay).toHaveCSS('background-color','rgb(67, 56, 202)');
 const styles=await pay.evaluate(node=>({disabled:(node as HTMLButtonElement).disabled,color:getComputedStyle(node).color,background:getComputedStyle(node).backgroundColor}));
 await page.screenshot({path:`../docs/screenshots/m3a-2/${name}-checkout.png`,fullPage:true});evidence.push({viewport:{width,height},checkout:styles,overflow:await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth)});
 const holdId=new URL(page.url()).pathname.split('/').pop();
 const auth=await api('/auth/login',account);const cancelled=await fetch(base+'/api/v1/reservations/'+holdId,{method:'DELETE',headers:{Authorization:`Bearer ${auth.accessToken}`}});if(!cancelled.ok)throw new Error('Review hold cleanup failed');
 await context.close();
 }
 await writeFile('../docs/screenshots/m3a-2/evidence.json',JSON.stringify({stack:'ticketrush-visual-review',seed:'[dev-seated-v1]',eventId:event.id,evidence},null,2));
}finally{await browser.close();}
