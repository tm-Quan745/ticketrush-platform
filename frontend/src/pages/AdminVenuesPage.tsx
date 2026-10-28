import React,{useEffect,useReducer,useState} from 'react';
import {ArrowLeft,CheckCircle2,Grid2X2,MapPin,Plus,Redo2,Save,Search,Undo2} from 'lucide-react';
import {api,ApiError} from '../api/client';
import {AdminPageHeader} from '../components/admin/AdminLayout';
import {IconButton} from '../components/ui/IconButton';
import {Modal} from '../components/ui/Modal';
import {Button,ErrorMessage,fieldClass,Link,useLoad} from './shared';
import {VenueCanvas,VenuePreview} from '../features/venues/VenueCanvas';
import {VenueInspector,Dimensions} from '../features/venues/VenueInspector';
import {addSection,changeHistory,createPreset,presets,seatCount,slugify,toRequest,validateDraft,type VenueDraft,type VenueSummary,type VenueDetail,type Preset} from '../features/venues/model';
export {VenuePreview} from '../features/venues/VenueCanvas';

const panel='rounded-2xl border border-slate-800 bg-slate-900/40';
function preview(draft:VenueDraft):Pick<VenueDetail,'geometry'|'sections'> {
 return {geometry:{width:draft.width,height:draft.height,stage:[draft.stage.x,draft.stage.y,draft.stage.x+draft.stage.width,draft.stage.y+draft.stage.height]},sections:draft.sections.map(s=>({...s,geometry:{color:s.color,polygon:[[s.x,s.y],[s.x+s.width,s.y],[s.x+s.width,s.y+s.height],[s.x,s.y+s.height]]}}))};
}

export function AdminVenuesPage() {
 const [revision,setRevision]=useState(0),[query,setQuery]=useState('');
 const list=useLoad(`venues-${revision}`,()=>api.request<VenueSummary[]>('/admin/venues'));
 const [chosen,setChosen]=useState('');const selectedVenue=chosen||list.value?.[0]?.id||'';
 const detail=useLoad(selectedVenue,()=>selectedVenue?api.request<VenueDetail>(`/admin/venues/${selectedVenue}`):Promise.resolve(undefined));
 const [mode,setMode]=useState<'library'|'presets'|'editor'>('library');
 const [history,dispatch]=useReducer(changeHistory,{past:[],present:createPreset('theatre'),future:[]});
 const draft=history.present;
 const [selection,setSelection]=useState('A');const selected=selection==='stage'||draft.sections.some(s=>s.id===selection)?selection:draft.sections[0]?.id||'stage';
 const section=draft.sections.find(s=>s.id===selected);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[success,setSuccess]=useState('');
 const [review,setReview]=useState(false),[attempted,setAttempted]=useState(false),[keyEdited,setKeyEdited]=useState(false);
 const issues=validateDraft(draft);const visibleIssues=issues.filter(i=>attempted||i.target!=='settings');
 useEffect(()=>{if(mode!=='editor')return;const warn=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[mode]);
 const change=(next:VenueDraft)=>{dispatch({type:'change',draft:next});setNotice('');setError('');};
 function start(preset:Preset){const next=createPreset(preset);dispatch({type:'reset',draft:next});setSelection(next.sections[0].id);setMode('editor');setKeyEdited(false);setAttempted(false);setError('');setSuccess('');setNotice('');}
 function add(copy=false){const next=addSection(draft,copy?section:undefined);if(!next){setNotice('Không đủ chỗ trống cho khu mới. Hãy thu nhỏ khu hoặc tăng kích thước sơ đồ (tối đa 20 khu).');return;}change({...draft,sections:[...draft.sections,next]});setSelection(next.id);}
 function leave(){if(!window.confirm('Bỏ bản thiết kế chưa lưu và trở về thư viện?'))return;setMode('library');setError('');setNotice('');}
 async function save(){
  if(busy||issues.length)return;setBusy(true);setError('');
  try{const created=await api.request<VenueDetail>('/admin/venues',{method:'POST',body:JSON.stringify(toRequest(draft))});setChosen(created.id);setRevision(v=>v+1);setSuccess(`Đã lưu sơ đồ “${created.name}”. Bạn có thể chọn sơ đồ này khi tạo sự kiện.`);setReview(false);setMode('library');}
  catch(e){setReview(false);setError(e instanceof ApiError&&e.status===409?'Mã sơ đồ đã tồn tại. Hãy đổi mã trong phần thông tin địa điểm.':e instanceof Error?e.message:'Không thể lưu sơ đồ. Hãy thử lại.');}
  finally{setBusy(false);}
 }
 const filtered=list.value?.filter(v=>`${v.name} ${v.templateKey}`.toLocaleLowerCase('vi').includes(query.toLocaleLowerCase('vi')));
 return <div className="venue-workspace">
  <AdminPageHeader title={mode==='editor'?'Thiết kế sơ đồ':'Sơ đồ địa điểm'} description={mode==='editor'?'Chọn khu trên sơ đồ để chỉnh sửa. Kéo để di chuyển; phím mũi tên để căn vị trí.':'Thư viện sơ đồ dùng lại cho các sự kiện. Giá vé và lượng vé mở bán được thiết lập riêng theo sự kiện.'}>
   {mode==='library'?<Button onClick={()=>setMode('presets')}><Plus size={17} className="mr-2"/>Tạo sơ đồ</Button>:<Button disabled={busy} variant="secondary" onClick={()=>mode==='editor'?leave():setMode('library')}><ArrowLeft size={16} className="mr-2"/>Thư viện</Button>}
  </AdminPageHeader>
  {success&&mode==='library'&&<div role="status" className="mb-5 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm"><CheckCircle2 size={18} className="inline mr-2 text-emerald-500"/>{success} <Link href="/admin/events/new">Tạo sự kiện →</Link></div>}
  {mode==='library'&&<>
   <ErrorMessage message={list.error}/>
   <div className="grid lg:grid-cols-[250px_minmax(0,1fr)] gap-5">
    <section className={`${panel} p-4 min-w-0`} aria-label="Thư viện sơ đồ">
     <label className="flex items-center gap-2 text-sm font-semibold"><Search size={16}/>Tìm sơ đồ</label><input aria-label="Tìm sơ đồ" className={fieldClass} placeholder="Tên hoặc mã địa điểm" value={query} onChange={e=>setQuery(e.target.value)}/>
     <p className="text-xs text-slate-400 my-4">{list.value?`${filtered?.length} sơ đồ`:'Đang tải thư viện…'}</p>
     <div className="space-y-2 max-h-[480px] overflow-y-auto">{filtered?.map(v=><button key={v.id} type="button" aria-pressed={selectedVenue===v.id} onClick={()=>setChosen(v.id)} className={`w-full text-left rounded-xl p-3 border transition ${selectedVenue===v.id?'border-indigo-500/50 bg-indigo-500/10':'border-transparent hover:bg-slate-800/60'}`}><span className="font-semibold text-sm block break-words">{v.name}</span><span className="text-xs text-slate-400 block mt-1 break-all">{v.templateKey} · v{v.templateVersion}</span></button>)}</div>
     {filtered?.length===0&&<p className="text-sm text-slate-400">{query?'Không tìm thấy sơ đồ phù hợp.':'Chưa có sơ đồ. Bắt đầu từ một bố cục có sẵn.'}</p>}
    </section>
    <section className={`${panel} p-5 min-w-0`}><ErrorMessage message={detail.error}/>{selectedVenue&&!detail.value&&!detail.error&&<p className="text-slate-400">Đang tải sơ đồ…</p>}
     {detail.value?<><div className="flex justify-between items-start gap-3 mb-5"><div><h2 className="font-bold text-lg break-words">{detail.value.name}</h2><p className="text-sm text-slate-400 mt-1">{detail.value.sections.length} khu · Phiên bản {detail.value.templateVersion}</p></div><span className="text-xs rounded-full border border-emerald-500/30 text-emerald-500 px-3 py-1 whitespace-nowrap">Đã lưu</span></div><VenuePreview venue={detail.value}/><div className="flex flex-wrap gap-2 mt-4">{detail.value.sections.map(s=><span key={s.id} className="text-xs border border-slate-700 rounded-lg p-2"><span style={{color:s.geometry.color}} aria-hidden="true">● </span>{s.name} · {s.type==='GA'?'Khu đứng':'Ghế đánh số'}</span>)}</div><p className="text-xs text-slate-400 mt-5">Mẫu đã lưu giữ nguyên cấu trúc ghế. Để đổi bố cục, hãy tạo sơ đồ mới.</p></>:!selectedVenue&&<div className="text-center text-slate-400 py-20"><MapPin size={40} className="mx-auto mb-4"/>Chọn sơ đồ để xem bố cục.</div>}
    </section>
   </div>
  </>}
  {mode==='presets'&&<section><h2 className="text-xl font-bold mb-2">Chọn bố cục khởi đầu</h2><p className="text-sm text-slate-400 mb-6">Các bố cục minh họa có thể chỉnh lại theo địa điểm của bạn.</p><div className="grid sm:grid-cols-3 gap-4">{presets.map(p=><button key={p.id} type="button" onClick={()=>start(p.id)} className={`${panel} p-4 text-left hover:border-indigo-500 transition focus-visible:outline-indigo-500`}><VenuePreview venue={preview(createPreset(p.id))}/><h3 className="font-bold mt-4">{p.name}</h3><p className="text-xs text-slate-400 mt-2">{p.description}</p><span className="text-indigo-400 text-sm block mt-4">Dùng bố cục →</span></button>)}</div></section>}
  {mode==='editor'&&<form onSubmit={e=>{e.preventDefault();setAttempted(true);if(!issues.length)setReview(true);}}>
   <fieldset disabled={busy||review} className="min-w-0 space-y-5">
    <div className={`${panel} p-4 grid sm:grid-cols-2 gap-4`}><label className="text-sm font-semibold">Tên địa điểm<input autoFocus required maxLength={200} placeholder="Ví dụ: Nhà hát Thành phố" className={fieldClass} value={draft.name} onChange={e=>change({...draft,name:e.target.value,...(!keyEdited?{templateKey:slugify(e.target.value)}:{})})}/></label><label className="text-sm font-semibold">Mã sơ đồ<input aria-label="Mã sơ đồ" aria-describedby="venue-key-help" required maxLength={100} pattern="[a-z0-9][a-z0-9-]*" className={fieldClass} value={draft.templateKey} onChange={e=>{setKeyEdited(true);change({...draft,templateKey:e.target.value});}}/><span id="venue-key-help" className="text-xs font-normal text-slate-400">Tự tạo từ tên; đổi mã nếu địa điểm có nhiều bố cục.</span></label></div>
    <div className="flex flex-wrap justify-between gap-3 items-center"><div className="flex items-center gap-2"><IconButton icon={Undo2} label="Hoàn tác" disabled={!history.past.length} onClick={()=>dispatch({type:'undo'})}/><IconButton icon={Redo2} label="Làm lại" disabled={!history.future.length} onClick={()=>dispatch({type:'redo'})}/><span className="text-xs text-slate-400 ml-2">Lưới 10 · Shift: 1 đơn vị</span></div><div className="flex flex-wrap items-center gap-3 text-sm"><span>{draft.sections.length} khu</span><span className="text-slate-400">·</span><span className="font-semibold">{seatCount(draft).toLocaleString('vi-VN')} ghế</span><Button type="submit"><Save size={16} className="mr-2"/>Kiểm tra & lưu</Button></div></div>
    <div className="grid xl:grid-cols-[minmax(0,1fr)_260px] gap-4 items-start">
     <section className={`${panel} p-3 min-w-0`}><div className="flex justify-between items-center px-2 pb-3"><h2 className="text-sm font-semibold flex items-center gap-2"><Grid2X2 size={16}/>Sơ đồ phân khu</h2><span className="text-xs text-slate-400">{draft.width} × {draft.height}</span></div><VenueCanvas draft={draft} selected={selected} onSelect={setSelection} onChange={change} issues={issues} disabled={busy||review}/><p className="text-xs text-slate-400 px-2 pt-3">Chọn một khu rồi kéo trên sơ đồ. Có thể chỉnh vị trí bằng bàn phím hoặc ô nhập bên cạnh.</p></section>
     <VenueInspector draft={draft} selected={selected} onChange={change} onCopy={()=>add(true)} onDelete={()=>{change({...draft,sections:draft.sections.filter(s=>s.id!==selected)});setSelection('stage');}}/>
    </div>
    <div className={`${panel} p-4`}><div className="flex justify-between items-center mb-3"><h2 className="font-semibold text-sm">Danh sách khu</h2><IconButton label="Thêm khu" icon={Plus} onClick={()=>add()} disabled={draft.sections.length>=20}/></div><div className="flex flex-wrap gap-2"><button type="button" className={`rounded-lg border px-3 py-2 text-sm ${selected==='stage'?'border-indigo-500':'border-slate-700'}`} aria-pressed={selected==='stage'} onClick={()=>setSelection('stage')}>Sân khấu</button>{draft.sections.map(s=><button key={s.id} type="button" aria-pressed={selected===s.id} onClick={()=>setSelection(s.id)} className={`rounded-lg border px-3 py-2 text-sm ${selected===s.id?'border-indigo-500 bg-indigo-500/10':'border-slate-700'}`}><span style={{color:s.color}} aria-hidden="true">● </span>{s.name}</button>)}</div></div>
    <details className={`${panel} p-4`}><summary className="cursor-pointer text-sm font-semibold">Kích thước toàn sơ đồ</summary><div className="max-w-sm mt-4"><Dimensions value={{x:0,y:0,width:draft.width,height:draft.height}} position={false} onChange={patch=>change({...draft,...patch})}/></div><p className="text-xs text-slate-400">Đơn vị tương đối để bố trí phân khu, không phải bản vẽ kích thước xây dựng. Tối đa 20 khu và 20.000 ghế.</p></details>
    {!!visibleIssues.length&&<section aria-label="Các lỗi sơ đồ" className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4"><h2 className="font-semibold text-sm mb-2">Cần điều chỉnh trước khi lưu</h2><ul className="space-y-2 text-sm">{visibleIssues.map((issue,i)=><li key={`${issue.target}-${i}`}><button type="button" className="text-left underline decoration-dotted underline-offset-4" onClick={()=>{if(issue.target!=='settings')setSelection(issue.target);}}>{issue.message}</button></li>)}</ul></section>}
    {notice&&<p role="status" className="text-sm text-amber-500">{notice}</p>}
   </fieldset><ErrorMessage message={error}/>
  </form>}
  <Modal isOpen={review} onClose={()=>{if(!busy)setReview(false);}} title="Kiểm tra sơ đồ trước khi lưu" maxWidth="2xl">
   <VenuePreview venue={preview(draft)}/><h3 className="font-bold text-lg mt-4">{draft.name}</h3><p className="text-sm text-slate-400 mt-2">{draft.sections.length} khu · {seatCount(draft).toLocaleString('vi-VN')} ghế đánh số · {draft.sections.filter(s=>s.type==='GA').length} khu đứng</p><p className="text-sm mt-4">Sơ đồ đã lưu có thể dùng cho nhiều sự kiện và không sửa trực tiếp. Giá vé, sức chứa khu đứng và thời gian mở bán sẽ được đặt riêng khi tạo sự kiện.</p><div className="flex justify-end flex-wrap gap-3 mt-6"><Button variant="secondary" disabled={busy} onClick={()=>setReview(false)}>Tiếp tục chỉnh sửa</Button><Button isLoading={busy} onClick={()=>void save()}><Save size={16} className="mr-2"/>Lưu sơ đồ</Button></div>
  </Modal>
 </div>;
}
