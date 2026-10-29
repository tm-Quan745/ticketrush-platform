import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup as render} from 'react-dom/server';
import {ProfilePage} from '../src/components/user/ProfilePage';
import {ThemeProvider} from '../src/context/ThemeContext';
import {EventOverview,EventManagementTabs} from '../src/components/admin/EventManagement';
import {orderNotifications,notificationReadKey,parseReadNotifications} from '../src/features/notifications/model';
import type {Event,Order} from '../src/types';

test('profile shows authenticated account data and working account links without invented identity',()=>{
 const html=render(React.createElement(ThemeProvider,null,React.createElement(ProfilePage,{user:{id:'user-1',email:'buyer@example.test',role:'USER'}})));
 assert.match(html,/buyer@example.test/);assert.match(html,/user-1/);assert.match(html,/Khách hàng/);
 assert.match(html,/href="\/account\/tickets"/);assert.match(html,/href="\/account\/orders"/);
 assert.doesNotMatch(html,/CCCD|KYC|Đã xác minh|type="password"/);
 assert.equal((html.match(/aria-pressed="true"/g)||[]).length,1);
});
test('event overview renders all schedule fields in GMT+7 and real venue information',()=>{
 const event={id:'event-1',title:'Live concert',description:'Event description',venueName:'Arena',venueAddress:'12 Main Street',startTime:'2026-11-20T12:00:00Z',endTime:'2026-11-20T15:00:00Z',saleStartTime:'2026-10-01T02:00:00Z',saleEndTime:'2026-11-19T02:00:00Z',updatedAt:'2026-10-27T02:00:00Z'} as Event;
 const html=render(React.createElement(EventOverview,{event,onImageSaved:()=>{}}));
 for(const text of ['Arena','12 Main Street','GMT+7','19:00','22:00','Event description','event-1'])assert.ok(html.includes(text));
});
test('management tabs select one section and keep seat and inventory workflows reachable',()=>{
 const html=render(React.createElement(EventManagementTabs,{active:'seats',onChange:()=>{}}));
 assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
 assert.match(html,/Sơ đồ ghế/);assert.match(html,/Tồn kho &amp; đối soát/);assert.match(html,/Phòng chờ/);
});
test('notifications use owned order states and never invent delivery timestamps',()=>{
 const own={id:'o1',userId:'u1',status:'PAID',manualReview:false} as Order;
 const notifications=orderNotifications([own,{...own,id:'other',userId:'u2'}],'u1');
 assert.equal(notifications.length,1);assert.equal(notifications[0].href,'/orders/o1');
 assert.match(notifications[0].message,/Thanh toán thành công/);
 assert.equal('timestamp' in notifications[0],false);
 assert.deepEqual(orderNotifications([own],'u1'),notifications);
 assert.notEqual(orderNotifications([{...own,status:'REFUNDED'}],'u1')[0].id,notifications[0].id);
 assert.notEqual(orderNotifications([{...own,manualReview:true}],'u1')[0].id,notifications[0].id);
});
test('notification read storage is scoped by user, bounded and tolerant of malformed data',()=>{
 assert.notEqual(notificationReadKey('u1'),notificationReadKey('u2'));
 for(const raw of [null,'invalid','{}','null','42'])assert.deepEqual(parseReadNotifications(raw),[]);
 assert.deepEqual(parseReadNotifications('["a", 12, null, "b"]'),['a','b']);
 assert.equal(parseReadNotifications(JSON.stringify(Array.from({length:600},(_,i)=>String(i)))).length,500);
});
