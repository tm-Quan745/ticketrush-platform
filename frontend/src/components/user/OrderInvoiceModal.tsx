import React from 'react';
import type {Order,Ticket} from '../../types';
import type {UserOrder} from '../../features/tickets/types/ticket.types';
import {Modal} from '../ui/Modal';
import {Button} from '../ui/Button';
import {money} from '../../pages/shared';
import {vi,stateLabel} from '../../i18n/vi';
export function OrderInvoiceModal({order,onClose}:{order:Order|UserOrder|null;tickets?:Ticket[];onClose:()=>void;onRefundRequested?:(id:string)=>void}) {
 if(!order)return null;
 return <Modal isOpen onClose={onClose} title={vi.invoice}><div className="print-ticket bg-slate-950 border border-slate-700 rounded-2xl p-5 space-y-4">
 <h2 className="text-2xl font-black">TicketRush</h2><p className="break-all text-xs">{order.id}</p><p>{stateLabel(order.status)}</p>
 {order.createdAt&&<p>{vi.created}: {new Date(order.createdAt).toLocaleString('vi-VN')}</p>}
 {order.items.map((item,index)=><div key={index} className="border-b border-slate-700 py-3"><p className="font-bold">{item.tierName}</p><p>{vi.quantity}: {item.quantity}</p>{item.unitPrice!==undefined&&order.currency&&<p>{money(item.unitPrice*item.quantity,order.currency)}</p>}</div>)}
 {order.currency&&<p className="text-2xl font-black">{vi.orderAmount}: {money(order.totalAmount,order.currency)}</p>}
 </div><Button className="mt-4 w-full print:hidden" onClick={()=>window.print()}>{vi.print}</Button></Modal>;
}
