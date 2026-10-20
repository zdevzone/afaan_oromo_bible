// Adapted from the MIT-licensed shadcn/ui Radix Select pattern.
import type { ComponentProps } from 'react'
import * as Primitive from '@radix-ui/react-select'
import { Check, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '../../lib/utils'

export const Select = Primitive.Root
export const SelectValue = Primitive.Value

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof Primitive.Trigger>) {
  return <Primitive.Trigger className={cn('ui-input ui-select-trigger', className)} {...props}>
    {children}<Primitive.Icon asChild><ChevronDown size={15} aria-hidden="true" /></Primitive.Icon>
  </Primitive.Trigger>
}

export function SelectContent({ className, children, ...props }: ComponentProps<typeof Primitive.Content>) {
  return <Primitive.Portal><Primitive.Content className={cn('ui-select-content', className)} position="popper" sideOffset={5} {...props}>
    <Primitive.ScrollUpButton className="select-scroll"><ChevronUp size={14} aria-hidden="true" /></Primitive.ScrollUpButton>
    <Primitive.Viewport>{children}</Primitive.Viewport>
    <Primitive.ScrollDownButton className="select-scroll"><ChevronDown size={14} aria-hidden="true" /></Primitive.ScrollDownButton>
  </Primitive.Content></Primitive.Portal>
}

export function SelectItem({ className, children, ...props }: ComponentProps<typeof Primitive.Item>) {
  return <Primitive.Item className={cn('ui-select-item', className)} {...props}>
    <Primitive.ItemText>{children}</Primitive.ItemText>
    <Primitive.ItemIndicator className="select-indicator"><Check size={15} aria-hidden="true" /></Primitive.ItemIndicator>
  </Primitive.Item>
}

export function SelectField({ label, value, onValueChange, options, id }: { label: string; value: string; onValueChange(value: string): void; options: { value: string; label: string }[]; id: string }) {
  return <div className="field"><label htmlFor={id}>{label}</label><Select value={value} onValueChange={onValueChange}>
    <SelectTrigger id={id}><SelectValue /></SelectTrigger>
    <SelectContent>{options.map(option => <SelectItem value={option.value} key={option.value}>{option.label}</SelectItem>)}</SelectContent>
  </Select></div>
}
