import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pick } from '@/components/Pick'
import { bill, fmtClock, inr, playedMinutes, type GameSession, type RatePlan } from '@/lib/billing'
import { PAY_METHODS, supabase, upsertCustomer, type Customer, type PayMethod, type Station } from '@/lib/supabase'

const err = (e: { message: string } | null) => e && toast.error(e.message)

export default function Floor() {
  const [stations, setStations] = useState<Station[]>([])
  const [plans, setPlans] = useState<RatePlan[]>([])
  const [open, setOpen] = useState<GameSession[]>([])
  const [now, setNow] = useState(Date.now())
  const [starting, setStarting] = useState<Station | null>(null)
  const [ending, setEnding] = useState<GameSession | null>(null)

  const load = useCallback(async () => {
    const [st, rp, se] = await Promise.all([
      supabase.from('stations').select('*').order('name'),
      supabase.from('rate_plans').select('*').order('players'),
      supabase.from('sessions').select('*, customers(name, phone)').neq('status', 'ended'),
    ])
    err(st.error || rp.error || se.error)
    setStations(st.data ?? [])
    setPlans(rp.data ?? [])
    setOpen(se.data ?? [])
  }, [])

  useEffect(() => {
    load()
    const ch = supabase
      .channel('floor')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, load)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, load)
      .subscribe()
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => { supabase.removeChannel(ch); clearInterval(t) }
  }, [load])

  const planById = useMemo(() => new Map(plans.map((p) => [p.id, p])), [plans])
  const byStation = useMemo(() => new Map(open.map((s) => [s.station_id, s])), [open])

  // Prepaid time alerts: once at 5 min left, once at time up (re-arms after extend).
  const warned = useRef(new Set<string>())
  useEffect(() => {
    for (const s of open) {
      if (s.mode !== 'prepaid' || !s.booked_minutes || s.status !== 'running') continue
      const left = s.booked_minutes - playedMinutes(s, now)
      const name = stations.find((x) => x.id === s.station_id)?.name
      const k5 = `${s.id}:${s.booked_minutes}:5`, k0 = `${s.id}:${s.booked_minutes}:0`
      if (left <= 0 && !warned.current.has(k0)) { warned.current.add(k0); toast.error(`${name}: time up!`, { duration: 30000 }) }
      else if (left <= 5 && left > 0 && !warned.current.has(k5)) { warned.current.add(k5); toast.warning(`${name}: 5 minutes left`) }
    }
  }, [now, open, stations])

  const pause = async (s: GameSession) =>
    err((await supabase.from('sessions').update({ status: 'paused', paused_at: new Date().toISOString() }).eq('id', s.id)).error)

  const resume = async (s: GameSession) => {
    const extra = Math.round((Date.now() - Date.parse(s.paused_at!)) / 1000)
    err((await supabase.from('sessions').update({ status: 'running', paused_at: null, paused_seconds: s.paused_seconds + extra }).eq('id', s.id)).error)
  }

  const extend = async (s: GameSession, min: number) =>
    err((await supabase.from('sessions').update({ booked_minutes: (s.booked_minutes ?? 0) + min }).eq('id', s.id)).error)

  return (
    <div className="grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
      {stations.map((st) => {
        const s = byStation.get(st.id)
        const plan = s && planById.get(s.rate_plan_id)
        const played = s ? playedMinutes(s, now) : 0
        const left = s?.mode === 'prepaid' && s.booked_minutes ? s.booked_minutes - played : null
        const live = s && plan ? bill(plan, played, s.booked_minutes, new Date(s.started_at)) : null
        const tone = st.status === 'maintenance' ? 'bg-muted' : !s ? 'border-green-500/60'
          : left != null && left <= 0 ? 'border-red-500 animate-pulse' : left != null && left <= 5 ? 'border-amber-500' : 'border-blue-500/60'
        return (
          <Card key={st.id} className={`border-2 ${tone}`}>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>{st.name}</CardTitle>
              <Badge variant={s ? 'default' : 'secondary'}>
                {st.status === 'maintenance' ? 'Maintenance' : s ? (s.status === 'paused' ? 'Paused' : 'Running') : 'Free'}
              </Badge>
            </CardHeader>
            <CardContent className="space-y-3">
              {s && plan && live ? (
                <>
                  <div className="text-3xl font-mono tabular-nums">{fmtClock(left ?? played)}</div>
                  <div className="text-xs text-muted-foreground">
                    {left != null ? 'remaining' : 'elapsed'} · {plan.name} · {s.mode}
                    {s.customers && <> · {s.customers.name || s.customers.phone}</>}
                  </div>
                  <div className="text-sm">Bill so far: <b>{inr(live.amount)}</b> ({live.minutes} min)</div>
                  <div className="flex flex-wrap gap-2">
                    {s.status === 'paused'
                      ? <Button size="sm" variant="outline" onClick={() => resume(s)}>Resume</Button>
                      : <Button size="sm" variant="outline" onClick={() => pause(s)}>Pause</Button>}
                    {s.mode === 'prepaid' && <Button size="sm" variant="outline" onClick={() => extend(s, 30)}>+30m</Button>}
                    <Button size="sm" variant="destructive" onClick={() => setEnding(s)}>End</Button>
                  </div>
                </>
              ) : st.status === 'active' ? (
                <Button className="w-full" onClick={() => setStarting(st)}>Start session</Button>
              ) : (
                <p className="text-sm text-muted-foreground">Out of service</p>
              )}
            </CardContent>
          </Card>
        )
      })}
      {stations.length === 0 && <p className="text-muted-foreground">No stations. Add them in Settings.</p>}
      {starting && <StartDialog station={starting} plans={plans} onClose={() => setStarting(null)} />}
      {ending && planById.get(ending.rate_plan_id) && (
        <CheckoutDialog s={ending} plan={planById.get(ending.rate_plan_id)!} onClose={() => setEnding(null)} />
      )}
    </div>
  )
}

function StartDialog({ station, plans, onClose }: { station: Station; plans: RatePlan[]; onClose: () => void }) {
  const options = plans.filter((p) => p.active && p.console_type === station.console_type)
  const [planId, setPlanId] = useState(options[0]?.id ?? '')
  const [mode, setMode] = useState<'prepaid' | 'postpaid'>('postpaid')
  const [booked, setBooked] = useState('60')
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const start = async () => {
    const plan = plans.find((p) => p.id === planId)
    if (!plan) return toast.error('Pick a rate plan')
    setBusy(true)
    try {
      const customer = await upsertCustomer(phone, name)
      const { error } = await supabase.from('sessions').insert({
        station_id: station.id, rate_plan_id: plan.id, players: plan.players, mode,
        booked_minutes: mode === 'prepaid' ? Number(booked) : null, customer_id: customer?.id ?? null,
      })
      if (error) throw error
      toast.success(`${station.name} started`)
      onClose()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Start — {station.name}</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1.5">
            <Label>Rate plan</Label>
            <Pick value={planId} onChange={setPlanId}
              items={options.map((p) => ({ value: p.id, label: `${p.name} (${p.players}P) — ${inr(p.rate_per_hour)}/hr` }))} />
          </div>
          <div className="space-y-1.5">
            <Label>Billing</Label>
            <Pick value={mode} onChange={(v) => setMode(v as typeof mode)}
              items={[{ value: 'postpaid', label: 'Postpaid (open timer)' }, { value: 'prepaid', label: 'Prepaid (fixed time)' }]} />
          </div>
          {mode === 'prepaid' && (
            <div className="space-y-1.5">
              <Label htmlFor="booked">Minutes</Label>
              <Input id="booked" type="number" min={15} step={15} value={booked} onChange={(e) => setBooked(e.target.value)} />
            </div>
          )}
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label htmlFor="phone">Phone (optional)</Label>
              <Input id="phone" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cname">Name</Label>
              <Input id="cname" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button disabled={busy || !planId || (mode === 'prepaid' && !(Number(booked) > 0))} onClick={start}>Start</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function CheckoutDialog({ s, plan, onClose }: { s: GameSession; plan: RatePlan; onClose: () => void }) {
  // Freeze the bill at the moment the dialog opens.
  const [at] = useState(Date.now())
  const played = playedMinutes(s, at)
  const { minutes, amount } = bill(plan, played, s.booked_minutes, new Date(s.started_at))
  const [discount, setDiscount] = useState('0')
  const payable = Math.max(0, amount - (Number(discount) || 0))
  const [pay, setPay] = useState<Record<PayMethod, string>>({ cash: '', upi: '', card: '', wallet: '' })
  const [customer, setCustomer] = useState<Customer | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (s.customer_id) supabase.from('customers').select('*').eq('id', s.customer_id).single().then(({ data }) => setCustomer(data))
  }, [s.customer_id])

  const methods = PAY_METHODS.filter((m) => m !== 'wallet' || customer)
  const paid = methods.reduce((t, m) => t + (Number(pay[m]) || 0), 0)
  const remaining = Math.round((payable - paid) * 100) / 100

  const finish = async () => {
    setBusy(true)
    const { error } = await supabase.rpc('end_session', {
      p_session_id: s.id, p_billed_minutes: minutes, p_amount: amount,
      p_discount: amount - payable,
      p_payments: methods.map((m) => ({ method: m, amount: Number(pay[m]) || 0 })),
    })
    setBusy(false)
    if (error) return toast.error(error.message)
    toast.success(`Session closed — ${inr(payable)}`)
    onClose()
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Checkout</DialogTitle></DialogHeader>
        <div className="space-y-1 text-sm">
          <div>Played: <b>{fmtClock(played)}</b> · Billed: <b>{minutes} min</b> on {plan.name}</div>
          <div>Amount: <b>{inr(amount)}</b></div>
          {customer && <div>Customer: {customer.name || customer.phone} · Wallet {inr(customer.wallet_balance)}</div>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5 col-span-2">
            <Label htmlFor="disc">Discount (₹)</Label>
            <Input id="disc" type="number" min={0} max={amount} value={discount} onChange={(e) => setDiscount(e.target.value)} />
          </div>
          {methods.map((m) => (
            <div key={m} className="space-y-1.5">
              <Label htmlFor={`pay-${m}`} className="capitalize">{m === 'upi' ? 'UPI' : m}</Label>
              <div className="flex gap-1">
                <Input id={`pay-${m}`} type="number" min={0} value={pay[m]} onChange={(e) => setPay({ ...pay, [m]: e.target.value })} />
                <Button type="button" size="sm" variant="ghost" disabled={remaining <= 0}
                  onClick={() => setPay({ ...pay, [m]: String((Number(pay[m]) || 0) + remaining) })}>Rest</Button>
              </div>
            </div>
          ))}
        </div>
        <div className="text-lg">Payable <b>{inr(payable)}</b>
          {remaining !== 0 && <span className="text-sm text-destructive ml-2">{remaining > 0 ? `${inr(remaining)} left` : `${inr(-remaining)} over`}</span>}
        </div>
        <DialogFooter>
          <Button disabled={busy || remaining !== 0 || payable > amount} onClick={finish}>Confirm payment & end</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
