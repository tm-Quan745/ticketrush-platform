import React from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Button } from './ui/Button';
import { IconButton } from './ui/IconButton';

interface PaginationProps {
  page: number;
  totalPages: number;
  totalElements: number;
  onPageChange: (page: number) => void;
  itemLabel?: string;
}

export function paginationItems(page:number,totalPages:number):Array<number|'ellipsis'> {
  const pages=totalPages<=7?Array.from({length:totalPages},(_,index)=>index):
    [...new Set([0,totalPages-1,page-1,page,page+1].filter(value=>value>=0&&value<totalPages))].sort((a,b)=>a-b);
  const result:Array<number|'ellipsis'>=[];
  pages.forEach((value,index)=>{
    if(index>0&&value-pages[index-1]>1)result.push('ellipsis');
    result.push(value);
  });
  return result;
}

export function Pagination({ page, totalPages, totalElements, onPageChange, itemLabel='sự kiện' }: PaginationProps) {
  const changePage=(target:number)=>{if(target>=0&&target<totalPages&&target!==page)onPageChange(target);};
  return <nav aria-label={`Phân trang ${itemLabel}`} className="mt-6 flex flex-wrap items-center justify-between gap-4">
    <p className="text-sm text-slate-400" role="status">
      {totalElements} {itemLabel} · Trang {totalPages === 0 ? 0 : page + 1} / {totalPages}
    </p>
    <div className="flex flex-wrap items-center justify-center gap-1.5 w-full sm:w-auto">
      <IconButton label="Trang đầu" icon={ChevronsLeft} disabled={page<=0} onClick={()=>changePage(0)}/>
      <IconButton label="Trang trước" icon={ChevronLeft} disabled={page<=0} onClick={()=>changePage(page-1)}/>
      <div className="order-last basis-full sm:order-none sm:basis-auto flex justify-center items-center gap-1">
        {paginationItems(page,totalPages).map((item,index)=>item==='ellipsis'?<span key={`ellipsis-${index}`} aria-hidden="true" className="w-6 text-center text-slate-500">…</span>:
          <Button key={item} type="button" variant={item===page?'primary':'ghost'} aria-label={`Trang ${item+1}`} aria-current={item===page?'page':undefined} onClick={()=>changePage(item)} className="h-11 min-w-9 px-2 rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-400">{item+1}</Button>)}
      </div>
      <IconButton label="Trang sau" icon={ChevronRight} disabled={page+1>=totalPages} onClick={()=>changePage(page+1)}/>
      <IconButton label="Trang cuối" icon={ChevronsRight} disabled={page+1>=totalPages} onClick={()=>changePage(totalPages-1)}/>
    </div>
  </nav>;
}
