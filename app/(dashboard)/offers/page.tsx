// app/(dashboard)/offers/page.tsx
import type { Metadata }  from 'next'
import Link               from 'next/link'
import { PageHeader }     from '@/components/shared/PageHeader'
import { OfferTable }     from '@/components/offers/OfferTable'
import { getOffers }      from '@/lib/services/offer.service'
import { hasPermission, requirePermission, Resource, Action } from '@/lib/auth/permissions'

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
  searchParams: SearchParams
}) {
  await requirePermission(Resource.OFFER, Action.READ)

  const page   = parseInt(searchParams.page ?? '1', 10)
  const search = searchParams.search ?? ''
  const status = searchParams.status ?? ''
  const sort   = (searchParams.sort  ?? 'offerDate') as 'offerNumber' | 'offerDate' | 'totalGross' | 'status'
  const order  = (searchParams.order ?? 'desc')      as 'asc' | 'desc'

  const [result, canCreate] = await Promise.all([
    getOffers({ search, status: status || undefined, page, sort, order }),
    hasPermission(Resource.OFFER, Action.CREATE),
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
          />
        </div>
      </div>
    </div>
  )
}
