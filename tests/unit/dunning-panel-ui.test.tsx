// REQ-029 P5-3 Phase B: Mahnwesen-Panel zeigt die serverseitige Policy nur an (UI ist keine Sicherheitsgrenze).
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('React', React)

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/payments/actions', () => ({
  createDunningAction: vi.fn(),
  markDunningNoticeSentAction: vi.fn(),
}))
vi.mock('@/components/shared/FormSubmitButton', () => ({
  FormSubmitButton: ({ idleLabel }: { idleLabel: string }) => React.createElement('button', { type: 'submit' }, idleLabel),
}))
vi.mock('@/components/shared/ConfirmDialog', () => ({
  ConfirmDialog: ({ trigger }: { trigger: React.ReactNode }) => React.createElement('span', { 'data-confirm': 'true' }, trigger),
}))
// Der Service-Import der Komponente liefert nur die Konstanten (kein Prisma im Test).
vi.mock('@/lib/services/dunning.service', () => ({
  DUNNING_LEVELS: {
    1: { label: 'Zahlungserinnerung', defaultFee: null, dueDays: 7 },
    2: { label: 'Erste Mahnung',      defaultFee: 5.0,  dueDays: 14 },
    3: { label: 'Zweite Mahnung',     defaultFee: 10.0, dueDays: 7 },
  },
}))

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

type Panel = typeof import('@/components/payments/DunningPanel')
let panel: Panel

beforeAll(async () => {
  panel = await import('@/components/payments/DunningPanel')
})

const okDto = {
  ok: true, nextLevel: 1 as const, outstandingAmount: '1234.50',
  berlinDate: '2026-10-16', calculatedAt: '2026-10-16T08:00:00.000Z', reasons: [], messages: [],
}
const blockedDto = (reasons: string[], messages: string[]) => ({
  ok: false, nextLevel: null, outstandingAmount: null,
  berlinDate: '2026-10-16', calculatedAt: '2026-10-16T08:00:00.000Z', reasons, messages,
}) as never

const sentNotice = {
  id: 'n1', invoiceId: 'inv-1', level: 1, levelLabel: 'Zahlungserinnerung', sentAt: new Date('2026-10-10T09:00:00.000Z'),
  dueDate: new Date('2026-10-20T00:00:00.000Z'), fee: null, pdfPath: null, createdAt: new Date('2026-10-09T09:00:00.000Z'),
}
const unsentNotice = { ...sentNotice, id: 'n2', sentAt: null }

function html(props: Partial<React.ComponentProps<Panel['DunningPanel']>>) {
  return renderToStaticMarkup(
    React.createElement(panel.DunningPanel, {
      invoiceId: 'inv-1', notices: [], canManage: true, eligibility: okDto as never, canMarkSent: true, ...props,
    }),
  )
}

describe('Hilfsfunktionen (reine Zeichenketten-/UTC-Rechnung)', () => {
  it('formatEuroAmount: deutsche Darstellung ohne Gleitkomma', () => {
    expect(panel.formatEuroAmount('64.26')).toBe('64,26')
    expect(panel.formatEuroAmount('1234.50')).toBe('1.234,50')
    expect(panel.formatEuroAmount('1234567.00')).toBe('1.234.567,00')
    expect(panel.formatEuroAmount('0.01')).toBe('0,01')
    expect(panel.formatEuroAmount('7')).toBe('7,00')
    expect(panel.formatEuroAmount('-12.30')).toBe('-12,30')
  })
  it('formatIsoDateDe und addDaysIso (Monats-/Jahreswechsel, unabhängig von der Browser-Zeitzone)', () => {
    expect(panel.formatIsoDateDe('2026-10-16')).toBe('16.10.2026')
    expect(panel.addDaysIso('2026-10-16', 1)).toBe('2026-10-17')
    expect(panel.addDaysIso('2026-10-30', 7)).toBe('2026-11-06')
    expect(panel.addDaysIso('2026-12-31', 1)).toBe('2027-01-01')
    expect(panel.addDaysIso('2028-02-28', 1)).toBe('2028-02-29')
  })
})

describe('DunningPanel – Anzeige aus der Policy', () => {
  it('mahnbar: Button für die nächste Stufe und Mahnbasis (offener Betrag, Stand)', () => {
    const out = html({})
    expect(out).toContain('Zahlungserinnerung erstellen')
    expect(out).toContain('Mahnbasis: offener Betrag 1.234,50 € (Stand: 16.10.2026)')
    expect(out).not.toContain('kann derzeit nicht erstellt werden')
  })

  it('mahnbar Stufe 2: Button nennt die Stufe', () => {
    const out = html({ eligibility: { ...okDto, nextLevel: 2 } as never })
    expect(out).toContain('Erste Mahnung erstellen')
  })

  it('gesperrt: kein Erstellen-Button, alle Gründe als Liste', () => {
    const out = html({
      eligibility: blockedDto(
        ['NOT_SENT', 'NO_DUE_DATE'],
        ['Die Rechnung ist nicht als versendet dokumentiert (Versanddatum fehlt).', 'Die Rechnung hat kein Zahlungsziel.'],
      ),
    })
    expect(out).not.toContain('erstellen')
    expect(out).toContain('Eine Mahnung kann derzeit nicht erstellt werden')
    expect(out).toContain('nicht als versendet dokumentiert')
    expect(out).toContain('kein Zahlungsziel')
    expect(out).not.toContain('Mahnbasis')
  })

  it('Maximalstufe: eigener Hinweis auf rechtliche Schritte', () => {
    const out = html({ eligibility: blockedDto(['MAX_LEVEL'], ['Maximale Mahnstufe 3 bereits erreicht. Rechtliche Schritte einleiten.']) })
    expect(out).toContain('Maximale Mahnstufe erreicht. Bitte rechtliche Schritte einleiten.')
    expect(out).not.toContain('kann derzeit nicht erstellt werden')
  })

  it('Eligibility nicht ermittelbar (null): nichts anbieten, Hinweis statt leerer Fläche', () => {
    const out = html({ eligibility: null })
    expect(out).not.toContain('erstellen')
    expect(out).toContain('Mahnfähigkeit dieser Rechnung konnte nicht ermittelt werden')
  })

  it('ohne Berechtigung: weder Button noch Gründe noch Mahnbasis', () => {
    const out = html({ canManage: false })
    expect(out).not.toContain('erstellen')
    expect(out).not.toContain('Mahnbasis')
  })

  it('„Als versendet markieren“ nur bei unversendeter Mahnung UND mahnbarem Rechnungsstatus', () => {
    expect(html({ notices: [unsentNotice] })).toContain('Als versendet markieren')
    expect(html({ notices: [unsentNotice], canMarkSent: false })).not.toContain('Als versendet markieren')
    expect(html({ notices: [sentNotice] })).not.toContain('Als versendet markieren')
    expect(html({ notices: [sentNotice] })).toContain('Versendet')
  })

  it('vorhandene Mahnungen bleiben auch bei gesperrter Rechnung sichtbar', () => {
    const out = html({ notices: [sentNotice], eligibility: blockedDto(['STATUS_NOT_DUNNABLE'], ['Für Rechnungen im Status „Bezahlt“ kann keine Mahnung erstellt werden.']) })
    expect(out).toContain('Zahlungserinnerung')
    expect(out).toContain('Stufe 1')
    expect(out).toContain('Status „Bezahlt“')
  })

  it('keine leere Fläche: ohne Mahnungen steht ein Hinweis da', () => {
    expect(html({})).toContain('Keine Mahnungen zu dieser Rechnung.')
  })
})

describe('Quelltext: UI ist keine Sicherheitsgrenze und enthält keine eigene Status-/Stufenlogik', () => {
  const panelSource = read('components/payments/DunningPanel.tsx')
  const pageSource = read('app/(dashboard)/invoices/[id]/page.tsx')

  it('Panel: keine feste Statusliste, keine eigene Stufenberechnung', () => {
    expect(panelSource).not.toMatch(/\['PAID',\s*'CANCELLED',\s*'DRAFT'\]/)
    expect(panelSource).not.toMatch(/invoiceStatus/)
    expect(panelSource).not.toMatch(/Math\.max\(0,\s*\.\.\.notices/)
  })

  it('Panel: lokale Datumsmethoden werden nicht für die Fristen verwendet', () => {
    expect(panelSource).not.toMatch(/\.setDate\(|getDate\(|new Date\(\)\.toISOString/)
  })

  it('Seite: Eligibility serverseitig berechnet, fail-closed bei Fehler, feste Statusliste entfällt', () => {
    expect(pageSource).toContain('getDunningEligibility(invoice.id)')
    expect(pageSource).toMatch(/catch \{ dunningEligibility = null \}/)
    expect(pageSource).toContain('eligibility={dunningEligibility}')
    expect(pageSource).toContain('canMarkSent={canMarkDunningSent}')
    // Die feste Liste ['DRAFT','PAID','CANCELLED'] steuert nur noch das Zahlungsformular (Zeile davor), nicht das Mahnwesen.
    expect(pageSource).toContain("{invoice.status !== 'DRAFT' && canManageDunning && (")
    expect(pageSource).not.toMatch(/\['DRAFT',\s*'PAID',\s*'CANCELLED'\]\.includes\(invoice\.status\) && canManageDunning/)
    expect(pageSource).toContain('DUNNABLE_INVOICE_STATUSES')
  })

  it('Seite: Mahnfähigkeit wird nur mit invoice:update-Recht (canManageDunning) berechnet', () => {
    expect(pageSource).toMatch(/if \(canManageDunning && invoice\.status !== 'DRAFT'\) \{\s*try \{ dunningEligibility = await getDunningEligibility/)
  })
})
