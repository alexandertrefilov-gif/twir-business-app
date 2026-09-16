import { Action, hasPermission, Resource } from '@/lib/auth/permissions'

export async function getBusinessProcessPermissions() {
  const [readOffer, readOrder, readServiceReport, readInvoice, createOrder, createServiceReport, createInvoice, updateOrder, updateServiceReport] = await Promise.all([
    hasPermission(Resource.OFFER, Action.READ), hasPermission(Resource.ORDER, Action.READ),
    hasPermission(Resource.SERVICE_REPORT, Action.READ), hasPermission(Resource.INVOICE, Action.READ),
    hasPermission(Resource.ORDER, Action.CREATE), hasPermission(Resource.SERVICE_REPORT, Action.CREATE),
    hasPermission(Resource.INVOICE, Action.CREATE),
    hasPermission(Resource.ORDER, Action.UPDATE), hasPermission(Resource.SERVICE_REPORT, Action.UPDATE),
  ])
  return { readOffer, readOrder, readServiceReport, readInvoice, createOrder, createServiceReport, createInvoice, updateOrder, updateServiceReport }
}
