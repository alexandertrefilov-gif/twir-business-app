'use client'
// components/layout/DashboardShell.tsx

import { useState } from 'react'
import { Sidebar }  from './Sidebar'
import type { RoleName } from '@/types/enums'

interface Props {
  children:  React.ReactNode
  userName:  string
  userEmail: string
  userRole:  RoleName
}

export function DashboardShell({ children, userName, userEmail, userRole }: Props) {
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <div className="flex h-screen overflow-hidden">

      {/* ── Desktop sidebar ── */}
      <div className="hidden lg:flex shrink-0">
        <Sidebar userName={userName} userEmail={userEmail} userRole={userRole} />
      </div>

      {/* ── Mobile overlay ── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* ── Mobile sidebar drawer ── */}
      <div
        className={`
          fixed inset-y-0 left-0 z-50 flex lg:hidden
          transition-transform duration-200 ease-in-out
          ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}
        `}
      >
        <Sidebar
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
          onClose={() => setMobileOpen(false)}
        />
      </div>

      {/* ── Main content area ── */}
      <div className="flex flex-col flex-1 min-w-0 overflow-auto">

        {/* Mobile topbar */}
        <div
          className="flex lg:hidden items-center gap-3 px-4 h-12 border-b border-stone-200 bg-white shrink-0"
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-stone-100 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"/>
            </svg>
          </button>
          <span className="font-600 text-sm">Business App</span>
        </div>

        <main className="flex-1 overflow-auto">
          {children}
        </main>

      </div>
    </div>
  )
}
