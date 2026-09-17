import { requirePagePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma } from '@/lib/db/prisma'
import { ProjectForm } from '@/components/projects/ProjectForm'
import { createProjectAction } from '../actions'
export default async function NewProjectPage({ searchParams }: { searchParams: Promise<{ customer?: string; offer?: string; order?: string; invoice?: string; name?: string }> }) {
  await requirePagePermission(Resource.PROJECT, Action.CREATE)
  const sp = await searchParams
  const [customers, users] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, number: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { status: 'ACTIVE', deletedAt: null }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } }),
  ])
  const hiddenFields: Record<string, string> = {}
  if (sp.offer) hiddenFields.sourceOfferId = sp.offer
  if (sp.order) hiddenFields.sourceOrderId = sp.order
  if (sp.invoice) hiddenFields.sourceInvoiceId = sp.invoice
  return <main className="space-y-5"><div><h1 className="text-2xl font-700">Projekt anlegen</h1><p className="text-sm text-muted-foreground">Kanonischer interner Projektkontext</p></div><ProjectForm action={createProjectAction} customers={customers} users={users} defaults={{ customerId: sp.customer, name: sp.name }} hiddenFields={hiddenFields} /></main>
}
