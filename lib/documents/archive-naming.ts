import path from 'node:path'

export function sanitizeArchiveSegment(value: string, fallback = 'Unbekannt'): string {
  const normalized = value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  const safe = normalized
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
    .replace(/\.\./g, '-')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^[-.]+/, '')
    .slice(0, 100)
  return safe || fallback
}

export function buildArchiveDirectory(input: {
  year: number
  customerNumber?: string | null
  customerName: string
  projectName?: string | null
  category: '01_Angebote' | '02_Bestellungen' | '02_Auftraege' | '03_Auftraege' | '03_Leistungsnachweise' | '04_Leistungsnachweise' | '04_Rechnungen' | '05_Rechnungen'
  number: string
}): string {
  return path.join(
    buildCustomerArchiveDirectory(input),
    sanitizeArchiveSegment(input.projectName || 'Allgemein'),
    input.category,
    sanitizeArchiveSegment(input.number),
  )
}

export type BusinessCaseArchiveCategory =
  | '01_Angebot'
  | '02_Bestellung'
  | '03_Auftrag'
  | '04_Leistung'
  | '05_Rechnung'

export const BUSINESS_CASE_DIRECTORY_PREFIX = 'Vorgang_'

export function existingBusinessCaseArchiveDirectory(storagePaths: readonly string[]): string | null {
  for (const storagePath of storagePaths) {
    if (path.isAbsolute(storagePath)) continue
    const segments = storagePath.split(path.sep)
    const index = segments.findIndex(segment => segment.startsWith(BUSINESS_CASE_DIRECTORY_PREFIX))
    if (index >= 0) return segments.slice(0, index + 1).join(path.sep)
  }
  return null
}

/** Builds a stable physical path while keeping its visible label mutable. */
export function buildBusinessCaseArchiveDirectory(input: {
  year: number
  customerNumber?: string | null
  customerName: string
  areaName?: string | null
  businessCaseId: string
  category: BusinessCaseArchiveCategory
}): string {
  return path.join(
    buildCustomerArchiveDirectory(input),
    sanitizeArchiveSegment(input.areaName || 'Allgemein'),
    `${BUSINESS_CASE_DIRECTORY_PREFIX}${sanitizeArchiveSegment(input.businessCaseId, 'Unbekannt')}`,
    input.category,
  )
}

export function buildCustomerArchiveDirectory(input: {
  year: number
  customerNumber?: string | null
  customerName: string
}): string {
  const customer = [input.customerNumber, input.customerName].filter(Boolean).join('_')
  return path.join(String(input.year), sanitizeArchiveSegment(customer, 'Kunde'))
}

export function buildArchiveFilename(number: string, lifecycle: 'DRAFT' | 'FINAL', extension: string): string {
  return `${sanitizeArchiveSegment(number)}_${lifecycle === 'DRAFT' ? 'ENTWURF' : 'FINAL'}.${extension}`
}
