// prisma/seed/seed.ts
// Seed-Script: Rollen, Rechte, Demo-Benutzer, Firmeneinstellungen, Testdaten

import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

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
  console.log('Demo-Zugangsdaten:')
  console.log('┌─────────────────────────────────┬──────────────┐')
  console.log('│ E-Mail                          │ Passwort     │')
  console.log('├─────────────────────────────────┼──────────────┤')
  demoUsers.forEach((u) => {
    console.log(`│ ${u.email.padEnd(31)} │ ${u.password.padEnd(12)} │`)
  })
  console.log('└─────────────────────────────────┴──────────────┘')
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
