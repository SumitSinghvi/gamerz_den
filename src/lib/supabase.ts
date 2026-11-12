import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_KEY)

export type Role = 'owner' | 'manager' | 'cashier' | 'pending'
export type Profile = { id: string; email: string | null; full_name: string | null; role: Role }
export type Station = { id: string; name: string; console_type: string; status: 'active' | 'maintenance' }
export type Customer = { id: string; phone: string; name: string | null; wallet_balance: number }
export type PayMethod = 'cash' | 'upi' | 'card' | 'wallet'
export const PAY_METHODS: PayMethod[] = ['cash', 'upi', 'card', 'wallet']

/** Find customer by phone, creating one if missing. Empty phone = walk-in (null). */
export async function upsertCustomer(phone: string, name: string): Promise<Customer | null> {
  phone = phone.trim()
  if (!phone) return null
  const { data: found } = await supabase.from('customers').select('*').eq('phone', phone).maybeSingle()
  if (found) return found
  const { data, error } = await supabase.from('customers').insert({ phone, name: name.trim() || null }).select().single()
  if (error) throw error
  return data
}
