// deploy/initial-production-setup.ts
//
// Einmaliger, manuell auszuführender Setup-Schritt für eine NEUE
// Produktionsinstallation — KEINE Migration, KEIN Teil des App-Codes zur
// Laufzeit, KEIN Seed (prisma/seed/seed.ts bleibt ausschließlich für lokale
// Entwicklung, siehe dortige Warnungen).
//
// Zweck: setzt document_archive_path/-enabled auf den in
// deploy/docker-compose.production.yml gemounteten Pfad, OHNE:
//   - eine bestehende Zeile zu überschreiben (update: {} — absichtlich leer),
//   - den Pfad im Anwendungscode fest zu verdrahten (kommt ausschließlich aus
//     einer Env-Variable, die NUR dieses Skript liest, nicht die laufende App),
//   - eine umgebungsspezifische Prisma-Migration zu benötigen.
//
// Ausführung (einmalig, nach der ersten `prisma migrate deploy` auf einer
// frischen Produktionsdatenbank, vor dem ersten Smoke-Test):
//   INITIAL_DOCUMENT_ARCHIVE_PATH=/app/archive \
//     DATABASE_URL=<prod> npx ts-node --compiler-options '{"module":"CommonJS"}' deploy/initial-production-setup.ts
// oder über das npm-Skript:
//   INITIAL_DOCUMENT_ARCHIVE_PATH=/app/archive npm run db:setup-production
//
// Erneutes Ausführen ist sicher (idempotent) — auf einer bereits
// konfigurierten Instanz ändert es nichts.

import { PrismaClient } from '@prisma/client'

const SETTINGS_ID = '00000000-0000-0000-0000-000000000001' // muss zu lib/services/settings.service.ts passen

async function main() {
  const archivePath = process.env.INITIAL_DOCUMENT_ARCHIVE_PATH
  if (!archivePath) {
    throw new Error(
      'INITIAL_DOCUMENT_ARCHIVE_PATH ist nicht gesetzt. Abbruch — kein impliziter Default, ' +
      'um versehentliches Schreiben eines falschen Pfads zu vermeiden.',
    )
  }

  const prisma = new PrismaClient()
  try {
    const existing = await prisma.companySetting.findUnique({ where: { id: SETTINGS_ID } })

    if (existing) {
      console.log(
        `company_settings existiert bereits (documentArchivePath="${existing.documentArchivePath ?? '(leer)'}", ` +
        `documentArchiveEnabled=${existing.documentArchiveEnabled}). Nichts geändert — dieses Skript überschreibt ` +
        'niemals eine bestehende Zeile.',
      )
      return
    }

    await prisma.companySetting.create({
      data: {
        id: SETTINGS_ID,
        companyName: 'Mein Unternehmen', // identischer Default wie settings.service.ts getSettings()
        documentArchiveEnabled: true,
        documentArchivePath: archivePath,
      },
    })
    console.log(`company_settings neu angelegt mit documentArchivePath="${archivePath}".`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
