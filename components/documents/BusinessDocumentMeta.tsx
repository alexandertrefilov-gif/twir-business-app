import Link from 'next/link'
import type { BusinessDocumentHeaderModel } from '@/lib/workflow/document-header'
import {
  CUSTOMER_ORDER_DATE_LABEL,
  CUSTOMER_ORDER_NUMBER_LABEL,
} from '@/lib/workflow/document-labels'

// WF-1A: gemeinsame Kopfdaten-Anzeige für Angebot, Auftrag und
// Leistungsnachweis. Reihenfolge: Kunde, dokumentspezifische Felder,
// Kundenbestellnummer/-datum, Bezüge, Projekt, Dokumente.
function Item({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 text-sm text-foreground ${mono ? 'mono' : ''}`}>{children}</dd>
    </div>
  )
}

function RefValue({ number, href }: { number: string; href: string | null }) {
  return href
    ? <Link href={href} className="text-sm text-blue-700 hover:underline mono">{number}</Link>
    : <span className="mono">{number}</span>
}

export function BusinessDocumentMeta({ model }: { model: BusinessDocumentHeaderModel }) {
  const { customer } = model
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="business-document-meta">
      <div className="sm:col-span-2 xl:col-span-1 xl:row-span-2">
        <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Kunde</dt>
        <dd className="mt-0.5">
          {model.customerHref
            ? <Link href={model.customerHref} className="text-sm font-600 text-blue-700 hover:underline">{customer.name}</Link>
            : <span className="text-sm font-600">{customer.name}</span>}
          {(customer.street || customer.city) && (
            <address className="mt-3 text-sm not-italic leading-5 text-muted-foreground">
              {customer.street} {customer.houseNumber}<br />
              {customer.postalCode} {customer.city}
              {customer.vatId && <><br />USt-IdNr.: {customer.vatId}</>}
            </address>
          )}
        </dd>
      </div>

      {model.fields.map((field) => (
        <Item key={field.label} label={field.label}>{field.value}</Item>
      ))}

      {model.customerOrderNumber && (
        <Item label={CUSTOMER_ORDER_NUMBER_LABEL} mono>{model.customerOrderNumber}</Item>
      )}
      {model.customerOrderDate && (
        <Item label={CUSTOMER_ORDER_DATE_LABEL}>{model.customerOrderDate}</Item>
      )}

      {model.references.map((ref) => (
        <Item key={`${ref.label}-${ref.number}`} label={ref.label}>
          <RefValue number={ref.number} href={ref.href} />
        </Item>
      ))}

      {model.project && (
        <Item label={model.project.label}>
          {model.project.href
            ? <Link href={model.project.href} className="text-sm text-blue-700 hover:underline">{model.project.number}</Link>
            : model.project.number}
        </Item>
      )}

      {model.documents.length > 0 && (
        <div className="sm:col-span-2">
          <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Dokumente</dt>
          <dd className="mt-0.5 space-y-0.5 text-sm">
            {model.documents.map((doc) => (
              <div key={doc.id}>
                <a href={doc.href} className="text-blue-700 hover:underline" target="_blank" rel="noreferrer">{doc.name}</a>
                <span className="ml-2 text-xs text-muted-foreground">{doc.group}</span>
              </div>
            ))}
          </dd>
        </div>
      )}
    </dl>
  )
}
