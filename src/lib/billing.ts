export type RatePlan = {
  id: string
  name: string
  console_type: string
  players: number
  rate_per_hour: number
  peak_rate_per_hour: number | null
  peak_start: string | null // 'HH:MM:SS'
  peak_end: string | null
  block_minutes: number
  grace_minutes: number
  active: boolean
}

export type GameSession = {
  id: string
  station_id: string
  customer_id: string | null
  rate_plan_id: string
  players: number
  mode: 'prepaid' | 'postpaid'
  status: 'running' | 'paused' | 'ended'
  booked_minutes: number | null
  started_at: string
  paused_at: string | null
  paused_seconds: number
  customers?: { name: string | null; phone: string } | null
}

/** Minutes actually played (excludes paused time). */
export function playedMinutes(s: GameSession, now = Date.now()): number {
  const until = s.paused_at ? Date.parse(s.paused_at) : now
  return Math.max(0, (until - Date.parse(s.started_at)) / 60000 - s.paused_seconds / 60)
}

const toMin = (t: string) => {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

/** Peak rate applies if the session started inside the peak window (window may wrap midnight). */
export function hourlyRate(r: RatePlan, startedAt: Date): number {
  if (r.peak_rate_per_hour == null || !r.peak_start || !r.peak_end) return r.rate_per_hour
  const t = startedAt.getHours() * 60 + startedAt.getMinutes()
  const a = toMin(r.peak_start)
  const b = toMin(r.peak_end)
  const inPeak = a <= b ? t >= a && t < b : t >= a || t < b
  return inPeak ? r.peak_rate_per_hour : r.rate_per_hour
}

/**
 * Billable minutes: grace is forgiven, rest rounds up to whole blocks (min one block).
 * Prepaid never bills below the booked time.
 */
export function bill(r: RatePlan, played: number, booked: number | null, startedAt: Date) {
  const blocks = Math.max(1, Math.ceil(Math.max(0, played - r.grace_minutes) / r.block_minutes))
  const minutes = Math.max(blocks * r.block_minutes, booked ?? 0)
  return { minutes, amount: Math.round((minutes / 60) * hourlyRate(r, startedAt)) }
}

export const fmtClock = (min: number) => {
  const s = Math.floor(Math.abs(min) * 60)
  const hh = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, '0')
  const ss = String(s % 60).padStart(2, '0')
  return `${min < 0 ? '-' : ''}${hh}:${mm}:${ss}`
}

export const inr = (n: number) => '₹' + n.toLocaleString('en-IN', { maximumFractionDigits: 2 })
