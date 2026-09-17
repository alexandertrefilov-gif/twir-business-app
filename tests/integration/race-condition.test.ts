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

import { describe, it, expect, beforeAll, afterAll } from 'vitest'

// Überspringe Integration-Tests wenn keine Test-DB konfiguriert
const RUN_INTEGRATION = !!process.env.TEST_DATABASE_URL

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
