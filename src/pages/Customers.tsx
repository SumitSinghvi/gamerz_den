import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Pick } from '@/components/Pick'
import { inr } from '@/lib/billing'
import { supabase, upsertCustomer, type Customer } from '@/lib/supabase'

export default function Customers() {
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<Customer[]>([])
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [topup, setTopup] = useState<Customer | null>(null)

  const load = useCallback(async () => {
    let query = supabase.from('customers').select('*').order('created_at', { ascending: false }).limit(50)
    const term = q.trim().replace(/[%,()]/g, '')
    if (term) query = query.or(`phone.ilike.%${term}%,name.ilike.%${term}%`)
    const { data, error } = await query
    if (error) toast.error(error.message)
    setRows(data ?? [])
  }, [q])

  useEffect(() => { load() }, [load])

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      await upsertCustomer(phone, name)
      setPhone(''); setName('')
      load()
    } catch (er) {
      toast.error((er as Error).message)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl">
      <form onSubmit={add} className="flex flex-wrap gap-2 items-end">
        <div className="space-y-1.5"><Label htmlFor="np">Phone</Label><Input id="np" required inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
        <div className="space-y-1.5"><Label htmlFor="nn">Name</Label><Input id="nn" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button type="submit">Add customer</Button>
      </form>
      <Input placeholder="Search phone or name…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Table>
        <TableHeader><TableRow><TableHead>Phone</TableHead><TableHead>Name</TableHead><TableHead className="text-right">Wallet</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {rows.map((c) => (
            <TableRow key={c.id}>
              <TableCell>{c.phone}</TableCell>
              <TableCell>{c.name}</TableCell>
              <TableCell className="text-right">{inr(c.wallet_balance)}</TableCell>
              <TableCell className="text-right"><Button size="sm" variant="outline" onClick={() => setTopup(c)}>Top up</Button></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {topup && <TopupDialog c={topup} onClose={() => { setTopup(null); load() }} />}
    </div>
  )
}

function TopupDialog({ c, onClose }: { c: Customer; onClose: () => void }) {
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('cash')
  const save = async () => {
    const { error } = await supabase.from('payments').insert({ kind: 'wallet_topup', customer_id: c.id, method, amount: Number(amount) })
    if (error) return toast.error(error.message)
    toast.success(`Added ${inr(Number(amount))} to wallet`)
    onClose()
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Top up — {c.name || c.phone}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5"><Label htmlFor="ta">Amount (₹)</Label><Input id="ta" type="number" min={1} value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Paid by</Label>
            <Pick value={method} onChange={setMethod} items={[{ value: 'cash', label: 'Cash' }, { value: 'upi', label: 'UPI' }, { value: 'card', label: 'Card' }]} />
          </div>
        </div>
        <DialogFooter><Button disabled={!(Number(amount) > 0)} onClick={save}>Add to wallet</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
