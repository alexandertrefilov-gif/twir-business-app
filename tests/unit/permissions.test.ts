// tests/unit/permissions.test.ts
// Rollenrechte-Tests — prüft die komplette Berechtigungsmatrix
// KEIN Mock für permissions.ts nötig — es ist reiner Business-Code ohne DB

import { describe, it, expect } from 'vitest'
import {
  roleHasPermission,
  Resource,
  Action,
} from '@/lib/auth/permissions'
import { RoleName } from '@/types/enums'

describe('Rollenmatrix — Vollständigkeitsprüfung', () => {

  // ── ADMIN: Vollzugriff ───────────────────────────────────────

  describe('ADMIN', () => {
    const allResources = Object.values(Resource) as string[]
    const allActions   = Object.values(Action)   as string[]

    it.each(allResources)('hat %s:read Berechtigung', (resource) => {
      expect(
        roleHasPermission(RoleName.ADMIN, resource as any, Action.READ),
      ).toBe(true)
    })

    it.each(allResources)('hat %s:create Berechtigung', (resource) => {
      // Admin hat überall CREATE außer wo keine create-Berechtigung definiert ist
      // (z.B. audit_log hat kein create)
      const hasCreate = roleHasPermission(RoleName.ADMIN, resource as any, Action.CREATE)
      if (['audit_log', 'role', 'settings'].includes(resource)) {
        // Für diese Ressourcen ist keine direkte CREATE-Aktion definiert.
        expect(hasCreate).toBe(false)
      } else {
        expect(hasCreate).toBe(true)
      }
    })
  })

  // ── ACCOUNTING: Rechnungen + Zahlungen ───────────────────────

  describe('ACCOUNTING', () => {
    it('darf Rechnungen finalisieren', () => {
      expect(roleHasPermission(RoleName.ACCOUNTING, Resource.INVOICE, Action.FINALIZE)).toBe(true)
    })

    it('darf Rechnungen stornieren', () => {
      expect(roleHasPermission(RoleName.ACCOUNTING, Resource.INVOICE, Action.CANCEL)).toBe(true)
    })

    it('darf Rechnungsentwürfe löschen', () => {
      expect(roleHasPermission(RoleName.ACCOUNTING, Resource.INVOICE, Action.DELETE)).toBe(true)
    })

    it('darf Zahlungen erfassen', () => {
      expect(roleHasPermission(RoleName.ACCOUNTING, Resource.PAYMENT, Action.CREATE)).toBe(true)
    })

    it('darf Zahlungen löschen', () => {
      expect(roleHasPermission(RoleName.ACCOUNTING, Resource.PAYMENT, Action.DELETE)).toBe(true)
    })

    it('darf Audit-Log lesen', () => {
      expect(roleHasPermission(RoleName.ACCOUNTING, Resource.AUDIT_LOG, Action.READ)).toBe(true)
    })

    it('darf KEINE Benutzer verwalten', () => {
      expect(roleHasPermission(RoleName.ACCOUNTING, Resource.USER, Action.CREATE)).toBe(false)
    })

    it('darf KEINE Einstellungen ändern', () => {
      expect(roleHasPermission(RoleName.ACCOUNTING, Resource.SETTINGS, Action.UPDATE)).toBe(false)
    })
  })

  // ── EMPLOYEE: Nur eigene Leistungen ─────────────────────────

  describe('EMPLOYEE', () => {
    it('darf Leistungen erstellen', () => {
      expect(roleHasPermission(RoleName.EMPLOYEE, Resource.SERVICE_REPORT, Action.CREATE)).toBe(true)
    })

    it('darf Aufträge lesen', () => {
      expect(roleHasPermission(RoleName.EMPLOYEE, Resource.ORDER, Action.READ)).toBe(true)
    })

    it('darf KEINE Kunden bearbeiten', () => {
      expect(roleHasPermission(RoleName.EMPLOYEE, Resource.CUSTOMER, Action.UPDATE)).toBe(false)
    })

    it('darf KEINE Rechnungen lesen', () => {
      expect(roleHasPermission(RoleName.EMPLOYEE, Resource.INVOICE, Action.READ)).toBe(false)
    })

    it('darf KEINE Zahlungen erfassen', () => {
      expect(roleHasPermission(RoleName.EMPLOYEE, Resource.PAYMENT, Action.CREATE)).toBe(false)
    })

    it('darf KEINE Angebote erstellen', () => {
      expect(roleHasPermission(RoleName.EMPLOYEE, Resource.OFFER, Action.CREATE)).toBe(false)
    })

    it('darf KEINE Einstellungen sehen', () => {
      expect(roleHasPermission(RoleName.EMPLOYEE, Resource.SETTINGS, Action.READ)).toBe(false)
    })
  })

  // ── OFFICE: Büro-Tätigkeiten ─────────────────────────────────

  describe('OFFICE', () => {
    it('darf Kunden anlegen', () => {
      expect(roleHasPermission(RoleName.OFFICE, Resource.CUSTOMER, Action.CREATE)).toBe(true)
    })

    it('darf Angebote erstellen', () => {
      expect(roleHasPermission(RoleName.OFFICE, Resource.OFFER, Action.CREATE)).toBe(true)
    })

    it('darf Aufträge anlegen', () => {
      expect(roleHasPermission(RoleName.OFFICE, Resource.ORDER, Action.CREATE)).toBe(true)
    })

    it('darf KEINE Rechnungen finalisieren', () => {
      expect(roleHasPermission(RoleName.OFFICE, Resource.INVOICE, Action.FINALIZE)).toBe(false)
    })

    it('darf Rechnungsentwürfe löschen', () => {
      expect(roleHasPermission(RoleName.OFFICE, Resource.INVOICE, Action.DELETE)).toBe(true)
    })

    it('darf KEINE Zahlungen erfassen', () => {
      expect(roleHasPermission(RoleName.OFFICE, Resource.PAYMENT, Action.CREATE)).toBe(false)
    })
  })

  // ── PROJECT_MANAGER ──────────────────────────────────────────

  describe('PROJECT_MANAGER', () => {
    it('darf Aufträge verwalten', () => {
      expect(roleHasPermission(RoleName.PROJECT_MANAGER, Resource.ORDER, Action.UPDATE)).toBe(true)
    })

    it('darf Leistungen erfassen', () => {
      expect(roleHasPermission(RoleName.PROJECT_MANAGER, Resource.SERVICE_REPORT, Action.CREATE)).toBe(true)
    })

    it('darf KEINE Rechnungen finalisieren', () => {
      expect(roleHasPermission(RoleName.PROJECT_MANAGER, Resource.INVOICE, Action.FINALIZE)).toBe(false)
    })
  })

  // ── Sicherheits-Negativtests ─────────────────────────────────

  describe('Sicherheit — kritische Aktionen nur für berechtigte Rollen', () => {
    const NON_ACCOUNTING = [
      RoleName.OFFICE,
      RoleName.PROJECT_MANAGER,
      RoleName.EMPLOYEE,
    ]

    it.each(NON_ACCOUNTING)('%s darf keine Rechnung finalisieren', (role) => {
      expect(roleHasPermission(role, Resource.INVOICE, Action.FINALIZE)).toBe(false)
    })

    it.each(NON_ACCOUNTING)('%s darf keine Rechnung stornieren', (role) => {
      expect(roleHasPermission(role, Resource.INVOICE, Action.CANCEL)).toBe(false)
    })

    it.each([RoleName.PROJECT_MANAGER, RoleName.EMPLOYEE])(
      '%s darf keine Rechnungsentwürfe löschen',
      (role) => {
        expect(roleHasPermission(role, Resource.INVOICE, Action.DELETE)).toBe(false)
      },
    )

    const NON_ADMIN = [
      RoleName.OFFICE,
      RoleName.PROJECT_MANAGER,
      RoleName.EMPLOYEE,
      RoleName.ACCOUNTING,
    ]

    it.each(NON_ADMIN)('%s darf Benutzer nicht verwalten', (role) => {
      expect(roleHasPermission(role, Resource.USER, Action.CREATE)).toBe(false)
      expect(roleHasPermission(role, Resource.USER, Action.DELETE)).toBe(false)
    })

    it.each(NON_ADMIN)('%s darf Einstellungen nicht ändern', (role) => {
      expect(roleHasPermission(role, Resource.SETTINGS, Action.UPDATE)).toBe(false)
    })
  })
})
