import { decodeOfferText, encodeOfferText } from '@/lib/offers/rich-text'

export type ServiceReportDocumentSection<TItem> =
  | { id: string; kind: 'richText'; value: string; sectionId: string }
  | { id: 'positions'; kind: 'positions'; items: readonly TItem[] }
  | { id: 'signatures'; kind: 'signatures'; preparedBy: string; customerName: string }

export function buildServiceReportDocumentSections<TItem>({
  description,
  items,
  preparedBy,
  customerName,
}: {
  description?: string | null
  items: readonly TItem[]
  preparedBy: string
  customerName: string
}): ServiceReportDocumentSection<TItem>[] {
  const document = description
    ? decodeOfferText(description)
    : { version: 1 as const, sections: [] }
  const positionsEnabled = document.positionsEnabled !== false
  const storedAnchor = document.positionsAfterSectionId
  const positionsAfterSectionId = storedAnchor === null || document.sections.some((section) => section.id === storedAnchor)
    ? storedAnchor
    : document.sections[0]?.id ?? null
  const sections: ServiceReportDocumentSection<TItem>[] = []

  if (positionsEnabled && items.length > 0 && positionsAfterSectionId === null) {
    sections.push({ id: 'positions', kind: 'positions', items })
  }
  for (const section of document.sections) {
    sections.push({
      id: `richText:${section.id}`,
      kind: 'richText',
      sectionId: section.id,
      value: encodeOfferText({ version: 1, sections: [section] }),
    })
    if (positionsEnabled && items.length > 0 && positionsAfterSectionId === section.id) {
      sections.push({ id: 'positions', kind: 'positions', items })
    }
  }
  sections.push({ id: 'signatures', kind: 'signatures', preparedBy, customerName })
  return sections
}
