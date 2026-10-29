import { test } from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Pagination, paginationItems } from '../frontend/src/components/Pagination';
import { IconButton } from '../frontend/src/components/ui/IconButton';
import { RefreshCw } from 'lucide-react';

test('pagination keeps page choices bounded and ordered for large lists',()=>{
 assert.deepEqual(paginationItems(0,0),[]);
 assert.deepEqual(paginationItems(2,5),[0,1,2,3,4]);
 assert.deepEqual(paginationItems(0,100),[0,1,'ellipsis',99]);
 assert.deepEqual(paginationItems(50,100),[0,'ellipsis',49,50,51,'ellipsis',99]);
 assert.deepEqual(paginationItems(99,100),[0,'ellipsis',98,99]);
 for(let page=0;page<100;page++){
  const items=paginationItems(page,100);assert.ok(items.includes(page));assert.ok(items.length<=7);
  const numbers=items.filter((item):item is number=>typeof item==='number');
  assert.deepEqual(numbers,[...new Set(numbers)].sort((a,b)=>a-b));
 }
});

for (const [page, totalPages, totalElements, previousDisabled, nextDisabled] of [
  [0, 0, 0, true, true], [0, 1, 5, true, true],
  [0, 3, 25, true, false], [1, 3, 25, false, false], [2, 3, 25, false, true],
] as const) {
 test(`pagination boundaries and direct selection: page ${page} of ${totalPages}`,()=>{
  const changes:number[]=[];
  const element=Pagination({page,totalPages,totalElements,onPageChange:next=>changes.push(next)});
  const html=renderToStaticMarkup(element);
  assert.match(html,/aria-label="Phân trang sự kiện"/);
  assert.ok(html.replace(/<[^>]+>/g,'').includes(`${totalElements} sự kiện · Trang ${totalPages?page+1:0} / ${totalPages}`));
  assert.equal((html.match(/aria-current="page"/g)||[]).length,totalPages?1:0);
  const controls=element.props.children[1].props.children;
  const arrows=[controls[0],controls[1],controls[3],controls[4]];
  assert.deepEqual(arrows.map(button=>button.props.disabled),[previousDisabled,previousDisabled,nextDisabled,nextDisabled]);
  arrows.forEach(button=>button.props.onClick());
  assert.deepEqual(changes,[0,page-1,page+1,totalPages-1].filter(target=>target>=0&&target<totalPages&&target!==page));
  changes.length=0;
  const numbers=controls[2].props.children;
  numbers.filter((button:React.ReactElement)=>button.type!=='span').forEach((button:React.ReactElement<{onClick:()=>void}>)=>button.props.onClick());
  assert.deepEqual(changes,Array.from({length:totalPages},(_,index)=>index).filter(target=>target!==page));
 });
}

test('icon buttons retain tooltip, accessible label and disabled behavior',()=>{
 const html=renderToStaticMarkup(React.createElement(IconButton,{label:'Làm mới',icon:RefreshCw,disabled:true}));
 assert.match(html,/title="Làm mới"/);assert.match(html,/aria-label="Làm mới"/);
 assert.match(html,/disabled=""/);assert.match(html,/aria-hidden="true"/);assert.match(html,/type="button"/);
 assert.equal(html.replace(/<[^>]+>/g,''),'');
});
