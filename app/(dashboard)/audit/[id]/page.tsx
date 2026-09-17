// app/(dashboard)/audit/[id]/page.tsx
import type { Metadata }   from 'next'
import { notFound }        from 'next/navigation'
import Link                from 'next/link'
import { PageHeader }      from '@/components/shared/PageHeader'
import { getAuditLogById } from '@/lib/services/audit-query.service'
import { requirePagePermission, Resource, Action } from '@/lib/auth/permissions'
import { format }          from 'date-fns'
import { de }              from 'date-fns/locale'

export const metadata: Metadata = { title: 'Audit-Eintrag' }

export default async function AuditDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requirePagePermission(Resource.AUDIT_LOG, Action.READ)

  const entry = await getAuditLogById(id)
  if (!entry) notFound()

  return (
    <div>
      <PageHeader
        title="Audit-Eintrag"
        description="Revisionssichere, unveränderliche Aufzeichnung"
        breadcrumbs={[
          { label: 'Audit-Log', href: '/audit' },
          { label: entry.id.slice(0, 8) + '…' },
        ]}
      />

      <div className="p-6 max-w-3xl">
        <div className="space-y-4">

          {/* Header card */}
          <div className="card-base p-5">
            <div className="grid grid-cols-2 gap-6">
              <MetaItem label="Zeitstempel"
                value={format(new Date(entry.createdAt), 'dd. MMMM yyyy HH:mm:ss', { locale: de })} />
              <MetaItem label="Aktion" value={entry.action} mono />
              <MetaItem label="Entität" value={entry.entityType} />
              <MetaItem label="Entität-ID" value={entry.entityId} mono />
              <MetaItem
                label="Benutzer"
                value={entry.user
                  ? `${entry.user.firstName} ${entry.user.lastName} (${entry.userEmail})`
                  : entry.userEmail ?? 'System'}
              />
              <MetaItem label="Log-ID" value={entry.id} mono />
            </div>
          </div>

          {/* Old value */}
          {entry.oldValue && (
            <div className="card-base overflow-hidden">
              <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <h2 className="text-sm font-600">Zustand vorher</h2>
              </div>
              <pre className="p-5 text-xs font-mono text-stone-700 bg-red-50/30 overflow-x-auto leading-relaxed">
                {JSON.stringify(entry.oldValue, null, 2)}
              </pre>
            </div>
          )}

          {/* New value */}
          {entry.newValue && (
            <div className="card-base overflow-hidden">
              <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
                <h2 className="text-sm font-600">Zustand nachher</h2>
              </div>
              <pre className="p-5 text-xs font-mono text-stone-700 bg-emerald-50/30 overflow-x-auto leading-relaxed">
                {JSON.stringify(entry.newValue, null, 2)}
              </pre>
            </div>
          )}

          {/* Metadata */}
          {entry.metadata && (
            <div className="card-base overflow-hidden">
              <div className="px-5 py-3 border-b border-stone-100">
                <h2 className="text-sm font-600">Metadaten</h2>
              </div>
              <pre className="p-5 text-xs font-mono text-stone-700 bg-stone-50 overflow-x-auto leading-relaxed">
                {JSON.stringify(entry.metadata, null, 2)}
              </pre>
            </div>
          )}

          {/* Immutability notice */}
          <div className="flex items-center gap-2 p-3 rounded-md bg-stone-50 border border-stone-200 text-xs text-muted-foreground">
            <svg className="w-3.5 h-3.5 text-stone-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd"/>
            </svg>
            Dieser Eintrag ist unveränderlich archiviert. Eine Bearbeitung oder Löschung ist technisch nicht möglich.
          </div>

          <div className="flex justify-end">
            <Link href="/audit"
              className="h-9 px-4 rounded-md border border-stone-200 bg-white text-sm font-500 hover:bg-stone-50 transition-colors">
              ← Zurück zur Liste
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}

function MetaItem({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm text-foreground break-all ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}
