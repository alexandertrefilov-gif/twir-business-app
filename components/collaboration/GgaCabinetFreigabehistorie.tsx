// Reine Anzeigekomponente — wird sowohl auf der internen Cabinet-Detailseite
// als auch im externen Betreiberportal verwendet (Abschnitt 18). Baut
// ausschließlich auf den bestehenden CollaborationApproval-Datensätzen auf,
// keine eigene Historientabelle.

export type GgaFreigabehistorieEntry = {
  id: string
  status: 'REQUESTED' | 'APPROVED' | 'REJECTED'
  approvalType: 'INTERNAL' | 'OPERATOR_ACCEPTANCE'
  requestedAt: string
  decidedAt: string | null
  decisionNote: string | null
  requestedByName: string
  decidedByName: string | null
}

const eventLabel: Record<string, string> = {
  REQUESTED_INTERNAL: 'Interne Freigabe angefordert',
  REQUESTED_OPERATOR_ACCEPTANCE: 'Betreiberfreigabe angefordert',
  APPROVED_INTERNAL: 'Intern freigegeben',
  APPROVED_OPERATOR_ACCEPTANCE: 'Betreiberfreigabe erteilt',
  REJECTED_INTERNAL: 'Intern abgelehnt',
  REJECTED_OPERATOR_ACCEPTANCE: 'Beanstandet',
}

export function GgaCabinetFreigabehistorie({ approvals, audience = 'INTERNAL' }: {
  approvals: GgaFreigabehistorieEntry[]
  audience?: 'INTERNAL' | 'OPERATOR'
}) {
  const relevant = audience === 'OPERATOR' ? approvals.filter((a) => a.approvalType === 'OPERATOR_ACCEPTANCE') : approvals

  type Event = { at: string; label: string; who: string; note: string | null }
  const events: Event[] = []
  for (const approval of relevant) {
    events.push({ at: approval.requestedAt, label: eventLabel[`REQUESTED_${approval.approvalType}`], who: approval.requestedByName, note: null })
    if (approval.decidedAt) {
      events.push({ at: approval.decidedAt, label: eventLabel[`${approval.status}_${approval.approvalType}`], who: approval.decidedByName ?? '–', note: approval.decisionNote })
    }
  }
  events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime())

  if (events.length === 0) return <p className="text-sm text-muted-foreground">Noch keine Freigabehistorie vorhanden.</p>

  return <ol className="space-y-3">
    {events.map((event, index) => <li key={index} className="rounded-lg border border-stone-200 bg-white p-3 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="font-600">{event.label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{new Date(event.at).toLocaleDateString('de-DE')}</span>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">{event.who}</p>
      {event.note && <p className="mt-1 text-sm italic text-stone-700">„{event.note}“</p>}
    </li>)}
  </ol>
}
