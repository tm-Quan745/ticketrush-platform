import {test} from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {addSection,changeHistory,createPreset,moveRect,presets,seatCount,slugify,toRequest,validateDraft,type History} from '../src/features/venues/model';
import {VenueCanvas} from '../src/features/venues/VenueCanvas';
import {StadiumMap} from '../src/features/seating/SeatPicker';

function named(){return {...createPreset('theatre'),name:'Nhà hát',templateKey:'nha-hat'};}
for(const preset of presets)test(`${preset.id} starts with a valid layout ready for publication`,()=>{
 const draft={...createPreset(preset.id),name:'Venue',templateKey:'venue'};
 assert.deepEqual(validateDraft(draft),[]);
 for(const s of draft.sections.filter(s=>s.type==='GA'))assert.equal(s.rows*s.columns,0);
});
test('validation blocks stage overlap, overlapping zones, out of bounds and duplicate codes',()=>{
 const draft=named();draft.sections[0]={...draft.sections[0],...draft.stage};
 assert(validateDraft(draft).some(i=>i.target==='A'&&i.message.includes('sân khấu')));
 draft.sections[1]={...draft.sections[0],id:'B'};
 assert(validateDraft(draft).some(i=>i.target==='B'&&i.message.includes('mã khu')));
 assert(validateDraft(draft).some(i=>i.message.includes('chồng lên')));
 draft.stage.x=2000;assert(validateDraft(draft).some(i=>i.target==='stage'&&i.message.includes('ngoài')));
});
test('invalid counts, fractional coordinates, blank names and excessive capacity cannot be saved',()=>{
 const draft=named();draft.sections[0].rows=0;assert(validateDraft(draft).some(i=>i.message.includes('số hàng')));
 draft.sections[0].rows=100;draft.sections.forEach(s=>{s.rows=100;s.columns=100;});
 assert(validateDraft(draft).some(i=>i.message.includes('20.000')));
 draft.sections[0].x=0.5;assert(validateDraft(draft).some(i=>i.target==='A'&&i.message.includes('số nguyên')));
 draft.name=' ';draft.templateKey='Bad Key';assert.equal(validateDraft(draft).filter(i=>i.target==='settings').length,3);
});
test('moving respects canvas bounds and snapping, with fine adjustment supported',()=>{
 const draft=named(),rect=draft.sections[0];
 assert.deepEqual(moveRect(rect,-30,900,draft),{...rect,x:0,y:450});
 assert.equal(moveRect(rect,113,187,draft).x,110);
 assert.equal(moveRect(rect,113,187,draft,1).x,113);
});
test('add and duplicate choose free space without mutating or reusing zone identity',()=>{
 const draft=named(),before=JSON.stringify(draft);const added=addSection(draft);
 assert(added);assert.deepEqual(validateDraft({...draft,sections:[...draft.sections,added]}),[]);assert.equal(JSON.stringify(draft),before);
 const roomy={...draft,width:1200};const copy=addSection(roomy,draft.sections[0]);assert(copy);
 assert.notEqual(copy.id,draft.sections[0].id);assert.notEqual(copy.code,draft.sections[0].code);
 assert.equal(copy.rows,draft.sections[0].rows);assert.deepEqual(validateDraft({...roomy,sections:[...roomy.sections,copy]}),[]);
 const full={...draft,width:200,height:200,stage:{x:0,y:0,width:200,height:200},sections:[]};assert.equal(addSection(full),undefined);
});
test('undo restores deleted zones; redo restores changes; new change clears redo and reset clears history',()=>{
 const draft=named();let history:History={past:[],present:draft,future:[]};
 const edited={...draft,sections:draft.sections.slice(1)};history=changeHistory(history,{type:'change',draft:edited});
 history=changeHistory(history,{type:'undo'});assert.equal(history.present,draft);
 history=changeHistory(history,{type:'redo'});assert.equal(history.present,edited);
 history=changeHistory(history,{type:'undo'});history=changeHistory(history,{type:'change',draft:{...draft,name:'Changed'}});assert.equal(history.future.length,0);
 history=changeHistory(history,{type:'reset',draft});assert.equal(history.past.length,0);
});
test('request uses server geometry and strips editor-only identities',()=>{
 const draft=named();assert.equal(slugify('Sân vận động Mỹ Đình'),'san-van-dong-my-dinh');
 const body=toRequest(draft);assert(!('id' in body.sections[0]));assert.deepEqual(body.stage,draft.stage);assert.equal(seatCount(draft),480);
});
test('canvas exposes keyboard-selectable zones and selection to assistive technology',()=>{
 const html=renderToStaticMarkup(React.createElement(VenueCanvas,{draft:named(),selected:'A',issues:[],onSelect:()=>{},onChange:()=>{}}));
 assert.match(html,/aria-label="Chọn Khán đài A" aria-pressed="true"/);assert.match(html,/tabindex="0"/);assert.match(html,/Chọn Sân khấu/);
});
test('buyer renders the stored stage instead of a hardcoded stadium decoration',()=>{
 const map={eventId:'event',observedAt:'',sections:[],tiers:[],venue:{id:'venue',name:'Venue',templateKey:'venue',templateVersion:1,viewBox:[0,0,800,600],stage:[350,300,530,380]}};
 const html=renderToStaticMarkup(React.createElement(StadiumMap,{map,onOpen:()=>{}}));
 assert.match(html,/<rect x="350" y="300" width="180" height="80"/);assert.doesNotMatch(html,/<ellipse|<circle/);
});
