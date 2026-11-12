import { useEffect } from 'react'
import { QueryCache, QueryClient, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { GameSession, RatePlan } from '@/lib/billing'
import { supabase, type Station } from '@/lib/supabase'

export const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: (e) => toast.error(e.message) }),
  // Cached data shows instantly on page switch; refetch in background once older than 30s.
  defaultOptions: { queries: { staleTime: 30_000 } },
})

/** Unwrap a Supabase response, throwing its error so React Query handles it. */
export async function run<T>(q: PromiseLike<{ data: unknown; error: { message: string } | null }>): Promise<T> {
  const { data, error } = await q
  if (error) throw new Error(error.message)
  return data as T
}

/** After any write: refetch what's on screen, mark everything else stale (refreshed when next opened). */
export const refresh = () => queryClient.invalidateQueries()

export const useStations = () =>
  useQuery({ queryKey: ['stations'], queryFn: () => run<Station[]>(supabase.from('stations').select('*').order('name')) })

export const useRatePlans = () =>
  useQuery({ queryKey: ['rate_plans'], queryFn: () => run<RatePlan[]>(supabase.from('rate_plans').select('*').order('console_type').order('players')) })

export const useOpenSessions = () =>
  useQuery({ queryKey: ['open_sessions'], queryFn: () => run<GameSession[]>(supabase.from('sessions').select('*, customers(name, phone)').neq('status', 'ended')) })

/** One app-wide realtime channel: changes from any device refresh the cache, even while on another page. */
export function useRealtimeRefresh() {
  useEffect(() => {
    const ch = supabase
      .channel('app')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'stations' }, refresh)
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [])
}
