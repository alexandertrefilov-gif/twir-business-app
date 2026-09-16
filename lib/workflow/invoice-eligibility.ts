export interface InvoiceEligibleServiceReport {
  status: string
  finalizedAt?: Date | null
  sentAt?: Date | null
  confirmedAt?: Date | null
}

export const SERVICE_REPORT_READY_FOR_INVOICE_WHERE = {
  status: 'FINALIZED' as const,
  finalizedAt: { not: null },
  sentAt: { not: null },
  confirmedAt: { not: null },
}

export function isServiceReportReadyForInvoice(report: InvoiceEligibleServiceReport): boolean {
  return report.status === 'FINALIZED'
    && Boolean(report.finalizedAt)
    && Boolean(report.sentAt)
    && Boolean(report.confirmedAt)
}
