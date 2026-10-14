import { Action, hasPermission, Resource } from '@/lib/auth/permissions'
import { prisma } from '@/lib/db/prisma'
import { berlinMonthStartInstant } from '@/lib/utils/berlin-date'

export async function getDashboardStats() {
  // Monatsbeginn nach Berliner Geschäftskalender (00:00 Uhr Europe/Berlin), nicht nach der Prozess-Zeitzone.
  const start = berlinMonthStartInstant()

  const [
    canReadOffers,
    canReadOrders,
    canReadInvoices,
    canReadCustomers,
    canReadAuditLog,
  ] = await Promise.all([
    hasPermission(Resource.OFFER, Action.READ),
    hasPermission(Resource.ORDER, Action.READ),
    hasPermission(Resource.INVOICE, Action.READ),
    hasPermission(Resource.CUSTOMER, Action.READ),
    hasPermission(Resource.AUDIT_LOG, Action.READ),
  ])

  const [
    openOffers,
    openOrders,
    draftInvoices,
    overdueInvoices,
    totalCustomers,
    recentActivity,
    monthlyInvoicedGross,
  ] = await Promise.all([
    canReadOffers ? prisma.offer.count({
      where: { status: { in: ['DRAFT', 'SENT'] }, deletedAt: null },
    }) : null,
    canReadOrders ? prisma.order.count({
      where: { status: { in: ['OPEN', 'IN_PROGRESS'] }, deletedAt: null },
    }) : null,
    canReadInvoices ? prisma.invoice.count({
      where: { status: 'DRAFT' },
    }) : null,
    canReadInvoices ? prisma.invoice.count({
      where: { status: 'OVERDUE' },
    }) : null,
    canReadCustomers ? prisma.customer.count({
      where: { deletedAt: null, isActive: true },
    }) : null,
    canReadAuditLog ? prisma.auditLog.findMany({
      where:   { action: { in: ['CREATE', 'FINALIZE', 'STATUS_CHANGE'] } },
      orderBy: { createdAt: 'desc' },
      take:    8,
      include: { user: { select: { firstName: true, lastName: true } } },
    }) : null,
    canReadInvoices ? prisma.invoice.aggregate({
      where: {
        finalizedAt: { gte: start },
        status: { in: ['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'PAID'] },
      },
      _sum: { totalGross: true },
    }) : null,
  ])

  return {
    openOffers,
    openOrders,
    draftInvoices,
    overdueInvoices,
    totalCustomers,
    recentActivity,
    monthlyInvoicedGross: monthlyInvoicedGross
      ? monthlyInvoicedGross._sum.totalGross?.toNumber() ?? 0
      : null,
  }
}
