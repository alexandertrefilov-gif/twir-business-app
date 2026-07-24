// lib/services/settings.service.ts
// Firmeneinstellungen — Lesen und Schreiben
//
// Die CompanySetting-Tabelle enthält immer genau EINEN Datensatz.
// Falls keiner existiert, wird ein leerer erstellt (seed-safe).
//
// Nutzt: buildAuditLogCreate (Phase 2), AuditAction (Phase 2)

import { prisma }            from '@/lib/db/prisma'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import { AuditAction }       from '@/types/enums'
import type { SettingsUpdateInput } from '@/lib/validators/settings.schema'

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001'   // aus seed.ts Phase 2

// ── GET ───────────────────────────────────────────────────────

export async function getSettings() {
  const existing = await prisma.companySetting.findUnique({
    where: { id: SETTINGS_ID },
  })

  // Fallback: leerer Datensatz — verhindert Crash vor erstem Seed
  if (!existing) {
    return prisma.companySetting.create({
      data: {
        id:          SETTINGS_ID,
        companyName: 'Mein Unternehmen',
      },
    })
  }

  return existing
}

// ── UPDATE ────────────────────────────────────────────────────

export async function updateSettings(
  data:      SettingsUpdateInput,
  userId:    string,
  userEmail: string,
): Promise<void> {
  const existing = await getSettings()

  await prisma.$transaction(async (tx) => {
    await tx.companySetting.update({
      where: { id: SETTINGS_ID },
      data: {
        companyName:           data.companyName,
        legalForm:             data.legalForm             ?? null,
        street:                data.street                ?? null,
        houseNumber:           data.houseNumber           ?? null,
        postalCode:            data.postalCode            ?? null,
        city:                  data.city                  ?? null,
        country:               data.country               ?? 'DE',
        vatId:                 data.vatId                 ?? null,
        taxNumber:             data.taxNumber             ?? null,
        taxOffice:             data.taxOffice             ?? null,
        bankName:              data.bankName              ?? null,
        iban:                  data.iban                  ?? null,
        bic:                   data.bic                   ?? null,
        email:                 data.email                 ?? null,
        phone:                 data.phone                 ?? null,
        fax:                   data.fax                   ?? null,
        website:               data.website               ?? null,
        registerCourt:         data.registerCourt         ?? null,
        registerNumber:        data.registerNumber        ?? null,
        managingDirector:      data.managingDirector      ?? null,
        invoicePrefix:         data.invoicePrefix         ?? 'RE',
        offerPrefix:           data.offerPrefix           ?? 'AN',
        orderPrefix:           data.orderPrefix           ?? 'AU',
        serviceReportPrefix:   data.serviceReportPrefix   ?? 'LN',
        defaultPaymentTermDays: data.defaultPaymentTermDays ?? 14,
        defaultTaxRate:        data.defaultTaxRate         ?? 19.00,
        defaultInvoiceIntro:   data.defaultInvoiceIntro   ?? null,
        defaultInvoiceOutro:   data.defaultInvoiceOutro   ?? null,
        defaultOfferIntro:     data.defaultOfferIntro     ?? null,
        defaultOfferOutro:     data.defaultOfferOutro     ?? null,
      },
    })

    await buildAuditLogCreate({
      userId, userEmail,
      action:     AuditAction.SETTINGS_CHANGED,
      entityType: 'settings',
      entityId:   SETTINGS_ID,
      oldValue: {
        companyName: existing.companyName,
        vatId:       existing.vatId,
        iban:        existing.iban,
      },
      newValue: {
        companyName: data.companyName,
        vatId:       data.vatId,
        iban:        data.iban,
      },
    })
  })
}

/** Für PDF-Templates: gibt Snapshot-kompatibles Objekt zurück */
export async function getCompanySnapshot() {
  const s = await getSettings()
  return {
    companyName:      s.companyName,
    legalForm:        s.legalForm,
    street:           s.street,
    houseNumber:      s.houseNumber,
    postalCode:       s.postalCode,
    city:             s.city,
    country:          s.country,
    vatId:            s.vatId,
    taxNumber:        s.taxNumber,
    bankName:         s.bankName,
    iban:             s.iban,
    bic:              s.bic,
    email:            s.email,
    phone:            s.phone,
    registerCourt:    s.registerCourt,
    registerNumber:   s.registerNumber,
    managingDirector: s.managingDirector,
  }
}
