import { formatHeaderDate, type HeaderField, type HeaderRecipient } from '@/lib/workflow/document-header'

// WF-1B: reine Hilfsfunktionen für den Rechnungskopf. Keine Datenbankzugriffe,
// keine Berechtigungsermittlung, keine Änderung an Snapshot-/Adresslogik: Es wird
// ausschließlich dargestellt, was bereits in der Rechnung gespeichert ist.

export const INVOICE_RECIPIENT_SOURCE_LABELS: Record<string, string> = {
  CUSTOMER: 'Kundenadresse',
  BILLING: 'Hinterlegte Rechnungsadresse',
  CUSTOM: 'Einmalige Rechnungsadresse',
}

function text(source: Record<string, unknown>, key: string): string | null {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/**
 * Stellt die Rechnungsadresse aus `Invoice.customerSnapshot` dar. Liefert null,
 * wenn kein auswertbarer Snapshot vorliegt (Altbestand) – dann wird kein Block
 * angezeigt statt einer erfundenen oder leeren Adresse.
 */
export function buildInvoiceRecipient(snapshot: unknown): HeaderRecipient | null {
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) return null
  const source = snapshot as Record<string, unknown>
  const name = text(source, 'name')
  if (!name) return null

  const country = text(source, 'country')
  const lines = [
    [text(source, 'street'), text(source, 'houseNumber')].filter(Boolean).join(' '),
    [text(source, 'postalCode'), text(source, 'city')].filter(Boolean).join(' '),
    country && country !== 'DE' ? country : '',
  ].filter((line) => line.length > 0)

  const recipientSource = text(source, 'recipientSource')
  const sourceLabel = recipientSource && Object.prototype.hasOwnProperty.call(INVOICE_RECIPIENT_SOURCE_LABELS, recipientSource)
    ? INVOICE_RECIPIENT_SOURCE_LABELS[recipientSource]
    : null

  return {
    sourceLabel,
    name,
    additional: text(source, 'additional'),
    contactName: text(source, 'contactName'),
    email: text(source, 'email'),
    vatId: text(source, 'vatId'),
    lines,
  }
}

export interface InvoiceHeaderFieldInput {
  invoiceDate?: Date | string | null
  deliveryDate?: Date | string | null
  deliveryPeriodStart?: Date | string | null
  deliveryPeriodEnd?: Date | string | null
  dueDate?: Date | string | null
  finalizedAt?: Date | string | null
  sentAt?: Date | string | null
  supplierNumber?: string | null
}

const LONG_DATE = 'dd. MMMM yyyy'

/** Leistungsdatum/-zeitraum; nur vorhandene Werte, keine Platzhalter. */
export function buildServiceDateFields(input: Pick<InvoiceHeaderFieldInput, 'deliveryDate' | 'deliveryPeriodStart' | 'deliveryPeriodEnd'>): HeaderField[] {
  const fields: HeaderField[] = []
  const date = formatHeaderDate(input.deliveryDate, LONG_DATE)
  if (date) fields.push({ label: 'Leistungsdatum', value: date })

  const from = formatHeaderDate(input.deliveryPeriodStart, LONG_DATE)
  const to = formatHeaderDate(input.deliveryPeriodEnd, LONG_DATE)
  if (from && to) fields.push({ label: 'Leistungszeitraum', value: `${from} – ${to}` })
  else if (from) fields.push({ label: 'Leistungszeitraum', value: `ab ${from}` })
  else if (to) fields.push({ label: 'Leistungszeitraum', value: `bis ${to}` })
  return fields
}

/** Datumsfelder der Rechnung in fester Reihenfolge; leere Werte entfallen. */
export function buildInvoiceHeaderFields(input: InvoiceHeaderFieldInput): HeaderField[] {
  const fields: HeaderField[] = []
  const push = (label: string, value: string | null) => { if (value) fields.push({ label, value }) }

  push('Rechnungsdatum', formatHeaderDate(input.invoiceDate, LONG_DATE))
  fields.push(...buildServiceDateFields(input))
  push('Zahlungsziel', formatHeaderDate(input.dueDate, LONG_DATE))
  push('Finalisiert am', formatHeaderDate(input.finalizedAt, 'dd.MM.yyyy HH:mm', 'instant'))
  push('Versendet am', formatHeaderDate(input.sentAt, 'dd.MM.yyyy', 'instant'))
  push('Lieferantennummer', input.supplierNumber?.trim() || null)
  return fields
}
