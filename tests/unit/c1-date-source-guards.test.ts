// P5-6 C-1: Quell-Wächter gegen Rückfall in die drei Fehlerklassen (doppelter Filterschlüssel, lokaler Monatsstart).
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), 'utf8')

describe('P5-6 C-1 Quell-Wächter', () => {
  it('audit-query.service und payment.service setzen createdAt/paymentDate nur einmal im where', () => {
    const audit = read('lib/services/audit-query.service.ts')
    const pay = read('lib/services/payment.service.ts')
    const auditWhere = audit.slice(audit.indexOf('const where: Prisma.AuditLogWhereInput'), audit.indexOf('const [raw, total]'))
    const payWhere = pay.slice(pay.indexOf('const where: Prisma.PaymentWhereInput = {\n    deletedAt: null'), pay.indexOf('const [raw, total, aggResult]'))
    expect(auditWhere.match(/createdAt\s*:/g)?.length).toBe(1)
    expect(payWhere.match(/paymentDate\s*:/g)?.length).toBe(1)
    expect(auditWhere).not.toMatch(/lte:\s*to|gte:\s*from/)
    expect(payWhere).not.toMatch(/lte:\s*to|gte:\s*from/)
  })

  it('dashboard.service bestimmt den Monatsstart nicht mit lokalen Datums-Gettern', () => {
    const source = read('lib/services/dashboard.service.ts')
    expect(source).toContain('berlinMonthStartInstant')
    expect(source).not.toMatch(/getFullYear|getMonth|getDate|setHours/)
  })

  it('die B-3-eingefrorenen Seiten bleiben unverändert (Parsing liefert weiter UTC-Mitternacht des gewählten Tags)', () => {
    expect(read('app/(dashboard)/audit/page.tsx')).toContain("const from       = query.from ? new Date(query.from) : undefined")
    expect(read('app/(dashboard)/payments/page.tsx')).toContain("const from   = query.from ? new Date(query.from) : undefined")
  })
})
