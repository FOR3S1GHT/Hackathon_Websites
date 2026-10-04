import * as React from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { TooltipProvider } from '@/components/ui/tooltip'
import { Toaster } from '@/components/ui/sonner'
import { SiteFooter, SiteHeader } from '@/components/layout/site-chrome'
import { CountUp, PageTransition } from '@/components/motion'
import { useAuth } from '@/hooks/use-auth'
import { useMeta } from '@/hooks/use-hackathons'

import HomePage from '@/pages/home'
import ExplorePage from '@/pages/explore'
import CategoriesPage from '@/pages/categories'
import CategoryPage from '@/pages/category-detail'
import HackathonPage from '@/pages/hackathon-detail'
import BookmarksPage from '@/pages/bookmarks'
import IdeasPage from '@/pages/ideas'
import NotificationsPage from '@/pages/notifications'
import DashboardPage from '@/pages/dashboard'
import SettingsPage from '@/pages/settings'
import LoginPage from '@/pages/login'
import SignupPage from '@/pages/signup'
import AboutPage from '@/pages/about'
import DataSourcesPage from '@/pages/data-sources'
import PrivacyPage from '@/pages/privacy'
import TermsPage from '@/pages/terms'
import ContactPage from '@/pages/contact'
import NotFoundPage from '@/pages/not-found'

/**
 * Route guard.
 *
 * The whole catalogue is public, so this only gates genuinely personal pages.
 * It also preserves the attempted URL so the login page can bounce the user back
 * where they were headed.
 */
function RequireAuth({ children }) {
  const { isAuthenticated, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="mx-auto max-w-[1400px] px-4 py-32 sm:px-6" role="status" aria-live="polite">
        <p className="brutal-kicker">Checking your session…</p>
        <div className="mt-6 h-4 w-64 border-[3px] border-black bg-ash" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
  }

  return children
}

/** Restores the scroll position on navigation, Lenis-aware. */
function ScrollToTop() {
  const { pathname } = useLocation()
  React.useEffect(() => {
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'auto' })
  }, [pathname])
  return null
}

export default function App() {
  const { meta } = useMeta()

  return (
    <TooltipProvider delayDuration={200} skipDelayDuration={300}>
      <div className="flex min-h-screen flex-col bg-white">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:border-[3px] focus:border-black focus:bg-white focus:px-4 focus:py-2 focus:font-mono focus:text-xs focus:font-bold focus:uppercase focus:tracking-[0.14em] focus:shadow-brutal"
        >
          Skip to content
        </a>

        <SiteHeader />
        <ScrollToTop />

        <main id="main" className="flex-1">
          <Routes>
            <Route
              path="/"
              element={
                <PageTransition>
                  <HomePage meta={meta} />
                </PageTransition>
              }
            />
            <Route
              path="/explore"
              element={
                <PageTransition>
                  <ExplorePage meta={meta} />
                </PageTransition>
              }
            />
            <Route
              path="/categories"
              element={
                <PageTransition>
                  <CategoriesPage meta={meta} />
                </PageTransition>
              }
            />
            <Route
              path="/categories/:slug"
              element={
                <PageTransition>
                  <CategoryPage meta={meta} />
                </PageTransition>
              }
            />
            <Route
              path="/hackathon/:slug"
              element={
                <PageTransition>
                  <HackathonPage meta={meta} />
                </PageTransition>
              }
            />
            <Route
              path="/bookmarks"
              element={
                <PageTransition>
                  <BookmarksPage meta={meta} />
                </PageTransition>
              }
            />
            <Route
              path="/ideas"
              element={
                <PageTransition>
                  <IdeasPage meta={meta} />
                </PageTransition>
              }
            />
            <Route
              path="/notifications"
              element={
                <RequireAuth>
                  <NotificationsPage meta={meta} />
                </RequireAuth>
              }
            />
            <Route
              path="/dashboard"
              element={
                <RequireAuth>
                  <DashboardPage meta={meta} />
                </RequireAuth>
              }
            />
            <Route
              path="/settings"
              element={
                <RequireAuth>
                  <SettingsPage meta={meta} />
                </RequireAuth>
              }
            />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/signup" element={<SignupPage />} />
            <Route path="/about" element={<AboutPage meta={meta} />} />
            <Route path="/data-sources" element={<DataSourcesPage meta={meta} />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />
            <Route path="/contact" element={<ContactPage meta={meta} />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>

        <SiteFooter meta={meta} />

        {/*
          Progress readout. Rendered here (not in a header) so it never shifts
          layout, and hidden from screen readers because the loading state is
          already announced by the page's own `role="status"` regions.
        */}
        <div className="sr-only" aria-hidden>
          Catalogue total: <CountUp value={meta?.stats?.hackathons ?? 0} />
        </div>

        <Toaster />
      </div>
    </TooltipProvider>
  )
}