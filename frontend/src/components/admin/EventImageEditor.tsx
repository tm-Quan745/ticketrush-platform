import React, {useState} from 'react';
import {api} from '../../api/client';
import type {Event} from '../../types';
import {Button,ErrorMessage} from '../../pages/shared';
import {EventImageField} from './EventImageField';

export function EventImageEditor({event,done}:{event:Event;done:()=>void}) {
 const [uploading,setUploading]=useState(false);
 const [imageUrl,setImageUrl]=useState(event.imageUrl||'');
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function submit(e:React.FormEvent){
  e.preventDefault();if(uploading||busy)return;setBusy(true);setError('');
  try{
   const {title,description,venueId,venueName,venueAddress,startTime,endTime,saleStartTime,saleEndTime}=event;
   await api.request(`/admin/events/${event.id}`,{method:'PUT',body:JSON.stringify({title,description,venueId,venueName,venueAddress,startTime,endTime,saleStartTime,saleEndTime,imageUrl:imageUrl.trim()||null})});
   done();
  }catch(e){setError((e as Error).message);}finally{setBusy(false);}
 }
 return <form onSubmit={submit} className="my-4 space-y-3"><fieldset disabled={busy}>
  <EventImageField value={imageUrl} onChange={setImageUrl} onUploadingChange={setUploading}/>
 </fieldset><ErrorMessage message={error}/><Button type="submit" isLoading={busy} disabled={uploading}>Lưu ảnh sự kiện</Button></form>;
}
