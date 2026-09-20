'use client'

import Link from 'next/link'
import { signOut } from 'next-auth/react'

export function CollaborationShell({ children, userName }: { children: React.ReactNode; userName: string }) {
  return <div className="min-h-screen bg-stone-50">
    <header className="border-b border-stone-200 bg-white"><div className="mx-auto flex h-16 max-w-6xl items-center gap-6 px-6">
      <Link href="/collaboration/dashboard" className="font-600">TWIR Projektportal</Link>
      <nav aria-label="Projektportal" className="flex flex-wrap gap-4 text-sm"><Link href="/collaboration/dashboard" className="text-blue-700 hover:underline">Übersicht</Link><Link href="/collaboration/my-work" className="text-blue-700 hover:underline">Meine Arbeit</Link><Link href="/collaboration/projects" className="text-blue-700 hover:underline">Projekte</Link><Link href="/collaboration/tasks" className="text-blue-700 hover:underline">Aufgaben</Link><Link href="/collaboration/checklists" className="text-blue-700 hover:underline">Checklisten</Link><Link href="/collaboration/blockers" className="text-blue-700 hover:underline">Blocker</Link><Link href="/collaboration/approvals" className="text-blue-700 hover:underline">Freigaben</Link><Link href="/collaboration/cabinets" className="text-blue-700 hover:underline">GGA-Schränke</Link><Link href="/collaboration/betreiber" className="text-blue-700 hover:underline">Gefahrstoffschränke (Betreiber)</Link><Link href="/collaboration/team" className="text-blue-700 hover:underline">Team</Link></nav>
      <span className="ml-auto text-sm text-muted-foreground">{userName}</span>
      <button type="button" onClick={() => signOut({ callbackUrl: '/collaboration/login' })} className="text-sm text-stone-700 hover:underline">Abmelden</button>
    </div></header>
    <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
  </div>
}
