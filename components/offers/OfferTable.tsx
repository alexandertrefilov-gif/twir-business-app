'use client'
// components/offers/OfferTable.tsx

import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { useTransition }   from 'react'
import Link                from 'next/link'
import { OfferStatusBadge } from './OfferStatusBadge'
import type { OfferListItem } from '@/lib/services/offer.service'
import { OFFER_STATUS_LABELS } from '@/types/enums'
import { format } from 'date-fns'
import { de }     from 'date-fns/locale'

interface OfferTableProps {
  offers:     OfferListItem[]
  total:      number
  page:       number
  totalPages: number
  search:     string
  statusFilter: string
}

const STATUS_OPTIONS = [
  { value: '', label: 'Alle Status' },
  ...Object.entries(OFFER_STATUS_LABELS).map(([v, l]) => ({ value: v, label: l })),
]

export function OfferTable({
  offers, total, page, totalPages, search, statusFilter,
}: OfferTableProps) {
  const router     = useRouter()
  const pathname   = usePathname()
  const params     = useSearchParams()
  const [, startT] = useTransition()

  function nav(updates: Record<string, string | number>) {
    const next = new URLSearchParams(params.toString())
    for (const [k, v] of Object.entries(updates)) {
      if (v === '') next.delete(k)
      else next.set(k, String(v))
    }
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div>
      {/* ── Filter bar ── */}
      <div className="flex flex-wrap items-center gap-3 px-6 py-3 border-b border-stone-100">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"/>
          </svg>
          <input
            type="search"
            placeholder="Nummer, Betreff, Kunde …"
            defaultValue={search}
            onChange={(e) => startT(() => nav({ search: e.target.value, page: 1 }))}
            className="h-8 pl-8 pr-3 rounded-md border border-stone-200 bg-white text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent w-60"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => nav({ status: e.target.value, page: 1 })}
          className="h-8 px-2.5 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
        <p className="ml-auto text-xs text-muted-foreground mono">
          {total.toLocaleString('de-DE')} Angebote
        </p>
      </div>

      {/* ── Table ── */}
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <SortTh label="Nummer"   field="offerNumber" params={params} nav={nav} />
              <th>Kunde</th>
              <th>Betreff</th>
              <SortTh label="Datum"    field="offerDate"   params={params} nav={nav} />
              <th>Gültig bis</th>
              <th>Status</th>
              <SortTh label="Brutto"   field="totalGross"  params={params} nav={nav} className="text-right" />
            </tr>
          </thead>
          <tbody>
            {offers.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center py-12 text-sm text-muted-foreground">
                  {search || statusFilter
                    ? 'Keine Angebote für den gewählten Filter.'
                    : 'Noch keine Angebote angelegt.'}
                </td>
              </tr>
            )}
            {offers.map((o) => {
              const isExpired =
                o.status === 'SENT' &&
                o.validUntil &&
                new Date(o.validUntil) < new Date()

              return (
                <tr
                  key={o.id}
                  className="cursor-pointer group"
                  onClick={() => router.push(`/offers/${o.id}`)}
                >
                  <td>
                    <span className="mono text-xs font-500 text-foreground">{o.offerNumber}</span>
                  </td>
                  <td>
                    <Link
                      href={`/customers/${o.customerId}`}
                      className="text-sm text-blue-700 hover:underline"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {o.customerName}
                    </Link>
                  </td>
                  <td>
                    <span className="text-sm text-foreground truncate block max-w-[200px]">
                      {o.title ?? <span className="text-muted-foreground italic">Kein Betreff</span>}
                    </span>
                  </td>
                  <td>
                    <span className="mono text-xs">
                      {format(new Date(o.offerDate), 'dd.MM.yyyy', { locale: de })}
                    </span>
                  </td>
                  <td>
                    {o.validUntil ? (
                      <span className={`mono text-xs ${isExpired ? 'text-red-600' : ''}`}>
                        {format(new Date(o.validUntil), 'dd.MM.yyyy', { locale: de })}
                        {isExpired && ' ⚠'}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">–</span>
                    )}
                  </td>
                  <td>
                    <OfferStatusBadge status={o.status} size="sm" />
                  </td>
                  <td className="text-right">
                    <span className="mono text-sm font-500">
                      {o.totalGross.toLocaleString('de-DE', {
                        style:    'currency',
                        currency: 'EUR',
                      })}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-6 py-3 border-t border-stone-100">
          <p className="text-xs text-muted-foreground">Seite {page} von {totalPages}</p>
          <div className="flex gap-1">
            <PagBtn disabled={page <= 1}        onClick={() => nav({ page: page - 1 })} label="←" />
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i
              return <PagBtn key={p} active={p === page} onClick={() => nav({ page: p })} label={String(p)} />
            })}
            <PagBtn disabled={page >= totalPages} onClick={() => nav({ page: page + 1 })} label="→" />
          </div>
        </div>
      )}
    </div>
  )
}

// ── Helpers ───────────────────────────────────────────────────

function SortTh({
  label, field, params, nav, className = '',
}: {
  label: string; field: string
  params: URLSearchParams
  nav: (u: Record<string, string | number>) => void
  className?: string
}) {
  const active = params.get('sort') === field
  const order  = active ? (params.get('order') === 'asc' ? 'desc' : 'asc') : 'asc'
  return (
    <th
      className={`cursor-pointer select-none hover:text-foreground ${className}`}
      onClick={() => nav({ sort: field, order, page: 1 })}
    >
      <span className="flex items-center gap-1">
        {label}
        {active && (
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

function PagBtn({ label, active, disabled, onClick }: { label: string; active?: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`h-7 min-w-[28px] px-2 rounded text-xs font-500 transition-colors mono
        ${active
          ? 'bg-blue-700 text-white'
          : 'bg-white border border-stone-200 text-foreground hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed'}`}
    >
      {label}
    </button>
  )
}
