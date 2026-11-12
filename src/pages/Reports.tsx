import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { inr } from '@/lib/billing'
import { supabase } from '@/lib/supabase'

type Row = { kind: string; method: string; amount: number; sessions: { stations: { name: string } | null } | null }
type Ended = {
  id: string; started_at: string; ended_at: string; billed_minutes: number | null; amount: number | null; discount: number
  stations: { name: string } | null; customers: { name: string | null; phone: string } | null
  rate_plans: { name: string } | null; payments: { method: string; amount: number }[]
}

const hm = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

const today = () => new Date().toLocaleDateString('en-CA') // YYYY-MM-DD local

const sumBy = (rows: Row[], key: (r: Row) => string) => {
  const m = new Map<string, number>()
  for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + Number(r.amount))
  return [...m].sort((a, b) => b[1] - a[1])
}

export default function Reports() {
  const [day, setDay] = useState(today())
  const { data } = useQuery({
    queryKey: ['reports', day],
    queryFn: async () => {
      const from = new Date(`${day}T00:00:00`)
      const to = new Date(from.getTime() + 864e5)
      const [a, b] = [from.toISOString(), to.toISOString()]
      const [p, s] = await Promise.all([
        supabase.from('payments').select('kind, method, amount, sessions(stations(name))').gte('created_at', a).lt('created_at', b),
        supabase.from('sessions')
          .select('id, started_at, ended_at, billed_minutes, amount, discount, stations(name), customers(name, phone), rate_plans(name), payments(method, amount)')
          .eq('status', 'ended').gte('ended_at', a).lt('ended_at', b).order('ended_at', { ascending: false }),
      ])
      const e = p.error || s.error
      if (e) throw new Error(e.message)
      return { rows: (p.data ?? []) as unknown as Row[], ended: (s.data ?? []) as unknown as Ended[] }
    },
    placeholderData: keepPreviousData,
  })
  const rows = data?.rows ?? []
  const ended = data?.ended ?? []
  const sessions = ended.length

  const sessionRows = rows.filter((r) => r.kind === 'session')
  const revenue = sessionRows.reduce((t, r) => t + Number(r.amount), 0)
  // Money actually collected today: excludes wallet redemptions (collected at top-up time).
  const collected = rows.filter((r) => r.method !== 'wallet').reduce((t, r) => t + Number(r.amount), 0)
  const byMethod = sumBy(rows.filter((r) => r.method !== 'wallet' || r.kind === 'session'), (r) => (r.kind === 'wallet_topup' ? `${r.method} (wallet top-up)` : r.method))
  const byStation = sumBy(sessionRows, (r) => r.sessions?.stations?.name ?? '—')

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-end gap-2">
        <div className="space-y-1.5"><Label htmlFor="day">Date</Label><Input id="day" type="date" value={day} onChange={(e) => setDay(e.target.value)} /></div>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Session revenue" value={inr(revenue)} />
        <Stat label="Cash/UPI/Card collected" value={inr(collected)} />
        <Stat label="Sessions ended" value={String(sessions)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <Breakdown title="By payment method" rows={byMethod} />
        <Breakdown title="By station" rows={byStation} />
      </div>
      <Card>
        <CardHeader><CardTitle>Sessions</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead><TableHead>Station</TableHead><TableHead>Customer</TableHead><TableHead>Plan</TableHead>
                <TableHead className="text-right">Min</TableHead><TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Discount</TableHead><TableHead>Paid by</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ended.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="tabular-nums">{hm(s.started_at)}–{hm(s.ended_at)}</TableCell>
                  <TableCell>{s.stations?.name ?? '—'}</TableCell>
                  <TableCell>{s.customers ? s.customers.name || s.customers.phone : 'Walk-in'}</TableCell>
                  <TableCell>{s.rate_plans?.name ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{s.billed_minutes ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">{inr(Number(s.amount ?? 0))}</TableCell>
                  <TableCell className="text-right tabular-nums">{Number(s.discount) ? inr(Number(s.discount)) : '—'}</TableCell>
                  <TableCell className="capitalize">
                    {s.payments.filter((p) => Number(p.amount) > 0).map((p) => `${p.method === 'upi' ? 'UPI' : p.method} ${inr(Number(p.amount))}`).join(', ') || '—'}
                  </TableCell>
                </TableRow>
              ))}
              {ended.length === 0 && <TableRow><TableCell colSpan={8} className="text-muted-foreground">No sessions ended this day</TableCell></TableRow>}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm text-muted-foreground font-normal">{label}</CardTitle></CardHeader>
      <CardContent className="text-2xl font-semibold tabular-nums">{value}</CardContent>
    </Card>
  )
}

function Breakdown({ title, rows }: { title: string; rows: [string, number][] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>
        <Table>
          <TableHeader><TableRow><TableHead>Item</TableHead><TableHead className="text-right">Amount</TableHead></TableRow></TableHeader>
          <TableBody>
            {rows.map(([k, v]) => (
              <TableRow key={k}><TableCell className="capitalize">{k}</TableCell><TableCell className="text-right tabular-nums">{inr(v)}</TableCell></TableRow>
            ))}
            {rows.length === 0 && <TableRow><TableCell colSpan={2} className="text-muted-foreground">No data</TableCell></TableRow>}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
