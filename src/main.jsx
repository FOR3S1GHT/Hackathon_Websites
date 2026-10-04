import * as React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App.jsx'
import { SmoothScrollProvider } from './hooks/use-lenis.jsx'
import { AuthProvider } from './hooks/use-auth.jsx'
import './index.css'

/**
 * Provider order matters:
 *   SmoothScrollProvider  — owns the single Lenis instance, outermost so pages
 *                           can measure the viewport consistently.
 *   BrowserRouter         — every route reads the query string for filters.
 *   AuthProvider          — the API client needs the token provider installed
 *                           before any child fires its first request.
 */
const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <React.StrictMode>
    <SmoothScrollProvider>
      <BrowserRouter>
        <AuthProvider>
          <App />
        </AuthProvider>
      </BrowserRouter>
    </SmoothScrollProvider>
  </React.StrictMode>,
)