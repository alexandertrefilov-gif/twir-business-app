import type { Metadata } from 'next'
import { requirePermission, Resource, Action } from '@/lib/auth/permissions'
import { prisma } from '@/lib/db/prisma'
import { getProject } from '@/lib/services/project.service'
import { ProjectForm } from '@/components/projects/ProjectForm'
import { updateProjectAction } from '../../actions'

export const metadata: Metadata = { title: 'Projekt bearbeiten' }

function dateInput(value: Date | null | undefined) {
  return value ? value.toISOString().slice(0, 10) : ''
}

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission(Resource.PROJECT, Action.UPDATE)
  const { id } = await params
  const project = await getProject(id)
  const [customers, users] = await Promise.all([
    prisma.customer.findMany({ where: { deletedAt: null }, select: { id: true, number: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { status: 'ACTIVE', deletedAt: null }, select: { id: true, firstName: true, lastName: true }, orderBy: { lastName: 'asc' } }),
  ])
  const boundAction = updateProjectAction.bind(null, id)
  return <main className="space-y-5">
    <div>
      <h1 className="text-2xl font-700">Projekt bearbeiten</h1>
      <p className="text-sm text-muted-foreground">{project.projectNumber} · {project.name}</p>
    </div>
    <ProjectForm
      action={boundAction}
      customers={customers}
      users={users}
      defaults={{
        projectNumber: project.projectNumber,
        name: project.name,
        description: project.description,
        customerId: project.customerId,
        leadUserId: project.leadUserId,
        status: project.status,
        location: project.location,
        building: project.building,
        floor: project.floor,
        area: project.area,
        plannedStart: dateInput(project.plannedStart),
        plannedEnd: dateInput(project.plannedEnd),
      }}
    />
  </main>
}
