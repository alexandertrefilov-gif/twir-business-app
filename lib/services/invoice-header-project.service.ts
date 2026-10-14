import { prisma } from '@/lib/db/prisma'

// WF-1B: Nur lesend. Löst das Projekt einer Rechnung auf, das direkt über
// Invoice.projectId zugewiesen wurde (z. B. Rechnung ohne Auftrag), ohne die
// bestehenden Workflow-/Rechnungs-Services zu ändern. Gelöschte Projekte werden
// nicht angezeigt.
export async function getInvoiceHeaderProject(projectId: string | null | undefined) {
  if (!projectId) return null
  const project = await prisma.project.findFirst({
    where: { id: projectId, deletedAt: null },
    select: { id: true, projectNumber: true, name: true },
  })
  return project ? { id: project.id, number: project.projectNumber, name: project.name } : null
}
