import { describe, expect, it } from 'vitest'
import { assertServiceReportReadyForInvoice } from '@/lib/services/invoice.service'
import { isServiceReportReadyForInvoice, SERVICE_REPORT_READY_FOR_INVOICE_WHERE } from '@/lib/workflow/invoice-eligibility'

const complete = {
  status: 'FINALIZED',
  finalizedAt: new Date('2026-09-08'),
  sentAt: new Date('2026-09-09'),
  confirmedAt: new Date('2026-09-10'),
}

describe('serverseitige Rechnungsfreigabe nach Leistungsnachweis', () => {
  it('erlaubt einen vollständig abgeschlossenen Leistungsnachweis', () => {
    expect(isServiceReportReadyForInvoice(complete)).toBe(true)
    expect(() => assertServiceReportReadyForInvoice(complete)).not.toThrow()
  })

  it.each([
    { ...complete, status: 'DRAFT' },
    { ...complete, finalizedAt: null },
    { ...complete, sentAt: null },
    { ...complete, confirmedAt: null },
  ])('lehnt unvollständige Leistungsnachweise ab', report => {
    expect(isServiceReportReadyForInvoice(report)).toBe(false)
    expect(() => assertServiceReportReadyForInvoice(report)).toThrow(
      'Die Rechnung kann erst nach bestätigtem Leistungsnachweis erstellt werden.',
    )
  })

  it('stellt der Neuanlageseite dieselbe Prisma-Freigaberegel bereit', () => {
    expect(SERVICE_REPORT_READY_FOR_INVOICE_WHERE).toEqual({
      status: 'FINALIZED', finalizedAt: { not: null }, sentAt: { not: null }, confirmedAt: { not: null },
    })
  })
})
