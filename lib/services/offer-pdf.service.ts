import { format } from 'date-fns'
import type { OfferPdfData } from '@/lib/pdf-templates/offer.template'
import { getOfferById } from '@/lib/services/offer.service'
import {
  getCompanySnapshot,
  hasValidCompanyLogoSignature,
} from '@/lib/services/settings.service'
import fs from 'fs/promises'
import path from 'path'

export async function getOfferPdfData(offerId: string): Promise<OfferPdfData> {
  const [offer, company] = await Promise.all([
    getOfferById(offerId),
    getCompanySnapshot(),
  ])

  const items = offer.items.map((item) => ({
    position: item.position,
    description: item.description,
    quantity: item.quantity.toNumber(),
    unit: item.unit,
    unitPrice: item.unitPrice.toNumber(),
    taxRate: item.taxRate.toNumber(),
    netAmount: item.netAmount.toNumber(),
    taxAmount: item.taxAmount.toNumber(),
    grossAmount: item.grossAmount.toNumber(),
    notes: item.notes,
  }))

  const taxGroups: Record<string, number> = {}
  for (const item of items) {
    const rate = String(item.taxRate)
    taxGroups[rate] = Math.round(((taxGroups[rate] ?? 0) + item.taxAmount) * 100) / 100
  }
  const primaryContact = offer.customer.contacts[0]

  return {
    offerNumber: offer.offerNumber,
    offerDate: format(offer.offerDate, 'dd.MM.yyyy'),
    validUntil: offer.validUntil ? format(offer.validUntil, 'dd.MM.yyyy') : undefined,
    title: offer.title,
    introText: offer.introText,
    outroText: offer.outroText,
    logoDataUri: await loadCompanyLogo(company.logoPath),
    logoScale: company.logoScale,
    company,
    customer: {
      name: offer.customer.name,
      street: offer.customer.street,
      houseNumber: offer.customer.houseNumber,
      postalCode: offer.customer.postalCode,
      city: offer.customer.city,
      vatId: offer.customer.vatId,
      contactSalutation: primaryContact?.salutation,
      contactFirstName: primaryContact?.firstName,
      contactLastName: primaryContact?.lastName,
      contactDepartment: primaryContact?.position,
    },
    items,
    totalNet: offer.totalNet.toNumber(),
    totalTax: offer.totalTax.toNumber(),
    totalGross: offer.totalGross.toNumber(),
    taxGroups,
  }
}

async function loadCompanyLogo(storageKey?: string | null): Promise<string | undefined> {
  if (!storageKey || (process.env.STORAGE_DRIVER ?? 'local') !== 'local') return undefined

  const storageRoot = path.resolve(process.env.STORAGE_LOCAL_PATH ?? './storage/documents')
  const logoPath = path.resolve(storageRoot, storageKey)
  if (!logoPath.startsWith(`${storageRoot}${path.sep}`)) return undefined

  const extension = path.extname(logoPath).toLowerCase()
  const mimeType = extension === '.png'
    ? 'image/png'
    : extension === '.jpg' || extension === '.jpeg'
      ? 'image/jpeg'
      : null
  if (!mimeType) return undefined

  try {
    const buffer = await fs.readFile(logoPath)
    if (buffer.length > 2 * 1024 * 1024) return undefined
    if (!hasValidCompanyLogoSignature(buffer, mimeType)) return undefined
    return `data:${mimeType};base64,${buffer.toString('base64')}`
  } catch {
    return undefined
  }
}
