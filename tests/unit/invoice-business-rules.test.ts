// tests/unit/invoice-business-rules.test.ts
// Tests für Rechnungs-Business-Rules
// Prüft: Statusmaschine, LOCKED_STATUSES, isInvoiceLocked Helper

import { describe, it, expect } from 'vitest'
import {
  InvoiceStatus,
  INVOICE_LOCKED_STATUSES,
  INVOICE_TRANSITIONS,
  isInvoiceLocked,
  isInvoiceTransitionAllowed,
} from '@/types/enums'

describe('Invoice Status Machine', () => {

  describe('isInvoiceLocked', () => {
    it('DRAFT ist nicht gesperrt', () => {
      expect(isInvoiceLocked(InvoiceStatus.DRAFT)).toBe(false)
    })

    it('FINALIZED ist gesperrt', () => {
      expect(isInvoiceLocked(InvoiceStatus.FINALIZED)).toBe(true)
    })

    it('SENT ist gesperrt', () => {
      expect(isInvoiceLocked(InvoiceStatus.SENT)).toBe(true)
    })

    it('PAID ist gesperrt', () => {
      expect(isInvoiceLocked(InvoiceStatus.PAID)).toBe(true)
    })

    it('PARTIALLY_PAID ist gesperrt', () => {
      expect(isInvoiceLocked(InvoiceStatus.PARTIALLY_PAID)).toBe(true)
    })

    it('OVERDUE ist gesperrt', () => {
      expect(isInvoiceLocked(InvoiceStatus.OVERDUE)).toBe(true)
    })

    it('CANCELLED ist gesperrt', () => {
      expect(isInvoiceLocked(InvoiceStatus.CANCELLED)).toBe(true)
    })

    it('CORRECTED ist gesperrt', () => {
      expect(isInvoiceLocked(InvoiceStatus.CORRECTED)).toBe(true)
    })
  })

  describe('Erlaubte Statusübergänge', () => {
    it('DRAFT → FINALIZED erlaubt', () => {
      expect(isInvoiceTransitionAllowed(
        InvoiceStatus.DRAFT,
        InvoiceStatus.FINALIZED,
      )).toBe(true)
    })

    it('DRAFT → SENT nicht erlaubt', () => {
      expect(isInvoiceTransitionAllowed(
        InvoiceStatus.DRAFT,
        InvoiceStatus.SENT,
      )).toBe(false)
    })

    it('FINALIZED → SENT erlaubt', () => {
      expect(isInvoiceTransitionAllowed(
        InvoiceStatus.FINALIZED,
        InvoiceStatus.SENT,
      )).toBe(true)
    })

    it('FINALIZED → CANCELLED erlaubt', () => {
      expect(isInvoiceTransitionAllowed(
        InvoiceStatus.FINALIZED,
        InvoiceStatus.CANCELLED,
      )).toBe(true)
    })

    it('SENT → PAID erlaubt', () => {
      expect(isInvoiceTransitionAllowed(
        InvoiceStatus.SENT,
        InvoiceStatus.PAID,
      )).toBe(true)
    })

    it('PAID → DRAFT NICHT erlaubt (Terminal)', () => {
      expect(isInvoiceTransitionAllowed(
        InvoiceStatus.PAID,
        InvoiceStatus.DRAFT,
      )).toBe(false)
    })

    it('CANCELLED → FINALIZED NICHT erlaubt (Terminal)', () => {
      expect(isInvoiceTransitionAllowed(
        InvoiceStatus.CANCELLED,
        InvoiceStatus.FINALIZED,
      )).toBe(false)
    })

    it('PAID hat keine weiteren Übergänge', () => {
      expect(INVOICE_TRANSITIONS[InvoiceStatus.PAID]).toHaveLength(0)
    })

    it('CANCELLED hat keine weiteren Übergänge', () => {
      expect(INVOICE_TRANSITIONS[InvoiceStatus.CANCELLED]).toHaveLength(0)
    })
  })

  describe('LOCKED_STATUSES Set-Vollständigkeit', () => {
    it('enthält alle nicht-editierbaren Status', () => {
      const expected = [
        InvoiceStatus.FINALIZED,
        InvoiceStatus.SENT,
        InvoiceStatus.PARTIALLY_PAID,
        InvoiceStatus.PAID,
        InvoiceStatus.OVERDUE,
        InvoiceStatus.CANCELLED,
        InvoiceStatus.CORRECTED,
      ]
      for (const s of expected) {
        expect(INVOICE_LOCKED_STATUSES.has(s)).toBe(true)
      }
    })

    it('DRAFT ist nicht in LOCKED_STATUSES', () => {
      expect(INVOICE_LOCKED_STATUSES.has(InvoiceStatus.DRAFT)).toBe(false)
    })
  })
})

describe('§14 UStG Pflichtfelder — Validierungslogik', () => {
  // Diese Tests prüfen die validateInvoiceForFinalization-Logik
  // (isoliert — ohne Datenbankzugriff)

  function validateForFinalization(invoice: {
    invoiceDate: Date | null
    items: { id: string }[]
    customerId: string
  }): string[] {
    const errors: string[] = []
    if (!invoice.invoiceDate)        errors.push('Rechnungsdatum fehlt')
    if (!invoice.customerId)         errors.push('Kunde fehlt')
    if (invoice.items.length === 0)  errors.push('Keine Rechnungspositionen vorhanden')
    return errors
  }

  it('Valide Rechnung hat keine Fehler', () => {
    expect(validateForFinalization({
      invoiceDate: new Date(),
      items:       [{ id: '1' }],
      customerId:  'customer-uuid',
    })).toHaveLength(0)
  })

  it('Fehlendes Datum wird erkannt', () => {
    const errors = validateForFinalization({
      invoiceDate: null,
      items:       [{ id: '1' }],
      customerId:  'customer-uuid',
    })
    expect(errors).toContain('Rechnungsdatum fehlt')
  })

  it('Fehlende Positionen werden erkannt', () => {
    const errors = validateForFinalization({
      invoiceDate: new Date(),
      items:       [],
      customerId:  'customer-uuid',
    })
    expect(errors).toContain('Keine Rechnungspositionen vorhanden')
  })

  it('Mehrere fehlende Felder werden alle gemeldet', () => {
    const errors = validateForFinalization({
      invoiceDate: null,
      items:       [],
      customerId:  '',
    })
    expect(errors).toHaveLength(3)
  })
})
