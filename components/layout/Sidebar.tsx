'use client'
// components/layout/Sidebar.tsx

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { signOut } from 'next-auth/react'
import type { RoleName } from '@/types/enums'

// ── Nav structure ────────────────────────────────────────────

type NavItem = {
  label:    string
  href:     string
  icon:     React.ReactNode
  roles?:   RoleName[]   // undefined = all roles
  badge?:   string
}

type NavGroup = {
  title?: string
  items:  NavItem[]
}

function IconGrid()      { return <svg className="icon" viewBox="0 0 20 20" fill="currentColor"><path d="M5 3a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2V5a2 2 0 00-2-2H5zM5 11a2 2 0 00-2 2v2a2 2 0 002 2h2a2 2 0 002-2v-2a2 2 0 00-2-2H5zM11 5a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM11 13a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z"/></svg> }
function IconUsers()     { return <svg className="icon" viewBox="0 0 20 20" fill="currentColor"><path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z"/></svg> }
function IconDoc()       { return <svg className="icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd"/></svg> }
function IconClipboard() { return <svg className="icon" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2a1 1 0 000 2h2a1 1 0 100-2H9z"/><path fillRule="evenodd" d="M4 5a2 2 0 012-2 3 3 0 003 3h2a3 3 0 003-3 2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2V5zm3 4a1 1 0 000 2h.01a1 1 0 100-2H7zm2 0a1 1 0 000 2h4a1 1 0 100-2H9zm-2 4a1 1 0 000 2h.01a1 1 0 100-2H7zm2 0a1 1 0 000 2h4a1 1 0 100-2H9z" clipRule="evenodd"/></svg> }
function IconWrench()    { return <svg className="icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/></svg> }
function IconReceipt()   { return <svg className="icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5 2a2 2 0 00-2 2v14l3.5-2 3.5 2 3.5-2 3.5 2V4a2 2 0 00-2-2H5zm4.707 3.707a1 1 0 00-1.414-1.414l-3 3a1 1 0 000 1.414l3 3a1 1 0 001.414-1.414L8.414 9H10a3 3 0 013 3v1a1 1 0 102 0v-1a5 5 0 00-5-5H8.414l1.293-1.293z" clipRule="evenodd"/></svg> }
function IconCash()      { return <svg className="icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2V6h10a2 2 0 00-2-2H4zm2 6a2 2 0 012-2h8a2 2 0 012 2v4a2 2 0 01-2 2H8a2 2 0 01-2-2v-4zm6 4a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd"/></svg> }
function IconFolder()    { return <svg className="icon" viewBox="0 0 20 20" fill="currentColor"><path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/></svg> }
function IconCog()       { return <svg className="icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd"/></svg> }
function IconLog()       { return <svg className="icon" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11 4a1 1 0 10-2 0v4a1 1 0 102 0V7zm-3 1a1 1 0 10-2 0v3a1 1 0 102 0V8zM8 9a1 1 0 00-2 0v2a1 1 0 102 0V9z" clipRule="evenodd"/></svg> }

const NAV_GROUPS: NavGroup[] = [
  {
    items: [
      { label: 'Dashboard',    href: '/',            icon: <IconGrid /> },
    ],
  },
  {
    title: 'Verwaltung',
    items: [
      { label: 'Kunden',       href: '/customers',   icon: <IconUsers /> },
      { label: 'Angebote',     href: '/offers',      icon: <IconDoc /> },
      { label: 'Aufträge',     href: '/orders',      icon: <IconClipboard /> },
      { label: 'Leistungen',   href: '/services',    icon: <IconWrench /> },
    ],
  },
  {
    title: 'Finanzen',
    items: [
      { label: 'Rechnungen',   href: '/invoices',    icon: <IconReceipt />, roles: ['ADMIN', 'OFFICE', 'PROJECT_MANAGER', 'ACCOUNTING'] },
      { label: 'Zahlungen',    href: '/payments',    icon: <IconCash />,    roles: ['ADMIN', 'ACCOUNTING'] },
    ],
  },
  {
    title: 'Archiv',
    items: [
      { label: 'Dokumente',    href: '/documents',   icon: <IconFolder /> },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Audit-Log',    href: '/audit',       icon: <IconLog />,     roles: ['ADMIN', 'ACCOUNTING'] },
      { label: 'Einstellungen',href: '/settings',    icon: <IconCog />,     roles: ['ADMIN'] },
    ],
  },
]

// ── Component ────────────────────────────────────────────────

interface SidebarProps {
  userEmail: string
  userName:  string
  userRole:  RoleName
  onClose?:  () => void
}

export function Sidebar({ userEmail, userName, userRole, onClose }: SidebarProps) {
  const pathname = usePathname()

  function isActive(href: string) {
    if (href === '/') return pathname === '/'
    return pathname === href || pathname.startsWith(href + '/')
  }

  function canSee(item: NavItem): boolean {
    if (!item.roles) return true
    return (item.roles as string[]).includes(userRole)
  }

  const initials = userName
    .split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)

  return (
    <nav
      className="flex flex-col h-full"
      style={{ background: 'hsl(var(--sidebar-bg))', width: '220px' }}
    >
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 py-4 border-b" style={{ borderColor: 'hsl(var(--sidebar-border))' }}>
        <div className="w-7 h-7 rounded bg-blue-600 flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z"/>
          </svg>
        </div>
        <span className="text-white font-600 text-sm tracking-wide">Business App</span>

        {/* Mobile close button */}
        {onClose && (
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded text-slate-500 hover:text-slate-300 lg:hidden"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
            </svg>
          </button>
        )}
      </div>

      {/* Nav groups */}
      <div className="flex-1 overflow-y-auto py-3 px-2">
        {NAV_GROUPS.map((group, gi) => {
          const visible = group.items.filter(canSee)
          if (visible.length === 0) return null
          return (
            <div key={gi} className={gi > 0 ? 'mt-4' : ''}>
              {group.title && (
                <p
                  className="px-3 mb-1 text-[10px] font-600 uppercase tracking-[0.1em]"
                  style={{ color: 'hsl(220 12% 38%)' }}
                >
                  {group.title}
                </p>
              )}
              {visible.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={`sidebar-item ${isActive(item.href) ? 'active' : ''}`}
                >
                  {item.icon}
                  <span className="truncate">{item.label}</span>
                  {item.badge && (
                    <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded-full bg-blue-600 text-white mono">
                      {item.badge}
                    </span>
                  )}
                </Link>
              ))}
            </div>
          )
        })}
      </div>

      {/* User footer */}
      <div
        className="px-3 py-3 border-t"
        style={{ borderColor: 'hsl(var(--sidebar-border))' }}
      >
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center text-white text-xs font-600 shrink-0">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-500 text-white truncate">{userName}</p>
            <p className="text-[11px] truncate" style={{ color: 'hsl(var(--sidebar-text))' }}>
              {userEmail}
            </p>
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          className="w-full sidebar-item text-xs justify-center mt-1"
          style={{ color: 'hsl(220 10% 42%)' }}
        >
          <svg className="icon" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 3a1 1 0 00-1 1v12a1 1 0 102 0V4a1 1 0 00-1-1zm10.293 9.293a1 1 0 001.414 1.414l3-3a1 1 0 000-1.414l-3-3a1 1 0 10-1.414 1.414L14.586 9H7a1 1 0 100 2h7.586l-1.293 1.293z" clipRule="evenodd"/>
          </svg>
          Abmelden
        </button>
      </div>
    </nav>
  )
}
