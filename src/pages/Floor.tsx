import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Pick } from '@/components/Pick'
import { XIcon } from 'lucide-react'
import { bill, fmtClock, inr, playedMinutes, type GameSession, type RatePlan } from '@/lib/billing'
import { PAY_METHODS, supabase, upsertCustomer, type Customer, type PayMethod, type Station } from '@/lib/supabase'

const err = (e: { message: string } | null) => e && toast.error(e.message)

export default function Floor() {
  const [stations, setStations] = useState<Station[]>([])
  const [plans, setPlans] = useState<RatePlan[]>([])
  const [open, setOpen] = useState<GameSession[]>([])
  const [now, setNow] = useState(Date.now())
  const [selId, setSelId] = useState<string | null>(null)

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

  const sel = stations.find((x) => x.id === selId)
  const selS = sel && byStation.get(sel.id)
  const selPlan = selS && planById.get(selS.rate_plan_id)
  const close = () => setSelId(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSelId(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="flex gap-4 items-start">
      <div className="flex-1 min-w-0 grid gap-4 grid-cols-[repeat(auto-fill,minmax(240px,1fr))]">
        {stations.map((st) => {
          const s = byStation.get(st.id)
          const plan = s && planById.get(s.rate_plan_id)
          const played = s ? playedMinutes(s, now) : 0
          const left = s?.mode === 'prepaid' && s.booked_minutes ? s.booked_minutes - played : null
          const live = s && plan ? bill(plan, played, s.booked_minutes, new Date(s.started_at)) : null
          const tone = st.status === 'maintenance' ? 'bg-muted' : !s ? 'border-green-500/60'
            : left != null && left <= 0 ? 'border-red-500 animate-pulse' : left != null && left <= 5 ? 'border-amber-500' : 'border-blue-500/60'
          return (
            <Card key={st.id} role="button" tabIndex={0}
              className={`border-2 ${tone} cursor-pointer hover:bg-muted/40 ${st.id === selId ? 'ring-2 ring-primary' : ''}`}
              onClick={() => setSelId(st.id)} onKeyDown={(e) => e.key === 'Enter' && setSelId(st.id)}>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle>{st.name}</CardTitle>
                <Badge variant={s ? 'default' : 'secondary'}>
                  {st.status === 'maintenance' ? 'Maintenance' : s ? (s.status === 'paused' ? 'Paused' : 'Running') : 'Free'}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-1">
                {s && plan && live ? (
                  <>
                    <div className="text-3xl font-mono tabular-nums">{fmtClock(left ?? played)}</div>
                    <div className="text-xs text-muted-foreground">
                      {left != null ? 'remaining' : 'elapsed'} · {plan.name} · {s.mode}
                      {s.customers && <> · {s.customers.name || s.customers.phone}</>}
                    </div>
                    <div className="text-sm">Bill so far: <b>{inr(live.amount)}</b></div>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">{st.status === 'active' ? 'Tap to start a session' : 'Out of service'}</p>
                )}
              </CardContent>
            </Card>
          )
        })}
        {stations.length === 0 && <p className="text-muted-foreground">No stations. Add them in Settings.</p>}
      </div>
      {sel && (
        <aside className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 overflow-y-auto border-l bg-background p-4 shadow-xl
          lg:sticky lg:top-4 lg:z-auto lg:max-h-[calc(100vh-2rem)] lg:shrink-0 lg:rounded-xl lg:border lg:shadow-none">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-heading text-base font-medium">{sel.name}</h2>
            <Button variant="ghost" size="icon-sm" onClick={close} aria-label="Close"><XIcon /></Button>
          </div>
          {selS && selPlan ? (
            <SessionPanel key={selS.id} s={selS} plan={selPlan} station={sel} now={now} reload={load} onDone={close} />
          ) : selS ? null : sel.status === 'active' ? (
            <StartForm key={sel.id} station={sel} plans={plans} onStarted={load} />
          ) : (
            <p className="text-sm text-muted-foreground">Out of service</p>
          )}
        </aside>
      )}
    </div>
  )
}

function SessionPanel({ s, plan, station, now, reload, onDone }:
  { s: GameSession; plan: RatePlan; station: Station; now: number; reload: () => void; onDone: () => void }) {
  const [checkout, setCheckout] = useState(false)
  const played = playedMinutes(s, now)
  const left = s.mode === 'prepaid' && s.booked_minutes ? s.booked_minutes - played : null
  const live = bill(plan, played, s.booked_minutes, new Date(s.started_at))

  const run = async (q: PromiseLike<{ error: { message: string } | null }>) => { err((await q).error); reload() }
  const pause = () => run(supabase.from('sessions').update({ status: 'paused', paused_at: new Date().toISOString() }).eq('id', s.id))
  const resume = () => {
    const extra = Math.round((Date.now() - Date.parse(s.paused_at!)) / 1000)
    run(supabase.from('sessions').update({ status: 'running', paused_at: null, paused_seconds: s.paused_seconds + extra }).eq('id', s.id))
  }
  const extend = (min: number) => run(supabase.from('sessions').update({ booked_minutes: (s.booked_minutes ?? 0) + min }).eq('id', s.id))
  // Hard delete for sessions started by mistake; audit_sessions trigger keeps a record. Never touches ended (paid) sessions.
  const remove = async () => {
    if (!confirm(`Delete this session on ${station.name}? Use only if it was started by mistake. No bill will be recorded.`)) return
    const { data, error } = await supabase.from('sessions').delete().eq('id', s.id).neq('status', 'ended').select('id')
    if (error) return toast.error(error.message)
    if (!data?.length) return toast.error('Session not deleted (already ended or not allowed)')
    toast.success('Session deleted')
    reload()
    onDone()
  }

  if (checkout) return <CheckoutForm s={s} plan={plan} onBack={() => setCheckout(false)} onDone={onDone} />

  return (
    <div className="space-y-4">
      <div>
        <div className="text-4xl font-mono tabular-nums">{fmtClock(left ?? played)}</div>
        <div className="text-xs text-muted-foreground">
          {left != null ? 'remaining' : 'elapsed'} · {s.status === 'paused' ? 'paused' : 'running'} on {station.name}
        </div>
      </div>
      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-muted-foreground">Plan</dt><dd>{plan.name} ({plan.players}P)</dd>
        <dt className="text-muted-foreground">Billing</dt><dd className="capitalize">{s.mode}{s.booked_minutes ? ` · ${s.booked_minutes} min` : ''}</dd>
        <dt className="text-muted-foreground">Started</dt><dd>{new Date(s.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</dd>
        {s.customers && <><dt className="text-muted-foreground">Customer</dt><dd>{s.customers.name || s.customers.phone}</dd></>}
        <dt className="text-muted-foreground">Bill so far</dt><dd><b>{inr(live.amount)}</b> ({live.minutes} min)</dd>
      </dl>
      {!s.customer_id && <AttachCustomer sessionId={s.id} onAttached={reload} />}
      <div className="flex flex-wrap gap-2">
        {s.status === 'paused'
          ? <Button variant="outline" onClick={resume}>Resume</Button>
          : <Button variant="outline" onClick={pause}>Pause</Button>}
        {s.mode === 'prepaid' && <Button variant="outline" onClick={() => extend(30)}>+30m</Button>}
      </div>
      <Button className="w-full" variant="destructive" onClick={() => setCheckout(true)}>End & checkout</Button>
      <Button className="w-full text-muted-foreground" variant="ghost" onClick={remove}>Delete session (started by mistake)</Button>
    </div>
  )
}

function StartForm({ station, plans, onStarted }: { station: Station; plans: RatePlan[]; onStarted: () => void }) {
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
      onStarted()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4">
        <h3 className="text-sm font-medium text-muted-foreground">Start session</h3>
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
          <CustomerFields phone={phone} name={name} setPhone={setPhone} setName={setName} />
        </div>
        <Button className="w-full" disabled={busy || !planId || (mode === 'prepaid' && !(Number(booked) > 0))} onClick={start}>Start</Button>
    </div>
  )
}

function CheckoutForm({ s, plan, onBack, onDone }: { s: GameSession; plan: RatePlan; onBack: () => void; onDone: () => void }) {
  // Freeze the bill at the moment checkout opens.
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
    onDone()
  }

  return (
    <div className="grid gap-4">
        <h3 className="text-sm font-medium text-muted-foreground">Checkout</h3>
        <div className="space-y-1 text-sm">
          <div>Played: <b>{fmtClock(played)}</b> · Billed: <b>{minutes} min</b> on {plan.name}</div>
          <div>Amount: <b>{inr(amount)}</b></div>
          {customer && <div>Customer: {customer.name || customer.phone} · Wallet {inr(customer.wallet_balance)}</div>}
        </div>
        {!customer && !s.customer_id && <AttachCustomer sessionId={s.id} onAttached={setCustomer} />}
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
        <div className="flex gap-2">
          <Button variant="outline" disabled={busy} onClick={onBack}>Back</Button>
          <Button className="flex-1" disabled={busy || remaining !== 0 || payable > amount} onClick={finish}>Confirm payment & end</Button>
        </div>
    </div>
  )
}

/** Phone + name inputs with live suggestions from existing customers; picking one fills both. */
function CustomerFields({ phone, name, setPhone, setName }:
  { phone: string; name: string; setPhone: (v: string) => void; setName: (v: string) => void }) {
  const [q, setQ] = useState('') // text last typed into phone or name
  const [matches, setMatches] = useState<Customer[]>([])

  useEffect(() => {
    const term = q.replace(/[,()%*\\]/g, '').trim() // keep PostgREST or() filter intact
    if (term.length < 2) return
    let live = true
    const t = setTimeout(async () => {
      const { data } = await supabase.from('customers').select('*').or(`phone.ilike.%${term}%,name.ilike.%${term}%`).limit(5)
      if (live) setMatches(data ?? [])
    }, 200)
    return () => { live = false; clearTimeout(t) }
  }, [q])

  const pick = (c: Customer) => { setPhone(c.phone); setName(c.name ?? ''); setQ('') }
  const shown = q.trim().length >= 2 ? matches : []

  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5">
          <Label htmlFor="phone">Phone (optional)</Label>
          <Input id="phone" inputMode="tel" autoComplete="off" value={phone} onChange={(e) => { setPhone(e.target.value); setQ(e.target.value) }} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="cname">Name</Label>
          <Input id="cname" autoComplete="off" value={name} onChange={(e) => { setName(e.target.value); setQ(e.target.value) }} />
        </div>
      </div>
      {shown.length > 0 && (
        <ul aria-label="Matching customers" className="rounded-md border divide-y text-sm">
          {shown.map((c) => (
            <li key={c.id}>
              <button type="button" className="w-full px-3 py-2.5 text-left hover:bg-muted" onClick={() => pick(c)}>
                <span className="font-medium">{c.name || 'No name'}</span> <span className="text-muted-foreground">{c.phone}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}

/** Attach a customer to a session that started without one (end_session reads customer_id from the session). */
function AttachCustomer({ sessionId, onAttached }: { sessionId: string; onAttached: (c: Customer) => void }) {
  const [phone, setPhone] = useState('')
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)

  const attach = async () => {
    setBusy(true)
    try {
      const c = await upsertCustomer(phone, name)
      if (!c) return
      const { error } = await supabase.from('sessions').update({ customer_id: c.id }).eq('id', sessionId)
      if (error) throw error
      toast.success(`Customer added: ${c.name || c.phone}`)
      onAttached(c)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-2 rounded-md border p-3">
      <h4 className="text-sm font-medium">Add customer</h4>
      <CustomerFields phone={phone} name={name} setPhone={setPhone} setName={setName} />
      <Button variant="outline" disabled={busy || !phone.trim()} onClick={attach}>Add customer</Button>
    </div>
  )
}
