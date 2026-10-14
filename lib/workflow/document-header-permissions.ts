import { Action, hasPermission, Resource } from '@/lib/auth/permissions'
import type { HeaderPermissions } from '@/lib/workflow/document-header'
import type { getBusinessProcessPermissions } from '@/lib/workflow/business-process-permissions'

// WF-1A: Es werden ausschließlich bestehende Leseberechtigungen abgefragt.
// Keine neuen Rechte, keine Erweiterung der Rollenmatrix.
export async function getHeaderPermissions(
  process: Awaited<ReturnType<typeof getBusinessProcessPermissions>>,
): Promise<HeaderPermissions> {
  const [readDocument, readProject, readCustomer] = await Promise.all([
    hasPermission(Resource.DOCUMENT, Action.READ),
    hasPermission(Resource.PROJECT, Action.READ),
    hasPermission(Resource.CUSTOMER, Action.READ),
  ])
  return {
    readOffer: process.readOffer,
    readOrder: process.readOrder,
    readServiceReport: process.readServiceReport,
    readInvoice: process.readInvoice,
    readDocument,
    readProject,
    readCustomer,
  }
}
