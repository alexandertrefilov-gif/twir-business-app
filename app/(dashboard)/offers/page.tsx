// app/(dashboard)/offers/page.tsx
import type { Metadata }  from 'next'
import Link               from 'next/link'
import { PageHeader }     from '@/components/shared/PageHeader'
import { OfferTable }     from '@/components/offers/OfferTable'
import { getOffers }      from '@/lib/services/offer.service'
import { hasPermission, requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { isTestDeleteEnabled } from '@/lib/security/test-delete'

export const metadata: Metadata = { title: 'Angebote' }

interface SearchParams {
  search?: string
  status?: string
  page?:   string
  sort?:   string
  order?:  string
}

export default async function OffersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  const query = await searchParams
  await requirePermission(Resource.OFFER, Action.READ)

  const page   = parseInt(query.page ?? '1', 10)
  const search = query.search ?? ''
  const status = query.status ?? ''
  const sort   = (query.sort  ?? 'offerDate') as 'offerNumber' | 'offerDate' | 'totalGross' | 'status'
  const order  = (query.order ?? 'desc')      as 'asc' | 'desc'

  const [result, canCreate, canDelete] = await Promise.all([
    getOffers({ search, status: status || undefined, page, sort, order }),
    hasPermission(Resource.OFFER, Action.CREATE),
    hasPermission(Resource.OFFER, Action.DELETE),
  ])

  return (
    <div>
      <PageHeader
        title="Angebote"
        description="Angebote erstellen, versenden und verwalten"
        breadcrumbs={[{ label: 'Angebote' }]}
        actions={
          canCreate && (
            <Link
              href="/offers/new"
              className="inline-flex items-center gap-1.5 h-9 px-4 rounded-md bg-blue-700 text-white text-sm font-500 hover:bg-blue-800 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
              </svg>
              Neues Angebot
            </Link>
          )
        }
      />
      <div className="p-6">
        <div className="card-base overflow-hidden">
          <OfferTable
            offers={result.offers}
            total={result.total}
            page={result.page}
            totalPages={result.totalPages}
            search={search}
            statusFilter={status}
            canDelete={canDelete && isTestDeleteEnabled()}
            canDeleteAllStatuses={isTestDeleteEnabled()}
            canCopy={canCreate}
          />
        </div>
      </div>
    </div>
  )
}
