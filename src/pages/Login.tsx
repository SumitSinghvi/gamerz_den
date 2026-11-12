import { useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { supabase } from '@/lib/supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  const go = async (signUp: boolean) => {
    setBusy(true)
    const { data, error } = signUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)
    if (error) return toast.error(error.message)
    if (signUp && !data.session) toast.success('Check your email to confirm the account.')
  }

  return (
    <div className="min-h-screen grid place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle>🎮 Gamerz Den — Staff login</CardTitle></CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); go(false) }}>
            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw">Password</Label>
              <Input id="pw" type="password" autoComplete="current-password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1" disabled={busy}>Sign in</Button>
              <Button type="button" variant="outline" disabled={busy || !email || password.length < 6} onClick={() => go(true)}>Sign up</Button>
            </div>
            <p className="text-xs text-muted-foreground">First account becomes owner. Later sign-ups need owner approval.</p>
          </form>
        </CardContent>
      </Card>
    </div>
  )
}
