// app/(dashboard)/offers/[id]/edit/page.tsx
import type { Metadata }   from 'next'
import { notFound, redirect } from 'next/navigation'
import { PageHeader }      from '@/components/shared/PageHeader'
import { OfferForm }       from '@/components/offers/OfferForm'
import { getOfferById }    from '@/lib/services/offer.service'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma }          from '@/lib/db/prisma'
import { changeOfferNumberAction, updateOfferAction } from '../../actions'
import { BusinessDocumentLayout, BusinessDocumentSidebar } from '@/components/documents/BusinessDocumentLayout'
import { BusinessProcessWorkflow } from '@/components/workflow/BusinessProcessWorkflow'
import { getBusinessProcessForOffer } from '@/lib/services/business-process.service'
import { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'
import { offerNumberForDisplay } from '@/lib/offers/offer-display'

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  await requirePermission(Resource.OFFER, Action.READ)

  try {
    const o = await getOfferById(id)
    return { title: `${offerNumberForDisplay(o.offerNumber)} bearbeiten` }
  } catch {
    return { title: 'Angebot bearbeiten' }
  }
}

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await requirePermission(Resource.OFFER, Action.UPDATE)

  let offer
  try {
    offer = await getOfferById(id)
  } catch {
    notFound()
  }

  // Business rule: nur Entwürfe können bearbeitet werden
  if (offer.status !== 'DRAFT') {
    redirect(`/offers/${offer.id}`)
  }

  const customers = await prisma.customer.findMany({
    where:   { deletedAt: null, isActive: true },
    orderBy: { name: 'asc' },
    select:  { id: true, name: true, number: true },
  })

  const boundAction = updateOfferAction.bind(null, offer.id)
  const boundNumberAction = changeOfferNumberAction.bind(null, offer.id)
  const [process, processPermissions] = await Promise.all([
    getBusinessProcessForOffer(offer.id, user.userId, user.role),
    getBusinessProcessPermissions(),
  ])

  // Prepare defaults from existing data
  const itemDefaults = offer.items.map((item, idx) => ({
    _key:        item.id,
    description: item.description,
    quantity:    item.quantity.toNumber().toString(),
    unit:        item.unit,
    unitPrice:   item.unitPrice.toNumber().toString(),
    taxRate:     item.taxRate.toNumber().toString(),
    notes:       item.notes ?? '',
  }))

  return (
    <div>
      <PageHeader
        sticky
        title={`${offerNumberForDisplay(offer.offerNumber)} bearbeiten`}
        breadcrumbs={[
          { label: 'Angebote',  href: '/offers' },
          { label: offerNumberForDisplay(offer.offerNumber), href: `/offers/${offer.id}` },
          { label: 'Bearbeiten' },
        ]}
      />
      <div className="p-4 sm:p-6">
        <BusinessDocumentLayout>
          <div className="min-w-0">
            <OfferForm
              mode="edit"
              offerId={offer.id}
              offerNumber={offer.offerNumber}
              changeNumberAction={boundNumberAction}
          customers={customers}
          action={boundAction}
          defaults={{
            customerId: offer.customerId,
            areaName:   offer.areaName   ?? undefined,
            title:      offer.title      ?? undefined,
            introText:  offer.introText  ?? undefined,
            outroText:  offer.outroText  ?? undefined,
            offerDate:  offer.offerDate.toISOString().slice(0, 10),
            validUntil: offer.validUntil?.toISOString().slice(0, 10),
            items:      itemDefaults,
          }}
            />
          </div>
          <BusinessDocumentSidebar sticky>
            <BusinessProcessWorkflow process={process} currentDocument={{ type: 'offer', id: offer.id }} permissions={processPermissions} editingAction={<div id="document-edit-workflow-actions" />} />
          </BusinessDocumentSidebar>
        </BusinessDocumentLayout>
      </div>
    </div>
  )
}
