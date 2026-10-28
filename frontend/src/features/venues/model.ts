export type Rect = {x:number;y:number;width:number;height:number};
export type SectionDraft = Rect & {id:string;code:string;name:string;type:'GA'|'SEATED';color:string;rows:number;columns:number;aisleEvery:number};
export type VenueDraft = {name:string;templateKey:string;width:number;height:number;stage:Rect;sections:SectionDraft[]};
export type VenueSummary = {id:string;name:string;templateKey:string;templateVersion:number};
export type VenueDetail = VenueSummary & {geometry:{width:number;height:number;stage:number[]};sections:{id:string;code:string;name:string;type:string;geometry:{polygon:number[][];color:string}}[]};
export type LayoutIssue = {target:string;message:string};
export const palettes=['#6366f1','#0891b2','#d97706','#db2777','#059669','#7c3aed'];
export const presets=[
 {id:'theatre',name:'Nhà hát',description:'4 khối ghế, lối đi ở giữa'},
 {id:'concert',name:'Concert',description:'Khu đứng phía trước và khán đài'},
 {id:'standing',name:'Sự kiện đứng',description:'2 khu đứng, không đánh số ghế'},
] as const;
export type Preset = typeof presets[number]['id'];
function section(code:string,x:number,y:number,width:number,height:number,type:'GA'|'SEATED'='SEATED',color=palettes[0]):SectionDraft {
 return {id:code,code,name:type==='GA'?`Khu đứng ${code}`:`Khán đài ${code}`,type,color,x,y,width,height,rows:type==='GA'?0:10,columns:type==='GA'?0:12,aisleEvery:6};
}
export function createPreset(preset:Preset):VenueDraft {
 const base={name:'',templateKey:'',width:800,height:600,stage:{x:280,y:40,width:240,height:80}};
 if(preset==='standing')return {...base,sections:[section('A',100,180,280,340,'GA'),section('B',420,180,280,340,'GA',palettes[1])]};
 if(preset==='concert')return {...base,sections:[section('PIT',280,180,240,180,'GA',palettes[2]),section('A',40,180,180,340),section('B',580,180,180,340,'SEATED',palettes[1]),section('C',280,420,240,100,'SEATED',palettes[3])]};
 return {...base,sections:[section('A',100,180,280,150),section('B',420,180,280,150,'SEATED',palettes[1]),section('C',100,370,280,150,'SEATED',palettes[3]),section('D',420,370,280,150,'SEATED',palettes[4])]};
}
export function overlaps(a:Rect,b:Rect):boolean {
 return a.x<b.x+b.width&&a.x+a.width>b.x&&a.y<b.y+b.height&&a.y+a.height>b.y;
}
const integer=(n:number,min:number,max:number)=>Number.isInteger(n)&&n>=min&&n<=max;
export function validateDraft(draft:VenueDraft):LayoutIssue[] {
 const issues:LayoutIssue[]=[];
 const add=(target:string,message:string)=>issues.push({target,message});
 if(!draft.name.trim()||draft.name.trim().length>200)add('settings','Tên địa điểm cần có từ 1 đến 200 ký tự.');
 if(!/^[a-z0-9][a-z0-9-]{0,99}$/.test(draft.templateKey))add('settings','Mã sơ đồ chỉ gồm chữ thường, số và dấu gạch nối (tối đa 100 ký tự).');
 if(!integer(draft.width,200,2000)||!integer(draft.height,200,2000))add('settings','Kích thước sơ đồ phải là số nguyên từ 200 đến 2.000.');
 const checkRect=(r:Rect,id:string,label:string)=>{
  if(!integer(r.x,0,2000)||!integer(r.y,0,2000)||!integer(r.width,20,2000)||!integer(r.height,20,2000))add(id,`${label}: vị trí phải là số nguyên không âm, kích thước từ 20 đến 2.000.`);
  else if(r.x+r.width>draft.width||r.y+r.height>draft.height)add(id,`${label} nằm ngoài khung sơ đồ.`);
 };
 checkRect(draft.stage,'stage','Sân khấu');
 if(draft.sections.length<1||draft.sections.length>20)add('settings','Sơ đồ cần từ 1 đến 20 khu.');
 const codes=new Set<string>();
 for(const s of draft.sections){
  checkRect(s,s.id,s.name||'Khu chưa đặt tên');
  if(!/^[A-Z0-9_]{1,40}$/.test(s.code)||codes.has(s.code))add(s.id,`${s.name}: mã khu phải khác nhau, chỉ dùng A–Z, số và dấu gạch dưới.`);
  codes.add(s.code);
  if(!s.name.trim()||s.name.length>200)add(s.id,'Tên khu cần có từ 1 đến 200 ký tự.');
  if(!/^#[0-9a-fA-F]{6}$/.test(s.color))add(s.id,`${s.name}: màu khu không hợp lệ.`);
  if(s.type==='SEATED'&&(!integer(s.rows,1,100)||!integer(s.columns,1,100)))add(s.id,`${s.name}: số hàng và số ghế mỗi hàng phải từ 1 đến 100.`);
  if(s.type==='GA'&&(s.rows!==0||s.columns!==0))add(s.id,`${s.name}: khu đứng không có ghế đánh số.`);
  if(!integer(s.aisleEvery,1,100))add(s.id,`${s.name}: khoảng chia lối đi phải từ 1 đến 100 ghế.`);
  if(overlaps(s,draft.stage))add(s.id,`${s.name} đang chồng lên sân khấu.`);
 }
 for(let i=0;i<draft.sections.length;i++)for(let j=i+1;j<draft.sections.length;j++){
  const a=draft.sections[i],b=draft.sections[j];
  if(overlaps(a,b)){add(a.id,`${a.name} chồng lên ${b.name}.`);add(b.id,`${b.name} chồng lên ${a.name}.`);}
 }
 if(seatCount(draft)>20000)add('settings','Tổng số ghế vượt giới hạn 20.000.');
 return issues;
}
export const seatCount=(draft:VenueDraft)=>draft.sections.reduce((total,s)=>total+(s.type==='SEATED'?s.rows*s.columns:0),0);
export const slugify=(name:string)=>name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[đĐ]/g,'d').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,100);
export function moveRect(rect:Rect,x:number,y:number,draft:Pick<VenueDraft,'width'|'height'>,snap=10):Rect {
 return {...rect,x:Math.max(0,Math.min(Math.max(0,draft.width-rect.width),Math.round(x/snap)*snap)),y:Math.max(0,Math.min(Math.max(0,draft.height-rect.height),Math.round(y/snap)*snap))};
}
export function addSection(draft:VenueDraft,source?:SectionDraft):SectionDraft|undefined {
 if(draft.sections.length>=20)return undefined;
 let number=1;while(draft.sections.some(s=>s.code===`K${number}`))number++;
 const next=source?{...source}:section(`K${number}`,0,0,140,100,'SEATED',palettes[draft.sections.length%palettes.length]);
 next.id=`section-${number}`;while(draft.sections.some(s=>s.id===next.id))next.id+='-copy';
 next.code=`K${number}`;next.name=source?`${source.name} (bản sao)`.slice(0,200):`Khu ${number}`;
 for(let y=20;y+next.height<=draft.height;y+=20)for(let x=20;x+next.width<=draft.width;x+=20){
  const rect={...next,x,y};
  const padded={x:x-10,y:y-10,width:rect.width+20,height:rect.height+20};
  if(!overlaps(padded,draft.stage)&&!draft.sections.some(s=>overlaps(padded,s)))return rect;
 }
 return undefined;
}
export function toRequest(draft:VenueDraft){
 return {...draft,name:draft.name.trim(),sections:draft.sections.map(({id,...s})=>({...s,name:s.name.trim()}))};
}
export type History={past:VenueDraft[];present:VenueDraft;future:VenueDraft[]};
export function changeHistory(history:History,action:{type:'change'|'reset';draft:VenueDraft}|{type:'undo'|'redo'}):History {
 if(action.type==='reset')return {past:[],present:action.draft,future:[]};
 if(action.type==='change')return {past:[...history.past,history.present].slice(-50),present:action.draft,future:[]};
 if(action.type==='undo'&&history.past.length)return {past:history.past.slice(0,-1),present:history.past[history.past.length-1],future:[history.present,...history.future]};
 if(action.type==='redo'&&history.future.length)return {past:[...history.past,history.present],present:history.future[0],future:history.future.slice(1)};
 return history;
}
