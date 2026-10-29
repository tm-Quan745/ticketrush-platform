import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup as render} from 'react-dom/server';
import {AdminSidebar} from '../frontend/src/components/admin/AdminLayout';
import {AdminEventTable,AdminOrderTable,adminDate} from '../frontend/src/components/admin/AdminTables';
import type {Event,Order} from '../frontend/src/types';

for(const path of ['/admin','/admin/events','/admin/events/new','/admin/events/abc','/admin/venues','/admin/orders','/admin/operations','/admin/results']) {
 test(`admin navigation selects exactly one section for ${path}`,()=>{
  const html=render(React.createElement(AdminSidebar,{pathname:path}));
  const selected=[...html.matchAll(/<a href="([^"]+)" aria-current="page"/g)].map(match=>match[1]);
  assert.deepEqual(selected,[path.startsWith('/admin/events')?'/admin/events':path]);
  assert.match(html,/href="\/events"/);
 });
}
test('event table displays draft data with management links and no invented image',()=>{
 const html=render(React.createElement(AdminEventTable,{events:[{id:'draft-id',title:'Draft concert',status:'DRAFT',venueName:'Arena',startTime:'2026-10-27T12:00:00Z',saleStartTime:'2026-10-26T12:00:00Z'} as Event]}));
 assert.match(html,/Draft concert/);assert.match(html,/Bản nháp/);assert.match(html,/Arena/);assert.match(html,/href="\/admin\/events\/draft-id"/);assert.doesNotMatch(html,/<img/);assert.match(html,/19:00/);
});
test('admin tables explain empty data and missing dates',()=>{
 assert.match(render(React.createElement(AdminEventTable,{events:[]})),/Chưa có sự kiện/);
 assert.match(render(React.createElement(AdminOrderTable,{orders:[],busy:false,onRefund:()=>{}})),/Chưa có đơn hàng/);
 assert.equal(adminDate(undefined),'—');assert.equal(adminDate('invalid'),'—');
});
test('order table preserves currency scale and enables refunds only for paid orders',()=>{
 for(const status of ['PAID','PENDING_PAYMENT','REFUNDED','REFUND_PENDING','PAYMENT_FAILED'] as const){
  const html=render(React.createElement(AdminOrderTable,{orders:[{id:'order-id',userId:'customer-id',status,totalAmount:1250,currency:'VND',manualReview:true} as Order],busy:false,onRefund:()=>{}}));
  assert.match(html,/1[.,]250/);assert.match(html,/customer-id/);assert.match(html,/Cần kiểm tra thủ công/);
  assert.equal(html.includes('disabled=""'),status!=='PAID');
 }
 const busyHtml=render(React.createElement(AdminOrderTable,{orders:[{id:'o',status:'PAID',totalAmount:1250,currency:'USD'} as Order],busy:true,onRefund:()=>{}}));
 assert.match(busyHtml,/12[.,]50/);assert.match(busyHtml,/disabled=""/);
});
