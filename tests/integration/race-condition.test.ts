// tests/integration/race-condition.test.ts
// Race-Condition-Tests für die Rechnungsnummer-Vergabe
//
// VORAUSSETZUNG: TEST_DATABASE_URL Umgebungsvariable muss gesetzt sein.
// Diese Tests laufen gegen eine echte (Test-)Datenbank.
//
// Ausführung:
//   TEST_DATABASE_URL="postgresql://..." npx vitest run tests/integration
//
// ANNAHME: Die Test-DB ist bereits migriert (npx prisma migrate deploy)

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest'

// Überspringe Integration-Tests wenn keine Test-DB konfiguriert
const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

// Für den GGA-Betreiberfreigabe-Race-Test unten: next-auth-Session mocken,
// damit requireCollaborationSession() innerhalb des echten Service-Layers
// gegen die echte Test-DB läuft (gleiches Muster wie
// tests/integration/gga-operator-portal-db.test.ts).
const collaborationAuth = vi.hoisted(() => ({ getServerSession: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: collaborationAuth.getServerSession }))
// Der GGA-Race-Test unten geht über den echten Service-Layer (gga-cabinet.service.ts),
// der intern die App-Singleton-Prisma-Instanz nutzt — diese ist per tests/setup.ts
// global gemockt und muss hier auf die echte Test-DB zurückgesetzt werden.
vi.unmock('@/lib/db/prisma')
vi.unmock('@/lib/services/audit.service')

describe.skipIf(!RUN_INTEGRATION)(
  'Race Condition — Rechnungsnummer-Vergabe (Integration)',
  () => {
    let testPrisma: any

    beforeAll(async () => {
      const { PrismaClient } = await import('@prisma/client')
      testPrisma = new PrismaClient({
        datasources: { db: { url: process.env.TEST_DATABASE_URL } },
      })

      // Test-Sequenz zurücksetzen
      await testPrisma.numberSequence.deleteMany({
        where: { type: 'INVOICE' },
      })
    })

    afterAll(async () => {
      await testPrisma?.numberSequence.deleteMany({
        where: { type: 'INVOICE' },
      })
      await testPrisma?.$disconnect()
    })

    it('Gleichzeitige Nummer-Vergaben erzeugen keine Duplikate', async () => {
      // Simuliert N gleichzeitige Transaktionen
      const CONCURRENCY = 10
      const results: string[] = []
      const errors:  string[] = []

      async function grabNumber(): Promise<string> {
        return testPrisma.$transaction(
          async (tx: any) => {
            const year = new Date().getFullYear()

            // SELECT FOR UPDATE — zentrales Lock
            await tx.$queryRaw`
              INSERT INTO number_sequences (id, type, year, prefix, last_number, format, updated_at)
              VALUES (gen_random_uuid(), 'INVOICE'::"NumberSequenceType", ${year}, 'TEST-RE', 0, '{prefix}{year}-{number:04}', NOW())
              ON CONFLICT (type, year) DO NOTHING
            `

            const [seq] = await tx.$queryRaw<any[]>`
              SELECT id, last_number, prefix, format
              FROM number_sequences
              WHERE type = 'INVOICE'::"NumberSequenceType" AND year = ${year}
              FOR UPDATE
            `

            const next = seq.last_number + 1
            await tx.$queryRaw`
              UPDATE number_sequences
              SET last_number = ${next}, updated_at = NOW()
              WHERE id = ${seq.id}
            `

            const padded = String(next).padStart(4, '0')
            return `TEST-RE${year}-${padded}`
          },
          { timeout: 10000 },
        )
      }

      // Alle gleichzeitig starten
      const promises = Array.from({ length: CONCURRENCY }, () =>
        grabNumber()
          .then((n) => { results.push(n) })
          .catch((e) => { errors.push(e.message) }),
      )

      await Promise.all(promises)

      // Alle müssen erfolgreich sein
      expect(errors).toHaveLength(0)

      // Alle Nummern eindeutig
      const unique = new Set(results)
      expect(unique.size).toBe(CONCURRENCY)

      // Nummern sind fortlaufend
      const sorted = [...results].sort()
      const numbers = sorted.map((n) => parseInt(n.split('-').pop()!))
      for (let i = 0; i < numbers.length - 1; i++) {
        expect(numbers[i + 1]).toBe(numbers[i] + 1)
      }
    }, 30_000)
  },
)

describe.skipIf(!RUN_INTEGRATION)(
  'Race Condition — ein Leistungsnachweis pro Auftrag (Integration)',
  () => {
    let testPrisma: any
    let orderId: string
    let userId: string
    let customerId: string
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`

    beforeAll(async () => {
      const { PrismaClient } = await import('@prisma/client')
      testPrisma = new PrismaClient({
        datasources: { db: { url: process.env.TEST_DATABASE_URL } },
      })
      const role = await testPrisma.role.upsert({
        where: { name: 'ADMIN' },
        update: {},
        create: { name: 'ADMIN', displayName: 'Admin' },
      })
      const user = await testPrisma.user.create({
        data: {
          email: `service-report-race-${suffix}@example.invalid`,
          passwordHash: 'not-used',
          firstName: 'Race',
          lastName: 'Test',
          roleId: role.id,
        },
      })
      userId = user.id
      const customer = await testPrisma.customer.create({
        data: { number: `RACE-${suffix}`, name: 'Race Testkunde' },
      })
      customerId = customer.id
      const order = await testPrisma.order.create({
        data: {
          orderNumber: `RACE-AU-${suffix}`,
          customerId,
          createdById: userId,
        },
      })
      orderId = order.id
    })

    afterAll(async () => {
      if (testPrisma) {
        if (orderId) await testPrisma.serviceReport.deleteMany({ where: { orderId } })
        if (orderId) await testPrisma.order.deleteMany({ where: { id: orderId } })
        if (customerId) await testPrisma.customer.deleteMany({ where: { id: customerId } })
        if (userId) await testPrisma.user.deleteMany({ where: { id: userId } })
        await testPrisma.$disconnect()
      }
    })

    it('lässt bei parallelen Inserts höchstens einen Leistungsnachweis zu', async () => {
      const attempts = await Promise.allSettled([
        testPrisma.serviceReport.create({
          data: { reportNumber: `RACE-LN-A-${suffix}`, orderId, reportDate: new Date(), createdById: userId },
        }),
        testPrisma.serviceReport.create({
          data: { reportNumber: `RACE-LN-B-${suffix}`, orderId, reportDate: new Date(), createdById: userId },
        }),
      ])

      expect(attempts.filter((attempt) => attempt.status === 'fulfilled')).toHaveLength(1)
      await expect(testPrisma.serviceReport.count({ where: { orderId } })).resolves.toBe(1)
    })
  },
)

describe.skipIf(!RUN_INTEGRATION)(
  'Race Condition — GGA-Betreiberfreigabe-Entscheidung (Integration)',
  () => {
    let testPrisma: any
    let cabinetService: typeof import('@/lib/services/gga-cabinet.service')
    let phase2Service: typeof import('@/lib/services/collaboration-phase2.service')
    let managerUserId = ''
    let managerEmail = ''
    let operatorUserId = ''
    let operatorEmail = ''
    let projectId = ''
    let cabinetId = ''
    let stageAbnahmeId = ''
    const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`

    function asUser(id: string, email: string) {
      collaborationAuth.getServerSession.mockResolvedValue({ user: { id, email, authScope: 'COLLABORATION' } })
    }

    beforeAll(async () => {
      const { PrismaClient } = await import('@prisma/client')
      testPrisma = new PrismaClient({ datasources: { db: { url: process.env.TEST_DATABASE_URL } } })
      const role = await testPrisma.role.upsert({ where: { name: 'ADMIN' }, update: {}, create: { name: 'ADMIN', displayName: 'Admin' } })
      const mk = (label: string) => testPrisma.user.create({ data: { email: `gga-race-${suffix}-${label}@example.invalid`, passwordHash: 'not-used', firstName: label, lastName: 'Test', roleId: role.id, status: 'ACTIVE' } })
      const manager = await mk('manager'); managerUserId = manager.id; managerEmail = manager.email
      const operator = await mk('operator'); operatorUserId = operator.id; operatorEmail = operator.email

      const project = await testPrisma.collaborationProject.create({ data: { projectNumber: `GGA-RACE-${suffix}`, name: 'GGA Race Test', active: true } })
      projectId = project.id
      await testPrisma.collaborationMembership.create({ data: { userId: managerUserId, projectId, role: 'COLLAB_MANAGER', active: true } })
      await testPrisma.collaborationMembership.create({ data: { userId: operatorUserId, projectId, role: 'OPERATOR', active: true } })
      const stage = await testPrisma.collaborationProjectStage.create({ data: { projectId, code: 'ABNAHME', title: 'Abnahme', sequence: 1, weight: 100 } })
      stageAbnahmeId = stage.id

      cabinetService = await import('@/lib/services/gga-cabinet.service')
      phase2Service = await import('@/lib/services/collaboration-phase2.service')
      await asUser(managerUserId, managerEmail)
      const cabinet = await cabinetService.createGgaCabinet(projectId, { kennung: `GGA-RACE-${suffix}`, bezeichnung: 'Race Test Schrank' })
      cabinetId = cabinet.id
    })

    afterAll(async () => {
      if (!testPrisma) return
      await testPrisma.auditLog.deleteMany({ where: { OR: [{ userId: managerUserId }, { userId: operatorUserId }] } })
      await testPrisma.collaborationApproval.deleteMany({ where: { cabinetId } })
      await testPrisma.collaborationChecklistItem.deleteMany({ where: { cabinetId } })
      await testPrisma.ggaCabinet.deleteMany({ where: { id: cabinetId } })
      await testPrisma.collaborationProjectStage.deleteMany({ where: { projectId } })
      await testPrisma.collaborationMembership.deleteMany({ where: { projectId } })
      await testPrisma.collaborationProject.deleteMany({ where: { id: projectId } })
      await testPrisma.user.deleteMany({ where: { id: { in: [managerUserId, operatorUserId] } } })
      await testPrisma.$disconnect()
    })

    it('zwei parallele Entscheidungen derselben Betreiberfreigabe: genau eine gewinnt, genau ein Audit-Eintrag', async () => {
      await asUser(managerUserId, managerEmail)
      // REQ-015.1: requestGgaCabinetOperatorApproval() verlangt seit REQ-015
      // serverseitig eine bereits bestandene interne Prüfung
      // (ggaCabinetBereitFuerBetreiberfreigabe) — vorher genügte hier die
      // reine Existenz der ABNAHME-Stage. Ausschließlich über bestehende
      // produktive Service-Funktionen hergestellt, keine direkte DB-
      // Manipulation. Der eigentliche Testzweck (Race Condition bei der
      // PARALLELEN ENTSCHEIDUNG derselben Betreiberfreigabe) bleibt
      // unverändert — nur der Ausgangszustand vor der Anforderung wird jetzt
      // fachlich gültig hergestellt.
      for (const title of cabinetService.GGA_CABINET_CHECKLIST_TEMPLATES.ABNAHME.items) {
        await cabinetService.setGgaCabinetInspectionItem(cabinetId, title, true)
      }
      const internalApproval = await phase2Service.requestCollaborationApproval(stageAbnahmeId, cabinetId)
      await phase2Service.decideCollaborationApproval(internalApproval.id, 'APPROVED')

      const approval = await cabinetService.requestGgaCabinetOperatorApproval(cabinetId)

      await asUser(operatorUserId, operatorEmail)
      const results = await Promise.allSettled([
        cabinetService.decideGgaCabinetOperatorApproval(approval.id, { decision: 'APPROVED', unterlagenGeprueft: true }),
        cabinetService.decideGgaCabinetOperatorApproval(approval.id, { decision: 'REJECTED', decisionNote: 'Race' }),
      ])
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1)

      const finalApproval = await testPrisma.collaborationApproval.findUniqueOrThrow({ where: { id: approval.id }, select: { status: true } })
      expect(['APPROVED', 'REJECTED']).toContain(finalApproval.status)
      const auditCount = await testPrisma.auditLog.count({ where: { entityType: 'collaboration_approval', entityId: approval.id, action: 'STATUS_CHANGE' } })
      expect(auditCount).toBe(1)
    }, 15_000)
  },
)

// ── Unit-Version ohne echte DB (immer ausführen) ───────────────

describe('Race Condition — Logik-Simulation (Unit)', () => {
  /**
   * Simuliert N gleichzeitige Requests auf einen serialisierten Lock-Mechanismus.
   * Prüft dass die Sequenz korrekt hochzählt wenn Locks korrekt implementiert sind.
   */
  it('Serialisierter Nummern-Counter erzeugt keine Lücken', async () => {
    let counter = 0
    const lock  = { locked: false, queue: [] as Array<() => void> }

    async function acquireLock(): Promise<void> {
      return new Promise((resolve) => {
        if (!lock.locked) {
          lock.locked = true
          resolve()
        } else {
          lock.queue.push(() => {
            lock.locked = true
            resolve()
          })
        }
      })
    }

    function releaseLock() {
      const next = lock.queue.shift()
      if (next) next()
      else lock.locked = false
    }

    async function grabNumberSafe(): Promise<number> {
      await acquireLock()
      const n = ++counter
      await new Promise((r) => setTimeout(r, Math.random() * 5)) // simulate async
      releaseLock()
      return n
    }

    const results = await Promise.all(
      Array.from({ length: 20 }, () => grabNumberSafe()),
    )

    const unique = new Set(results)
    expect(unique.size).toBe(20)
    expect(Math.min(...results)).toBe(1)
    expect(Math.max(...results)).toBe(20)
  })
})
