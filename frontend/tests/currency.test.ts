import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup as render} from 'react-dom/server';
import {formatCurrency} from '../src/lib/utils';
import {money} from '../src/pages/shared';
import {TicketCard} from '../src/features/flash-sale/components/TicketCard';
import type {FlashSaleTier} from '../src/features/flash-sale/types/flashSale.types';

test('Vietnamese dong is the default and keeps the stored amount without dividing by 100',()=>{
 for(const amount of [0,1250,120000,1250000]){
  assert.equal(formatCurrency(amount),new Intl.NumberFormat('vi-VN',{style:'currency',currency:'VND'}).format(amount));
  assert.equal(money(amount,'VND'),formatCurrency(amount));
  assert.doesNotMatch(formatCurrency(amount),/USD|\$/);
 }
 assert.match(formatCurrency(120000),/120\.000\s*₫/);
});
test('explicit stored currencies retain their scale and are not relabeled as VND',()=>{
 assert.match(formatCurrency(1250,'USD'),/12,50/);
 assert.match(formatCurrency(1250,'JPY'),/1\.250/);
 assert.doesNotMatch(formatCurrency(1250,'USD'),/₫/);
});
test('customer ticket card renders Vietnamese ticket prices',()=>{
 const tier={id:'tier-1',name:'Standard',price:120000,currency:'VND',availability:'AVAILABLE',maxPerOrder:6} as FlashSaleTier;
 const html=render(React.createElement(TicketCard,{tier,selected:false,onSelect:()=>{}}));
 assert.match(html,/120\.000\s*₫/);assert.doesNotMatch(html,/USD|\$120/);
});
