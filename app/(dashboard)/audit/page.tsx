// app/(dashboard)/audit/page.tsx
import type { Metadata }   from 'next'
import Link                from 'next/link'
import { PageHeader }      from '@/components/shared/PageHeader'
import {
  getAuditEntityLabel,
  getAuditLogs,
  AUDIT_ENTITY_LABELS,
  AUDIT_ENTITY_TYPES,
} from '@/lib/services/audit-query.service'
import { requirePagePermission, Resource, Action } from '@/lib/auth/permissions'
import { AuditAction, type AuditAction as AuditActionType } from '@/types/enums'
import { format }          from 'date-fns'
import { de }              from 'date-fns/locale'

export const metadata: Metadata = { title: 'Audit-Log' }

interface SearchParams {
  entityType?: string
  action?:     string
  search?:     string
  from?:       string
  to?:         string
  page?:       string
}

const ACTION_COLORS: Partial<Record<AuditActionType, string>> = {
  CREATE:             'bg-blue-50 text-blue-700 border-blue-200',
  UPDATE:             'bg-sky-50 text-sky-700 border-sky-200',
  DELETE:             'bg-red-50 text-red-700 border-red-200',
  FINALIZE:           'bg-emerald-50 text-emerald-700 border-emerald-200',
  CANCEL:             'bg-orange-50 text-orange-700 border-orange-200',
  STATUS_CHANGE:      'bg-amber-50 text-amber-700 border-amber-200',
  PAYMENT_ADDED:      'bg-emerald-50 text-emerald-700 border-emerald-200',
  PAYMENT_REMOVED:    'bg-red-50 text-red-600 border-red-200',
  DOCUMENT_UPLOADED:  'bg-violet-50 text-violet-700 border-violet-200',
  DOCUMENT_DELETED:   'bg-red-50 text-red-700 border-red-200',
  SETTINGS_CHANGED:   'bg-amber-50 text-amber-800 border-amber-200',
  LOGIN:              'bg-stone-100 text-stone-600 border-stone-200',
}

const AUDIT_ACTIONS = Object.values(AuditAction)

function isAuditAction(value: string): value is AuditActionType {
  return AUDIT_ACTIONS.some((action) => action === value)
}

function getAuditActionColor(action: string): string {
  return isAuditAction(action)
    ? ACTION_COLORS[action] ?? 'bg-stone-100 text-stone-600 border-stone-200'
    : 'bg-stone-100 text-stone-600 border-stone-200'
}

export default async function AuditLogPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query = await searchParams
  await requirePagePermission(Resource.AUDIT_LOG, Action.READ)

  const page       = parseInt(query.page ?? '1', 10)
  const entityType = query.entityType ?? ''
  const actionValue = query.action    ?? ''
  const action     = isAuditAction(actionValue) ? actionValue : undefined
  const search     = query.search     ?? ''
  const from       = query.from ? new Date(query.from) : undefined
  const to         = query.to   ? new Date(query.to)   : undefined

  const result = await getAuditLogs({
    entityType: entityType || undefined,
    action,
    search:     search     || undefined,
    from, to, page,
  })

  return (
    <div>
      <PageHeader
        title="Audit-Log"
        description="Revisionssichere Aufzeichnung aller kritischen Systemaktionen — nur lesbar"
        breadcrumbs={[{ label: 'Audit-Log' }]}
      />

      <div className="p-6">
        <div className="mb-4 flex items-start gap-2 p-3 rounded-md bg-amber-50 border border-amber-200 text-sm text-amber-800">
          <svg className="w-4 h-4 mt-0.5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd"/>
          </svg>
          Audit-Logs sind unveränderlich. Einträge können nicht bearbeitet oder gelöscht werden.
        </div>

        <div className="card-base overflow-hidden">
          {/* Filter bar */}
          <div className="px-6 py-3 border-b border-stone-100">
            <form className="flex flex-wrap items-center gap-3">
              <input type="search" name="search" placeholder="Benutzer-E-Mail, Entity-ID …"
                defaultValue={search}
                className="h-8 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent w-56" />

              <select name="entityType" defaultValue={entityType}
                className="h-8 px-2.5 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent">
                <option value="">Alle Entitäten</option>
                {AUDIT_ENTITY_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {AUDIT_ENTITY_LABELS[t] ?? t}
                  </option>
                ))}
              </select>

              <select name="action" defaultValue={actionValue}
                className="h-8 px-2.5 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent">
                <option value="">Alle Aktionen</option>
                {AUDIT_ACTIONS.map((a) => (
                  <option key={a} value={a}>{a}</option>
                ))}
              </select>

              <div className="flex items-center gap-1.5">
                <input type="date" name="from" defaultValue={query.from ?? ''}
                  className="h-8 px-2.5 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
                <span className="text-xs text-muted-foreground">–</span>
                <input type="date" name="to" defaultValue={query.to ?? ''}
                  className="h-8 px-2.5 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
              </div>

              <button type="submit"
                className="h-8 px-3 rounded-md bg-stone-800 text-white text-xs font-500 hover:bg-stone-900 transition-colors">
                Filtern
              </button>
              {(search || entityType || actionValue || query.from || query.to) && (
                <Link href="/audit" className="text-xs text-muted-foreground hover:text-foreground">
                  Zurücksetzen
                </Link>
              )}
              <p className="ml-auto text-xs text-muted-foreground mono">
                {result.total.toLocaleString('de-DE')} Einträge
              </p>
            </form>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Zeitstempel</th>
                  <th>Benutzer</th>
                  <th>Aktion</th>
                  <th>Entität</th>
                  <th>ID</th>
                  <th className="w-10"></th>
                </tr>
              </thead>
              <tbody>
                {result.entries.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center py-12 text-sm text-muted-foreground">
                      Keine Einträge für den gewählten Filter.
                    </td>
                  </tr>
                )}
                {result.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="mono text-xs whitespace-nowrap">
                      {format(new Date(entry.createdAt), 'dd.MM.yy HH:mm:ss', { locale: de })}
                    </td>
                    <td>
                      <div>
                        <p className="text-sm font-500">
                          {entry.userName ?? <span className="text-muted-foreground italic">System</span>}
                        </p>
                        {entry.userEmail && (
                          <p className="text-xs text-muted-foreground">{entry.userEmail}</p>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-500 ${
                        getAuditActionColor(entry.action)
                      }`}>
                        {entry.action}
                      </span>
                    </td>
                    <td>
                      <span className="text-xs text-muted-foreground">
                        {getAuditEntityLabel(entry.entityType)}
                      </span>
                    </td>
                    <td>
                      <span className="mono text-xs text-muted-foreground truncate block max-w-[120px]">
                        {entry.entityId}
                      </span>
                    </td>
                    <td>
                      <Link
                        href={`/audit/${entry.id}`}
                        className="p-1.5 rounded text-muted-foreground hover:text-blue-700 hover:bg-blue-50 transition-colors block"
                        title="Details"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"/>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
                        </svg>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {result.totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-3 border-t border-stone-100">
              <p className="text-xs text-muted-foreground">
                Seite {result.page} von {result.totalPages}
              </p>
              <div className="flex gap-1">
                {result.page > 1 && (
                  <a href={`?${new URLSearchParams({ ...query, page: String(result.page - 1) })}`}
                    className="h-7 px-2.5 rounded text-xs font-500 mono bg-white border border-stone-200 hover:bg-stone-50 transition-colors">
                    ←
                  </a>
                )}
                {result.page < result.totalPages && (
                  <a href={`?${new URLSearchParams({ ...query, page: String(result.page + 1) })}`}
                    className="h-7 px-2.5 rounded text-xs font-500 mono bg-white border border-stone-200 hover:bg-stone-50 transition-colors">
                    →
                  </a>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
