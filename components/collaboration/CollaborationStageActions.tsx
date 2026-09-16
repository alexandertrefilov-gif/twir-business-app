'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import type { DerivedCollaborationStage } from '@/lib/collaboration/project-workflow'

const editorRoles = ['COLLAB_MANAGER', 'INTERNAL_PLANNER', 'EXTERNAL_PLANNER', 'OPERATOR', 'PARTNER']
const approverRoles = ['COLLAB_MANAGER', 'INTERNAL_PLANNER']

async function mutate(body: Record<string, unknown>) {
  const response = await fetch('/api/collaboration/workflow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok || !result.ok) throw new Error(result.error || 'Aktion konnte nicht ausgeführt werden')
}

export function CollaborationStageActions({ stage, role, projectId, memberships = [], showCreationForms = true }: { stage: DerivedCollaborationStage; role?: string; projectId: string; memberships?: Array<{ id: string; role: string; user: { firstName: string; lastName: string } }>; showCreationForms?: boolean }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [taskTitle, setTaskTitle] = useState('')
  const [checkTitle, setCheckTitle] = useState('')
  const [blockerTitle, setBlockerTitle] = useState('')
  const [decisionNote, setDecisionNote] = useState('')
  const [priority, setPriority] = useState('MEDIUM')
  const [dueDate, setDueDate] = useState('')
  const [responsibleMembershipId, setResponsibleMembershipId] = useState('')
  const [isRequired, setIsRequired] = useState(true)
  const [checkRequired, setCheckRequired] = useState(true)
  const [checkResponsibleMembershipId, setCheckResponsibleMembershipId] = useState('')
  const canEdit = !!role && editorRoles.includes(role)
  const canApprove = !!role && approverRoles.includes(role)
  const run = (body: Record<string, unknown>) => {
    setError(null)
    startTransition(async () => {
      try { await mutate(body); setTaskTitle(''); setCheckTitle(''); setBlockerTitle(''); router.refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen') }
    })
  }
  const transition = (status: string) => run({ action: 'transition-stage', id: stage.id, status })
  return <div className="mt-4 rounded-lg border border-stone-200 bg-stone-50 p-4">
    <div className="flex flex-wrap items-center gap-2">
      {canEdit && (stage.derivedStatus === 'READY' || stage.derivedStatus === 'NOT_STARTED' || stage.derivedStatus === 'BLOCKED') && <button disabled={pending} onClick={() => transition('IN_PROGRESS')} className="rounded-md bg-blue-700 px-3 py-1.5 text-xs font-600 text-white disabled:opacity-50">Stage starten</button>}
      {canEdit && stage.derivedStatus === 'IN_PROGRESS' && stage.requiresApproval && <button disabled={pending} onClick={() => transition('WAITING_FOR_APPROVAL')} className="rounded-md bg-amber-600 px-3 py-1.5 text-xs font-600 text-white disabled:opacity-50">Zur Freigabe einreichen</button>}
      {canEdit && stage.derivedStatus === 'IN_PROGRESS' && !stage.requiresApproval && <button disabled={pending} onClick={() => transition('COMPLETED')} className="rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-600 text-white disabled:opacity-50">Stage abschließen</button>}
      {canEdit && stage.requiresApproval && stage.derivedStatus === 'IN_PROGRESS' && <button disabled={pending} onClick={() => run({ action: 'request-approval', id: stage.id })} className="rounded-md border border-amber-600 px-3 py-1.5 text-xs font-600 text-amber-800 disabled:opacity-50">Freigabe anfordern</button>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
    {canEdit && showCreationForms && <div className="mt-4 grid gap-3 lg:grid-cols-3">
      <form onSubmit={(event) => { event.preventDefault(); run({ action: 'create-task', id: stage.id, data: { title: taskTitle, priority, dueDate: dueDate || null, isRequired, responsibleMembershipId: responsibleMembershipId || null } }) }} className="rounded-md bg-white p-3"><label className="text-xs font-600" htmlFor={`task-${stage.id}`}>Aufgabe hinzufügen</label><input id={`task-${stage.id}`} value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="mt-2 w-full rounded border border-stone-300 px-2 py-1 text-sm" placeholder="Titel" required /><div className="mt-2 flex flex-wrap gap-2"><select aria-label="Priorität" value={priority} onChange={(event) => setPriority(event.target.value)} className="rounded border border-stone-300 px-2 py-1 text-xs"><option value="URGENT">Dringend</option><option value="HIGH">Hoch</option><option value="MEDIUM">Mittel</option><option value="LOW">Niedrig</option></select><input aria-label="Fälligkeit" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="rounded border border-stone-300 px-2 py-1 text-xs" />{memberships.length > 0 && <select aria-label="Verantwortlicher" value={responsibleMembershipId} onChange={(event) => setResponsibleMembershipId(event.target.value)} className="rounded border border-stone-300 px-2 py-1 text-xs"><option value="">Verantwortlicher</option>{memberships.map((member) => <option key={member.id} value={member.id}>{member.user.firstName} {member.user.lastName}</option>)}</select>}<label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={isRequired} onChange={(event) => setIsRequired(event.target.checked)} /> Erforderlich</label><button disabled={pending} className="rounded bg-stone-800 px-2 py-1 text-xs text-white">+</button></div></form>
      <form onSubmit={(event) => { event.preventDefault(); run({ action: 'create-checklist', id: stage.id, data: { title: checkTitle, isRequired: checkRequired, responsibleMembershipId: checkResponsibleMembershipId || null } }) }} className="rounded-md bg-white p-3"><label className="text-xs font-600" htmlFor={`check-${stage.id}`}>Checklistenpunkt hinzufügen</label><input id={`check-${stage.id}`} value={checkTitle} onChange={(event) => setCheckTitle(event.target.value)} className="mt-2 w-full rounded border border-stone-300 px-2 py-1 text-sm" placeholder="Punkt" required /><div className="mt-2 flex flex-wrap gap-2">{memberships.length > 0 && <select aria-label="Checkliste Verantwortlicher" value={checkResponsibleMembershipId} onChange={(event) => setCheckResponsibleMembershipId(event.target.value)} className="rounded border border-stone-300 px-2 py-1 text-xs"><option value="">Verantwortlicher</option>{memberships.map((member) => <option key={member.id} value={member.id}>{member.user.firstName} {member.user.lastName}</option>)}</select>}<label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={checkRequired} onChange={(event) => setCheckRequired(event.target.checked)} /> Erforderlich</label><button disabled={pending} className="rounded bg-stone-800 px-2 py-1 text-xs text-white">+</button></div></form>
      <form onSubmit={(event) => { event.preventDefault(); run({ action: 'create-blocker', id: stage.id, projectId, data: { title: blockerTitle } }) }} className="rounded-md bg-white p-3"><label className="text-xs font-600" htmlFor={`blocker-${stage.id}`}>Blocker melden</label><div className="mt-2 flex gap-2"><input id={`blocker-${stage.id}`} value={blockerTitle} onChange={(event) => setBlockerTitle(event.target.value)} className="min-w-0 flex-1 rounded border border-stone-300 px-2 py-1 text-sm" placeholder="Titel" required /><button disabled={pending} className="rounded bg-red-700 px-2 py-1 text-xs text-white">+</button></div></form>
    </div>}
    {(stage.tasks?.length || stage.checklistItems?.length || stage.blockers?.length || stage.approvals?.length) ? <div className="mt-4 grid gap-3 lg:grid-cols-2">
      {!!stage.tasks?.length && <div><h4 className="text-xs font-600 uppercase tracking-wide text-muted-foreground">Aufgaben</h4><ul className="mt-2 space-y-1">{stage.tasks.map((task) => <li key={task.id} className="flex items-center gap-2 rounded bg-white px-2 py-1.5 text-sm"><select aria-label={`${task.title} Status`} value={task.status} disabled={!canEdit || pending} onChange={(event) => run({ action: 'task-status', id: task.id, status: event.target.value })} className="rounded border border-stone-300 px-1 py-0.5 text-xs"><option value="TODO">Offen</option><option value="IN_PROGRESS">In Bearbeitung</option><option value="DONE">Erledigt</option><option value="SKIPPED">Übersprungen</option></select><span className={task.isRequired ? 'font-600' : ''}>{task.title}</span>{task.dueDate && <span className="ml-auto text-xs text-muted-foreground">{task.dueDate.toLocaleDateString('de-DE')}</span>}{canEdit && <button type="button" disabled={pending} onClick={() => { const title = window.prompt('Aufgabe bearbeiten', task.title); if (title?.trim()) run({ action: 'update-task', id: task.id, data: { title: title.trim() } }) }} className="text-xs text-blue-700 hover:underline">Bearbeiten</button>}</li>)}</ul></div>}
      {!!stage.checklistItems?.length && <div><h4 className="text-xs font-600 uppercase tracking-wide text-muted-foreground">Checkliste</h4><ul className="mt-2 space-y-1">{stage.checklistItems.map((item) => <li key={item.id} className="flex items-center gap-2 rounded bg-white px-2 py-1.5 text-sm"><input type="checkbox" aria-label={`${item.title} erledigt`} checked={item.completed} disabled={!canEdit || pending} onChange={(event) => run({ action: 'checklist', id: item.id, completed: event.target.checked })} /><span className={item.isRequired ? 'font-600' : ''}>{item.title}</span><span className="ml-auto text-xs text-muted-foreground">{item.isRequired ? 'Erforderlich' : 'Optional'}</span></li>)}</ul></div>}
      {!!stage.blockers?.length && <div><h4 className="text-xs font-600 uppercase tracking-wide text-red-700">Blocker</h4><ul className="mt-2 space-y-1">{stage.blockers.map((blocker) => <li key={blocker.id} className="flex items-center gap-2 rounded bg-white px-2 py-1.5 text-sm"><span>{blocker.title}</span>{canEdit && blocker.status === 'OPEN' && <button disabled={pending} onClick={() => run({ action: 'resolve-blocker', id: blocker.id, resolution: 'Im Portal geklärt' })} className="ml-auto text-xs text-emerald-700 hover:underline">Auflösen</button>}</li>)}</ul></div>}
      {!!stage.approvals?.length && <div><h4 className="text-xs font-600 uppercase tracking-wide text-amber-700">Freigaben</h4><ul className="mt-2 space-y-1">{stage.approvals.map((approval) => <li key={approval.id} className="flex items-center gap-2 rounded bg-white px-2 py-1.5 text-sm"><span>{approval.status === 'REQUESTED' ? 'Ausstehend' : approval.status === 'APPROVED' ? 'Genehmigt' : 'Abgelehnt'}</span>{canApprove && approval.status === 'REQUESTED' && <><input aria-label="Entscheidungsnotiz" value={decisionNote} onChange={(event) => setDecisionNote(event.target.value)} className="ml-auto min-w-0 rounded border border-stone-300 px-2 py-1 text-xs" placeholder="Notiz" /><button disabled={pending} onClick={() => run({ action: 'decide-approval', id: approval.id, decision: 'APPROVED', decisionNote })} className="text-xs text-emerald-700">Genehmigen</button><button disabled={pending} onClick={() => run({ action: 'decide-approval', id: approval.id, decision: 'REJECTED', decisionNote })} className="text-xs text-red-700">Ablehnen</button></>}</li>)}</ul></div>}
    </div> : null}
  </div>
}
