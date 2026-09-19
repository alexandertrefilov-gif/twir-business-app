// prisma/seed/seed.ts
// Seed-Script: Rollen, Rechte, Demo-Benutzer, Firmeneinstellungen, Testdaten

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'
// GGA-05.1: relativer statt `@/`-Pfad-Alias-Import — `db:seed` läuft über
// `ts-node` ohne `tsconfig-paths/register`, das die `@/*`-Alias-Zuordnung
// aus tsconfig.json zur Laufzeit nicht auflöst (nur `tsc` selbst tut das
// beim Typecheck). Das Zielmodul ist bewusst abhängigkeitsfrei, ein
// relativer Import ist hier deshalb sicher.
import { GGA_FIVE_PHASE_PLAN } from '../../lib/collaboration/cabinet-workflow'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Seed wird ausgeführt...\n')

  // ── 1. Rollen anlegen ──────────────────────────────────────
  console.log('  → Rollen...')

  const roles = await Promise.all([
    prisma.role.upsert({
      where:  { name: 'ADMIN' },
      update: {},
      create: { name: 'ADMIN', displayName: 'Administrator', description: 'Vollständiger Zugriff' },
    }),
    prisma.role.upsert({
      where:  { name: 'OFFICE' },
      update: {},
      create: { name: 'OFFICE', displayName: 'Büro', description: 'Kunden, Angebote, Aufträge' },
    }),
    prisma.role.upsert({
      where:  { name: 'PROJECT_MANAGER' },
      update: {},
      create: { name: 'PROJECT_MANAGER', displayName: 'Projektleiter', description: 'Aufträge und Leistungen' },
    }),
    prisma.role.upsert({
      where:  { name: 'EMPLOYEE' },
      update: {},
      create: { name: 'EMPLOYEE', displayName: 'Mitarbeiter', description: 'Eigene Leistungen erfassen' },
    }),
    prisma.role.upsert({
      where:  { name: 'ACCOUNTING' },
      update: {},
      create: { name: 'ACCOUNTING', displayName: 'Buchhaltung', description: 'Rechnungen und Zahlungen' },
    }),
  ])

  const roleMap = Object.fromEntries(roles.map((r) => [r.name, r.id]))
  console.log(`     ✓ ${roles.length} Rollen`)

  // ── 2. Berechtigungen anlegen ──────────────────────────────
  console.log('  → Berechtigungen...')

  const permissionDefs = [
    // Kunden
    { resource: 'customer', action: 'create' }, { resource: 'customer', action: 'read' },
    { resource: 'customer', action: 'update' }, { resource: 'customer', action: 'delete' },
    // Kontakte
    { resource: 'contact',  action: 'create' }, { resource: 'contact',  action: 'read' },
    { resource: 'contact',  action: 'update' }, { resource: 'contact',  action: 'delete' },
    // Angebote
    { resource: 'offer',    action: 'create' }, { resource: 'offer',    action: 'read' },
    { resource: 'offer',    action: 'update' }, { resource: 'offer',    action: 'delete' },
    // Aufträge
    { resource: 'order',    action: 'create' }, { resource: 'order',    action: 'read' },
    { resource: 'order',    action: 'update' }, { resource: 'order',    action: 'delete' },
    // Leistungen
    { resource: 'service_report', action: 'create' }, { resource: 'service_report', action: 'read' },
    { resource: 'service_report', action: 'update' }, { resource: 'service_report', action: 'delete' },
    // Rechnungen
    { resource: 'invoice',  action: 'create'   }, { resource: 'invoice', action: 'read' },
    { resource: 'invoice',  action: 'update'   }, { resource: 'invoice', action: 'finalize' },
    { resource: 'invoice',  action: 'cancel'   },
    // Zahlungen
    { resource: 'payment',  action: 'create'   }, { resource: 'payment',  action: 'read' },
    { resource: 'payment',  action: 'delete'   },
    // Buchhaltung (read-only Grundbereich)
    { resource: 'accounting', action: 'read'   },
    // Dokumente
    { resource: 'document', action: 'create'   }, { resource: 'document', action: 'read' },
    { resource: 'document', action: 'delete'   },
    // Audit, Benutzer, Einstellungen
    { resource: 'audit_log', action: 'read'    },
    { resource: 'user',     action: 'create'   }, { resource: 'user',     action: 'read' },
    { resource: 'user',     action: 'update'   }, { resource: 'user',     action: 'delete' },
    { resource: 'settings', action: 'read'     }, { resource: 'settings', action: 'update' },
  ]

  const permissions = await Promise.all(
    permissionDefs.map((p) =>
      prisma.permission.upsert({
        where:  { resource_action: p },
        update: {},
        create: p,
      }),
    ),
  )

  console.log(`     ✓ ${permissions.length} Berechtigungen`)

  // ── 3. Rollen-Berechtigungen zuweisen ──────────────────────
  console.log('  → Rollen-Berechtigungen...')

  const permMap = Object.fromEntries(
    permissions.map((p) => [`${p.resource}:${p.action}`, p.id]),
  )

  const rolePermissions: Array<{ roleName: string; key: string }> = [
    // ADMIN — alle Rechte
    ...permissionDefs.map((p) => ({ roleName: 'ADMIN', key: `${p.resource}:${p.action}` })),

    // OFFICE
    { roleName: 'OFFICE', key: 'customer:create'    }, { roleName: 'OFFICE', key: 'customer:read'   },
    { roleName: 'OFFICE', key: 'customer:update'    }, { roleName: 'OFFICE', key: 'customer:delete' },
    { roleName: 'OFFICE', key: 'contact:create'     }, { roleName: 'OFFICE', key: 'contact:read'    },
    { roleName: 'OFFICE', key: 'contact:update'     }, { roleName: 'OFFICE', key: 'contact:delete'  },
    { roleName: 'OFFICE', key: 'offer:create'       }, { roleName: 'OFFICE', key: 'offer:read'      },
    { roleName: 'OFFICE', key: 'offer:update'       }, { roleName: 'OFFICE', key: 'offer:delete'    },
    { roleName: 'OFFICE', key: 'order:create'       }, { roleName: 'OFFICE', key: 'order:read'      },
    { roleName: 'OFFICE', key: 'order:update'       }, { roleName: 'OFFICE', key: 'order:delete'    },
    { roleName: 'OFFICE', key: 'service_report:read'}, { roleName: 'OFFICE', key: 'invoice:create'  },
    { roleName: 'OFFICE', key: 'invoice:read'       }, { roleName: 'OFFICE', key: 'invoice:update'  },
    { roleName: 'OFFICE', key: 'document:create'    }, { roleName: 'OFFICE', key: 'document:read'   },
    { roleName: 'OFFICE', key: 'document:delete'    },

    // PROJECT_MANAGER
    { roleName: 'PROJECT_MANAGER', key: 'customer:read'           },
    { roleName: 'PROJECT_MANAGER', key: 'offer:read'              },
    { roleName: 'PROJECT_MANAGER', key: 'order:create'            }, { roleName: 'PROJECT_MANAGER', key: 'order:read'    },
    { roleName: 'PROJECT_MANAGER', key: 'order:update'            },
    { roleName: 'PROJECT_MANAGER', key: 'service_report:create'   }, { roleName: 'PROJECT_MANAGER', key: 'service_report:read' },
    { roleName: 'PROJECT_MANAGER', key: 'service_report:update'   },
    { roleName: 'PROJECT_MANAGER', key: 'invoice:read'            },
    { roleName: 'PROJECT_MANAGER', key: 'document:read'           },

    // EMPLOYEE
    { roleName: 'EMPLOYEE', key: 'order:read'           },
    { roleName: 'EMPLOYEE', key: 'service_report:create'}, { roleName: 'EMPLOYEE', key: 'service_report:read' },
    { roleName: 'EMPLOYEE', key: 'document:read'        },

    // ACCOUNTING
    { roleName: 'ACCOUNTING', key: 'customer:read'       }, { roleName: 'ACCOUNTING', key: 'offer:read'    },
    { roleName: 'ACCOUNTING', key: 'order:read'          },
    { roleName: 'ACCOUNTING', key: 'service_report:read' },
    { roleName: 'ACCOUNTING', key: 'invoice:create'      }, { roleName: 'ACCOUNTING', key: 'invoice:read'  },
    { roleName: 'ACCOUNTING', key: 'invoice:update'      }, { roleName: 'ACCOUNTING', key: 'invoice:finalize' },
    { roleName: 'ACCOUNTING', key: 'invoice:cancel'      },
    { roleName: 'ACCOUNTING', key: 'payment:create'      }, { roleName: 'ACCOUNTING', key: 'payment:read'  },
    { roleName: 'ACCOUNTING', key: 'payment:delete'      },
    { roleName: 'ACCOUNTING', key: 'accounting:read'     },
    { roleName: 'ACCOUNTING', key: 'document:read'       }, { roleName: 'ACCOUNTING', key: 'document:create' },
    { roleName: 'ACCOUNTING', key: 'audit_log:read'      },
  ]

  let rpCount = 0
  for (const rp of rolePermissions) {
    const permId = permMap[rp.key]
    if (!permId) continue
    await prisma.rolePermission.upsert({
      where:  { roleId_permissionId: { roleId: roleMap[rp.roleName], permissionId: permId } },
      update: {},
      create: { roleId: roleMap[rp.roleName], permissionId: permId },
    })
    rpCount++
  }
  console.log(`     ✓ ${rpCount} Rollen-Berechtigungen`)

  // ── 4. Demo-Benutzer ───────────────────────────────────────
  console.log('  → Demo-Benutzer...')

  const demoUsers = [
    { email: 'admin@demo.local',   password: 'Demo1234!', firstName: 'Admin',      lastName: 'Benutzer',  role: 'ADMIN'           },
    { email: 'buero@demo.local',   password: 'Demo1234!', firstName: 'Maria',      lastName: 'Müller',    role: 'OFFICE'          },
    { email: 'pl@demo.local',      password: 'Demo1234!', firstName: 'Thomas',     lastName: 'Schmidt',   role: 'PROJECT_MANAGER' },
    { email: 'ma@demo.local',      password: 'Demo1234!', firstName: 'Klaus',      lastName: 'Wagner',    role: 'EMPLOYEE'        },
    { email: 'buko@demo.local',    password: 'Demo1234!', firstName: 'Sabine',     lastName: 'Fischer',   role: 'ACCOUNTING'      },
  ]

  for (const u of demoUsers) {
    const hash = await bcrypt.hash(u.password, 12)
    await prisma.user.upsert({
      where:  { email: u.email },
      update: {},
      create: {
        email:        u.email,
        passwordHash: hash,
        firstName:    u.firstName,
        lastName:     u.lastName,
        roleId:       roleMap[u.role],
        status:       'ACTIVE',
      },
    })
  }
  console.log(`     ✓ ${demoUsers.length} Demo-Benutzer`)

  // ── 4a. Expliziter Collaboration-Zugang ──────────────────
  // Die interne ADMIN-Rolle vermittelt bewusst keinen Collaboration-Zugang.
  // Der Hauptadministrator erhält ihn ausschließlich über diese persistierte,
  // projektbezogene Membership.
  console.log('  → Collaboration-Demozugang...')

  const collaborationProject = await prisma.collaborationProject.upsert({
    where: { id: '00000000-0000-0000-0000-000000000101' },
    update: { status: 'ACTIVE', projectNumber: 'GGA-0001' },
    create: {
      id: '00000000-0000-0000-0000-000000000101',
      projectNumber: 'GGA-0001',
      name: 'GGA Lagerplanung',
      description: 'Demo-Projekt für die Collaboration-Projektsteuerung',
      year: 2026,
      status: 'ACTIVE',
      active: true,
    },
  })
  const admin = await prisma.user.findUniqueOrThrow({
    where: { email: 'admin@demo.local' },
    select: { id: true },
  })
  await prisma.collaborationMembership.upsert({
    where: {
      userId_projectId: {
        userId: admin.id,
        projectId: collaborationProject.id,
      },
    },
    update: {
      role: 'COLLAB_MANAGER',
      active: true,
    },
    create: {
      userId: admin.id,
      projectId: collaborationProject.id,
      role: 'COLLAB_MANAGER',
      active: true,
    },
  })
  // GGA-05.1: Vor dieser Korrektur erzeugte dieser Abschnitt fälschlich
  // PLANUNG/AUSFUEHRUNG/UEBERGABE unter den festen IDs ...111/112/113 —
  // inkompatibel mit dem produktiven GGA-Cabinet-Workflow (cabinet-workflow.ts
  // erwartet zwingend KONZEPT/PLANUNG/UMSETZUNG/ABNAHME/ABSCHLUSS). Diese drei
  // historischen IDs sind eindeutig seed-eigen (ausschließlich dieser Seed
  // vergibt feste, nicht-zufällige UUIDs) — ihre Bereinigung ist deshalb keine
  // Migration unklarer Nutzdaten, sondern Selbstkorrektur des Seeds. Nur
  // entfernt, wenn noch keine Aufgaben/Checklisten/Blocker/Freigaben daran
  // hängen (sonst würde das auf eine reale, in Bearbeitung befindliche
  // Installation hindeuten, die hier nicht angefasst wird).
  const legacyGgaStageIds = [
    '00000000-0000-0000-0000-000000000111',
    '00000000-0000-0000-0000-000000000112',
    '00000000-0000-0000-0000-000000000113',
  ]
  const canonicalGgaCodes = GGA_FIVE_PHASE_PLAN.map((phase) => phase.code)
  const legacyStages = await prisma.collaborationProjectStage.findMany({
    where: { id: { in: legacyGgaStageIds }, projectId: collaborationProject.id, code: { notIn: canonicalGgaCodes } },
    select: { id: true, code: true, _count: { select: { tasks: true, checklistItems: true, blockers: true, approvals: true } } },
  })
  const removableLegacyStageIds = legacyStages
    .filter((stage) => stage._count.tasks + stage._count.checklistItems + stage._count.blockers + stage._count.approvals === 0)
    .map((stage) => stage.id)
  if (removableLegacyStageIds.length > 0) {
    await prisma.collaborationProjectStage.deleteMany({ where: { id: { in: removableLegacyStageIds } } })
    console.log(`     ↺ ${removableLegacyStageIds.length} veraltete GGA-Phase(n) ohne Abhängigkeiten bereinigt`)
  }
  if (legacyStages.length > removableLegacyStageIds.length) {
    console.warn('     ⚠ veraltete GGA-Phase(n) mit vorhandenen Abhängigkeiten gefunden — NICHT automatisch entfernt, manuelle Prüfung erforderlich')
  }

  // Kanonische fünf Phasen — Single Source of Truth: GGA_FIVE_PHASE_PLAN
  // (lib/collaboration/cabinet-workflow.ts). Upsert über die bestehende
  // @@unique([projectId, code])-Constraint statt fester IDs, damit der Seed
  // unabhängig davon idempotent bleibt, ob eine Phase ursprünglich vom Seed
  // selbst oder z. B. über restructureCollaborationProjectStages() angelegt
  // wurde. `status` bewusst NICHT im `update`-Zweig, um echten, bereits
  // erarbeiteten Fortschritt bei wiederholten Seed-Läufen nicht zurückzusetzen.
  const ggaStages: { id: string; code: string }[] = []
  for (const [index, phase] of GGA_FIVE_PHASE_PLAN.entries()) {
    const stage = await prisma.collaborationProjectStage.upsert({
      where: { projectId_code: { projectId: collaborationProject.id, code: phase.code } },
      update: { title: phase.title, sequence: index + 1, weight: phase.weight, requiresApproval: phase.requiresApproval },
      create: {
        projectId: collaborationProject.id, code: phase.code, title: phase.title,
        sequence: index + 1, weight: phase.weight, requiresApproval: phase.requiresApproval,
        status: index === 0 ? 'READY' : 'NOT_STARTED', isRequired: true,
      },
    })
    ggaStages.push({ id: stage.id, code: stage.code })
  }
  for (let index = 1; index < ggaStages.length; index++) {
    await prisma.collaborationProjectStageDependency.upsert({
      where: { stageId_dependsOnStageId: { stageId: ggaStages[index].id, dependsOnStageId: ggaStages[index - 1].id } },
      update: { requiredStatus: 'COMPLETED' },
      create: { stageId: ggaStages[index].id, dependsOnStageId: ggaStages[index - 1].id, requiredStatus: 'COMPLETED' },
    })
  }

  // GGA-05.1 Selbstprüfung: fail fast, falls die tatsächlich erzeugten
  // GGA-Phasen-Codes je erneut von der kanonischen Definition abweichen
  // sollten — verhindert, dass derselbe Stage-Code-Konflikt unbemerkt
  // zurückkehrt (z. B. durch eine künftige Änderung an dieser Datei, die
  // GGA_FIVE_PHASE_PLAN nicht mehr importiert).
  const actualGgaCodes = ggaStages.map((stage) => stage.code)
  if (JSON.stringify(actualGgaCodes) !== JSON.stringify(canonicalGgaCodes)) {
    throw new Error(
      `GGA-Seed-Selbstprüfung fehlgeschlagen: erzeugte Phasen-Codes [${actualGgaCodes.join(', ')}] ` +
      `weichen von der kanonischen Definition [${canonicalGgaCodes.join(', ')}] ab (GGA_FIVE_PHASE_PLAN, ` +
      `lib/collaboration/cabinet-workflow.ts). Seed-Ausführung abgebrochen.`,
    )
  }

  console.log('     ✓ admin@demo.local → GGA Lagerplanung (COLLAB_MANAGER)')

  // ── 5. Firmeneinstellungen ─────────────────────────────────
  console.log('  → Firmeneinstellungen...')

  await prisma.companySetting.upsert({
    where:  { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id:                    '00000000-0000-0000-0000-000000000001',
      companyName:           'Muster Industrie GmbH',
      legalForm:             'GmbH',
      street:                'Industriestraße',
      houseNumber:           '42',
      postalCode:            '70565',
      city:                  'Stuttgart',
      country:               'DE',
      vatId:                 'DE123456789',
      taxNumber:             '99/123/12345',
      taxOffice:             'Finanzamt Stuttgart',
      bankName:              'Musterbank AG',
      iban:                  'DE12 3456 7890 1234 5678 90',
      bic:                   'MUBADE12',
      email:                 'info@muster-industrie.de',
      phone:                 '+49 711 123456',
      invoicePrefix:         'RE',
      offerPrefix:           'AN',
      orderPrefix:           'AU',
      serviceReportPrefix:   'LN',
      defaultPaymentTermDays: 14,
      defaultTaxRate:        19.00,
    },
  })
  console.log('     ✓ Firmeneinstellungen')

  // ── 6. Demo-Kunde ──────────────────────────────────────────
  console.log('  → Demo-Kundendaten...')

  await prisma.customer.upsert({
    where:  { number: 'KD-0001' },
    update: {},
    create: {
      number:    'KD-0001',
      name:      'Beispiel AG',
      legalName: 'Beispiel Aktiengesellschaft',
      vatId:     'DE987654321',
      street:    'Hauptstraße',
      houseNumber: '1',
      postalCode: '80331',
      city:      'München',
      country:   'DE',
      email:     'einkauf@beispiel-ag.de',
      phone:     '+49 89 987654',
    },
  })
  console.log('     ✓ Demo-Kundendaten')

  console.log('\n✅ Seed erfolgreich abgeschlossen\n')
  console.log('Demo-Benutzer wurden idempotent geprüft; Passwörter werden nicht protokolliert.')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
