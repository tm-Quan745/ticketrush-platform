import React from 'react';
import { Button, type ButtonProps } from './Button';
import type { LucideIcon } from 'lucide-react';

export function IconButton({label,icon:Icon,className='',...props}:Omit<ButtonProps,'children'|'aria-label'|'title'> & {label:string;icon:LucideIcon}) {
  return <Button type="button" variant="secondary" {...props} aria-label={label} title={label} className={`h-11 w-11 shrink-0 p-0 ${className}`}><Icon size={18} aria-hidden="true"/></Button>;
}
