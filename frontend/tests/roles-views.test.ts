import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup as render} from 'react-dom/server';
import {allPages} from '../src/api/pagination';
import {GateResult} from '../src/features/tickets/components/GateResult';
import {TicketPass} from '../src/features/tickets/components/TicketPass';
import {HoldCard} from '../src/components/TicketWallet';
import {OrderInvoiceModal} from '../src/components/user/OrderInvoiceModal';
import type {Ticket,Order,Reservation} from '../src/types';
const ticket={id:'t',ticketCode:'ticket-code',status:'VALID',eventTitle:'Concert',tierName:'Stand A',issuedAt:'2026-01-01T00:00:00Z',seat:{sectionName:'Stand A',rowLabel:'R2',number:12}} as Ticket;
test('pagination fetches every page including a partially filled last page',async()=>{
 const visited:number[]=[];assert.deepEqual(await allPages(async page=>{visited.push(page);return{page,totalPages:3,totalElements:5,content:page<2?[page*2,page*2+1]:[4]};}),[0,1,2,3,4]);assert.deepEqual(visited,[0,1,2]);
});
test('pagination surfaces later-page failures rather than showing incomplete wallet totals',async()=>{
 await assert.rejects(allPages(async page=>{if(page===1)throw new Error('page unavailable');return{page,totalPages:2,totalElements:2,content:[1]};}),/page unavailable/);
});
for(const [status,label] of [['VALID','Có hiệu lực'],['USED','Đã sử dụng'],['CANCELLED','Đã hủy']] as const)test(`wallet renders ${status} with seat snapshot and stored issue time`,()=>{
 const html=render(React.createElement(TicketPass,{ticket:{...ticket,status}}));assert.match(html,new RegExp(label));assert.match(html,/Stand A/);assert.match(html,/Hàng R2, ghế 12/);assert.match(html,/2026/);assert.doesNotMatch(html,/2027|Transfer|CCCD/);
});
for(const [status,label] of [['VALID','Vé hợp lệ'],['USED','Vé đã được sử dụng'],['CANCELLED','Vé đã bị hủy']] as const)test(`gate has readable ${status} result, not only color`,()=>{
 const html=render(React.createElement(GateResult,{ticket:{...ticket,status,usedAt:status==='USED'?'2026-01-01T00:00:00Z':null},accepted:false}));assert.match(html,new RegExp(label));assert.match(html,/Hàng R2, ghế 12/);if(status==='USED')assert.match(html,/Đã vào cổng lúc/);
});
test('gate distinguishes invalid code and successful check-in',()=>{
 assert.match(render(React.createElement(GateResult,{accepted:false,errorCode:'TICKET_NOT_FOUND'})),/Mã vé không hợp lệ/);
 assert.match(render(React.createElement(GateResult,{accepted:true,ticket:{...ticket,status:'USED'}})),/Đã ghi nhận vào cổng/);
});
test('expired wallet hold has zero server TTL and disabled resume',()=>{
 const html=render(React.createElement(HoldCard,{hold:{id:'h',status:'HELD',quantity:2,expires_at:'2026-01-01T00:00:00Z'} as Reservation,now:Date.parse('2026-01-01T00:00:01Z'),onResume:()=>{}}));assert.match(html,/0:00/);assert.match(html,/disabled=""/);
});
test('invoice uses stored amount, omits absent timestamp and never invents VAT',()=>{
 const html=render(React.createElement(OrderInvoiceModal,{order:{id:'o',status:'PAID',currency:'VND',totalAmount:25000,items:[{tierName:'Stand A',quantity:1,unitPrice:25000}]} as Order,onClose:()=>{}}));assert.match(html,/25[.,]000/);assert.doesNotMatch(html,/VAT|Ngày tạo|2026/);
});
