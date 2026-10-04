import * as React from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Bell, Menu, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetClose, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Avatar, AvatarFallback } from '@/components/ui/skeleton'
import { useAuth } from '@/hooks/use-auth'
import { useNotifications } from '@/hooks/use-notifications'
import { useRealtime } from '@/hooks/use-realtime'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { to: '/', label: 'Home', end: true },
  { to: '/explore', label: 'Explore' },
  { to: '/categories', label: 'Categories' },
  { to: '/ideas', label: 'Project Ideas' },
  { to: '/bookmarks', label: 'Bookmarks' },
  { to: '/about', label: 'About' },
]

/** The wordmark: oversized, tight, and unmistakably the same on every page. */
export function Logo({ className, to = '/', tone = 'light' }) {
  const inverted = tone === 'inverted'
  return (
    <Link
      to={to}
      className={cn('group inline-flex items-stretch', className)}
      aria-label="HackRadar — home"
    >
      <span
        className={cn(
          'flex items-center border-[3px] px-3 py-1.5 font-display text-lg uppercase leading-none tracking-[-0.03em]',
          inverted
            ? 'border-white bg-white text-black'
            : 'border-black bg-black text-white transition-colors group-hover:bg-white group-hover:text-black',
        )}
      >
        Hack
      </span>
      <span
        className={cn(
          'flex items-center border-[3px] border-l-0 px-3 py-1.5 font-display text-lg uppercase leading-none tracking-[-0.03em]',
          inverted ? 'border-white bg-black text-white' : 'border-black bg-white text-black',
        )}
      >
        Radar
        <span
          className={cn('ml-1.5 inline-block size-2.5 align-middle', inverted ? 'bg-white' : 'bg-black')}
          aria-hidden
        />
      </span>
    </Link>
  )
}

function NotificationBell() {
  const { isAuthenticated } = useAuth()
  const { unread } = useNotifications()

  if (!isAuthenticated) {
    return (
      <Button asChild variant="ghost" size="icon" aria-label="Notifications — sign in required">
        <Link to="/login">
          <Bell className="size-4" />
        </Link>
      </Button>
    )
  }

  return (
    <Button asChild variant="ghost" size="icon" className="relative" aria-label={`Notifications (${unread} unread)`}>
      <Link to="/notifications">
        <Bell className="size-4" />
        {unread > 0 ? (
          <Badge
            variant="solid"
            size="sm"
            className="absolute -right-1 -top-1 min-w-5 justify-center"
            aria-live="polite"
          >
            {unread > 99 ? '99+' : unread}
          </Badge>
        ) : null}
      </Link>
    </Button>
  )
}

function AccountMenu() {
  const { user, signOut } = useAuth()
  const [signingOut, setSigningOut] = React.useState(false)

  if (!user) {
    return (
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
          <Link to="/login">Sign in</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/signup">Join</Link>
        </Button>
      </div>
    )
  }

  const initials = (user.displayName || user.email || '?').slice(0, 2).toUpperCase()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Account menu" className="border-[3px] border-black">
          <Avatar size="sm" shape="circle" className="border-0">
            {user.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="size-full object-cover" loading="lazy" />
            ) : (
              <AvatarFallback className="text-[11px]">{initials}</AvatarFallback>
            )}
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="normal-case tracking-normal">
          <span className="block truncate text-sm text-black">{user.displayName ?? 'Signed in'}</span>
          <span className="block truncate text-[10px] text-concrete">{user.email}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link to="/dashboard">Dashboard</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/bookmarks">Bookmarks</Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/notifications">
            Notifications
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link to="/settings">Settings</Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={signingOut}
          onSelect={async (event) => {
            event.preventDefault()
            setSigningOut(true)
            try {
              await signOut()
            } finally {
              setSigningOut(false)
            }
          }}
        >
          {signingOut ? 'Signing out…' : 'Sign out'}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SiteHeader() {
  const [open, setOpen] = React.useState(false)
  const location = useLocation()
  const { status } = useRealtime()

  // Close the mobile drawer whenever the route changes.
  React.useEffect(() => {
    setOpen(false)
  }, [location.pathname])

  return (
    <header className="sticky top-0 z-40 border-b-[3px] border-black bg-white/95 backdrop-blur-[2px]">
      <div className="mx-auto flex h-16 max-w-[1400px] items-center gap-3 px-4 sm:px-6">
        <Logo />

        <nav className="ml-6 hidden items-center gap-1 lg:flex" aria-label="Main">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                cn(
                  'border-[3px] border-transparent px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-[0.14em] transition-colors',
                  'hover:border-black hover:bg-ash',
                  isActive && 'border-black bg-black text-white hover:bg-black hover:text-white',
                )
              }
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Search hackathons">
            <Link to="/explore">
              <Search className="size-4" />
            </Link>
          </Button>
          <NotificationBell />

          <span
            className="mr-1 hidden size-2.5 border-2 border-black sm:inline-block"
            style={{ backgroundColor: status === 'connected' ? '#000000' : '#FFFFFF' }}
            title={
              status === 'connected'
                ? 'Live updates connected (Server-Sent Events)'
                : 'Live updates reconnecting — the page still works, refresh to pull the latest'
            }
            aria-hidden
          />

          <div className="hidden sm:block">
            <AccountMenu />
          </div>

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="right" className="p-0">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <div className="border-b-[3px] border-black p-5">
                <Logo />
              </div>
              <nav className="flex flex-col" aria-label="Mobile">
                {NAV_LINKS.map((link) => (
                  <SheetClose asChild key={link.to}>
                    <NavLink
                      to={link.to}
                      end={link.end}
                      className={({ isActive }) =>
                        cn(
                          'border-b-[3px] border-ash px-5 py-4 font-display text-xl uppercase leading-none tracking-[-0.02em] transition-colors',
                          isActive ? 'bg-black text-white' : 'hover:bg-ash',
                        )
                      }
                    >
                      {link.label}
                    </NavLink>
                  </SheetClose>
                ))}
              </nav>
              <div className="mt-auto border-t-[3px] border-black p-5">
                <AccountMenu />
              </div>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}

export function SiteFooter({ meta }) {
  const { isAuthenticated } = useAuth()

  const columns = [
    {
      title: 'Discover',
      links: [
        { to: '/explore', label: 'Explore all' },
        { to: '/categories', label: 'Categories' },
        { to: '/bookmarks', label: 'Bookmarks' },
        { to: '/ideas', label: 'Project ideas' },
      ],
    },
    {
      title: 'Account',
      // Telling a signed-in visitor to sign in is a small lie about the state
      // of their own account, and the header above already knows better.
      links: [
        { to: '/dashboard', label: 'Dashboard' },
        { to: '/notifications', label: 'Notifications' },
        { to: '/settings', label: 'Settings' },
        ...(isAuthenticated
          ? []
          : [
              { to: '/login', label: 'Sign in' },
              { to: '/signup', label: 'Create account' },
            ]),
      ],
    },
    {
      title: 'About',
      links: [
        { to: '/about', label: 'About HackRadar' },
        { to: '/data-sources', label: 'Data sources' },
        { to: '/privacy', label: 'Privacy' },
        { to: '/terms', label: 'Terms' },
        { to: '/contact', label: 'Contact' },
      ],
    },
  ]

  return (
    <footer className="mt-24 border-t-[3px] border-black bg-black text-white">
      <div className="mx-auto grid max-w-[1400px] gap-10 px-4 py-14 sm:px-6 md:grid-cols-[1.4fr_repeat(3,1fr)]">
        <div>
          <Logo tone="inverted" />
          <p className="mt-5 max-w-xs text-sm leading-relaxed text-ash">
            A hackathon radar built on public, official APIs. Nothing here is invented: every event
            links back to the organiser&rsquo;s own listing.
          </p>
          {meta?.sync?.lastRefreshedAt ? (
            <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.14em] text-concrete">
              Catalogue last refreshed {new Date(meta.sync.lastRefreshedAt).toUTCString()}
            </p>
          ) : null}
        </div>

        {columns.map((column) => (
          <div key={column.title}>
            <h3 className="brutal-kicker border-b-2 border-white pb-2 text-white">{column.title}</h3>
            <ul className="mt-4 flex flex-col gap-2.5">
              {column.links.map((link) => (
                <li key={link.to}>
                  <Link
                    to={link.to}
                    className="font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-ash underline-offset-4 hover:text-white hover:underline"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="border-t-2 border-white/25">
        <div className="mx-auto flex max-w-[1400px] flex-col gap-3 px-4 py-6 font-mono text-[10px] uppercase tracking-[0.14em] text-concrete sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} HackRadar. Independent project, not affiliated with any organiser.</p>
          <p>
            Built with public APIs · Data refreshed every 30 minutes · Not an instant mirror
          </p>
        </div>
      </div>
    </footer>
  )
}

export { NAV_LINKS }