import { Prisma, type CustomerAddressType } from '@prisma/client'
import { prisma } from '@/lib/db/prisma'
import { AuditAction } from '@/types/enums'
import { BusinessRuleError, NotFoundError } from '@/lib/auth/permissions'
import { buildAuditLogCreate } from '@/lib/services/audit.service'
import type { AddressDataInput, CustomerAddressInput } from '@/lib/validators/customer-address.schema'

type Actor = { userId: string; userEmail: string }

const addressInclude = { address: true } as const
type CustomerAddressWithAddress = Prisma.CustomerAddressGetPayload<{ include: { address: true } }>
type FlattenedCustomerAddress = Omit<CustomerAddressWithAddress, 'address'> & CustomerAddressWithAddress['address'] & { address: CustomerAddressWithAddress['address'] }

const normalizePart = (value: string | null | undefined) => value?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('de-DE') ?? ''
export const buildAddressNormalizedKey = (input: Pick<AddressDataInput, 'companyName' | 'street' | 'houseNumber' | 'postalCode' | 'city' | 'country'>) =>
  [input.companyName, input.street, input.houseNumber, input.postalCode, input.city, input.country].map(normalizePart).join('|')

async function assertCustomer(customerId: string, db: Prisma.TransactionClient | typeof prisma = prisma) {
  const customer = await db.customer.findFirst({ where: { id: customerId, deletedAt: null }, select: { id: true } })
  if (!customer) throw new NotFoundError('Kunde nicht gefunden')
}

export function flattenCustomerAddress(assignment: CustomerAddressWithAddress): FlattenedCustomerAddress {
  return { ...assignment.address, ...assignment, address: assignment.address }
}

export async function getCustomerAddress(customerId: string, assignmentId: string, type: CustomerAddressType) {
  const assignment = await prisma.customerAddress.findFirst({
    where: { id: assignmentId, customerId, type, deletedAt: null }, include: addressInclude,
  })
  if (!assignment) throw new NotFoundError(type === 'BILLING' ? 'Rechnungsadresse nicht gefunden' : 'Lieferadresse nicht gefunden')
  return flattenCustomerAddress(assignment)
}

/**
 * Andere Kunden, die denselben globalen Adressdatensatz verwenden. Eine
 * Bearbeitung der Adressfelder wirkt sich auch auf diese Kunden aus.
 */
export async function getAddressCoUsers(addressId: string, exceptCustomerId: string) {
  const assignments = await prisma.customerAddress.findMany({
    where: { addressId, deletedAt: null, customerId: { not: exceptCustomerId } },
    select: { customer: { select: { number: true, name: true } } },
    orderBy: { customer: { number: 'asc' } },
  })
  return [...new Map(assignments.map(item => [item.customer.number, item.customer])).values()]
}

export async function searchAddresses(query: string) {
  return prisma.address.findMany({
    where: {
      OR: [
        { companyName: { contains: query, mode: 'insensitive' } },
        { street: { contains: query, mode: 'insensitive' } },
        { postalCode: { contains: query, mode: 'insensitive' } },
        { city: { contains: query, mode: 'insensitive' } },
        { customerAddresses: { some: { deletedAt: null, customer: { OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { number: { contains: query, mode: 'insensitive' } },
        ] } } } },
      ],
    },
    take: 20,
    orderBy: [{ companyName: 'asc' }, { city: 'asc' }],
    include: { customerAddresses: { where: { deletedAt: null }, take: 3, select: { customer: { select: { name: true, number: true } } } } },
  })
}

export async function findDuplicateAddress(input: AddressDataInput) {
  return prisma.address.findUnique({ where: { normalizedKey: buildAddressNormalizedKey(input) } })
}

async function clearDefault(tx: Prisma.TransactionClient, customerId: string, type: CustomerAddressType, exceptId?: string) {
  await tx.customerAddress.updateMany({
    where: { customerId, type, deletedAt: null, isActive: true, isDefault: true, ...(exceptId && { id: { not: exceptId } }) },
    data: { isDefault: false },
  })
}

export async function createAndAssignCustomerAddress(customerId: string, type: CustomerAddressType, input: CustomerAddressInput, actor: Actor) {
  return prisma.$transaction(async tx => {
    await assertCustomer(customerId, tx)
    const { label, isActive, isDefault: requestedDefault, ...addressData } = input
    const normalizedKey = buildAddressNormalizedKey(addressData)
    const duplicate = await tx.address.findUnique({ where: { normalizedKey } })
    if (duplicate) throw new BusinessRuleError(`Diese Adresse ist bereits vorhanden. Verwenden Sie die bestehende Adresse (${duplicate.id}).`)
    const address = await tx.address.create({ data: { ...addressData, normalizedKey } })
    const isDefault = isActive && requestedDefault
    if (isDefault) await clearDefault(tx, customerId, type)
    const assignment = await tx.customerAddress.create({ data: { customerId, addressId: address.id, type, label, isActive, isDefault } })
    await buildAuditLogCreate(tx, { ...actor, action: AuditAction.CREATE, entityType: 'address', entityId: address.id, newValue: { companyName: address.companyName, city: address.city } })
    await buildAuditLogCreate(tx, { ...actor, action: AuditAction.CREATE, entityType: 'customer_address', entityId: assignment.id, newValue: { customerId, addressId: address.id, type, label } })
    return flattenCustomerAddress({ ...assignment, address })
  })
}

export async function assignExistingCustomerAddress(customerId: string, addressId: string, type: CustomerAddressType, label: string, actor: Actor) {
  return prisma.$transaction(async tx => {
    await assertCustomer(customerId, tx)
    const address = await tx.address.findUnique({ where: { id: addressId }, select: { id: true } })
    if (!address) throw new NotFoundError('Adresse nicht gefunden')
    const existing = await tx.customerAddress.findUnique({ where: { customerId_addressId_type: { customerId, addressId, type } } })
    if (existing && !existing.deletedAt) throw new BusinessRuleError('Diese Adresse ist dem Kunden bereits für diesen Zweck zugeordnet.')
    const assignment = existing
      ? await tx.customerAddress.update({ where: { id: existing.id }, data: { label, deletedAt: null, isActive: true, isDefault: false } })
      : await tx.customerAddress.create({ data: { customerId, addressId, type, label } })
    await buildAuditLogCreate(tx, { ...actor, action: AuditAction.CREATE, entityType: 'customer_address', entityId: assignment.id, newValue: { customerId, addressId, type, label } })
    return assignment
  })
}

export async function updateCustomerAddress(customerId: string, assignmentId: string, type: CustomerAddressType, input: CustomerAddressInput, actor: Actor) {
  const existing = await getCustomerAddress(customerId, assignmentId, type)
  return prisma.$transaction(async tx => {
    const { label, isActive, isDefault: requestedDefault, ...addressData } = input
    const isDefault = isActive && requestedDefault
    if (isDefault) await clearDefault(tx, customerId, type, assignmentId)
    await tx.address.update({ where: { id: existing.addressId }, data: { ...addressData, normalizedKey: buildAddressNormalizedKey(addressData) } })
    const assignment = await tx.customerAddress.update({ where: { id: assignmentId }, data: { label, isActive, isDefault } })
    await buildAuditLogCreate(tx, { ...actor, action: AuditAction.UPDATE, entityType: 'address', entityId: existing.addressId, oldValue: { companyName: existing.companyName, city: existing.city }, newValue: { companyName: addressData.companyName, city: addressData.city } })
    await buildAuditLogCreate(tx, { ...actor, action: AuditAction.UPDATE, entityType: 'customer_address', entityId: assignmentId, oldValue: { label: existing.label, isActive: existing.isActive, isDefault: existing.isDefault }, newValue: { label, isActive, isDefault } })
    return assignment
  })
}

export async function setDefaultCustomerAddress(customerId: string, assignmentId: string, type: CustomerAddressType, actor: Actor) {
  const existing = await getCustomerAddress(customerId, assignmentId, type)
  if (!existing.isActive) throw new BusinessRuleError('Eine inaktive Adresse kann nicht Standard sein.')
  await prisma.$transaction(async tx => {
    await clearDefault(tx, customerId, type)
    await tx.customerAddress.update({ where: { id: assignmentId }, data: { isDefault: true } })
    await buildAuditLogCreate(tx, { ...actor, action: AuditAction.UPDATE, entityType: 'customer_address', entityId: assignmentId, newValue: { customerId, addressId: existing.addressId, type, isDefault: true } })
  })
}

export async function setCustomerAddressActive(customerId: string, assignmentId: string, type: CustomerAddressType, isActive: boolean, actor: Actor) {
  const existing = await getCustomerAddress(customerId, assignmentId, type)
  await prisma.$transaction(async tx => {
    const assignment = await tx.customerAddress.update({ where: { id: assignmentId }, data: { isActive, ...(!isActive && { isDefault: false }) } })
    await buildAuditLogCreate(tx, { ...actor, action: AuditAction.UPDATE, entityType: 'customer_address', entityId: assignmentId, oldValue: { isActive: existing.isActive, isDefault: existing.isDefault }, newValue: { isActive: assignment.isActive, isDefault: assignment.isDefault } })
  })
}

export async function removeCustomerAddress(customerId: string, assignmentId: string, type: CustomerAddressType, actor: Actor) {
  const existing = await getCustomerAddress(customerId, assignmentId, type)
  await prisma.$transaction(async tx => {
    await tx.customerAddress.update({ where: { id: assignmentId }, data: { deletedAt: new Date(), isActive: false, isDefault: false } })
    await buildAuditLogCreate(tx, { ...actor, action: AuditAction.DELETE, entityType: 'customer_address', entityId: assignmentId, oldValue: { customerId, addressId: existing.addressId, type, label: existing.label } })
  })
}
