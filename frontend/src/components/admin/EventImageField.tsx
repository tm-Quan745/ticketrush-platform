import React, {useEffect,useRef,useState} from 'react';
import {api,ApiError} from '../../api/client';
import {ErrorMessage,fieldClass} from '../../pages/shared';

export function EventImageField({value,onChange,onUploadingChange}:{value:string;onChange:(value:string)=>void;onUploadingChange?:(busy:boolean)=>void}) {
 const [failed,setFailed]=useState(false),[uploading,setUploading]=useState(false),[error,setError]=useState('');
 const controller=useRef<AbortController|null>(null);
 useEffect(()=>()=>controller.current?.abort(),[]);
 const pattern='https://res\\.cloudinary\\.com/[A-Za-z0-9_\\-]+/image/upload/[^\\s?#]+(?:\\?[^\\s#]*)?';
 const valid=new RegExp(`^(?:${pattern})$`).test(value);
 async function select(e:React.ChangeEvent<HTMLInputElement>){
  const file=e.target.files?.[0];e.target.value='';if(!file)return;
  setError('');
  if(!['image/jpeg','image/png','image/gif'].includes(file.type)||file.size===0||file.size>5*1024*1024){
   setError('Vui lòng chọn ảnh JPEG, PNG hoặc GIF, tối đa 5 MiB.');return;
  }
  const request=new AbortController();controller.current=request;
  setUploading(true);onUploadingChange?.(true);
  try{const url=await api.uploadEventImage(file,request.signal);if(!request.signal.aborted){setFailed(false);onChange(url);}}
  catch(e){if(!request.signal.aborted){
   const messages:Record<string,string>={
    IMAGE_UPLOAD_CREDENTIALS_REJECTED:'Cloudinary từ chối API key/API secret. Hãy kiểm tra CLOUDINARY_URL trong .env và khởi động lại backend.',
    IMAGE_UPLOAD_NOT_CONFIGURED:'Chưa cấu hình Cloudinary. Hãy thêm CLOUDINARY_URL vào .env và khởi động lại backend.',
    IMAGE_UPLOAD_CONNECTION_FAILED:'Không kết nối được Cloudinary hoặc đã hết thời gian chờ. Vui lòng thử lại.',
   };
   setError(e instanceof ApiError ? messages[e.data?.code]||e.message : (e as Error).message);
  }}
  finally{if(!request.signal.aborted){setUploading(false);onUploadingChange?.(false);}}
 }
 return <div className="space-y-2">
  <label className="block">Ảnh sự kiện
   <input type="file" accept="image/jpeg,image/png,image/gif" disabled={uploading} className={fieldClass} onChange={select}/>
  </label>
  <p className="text-sm text-slate-400">Chọn ảnh từ máy (JPEG, PNG hoặc GIF, tối đa 5 MiB). Ảnh sẽ được tải lên tự động.</p>
  {uploading&&<p role="status">Đang tải ảnh lên…</p>}
  <ErrorMessage message={error}/>
  {valid&&!failed&&<img src={value} alt="Xem trước ảnh sự kiện" className="max-h-48 rounded-lg object-contain" onError={()=>setFailed(true)}/>}
  {valid&&failed&&<p role="status" className="text-sm text-amber-300">Không tải được ảnh. Hãy kiểm tra ảnh có thể truy cập công khai.</p>}
  {value&&<button type="button" disabled={uploading} onClick={()=>{onChange('');setFailed(false);setError('');}} className="text-sm underline">Bỏ ảnh</button>}
 </div>;
}
