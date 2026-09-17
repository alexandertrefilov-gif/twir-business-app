// app/(dashboard)/offers/new/page.tsx
import type { Metadata }   from 'next'
import { PageHeader }      from '@/components/shared/PageHeader'
import { OfferForm }       from '@/components/offers/OfferForm'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }          from '@/lib/db/prisma'
import { getOfferById }    from '@/lib/services/offer.service'
import { createOfferAction } from '../actions'
import { BusinessDocumentLayout, BusinessDocumentSidebar, BusinessWorkflowPlaceholder } from '@/components/documents/BusinessDocumentLayout'
import { DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID } from '@/components/documents/DocumentFormWorkflowActions'

export const metadata: Metadata = { title: 'Neues Angebot' }

export default async function NewOfferPage({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string; copy?: string }>
}) {
  const query = await searchParams
  await requirePermission(Resource.OFFER, Action.CREATE)

  let sourceOffer: Awaited<ReturnType<typeof getOfferById>> | null = null
  if (query.copy) {
    await requirePermission(Resource.OFFER, Action.READ)
    sourceOffer = await getOfferById(query.copy)
  }

  const customers = await prisma.customer.findMany({
    where:   { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select:  { id: true, name: true, number: true },
  })

  return (
    <div>
      <PageHeader
        sticky
        title={sourceOffer ? 'Angebot kopieren' : 'Neues Angebot'}
        description={sourceOffer
          ? `${sourceOffer.offerNumber} als neuen Entwurf übernehmen`
          : undefined}
        breadcrumbs={[
          { label: 'Angebote', href: '/offers' },
          ...(sourceOffer
            ? [
                { label: sourceOffer.offerNumber, href: `/offers/${sourceOffer.id}` },
                { label: 'Kopieren' },
              ]
            : [{ label: 'Neu' }]),
        ]}
      />
      <div className="p-4 sm:p-6">
        <BusinessDocumentLayout>
          <div className="min-w-0">
            <OfferForm
              mode="create"
              customers={customers}
              defaults={{
                customerId: sourceOffer?.customerId ?? query.customer,
                areaName:   sourceOffer?.areaName   ?? undefined,
                title:      sourceOffer?.title      ?? undefined,
                introText:  sourceOffer?.introText  ?? undefined,
                outroText:  sourceOffer?.outroText  ?? undefined,
                offerDate:  sourceOffer?.offerDate.toISOString().slice(0, 10),
                validUntil: sourceOffer?.validUntil?.toISOString().slice(0, 10),
                items: sourceOffer?.items.map((item) => ({
                  _key:        `copy-${item.id}`,
                  description: item.description,
                  quantity:    item.quantity.toNumber().toString(),
                  unit:        item.unit,
                  unitPrice:   item.unitPrice.toNumber().toString(),
                  taxRate:     item.taxRate.toNumber().toString(),
                  notes:       item.notes ?? '',
                })),
              }}
              action={createOfferAction}
              createLabel={sourceOffer ? 'Angebot als Entwurf anlegen' : 'Angebot anlegen'}
            />
          </div>
          <BusinessDocumentSidebar sticky>
            <BusinessWorkflowPlaceholder message="Die Angebotsnummer und der weitere Geschäftsvorgang werden beim Anlegen erzeugt.">
              <p className="mb-3 text-sm font-600 text-foreground">Status: Neuer Entwurf</p>
              <div id={DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID} />
            </BusinessWorkflowPlaceholder>
          </BusinessDocumentSidebar>
        </BusinessDocumentLayout>
      </div>
    </div>
  )
}
