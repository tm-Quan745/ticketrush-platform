import React from 'react';
import {Check,Copy,Settings2,Trash2} from 'lucide-react';
import {IconButton} from '../../components/ui/IconButton';
import {fieldClass} from '../../pages/shared';
import {palettes,type Rect,type SectionDraft,type VenueDraft} from './model';

export function Dimensions({value,onChange,position=true}:{value:Rect;onChange:(patch:Partial<Rect>)=>void;position?:boolean}) {
 return <div className="grid grid-cols-2 gap-x-3 gap-y-1">{(['x','y','width','height'] as const).filter(k=>position||k==='width'||k==='height').map(key=><label className="text-xs text-slate-400" key={key}>{({x:'Vị trí ngang',y:'Vị trí dọc',width:'Chiều rộng',height:'Chiều cao'})[key]}<input type="number" required min={key==='x'||key==='y'?0:position?20:200} max={2000} step={1} className={fieldClass} value={value[key]} onChange={e=>onChange({[key]:Number(e.target.value)})}/></label>)}</div>;
}

export function VenueInspector({draft,selected,onChange,onCopy,onDelete}:{draft:VenueDraft;selected:string;onChange:(draft:VenueDraft)=>void;onCopy:()=>void;onDelete:()=>void}) {
 const section=draft.sections.find(s=>s.id===selected);
 function patch(values:Partial<SectionDraft>){onChange({...draft,sections:draft.sections.map(s=>s.id===selected?{...s,...values}:s)});}
 return <aside className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 min-w-0" aria-label="Thuộc tính đối tượng">
  <div className="flex items-center justify-between mb-3"><h2 className="font-semibold text-sm">{section?'Thuộc tính khu':'Sân khấu'}</h2><div className="flex gap-1">{section&&<><IconButton icon={Copy} label="Nhân bản khu" onClick={onCopy} disabled={draft.sections.length>=20}/><IconButton icon={Trash2} label="Xóa khu đang chọn" disabled={draft.sections.length===1} onClick={onDelete}/></>}</div></div>
  {section&&<><label className="text-xs text-slate-400">Tên khu<input required maxLength={200} className={fieldClass} value={section.name} onChange={e=>patch({name:e.target.value})}/></label>
   <div className="grid grid-cols-2 gap-3"><label className="text-xs text-slate-400">Mã khu<input required pattern="[A-Z0-9_]+" maxLength={40} className={fieldClass} value={section.code} onChange={e=>patch({code:e.target.value})}/></label><label className="text-xs text-slate-400">Loại khu<select aria-label="Loại khu" className={fieldClass} value={section.type} onChange={e=>patch({type:e.target.value as 'GA'|'SEATED',rows:e.target.value==='GA'?0:10,columns:e.target.value==='GA'?0:12})}><option value="SEATED">Có ghế</option><option value="GA">Khu đứng</option></select></label></div>
   {section.type==='SEATED'?<><div className="grid grid-cols-2 gap-3">{(['rows','columns'] as const).map(key=><label key={key} className="text-xs text-slate-400">{key==='rows'?'Số hàng':'Ghế mỗi hàng'}<input type="number" required min={1} max={100} className={fieldClass} value={section[key]} onChange={e=>patch({[key]:Number(e.target.value)})}/></label>)}</div><label className="text-xs text-slate-400">Lối đi sau mỗi N ghế<input type="number" required min={1} max={100} className={fieldClass} value={section.aisleEvery} onChange={e=>patch({aisleEvery:Number(e.target.value)})}/></label><p className="text-xs text-slate-400 mb-4">Hàng R1–R{section.rows}, ghế 1–{section.columns}. Tổng {section.rows*section.columns} ghế.</p></>:<p className="text-xs text-slate-400 mb-4">Sức chứa khu đứng được đặt khi tạo sự kiện, không có ghế đánh số.</p>}
   <div className="flex flex-wrap gap-2 mb-4" aria-label="Màu khu">{palettes.map(color=><button type="button" key={color} aria-label={`Màu ${color}`} aria-pressed={section.color===color} className="w-8 h-8 rounded-full flex items-center justify-center text-white focus-visible:outline-indigo-400" style={{backgroundColor:color}} onClick={()=>patch({color})}>{section.color===color&&<Check size={16}/>}</button>)}</div>
  </>}
  <details key={selected} open={!section}><summary className="text-sm cursor-pointer py-2 flex items-center gap-2"><Settings2 size={15}/>Vị trí & kích thước</summary><Dimensions value={section||draft.stage} onChange={values=>section?patch(values):onChange({...draft,stage:{...draft.stage,...values}})}/></details>
 </aside>;
}
