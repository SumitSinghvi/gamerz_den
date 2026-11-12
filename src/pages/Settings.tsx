import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Pick } from '@/components/Pick'
import type { RatePlan } from '@/lib/billing'
import { supabase, type Profile, type Station } from '@/lib/supabase'
import { refresh, run, useRatePlans, useStations } from '@/lib/queries'

const done = (error: { message: string } | null, msg = 'Saved') => (error ? toast.error(error.message) : toast.success(msg))

export default function Settings({ isOwner }: { isOwner: boolean }) {
  return (
    <Tabs defaultValue="rates" className="space-y-4">
      <TabsList>
        <TabsTrigger value="rates">Rates</TabsTrigger>
        <TabsTrigger value="stations">Stations</TabsTrigger>
        <TabsTrigger value="staff">Staff</TabsTrigger>
      </TabsList>
      {!isOwner && <p className="text-sm text-muted-foreground">Read-only — only the owner can change settings.</p>}
      <TabsContent value="rates"><Rates ro={!isOwner} /></TabsContent>
      <TabsContent value="stations"><Stations ro={!isOwner} /></TabsContent>
      <TabsContent value="staff"><Staff ro={!isOwner} /></TabsContent>
    </Tabs>
  )
}

function Rates({ ro }: { ro: boolean }) {
  // Unsaved edits per plan id, layered over cached rows so a background refetch never wipes typing.
  const [edits, setEdits] = useState<Record<string, Partial<RatePlan>>>({})
  const rows = (useRatePlans().data ?? []).map((r) => ({ ...r, ...edits[r.id] }))

  const set = (i: number, patch: Partial<RatePlan>) => {
    const id = rows[i].id
    setEdits({ ...edits, [id]: { ...edits[id], ...patch } })
  }
  const save = async (r: RatePlan) => {
    const { id, ...rest } = r
    const { error } = await supabase.from('rate_plans').update({ ...rest, peak_start: r.peak_start || null, peak_end: r.peak_end || null }).eq('id', id)
    done(error)
    if (error) return
    await refresh()
    setEdits((e) => Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)))
  }
  const add = async () => {
    const { error } = await supabase.from('rate_plans').insert({ name: 'New plan', rate_per_hour: 100 })
    if (error) return toast.error(error.message)
    refresh()
  }
  const num = (v: string) => (v === '' ? 0 : Number(v))

  return (
    <div className="space-y-3 overflow-x-auto">
      <Table>
        <TableHeader className="max-md:hidden">
          <TableRow>
            <TableHead>Name</TableHead><TableHead>Console</TableHead><TableHead>Players</TableHead><TableHead>₹/hr</TableHead>
            <TableHead>Peak ₹/hr</TableHead><TableHead>Peak from</TableHead><TableHead>Peak to</TableHead>
            <TableHead>Block (min)</TableHead><TableHead>Grace (min)</TableHead><TableHead>Active</TableHead><TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((r, i) => (
            <TableRow key={r.id} className="max-md:grid max-md:grid-cols-2 max-md:gap-x-3 max-md:gap-y-2 max-md:py-3">
              <C label="Name" className="max-md:col-span-2"><Input disabled={ro} value={r.name} onChange={(e) => set(i, { name: e.target.value })} /></C>
              <C label="Console"><Input disabled={ro} className="md:w-24" value={r.console_type} onChange={(e) => set(i, { console_type: e.target.value })} /></C>
              <C label="Players"><Input disabled={ro} className="md:w-16" type="number" min={1} value={r.players} onChange={(e) => set(i, { players: num(e.target.value) })} /></C>
              <C label="₹/hr"><Input disabled={ro} className="md:w-20" type="number" min={0} value={r.rate_per_hour} onChange={(e) => set(i, { rate_per_hour: num(e.target.value) })} /></C>
              <C label="Peak ₹/hr"><Input disabled={ro} className="md:w-20" type="number" min={0} value={r.peak_rate_per_hour ?? ''} onChange={(e) => set(i, { peak_rate_per_hour: e.target.value === '' ? null : Number(e.target.value) })} /></C>
              <C label="Peak from"><Input disabled={ro} type="time" value={r.peak_start?.slice(0, 5) ?? ''} onChange={(e) => set(i, { peak_start: e.target.value })} /></C>
              <C label="Peak to"><Input disabled={ro} type="time" value={r.peak_end?.slice(0, 5) ?? ''} onChange={(e) => set(i, { peak_end: e.target.value })} /></C>
              <C label="Block (min)"><Input disabled={ro} className="md:w-16" type="number" min={1} value={r.block_minutes} onChange={(e) => set(i, { block_minutes: num(e.target.value) })} /></C>
              <C label="Grace (min)"><Input disabled={ro} className="md:w-16" type="number" min={0} value={r.grace_minutes} onChange={(e) => set(i, { grace_minutes: num(e.target.value) })} /></C>
              <C label="Active"><input type="checkbox" aria-label="Active" disabled={ro} checked={r.active} onChange={(e) => set(i, { active: e.target.checked })} /></C>
              <TableCell className="max-md:col-span-2 max-md:p-0">{!ro && <Button size="sm" className="max-md:h-9 max-md:w-full" onClick={() => save(r)}>Save</Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!ro && <Button variant="outline" onClick={add}>Add rate plan</Button>}
    </div>
  )
}

// Table cell that shows its column label above the value when rows stack into cards (< md).
const C = ({ label, className, ...props }: React.ComponentProps<typeof TableCell> & { label: string }) => (
  <TableCell data-label={label} className={`max-md:p-0 max-md:before:mb-1 max-md:before:block max-md:before:text-xs max-md:before:text-muted-foreground max-md:before:content-[attr(data-label)] ${className ?? ''}`} {...props} />
)

function Stations({ ro }: { ro: boolean }) {
  const rows = useStations().data ?? []
  const [name, setName] = useState('')
  const [type, setType] = useState('PS5')
  const load = refresh

  const add = async (e: React.FormEvent) => {
    e.preventDefault()
    const { error } = await supabase.from('stations').insert({ name: name.trim(), console_type: type.trim() || 'PS5' })
    if (error) return toast.error(error.message)
    setName('')
    load()
  }
  const toggle = async (s: Station) => {
    const { error } = await supabase.from('stations').update({ status: s.status === 'active' ? 'maintenance' : 'active' }).eq('id', s.id)
    if (error) return toast.error(error.message)
    load()
  }

  return (
    <div className="space-y-3 max-w-xl">
      <Table>
        <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Console</TableHead><TableHead>Status</TableHead><TableHead /></TableRow></TableHeader>
        <TableBody>
          {rows.map((s) => (
            <TableRow key={s.id}>
              <TableCell>{s.name}</TableCell><TableCell>{s.console_type}</TableCell><TableCell>{s.status}</TableCell>
              <TableCell className="text-right">{!ro && <Button size="sm" variant="outline" onClick={() => toggle(s)}>{s.status === 'active' ? 'Set maintenance' : 'Set active'}</Button>}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {!ro && (
        <form onSubmit={add} className="flex gap-2">
          <Input placeholder="Station name (e.g. PS5-5)" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input placeholder="Console type" className="w-32" value={type} onChange={(e) => setType(e.target.value)} />
          <Button type="submit">Add</Button>
        </form>
      )}
      <p className="text-xs text-muted-foreground">Console type must match a rate plan's console type for it to appear when starting a session.</p>
    </div>
  )
}

function Staff({ ro }: { ro: boolean }) {
  const rows = useQuery({ queryKey: ['profiles'], queryFn: () => run<Profile[]>(supabase.from('profiles').select('*').order('created_at')) }).data ?? []
  const load = refresh

  const setRole = async (p: Profile, role: string) => {
    done((await supabase.from('profiles').update({ role }).eq('id', p.id)).error, 'Role updated')
    load()
  }

  return (
    <Table className="max-w-xl">
      <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Role</TableHead></TableRow></TableHeader>
      <TableBody>
        {rows.map((p) => (
          <TableRow key={p.id}>
            <TableCell>{p.email}</TableCell>
            <TableCell>
              {ro ? p.role : (
                <Pick className="w-36" value={p.role} onChange={(v) => setRole(p, v)}
                  items={['owner', 'manager', 'cashier', 'pending'].map((r) => ({ value: r, label: r }))} />
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
