import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleName } from '@/types/enums'

const authState = vi.hoisted(() => ({
  granted: new Set<string>(),
  session: null as null | {
    user: { id: string; email: string; name: string; role: string }
  },
  hasPermission: vi.fn(),
  getServerSession: vi.fn(),
}))

const db = vi.hoisted(() => ({
  offerCount: vi.fn(),
  orderCount: vi.fn(),
  invoiceCount: vi.fn(),
  invoiceAggregate: vi.fn(),
  customerCount: vi.fn(),
  auditFindMany: vi.fn(),
}))

vi.mock('next-auth', () => ({
  getServerSession: authState.getServerSession,
}))

vi.mock('@/lib/auth/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/permissions')>()
  authState.hasPermission.mockImplementation(
    async (resource: typeof actual.Resource[keyof typeof actual.Resource], action: typeof actual.Action[keyof typeof actual.Action]) =>
      authState.granted.has(`${resource}:${action}`),
  )
  return { ...actual, hasPermission: authState.hasPermission }
})

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    offer:   { count: db.offerCount },
    order:   { count: db.orderCount },
    invoice: { count: db.invoiceCount, aggregate: db.invoiceAggregate },
    customer: { count: db.customerCount },
    auditLog: { findMany: db.auditFindMany },
  },
}))

import {
  Action,
  Resource,
  UnauthorizedError,
  roleHasPermission,
} from '@/lib/auth/permissions'
import { getDashboardStats } from '@/lib/services/dashboard.service'
import DashboardPage from '@/app/(dashboard)/page'

const resources = [
  Resource.OFFER,
  Resource.ORDER,
  Resource.INVOICE,
  Resource.CUSTOMER,
  Resource.AUDIT_LOG,
] as const

function grantRole(role: typeof RoleName[keyof typeof RoleName]) {
  for (const resource of resources) {
    if (roleHasPermission(role, resource, Action.READ)) {
      authState.granted.add(`${resource}:${Action.READ}`)
    }
  }
}

function setSuccessfulQueryResults() {
  db.offerCount.mockResolvedValue(2)
  db.orderCount.mockResolvedValue(3)
  db.invoiceCount
    .mockResolvedValueOnce(4)
    .mockResolvedValueOnce(5)
  db.customerCount.mockResolvedValue(6)
  db.auditFindMany.mockResolvedValue([])
  db.invoiceAggregate.mockResolvedValue({
    _sum: { totalGross: { toNumber: () => 700 } },
  })
}

describe('ressourcenbezogene READ-Autorisierung des Dashboards', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.granted.clear()
    authState.session = {
      user: {
        id: 'user-1',
        email: 'user@example.test',
        name: 'Test User',
        role: RoleName.ADMIN,
      },
    }
    authState.getServerSession.mockImplementation(async () => authState.session)
    setSuccessfulQueryResults()
  })

  it('führt für EMPLOYEE ausschließlich die erlaubte Auftragsabfrage aus', async () => {
    grantRole(RoleName.EMPLOYEE)

    const stats = await getDashboardStats()

    expect(stats).toMatchObject({
      openOffers: null,
      openOrders: 3,
      draftInvoices: null,
      overdueInvoices: null,
      totalCustomers: null,
      recentActivity: null,
      monthlyInvoicedGross: null,
    })
    expect(db.orderCount).toHaveBeenCalledTimes(1)
    expect(db.offerCount).not.toHaveBeenCalled()
    expect(db.invoiceCount).not.toHaveBeenCalled()
    expect(db.invoiceAggregate).not.toHaveBeenCalled()
    expect(db.customerCount).not.toHaveBeenCalled()
    expect(db.auditFindMany).not.toHaveBeenCalled()
  })

  it.each([
    RoleName.ADMIN,
    RoleName.OFFICE,
    RoleName.PROJECT_MANAGER,
    RoleName.EMPLOYEE,
    RoleName.ACCOUNTING,
  ])('fragt für %s genau die laut Matrix lesbaren Ressourcen ab', async (role) => {
    grantRole(role)

    await getDashboardStats()

    expect(db.offerCount).toHaveBeenCalledTimes(
      roleHasPermission(role, Resource.OFFER, Action.READ) ? 1 : 0,
    )
    expect(db.orderCount).toHaveBeenCalledTimes(
      roleHasPermission(role, Resource.ORDER, Action.READ) ? 1 : 0,
    )
    expect(db.invoiceCount).toHaveBeenCalledTimes(
      roleHasPermission(role, Resource.INVOICE, Action.READ) ? 2 : 0,
    )
    expect(db.invoiceAggregate).toHaveBeenCalledTimes(
      roleHasPermission(role, Resource.INVOICE, Action.READ) ? 1 : 0,
    )
    expect(db.customerCount).toHaveBeenCalledTimes(
      roleHasPermission(role, Resource.CUSTOMER, Action.READ) ? 1 : 0,
    )
    expect(db.auditFindMany).toHaveBeenCalledTimes(
      roleHasPermission(role, Resource.AUDIT_LOG, Action.READ) ? 1 : 0,
    )
  })

  it('prüft jedes Ressourcenrecht vor der zugehörigen Datenabfrage', async () => {
    grantRole(RoleName.ADMIN)

    await getDashboardStats()

    const permissionOrder = (resource: typeof resources[number]) => {
      const callIndex = authState.hasPermission.mock.calls.findIndex(
        ([calledResource, calledAction]) =>
          calledResource === resource && calledAction === Action.READ,
      )
      return authState.hasPermission.mock.invocationCallOrder[callIndex]
    }

    expect(permissionOrder(Resource.OFFER))
      .toBeLessThan(db.offerCount.mock.invocationCallOrder[0])
    expect(permissionOrder(Resource.ORDER))
      .toBeLessThan(db.orderCount.mock.invocationCallOrder[0])
    expect(permissionOrder(Resource.INVOICE))
      .toBeLessThan(db.invoiceCount.mock.invocationCallOrder[0])
    expect(permissionOrder(Resource.INVOICE))
      .toBeLessThan(db.invoiceAggregate.mock.invocationCallOrder[0])
    expect(permissionOrder(Resource.CUSTOMER))
      .toBeLessThan(db.customerCount.mock.invocationCallOrder[0])
    expect(permissionOrder(Resource.AUDIT_LOG))
      .toBeLessThan(db.auditFindMany.mock.invocationCallOrder[0])
  })

  it('beendet einen unangemeldeten Seitenzugriff vor allen Dashboard-Abfragen', async () => {
    authState.session = null

    await expect(DashboardPage()).rejects.toBeInstanceOf(UnauthorizedError)

    expect(authState.hasPermission).not.toHaveBeenCalled()
    expect(db.offerCount).not.toHaveBeenCalled()
    expect(db.orderCount).not.toHaveBeenCalled()
    expect(db.invoiceCount).not.toHaveBeenCalled()
    expect(db.invoiceAggregate).not.toHaveBeenCalled()
    expect(db.customerCount).not.toHaveBeenCalled()
    expect(db.auditFindMany).not.toHaveBeenCalled()
  })
})
