// tests/unit/payment-and-numbers.test.ts
// Tests für Zahlungsstatus-Ableitung und Nummernkreis-Format

import { describe, it, expect } from 'vitest'
import { InvoiceStatus } from '@/types/enums'

// ── Zahlungsstatus-Ableitung ──────────────────────────────────
// Isolierte Logik aus payment.service.ts (extrahiert für Unit-Test)

function deriveInvoiceStatus(
  totalGross:    number,
  paidAmount:    number,
  currentStatus: string,
): InvoiceStatus {
  if (paidAmount >= totalGross) return InvoiceStatus.PAID
  if (paidAmount > 0)           return InvoiceStatus.PARTIALLY_PAID
  if (currentStatus === InvoiceStatus.OVERDUE) return InvoiceStatus.OVERDUE
  return InvoiceStatus.SENT
}

describe('Payment Status Derivation', () => {
  const TOTAL = 1190.00

  it('Vollständige Zahlung → PAID', () => {
    expect(deriveInvoiceStatus(TOTAL, TOTAL, 'SENT')).toBe(InvoiceStatus.PAID)
  })

  it('Überzahlung → PAID (Rundungspuffer)', () => {
    // 1190.001 sollte als bezahlt gelten
    expect(deriveInvoiceStatus(TOTAL, TOTAL + 0.001, 'SENT')).toBe(InvoiceStatus.PAID)
  })

  it('Teilzahlung → PARTIALLY_PAID', () => {
    expect(deriveInvoiceStatus(TOTAL, 500, 'SENT')).toBe(InvoiceStatus.PARTIALLY_PAID)
  })

  it('Zahlung von 1 Cent → PARTIALLY_PAID', () => {
    expect(deriveInvoiceStatus(TOTAL, 0.01, 'SENT')).toBe(InvoiceStatus.PARTIALLY_PAID)
  })

  it('Keine Zahlung + SENT → SENT', () => {
    expect(deriveInvoiceStatus(TOTAL, 0, 'SENT')).toBe(InvoiceStatus.SENT)
  })

  it('Keine Zahlung + OVERDUE → OVERDUE bleibt', () => {
    expect(deriveInvoiceStatus(TOTAL, 0, 'OVERDUE')).toBe(InvoiceStatus.OVERDUE)
  })

  it('Teilzahlung nach Überfälligkeit → PARTIALLY_PAID', () => {
    expect(deriveInvoiceStatus(TOTAL, 500, 'OVERDUE')).toBe(InvoiceStatus.PARTIALLY_PAID)
  })

  it('Betrag = 0, total = 0 → PAID (Sonderfall Nullrechnung)', () => {
    expect(deriveInvoiceStatus(0, 0, 'SENT')).toBe(InvoiceStatus.PAID)
  })
})

// ── Nummernkreis-Format ───────────────────────────────────────

function formatNumber(
  format: string,
  prefix: string,
  year: number,
  number: number,
): string {
  const paddingMatch = format.match(/\{number:(\d+)\}/)
  const padding = paddingMatch ? parseInt(paddingMatch[1]) : 4
  const paddedNumber = String(number).padStart(padding, '0')

  return format
    .replace('{prefix}', prefix)
    .replace('{year}', String(year))
    .replace(/\{number:\d+\}/, paddedNumber)
    .replace('{number}', paddedNumber)
}

describe('Nummernkreis-Format', () => {
  const DEFAULT_FORMAT = '{prefix}{year}-{number:04}'

  it('Erste Nummer korrekt formatiert', () => {
    expect(formatNumber(DEFAULT_FORMAT, 'RE', 2024, 1)).toBe('RE2024-0001')
  })

  it('Zweistellige Nummer korrekt formatiert', () => {
    expect(formatNumber(DEFAULT_FORMAT, 'RE', 2024, 42)).toBe('RE2024-0042')
  })

  it('Vierstellige Nummer ohne Padding', () => {
    expect(formatNumber(DEFAULT_FORMAT, 'RE', 2024, 9999)).toBe('RE2024-9999')
  })

  it('Fünfstellige Nummer überschreitet Padding', () => {
    expect(formatNumber(DEFAULT_FORMAT, 'RE', 2024, 10000)).toBe('RE2024-10000')
  })

  it('Verschiedene Präfixe', () => {
    expect(formatNumber(DEFAULT_FORMAT, 'AN', 2024, 1)).toBe('AN2024-0001')
    expect(formatNumber(DEFAULT_FORMAT, 'AU', 2024, 1)).toBe('AU2024-0001')
    expect(formatNumber(DEFAULT_FORMAT, 'LN', 2024, 1)).toBe('LN2024-0001')
  })

  it('Jahrenwechsel', () => {
    expect(formatNumber(DEFAULT_FORMAT, 'RE', 2025, 1)).toBe('RE2025-0001')
  })

  it('Sechsstelliges Padding möglich', () => {
    const format6 = '{prefix}{year}-{number:06}'
    expect(formatNumber(format6, 'RE', 2024, 1)).toBe('RE2024-000001')
  })
})

// ── Upload-Validierung ─────────────────────────────────────────

describe('Upload-Sicherheit — Dateiname-Sanitizer', () => {
  // Isoliert aus upload-validator.ts

  function sanitizeFilename(name: string): string {
    const path = { basename: (s: string) => s.split(/[/\\]/).pop() ?? s }
    let clean = path.basename(name)
    clean = clean.replace(/\0/g, '')
    clean = clean.replace(/[^\w\s.\-äöüÄÖÜß]/gi, '_')
    clean = clean.replace(/_{2,}/g, '_').replace(/\s{2,}/g, ' ').trim()
    clean = clean.replace(/^\.+/, '')
    if (clean.length > 200) {
      const ext  = clean.lastIndexOf('.')
      const base = ext > 0 ? clean.slice(0, ext) : clean
      const extension = ext > 0 ? clean.slice(ext) : ''
      clean = base.slice(0, 200 - extension.length) + extension
    }
    return clean || 'unnamed'
  }

  it('Normaler Dateiname bleibt unverändert', () => {
    expect(sanitizeFilename('rechnung_2024.pdf')).toBe('rechnung_2024.pdf')
  })

  it('Path-Traversal wird entfernt', () => {
    const result = sanitizeFilename('../../../etc/passwd')
    expect(result).not.toContain('..')
    expect(result).not.toContain('/')
  })

  it('Null-Bytes werden entfernt', () => {
    const result = sanitizeFilename('file\0name.pdf')
    expect(result).not.toContain('\0')
  })

  it('Führende Punkte werden entfernt', () => {
    expect(sanitizeFilename('.env')).not.toMatch(/^\./)
    expect(sanitizeFilename('.htaccess')).not.toMatch(/^\./)
  })

  it('Dateiname mit Umlauten bleibt erhalten', () => {
    expect(sanitizeFilename('Müller_Rechnung.pdf')).toContain('Müller')
  })

  it('Leerer Dateiname gibt unnamed zurück', () => {
    expect(sanitizeFilename('')).toBe('unnamed')
  })
})

// ── Dunning Level Validierung ─────────────────────────────────

describe('Dunning Level Validierung', () => {
  function validateDunningLevel(
    requestedLevel: number,
    existingLevels: number[],
  ): { valid: boolean; error?: string } {
    const highest = Math.max(0, ...existingLevels)
    if (requestedLevel > 3) return { valid: false, error: 'Max. Mahnstufe 3' }
    if (requestedLevel !== highest + 1) {
      return { valid: false, error: `Nächste Stufe muss ${highest + 1} sein` }
    }
    return { valid: true }
  }

  it('Stufe 1 ohne vorherige Mahnungen gültig', () => {
    expect(validateDunningLevel(1, [])).toEqual({ valid: true })
  })

  it('Stufe 2 nach Stufe 1 gültig', () => {
    expect(validateDunningLevel(2, [1])).toEqual({ valid: true })
  })

  it('Stufe 3 nach Stufen 1+2 gültig', () => {
    expect(validateDunningLevel(3, [1, 2])).toEqual({ valid: true })
  })

  it('Stufe 2 ohne Stufe 1 ungültig', () => {
    const result = validateDunningLevel(2, [])
    expect(result.valid).toBe(false)
    expect(result.error).toContain('1')
  })

  it('Stufe 4 ungültig (max 3)', () => {
    const result = validateDunningLevel(4, [1, 2, 3])
    expect(result.valid).toBe(false)
  })

  it('Doppelte Stufe ungültig', () => {
    const result = validateDunningLevel(1, [1])
    expect(result.valid).toBe(false)
  })
})
