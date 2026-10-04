import * as React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { ArrowRight, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Input, Label } from '@/components/ui/input'
import { useAuth } from '@/hooks/use-auth'
import { AuthShell, FormError, PasswordInput } from '@/pages/login'

/** Rough NIST-style guidance — length over composition rules. */
function passwordChecks(password) {
  return {
    length: password.length >= 12,
    notShort: password.length >= 8,
    hasNumber: /\d/.test(password),
    hasLetter: /[a-zA-Z]/.test(password),
  }
}

function PasswordStrength({ password }) {
  const checks = passwordChecks(password)
  const score = [checks.length, checks.hasNumber, checks.hasLetter].filter(Boolean).length
  const label = password.length === 0 ? 'No password yet' : ['Too weak', 'Weak', 'Fair', 'Strong'][score]
  const width = password.length === 0 ? 0 : (score / 3) * 100

  return (
    <div className="mt-2">
      <div className="h-3 w-full border-2 border-black bg-white" aria-hidden>
        <div className="h-full bg-black transition-[width]" style={{ width: `${width}%` }} />
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] uppercase tracking-[0.12em] text-concrete">
        <span className="font-bold text-black">{label}</span>
        <span>12+ chars recommended</span>
        <span>letters + numbers</span>
      </p>
    </div>
  )
}

export default function SignupPage() {
  const { signUp, isAuthenticated, loading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = location.state?.from ?? '/dashboard'

  const [displayName, setDisplayName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [accepted, setAccepted] = React.useState(false)
  const [error, setError] = React.useState(null)
  const [busy, setBusy] = React.useState(false)
  const [confirmationSent, setConfirmationSent] = React.useState(false)

  React.useEffect(() => {
    if (!loading && isAuthenticated) navigate(from, { replace: true })
  }, [isAuthenticated, loading, navigate, from])

  const submit = async (event) => {
    event.preventDefault()
    setError(null)
    if (password.length < 8) {
      setError(new Error('Use at least 8 characters. 12 or more is much better.'))
      return
    }
    if (!accepted) {
      setError(new Error('Please accept the terms to create an account.'))
      return
    }
    setBusy(true)
    try {
      const result = await signUp({
        email: email.trim(),
        password,
        displayName: displayName.trim() || undefined,
      })
      if (result?.requiresEmailConfirmation) {
        setConfirmationSent(true)
      } else {
        navigate(from, { replace: true })
      }
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      kicker="Free, forever"
      title="Join"
      subtitle="An account is optional for browsing. Create one to save hackathons, keep generated project ideas and receive deadline alerts."
      footer={
        <p className="text-center text-sm text-soot">
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-bold underline decoration-[3px] underline-offset-4 hover:no-underline"
          >
            Sign in <ArrowRight className="inline size-3.5 stroke-[3]" />
          </Link>
        </p>
      }
    >
      <p className="brutal-kicker">Create your account</p>
      <h2 className="mt-2 font-display text-3xl uppercase leading-none tracking-[-0.03em] lg:hidden">Join</h2>

      {confirmationSent ? (
        <Card className="mt-6 p-5 shadow-brutal">
          <h3 className="font-display text-2xl uppercase leading-none tracking-[-0.02em]">Check your inbox</h3>
          <p className="mt-3 text-sm leading-relaxed text-soot">
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate the account, then
            sign in. You can close this tab.
          </p>
          <Button asChild className="mt-5">
            <Link to="/login">Go to sign in</Link>
          </Button>
        </Card>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-5">
          <div>
            <Label htmlFor="display-name">Display name (optional)</Label>
            <Input
              id="display-name"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value)}
              autoComplete="nickname"
              maxLength={80}
              className="mt-2"
              placeholder="How your saved ideas are labelled"
            />
          </div>

          <div>
            <Label htmlFor="signup-email">Email address</Label>
            <Input
              id="signup-email"
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
            <Label htmlFor="signup-password">Password</Label>
            <div className="mt-2">
              <PasswordInput
                id="signup-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                placeholder="At least 8 characters"
              />
            </div>
            <PasswordStrength password={password} />
          </div>

          <label className="flex cursor-pointer items-start gap-3 border-2 border-ash px-3 py-3 transition-colors hover:border-black has-[:checked]:border-black has-[:checked]:bg-ash">
            <Checkbox checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-0.5" />
            <span className="text-sm leading-relaxed text-soot">
              I agree to the{' '}
              <Link to="/terms" className="font-bold underline decoration-[3px] underline-offset-4 hover:no-underline">
                terms
              </Link>{' '}
              and{' '}
              <Link
                to="/privacy"
                className="font-bold underline decoration-[3px] underline-offset-4 hover:no-underline"
              >
                privacy policy
              </Link>
              . I understand HackRadar is independent and not affiliated with any hackathon organiser.
            </span>
          </label>

          <FormError error={error} />

          <Button type="submit" size="lg" className="w-full" disabled={busy}>
            <UserPlus /> {busy ? 'Creating your account…' : 'Create account'}
          </Button>

          <p className="text-xs leading-relaxed text-soot">
            HackRadar stores only what is needed to run your account: your email address, an optional display
            name, your bookmarks, your saved ideas and your notification preferences. No analytics third
            parties, no advertising, no sale of data.
          </p>
        </form>
      )}
    </AuthShell>
  )
}