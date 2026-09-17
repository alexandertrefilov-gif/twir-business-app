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
import fs from 'fs/promises'
import path from 'path'
import { generateStorageFilename } from '@/lib/services/document.service'

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

/** Liest für Dokumentköpfe ausschließlich die optionale Lieferantennummer. */
export async function getSupplierNumber(): Promise<string | null> {
  const settings = await prisma.companySetting.findUnique({
    where: { id: SETTINGS_ID },
    select: { supplierNumber: true },
  })
  return settings?.supplierNumber ?? null
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
        businessActivity:      data.businessActivity      ?? null,
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
        supplierNumber:        data.supplierNumber        ?? null,
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
        logoScale:             data.logoScale,
        documentArchiveEnabled: data.documentArchiveEnabled,
        documentArchivePath: data.documentArchivePath,
        documentArchiveJsonEnabled: data.documentArchiveJsonEnabled,
      },
    })

    await buildAuditLogCreate(tx, {
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
        documentArchiveEnabled: data.documentArchiveEnabled,
        documentArchivePath: data.documentArchivePath,
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
    businessActivity: s.businessActivity,
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
    supplierNumber:   s.supplierNumber,
    logoPath:          s.logoPath,
    logoStorageKey:    s.logoStorageKey,
    logoScale:         s.logoScale,
    logoWidth:         s.logoWidth,
    logoHeight:        s.logoHeight,
  }
}

export async function getCompanyLogoScale(): Promise<number> {
  return (await getSettings()).logoScale
}

export async function saveCompanyLogoScale(scale: number): Promise<void> {
  await prisma.companySetting.update({
    where: { id: SETTINGS_ID },
    data: { logoScale: scale },
  })
}

export function hasValidCompanyLogoSignature(
  contents: Uint8Array,
  mimeType: string,
): boolean {
  return getCompanyLogoMetadata(contents, mimeType) !== null
}

export interface CompanyLogoMetadata {
  width: number
  height: number
}

export function getCompanyLogoMetadata(
  contents: Uint8Array,
  mimeType: string,
): CompanyLogoMetadata | null {
  if (mimeType === 'image/png') {
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
    const hasSignature = signature.every((byte, index) => contents[index] === byte)
    const hasHeader = contents.length >= 33 &&
      contents[12] === 0x49 && contents[13] === 0x48 &&
      contents[14] === 0x44 && contents[15] === 0x52
    const hasEnd = contents.length >= 12 &&
      contents[contents.length - 8] === 0x49 &&
      contents[contents.length - 7] === 0x45 &&
      contents[contents.length - 6] === 0x4e &&
      contents[contents.length - 5] === 0x44
    if (!hasSignature || !hasHeader || !hasEnd) return null
    return getSafePngDimensions(contents)
  }
  if (mimeType === 'image/jpeg') {
    const hasStart = contents.length >= 4 &&
      contents[0] === 0xff && contents[1] === 0xd8 && contents[2] === 0xff
    const hasEnd = contents.length >= 2 &&
      contents[contents.length - 2] === 0xff && contents[contents.length - 1] === 0xd9
    if (!hasStart || !hasEnd) return null
    return getSafeJpegDimensions(contents)
  }
  return null
}

function getSafePngDimensions(contents: Uint8Array): CompanyLogoMetadata | null {
  const view = new DataView(contents.buffer, contents.byteOffset, contents.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)
  return width >= 1 && height >= 1 && width <= 10_000 && height <= 10_000
    ? { width, height }
    : null
}

function getSafeJpegDimensions(contents: Uint8Array): CompanyLogoMetadata | null {
  let offset = 2
  while (offset + 8 < contents.length) {
    if (contents[offset] !== 0xff) {
      offset += 1
      continue
    }
    const marker = contents[offset + 1]
    if (marker === 0xd8 || marker === 0xd9) {
      offset += 2
      continue
    }
    if (marker === 0xda) return null
    const segmentLength = (contents[offset + 2] << 8) | contents[offset + 3]
    if (segmentLength < 2 || offset + 2 + segmentLength > contents.length) return null
    if (
      marker >= 0xc0 && marker <= 0xcf &&
      marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    ) {
      const height = (contents[offset + 5] << 8) | contents[offset + 6]
      const width = (contents[offset + 7] << 8) | contents[offset + 8]
      return width >= 1 && height >= 1 && width <= 10_000 && height <= 10_000
        ? { width, height }
        : null
    }
    offset += 2 + segmentLength
  }
  return null
}

export async function saveCompanyLogo(
  file: File,
  contents: Uint8Array,
  metadata: CompanyLogoMetadata,
): Promise<void> {
  if ((process.env.STORAGE_DRIVER ?? 'local') !== 'local') {
    throw new Error('Logo-Upload ist für den konfigurierten Speicher noch nicht verfügbar.')
  }

  const storageRoot = path.resolve(process.env.STORAGE_LOCAL_PATH ?? './storage/documents')
  const logoDirectory = path.join(storageRoot, 'logos')
  const storageName = generateStorageFilename('company-logo', file.name)
  const storageKey = path.join('logos', storageName)
  const destination = path.resolve(storageRoot, storageKey)

  if (!destination.startsWith(`${storageRoot}${path.sep}`)) {
    throw new Error('Ungültiger Logo-Speicherpfad')
  }

  await fs.mkdir(logoDirectory, { recursive: true })
  await fs.writeFile(destination, contents)
  await prisma.companySetting.update({
    where: { id: SETTINGS_ID },
    data: {
      logoPath: storageKey,
      logoStorageKey: storageKey,
      logoWidth: metadata.width,
      logoHeight: metadata.height,
    },
  })
}
