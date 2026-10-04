import * as React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Lock, Mail } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Logo } from '@/components/layout/site-chrome'
import { useAuth } from '@/hooks/use-auth'
import { cn } from '@/lib/utils'

/**
 * Shared auth shell.
 *
 * Kept as one component so sign-in, sign-up and password reset cannot drift
 * apart visually or behaviourally.
 */
export function AuthShell({ kicker, title, subtitle, children, footer }) {
  return (
    <div className="grid min-h-[calc(100vh-4rem)] lg:grid-cols-[1fr_1.1fr]">
      {/* Left: oversized type. Deliberately asymmetric — the form column is wider. */}
      <div className="relative hidden flex-col justify-between overflow-hidden border-r-[3px] border-black bg-black p-10 text-white lg:flex">
        <Logo tone="inverted" />

        <div>
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-ash">{kicker}</p>
          <h1 className="mt-4 font-display text-6xl uppercase leading-[0.86] tracking-[-0.04em]">{title}</h1>
          <p className="mt-6 max-w-sm text-sm leading-relaxed text-ash">{subtitle}</p>
        </div>

        <ul className="space-y-2 font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
          <li>● Browsing never requires an account</li>
          <li>● Bookmarks and ideas sync to your account</li>
          <li>● No tracking, no ad profile, no data sold</li>
        </ul>

        <div
          className="pointer-events-none absolute inset-0 opacity-[0.09]"
          style={{
            backgroundImage:
              'linear-gradient(to right, #fff 2px, transparent 2px), linear-gradient(to bottom, #fff 2px, transparent 2px)',
            backgroundSize: '48px 48px',
          }}
          aria-hidden
        />
      </div>

      <div className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Logo />
          </div>
          {children}
          {footer ? <div className="mt-8">{footer}</div> : null}
        </div>
      </div>
    </div>
  )
}

export function FormError({ error }) {
  if (!error) return null
  const message = error.message || 'Something went wrong. Please try again.'
  return (
    <div
      role="alert"
      className="flex items-start gap-3 border-[3px] border-black bg-ash px-3 py-2.5 text-sm font-bold"
    >
      <AlertTriangle className="mt-0.5 size-4 shrink-0 stroke-[3]" aria-hidden />
      <span>{message}</span>
    </div>
  )
}

/** Shared password field with a visibility toggle. */
export function PasswordInput({ id, value, onChange, autoComplete, placeholder, required = true }) {
  const [visible, setVisible] = React.useState(false)
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        placeholder={placeholder}
        required={required}
        className="pr-20"
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 border-2 border-black bg-white px-2 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.12em] transition-colors hover:bg-black hover:text-white"
      >
        {visible ? 'Hide' : 'Show'}
      </button>
    </div>
  )
}

export default function LoginPage() {
  const { signIn, resetPassword, isAuthenticated, loading, isSupabase } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from ?? '/dashboard'

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [error, setError] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [resetMode, setResetMode] = React.useState(false)
  const [resetSent, setResetSent] = React.useState(false)

  React.useEffect(() => {
    if (!loading && isAuthenticated) navigate(from, { replace: true })
  }, [isAuthenticated, loading, navigate, from])

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn({ email: email.trim(), password })
      navigate(from, { replace: true })
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const submitReset = async (event) => {
    event.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await resetPassword(email.trim())
      setResetSent(true)
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      kicker="Welcome back"
      title="Sign in"
      subtitle="Your bookmarks, saved project ideas and alert subscriptions live in your account. Nothing here is required to browse."
      footer={
        <p className="text-center text-sm text-soot">
          No account yet?{' '}
          <Link
            to="/signup"
            className="font-bold underline decoration-[3px] underline-offset-4 hover:no-underline"
          >
            Create one free <ArrowRight className="inline size-3.5 stroke-[3]" />
          </Link>
        </p>
      }
    >
      <p className="brutal-kicker">{resetMode ? 'Password recovery' : 'Sign in to HackRadar'}</p>
      <h2 className="mt-2 font-display text-3xl uppercase leading-none tracking-[-0.03em] lg:hidden">
        {resetMode ? 'Reset password' : 'Sign in'}
      </h2>

      {resetMode ? (
        <form onSubmit={submitReset} className="mt-6 space-y-5">
          {resetSent ? (
            <div className="border-[3px] border-black bg-ash px-4 py-4 text-sm leading-relaxed">
              If an account exists for <strong>{email}</strong>, a reset link is on its way. Check your spam
              folder. HackRadar never reveals whether an address is registered.
            </div>
          ) : (
            <>
              <div>
                <Label htmlFor="reset-email">Email address</Label>
                <Input
                  id="reset-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-2"
                  placeholder="you@example.com"
                />
              </div>
              <p className="text-xs leading-relaxed text-soot">
                {isSupabase
                  ? 'Supabase will email a recovery link that returns you to this site.'
                  : 'A reset link will be emailed if the address is registered.'}
              </p>
            </>
          )}
          <FormError error={error} />
          <div className="flex gap-3">
            <Button type="submit" disabled={busy || resetSent} className="flex-1">
              <Mail /> {busy ? 'Sending…' : 'Send reset link'}
            </Button>
            <Button type="button" variant="outline" onClick={() => setResetMode(false)}>
              Back
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <Label htmlFor="email">Email address</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="mt-2"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <button
                type="button"
                onClick={() => {
                  setResetMode(true)
                  setError(null)
                  setResetSent(false)
                }}
                className="font-mono text-[10px] font-bold uppercase tracking-[0.12em] underline decoration-2 underline-offset-4 hover:no-underline"
              >
                Forgot?
              </button>
            </div>
            <div className="mt-2">
              <PasswordInput
                id="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
              />
            </div>
          </div>

          <FormError error={error} />

          <Button type="submit" className={cn('w-full')} disabled={busy} size="lg">
            <Lock /> {busy ? 'Signing in…' : 'Sign in'}
          </Button>

          <p className="text-xs leading-relaxed text-soot">
            {isSupabase
              ? 'Authentication is handled by Supabase. HackRadar never sees your password.'
              : 'Running with HackRadar’s built-in accounts (no Supabase configured). Passwords are hashed with scrypt and the session is an httpOnly cookie.'}
          </p>
        </form>
      )}
    </AuthShell>
  )
}