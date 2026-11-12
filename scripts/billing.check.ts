// Run: node scripts/billing.check.ts
import assert from 'node:assert/strict'
import { bill, hourlyRate, type RatePlan } from '../src/lib/billing.ts'

const r: RatePlan = {
  id: 'x', name: 'Solo', console_type: 'PS5', players: 1, rate_per_hour: 100,
  peak_rate_per_hour: null, peak_start: null, peak_end: null,
  block_minutes: 30, grace_minutes: 5, active: true,
}
const noon = new Date(2026, 0, 1, 12, 0)

assert.deepEqual(bill(r, 2, null, noon), { minutes: 30, amount: 50 }) // min one block
assert.deepEqual(bill(r, 35, null, noon), { minutes: 30, amount: 50 }) // within grace
assert.deepEqual(bill(r, 36, null, noon), { minutes: 60, amount: 100 }) // next block
assert.deepEqual(bill(r, 20, 120, noon), { minutes: 120, amount: 200 }) // prepaid floor
assert.deepEqual(bill(r, 126, 120, noon), { minutes: 150, amount: 250 }) // prepaid overtime

const peak = { ...r, peak_rate_per_hour: 150, peak_start: '22:00:00', peak_end: '02:00:00' }
assert.equal(hourlyRate(peak, new Date(2026, 0, 1, 23, 0)), 150) // wraps midnight
assert.equal(hourlyRate(peak, new Date(2026, 0, 1, 1, 0)), 150)
assert.equal(hourlyRate(peak, noon), 100)
console.log('billing ok')
