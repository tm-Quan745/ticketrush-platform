import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup as render} from 'react-dom/server';
import {EventsHero} from '../frontend/src/components/user/EventsHero';
import {salePhase,EventHeader} from '../frontend/src/features/flash-sale/components/EventHeader';
import {navigationItems,isNavigationActive} from '../frontend/src/components/user/SiteHeader';
import {Pagination} from '../frontend/src/components/Pagination';
import {ApiClient} from '../frontend/src/api/client';
import type {FlashSaleEvent} from '../frontend/src/features/flash-sale/types/flashSale.types';

test('discovery hero has an accessible search without fabricated sales statistics',()=>{
 const html=render(React.createElement(EventsHero,{keyword:'',onKeyword:()=>{},onSearch:()=>{}}));
 assert.match(html,/role="search"/);assert.match(html,/for="discover-search"/);assert.match(html,/type="submit"/);
 assert.doesNotMatch(html,/100%|10\.000|sold|Zero Overselling/);
});
test('event sale states use real deadlines and never show a future countdown for a closed sale',()=>{
 const event={title:'Concert',saleStartTime:'2020-01-01T00:00:00Z',saleEndTime:'2020-01-02T00:00:00Z',startTime:'2020-01-03T00:00:00Z',venueName:'Hall',venueAddress:'City',imageUrl:''} as FlashSaleEvent;
 assert.equal(salePhase(event,Date.parse('2019-01-01')),'upcoming');assert.equal(salePhase(event,Date.parse('2020-01-01T12:00:00Z')),'open');assert.equal(salePhase(event,Date.now()),'closed');
 const html=render(React.createElement(EventHeader,{event}));assert.match(html,/Đã kết thúc mở bán/);assert.doesNotMatch(html,/Mở bán sau/);
});
test('header navigation respects roles and highlights detail routes',()=>{
 assert.deepEqual(navigationItems('PUBLIC').map(item=>item.href),['/events']);
 assert.deepEqual(navigationItems('STAFF').map(item=>item.href),['/gate']);
 assert.ok(!navigationItems('USER').some(item=>item.href==='/admin'));
 assert.ok(navigationItems('ADMIN').some(item=>item.href==='/admin'));
 assert.equal(isNavigationActive('/events/concert','/events'),true);
 assert.equal(isNavigationActive('/orders/order-1','/account/orders'),true);
 assert.equal(isNavigationActive('/account/tickets','/account/orders'),false);
});
test('pagination labels match wallet data instead of calling tickets events',()=>{
 const html=render(React.createElement(Pagination,{page:1,totalPages:3,totalElements:23,itemLabel:'vé',onPageChange:()=>{}}));
 assert.match(html,/Phân trang vé/);assert.match(html,/23 vé/);assert.doesNotMatch(html,/sự kiện/);
});
test('wallet requests only the selected server page and encodes all search filters',async t=>{
 let calls=0;
 t.mock.method(globalThis,'fetch',async(url:string)=>{
  calls++;const target=new URL(url,'https://local.test');assert.equal(target.pathname,'/api/v1/orders/me/tickets');
  assert.equal(target.searchParams.get('page'),'2');assert.equal(target.searchParams.get('size'),'9');assert.equal(target.searchParams.get('status'),'USED');assert.equal(target.searchParams.get('query'),'Jazz & VIP');
  return Response.json({content:[],page:2,totalPages:3,totalElements:20});
 });
 const response=await new ApiClient().getMyTickets(2,9,'USED','Jazz & VIP');assert.equal(response.page,2);assert.equal(calls,1);
});
