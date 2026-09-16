import { getVisibleCollaborationApprovals } from '@/lib/services/collaboration-phase2.service'
import { CollaborationApprovalActions } from '@/components/collaboration/CollaborationApprovalActions'

export default async function CollaborationApprovalsPage() {
  const approvals = await getVisibleCollaborationApprovals()
  return <div>
    <h1 className="text-3xl font-600 tracking-tight">Freigaben</h1>
    <p className="mt-2 text-sm text-muted-foreground">Nachvollziehbare Freigabeanträge Ihrer Projekte.</p>
    <div className="mt-8 space-y-3">
      {approvals.map((approval) => <article key={approval.id} className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-600">{approval.project.name} · {approval.stage.title}</h2><span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-600 text-amber-700">{approval.status}</span></div>
        <p className="mt-2 text-sm text-muted-foreground">Angefordert am {approval.requestedAt.toLocaleDateString('de-DE')} von {approval.requestedBy.firstName} {approval.requestedBy.lastName}</p>
        {approval.decisionNote && <p className="mt-2 text-sm">{approval.decisionNote}</p>}
        <CollaborationApprovalActions approvalId={approval.id} status={approval.status} canApprove={['COLLAB_MANAGER', 'INTERNAL_PLANNER'].includes(approval.project.memberships[0]?.role ?? '')} />
      </article>)}
      {approvals.length === 0 && <p className="rounded-xl border border-stone-200 bg-white px-5 py-8 text-sm text-muted-foreground">Keine Freigaben vorhanden.</p>}
    </div>
  </div>
}
