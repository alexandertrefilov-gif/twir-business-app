// app/(dashboard)/customers/page.tsx
import type { Metadata }    from 'next'
import Link                 from 'next/link'
import { PageHeader }       from '@/components/shared/PageHeader'
import { CustomerTable }    from '@/components/customers/CustomerTable'
import { getCustomers }     from '@/lib/services/customer.service'
import { hasPermission, requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { isTestDeleteEnabled } from '@/lib/security/test-delete'

export const metadata: Metadata = { title: 'Kunden' }

interface SearchParams {
  search?:  string
  page?:    string
  sort?:    string
  order?:   string
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const query = await searchParams
  await requirePermission(Resource.CUSTOMER, Action.READ)

  const page    = parseInt(query.page  ?? '1', 10)
  const search  = query.search ?? ''
  const sort    = (query.sort  ?? 'createdAt') as 'name' | 'number' | 'city' | 'createdAt'
  const order   = (query.order ?? 'desc')  as 'asc' | 'desc'

  const [result, canCreate, canDelete] = await Promise.all([
    getCustomers({ search, page, sort, order }),
    hasPermission(Resource.CUSTOMER, Action.CREATE),
    hasPermission(Resource.CUSTOMER, Action.DELETE),
  ])

  return (
    <div>
      <PageHeader
        title="Kunden"
        description="Kundenstammdaten verwalten"
        breadcrumbs={[{ label: 'Kunden' }]}
        actions={
          canCreate && (
            <Link
              href="/customers/new"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-blue-700 text-white text-sm font-500 hover:bg-blue-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
              </svg>
              Neuer Kunde
            </Link>
          )
        }
      />

      <div className="p-6">
        <div className="card-base overflow-hidden">
          <CustomerTable
            customers={result.customers}
            total={result.total}
            page={result.page}
            pageSize={result.pageSize}
            totalPages={result.totalPages}
            search={search}
            canDelete={canDelete && isTestDeleteEnabled()}
          />
        </div>
      </div>
    </div>
  )
}
