import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import { Button } from '@/components/ui/button'
import { supabase, type Profile } from '@/lib/supabase'
import Login from '@/pages/Login'
import Floor from '@/pages/Floor'
import Customers from '@/pages/Customers'
import Settings from '@/pages/Settings'
import Reports from '@/pages/Reports'

export default function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s))
    return () => data.subscription.unsubscribe()
  }, [])

  const uid = session?.user.id
  useEffect(() => {
    if (!uid) return setProfile(null)
    supabase.from('profiles').select('*').eq('id', uid).single().then(({ data }) => setProfile(data))
  }, [uid])

  const signOut = () => supabase.auth.signOut()

  let body
  if (session === undefined || (session && !profile)) body = <p className="p-8 text-muted-foreground">Loading…</p>
  else if (!session) body = <Login />
  else if (profile!.role === 'pending')
    body = (
      <div className="p-8 space-y-4">
        <p>Account <b>{profile!.email}</b> is waiting for owner approval.</p>
        <Button variant="outline" onClick={signOut}>Sign out</Button>
      </div>
    )
  else {
    const isOwner = profile!.role === 'owner'
    const link = ({ isActive }: { isActive: boolean }) =>
      `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`
    body = (
      <BrowserRouter>
        <header className="border-b flex flex-wrap items-center gap-2 px-4 py-2">
          <span className="font-bold mr-4">🎮 Gamerz Den</span>
          <NavLink to="/" end className={link}>Floor</NavLink>
          <NavLink to="/customers" className={link}>Customers</NavLink>
          <NavLink to="/reports" className={link}>Reports</NavLink>
          <NavLink to="/settings" className={link}>Settings</NavLink>
          <span className="ml-auto text-xs text-muted-foreground">{profile!.email} · {profile!.role}</span>
          <Button size="sm" variant="ghost" onClick={signOut}>Sign out</Button>
        </header>
        <main className="p-4">
          <Routes>
            <Route path="/" element={<Floor />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings isOwner={isOwner} />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </BrowserRouter>
    )
  }

  return (
    <>
      {body}
      <Toaster richColors position="top-right" />
    </>
  )
}
