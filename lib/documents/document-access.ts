const ACCOUNTING_DOCUMENT_TYPES = new Set([
  'INVOICE_PDF',
  'CORRECTION_PDF',
  'CANCELLATION_PDF',
])

export function isAccountingDocument(document: { invoiceId?: string | null; type?: string | null }): boolean {
  return Boolean(document.invoiceId) || ACCOUNTING_DOCUMENT_TYPES.has(document.type ?? '')
}

export function isAccountingArchivePath(relativePath: string): boolean {
  return relativePath.split(/[\\/]/).some((segment) =>
    /^(05[_ ]?)?rechnung(?:en)?$/i.test(segment.trim()),
  )
}
