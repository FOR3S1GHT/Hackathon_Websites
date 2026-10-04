import * as React from 'react'
import { api, setTokenProvider } from '@/lib/api'
import { isSupabaseConfigured, supabase } from '@/lib/supabase'

/**
 * Authentication.
 *
 * Two providers, chosen at runtime:
 *
 *  - `supabase` — Supabase Auth. The access token is attached to every API call
 *    and the backend verifies it with `auth.getUser(token)`.
 *  - `local`    — the backend's built-in fallback (scrypt password hashing plus
 *    an httpOnly, sameSite=lax session cookie). No third party involved.
 *
 * Browsing never requires an account; `user` being null is a normal state, not
 * an error.
 */

const AuthContext = React.createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = React.useState(null)
  const [profile, setProfile] = React.useState(null)
  const [mode, setMode] = React.useState('local')
  const [loading, setLoading] = React.useState(true)
  const [authError, setAuthError] = React.useState(null)

  // The API client asks us for a token on every request. Keeping the provider
  // in a ref-free closure over `mode` means switching providers takes effect
  // immediately for in-flight and future requests.
  React.useEffect(() => {
    if (mode === 'supabase' && supabase) {
      setTokenProvider(async () => {
        const { data } = await supabase.auth.getSession()
        return data?.session?.access_token ?? null
      })
    } else {
      setTokenProvider(() => null)
    }
  }, [mode])

  const loadProfile = React.useCallback(async () => {
    try {
      const next = await api.me()
      setProfile(next?.user ?? next ?? null)
      return next
    } catch {
      setProfile(null)
      return null
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false

    async function bootstrap() {
      try {
        const info = await api.authMode().catch(() => ({ mode: 'local' }))
        if (cancelled) return
        const nextMode = info?.mode ?? 'local'
        setMode(nextMode)

        if (nextMode === 'supabase' && supabase) {
          const { data } = await supabase.auth.getSession()
          if (cancelled) return
          const sessionUser = data?.session?.user ?? null
          if (sessionUser) {
            setUser({
              id: sessionUser.id,
              email: sessionUser.email,
              displayName:
                sessionUser.user_metadata?.display_name ??
                sessionUser.user_metadata?.full_name ??
                (sessionUser.email ?? '').split('@')[0],
              avatarUrl: sessionUser.user_metadata?.avatar_url ?? null,
              provider: 'supabase',
            })
            await loadProfile()
          }
        } else {
          const me = await api.me().catch(() => null)
          if (cancelled) return
          if (me?.user) setUser(me.user)
        }
      } catch (err) {
        if (!cancelled) setAuthError(err)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    bootstrap()

    // Keep the React tree in sync with Supabase tab-to-tab / refresh changes.
    let subscription = null
    if (isSupabaseConfigured && supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          setUser(null)
          setProfile(null)
          return
        }
        const sessionUser = session.user
        setUser({
          id: sessionUser.id,
          email: sessionUser.email,
          displayName:
            sessionUser.user_metadata?.display_name ??
            (sessionUser.email ?? '').split('@')[0],
          avatarUrl: sessionUser.user_metadata?.avatar_url ?? null,
          provider: 'supabase',
        })
        await loadProfile()
      })
      subscription = data.subscription
    }

    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [loadProfile])

  const value = React.useMemo(
    () => ({
      user,
      profile,
      mode,
      loading,
      authError,
      isAuthenticated: Boolean(user),
      isSupabase: mode === 'supabase',

      async signIn(payload) {
        setAuthError(null)
        if (mode === 'supabase') {
          const { error } = await supabase.auth.signInWithPassword(payload)
          if (error) {
            setAuthError(error)
            throw error
          }
          return
        }
        const result = await api.signIn(payload)
        setUser(result.user)
        await loadProfile()
      },

      async signUp(payload) {
        setAuthError(null)
        if (mode === 'supabase') {
          const { data, error } = await supabase.auth.signUp({
            email: payload.email,
            password: payload.password,
            options: { data: { display_name: payload.displayName } },
          })
          if (error) {
            setAuthError(error)
            throw error
          }
          // Supabase may require email confirmation before a session exists.
          if (!data.session) return { requiresEmailConfirmation: true }
          return { requiresEmailConfirmation: false }
        }
        const result = await api.signUp(payload)
        if (result?.user) setUser(result.user)
        await loadProfile()
        return { requiresEmailConfirmation: result?.requiresEmailConfirmation ?? false }
      },

      async signOut() {
        setAuthError(null)
        if (mode === 'supabase') {
          await supabase.auth.signOut()
        } else {
          await api.signOut().catch(() => null)
        }
        setUser(null)
        setProfile(null)
      },

      async resetPassword(email) {
        setAuthError(null)
        if (mode === 'supabase') {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/login`,
          })
          if (error) throw error
          return
        }
        return api.passwordReset(email)
      },

      refreshProfile: loadProfile,
    }),
    [user, profile, mode, loading, authError, loadProfile],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = React.useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}