// lib/services/customer.service.ts
import { prisma }       from '@/lib/db/prisma'
import { writeAuditLog, buildAuditLogCreate } from '@/lib/services/audit.service'
import { AuditAction }  from '@/types/enums'
import type { CustomerCreateInput, CustomerUpdateInput } from '@/lib/validators/customer.schema'
import { NotFoundError, BusinessRuleError } from '@/lib/auth/permissions'

// ── Types ────────────────────────────────────────────────────

export interface CustomerListParams {
  search?:   string
  page?:     number
  pageSize?: number
  sort?:     'name' | 'number' | 'city' | 'createdAt'
  order?:    'asc' | 'desc'
}

export interface CustomerListResult {
  customers:  CustomerListItem[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}

export interface CustomerListItem {
  id:           string
  number:       string
  name:         string
  legalForm:    string | null
  city:         string | null
  country:      string
  email:        string | null
  phone:        string | null
  isActive:     boolean
  contactCount: number
  offerCount:   number
  orderCount:   number
  invoiceCount: number
  createdAt:    Date
}

// ── Generate customer number ─────────────────────────────────

async function nextCustomerNumber(): Promise<string> {
  const last = await prisma.customer.findFirst({
    where:   { number: { startsWith: 'KD-' } },
    orderBy: { number: 'desc' },
    select:  { number: true },
  })
  const lastNum = last ? parseInt(last.number.replace('KD-', ''), 10) : 0
  return `KD-${String(lastNum + 1).padStart(4, '0')}`
}

// ── LIST ─────────────────────────────────────────────────────

export async function getCustomers(params: CustomerListParams = {}): Promise<CustomerListResult> {
  const {
    search   = '',
    page     = 1,
    pageSize = 25,
    sort     = 'createdAt',
    order    = 'desc',
  } = params

  const where = {
    deletedAt: null,
    ...(search && {
      OR: [
        { name:      { contains: search, mode: 'insensitive' as const } },
        { legalName: { contains: search, mode: 'insensitive' as const } },
        { number:    { contains: search, mode: 'insensitive' as const } },
        { city:      { contains: search, mode: 'insensitive' as const } },
        { email:     { contains: search, mode: 'insensitive' as const } },
      ],
    }),
  }

  const [raw, total] = await Promise.all([
    prisma.customer.findMany({
      where,
      orderBy: { [sort]: order },
      skip:    (page - 1) * pageSize,
      take:    pageSize,
      select: {
        id:        true,
        number:    true,
        name:      true,
        legalForm: true,
        city:      true,
        country:   true,
        email:     true,
        phone:     true,
        isActive:  true,
        createdAt: true,
        _count: {
          select: {
            contacts: { where: { deletedAt: null } },
            offers:   { where: { deletedAt: null } },
            orders:   { where: { deletedAt: null } },
            invoices: true,
          },
        },
      },
    }),
    prisma.customer.count({ where }),
  ])

  return {
    customers: raw.map((c) => ({
      id:           c.id,
      number:       c.number,
      name:         c.name,
      legalForm:    c.legalForm,
      city:         c.city,
      country:      c.country,
      email:        c.email,
      phone:        c.phone,
      isActive:     c.isActive,
      contactCount: c._count.contacts,
      offerCount:   c._count.offers,
      orderCount:   c._count.orders,
      invoiceCount: c._count.invoices,
      createdAt:    c.createdAt,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

// ── GET BY ID ────────────────────────────────────────────────

export async function getCustomerById(id: string) {
  const customer = await prisma.customer.findUnique({
    where:   { id, deletedAt: null },
    include: {
      contacts: {
        where:   { deletedAt: null },
        orderBy: [{ isPrimary: 'desc' }, { lastName: 'asc' }],
      },
      _count: {
        select: {
          offers:   { where: { deletedAt: null } },
          orders:   { where: { deletedAt: null } },
          invoices: true,
        },
      },
    },
  })

  if (!customer) throw new NotFoundError('Kunde nicht gefunden')
  return customer
}

// ── CREATE ───────────────────────────────────────────────────

export async function createCustomer(
  data:      CustomerCreateInput,
  userId:    string,
  userEmail: string,
): Promise<string> {
  const number = await nextCustomerNumber()
  const {
    contactSalutation,
    contactFirstName,
    contactLastName,
    contactDepartment,
    ...customerData
  } = data
  const hasContact = Boolean(
    contactSalutation || contactFirstName || contactLastName || contactDepartment,
  )

  const customer = await prisma.$transaction(async (tx) => {
    const c = await tx.customer.create({
      data: {
        ...customerData,
        number,
        ...(hasContact && {
          contacts: {
            create: {
              salutation: contactSalutation,
              firstName: contactFirstName ?? '',
              lastName: contactLastName ?? '',
              position: contactDepartment,
              isPrimary: true,
            },
          },
        }),
      },
    })

    await buildAuditLogCreate({
      userId,
      userEmail,
      action:     AuditAction.CREATE,
      entityType: 'customer',
      entityId:   c.id,
      newValue:   { number: c.number, name: c.name },
    })

    return c
  })

  return customer.id
}

// ── UPDATE ───────────────────────────────────────────────────

export async function updateCustomer(
  id:        string,
  data:      CustomerUpdateInput,
  userId:    string,
  userEmail: string,
): Promise<void> {
  const existing = await prisma.customer.findUnique({
    where: { id, deletedAt: null },
    include: {
      contacts: {
        where: { deletedAt: null },
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
        take: 1,
      },
    },
  })
  if (!existing) throw new NotFoundError('Kunde nicht gefunden')
  const {
    contactSalutation,
    contactFirstName,
    contactLastName,
    contactDepartment,
    ...customerData
  } = data
  const hasContact = Boolean(
    contactSalutation || contactFirstName || contactLastName || contactDepartment,
  )
  const primaryContact = existing.contacts[0]

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id },
      data: customerData,
    })
    if (primaryContact && hasContact) {
      await tx.contact.update({
        where: { id: primaryContact.id },
        data: {
          salutation: contactSalutation,
          firstName: contactFirstName ?? '',
          lastName: contactLastName ?? '',
          position: contactDepartment,
          isPrimary: true,
        },
      })
    } else if (!primaryContact && hasContact) {
      await tx.contact.create({
        data: {
          customerId: id,
          salutation: contactSalutation,
          firstName: contactFirstName ?? '',
          lastName: contactLastName ?? '',
          position: contactDepartment,
          isPrimary: true,
        },
      })
    } else if (primaryContact && !hasContact) {
      await tx.contact.update({
        where: { id: primaryContact.id },
        data: { deletedAt: new Date(), isPrimary: false },
      })
    }

    await buildAuditLogCreate({
      userId,
      userEmail,
      action:     AuditAction.UPDATE,
      entityType: 'customer',
      entityId:   id,
      oldValue:   { name: existing.name, email: existing.email, city: existing.city },
      newValue:   { name: customerData.name, email: customerData.email, city: customerData.city },
    })
  })
}

// ── SOFT DELETE ──────────────────────────────────────────────

export function canDeleteCustomerInEnvironment(
  activeInvoiceCount: number,
  activeOrderCount: number,
  nodeEnv: string | undefined,
): boolean {
  if (nodeEnv === 'development') return true
  return activeInvoiceCount === 0 && activeOrderCount === 0
}

export async function deleteCustomer(
  id:        string,
  userId:    string,
  userEmail: string,
): Promise<void> {
  const existing = await prisma.customer.findUnique({
    where:  { id, deletedAt: null },
    select: {
      id:   true,
      name: true,
      _count: {
        select: {
          invoices: { where: { status: { not: 'CANCELLED' } } },
          orders:   { where: { status: { not: 'CANCELLED' }, deletedAt: null } },
        },
      },
    },
  })

  if (!existing) throw new NotFoundError('Kunde nicht gefunden')

  // Blockieren wenn offene Aufträge oder aktive Rechnungen existieren
  if (!canDeleteCustomerInEnvironment(
    existing._count.invoices,
    existing._count.orders,
    process.env.NODE_ENV,
  )) {
    throw new BusinessRuleError(
      'Kunde kann nicht gelöscht werden: Es existieren noch aktive Aufträge oder Rechnungen.',
    )
  }

  await prisma.$transaction(async (tx) => {
    await tx.customer.update({
      where: { id },
      data:  { deletedAt: new Date(), isActive: false },
    })

    await buildAuditLogCreate({
      userId,
      userEmail,
      action:     AuditAction.DELETE,
      entityType: 'customer',
      entityId:   id,
      oldValue:   { name: existing.name },
    })
  })
}
