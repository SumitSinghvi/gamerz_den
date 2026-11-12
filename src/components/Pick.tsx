import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Item = { value: string; label: string }

/** Thin wrapper over shadcn Select for simple value/label lists. */
export function Pick({ value, onChange, items, className, id }: {
  value: string
  onChange: (v: string) => void
  items: Item[]
  className?: string
  id?: string
}) {
  return (
    <Select items={items} value={value} onValueChange={(v) => onChange(v as string)}>
      <SelectTrigger id={id} className={className ?? 'w-full'}><SelectValue /></SelectTrigger>
      <SelectContent>
        {items.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
