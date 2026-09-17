import path from 'node:path'
import { prisma } from '@/lib/db/prisma'
import {
  LocalFilesystemArchiveStorage,
  type ArchiveEntry,
  type ArchiveFileType,
} from '@/lib/documents/archive-storage'
import { offerDisplayName } from '@/lib/offers/offer-display'
import { offerProjectDesignation } from '@/lib/offers/rich-text'
import { buildBusinessCaseArchiveDirectory, BUSINESS_CASE_DIRECTORY_PREFIX } from '@/lib/documents/archive-naming'

export type ArchiveSort = 'name' | 'type' | 'modified' | 'size'
export type ArchiveSortDirection = 'asc' | 'desc'

export interface SerializedArchiveEntry extends Omit<ArchiveEntry, 'modifiedAt'> {
  modifiedAt: string
  parentPath: string
  displayName: string
  displayParentPath: string
  storagePath?: string
}

type ArchiveViewEntry = ArchiveEntry & { storagePath?: string }

export interface ArchiveBreadcrumb { label: string; path: string }

export interface ArchiveExplorerResult {
  configured: boolean
  available: boolean
  error: string | null
  currentPath: string
  entries: SerializedArchiveEntry[]
  search: string
  sort: ArchiveSort
  direction: ArchiveSortDirection
  breadcrumbs: ArchiveBreadcrumb[]
  statistics: {
    businessDocuments: number
    physicalFiles: number
    totalSize: number
  }
}

const SUPPORTED_SORTS = new Set<ArchiveSort>(['name', 'type', 'modified', 'size'])
const SUPPORTED_DIRECTIONS = new Set<ArchiveSortDirection>(['asc', 'desc'])
const BUSINESS_CASE_CATEGORIES = [
  '01_Angebot',
  '02_Bestellung',
  '03_Auftrag',
  '04_Leistung',
  '05_Rechnung',
] as const

function archiveSegmentDisplayName(segment: string): string {
  if (segment.startsWith(BUSINESS_CASE_DIRECTORY_PREFIX)) return 'Geschäftsvorgang'
  const categoryLabels: Record<string, string> = {
    '01_Angebot': '01 Angebot',
    '02_Bestellung': '02 Kundenbestellung',
    '03_Auftrag': '03 Auftrag',
    '04_Leistung': '04 Leistungsnachweis',
    '05_Rechnung': '05 Rechnung',
  }
  if (categoryLabels[segment]) return categoryLabels[segment]
  return segment.replaceAll('_', ' ')
}

function virtualBusinessCaseCategories(currentPath: string, labels: ReadonlyMap<string, string>): ArchiveEntry[] {
  if (!labels.has(currentPath) || !path.basename(currentPath).startsWith(BUSINESS_CASE_DIRECTORY_PREFIX)) return []
  return BUSINESS_CASE_CATEGORIES.map(name => ({
    name,
    relativePath: path.join(currentPath, name),
    kind: 'directory' as const,
    fileType: 'other' as const,
    size: null,
    modifiedAt: new Date(0),
    itemCount: 0,
  }))
}

function isVirtualBusinessCaseCategory(currentPath: string, labels: ReadonlyMap<string, string>): boolean {
  return BUSINESS_CASE_CATEGORIES.includes(path.basename(currentPath) as typeof BUSINESS_CASE_CATEGORIES[number])
    && labels.has(path.dirname(currentPath))
}

export function normalizeArchiveRelativePath(value: string | null | undefined): string {
  const input = (value ?? '').trim()
  if (!input || input === '.') return ''
  if (input.includes('\0') || path.isAbsolute(input)) throw new Error('Ungültiger Archivpfad.')
  const normalized = path.normalize(input)
  if (normalized === '..' || normalized.startsWith(`..${path.sep}`)) throw new Error('Ungültiger Archivpfad.')
  return normalized === '.' ? '' : normalized
}

export function archiveBreadcrumbs(
  relativePath: string,
  offerDirectoryLabels: ReadonlyMap<string, string> = new Map(),
): ArchiveBreadcrumb[] {
  const normalized = normalizeArchiveRelativePath(relativePath)
  const breadcrumbs = [{ label: 'Dokumentenarchiv', path: '' }]
  if (!normalized) return breadcrumbs
  let accumulated = ''
  for (const segment of normalized.split(path.sep)) {
    accumulated = accumulated ? path.join(accumulated, segment) : segment
    breadcrumbs.push({
      label: offerDirectoryLabels.get(accumulated) ?? archiveSegmentDisplayName(segment),
      path: accumulated,
    })
  }
  return breadcrumbs
}

function normalizeSort(value: string | null | undefined): ArchiveSort {
  return SUPPORTED_SORTS.has(value as ArchiveSort) ? value as ArchiveSort : 'name'
}

function normalizeDirection(value: string | null | undefined): ArchiveSortDirection {
  return SUPPORTED_DIRECTIONS.has(value as ArchiveSortDirection) ? value as ArchiveSortDirection : 'asc'
}

function compareEntries(a: ArchiveEntry, b: ArchiveEntry, sort: ArchiveSort, direction: ArchiveSortDirection): number {
  if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1
  let comparison = 0
  if (sort === 'type') comparison = a.fileType.localeCompare(b.fileType, 'de')
  else if (sort === 'modified') comparison = a.modifiedAt.getTime() - b.modifiedAt.getTime()
  else if (sort === 'size') comparison = (a.size ?? 0) - (b.size ?? 0)
  else comparison = a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' })
  if (comparison === 0) comparison = a.name.localeCompare(b.name, 'de', { numeric: true, sensitivity: 'base' })
  return direction === 'asc' ? comparison : -comparison
}

function displayPath(relativePath: string, offerDirectoryLabels: ReadonlyMap<string, string>): string {
  let accumulated = ''
  return relativePath.split(path.sep).map((segment) => {
    accumulated = accumulated ? path.join(accumulated, segment) : segment
    return offerDirectoryLabels.get(accumulated) ?? archiveSegmentDisplayName(segment)
  }).join(' › ')
}

function serializeEntry(
  entry: ArchiveViewEntry,
  offerDirectoryLabels: ReadonlyMap<string, string>,
): SerializedArchiveEntry {
  const parentPath = path.dirname(entry.relativePath) === '.' ? '' : path.dirname(entry.relativePath)
  return {
    ...entry,
    modifiedAt: entry.modifiedAt.toISOString(),
    parentPath,
    displayName: entry.kind === 'directory'
      ? offerDirectoryLabels.get(entry.relativePath) ?? archiveSegmentDisplayName(entry.name)
      : entry.name,
    displayParentPath: parentPath ? displayPath(parentPath, offerDirectoryLabels) : '',
    ...(entry.storagePath ? { storagePath: entry.storagePath } : {}),
  }
}

interface OfferArchiveIndex {
  labels: Map<string, string>
  searchableDocuments: Array<{ storagePath: string; virtualPath: string; searchText: string }>
  virtualDirectories: Map<string, ArchiveViewEntry[]>
  virtualFiles: Map<string, Array<{ storagePath: string; virtualPath: string }>>
  hiddenLegacyDirectories: Set<string>
}

function businessCaseDirectory(storagePath: string): string | null {
  const segments = storagePath.split(path.sep)
  const index = segments.findIndex(segment => segment.startsWith(BUSINESS_CASE_DIRECTORY_PREFIX))
  return index < 0 ? null : segments.slice(0, index + 1).join(path.sep)
}

async function offerArchiveIndex(): Promise<OfferArchiveIndex> {
  const [offers, directOrders, freeInvoices] = await Promise.all([prisma.offer.findMany({
    where: { deletedAt: null },
    select: {
      id: true,
      offerNumber: true,
      offerDate: true,
      areaName: true,
      title: true,
      introText: true,
      customer: { select: { number: true, name: true } },
      documents: {
        where: { deletedAt: null },
        select: { storagePath: true },
      },
      customerPurchaseOrder: {
        select: {
          orderNumber: true,
          documents: { where: { deletedAt: null }, select: { storagePath: true } },
        },
      },
      order: {
        select: {
          orderNumber: true,
          documents: { where: { deletedAt: null }, select: { storagePath: true } },
          serviceReports: {
            select: {
              reportNumber: true,
              documents: { where: { deletedAt: null }, select: { storagePath: true } },
            },
          },
          invoices: {
            select: {
              invoiceNumber: true,
              documents: { where: { deletedAt: null }, select: { storagePath: true } },
            },
          },
        },
      },
    },
  }), prisma.order.findMany({
    where: { deletedAt: null, offerId: null },
    select: {
      id: true,
      orderNumber: true,
      title: true,
      customer: { select: { number: true, name: true } },
      documents: { where: { deletedAt: null }, select: { storagePath: true } },
      serviceReports: {
        select: {
          reportNumber: true,
          documents: { where: { deletedAt: null }, select: { storagePath: true } },
        },
      },
      invoices: {
        select: {
          invoiceNumber: true,
          documents: { where: { deletedAt: null }, select: { storagePath: true } },
        },
      },
    },
  }), prisma.invoice.findMany({
    where: { orderId: null },
    select: {
      id: true,
      invoiceNumber: true,
      customer: { select: { number: true, name: true } },
      documents: { where: { deletedAt: null }, select: { storagePath: true } },
    },
  })])
  const labels = new Map<string, string>()
  const searchableDocuments: OfferArchiveIndex['searchableDocuments'] = []
  const virtualDirectories = new Map<string, ArchiveViewEntry[]>()
  const virtualFiles = new Map<string, Array<{ storagePath: string; virtualPath: string }>>()
  const hiddenLegacyDirectories = new Set<string>()
  const addVirtualDirectory = (parent: string, relativePath: string, itemCount: number) => {
    const existing = virtualDirectories.get(parent) ?? []
    if (!existing.some(entry => entry.relativePath === relativePath)) {
      existing.push({ name: path.basename(relativePath), relativePath, kind: 'directory', fileType: 'other', size: null, modifiedAt: new Date(0), itemCount })
      virtualDirectories.set(parent, existing)
    }
  }
  const hideLegacyCategory = (storagePath: string) => {
    const segments = storagePath.split(path.sep)
    const index = segments.findIndex(segment => /^(?:0[1-5])_(?:Angebote|Bestellungen|Auftraege|Leistungsnachweise|Rechnungen)$/.test(segment))
    if (index >= 0) hiddenLegacyDirectories.add(segments.slice(0, index + 1).join(path.sep))
  }
  for (const offer of offers) {
    const designation = offerProjectDesignation(offer.introText)
    const legacyLabel = offerDisplayName(offer.offerNumber, designation)
    const categorizedDocuments = [
      ...(offer.documents ?? []).map(document => ({ document, category: '01_Angebot' as const })),
      ...(offer.customerPurchaseOrder?.documents ?? []).map(document => ({ document, category: '02_Bestellung' as const })),
      ...(offer.order?.documents ?? []).map(document => ({ document, category: '03_Auftrag' as const })),
      ...(offer.order?.serviceReports?.flatMap(report => report.documents.map(document => ({ document, category: '04_Leistung' as const }))) ?? []),
      ...(offer.order?.invoices?.flatMap(invoice => invoice.documents.map(document => ({ document, category: '05_Rechnung' as const }))) ?? []),
    ]
    const searchText = [
      offer.offerNumber,
      offer.areaName,
      offer.title,
      designation,
      offer.customer?.number,
      offer.customer?.name,
      offer.customerPurchaseOrder?.orderNumber,
      offer.order?.orderNumber,
      ...(offer.order?.serviceReports?.map(report => report.reportNumber) ?? []),
      ...(offer.order?.invoices?.map(invoice => invoice.invoiceNumber) ?? []),
    ].filter(Boolean).join(' ')
    const caseCategory = buildBusinessCaseArchiveDirectory({
      year: offer.offerDate.getFullYear(), customerNumber: offer.customer?.number,
      customerName: offer.customer?.name ?? 'Kunde', areaName: offer.areaName ?? offer.title,
      businessCaseId: `offer-${offer.id}`, category: '01_Angebot',
    })
    const virtualCaseDirectory = path.dirname(caseCategory)
    const areaDirectory = path.dirname(virtualCaseDirectory)
    addVirtualDirectory(path.dirname(areaDirectory), areaDirectory, 1)
    addVirtualDirectory(areaDirectory, virtualCaseDirectory, BUSINESS_CASE_CATEGORIES.length)
    labels.set(virtualCaseDirectory, designation?.trim() || offerDisplayName(offer.offerNumber, null))
    for (const category of BUSINESS_CASE_CATEGORIES) {
      addVirtualDirectory(virtualCaseDirectory, path.join(virtualCaseDirectory, category), 0)
    }
    for (const { document, category } of categorizedDocuments) {
      const directory = path.dirname(document.storagePath)
      if (directory === '.' || path.isAbsolute(directory)) continue
      const physicalCaseDirectory = businessCaseDirectory(document.storagePath)
      if (physicalCaseDirectory) labels.set(physicalCaseDirectory, designation?.trim() || offerDisplayName(offer.offerNumber, null))
      else if (offer.documents?.some(item => item.storagePath === document.storagePath)) labels.set(directory, legacyLabel)
      const virtualDirectory = path.join(virtualCaseDirectory, category)
      const virtualPath = path.join(virtualDirectory, path.basename(document.storagePath))
      const files = virtualFiles.get(virtualDirectory) ?? []
      files.push({ storagePath: document.storagePath, virtualPath })
      virtualFiles.set(virtualDirectory, files)
      searchableDocuments.push({ storagePath: document.storagePath, virtualPath, searchText })
      hideLegacyCategory(document.storagePath)
    }
  }
  for (const order of directOrders) {
    const documents = [
      ...order.documents,
      ...order.serviceReports.flatMap(report => report.documents),
      ...order.invoices.flatMap(invoice => invoice.documents),
    ]
    const displayName = order.title?.trim()
      ? `Auftrag ${order.orderNumber} – ${order.title.trim()}`
      : `Auftrag ${order.orderNumber}`
    const searchText = [
      order.orderNumber,
      order.title,
      order.customer.number,
      order.customer.name,
      ...order.serviceReports.map(report => report.reportNumber),
      ...order.invoices.map(invoice => invoice.invoiceNumber),
    ].filter(Boolean).join(' ')
    for (const document of documents) {
      const caseDirectory = businessCaseDirectory(document.storagePath)
      if (caseDirectory) labels.set(caseDirectory, displayName)
      searchableDocuments.push({ storagePath: document.storagePath, virtualPath: document.storagePath, searchText })
    }
  }
  for (const invoice of freeInvoices) {
    const displayName = invoice.invoiceNumber
      ? `Rechnung ${invoice.invoiceNumber}`
      : `Rechnungsentwurf ${invoice.id.slice(0, 8)}`
    const searchText = [
      invoice.invoiceNumber,
      invoice.customer.number,
      invoice.customer.name,
    ].filter(Boolean).join(' ')
    for (const document of invoice.documents) {
      const caseDirectory = businessCaseDirectory(document.storagePath)
      if (caseDirectory) labels.set(caseDirectory, displayName)
      searchableDocuments.push({ storagePath: document.storagePath, virtualPath: document.storagePath, searchText })
    }
  }
  return { labels, searchableDocuments, virtualDirectories, virtualFiles, hiddenLegacyDirectories }
}

async function searchOfferMetadata(
  storage: LocalFilesystemArchiveStorage,
  query: string,
  documents: OfferArchiveIndex['searchableDocuments'],
): Promise<ArchiveEntry[]> {
  const normalizedQuery = query.toLocaleLowerCase('de-DE')
  const matchingPaths = [...new Set(documents
    .filter(document => document.searchText.toLocaleLowerCase('de-DE').includes(normalizedQuery))
    .map(document => document.storagePath))]
  const entries = await Promise.all(matchingPaths.map(async (storagePath) => {
    try {
      const document = documents.find(item => item.storagePath === storagePath)
      const entry = await storage.stat(storagePath)
      return [{ ...entry, relativePath: document?.virtualPath ?? entry.relativePath, storagePath }]
    } catch {
      return []
    }
  }))
  return entries.flat().filter((entry) => entry.kind === 'file')
}

export function isUserVisibleArchiveEntry(entry: Pick<ArchiveEntry, 'kind' | 'fileType'>): boolean {
  return entry.kind === 'directory' || entry.fileType !== 'json'
}

async function archiveConfiguration() {
  return prisma.companySetting.findFirst({
    select: { documentArchiveEnabled: true, documentArchivePath: true },
  })
}

export async function getArchiveStorage(): Promise<LocalFilesystemArchiveStorage> {
  const settings = await archiveConfiguration()
  if (!settings?.documentArchiveEnabled || !settings.documentArchivePath) {
    throw new Error('Das Dokumentenarchiv ist nicht konfiguriert.')
  }
  return new LocalFilesystemArchiveStorage(settings.documentArchivePath)
}

export async function getArchiveExplorer(input: {
  currentPath?: string | null
  search?: string | null
  sort?: string | null
  direction?: string | null
}): Promise<ArchiveExplorerResult> {
  let currentPath = ''
  let pathError: string | null = null
  try {
    currentPath = normalizeArchiveRelativePath(input.currentPath)
  } catch {
    pathError = 'Der angeforderte Archivpfad ist ungültig.'
  }
  const search = (input.search ?? '').trim().slice(0, 200)
  const sort = normalizeSort(input.sort)
  const direction = normalizeDirection(input.direction)
  const [businessDocuments, settings, offerIndex] = await Promise.all([
    prisma.document.count({ where: { deletedAt: null } }),
    archiveConfiguration(),
    offerArchiveIndex(),
  ])
  const offerLabels = offerIndex.labels
  if (pathError) {
    return {
      configured: Boolean(settings?.documentArchiveEnabled && settings.documentArchivePath),
      available: false, error: pathError,
      currentPath, entries: [], search, sort, direction,
      breadcrumbs: archiveBreadcrumbs(currentPath, offerLabels),
      statistics: { businessDocuments, physicalFiles: 0, totalSize: 0 },
    }
  }
  if (!settings?.documentArchiveEnabled || !settings.documentArchivePath) {
    return {
      configured: false, available: false,
      error: 'Das Dokumentenarchiv ist noch nicht konfiguriert.',
      currentPath, entries: [], search, sort, direction,
      breadcrumbs: archiveBreadcrumbs(currentPath, offerLabels),
      statistics: { businessDocuments, physicalFiles: 0, totalSize: 0 },
    }
  }

  const storage = new LocalFilesystemArchiveStorage(settings.documentArchivePath)
  try {
    const indexedVirtualDirectories = search ? [] : offerIndex.virtualDirectories.get(currentPath) ?? []
    const fallbackVirtualCategories = search ? [] : virtualBusinessCaseCategories(currentPath, offerLabels)
    const virtualCategories = indexedVirtualDirectories.length > 0 ? indexedVirtualDirectories : fallbackVirtualCategories
    const indexedVirtualFiles = search ? [] : await Promise.all(
      (offerIndex.virtualFiles.get(currentPath) ?? []).map(async document => {
        const entry = await storage.stat(document.storagePath)
        return { ...entry, relativePath: document.virtualPath, storagePath: document.storagePath }
      }),
    )
    const virtualPathKnown = offerIndex.virtualDirectories.has(currentPath)
      || offerIndex.virtualFiles.has(currentPath)
      || isVirtualBusinessCaseCategory(currentPath, offerLabels)
    const [filesystemEntries, statistics, matchingOfferEntries] = await Promise.all([
      search
        ? storage.search(search)
        : storage.listDirectory(currentPath).catch((error: NodeJS.ErrnoException) => {
            if (error.code === 'ENOENT' && virtualPathKnown) return []
            throw error
          }),
      storage.getStatistics(),
      search ? searchOfferMetadata(storage, search, offerIndex.searchableDocuments) : Promise.resolve([]),
    ])
    const rawEntries = [...new Map(
      [...virtualCategories, ...indexedVirtualFiles, ...filesystemEntries, ...matchingOfferEntries]
        .filter(entry => !offerIndex.hiddenLegacyDirectories.has(entry.relativePath))
        .map((entry) => ['storagePath' in entry && typeof entry.storagePath === 'string' ? entry.storagePath : entry.relativePath, entry]),
    ).values()]
    return {
      configured: true, available: true, error: null,
      currentPath,
      entries: rawEntries
        .filter(isUserVisibleArchiveEntry)
        .sort((a, b) => compareEntries(
          { ...a, name: offerLabels.get(a.relativePath) ?? a.name },
          { ...b, name: offerLabels.get(b.relativePath) ?? b.name },
          sort,
          direction,
        ))
        .map((entry) => serializeEntry(entry, offerLabels)),
      search, sort, direction,
      breadcrumbs: archiveBreadcrumbs(currentPath, offerLabels),
      statistics: {
        businessDocuments,
        physicalFiles: statistics.fileCount,
        totalSize: statistics.totalSize,
      },
    }
  } catch (error) {
    return {
      configured: true, available: false,
      error: error instanceof Error && error.message.includes('ENOENT')
        ? 'Das angeforderte Archivverzeichnis wurde nicht gefunden.'
        : 'Das Dokumentenarchiv ist momentan nicht erreichbar.',
      currentPath, entries: [], search, sort, direction,
      breadcrumbs: archiveBreadcrumbs(currentPath, offerLabels),
      statistics: { businessDocuments, physicalFiles: 0, totalSize: 0 },
    }
  }
}

export function archiveMimeType(fileType: ArchiveFileType): string {
  if (fileType === 'pdf') return 'application/pdf'
  if (fileType === 'docx') return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (fileType === 'xlsx') return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  if (fileType === 'json') return 'application/json; charset=utf-8'
  return 'application/octet-stream'
}
