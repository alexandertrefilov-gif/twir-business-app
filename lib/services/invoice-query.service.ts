// lib/services/invoice-query.service.ts
//
// READ-ONLY Abfragen für Rechnungen.
// SCHREIB-Funktionen (create, finalize, cancel) bleiben in invoice.service.ts (Phase 2).
// Diese Trennung schützt die kritische Finalisierungslogik vor unbeabsichtigten Änderungen.

import { prisma }     from '@/lib/db/prisma'
import { Prisma }     from '@prisma/client'
import { NotFoundError } from '@/lib/auth/permissions'
import type { InvoiceStatus } from '@/types/enums'

// ── Types ──────────────────────────────────────────────────────

export interface InvoiceListParams {
  search?:     string
  status?:     string
  customerId?: string
  orderId?:    string
  page?:       number
  pageSize?:   number
  sort?:       'invoiceDate' | 'invoiceNumber' | 'totalGross' | 'dueDate' | 'status'
  order?:      'asc' | 'desc'
}

export interface InvoiceListItem {
  id:            string
  invoiceNumber: string | null
  status:        string
  type:          string
  customerId:    string
  customerName:  string
  orderId:       string | null
  invoiceDate:   Date
  dueDate:       Date | null
  totalGross:    number
  paidAmount:    number
  remainingAmount: number
  finalizedAt:   Date | null
  createdAt:     Date
}

export interface InvoiceListResult {
  invoices:   InvoiceListItem[]
  total:      number
  page:       number
  pageSize:   number
  totalPages: number
}

// ── LIST ───────────────────────────────────────────────────────

export async function getInvoices(
  params: InvoiceListParams = {},
): Promise<InvoiceListResult> {
  const {
    search    = '',
    status,
    customerId,
    orderId,
    page      = 1,
    pageSize  = 25,
    sort      = 'invoiceDate',
    order     = 'desc',
  } = params

  const where: Prisma.InvoiceWhereInput = {
    ...(status     && { status: status as InvoiceStatus }),
    ...(customerId && { customerId }),
    ...(orderId    && { orderId }),
    ...(search && {
      OR: [
        { invoiceNumber: { contains: search, mode: 'insensitive' } },
        { customer:      { name: { contains: search, mode: 'insensitive' } } },
      ],
    }),
  }

  const [raw, total] = await Promise.all([
    prisma.invoice.findMany({
      where,
      orderBy: sort === 'invoiceNumber'
        ? { invoiceNumber: order }
        : { [sort]: order },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id:            true,
        invoiceNumber: true,
        status:        true,
        type:          true,
        customerId:    true,
        orderId:       true,
        invoiceDate:   true,
        dueDate:       true,
        totalGross:    true,
        paidAmount:    true,
        finalizedAt:   true,
        createdAt:     true,
        customer:      { select: { name: true } },
      },
    }),
    prisma.invoice.count({ where }),
  ])

  return {
    invoices: raw.map((inv) => {
      const totalGross = inv.totalGross.toNumber()
      const paidAmount = inv.paidAmount.toNumber()
      return {
        id:             inv.id,
        invoiceNumber:  inv.invoiceNumber,
        status:         inv.status,
        type:           inv.type,
        customerId:     inv.customerId,
        customerName:   inv.customer.name,
        orderId:        inv.orderId,
        invoiceDate:    inv.invoiceDate,
        dueDate:        inv.dueDate,
        totalGross,
        paidAmount,
        remainingAmount: Math.round((totalGross - paidAmount) * 100) / 100,
        finalizedAt:    inv.finalizedAt,
        createdAt:      inv.createdAt,
      }
    }),
    total,
    page,
    pageSize,
    totalPages: Math.ceil(total / pageSize),
  }
}

// ── GET BY ID ──────────────────────────────────────────────────

export async function getInvoiceById(id: string) {
  const invoice = await prisma.invoice.findUnique({
    where: { id },
    include: {
      customer:  true,
      order:     { select: { id: true, orderNumber: true, title: true } },
      items:     { orderBy: { position: 'asc' } },
      createdBy: { select: { firstName: true, lastName: true } },
    },
  })

  if (!invoice) throw new NotFoundError('Rechnung nicht gefunden')
  return invoice
}

export async function getInvoicePayments(invoiceId: string) {
  return prisma.payment.findMany({
    where:   { invoiceId, deletedAt: null },
    orderBy: { paymentDate: 'asc' },
  })
}

// ── DASHBOARD SUMMARY ─────────────────────────────────────────

export async function getInvoiceSummary() {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const [
    totalOpen,
    totalOverdue,
    totalThisMonth,
    recentInvoices,
  ] = await Promise.all([
    // Offene Rechnungssumme
    prisma.invoice.aggregate({
      where: { status: { in: ['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'OVERDUE'] } },
      _sum:  { totalGross: true, paidAmount: true },
    }),
    // Überfällige Rechnungen
    prisma.invoice.count({
      where: { status: 'OVERDUE' },
    }),
    // Umsatz diesen Monat
    prisma.invoice.aggregate({
      where: {
        finalizedAt: {
          gte: new Date(today.getFullYear(), today.getMonth(), 1),
        },
        status: { in: ['FINALIZED', 'SENT', 'PARTIALLY_PAID', 'PAID'] },
      },
      _sum: { totalGross: true },
    }),
    // Letzte Rechnungen
    prisma.invoice.findMany({
      where:   { status: { not: 'DRAFT' } },
      orderBy: { invoiceDate: 'desc' },
      take:    5,
      select: {
        id:            true,
        invoiceNumber: true,
        status:        true,
        totalGross:    true,
        customer:      { select: { name: true } },
      },
    }),
  ])

  const openGross = totalOpen._sum.totalGross?.toNumber() ?? 0
  const openPaid  = totalOpen._sum.paidAmount?.toNumber()  ?? 0

  return {
    openAmount:          Math.round((openGross - openPaid) * 100) / 100,
    overdueCount:        totalOverdue,
    monthlyRevenue:      totalThisMonth._sum.totalGross?.toNumber() ?? 0,
    recentInvoices:      recentInvoices.map((inv) => ({
      id:            inv.id,
      invoiceNumber: inv.invoiceNumber,
      status:        inv.status,
      totalGross:    inv.totalGross.toNumber(),
      customerName:  inv.customer.name,
    })),
  }
}
