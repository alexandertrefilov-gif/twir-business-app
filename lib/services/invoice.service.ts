// lib/services/invoice.service.ts
// Rechnungs-Service — kritischste Business-Logik der Anwendung
//
// Regeln:
// 1. Nur DRAFT-Rechnungen dürfen bearbeitet werden
// 2. Finalisierung vergibt Rechnungsnummer ATOMAR (Transaktion)
// 3. Nach Finalisierung: nur Storno oder Korrektur
// 4. Snapshots (Kunde, Firma) MÜSSEN bei Finalisierung gesetzt sein
// 5. PDF wird bei Finalisierung serverseitig erzeugt und archiviert

import { prisma } from '@/lib/db/prisma'
import { Prisma } from '@prisma/client'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import { nextNumber } from '@/lib/services/number-sequence.service'
import {
  InvoiceStatus,
  InvoiceType,
  NumberSequenceType,
  isInvoiceLocked,
  isInvoiceTransitionAllowed,
  AuditAction,
} from '@/types/enums'
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '@/lib/auth/permissions'

// ── Typen ────────────────────────────────────────────────────

export interface CreateInvoiceDraftInput {
  customerId:      string
  orderId?:        string
  invoiceDate:     Date
  dueDate?:        Date
  deliveryDate?:   Date
  deliveryPeriodStart?: Date
  deliveryPeriodEnd?:   Date
  paymentTermDays?: number
  introText?:      string
  outroText?:      string
  items:           InvoiceItemInput[]
}

export interface InvoiceItemInput {
  position:    number
  description: string
  quantity:    number
  unit?:       string
  unitPrice:   number
  taxRate:     number
}

// ── Hauptfunktionen ──────────────────────────────────────────

/**
 * Erstellt einen Rechnungsentwurf.
 * Keine Rechnungsnummer, Status DRAFT.
 */
export async function createInvoiceDraft(
  input:  CreateInvoiceDraftInput,
  userId: string,
  userEmail: string,
): Promise<string> {
  const customer = await prisma.customer.findUnique({
    where: { id: input.customerId },
  })
  if (!customer || customer.deletedAt) {
    throw new NotFoundError('Kunde nicht gefunden')
  }

  const totals = calculateTotals(input.items)

  const invoice = await prisma.$transaction(async (tx) => {
    const inv = await tx.invoice.create({
      data: {
        customerId:      input.customerId,
        orderId:         input.orderId,
        status:          InvoiceStatus.DRAFT,
        type:            InvoiceType.STANDARD,
        invoiceDate:     input.invoiceDate,
        dueDate:         input.dueDate,
        deliveryDate:    input.deliveryDate,
        deliveryPeriodStart: input.deliveryPeriodStart,
        deliveryPeriodEnd:   input.deliveryPeriodEnd,
        paymentTermDays: input.paymentTermDays,
        introText:       input.introText,
        outroText:       input.outroText,
        totalNet:        totals.totalNet,
        totalTax:        totals.totalTax,
        totalGross:      totals.totalGross,
        createdById:     userId,
        items: {
          create: input.items.map((item) => ({
            position:    item.position,
            description: item.description,
            quantity:    item.quantity,
            unit:        item.unit ?? 'Stk.',
            unitPrice:   item.unitPrice,
            taxRate:     item.taxRate,
            netAmount:   item.quantity * item.unitPrice,
            taxAmount:   (item.quantity * item.unitPrice * item.taxRate) / 100,
            grossAmount: (item.quantity * item.unitPrice * (1 + item.taxRate / 100)),
          })),
        },
      },
    })

    await buildAuditLogCreate({
      userId, userEmail,
      action:     AuditAction.CREATE,
      entityType: 'invoice',
      entityId:   inv.id,
      newValue:   { status: InvoiceStatus.DRAFT, customerId: input.customerId },
    })

    return inv
  })

  return invoice.id
}

/**
 * Löscht ausschließlich einen noch nicht finalisierten Rechnungsentwurf.
 * Rechtlich relevante Rechnungen bleiben unveränderlich und werden storniert.
 */
export async function deleteInvoiceDraft(
  invoiceId: string,
  userId: string,
  userEmail: string,
): Promise<void> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: { status: true },
  })

  if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')
  if (invoice.status !== InvoiceStatus.DRAFT) {
    throw new BusinessRuleError('Nur Rechnungsentwürfe können gelöscht werden.')
  }

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.deleteMany({ where: { invoiceId } })
    await tx.invoice.delete({ where: { id: invoiceId } })
    await tx.auditLog.create({
      data: {
        userId,
        userEmail,
        action: AuditAction.DELETE,
        entityType: 'invoice',
        entityId: invoiceId,
        oldValue: { status: InvoiceStatus.DRAFT },
      },
    })
  })
}

/**
 * Finalisiert eine Rechnung.
 *
 * Diese Funktion:
 * 1. Prüft ob Status DRAFT ist
 * 2. Liest Kunden- und Firmendaten für Snapshots
 * 3. Vergibt die nächste Rechnungsnummer (atomar, gesperrt)
 * 4. Setzt alle Pflichtfelder (§14 UStG)
 * 5. Schreibt Audit-Log
 * 6. Alles in einer einzigen Transaktion
 *
 * Nach Abschluss muss der Aufrufer das PDF erzeugen.
 */
export async function finalizeInvoice(
  invoiceId: string,
  userId:    string,
  userEmail: string,
): Promise<{ invoiceNumber: string }> {
  return prisma.$transaction(async (tx) => {
    // 1. Rechnung mit Lock lesen
    const invoice = await tx.invoice.findUnique({
      where:   { id: invoiceId },
      include: { customer: true, items: true },
    })

    if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')

    // 2. Status-Prüfung
    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new BusinessRuleError(
        `Rechnung kann nicht finalisiert werden: Status ist ${invoice.status}, erwartet DRAFT`,
      )
    }

    // 3. Pflichtfeld-Prüfung §14 UStG
    validateInvoiceForFinalization(invoice)

    // 4. Snapshots erstellen
    const companySetting = await tx.companySetting.findFirst()
    if (!companySetting) {
      throw new BusinessRuleError(
        'Firmeneinstellungen müssen vor der ersten Rechnung konfiguriert sein',
      )
    }

    const customerSnapshot = buildCustomerSnapshot(invoice.customer)
    const companySnapshot  = buildCompanySnapshot(companySetting)

    // 5. Rechnungsnummer vergeben (gesperrt innerhalb dieser Transaktion)
    const invoiceNumber = await nextNumber(NumberSequenceType.INVOICE, tx)

    // 6. Rechnung finalisieren
    const finalized = await tx.invoice.update({
      where: { id: invoiceId },
      data: {
        invoiceNumber,
        status:           InvoiceStatus.FINALIZED,
        finalizedAt:      new Date(),
        customerSnapshot: customerSnapshot as Prisma.InputJsonValue,
        companySnapshot:  companySnapshot  as Prisma.InputJsonValue,
      },
    })

    // 7. Audit-Log innerhalb der Transaktion
    await buildAuditLogCreate({
      userId, userEmail,
      action:     AuditAction.FINALIZE,
      entityType: 'invoice',
      entityId:   invoiceId,
      oldValue:   { status: InvoiceStatus.DRAFT },
      newValue:   { status: InvoiceStatus.FINALIZED, invoiceNumber },
    })

    return { invoiceNumber: finalized.invoiceNumber! }
  })
}

/**
 * Storniert eine finalisierte Rechnung.
 * Erstellt automatisch eine Stornorechnung.
 */
export async function cancelInvoice(
  invoiceId: string,
  reason:    string,
  userId:    string,
  userEmail: string,
): Promise<{ cancellationInvoiceId: string }> {
  return prisma.$transaction(async (tx) => {
    const original = await tx.invoice.findUnique({
      where:   { id: invoiceId },
      include: { items: true, customer: true },
    })

    if (!original) throw new NotFoundError('Rechnung nicht gefunden')

    if (!isInvoiceTransitionAllowed(
      original.status as InvoiceStatus,
      InvoiceStatus.CANCELLED,
    )) {
      throw new BusinessRuleError(
        `Rechnung im Status ${original.status} kann nicht storniert werden`,
      )
    }

    // Stornorechnung anlegen (negative Beträge)
    const cancellationNumber = await nextNumber(NumberSequenceType.INVOICE, tx)

    const cancellation = await tx.invoice.create({
      data: {
        invoiceNumber:       cancellationNumber,
        customerId:          original.customerId,
        orderId:             original.orderId,
        status:              InvoiceStatus.FINALIZED,
        type:                InvoiceType.CANCELLATION,
        originalInvoiceId:   original.id,
        customerSnapshot:    original.customerSnapshot as Prisma.InputJsonValue,
        companySnapshot:     original.companySnapshot  as Prisma.InputJsonValue,
        invoiceDate:         new Date(),
        totalNet:            original.totalNet.neg(),
        totalTax:            original.totalTax.neg(),
        totalGross:          original.totalGross.neg(),
        finalizedAt:         new Date(),
        createdById:         userId,
        introText:           `Stornierung zu Rechnung ${original.invoiceNumber}`,
        items: {
          create: original.items.map((item) => ({
            position:    item.position,
            description: item.description,
            quantity:    item.quantity,
            unit:        item.unit,
            unitPrice:   item.unitPrice,
            taxRate:     item.taxRate,
            netAmount:   item.netAmount.neg(),
            taxAmount:   item.taxAmount.neg(),
            grossAmount: item.grossAmount.neg(),
          })),
        },
      },
    })

    // Original als CANCELLED markieren, Referenz auf Storno setzen
    await tx.invoice.update({
      where: { id: original.id },
      data: {
        status:              InvoiceStatus.CANCELLED,
        cancelledByInvoiceId: cancellation.id,
      },
    })

    await buildAuditLogCreate({
      userId, userEmail,
      action:     AuditAction.CANCEL,
      entityType: 'invoice',
      entityId:   original.id,
      oldValue:   { status: original.status },
      newValue:   { status: InvoiceStatus.CANCELLED, cancellationInvoiceId: cancellation.id },
      metadata:   { reason },
    })

    return { cancellationInvoiceId: cancellation.id }
  })
}

// ── Hilfsfunktionen ──────────────────────────────────────────

function calculateTotals(items: InvoiceItemInput[]) {
  let totalNet   = 0
  let totalTax   = 0
  for (const item of items) {
    const net = item.quantity * item.unitPrice
    totalNet  += net
    totalTax  += (net * item.taxRate) / 100
  }
  return {
    totalNet:   Math.round(totalNet   * 100) / 100,
    totalTax:   Math.round(totalTax   * 100) / 100,
    totalGross: Math.round((totalNet + totalTax) * 100) / 100,
  }
}

function validateInvoiceForFinalization(invoice: {
  invoiceDate: Date | null
  items:       { id: string }[]
  customerId:  string
}) {
  const errors: string[] = []

  if (!invoice.invoiceDate)  errors.push('Rechnungsdatum fehlt')
  if (!invoice.customerId)   errors.push('Kunde fehlt')
  if (invoice.items.length === 0) errors.push('Keine Rechnungspositionen vorhanden')

  if (errors.length > 0) {
    throw new BusinessRuleError(
      `Rechnung nicht finalisierbar: ${errors.join(', ')}`,
    )
  }
}

function buildCustomerSnapshot(customer: {
  name:        string
  legalName:   string | null
  vatId:       string | null
  taxNumber:   string | null
  street:      string | null
  houseNumber: string | null
  postalCode:  string | null
  city:        string | null
  country:     string
}) {
  return {
    name:        customer.legalName ?? customer.name,
    vatId:       customer.vatId,
    taxNumber:   customer.taxNumber,
    street:      customer.street,
    houseNumber: customer.houseNumber,
    postalCode:  customer.postalCode,
    city:        customer.city,
    country:     customer.country,
  }
}

export function buildCompanySnapshot(settings: {
  companyName:  string
  legalForm:    string | null
  vatId:        string | null
  taxNumber:    string | null
  street:       string | null
  houseNumber:  string | null
  postalCode:   string | null
  city:         string | null
  country:      string
  bankName:     string | null
  iban:         string | null
  bic:          string | null
  email:        string | null
  phone:        string | null
  supplierNumber: string | null
}) {
  return {
    companyName:  settings.companyName,
    legalForm:    settings.legalForm,
    vatId:        settings.vatId,
    taxNumber:    settings.taxNumber,
    street:       settings.street,
    houseNumber:  settings.houseNumber,
    postalCode:   settings.postalCode,
    city:         settings.city,
    country:      settings.country,
    bankName:     settings.bankName,
    iban:         settings.iban,
    bic:          settings.bic,
    email:        settings.email,
    phone:        settings.phone,
    supplierNumber: settings.supplierNumber,
  }
}
