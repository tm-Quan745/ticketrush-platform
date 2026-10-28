import React,{useId,useRef,useState} from 'react';
import {moveRect,type Rect,type VenueDraft,type VenueDetail,type LayoutIssue} from './model';

export function VenuePreview({venue}:{venue:Pick<VenueDetail,'geometry'|'sections'>}) {
 const {width,height,stage}=venue.geometry;
 return <svg role="img" aria-label="Sơ đồ địa điểm" viewBox={`0 0 ${width} ${height}`} className="venue-canvas w-full max-h-[440px]">
  {stage?.length===4&&<g><rect x={stage[0]} y={stage[1]} width={stage[2]-stage[0]} height={stage[3]-stage[1]} rx="6" className="venue-stage"/><text x={(stage[0]+stage[2])/2} y={(stage[1]+stage[3])/2} textAnchor="middle" dominantBaseline="middle" className="venue-stage-label" fontSize="13">SÂN KHẤU</text></g>}
  {venue.sections.map(s=><g key={s.id}><polygon points={s.geometry.polygon.map(p=>p.join(',')).join(' ')} fill={s.geometry.color} fillOpacity="0.16" stroke={s.geometry.color} strokeWidth="2"/><text x={s.geometry.polygon.reduce((sum,p)=>sum+p[0],0)/s.geometry.polygon.length} y={s.geometry.polygon.reduce((sum,p)=>sum+p[1],0)/s.geometry.polygon.length} textAnchor="middle" dominantBaseline="middle" className="venue-zone-label" fontSize="13">{s.name}</text></g>)}
 </svg>;
}

export function VenueCanvas({draft,selected,onSelect,onChange,issues,disabled=false}:{draft:VenueDraft;selected:string;onSelect:(id:string)=>void;onChange:(draft:VenueDraft)=>void;issues:LayoutIssue[];disabled?:boolean}) {
 const gridId=useId();const svg=useRef<SVGSVGElement>(null);
 const drag=useRef<{id:string;rect:Rect;start:{x:number;y:number};current:Rect}|null>(null);
 const [ghost,setGhost]=useState<{id:string;rect:Rect}|null>(null);
 function coordinates(event:React.PointerEvent){
  const matrix=svg.current?.getScreenCTM();if(!matrix)return {x:0,y:0};
  return new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse());
 }
 function apply(id:string,rect:Rect){
  onChange(id==='stage'?{...draft,stage:rect}:{...draft,sections:draft.sections.map(s=>s.id===id?{...s,...rect}:s)});
 }
 function begin(event:React.PointerEvent<SVGGElement>,id:string,rect:Rect){
  if(disabled||event.button!==0)return;
  event.preventDefault();onSelect(id);event.currentTarget.focus();
  drag.current={id,rect,start:coordinates(event),current:rect};svg.current?.setPointerCapture(event.pointerId);
 }
 function end(){
  const active=drag.current;drag.current=null;setGhost(null);
  if(active&&(active.current.x!==active.rect.x||active.current.y!==active.rect.y))apply(active.id,active.current);
 }
 function keyboard(event:React.KeyboardEvent,id:string,rect:Rect){
  if(disabled)return;
  if(event.key==='Enter'||event.key===' '){event.preventDefault();onSelect(id);return;}
  const vector:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  const direction=vector[event.key];if(!direction)return;
  event.preventDefault();onSelect(id);const step=event.shiftKey?1:10;
  apply(id,moveRect(rect,rect.x+direction[0]*step,rect.y+direction[1]*step,draft,step));
 }
 const items=[{...draft.stage,id:'stage',name:'Sân khấu',code:'SÂN KHẤU',color:'#64748b',type:'STAGE'},...draft.sections];
 return <svg ref={svg} viewBox={`0 0 ${Math.max(200,draft.width)} ${Math.max(200,draft.height)}`} role="group" aria-label="Trình thiết kế sơ đồ" className="venue-canvas w-full max-h-[570px] rounded-2xl"
  onPointerMove={event=>{if(!drag.current||disabled)return;const p=coordinates(event),a=drag.current;a.current=moveRect(a.rect,a.rect.x+p.x-a.start.x,a.rect.y+p.y-a.start.y,draft,event.shiftKey?1:10);setGhost({id:a.id,rect:a.current});}}
  onPointerUp={end} onPointerCancel={()=>{drag.current=null;setGhost(null);}} onLostPointerCapture={()=>{if(drag.current){drag.current=null;setGhost(null);}}}>
  <defs><pattern id={gridId} width="20" height="20" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.8" className="venue-grid-dot"/></pattern></defs>
  <rect width="100%" height="100%" fill={`url(#${gridId})`}/>
  {items.map(item=>{
   const rect=ghost?.id===item.id?ghost.rect:item;const active=selected===item.id;const invalid=issues.some(i=>i.target===item.id);const stage=item.id==='stage';
   return <g key={item.id} role="button" tabIndex={disabled?-1:0} aria-disabled={disabled} aria-label={`Chọn ${item.name}`} aria-pressed={active} className="venue-object" style={{touchAction:'none',cursor:disabled?'default':ghost?'grabbing':'grab'}}
    onPointerDown={e=>begin(e,item.id,item)} onKeyDown={e=>keyboard(e,item.id,item)} onClick={()=>{if(!disabled)onSelect(item.id);}}>
    <rect x={rect.x} y={rect.y} width={rect.width} height={rect.height} rx="6" fill={stage?'#64748b':item.color} fillOpacity={stage?0.85:active?0.23:0.12} stroke={invalid?'#f43f5e':item.color} strokeWidth={active?3:1.5} strokeDasharray={invalid?'6 4':undefined}/>
    {active&&<rect x={rect.x-5} y={rect.y-5} width={rect.width+10} height={rect.height+10} rx="9" fill="none" stroke="currentColor" strokeWidth="1" strokeDasharray="3 4" className="text-indigo-400"/>}
    <text x={rect.x+rect.width/2} y={rect.y+rect.height/2-(stage?0:9)} textAnchor="middle" dominantBaseline="middle" className={stage?'venue-stage-label':'venue-zone-label'} fontSize="14" fontWeight="700" pointerEvents="none">{item.code||'?'}</text>
    {!stage&&<text x={rect.x+rect.width/2} y={rect.y+rect.height/2+14} textAnchor="middle" className="venue-zone-label" fontSize="11" pointerEvents="none">{item.type==='GA'?'Khu đứng':`${'rows' in item?item.rows*item.columns:0} ghế`}</text>}
   </g>;
  })}
 </svg>;
}
