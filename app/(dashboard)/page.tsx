// app/(dashboard)/page.tsx
import type { Metadata }  from 'next'
import Link               from 'next/link'
import { getServerSession } from 'next-auth'
import { authOptions }    from '@/lib/auth/options'
import { UnauthorizedError } from '@/lib/auth/permissions'
import { getDashboardStats } from '@/lib/services/dashboard.service'
import { format }         from 'date-fns'
import { de }             from 'date-fns/locale'

export const metadata: Metadata = { title: 'Dashboard' }

export default async function DashboardPage() {
  const session = await getServerSession(authOptions)
  if (!session?.user) throw new UnauthorizedError()

  const stats   = await getDashboardStats()

  const greeting = (() => {
    const h = new Date().getHours()
    if (h < 12) return 'Guten Morgen'
    if (h < 18) return 'Guten Tag'
    return 'Guten Abend'
  })()

  return (
    <div>
      {/* ── Header ── */}
      <div className="px-6 py-5 border-b border-stone-200 bg-white">
        <h1 className="text-lg font-600">
          {greeting}, {session?.user.name.split(' ')[0]}
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">
          {format(new Date(), "EEEE, d. MMMM yyyy", { locale: de })}
        </p>
      </div>

      <div className="p-6 space-y-6">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard
            label="Offene Angebote"
            value={stats.openOffers}
            href="/offers?status=SENT"
            color={stats.openOffers !== null && stats.openOffers > 0 ? 'amber' : 'default'}
          />
          <KpiCard
            label="Laufende Aufträge"
            value={stats.openOrders}
            href="/orders?status=IN_PROGRESS"
            color="blue"
          />
          <KpiCard
            label="Rechnungsentwürfe"
            value={stats.draftInvoices}
            href="/invoices?status=DRAFT"
            color={stats.draftInvoices !== null && stats.draftInvoices > 0 ? 'amber' : 'default'}
          />
          <KpiCard
            label="Überfällige RE"
            value={stats.overdueInvoices}
            href="/invoices?status=OVERDUE"
            color={stats.overdueInvoices !== null && stats.overdueInvoices > 0 ? 'red' : 'default'}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* ── Secondary stats ── */}
          <div className="space-y-4">
            <div className="card-base p-5">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-4">
                Monat {format(new Date(), 'MMMM', { locale: de })}
              </p>
              <div className="space-y-4">
                <div>
                  <p className="text-2xl font-600 mono text-foreground">
                    {stats.monthlyInvoicedGross === null
                      ? 'Nicht verfügbar'
                      : new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
                        .format(stats.monthlyInvoicedGross)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Fakturiertes Volumen</p>
                </div>
                <div className="border-t border-stone-100 pt-4 grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-lg font-600 mono">
                      {stats.totalCustomers ?? 'Nicht verfügbar'}
                    </p>
                    <p className="text-xs text-muted-foreground">Aktive Kunden</p>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Quick actions ── */}
            <div className="card-base p-5">
              <p className="text-xs font-600 uppercase tracking-wider text-muted-foreground mb-3">
                Schnellzugriff
              </p>
              <div className="space-y-1.5">
                {[
                  { label: 'Neues Angebot',    href: '/offers/new'   },
                  { label: 'Neuer Auftrag',     href: '/orders/new'   },
                  { label: 'Neuer Kunde',       href: '/customers/new'},
                  { label: 'Leistung erfassen', href: '/services/new' },
                ].map((a) => (
                  <Link
                    key={a.href}
                    href={a.href}
                    className="flex items-center gap-2 px-3 py-2 rounded-md text-sm text-foreground hover:bg-stone-50 border border-stone-200 transition-colors w-full"
                  >
                    <svg className="w-3.5 h-3.5 text-blue-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
                    </svg>
                    {a.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>

          {/* ── Recent activity ── */}
          <div className="lg:col-span-2 card-base overflow-hidden">
            <div className="px-5 py-3 border-b border-stone-100">
              <h2 className="text-sm font-600">Letzte Aktivitäten</h2>
            </div>
            <div className="divide-y divide-stone-50">
              {stats.recentActivity === null && (
                <p className="text-sm text-muted-foreground p-5">Nicht verfügbar.</p>
              )}
              {stats.recentActivity?.length === 0 && (
                <p className="text-sm text-muted-foreground p-5">Noch keine Aktivitäten.</p>
              )}
              {stats.recentActivity?.map((log) => (
                <div key={log.id} className="flex items-start gap-3 px-5 py-3">
                  <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center shrink-0 mt-0.5">
                    <ActivityIcon action={log.action} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground">
                      <span className="font-500">
                        {log.user ? `${log.user.firstName} ${log.user.lastName}` : 'System'}
                      </span>
                      {' '}—{' '}
                      <span className="text-muted-foreground">
                        {log.entityType} {log.action.toLowerCase().replace('_', ' ')}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mono mt-0.5">
                      {format(new Date(log.createdAt), "dd.MM.yy HH:mm", { locale: de })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────

type KpiColor = 'default' | 'blue' | 'amber' | 'red'

function KpiCard({
  label, value, href, color = 'default',
}: {
  label: string; value: number | null; href: string; color?: KpiColor
}) {
  const styles: Record<KpiColor, string> = {
    default: 'bg-white border-stone-200 text-foreground',
    blue:    'bg-blue-50 border-blue-200 text-blue-800',
    amber:   'bg-amber-50 border-amber-200 text-amber-800',
    red:     'bg-red-50 border-red-200 text-red-800',
  }
  if (value === null) {
    return (
      <div className="block rounded-lg border p-5 bg-stone-50 border-stone-200 text-muted-foreground">
        <p className="text-sm font-500">Nicht verfügbar</p>
        <p className="text-xs mt-1.5 font-500 uppercase tracking-wider opacity-70">{label}</p>
      </div>
    )
  }

  return (
    <Link href={href} className={`block rounded-lg border p-5 hover:shadow-sm transition-shadow ${styles[color]}`}>
      <p className={`text-3xl font-600 mono tracking-tight ${color === 'default' ? '' : ''}`}>
        {value}
      </p>
      <p className="text-xs mt-1.5 font-500 uppercase tracking-wider opacity-70">{label}</p>
    </Link>
  )
}

function ActivityIcon({ action }: { action: string }) {
  if (action === 'CREATE')        return <svg className="w-3.5 h-3.5 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
  if (action === 'FINALIZE')      return <svg className="w-3.5 h-3.5 text-emerald-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd"/></svg>
  if (action === 'STATUS_CHANGE') return <svg className="w-3.5 h-3.5 text-amber-600" fill="currentColor" viewBox="0 0 20 20"><path d="M10 3a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM10 8.5a1.5 1.5 0 110 3 1.5 1.5 0 010-3zM11.5 15.5a1.5 1.5 0 10-3 0 1.5 1.5 0 003 0z"/></svg>
  return <svg className="w-3.5 h-3.5 text-stone-400" fill="currentColor" viewBox="0 0 20 20"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z"/></svg>
}
