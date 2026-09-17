import { beforeEach, describe, expect, it, vi } from 'vitest'
import React from 'react'
import type { RoleName as RoleNameType } from '@/types/enums'
import { RoleName } from '@/types/enums'

vi.stubGlobal('React', React)

const authState = vi.hoisted(() => ({
  role: null as RoleNameType | null,
  requirePagePermission: vi.fn(),
  hasPermission: vi.fn(),
  getServerSession: vi.fn(),
}))

const queries = vi.hoisted(() => ({
  getCustomers: vi.fn(),
  getCustomerById: vi.fn(),
  getOffers: vi.fn(),
  getOfferById: vi.fn(),
  getInvoices: vi.fn(),
  getInvoiceById: vi.fn(),
  getInvoicePayments: vi.fn(),
  getDunningNoticesForInvoice: vi.fn(),
}))

vi.mock('next-auth', () => ({
  getServerSession: authState.getServerSession,
}))

vi.mock('@/lib/auth/permissions', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/auth/permissions')>()

  authState.requirePagePermission.mockImplementation(
    async (resource: typeof actual.Resource[keyof typeof actual.Resource], action: typeof actual.Action[keyof typeof actual.Action]) => {
      if (!authState.role) throw new actual.UnauthorizedError()
      if (!actual.roleHasPermission(authState.role, resource, action)) {
        throw new actual.ForbiddenError()
      }
      return {
        userId: 'test-user',
        userEmail: 'test@example.test',
        role: authState.role,
      }
    },
  )

  return {
    ...actual,
    requirePagePermission: authState.requirePagePermission,
    hasPermission: authState.hasPermission,
  }
})

vi.mock('@/lib/services/customer.service', () => ({
  getCustomers: queries.getCustomers,
  getCustomerById: queries.getCustomerById,
}))

vi.mock('@/lib/services/offer.service', () => ({
  getOffers: queries.getOffers,
  getOfferById: queries.getOfferById,
}))

vi.mock('@/lib/services/invoice-query.service', () => ({
  getInvoices: queries.getInvoices,
  getInvoiceById: queries.getInvoiceById,
  getInvoicePayments: queries.getInvoicePayments,
}))

vi.mock('@/lib/services/dunning.service', () => ({
  getDunningNoticesForInvoice: queries.getDunningNoticesForInvoice,
}))

import {
  Action,
  ForbiddenError,
  Resource,
  roleHasPermission,
  UnauthorizedError,
} from '@/lib/auth/permissions'
import CustomersPage from '@/app/(dashboard)/customers/page'
import CustomerDetailPage, {
  generateMetadata as generateCustomerMetadata,
} from '@/app/(dashboard)/customers/[id]/page'
import {
  generateMetadata as generateEditCustomerMetadata,
} from '@/app/(dashboard)/customers/[id]/edit/page'
import OffersPage from '@/app/(dashboard)/offers/page'
import OfferDetailPage, {
  generateMetadata as generateOfferMetadata,
} from '@/app/(dashboard)/offers/[id]/page'
import {
  generateMetadata as generateEditOfferMetadata,
} from '@/app/(dashboard)/offers/[id]/edit/page'
import InvoicesPage from '@/app/(dashboard)/invoices/page'
import InvoiceDetailPage, {
  generateMetadata as generateInvoiceMetadata,
} from '@/app/(dashboard)/invoices/[id]/page'
import {
  generateMetadata as generateEditInvoiceMetadata,
} from '@/app/(dashboard)/invoices/[id]/edit/page'

type ProtectedEntry = {
  name: string
  resource: typeof Resource[keyof typeof Resource]
  query: ReturnType<typeof vi.fn>
  invoke: () => Promise<unknown>
}

const protectedPages: ProtectedEntry[] = [
  {
    name: 'Kundenliste',
    resource: Resource.CUSTOMER,
    query: queries.getCustomers,
    invoke: () => CustomersPage({ searchParams: Promise.resolve({}) }),
  },
  {
    name: 'Kundendetails',
    resource: Resource.CUSTOMER,
    query: queries.getCustomerById,
    invoke: () => CustomerDetailPage({ params: Promise.resolve({ id: 'customer-1' }) }),
  },
  {
    name: 'Angebotsliste',
    resource: Resource.OFFER,
    query: queries.getOffers,
    invoke: () => OffersPage({ searchParams: Promise.resolve({}) }),
  },
  {
    name: 'Angebotsdetails',
    resource: Resource.OFFER,
    query: queries.getOfferById,
    invoke: () => OfferDetailPage({ params: Promise.resolve({ id: 'offer-1' }) }),
  },
  {
    name: 'Rechnungsliste',
    resource: Resource.INVOICE,
    query: queries.getInvoices,
    invoke: () => InvoicesPage({ searchParams: Promise.resolve({}) }),
  },
  {
    name: 'Rechnungsdetails',
    resource: Resource.INVOICE,
    query: queries.getInvoiceById,
    invoke: () => InvoiceDetailPage({ params: Promise.resolve({ id: 'invoice-1' }) }),
  },
]

const protectedMetadata: ProtectedEntry[] = [
  {
    name: 'Kunden-Metadaten',
    resource: Resource.CUSTOMER,
    query: queries.getCustomerById,
    invoke: () => generateCustomerMetadata({ params: Promise.resolve({ id: 'customer-1' }) }),
  },
  {
    name: 'Kunden-Bearbeitungsmetadaten',
    resource: Resource.CUSTOMER,
    query: queries.getCustomerById,
    invoke: () => generateEditCustomerMetadata({ params: Promise.resolve({ id: 'customer-1' }) }),
  },
  {
    name: 'Angebots-Metadaten',
    resource: Resource.OFFER,
    query: queries.getOfferById,
    invoke: () => generateOfferMetadata({ params: Promise.resolve({ id: 'offer-1' }) }),
  },
  {
    name: 'Angebots-Bearbeitungsmetadaten',
    resource: Resource.OFFER,
    query: queries.getOfferById,
    invoke: () => generateEditOfferMetadata({ params: Promise.resolve({ id: 'offer-1' }) }),
  },
  {
    name: 'Rechnungs-Metadaten',
    resource: Resource.INVOICE,
    query: queries.getInvoiceById,
    invoke: () => generateInvoiceMetadata({ params: Promise.resolve({ id: 'invoice-1' }) }),
  },
  {
    name: 'Rechnungs-Bearbeitungsmetadaten',
    resource: Resource.INVOICE,
    query: queries.getInvoiceById,
    invoke: () => generateEditInvoiceMetadata({ params: Promise.resolve({ id: 'invoice-1' }) }),
  },
]

const authorizedCases = protectedPages.flatMap((entry) =>
  [
    RoleName.ADMIN,
    RoleName.OFFICE,
    RoleName.PROJECT_MANAGER,
    RoleName.ACCOUNTING,
  ].map((role) => ({ ...entry, role })),
)

describe('serverseitige READ-Autorisierung der direkten Seitenzugriffe', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.role = null
    authState.hasPermission.mockImplementation(
      async (resource, action) =>
        authState.role !== null &&
        roleHasPermission(authState.role, resource, action),
    )
    authState.getServerSession.mockImplementation(async () =>
      authState.role
        ? {
            user: {
              id: 'test-user',
              email: 'test@example.test',
              name: 'Test User',
              role: authState.role,
            },
          }
        : null,
    )
    queries.getInvoicePayments.mockResolvedValue([])
    queries.getDunningNoticesForInvoice.mockResolvedValue([])
  })

  it.each(protectedPages)('blockiert EMPLOYEE vor der Abfrage: $name', async (entry) => {
    authState.role = RoleName.EMPLOYEE

    await expect(entry.invoke()).rejects.toBeInstanceOf(ForbiddenError)

    expect(authState.requirePagePermission).toHaveBeenCalledWith(entry.resource, Action.READ)
    expect(entry.query).not.toHaveBeenCalled()
  })

  it.each(protectedMetadata)('blockiert EMPLOYEE auch vor der Metadaten-Abfrage: $name', async (entry) => {
    authState.role = RoleName.EMPLOYEE

    await expect(entry.invoke()).rejects.toBeInstanceOf(ForbiddenError)

    expect(authState.requirePagePermission).toHaveBeenCalledWith(entry.resource, Action.READ)
    expect(entry.query).not.toHaveBeenCalled()
  })

  it.each(protectedPages)('blockiert unangemeldete Zugriffe vor der Abfrage: $name', async (entry) => {
    await expect(entry.invoke()).rejects.toBeInstanceOf(UnauthorizedError)

    expect(authState.requirePagePermission).toHaveBeenCalledWith(entry.resource, Action.READ)
    expect(entry.query).not.toHaveBeenCalled()
  })

  it.each(authorizedCases)('lässt $role erst nach der READ-Prüfung abfragen: $name', async (entry) => {
    authState.role = entry.role
    entry.query.mockRejectedValueOnce(new Error('query reached'))

    await expect(entry.invoke()).rejects.toBeDefined()

    expect(entry.query).toHaveBeenCalledTimes(1)
    expect(authState.requirePagePermission.mock.invocationCallOrder[0])
      .toBeLessThan(entry.query.mock.invocationCallOrder[0])
  })

  it('lädt für EMPLOYEE weder Rechnungspositionen/Zahlungen noch Mahnungen', async () => {
    authState.role = RoleName.EMPLOYEE

    await expect(
      InvoiceDetailPage({ params: Promise.resolve({ id: 'invoice-1' }) }),
    ).rejects.toBeInstanceOf(ForbiddenError)

    expect(queries.getInvoiceById).not.toHaveBeenCalled()
    expect(queries.getDunningNoticesForInvoice).not.toHaveBeenCalled()
  })

  it('liefert bei invoice:read ohne payment:read keine Zahlungsdetails', async () => {
    authState.role = RoleName.PROJECT_MANAGER
    queries.getInvoiceById.mockResolvedValue(invoiceFixture())

    await InvoiceDetailPage({ params: Promise.resolve({ id: 'invoice-1' }) })

    expect(queries.getInvoiceById).toHaveBeenCalledTimes(1)
    expect(authState.hasPermission)
      .toHaveBeenCalledWith(Resource.PAYMENT, Action.READ)
    expect(queries.getInvoicePayments).not.toHaveBeenCalled()
    expect(queries.getDunningNoticesForInvoice).not.toHaveBeenCalled()
  })

  it('lädt Zahlungsdetails für eine payment:read-berechtigte Rolle erst nach der Prüfung', async () => {
    authState.role = RoleName.ACCOUNTING
    queries.getInvoiceById.mockResolvedValue(invoiceFixture())

    await InvoiceDetailPage({ params: Promise.resolve({ id: 'invoice-1' }) })

    expect(queries.getInvoicePayments).toHaveBeenCalledWith('invoice-1')
    const paymentReadCall = authState.hasPermission.mock.calls.findIndex(
      ([resource, action]) =>
        resource === Resource.PAYMENT && action === Action.READ,
    )
    expect(authState.hasPermission.mock.invocationCallOrder[paymentReadCall])
      .toBeLessThan(queries.getInvoicePayments.mock.invocationCallOrder[0])
  })
})

function invoiceFixture() {
  return {
    id: 'invoice-1',
    invoiceNumber: 'RE-1',
    status: 'SENT',
    type: 'STANDARD',
    customerId: 'customer-1',
    customerSnapshot: { name: 'Testkunde' },
    companySnapshot: null,
    order: null,
    customer: { name: 'Testkunde' },
    items: [],
    totalNet: { toNumber: () => 100 },
    totalTax: { toNumber: () => 19 },
    totalGross: { toNumber: () => 119 },
    paidAmount: { toNumber: () => 20 },
    invoiceDate: new Date('2026-01-01'),
    dueDate: new Date('2026-01-15'),
    finalizedAt: new Date('2026-01-01'),
    sentAt: new Date('2026-01-02'),
    cancelledByInvoiceId: null,
    createdBy: { firstName: 'Test', lastName: 'User' },
    createdAt: new Date('2026-01-01'),
  }
}
