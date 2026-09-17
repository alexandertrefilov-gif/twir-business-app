import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), 'utf8')
}

describe('maximal ein Leistungsnachweis pro Auftrag', () => {
  const service = source('lib/services/service-report.service.ts')
  const createPage = source('app/(dashboard)/services/new/page.tsx')
  const action = source('app/(dashboard)/services/actions.ts')
  const workflow = source('components/workflow/BusinessProcessWorkflow.tsx')

  it('prüft unter Auftragszeilensperre vor Nummernvergabe und Create', () => {
    const lock = service.indexOf('FOR UPDATE')
    const existence = service.indexOf('tx.serviceReport.findFirst', lock)
    const sequence = service.indexOf('nextNumber(NumberSequenceType.SERVICE_REPORT', existence)
    const create = service.indexOf('tx.serviceReport.create', sequence)

    expect(lock).toBeGreaterThan(0)
    expect(existence).toBeGreaterThan(lock)
    expect(sequence).toBeGreaterThan(existence)
    expect(create).toBeGreaterThan(sequence)
    expect(service).toContain('Für diesen Auftrag existiert bereits ein Leistungsnachweis.')
  })

  it('leitet die direkte Action weiterhin durch den geschützten Service', () => {
    expect(action).toContain('reportId = await createServiceReport(result.data, userId, userEmail)')
    expect(action).toContain("return { success: false, error: e instanceof Error ? e.message : 'Fehler' }")
  })

  it('entfernt belegte Aufträge aus der Neuanlage und leitet direkte URLs um', () => {
    expect(createPage).toContain('serviceReports: { none: {} }')
    expect(createPage).toContain('const requestedOrderId = query.order ?? query.orderId')
    expect(createPage).toContain('if (existingReport) redirect(`/services/${existingReport.id}`)')
  })

  it('zeigt genau eine Erstellaktion nur bei null Nachweisen', () => {
    expect(workflow).toContain('process.serviceReports.length === 0')
    expect(workflow).toContain('>Leistungsnachweis erstellen</Link>')
    expect(workflow).not.toContain('Weiteren Leistungsnachweis erstellen')
  })

  it('bietet die Rechnung nur bei exakt einem abgeschlossenen Leistungsnachweis an', () => {
    expect(workflow).toContain('process.serviceReports.length === 1')
    expect(workflow).toContain('isServiceReportReadyForInvoice(report)')
    expect(workflow).toContain('Leistungsnachweis muss zuerst vom Kunden bestätigt werden.')
    expect(workflow).toContain('>Rechnung erstellen</Link>')
  })

  it('sichert die Invariante mit einer nicht-destruktiven, vorgeprüften Migration', () => {
    const schema = source('prisma/schema.prisma')
    const migration = source('prisma/migrations_archive_20260915_pre_canonical_baseline/20260826180000_one_service_report_per_order/migration.sql')
    expect(schema).toContain('@@unique([orderId])')
    expect(migration).toContain('HAVING COUNT(*) > 1')
    expect(migration).toContain('RAISE EXCEPTION')
    expect(migration).toContain('CREATE UNIQUE INDEX "service_reports_order_id_key"')
    expect(migration).not.toMatch(/DELETE FROM|TRUNCATE/i)
  })
})
