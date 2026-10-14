import Link from 'next/link'
import type { ReactNode } from 'react'
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

export { Item as DocumentMetaItem }

function RefValue({ number, href }: { number: string; href: string | null }) {
  return href
    ? <Link href={href} className="text-sm text-blue-700 hover:underline mono">{number}</Link>
    : <span className="mono">{number}</span>
}

// WF-1B: optionale `leadingItems` (z. B. Status-Badge) werden vor den Datumsfeldern
// gerendert. Ohne Angabe und ohne Rechnungsadresse bleibt die Darstellung unverändert.
export function BusinessDocumentMeta({ model, leadingItems }: { model: BusinessDocumentHeaderModel; leadingItems?: ReactNode }) {
  const { customer, recipient } = model
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

      {recipient && (
        <div className="sm:col-span-2 xl:col-span-1 xl:row-span-2" data-testid="business-document-recipient">
          <dt className="text-[11px] font-500 uppercase tracking-wider text-muted-foreground">Rechnungsadresse</dt>
          <dd className="mt-0.5">
            {recipient.sourceLabel && <p className="text-xs text-muted-foreground">{recipient.sourceLabel}</p>}
            <p className="mt-1 text-sm font-600">{recipient.name}</p>
            {recipient.additional && <p className="text-sm text-muted-foreground">{recipient.additional}</p>}
            {recipient.contactName && <p className="text-sm text-muted-foreground">{recipient.contactName}</p>}
            {recipient.lines.length > 0 && (
              <address className="mt-1 text-sm not-italic leading-5 text-muted-foreground">
                {recipient.lines.map((line, index) => (
                  <span key={`${index}-${line}`}>{index > 0 && <br />}{line}</span>
                ))}
              </address>
            )}
            {recipient.email && <p className="mt-1 text-xs text-muted-foreground">{recipient.email}</p>}
            {recipient.vatId && <p className="text-xs text-muted-foreground mono">USt-IdNr.: {recipient.vatId}</p>}
          </dd>
        </div>
      )}

      {leadingItems}

      {model.fields.map((field) => (
        <Item key={field.label} label={field.label}>{field.value}</Item>
      ))}

      {model.customerOrderNumber && (
        <Item label={CUSTOMER_ORDER_NUMBER_LABEL} mono>{model.customerOrderNumber}</Item>
      )}
      {model.customerOrderDate && (
        <Item label={CUSTOMER_ORDER_DATE_LABEL}>{model.customerOrderDate}</Item>
      )}

      {model.references.map((ref, index) => (
        <Item key={`${ref.label}-${ref.number}-${index}`} label={ref.label}>
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
