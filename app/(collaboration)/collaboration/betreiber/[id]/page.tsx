// Externe, bewusst reduzierte Schrankdetailseite für das Betreiberportal.
// Keine Kopie der internen Seite: keine Maßnahmen, keine internen
// Kommentare, keine kaufmännischen Daten. Nur Identifikation, technische
// Eckdaten, tatsächlich dokumentierter Prüfstatus, freigegebene Dokumente,
// Freigabehistorie und — falls zuständig — der Freigabe-/Beanstandungsdialog.
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getGgaCabinetDetail } from '@/lib/services/gga-cabinet.service'
import { listCollaborationDocuments } from '@/lib/services/collaboration-document.service'
import { GGA_EX_ASSESSMENT_LABELS, GGA_LIFECYCLE_STAGE_LABELS, GGA_BETREIBERSTATUS_LABELS, formatGgaBetriebsstatusLabel, GGA_BETRIEBSSTATUS_BADGE_CLASS } from '@/lib/collaboration/cabinet-workflow'
import { GgaCabinetFreigabehistorie } from '@/components/collaboration/GgaCabinetFreigabehistorie'
import { GgaCabinetOperatorDecisionPanel } from '@/components/collaboration/GgaCabinetOperatorDecisionPanel'
import { NotFoundError } from '@/lib/auth/permissions'

function decimalToStr(value: unknown, unit: string): string {
  return value === null || value === undefined ? '–' : `${value} ${unit}`
}
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

const pruefpunkte = ['Maßnahmen abgeschlossen', 'Abluft geprüft', 'Ist-Volumenstrom dokumentiert', 'Elektro/VDE geprüft', 'Potentialausgleich geprüft', 'Ex-Anforderungen erfüllt', 'Kennzeichnung geprüft', 'Dokumentation vollständig']

export default async function GgaBetreiberCabinetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  let cabinet: Awaited<ReturnType<typeof getGgaCabinetDetail>>
  try {
    cabinet = await getGgaCabinetDetail(id)
  } catch (error) {
    if (error instanceof NotFoundError) notFound()
    throw error
  }

  const documents = await listCollaborationDocuments({ projectId: cabinet.projectId, cabinetId: cabinet.id })

  const abnahmeChecklist = cabinet.checklistItems.filter((c) => c.stage.code === 'ABNAHME')
  const findItem = (title: string) => abnahmeChecklist.find((c) => c.title === title)?.completed ?? false

  const openOperatorApproval = cabinet.approvals.find((a) => a.approvalType === 'OPERATOR_ACCEPTANCE' && a.status === 'REQUESTED')
  const canDecide = cabinet.role === 'OPERATOR'

  return <div>
    <p className="text-xs text-muted-foreground"><Link href="/collaboration/betreiber" className="hover:underline">Gefahrstoffschränke</Link></p>
    <h1 className="mt-1 text-3xl font-600 tracking-tight">GGA-Schrank {cabinet.kennung}</h1>
    <div className="mt-1 flex flex-wrap items-center gap-2">
      <span className={`rounded-full px-3 py-1 text-xs font-600 ${GGA_BETRIEBSSTATUS_BADGE_CLASS[cabinet.status.betriebsstatus]}`}>{formatGgaBetriebsstatusLabel(cabinet.status.betriebsstatus, cabinet.status.betriebsstatusTageBisFaellig)}</span>
      <span className="text-sm text-muted-foreground">{GGA_LIFECYCLE_STAGE_LABELS[cabinet.status.lifecycleStage]}{cabinet.status.betreiberstatus !== 'NICHT_ANGEFORDERT' ? ` · ${GGA_BETREIBERSTATUS_LABELS[cabinet.status.betreiberstatus]}` : ''}</span>
    </div>

    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-600 uppercase tracking-wide text-muted-foreground">Standort</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Gebäude</dt><dd>{cabinet.gebaeude ?? '–'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Ebene</dt><dd>{cabinet.ebene ?? '–'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Bereich</dt><dd>{cabinet.raumbezeichnung ?? '–'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Nutzung</dt><dd>{cabinet.nutzungsart ?? '–'}</dd></div>
      </dl>
    </section>

    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-600 uppercase tracking-wide text-muted-foreground">Technische Informationen</h2>
      <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div><dt className="text-xs text-muted-foreground">Schranktyp</dt><dd>{[cabinet.herstellerName, cabinet.herstellerTyp].filter(Boolean).join(' ') || '–'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Gefahrstoffart</dt><dd>{cabinet.nutzungsart ?? '–'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Abluft erforderlich</dt><dd>{cabinet.abluftVorhanden ? 'Ja' : 'Nein'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Soll-Volumenstrom</dt><dd>{decimalToStr(cabinet.abluftVolumenstromSollM3h, 'm³/h')}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Ist-Volumenstrom</dt><dd>{decimalToStr(cabinet.abluftVolumenstromIstM3h, 'm³/h')}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Anschlussdurchmesser</dt><dd>{cabinet.abluftAnschlussdurchmesserSollMm ? `${cabinet.abluftAnschlussdurchmesserSollMm} mm` : '–'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Ex-relevant</dt><dd>{cabinet.exAssessmentStatus === 'NOT_ASSESSED' ? 'Noch nicht bewertet' : cabinet.exAssessmentStatus === 'REQUIRED' ? 'Ja' : 'Nein'}</dd></div>
        <div><dt className="text-xs text-muted-foreground">Elektro/VDE erforderlich</dt><dd>{cabinet.elektrischAusgestattet ? 'Ja' : 'Nein'}</dd></div>
      </dl>
    </section>

    <section className="mt-6 rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-sm font-600 uppercase tracking-wide text-muted-foreground">Prüfstatus</h2>
      <p className="mt-1 text-xs text-muted-foreground">Es wird ausschließlich der tatsächlich dokumentierte Status angezeigt — keine automatische Aussage wie „konform“ oder „bestanden“.</p>
      <ul className="mt-3 space-y-2">
        {pruefpunkte.map((title) => <li key={title} className="flex items-center justify-between rounded-lg border border-stone-100 px-3 py-2 text-sm">
          <span>{title}</span>
          {findItem(title) ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-600 text-green-800">✓ geprüft</span> : <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-600 text-amber-800">Nicht geprüft</span>}
        </li>)}
      </ul>
    </section>

    {cabinet.status.betreiberfreigabeAusstehend && openOperatorApproval && <section className="mt-6">
      <h2 className="text-lg font-600">Betreiberfreigabe erforderlich</h2>
      {canDecide
        ? <div className="mt-2"><GgaCabinetOperatorDecisionPanel approvalId={openOperatorApproval.id} /></div>
        : <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">Für diesen Schrank ist eine Betreiberfreigabe angefordert. Nur Nutzer mit der Rolle Betreiber können diese erteilen oder beanstanden.</p>}
    </section>}

    <section className="mt-6">
      <h2 className="text-lg font-600">Unterlagen</h2>
      <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-2">Datei</th><th className="px-4 py-2">Art</th><th className="px-4 py-2">Größe</th><th className="px-4 py-2" /></tr></thead>
          <tbody className="divide-y divide-stone-100">
            {documents.map((doc) => <tr key={doc.id}><td className="px-4 py-2">{doc.originalName}</td><td className="px-4 py-2 text-xs">{doc.documentKind}</td><td className="px-4 py-2 text-xs tabular-nums">{formatFileSize(doc.fileSize)}</td><td className="px-4 py-2 text-right"><a href={`/api/collaboration/documents/${doc.id}/download`} className="text-xs text-blue-700 hover:underline">Ansehen</a></td></tr>)}
          </tbody>
        </table>
        {documents.length === 0 && <p className="px-4 py-6 text-sm text-muted-foreground">Für Sie sind aktuell keine Unterlagen freigegeben.</p>}
      </div>
      <a href={`/api/collaboration/cabinets/${cabinet.id}/schrankakte`} className="mt-3 inline-block rounded-lg border border-stone-300 px-4 py-2 text-sm font-600 text-stone-800">Schrankakte ansehen</a>
    </section>

    <section className="mt-6">
      <h2 className="text-lg font-600">Freigabehistorie</h2>
      <div className="mt-2">
        <GgaCabinetFreigabehistorie audience="OPERATOR" approvals={cabinet.approvals.map((a) => ({
          id: a.id, status: a.status as never, approvalType: a.approvalType as never,
          requestedAt: a.requestedAt.toISOString(), decidedAt: a.decidedAt ? a.decidedAt.toISOString() : null,
          decisionNote: a.decisionNote, requestedByName: `${a.requestedBy.firstName} ${a.requestedBy.lastName}`,
          decidedByName: a.decidedBy ? `${a.decidedBy.firstName} ${a.decidedBy.lastName}` : null,
        }))} />
      </div>
    </section>
  </div>
}
