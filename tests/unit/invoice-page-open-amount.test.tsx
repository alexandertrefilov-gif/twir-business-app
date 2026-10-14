// REQ-029 P5-4 Schritt 3: Verdrahtung der Rechnungsseite (offener Betrag, Steuergruppen, Berechtigung).
// Die Seite wird als Server Component aufgerufen; geprüft wird der zurückgegebene React-Baum (Props), ohne Rendern.
import React from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Prisma } from '@prisma/client'

vi.stubGlobal('React', React)

const perms = vi.hoisted(() => ({ granted: new Set<string>(), hasPermission: vi.fn() }))
const queries = vi.hoisted(() => ({
  getInvoiceById: vi.fn(),
  getInvoicePayments: vi.fn(),
  getDunningNoticesForInvoice: vi.fn(),
  getDunningEligibility: vi.fn(),
}))

vi.mock('@/lib/auth/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/permissions')>()
  perms.hasPermission.mockImplementation(async (resource: string, action: string) => perms.granted.has(`${resource}:${action}`))
  return {
    ...actual,
    requirePagePermission: vi.fn(async () => ({ userId: 'u', userEmail: 'u@example.test', role: 'ADMIN' })),
    hasPermission: perms.hasPermission,
  }
})
vi.mock('@/lib/services/invoice-query.service', () => ({
  getInvoiceById: queries.getInvoiceById,
  getInvoicePayments: queries.getInvoicePayments,
}))
vi.mock('@/lib/services/dunning.service', () => ({
  getDunningNoticesForInvoice: queries.getDunningNoticesForInvoice,
  getDunningEligibility: queries.getDunningEligibility,
}))

import InvoiceDetailPage from '@/app/(dashboard)/invoices/[id]/page'
import { PaymentForm } from '@/components/payments/PaymentForm'
import { PaymentJournal } from '@/components/payments/PaymentJournal'

const D = (v: string) => new Prisma.Decimal(v)

function item(position: number, net: string, rate = '19') {
  return {
    id: `i${position}`, position, description: 'Pos', unit: 'Stk',
    quantity: D('1'), unitPrice: D(net), discountRate: null, taxRate: D(rate),
    netAmount: D(net), taxAmount: D((Math.round(Number(net) * Number(rate)) / 100).toFixed(2)), grossAmount: D(net),
  }
}

function invoiceFixture(over: Record<string, unknown> = {}) {
  return {
    id: 'invoice-1', invoiceNumber: 'RE-1', status: 'SENT', type: 'STANDARD', customerId: 'c1',
    customerSnapshot: { name: 'Testkunde' }, companySnapshot: null, order: null, customer: { name: 'Testkunde' },
    items: [item(1, '100.00')], totalNet: D('100.00'), totalTax: D('19.00'), totalGross: D('119.00'), paidAmount: D('0.00'),
    invoiceDate: new Date('2026-01-01'), dueDate: new Date('2026-01-15'), finalizedAt: new Date('2026-01-01'),
    sentAt: new Date('2026-01-02'), cancelledByInvoiceId: null, createdBy: { firstName: 'T', lastName: 'U' },
    createdAt: new Date('2026-01-01'),
    ...over,
  }
}

const payment = (amount: string, reference = 'REF-GEHEIM-1') => ({
  id: `p-${amount}`, amount: D(amount), paymentDate: new Date('2026-02-01'), method: 'bank_transfer',
  reference, notes: 'interne Notiz GEHEIM', createdAt: new Date('2026-02-01'),
})

type El = React.ReactElement<Record<string, unknown>>
function walk(node: unknown, visit: (el: El) => void): void {
  if (Array.isArray(node)) { node.forEach((n) => walk(n, visit)); return }
  if (!node || typeof node !== 'object' || !('props' in (node as object))) return
  const el = node as El
  visit(el)
  walk((el.props as { children?: unknown }).children, visit)
}
const find = (tree: unknown, pred: (el: El) => boolean): El[] => {
  const out: El[] = []
  walk(tree, (el) => { if (pred(el)) out.push(el) })
  return out
}
const texts = (tree: unknown): string => {
  const out: string[] = []
  const rec = (n: unknown): void => {
    if (typeof n === 'string') out.push(n)
    else if (Array.isArray(n)) n.forEach(rec)
    else if (n && typeof n === 'object' && 'props' in (n as object)) rec(((n as El).props as { children?: unknown }).children)
  }
  rec(tree)
  return out.join(' ')
}

/** Alle Props-Werte (ohne `type`, zyklenfrei) als Text – Prüfung, dass bestimmte Daten nirgends im Baum stehen. */
function propDump(root: unknown): string {
  const seen = new WeakSet<object>()
  const out: string[] = []
  const rec = (n: unknown): void => {
    if (n === null || n === undefined) return
    if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return }
    if (n instanceof Date) { out.push(n.toISOString()); return }
    if (typeof n !== 'object') return
    if (seen.has(n as object)) return
    seen.add(n as object)
    if (n instanceof Prisma.Decimal) { out.push(n.toFixed()); return }
    if (Array.isArray(n)) { n.forEach(rec); return }
    for (const [k, v] of Object.entries(n as Record<string, unknown>)) { if (k !== 'type') { out.push(k); rec(v) } }
  }
  rec(root)
  return out.join(' ')
}

const READ = ['invoice:read', 'invoice:update']
async function renderPage(granted: string[]) {
  perms.granted = new Set(granted)
  return InvoiceDetailPage({ params: Promise.resolve({ id: 'invoice-1' }) })
}

beforeEach(() => {
  vi.clearAllMocks()
  queries.getDunningNoticesForInvoice.mockResolvedValue([])
  queries.getDunningEligibility.mockResolvedValue(null)
  queries.getInvoicePayments.mockResolvedValue([])
})

describe('Rechnungsseite: geladene leere Zahlungsliste ≠ nicht geladen', () => {
  it('payments geladen, aber leer ([]): 0,00 bezahlt; Cache-Drift wird NICHT zur Wahrheit', async () => {
    queries.getInvoiceById.mockResolvedValue(invoiceFixture({ paidAmount: D('30.00') })) // Cache behauptet 30,00
    queries.getInvoicePayments.mockResolvedValue([])
    const tree = await renderPage([...READ, 'payment:read', 'payment:create'])

    const [form] = find(tree, (el) => el.type === PaymentForm)
    expect(form.props).toMatchObject({ totalGross: '119.00', paidAmount: '0.00', remainingAmount: '119.00' })
    expect(texts(tree)).toContain('weicht von der Summe der Zahlungen')
  })

  it('payments NICHT geladen (weder payment:read noch payment:create): Query wird nicht aufgerufen, Cache als Rückfall', async () => {
    queries.getInvoiceById.mockResolvedValue(invoiceFixture({ paidAmount: D('30.00') }))
    const tree = await renderPage(READ)

    expect(queries.getInvoicePayments).not.toHaveBeenCalled()
    expect(find(tree, (el) => el.type === PaymentForm)).toHaveLength(0)
    expect(find(tree, (el) => el.type === PaymentJournal)).toHaveLength(0)
    const open = find(tree, (el) => el.props?.label === 'Noch offen')
    expect(open[0].props.value).toBe('89,00 €') // 119,00 − Cache 30,00 (ausgewiesener Rückfall)
    expect(texts(tree)).not.toContain('weicht von der Summe der Zahlungen') // kein Drift-Urteil ohne Zahlungszeilen
  })

  it('geladen mit Zahlung: Rest = Brutto − Σ aktive Zahlungen, kein Drift bei übereinstimmendem Cache', async () => {
    queries.getInvoiceById.mockResolvedValue(invoiceFixture({ paidAmount: D('40.01') }))
    queries.getInvoicePayments.mockResolvedValue([payment('40.01')])
    const tree = await renderPage([...READ, 'payment:read', 'payment:create'])

    const [form] = find(tree, (el) => el.type === PaymentForm)
    expect(form.props).toMatchObject({ paidAmount: '40.01', remainingAmount: '78.99' })
    const [journal] = find(tree, (el) => el.type === PaymentJournal)
    expect(journal.props).toMatchObject({ paidAmount: '40.01', remainingAmount: '78.99' })
    expect(texts(tree)).not.toContain('weicht von der Summe der Zahlungen')
  })
})

describe('Rechnungsseite: keine Zahlungsdetails ohne payment:read', () => {
  it('payment:create ohne payment:read: Rest für das Formular ja, Journal und Zahlungsdetails nein', async () => {
    queries.getInvoiceById.mockResolvedValue(invoiceFixture())
    queries.getInvoicePayments.mockResolvedValue([payment('40.01')])
    const tree = await renderPage([...READ, 'payment:create'])

    expect(queries.getInvoicePayments).toHaveBeenCalledWith('invoice-1')
    expect(find(tree, (el) => el.type === PaymentJournal)).toHaveLength(0)
    const [form] = find(tree, (el) => el.type === PaymentForm)
    expect(form.props.remainingAmount).toBe('78.99')
    // Nichts aus den Zahlungszeilen (Referenz, Notiz, Einzelbeträge als Zeilen) gelangt in den Baum.
    const dump = propDump(tree)
    expect(dump).not.toContain('REF-GEHEIM-1')
    expect(dump).not.toContain('interne Notiz GEHEIM')
    expect(dump).not.toContain('p-40.01')
  })

  it('payment:read vorhanden: Journal bekommt die Zahlungsliste', async () => {
    queries.getInvoiceById.mockResolvedValue(invoiceFixture())
    queries.getInvoicePayments.mockResolvedValue([payment('40.01')])
    const tree = await renderPage([...READ, 'payment:read'])
    const [journal] = find(tree, (el) => el.type === PaymentJournal)
    expect((journal.props.payments as unknown[]).length).toBe(1)
  })
})

describe('Rechnungsseite: Steuergruppen (F4)', () => {
  it('10 × 0,33 € @ 19 %: angezeigt wird 0,63 € (nicht 10 × 0,06 = 0,60 €)', async () => {
    const items = Array.from({ length: 10 }, (_, i) => ({ ...item(i + 1, '0.33'), taxAmount: D('0.06') }))
    queries.getInvoiceById.mockResolvedValue(invoiceFixture({
      items, totalNet: D('3.30'), totalTax: D('0.63'), totalGross: D('3.93'),
    }))
    const tree = await renderPage(READ)
    const rows = find(tree, (el) => typeof el.props?.label === 'string' && /MwSt\./.test(el.props.label as string))
    expect(rows.map((r) => [r.props.label, r.props.value])).toEqual([['zzgl. 19% MwSt.', '0,63 €']])
  })

  it('Storno/negative Beträge: negative Steuergruppe bleibt sichtbar', async () => {
    const items = [{ ...item(1, '-100.00'), taxAmount: D('-19.00') }]
    queries.getInvoiceById.mockResolvedValue(invoiceFixture({
      type: 'CANCELLATION', items, totalNet: D('-100.00'), totalTax: D('-19.00'), totalGross: D('-119.00'),
    }))
    const tree = await renderPage(READ)
    const rows = find(tree, (el) => typeof el.props?.label === 'string' && /MwSt\./.test(el.props.label as string))
    expect(rows.map((r) => r.props.value)).toEqual(['-19,00 €'])
  })

  it('mehrere Sätze: absteigend sortiert', async () => {
    const items = [item(1, '100.00', '7'), item(2, '100.00', '19')]
    queries.getInvoiceById.mockResolvedValue(invoiceFixture({ items }))
    const tree = await renderPage(READ)
    const rows = find(tree, (el) => typeof el.props?.label === 'string' && /MwSt\./.test(el.props.label as string))
    expect(rows.map((r) => r.props.label)).toEqual(['zzgl. 19% MwSt.', 'zzgl. 7% MwSt.'])
  })
})
