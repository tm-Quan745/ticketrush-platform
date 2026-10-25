import React from 'react';
import type {Ticket} from '../../types';
import {Modal} from '../ui/Modal';
import {Button} from '../ui/Button';
import {TicketPass} from '../../features/tickets/components/TicketPass';
import {vi} from '../../i18n/vi';
export function PrintableTicketModal({ticket,onClose}:{ticket:Ticket|null;onClose:()=>void}) {
 if(!ticket)return null;
 return <Modal isOpen onClose={onClose} title={vi.printTicket}><div className="print-ticket"><TicketPass ticket={ticket}/></div><Button className="mt-4 w-full print:hidden" onClick={()=>window.print()}>{vi.print}</Button></Modal>;
}
