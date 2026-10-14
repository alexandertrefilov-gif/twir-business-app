// REQ-029 P5-4 Schritt 3 (F3/F7): Zahlungsformular und Journal übernehmen den fertigen aktuellen Rest (Cent-Strings);
// sie besitzen keinen eigenen „Brutto − bezahlt“-Rechenweg mehr.
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.stubGlobal('React', React)

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock('@/app/(dashboard)/payments/actions', () => ({ removePaymentAction: vi.fn() }))
vi.mock('@/components/shared/ConfirmDialog', () => ({
  ConfirmDialog: ({ trigger }: { trigger: React.ReactNode }) => React.createElement('span', null, trigger),
}))
vi.mock('@/components/shared/FormSubmitButton', () => ({
  FormSubmitButton: ({ idleLabel, disabled }: { idleLabel: string; disabled?: boolean }) =>
    React.createElement('button', { type: 'submit', disabled, 'data-submit': 'true' }, idleLabel),
}))

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

type Form = typeof import('@/components/payments/PaymentForm')
type Journal = typeof import('@/components/payments/PaymentJournal')
let form: Form
let journal: Journal

beforeAll(async () => {
  form = await import('@/components/payments/PaymentForm')
  journal = await import('@/components/payments/PaymentJournal')
})

const action = vi.fn()
const renderForm = (props: { totalGross: string; paidAmount: string; remainingAmount: string }) =>
  renderToStaticMarkup(React.createElement(form.PaymentForm, { invoiceId: 'inv-1', action, ...props }))

describe('PaymentForm: Zahlungs-Default = aktueller offener Betrag', () => {
  it('Teilzahlung: Vorbelegung und max entsprechen dem Rest als exakter Cent-String', () => {
    const html = renderForm({ totalGross: '119.00', paidAmount: '40.01', remainingAmount: '78.99' })
    expect(html).toMatch(/value="78\.99"/)
    expect(html).toMatch(/max="78\.99"/)
    expect(html).toContain('78,99 €')
    expect(html).toContain('40,01 €')
    expect(html).not.toMatch(/data-submit="true"[^>]*disabled=""|disabled=""[^>]*data-submit/)
  })

  it('der Default wird nicht aus Brutto − bezahlt neu abgeleitet (Komponente nimmt den fertigen Rest)', () => {
    // Bewusst nicht zusammenpassende Eingaben: angezeigt/vorbelegt wird der gelieferte Rest.
    const html = renderForm({ totalGross: '119.00', paidAmount: '40.00', remainingAmount: '12.34' })
    expect(html).toMatch(/value="12\.34"/)
    expect(html).toMatch(/max="12\.34"/)
    expect(html).not.toMatch(/value="79\.00"/)
  })

  it('kein Rest (0,00) oder Überzahlung: keine Vorbelegung, Absenden gesperrt', () => {
    for (const remainingAmount of ['0.00', '-2.50']) {
      const html = renderForm({ totalGross: '10.00', paidAmount: '10.00', remainingAmount })
      expect(html).toMatch(/name="amount" value=""/)
      expect(html).toMatch(/<button[^>]*disabled=""/)
    }
  })

  it('große Beträge bleiben exakt (999 999 999,99)', () => {
    const html = renderForm({ totalGross: '999999999.99', paidAmount: '0.00', remainingAmount: '999999999.99' })
    expect(html).toMatch(/value="999999999\.99"/)
    expect(html).toContain('999.999.999,99 €')
  })
})

describe('PaymentJournal: Restanzeige aus dem gelieferten Rest', () => {
  const payments = [{
    id: 'p1', amount: 40.01, paymentDate: new Date('2026-10-01T00:00:00Z'), method: null, reference: null, notes: null, createdAt: new Date('2026-10-01T00:00:00Z'),
  }]
  const renderJournal = (paidAmount: string, remainingAmount: string) =>
    renderToStaticMarkup(React.createElement(journal.PaymentJournal, {
      payments: payments as never, paidAmount, remainingAmount, invoiceStatus: 'PARTIALLY_PAID', canDelete: false,
    }))

  it('zeigt Bezahlt und Offen aus den gelieferten Strings', () => {
    const html = renderJournal('40.01', '78.99')
    expect(html).toContain('40,01 €')
    expect(html).toContain('78,99 €')
    expect(html).not.toContain('Vollständig bezahlt')
  })

  it('Rest 0,00: „Vollständig bezahlt“, keine Offen-Anzeige', () => {
    const html = renderJournal('119.00', '0.00')
    expect(html).toContain('Vollständig bezahlt')
    expect(html).not.toContain('Offen:')
  })
})

describe('statische Absicherung (genau die angefassten Pfade)', () => {
  const FILES = [
    'components/payments/PaymentForm.tsx',
    'components/payments/PaymentJournal.tsx',
    'lib/pdf-templates/dunning.template.tsx',
  ]
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

  it.each(FILES)('%s: keine monetäre Float-Rundung oder Differenzbildung', (file) => {
    const code = strip(read(file))
    expect(code).not.toMatch(/Math\.(round|floor|ceil|trunc)\s*\(/)
    expect(code).not.toMatch(/\bparseFloat\s*\(/)
    expect(code).not.toMatch(/\.toFixed\s*\(\s*\d/)
    expect(code).not.toMatch(/\btotalGross\s*-\s*\w*[pP]aid/)
    expect(code).not.toMatch(/\b(?:inv|data)\.\w+\s*-\s*(?:inv|data)\.\w+/)
  })

  it('Rechnungsseite: Rest und Steuergruppen kommen aus den zentralen Funktionen', () => {
    const page = strip(read('app/(dashboard)/invoices/[id]/page.tsx'))
    expect(page).toContain('resolveOpenAmount(')
    expect(page).toContain('groupTaxFromStoredNet(')
    expect(page).not.toMatch(/Math\.(round|floor|ceil|trunc)\s*\(/)
    expect(page).not.toMatch(/taxGroups\[\w+\]\s*=/)       // keine Summierung der Positionssteuern
    expect(page).not.toMatch(/totalGross\s*-\s*paidAmount/)
    expect(page).toContain('remainingAmount={open.remaining}')
  })
})
