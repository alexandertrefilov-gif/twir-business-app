'use client'
// components/customers/CustomerTable.tsx

import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition } from 'react'
import { ConfirmDialog }        from '@/components/shared/ConfirmDialog'
import { deleteCustomerAction } from '@/app/(dashboard)/customers/actions'
import type { CustomerListItem } from '@/lib/services/customer.service'

interface CustomerTableProps {
  customers:  CustomerListItem[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
  search:     string
  canDelete:  boolean
}

export function CustomerTable({
  customers, total, page, pageSize, totalPages, search, canDelete,
}: CustomerTableProps) {
  const router     = useRouter()
  const pathname   = usePathname()
  const params     = useSearchParams()
  const [, startT] = useTransition()

  function navigate(updates: Record<string, string | number>) {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates)) {
      next.set(k, String(v))
    }
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div>
      {/* ── Search + summary bar ── */}
      <div className="flex items-center justify-between gap-4 px-6 py-3 border-b border-stone-100">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
          </svg>
          <input
            type="search"
            placeholder="Suchen…"
            defaultValue={search}
            onChange={(e) => {
              const v = e.target.value
              startT(() => navigate({ search: v, page: 1 }))
            }}
            className="h-8 pl-8 pr-3 rounded-md border border-stone-200 bg-white text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent w-56"
          />
        </div>
        <p className="text-xs text-muted-foreground mono">
          {total.toLocaleString('de-DE')} Kunden
        </p>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <SortHeader label="Nr." field="number"   params={params} navigate={navigate} />
              <SortHeader label="Kunde" field="name"   params={params} navigate={navigate} />
              <th>Rechtsform</th>
              <SortHeader label="Ort" field="city"     params={params} navigate={navigate} />
              <th>Kontakt</th>
              <th className="num text-right">AN</th>
              <th className="num text-right">AU</th>
              <th className="num text-right">RE</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {customers.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center py-12 text-muted-foreground text-sm">
                  {search ? `Keine Kunden für „${search}" gefunden.` : 'Noch keine Kunden angelegt.'}
                </td>
              </tr>
            )}
            {customers.map((c) => (
              <tr key={c.id} className="cursor-pointer group" onClick={() => router.push(`/customers/${c.id}`)}>
                <td>
                  <span className="mono text-xs text-muted-foreground">{c.number}</span>
                </td>
                <td>
                  <div>
                    <p className="font-500 text-foreground leading-tight">{c.name}</p>
                    {c.email && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-[200px]">{c.email}</p>
                    )}
                  </div>
                </td>
                <td>
                  {c.legalForm && (
                    <span className="text-xs text-muted-foreground">{c.legalForm}</span>
                  )}
                </td>
                <td>
                  <span className="text-sm">{c.city ?? '–'}</span>
                </td>
                <td>
                  {c.phone && (
                    <span className="text-xs text-muted-foreground mono">{c.phone}</span>
                  )}
                </td>
                <td className="num text-right">
                  <CountBadge n={c.offerCount} />
                </td>
                <td className="num text-right">
                  <CountBadge n={c.orderCount} />
                </td>
                <td className="num text-right">
                  <CountBadge n={c.invoiceCount} />
                </td>
                <td onClick={(e) => e.stopPropagation()}>
                  <RowActions customerId={c.id} canDelete={canDelete} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between gap-4 px-6 py-3 border-t border-stone-100">
          <p className="text-xs text-muted-foreground">
            Seite {page} von {totalPages}
          </p>
          <div className="flex gap-1">
            <PaginationBtn
              disabled={page <= 1}
              onClick={() => navigate({ page: page - 1 })}
              label="←"
            />
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
              return (
                <PaginationBtn
                  key={p}
                  active={p === page}
                  onClick={() => navigate({ page: p })}
                  label={String(p)}
                />
              )
            })}
            <PaginationBtn
              disabled={page >= totalPages}
              onClick={() => navigate({ page: page + 1 })}
              label="→"
            />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────

function CountBadge({ n }: { n: number }) {
  if (n === 0) return <span className="text-stone-300">–</span>
  return <span className="mono text-xs">{n}</span>
}

function SortHeader({
  label, field, params, navigate,
}: {
  label: string; field: string
  params: URLSearchParams
  navigate: (u: Record<string, string | number>) => void
}) {
  const current = params.get('sort') === field
  const order   = current ? (params.get('order') === 'asc' ? 'desc' : 'asc') : 'asc'
  return (
    <th
      className="cursor-pointer select-none hover:text-foreground"
      onClick={() => navigate({ sort: field, order, page: 1 })}
    >
      <span className="flex items-center gap-1">
        {label}
        {current && (
          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            {params.get('order') === 'asc'
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5"/>
              : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5"/>
            }
          </svg>
        )}
      </span>
    </th>
  )
}

function PaginationBtn({
  label, active, disabled, onClick,
}: {
  label: string; active?: boolean; disabled?: boolean; onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`
        h-7 min-w-[28px] px-2 rounded text-xs font-500 transition-colors mono
        ${active
          ? 'bg-blue-700 text-white'
          : 'bg-white border border-stone-200 text-foreground hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed'
        }
      `}
    >
      {label}
    </button>
  )
}

function RowActions({ customerId, canDelete }: { customerId: string; canDelete: boolean }) {
  const router = useRouter()
  return (
    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
      <Link
        href={`/customers/${customerId}/edit`}
        className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-stone-100 transition-colors"
        title="Bearbeiten"
        onClick={(e) => e.stopPropagation()}
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"/>
        </svg>
      </Link>

      {canDelete && (
        <ConfirmDialog
          title="Kunden löschen?"
          description="Der Kunde wird deaktiviert und kann nicht mehr verwendet werden. Bestehende Dokumente bleiben erhalten."
          confirmLabel="Löschen"
          danger
          onConfirm={async () => {
            await deleteCustomerAction(customerId)
            router.refresh()
          }}
          trigger={
            <button
              className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Löschen"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/>
              </svg>
            </button>
          }
        />
      )}
    </div>
  )
}
