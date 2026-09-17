// app/(dashboard)/orders/page.tsx
import type { Metadata } from 'next'
import Link from 'next/link'
import { PageHeader }     from '@/components/shared/PageHeader'
import { OrderTable } from '@/components/orders/OrderTable'
import { getOrders }       from '@/lib/services/order.service'
import { hasPermission, Resource, Action } from '@/lib/auth/permissions'
import { isTestDeleteEnabled } from '@/lib/security/test-delete'

export const metadata: Metadata = { title: 'Aufträge' }

interface SearchParams {
  search?: string
  status?: string
  page?: string
  sort?: string
  order?: string
}

export default async function OrdersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const query  = await searchParams
  const page   = parseInt(query.page ?? '1', 10)
  const search = query.search ?? ''
  const status = query.status ?? ''
  const sort = (query.sort ?? 'orderDate') as 'orderNumber' | 'orderDate' | 'totalGross' | 'status'
  const order = (query.order ?? 'desc') as 'asc' | 'desc'
  const canDeleteAllStatuses = isTestDeleteEnabled()

  const [result, canCreate, canDelete] = await Promise.all([
    getOrders({ search, status: status || undefined, page, sort, order }),
    hasPermission(Resource.ORDER, Action.CREATE),
    hasPermission(Resource.ORDER, Action.DELETE),
  ])

  return (
    <div>
      <PageHeader
        title="Aufträge"
        description="Laufende und abgeschlossene Aufträge"
        breadcrumbs={[{ label: 'Aufträge' }]}
        actions={canCreate && (
          <Link href="/orders/new"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-blue-700 text-white text-sm font-500 hover:bg-blue-800 transition-colors">
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/></svg>
            Neuer Auftrag
          </Link>
        )}
      />

      <div className="p-6">
        <div className="card-base overflow-hidden">
          <OrderTable
            orders={result.orders}
            total={result.total}
            page={result.page}
            totalPages={result.totalPages}
            search={search}
            statusFilter={status}
            canDelete={canDelete && canDeleteAllStatuses}
          />
        </div>
      </div>
    </div>
  )
}
