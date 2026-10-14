import { format } from 'date-fns'
import { de } from 'date-fns/locale'
import { CUSTOMER_ORDER_LABEL } from '@/lib/workflow/document-labels'
import { INVOICE_TYPE_LABELS, type InvoiceType } from '@/types/enums'
import type { BusinessProcessData } from '@/lib/services/business-process.service'

// WF-1A: reines View-Model für den gemeinsamen Dokumentkopf
// (Angebot, Auftrag, Leistungsnachweis). Keine Datenbankzugriffe, keine
// Berechtigungsermittlung: Rechte werden von der Seite übergeben und hier
// ausschließlich zum Ausblenden von Links/Dokumenten verwendet.
export interface HeaderCustomer {
  id: string
  name: string
  street?: string | null
  houseNumber?: string | null
  postalCode?: string | null
  city?: string | null
  vatId?: string | null
}

export interface HeaderPermissions {
  readOffer: boolean
  readOrder: boolean
  readServiceReport: boolean
  readInvoice: boolean
  readDocument: boolean
  readProject: boolean
  readCustomer: boolean
}

export interface HeaderField { label: string; value: string }

// WF-1B: Rechnungsadresse (gespeicherter Rechnungs-Snapshot). Wird bewusst getrennt
// vom Kunden-Stammdatensatz geführt und nur für Rechnungen übergeben.
export interface HeaderRecipient {
  sourceLabel: string | null
  name: string
  additional: string | null
  contactName: string | null
  email: string | null
  vatId: string | null
  lines: string[]
}
export interface HeaderReference { label: string; number: string; href: string | null }
export interface HeaderDocumentLink { id: string; name: string; href: string; group: string }

export interface BusinessDocumentHeaderModel {
  customer: HeaderCustomer
  customerHref: string | null
  fields: HeaderField[]
  customerOrderNumber: string | null
  customerOrderDate: string | null
  references: HeaderReference[]
  project: HeaderReference | null
  documents: HeaderDocumentLink[]
  /** WF-1B: nur gesetzt, wenn eine Rechnungsadresse übergeben wurde. */
  recipient?: HeaderRecipient
}

export interface BuildHeaderInput {
  current: 'offer' | 'order' | 'serviceReport' | 'invoice'
  /** WF-1B: ID der aktuellen Rechnung; sie wird nie als Bezug aufgeführt. */
  currentInvoiceId?: string
  /** WF-1B: Rechnungsadresse aus dem Rechnungs-Snapshot. */
  recipient?: HeaderRecipient | null
  customer: HeaderCustomer
  /** Dokumentspezifische Datumsfelder in gewünschter Reihenfolge; leere Werte entfallen. */
  dates: { label: string; value: Date | string | null | undefined; pattern?: string }[]
  /** Zusätzliche Felder (z. B. "Erfasst von"). */
  extraFields?: HeaderField[]
  process: BusinessProcessData
  permissions: HeaderPermissions
}

export function formatHeaderDate(value: Date | string | null | undefined, pattern = 'dd.MM.yyyy'): string | null {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return format(date, pattern, { locale: de })
}

export function documentDownloadHref(id: string): string {
  return `/api/documents/${id}/download?disposition=inline`
}

export function buildBusinessDocumentHeader(input: BuildHeaderInput): BusinessDocumentHeaderModel {
  const { process, permissions, current } = input
  const fields: HeaderField[] = []
  for (const entry of input.dates) {
    const value = formatHeaderDate(entry.value, entry.pattern)
    if (value) fields.push({ label: entry.label, value })
  }
  fields.push(...(input.extraFields ?? []))

  const po = process.customerPurchaseOrder ?? null
  const customerOrderNumber = po?.orderNumber?.trim() || null
  const customerOrderDate = formatHeaderDate(po?.orderDate)

  // Bezüge werden nur mit vorhandenem Leserecht angezeigt (keine Erweiterung
  // der Sichtbarkeit). Einzige Ausnahme: der Auftragsbezug im
  // Leistungsnachweis war bereits bisher immer sichtbar und bleibt es –
  // ohne Link, falls kein Leserecht besteht.
  const references: HeaderReference[] = []
  if (process.offer && current !== 'offer' && permissions.readOffer) {
    references.push({ label: 'Angebotsbezug', number: process.offer.number, href: `/offers/${process.offer.id}` })
  }
  if (process.order && current !== 'order' && (permissions.readOrder || current === 'serviceReport')) {
    references.push({
      label: 'Auftrag',
      number: process.order.number,
      href: permissions.readOrder ? `/orders/${process.order.id}` : null,
    })
  }
  if (current !== 'serviceReport' && permissions.readServiceReport) {
    for (const report of process.serviceReports) {
      references.push({ label: 'Leistungsnachweis', number: report.number, href: `/services/${report.id}` })
    }
  }
  if (permissions.readInvoice) {
    if (current === 'invoice') {
      // WF-1B: Auf der Rechnungsseite nur andere Rechnungen desselben Vorgangs;
      // die aktuelle Rechnung wird nie selbst aufgeführt. Ohne bekannte
      // aktuelle ID wird nichts angezeigt (keine Selbstreferenz möglich).
      for (const invoice of input.currentInvoiceId ? process.invoices : []) {
        if (invoice.id === input.currentInvoiceId) continue
        const typeLabel = invoice.type && invoice.type !== 'STANDARD'
          ? INVOICE_TYPE_LABELS[invoice.type as InvoiceType] ?? null
          : null
        references.push({
          label: 'Weitere Rechnung',
          number: typeLabel ? `${invoice.number} · ${typeLabel}` : invoice.number,
          href: `/invoices/${invoice.id}`,
        })
      }
    } else {
      for (const invoice of process.invoices) {
        references.push({ label: 'Rechnung', number: invoice.number, href: `/invoices/${invoice.id}` })
      }
    }
  }

  const project = process.project && permissions.readProject
    ? {
        label: 'Projekt',
        number: `${process.project.number} · ${process.project.name}`,
        href: `/projects/${process.project.id}`,
      }
    : null

  const documents: HeaderDocumentLink[] = []
  if (permissions.readDocument) {
    for (const doc of po?.documents ?? []) {
      documents.push({ id: doc.id, name: doc.originalName, href: documentDownloadHref(doc.id), group: CUSTOMER_ORDER_LABEL })
    }
    for (const doc of process.order?.confirmationDocuments ?? []) {
      documents.push({ id: doc.id, name: doc.originalName, href: documentDownloadHref(doc.id), group: 'Auftragsunterlagen' })
    }
  }

  return {
    customer: input.customer,
    customerHref: permissions.readCustomer ? `/customers/${input.customer.id}` : null,
    fields,
    customerOrderNumber,
    customerOrderDate,
    references,
    project,
    documents,
    ...(input.recipient ? { recipient: input.recipient } : {}),
  }
}
