'use client'

import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { useTransition } from 'react'
import Link from 'next/link'
import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { OrderStatusBadge } from '@/components/orders/OrderStatusBadge'
import { RecordDeleteButton } from '@/components/shared/RecordDeleteButton'
import type { OrderListItem } from '@/lib/services/order.service'
import { ORDER_STATUS_LABELS } from '@/types/enums'

interface OrderTableProps {
  orders: OrderListItem[]
  total: number
  page: number
  totalPages: number
  search: string
  statusFilter: string
  canDelete: boolean
}

const STATUS_OPTIONS = [
  { value: '', label: 'Alle Status' },
  ...Object.entries(ORDER_STATUS_LABELS).map(([value, label]) => ({ value, label })),
]

export function OrderTable({
  orders,
  total,
  page,
  totalPages,
  search,
  statusFilter,
  canDelete,
}: OrderTableProps) {
  const router = useRouter()
  const pathname = usePathname()
  const params = useSearchParams()
  const [, startTransition] = useTransition()

  function navigate(updates: Record<string, string | number>) {
    const next = new URLSearchParams(params.toString())
    for (const [key, value] of Object.entries(updates)) {
      if (value === '') next.delete(key)
      else next.set(key, String(value))
    }
    router.push(`${pathname}?${next.toString()}`)
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3 border-b border-stone-100 px-6 py-3">
        <div className="relative">
          <svg className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <input
            type="search"
            placeholder="Nummer, Bezeichnung, Kunde …"
            defaultValue={search}
            onChange={(event) => startTransition(() => navigate({ search: event.target.value, page: 1 }))}
            className="h-8 w-60 rounded-md border border-stone-200 bg-white pl-8 pr-3 text-sm placeholder:text-muted-foreground focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(event) => navigate({ status: event.target.value, page: 1 })}
          className="h-8 rounded-md border border-stone-200 bg-white px-2.5 text-sm focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-600"
        >
          {STATUS_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
        <p className="mono ml-auto text-xs text-muted-foreground">
          {total.toLocaleString('de-DE')} Aufträge
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              <SortHeader label="Nummer" field="orderNumber" params={params} navigate={navigate} />
              <th>Bezeichnung</th>
              <th>Kunde</th>
              <th>Aus Angebot</th>
              <SortHeader label="Datum" field="orderDate" params={params} navigate={navigate} />
              <th>Status</th>
              <th className="text-right">LN</th>
              <SortHeader label="Brutto" field="totalGross" params={params} navigate={navigate} align="right" />
              <th className="w-px whitespace-nowrap text-center">Löschen</th>
            </tr>
          </thead>
          <tbody>
            {orders.length === 0 && (
              <tr>
                <td colSpan={9} className="py-12 text-center text-sm text-muted-foreground">
                  {search || statusFilter
                    ? 'Keine Aufträge für den gewählten Filter.'
                    : 'Noch keine Aufträge vorhanden.'}
                </td>
              </tr>
            )}
            {orders.map((order) => (
              <tr
                key={order.id}
                className="group cursor-pointer"
                onClick={() => router.push(`/orders/${order.id}`)}
              >
                <td className="whitespace-nowrap">
                  <span className="mono text-xs font-500 text-foreground">{order.orderNumber}</span>
                </td>
                <td className="whitespace-nowrap">
                  <span className="block max-w-[200px] truncate text-sm font-500 text-foreground">
                    {order.title ?? <span className="font-400 italic text-muted-foreground">Keine Bezeichnung</span>}
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  <Link
                    href={`/customers/${order.customerId}`}
                    className="text-sm text-blue-700 hover:underline"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {order.customerName}
                  </Link>
                </td>
                <td className="whitespace-nowrap">
                  {order.offerNumber
                    ? <span className="mono text-xs text-muted-foreground">{order.offerNumber}</span>
                    : <span className="text-xs text-muted-foreground">–</span>}
                </td>
                <td className="whitespace-nowrap">
                  <span className="mono text-xs">
                    {format(new Date(order.orderDate), 'dd.MM.yyyy', { locale: de })}
                  </span>
                </td>
                <td className="whitespace-nowrap">
                  <OrderStatusBadge status={order.status} size="sm" />
                </td>
                <td className="whitespace-nowrap text-right">
                  {order.serviceReportCount > 0
                    ? <span className="mono text-xs">{order.serviceReportCount}</span>
                    : <span className="text-stone-300">–</span>}
                </td>
                <td className="whitespace-nowrap text-right">
                  <span className="mono text-sm font-500">
                    {order.totalGross.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}
                  </span>
                </td>
                <td
                  className="w-px whitespace-nowrap text-center"
                  onClick={(event) => event.stopPropagation()}
                >
                  {canDelete && <RecordDeleteButton id={order.id} type="order" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t border-stone-100 px-6 py-3">
          <p className="text-xs text-muted-foreground">Seite {page} von {totalPages}</p>
          <div className="flex gap-1">
            <PaginationButton disabled={page <= 1} onClick={() => navigate({ page: page - 1 })} label="←" />
            {Array.from({ length: Math.min(5, totalPages) }, (_, index) => {
              const targetPage = Math.max(1, Math.min(page - 2, totalPages - 4)) + index
              return (
                <PaginationButton
                  key={targetPage}
                  active={targetPage === page}
                  onClick={() => navigate({ page: targetPage })}
                  label={String(targetPage)}
                />
              )
            })}
            <PaginationButton disabled={page >= totalPages} onClick={() => navigate({ page: page + 1 })} label="→" />
          </div>
        </div>
      )}
    </div>
  )
}

function SortHeader({
  label,
  field,
  params,
  navigate,
  align = 'left',
}: {
  label: string
  field: string
  params: URLSearchParams
  navigate: (updates: Record<string, string | number>) => void
  align?: 'left' | 'right'
}) {
  const active = params.get('sort') === field
  const order = active && params.get('order') === 'asc' ? 'desc' : 'asc'
  return (
    <th
      className={`cursor-pointer select-none hover:text-foreground ${align === 'right' ? 'text-right' : ''}`}
      onClick={() => navigate({ sort: field, order, page: 1 })}
    >
      <span className={`flex items-center gap-1 ${align === 'right' ? 'justify-end' : ''}`}>
        {label}
        {active && (
          <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            {params.get('order') === 'asc'
              ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
              : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />}
          </svg>
        )}
      </span>
    </th>
  )
}

function PaginationButton({
  label,
  active,
  disabled,
  onClick,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`mono h-7 min-w-[28px] rounded px-2 text-xs font-500 transition-colors ${
        active
          ? 'bg-blue-700 text-white'
          : 'border border-stone-200 bg-white text-foreground hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40'
      }`}
    >
      {label}
    </button>
  )
}
