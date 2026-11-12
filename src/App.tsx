import { BrowserRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'
import Floor from '@/pages/Floor'
import Customers from '@/pages/Customers'
import Settings from '@/pages/Settings'
import Reports from '@/pages/Reports'
import { useTheme } from 'next-themes'
import { MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useRealtimeRefresh } from '@/lib/queries'

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const dark = resolvedTheme === 'dark'
  return (
    <Button variant="ghost" size="icon" className="ml-auto" aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
      onClick={() => setTheme(dark ? 'light' : 'dark')}>
      {dark ? <SunIcon /> : <MoonIcon />}
    </Button>
  )
}

// ponytail: login removed for client demo (RLS disabled in migration 20261112190000_demo_disable_rls).
// For field use: restore auth gate in App.tsx from git history (pages/Login.tsx kept) and re-enable RLS.
export default function App() {
  useRealtimeRefresh()
  const link = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-md text-sm ${isActive ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`
  return (
    <>
      <BrowserRouter>
        <header className="border-b flex flex-wrap items-center gap-2 px-4 py-2">
          <span className="font-bold mr-4">🎮 Gamerz Den</span>
          <NavLink to="/" end className={link}>Floor</NavLink>
          <NavLink to="/customers" className={link}>Customers</NavLink>
          <NavLink to="/reports" className={link}>Reports</NavLink>
          <NavLink to="/settings" className={link}>Settings</NavLink>
          <ThemeToggle />
        </header>
        <main className="p-4">
          <Routes>
            <Route path="/" element={<Floor />} />
            <Route path="/customers" element={<Customers />} />
            <Route path="/reports" element={<Reports />} />
            <Route path="/settings" element={<Settings isOwner />} />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </BrowserRouter>
      <Toaster richColors position="top-right" />
    </>
  )
}
