import Link from 'next/link'
import { BusinessDocumentHeader } from '@/components/documents/BusinessDocumentHeader'

interface Props {
  title: string
  projectTitle?: string | null
  customer?: {
    id: string; name: string; street?: string | null; houseNumber?: string | null
    postalCode?: string | null; city?: string | null
  } | null
  order?: { id: string; orderNumber: string } | null
  offer?: { id: string; offerNumber: string } | null
  serviceReport?: { id: string; reportNumber: string; reportDate?: Date | null } | null
}

export function InvoiceDocumentHeader({ title, projectTitle, customer, order, offer, serviceReport }: Props) {
  return (
    <BusinessDocumentHeader title={title} description={projectTitle} titleId="invoice-document-title" detailsLabel="Projekt- und Kundendaten">
      <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
        {customer && <div className="sm:col-span-2 xl:col-span-1 xl:row-span-2">
          <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Kunde</dt>
          <dd className="mt-0.5"><Link href={`/customers/${customer.id}`} className="text-sm font-600 text-blue-700 hover:underline">{customer.name}</Link>
            {(customer.street || customer.city) && <address className="mt-3 text-sm not-italic leading-5 text-muted-foreground">{customer.street} {customer.houseNumber}<br />{customer.postalCode} {customer.city}</address>}
          </dd>
        </div>}
        {order && <HeaderLink label="Auftrag" href={`/orders/${order.id}`} value={order.orderNumber} />}
        {offer && <HeaderLink label="Angebotsbezug" href={`/offers/${offer.id}`} value={offer.offerNumber} />}
        {serviceReport && <HeaderLink label="Leistungsnachweis" href={`/services/${serviceReport.id}`} value={serviceReport.reportNumber} />}
        {serviceReport?.reportDate && <HeaderValue label="Leistungsdatum" value={serviceReport.reportDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })} />}
      </dl>
    </BusinessDocumentHeader>
  )
}

function HeaderLink({ label, href, value }: { label: string; href: string; value: string }) {
  return <div><dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-0.5"><Link href={href} className="text-sm text-blue-700 hover:underline mono">{value}</Link></dd></div>
}

function HeaderValue({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">{label}</dt><dd className="mt-0.5 text-sm text-foreground">{value}</dd></div>
}
