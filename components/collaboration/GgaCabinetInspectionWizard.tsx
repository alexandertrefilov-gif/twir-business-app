'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

type Blocker = { id: string; title: string; status: 'OPEN' | 'RESOLVED'; cause: string | null }
type CabinetDoc = { id: string; documentKind: string; originalName: string }

const STEP_TITLES = [
  'Übersicht', 'Maßnahmen abgeschlossen', 'Abluft & Ist-Volumenstrom', 'Elektro/VDE & Potentialausgleich',
  'Ex-Schutz', 'Kennzeichnung', 'Offene Mängel', 'Fotos / Nachweisdokumente', 'Dokumentation & Freigabe',
]

const PROOF_KINDS = ['Pruefbericht', 'Protokoll', 'Sonstiges'] as const

function CheckToggle({ title, checked, disabled, onToggle }: { title: string; checked: boolean; disabled: boolean; onToggle: () => void }) {
  return <button type="button" disabled={disabled} onClick={onToggle} className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-base disabled:opacity-60 ${checked ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-amber-300 bg-amber-50 text-amber-900'}`}>
    <span>{title}</span>
    <span className="text-sm font-600">{checked ? '✓ Geprüft' : 'Nicht geprüft'}</span>
  </button>
}

async function mutate(body: Record<string, unknown>) {
  const response = await fetch('/api/collaboration/workflow', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok || !result.ok) throw new Error(result.error || 'Aktion fehlgeschlagen')
  return result.result
}

type ChecklistState = Record<string, boolean>

export function GgaCabinetInspectionWizard({ cabinetId, projectId, abnahmeStageId, canInspect, canApprove, canEditStammdaten, initial, recap, lifecycleWarning }: {
  cabinetId: string
  projectId: string
  abnahmeStageId: string
  canInspect: boolean
  canApprove: boolean
  canEditStammdaten: boolean
  initial: {
    checklist: ChecklistState
    abluftVolumenstromIstM3h: string | null
    letztePruefungAm: string | null
    openBlockers: Blocker[]
    documents: CabinetDoc[]
    latestApprovalStatus: 'REQUESTED' | 'APPROVED' | 'REJECTED' | null
    pruefstatus: string
    betreiberstatus: 'NICHT_ANGEFORDERT' | 'AUSSTEHEND' | 'BEANSTANDET' | 'ERTEILT'
    canRequestBetreiberfreigabe: boolean
  }
  recap: {
    kennung: string
    standort: string
    abluftVolumenstromSollM3h: string | null
    abluftAnschlussdurchmesserSollMm: number | null
    exAssessmentStatus: 'NOT_ASSESSED' | 'REQUIRED' | 'NOT_REQUIRED'
    doneMeasures: string[]
    openRequiredMeasures: string[]
  }
  lifecycleWarning: string | null
}) {
  const router = useRouter()
  const storageKey = `gga-inspection-step-${cabinetId}`
  const [step, setStep] = useState(0)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [checklist, setChecklist] = useState(initial.checklist)
  const [istVolumenstrom, setIstVolumenstrom] = useState(initial.abluftVolumenstromIstM3h ?? '')
  const [letztePruefungAm, setLetztePruefungAm] = useState(initial.letztePruefungAm ?? '')
  const [blockers, setBlockers] = useState(initial.openBlockers)
  const [mangelTitle, setMangelTitle] = useState('')
  const [documents, setDocuments] = useState(initial.documents)
  const [decisionNote, setDecisionNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [docKind, setDocKind] = useState<string>('Pruefbericht')

  useEffect(() => {
    // sessionStorage ist während SSR nicht verfügbar — Wiederherstellung des
    // zuletzt aktiven Schritts kann daher erst nach dem Mount erfolgen.
    // Vorbestehendes Muster, unverändert seit vor CP16.
    try {
      const stored = window.sessionStorage.getItem(storageKey)
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (stored) setStep(Math.min(Math.max(Number(stored) || 0, 0), STEP_TITLES.length - 1))
    } catch { /* private Fenster etc. */ }
  }, [storageKey])

  const goTo = (next: number) => {
    setStep(next)
    try { window.sessionStorage.setItem(storageKey, String(next)) } catch { /* siehe oben */ }
  }

  const run = (fn: () => Promise<unknown>) => {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try { await fn(); setSaved(true); router.refresh() } catch (cause) { setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen') }
    })
  }

  const toggleChecklist = (title: string, value: boolean) => {
    setChecklist((prev) => ({ ...prev, [title]: value }))
    run(() => mutate({ action: 'set-cabinet-inspection-item', id: cabinetId, title, completed: value }))
  }

  const saveIstVolumenstrom = () => run(() => mutate({ action: 'update-cabinet', id: cabinetId, data: { abluftVolumenstromIstM3h: istVolumenstrom === '' ? null : Number(istVolumenstrom), letztePruefungAm: letztePruefungAm || null } }))

  const meldeMangel = () => {
    if (!mangelTitle.trim()) return
    run(async () => {
      const blocker = await mutate({ action: 'create-blocker', id: abnahmeStageId, projectId, data: { title: mangelTitle, cabinetId } })
      setBlockers((prev) => [...prev, { id: blocker.id, title: blocker.title, status: 'OPEN', cause: null }])
      setMangelTitle('')
    })
  }

  const upload = async (event: React.FormEvent) => {
    event.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) { setError('Bitte eine Datei auswählen.'); return }
    setError(null)
    startTransition(async () => {
      try {
        const formData = new FormData()
        formData.set('file', file)
        formData.set('projectId', projectId)
        formData.set('cabinetId', cabinetId)
        formData.set('documentKind', docKind)
        const response = await fetch('/api/collaboration/documents', { method: 'POST', body: formData })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Upload fehlgeschlagen')
        setDocuments((prev) => [{ id: result.document.id, documentKind: result.document.documentKind, originalName: result.document.originalName }, ...prev])
        if (fileRef.current) fileRef.current.value = ''
        router.refresh()
      } catch (cause) { setError(cause instanceof Error ? cause.message : 'Upload fehlgeschlagen') }
    })
  }

  const requestFreigabe = () => run(() => mutate({ action: 'request-approval', id: abnahmeStageId, cabinetId }))
  const requestBetreiberfreigabe = () => run(() => mutate({ action: 'request-operator-approval', id: cabinetId }))

  const inputCls = 'mt-2 w-full rounded-lg border border-stone-300 px-4 py-3 text-base'
  const labelCls = 'block text-sm font-600 text-stone-800'

  return <div>
    {lifecycleWarning && <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 p-3 text-sm text-amber-900">{lifecycleWarning}</div>}

    <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
      {STEP_TITLES.map((title, index) => <button key={title} type="button" onClick={() => goTo(index)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-600 ${index === step ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600'}`}>{index + 1}. {title}</button>)}
    </div>

    <div className="mt-4 rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Schritt {step + 1} von {STEP_TITLES.length}</p>
      <h2 className="mt-1 text-xl font-600">{STEP_TITLES[step]}</h2>

      {step === 0 && <div className="mt-5 space-y-3 text-sm">
        <p><strong>{recap.kennung}</strong> · {recap.standort}</p>
        <p>Soll-Volumenstrom: {recap.abluftVolumenstromSollM3h ?? '–'} m³/h · Soll-Anschlussdurchmesser: {recap.abluftAnschlussdurchmesserSollMm ?? '–'} mm</p>
        <p>Ex-Bewertung (Bestand): {recap.exAssessmentStatus === 'NOT_ASSESSED' ? 'Noch nicht bewertet' : recap.exAssessmentStatus === 'REQUIRED' ? 'Erforderlich' : 'Nicht erforderlich'}</p>
      </div>}

      {step === 1 && <div className="mt-5 space-y-4">
        <div>
          <p className="text-xs font-600 uppercase text-muted-foreground">Erledigte Maßnahmen ({recap.doneMeasures.length})</p>
          <ul className="mt-1 list-disc pl-5 text-sm">{recap.doneMeasures.map((t) => <li key={t}>{t}</li>)}{recap.doneMeasures.length === 0 && <li className="list-none text-muted-foreground">Keine.</li>}</ul>
        </div>
        {recap.openRequiredMeasures.length > 0 && <div className="rounded-lg bg-red-50 p-3">
          <p className="text-xs font-600 uppercase text-red-800">Noch offene erforderliche Maßnahmen ({recap.openRequiredMeasures.length})</p>
          <ul className="mt-1 list-disc pl-5 text-sm text-red-900">{recap.openRequiredMeasures.map((t) => <li key={t}>{t}</li>)}</ul>
        </div>}
        <CheckToggle title="Maßnahmen abgeschlossen" checked={checklist['Maßnahmen abgeschlossen']} disabled={!canInspect || pending} onToggle={() => toggleChecklist('Maßnahmen abgeschlossen', !checklist['Maßnahmen abgeschlossen'])} />
      </div>}

      {step === 2 && <div className="mt-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block"><span className={labelCls}>Ist-Volumenstrom (m³/h)</span><input type="number" step="any" value={istVolumenstrom} onChange={(e) => setIstVolumenstrom(e.target.value)} className={inputCls} disabled={!canEditStammdaten} /></label>
          <label className="block"><span className={labelCls}>Gemessen am</span><input type="date" value={letztePruefungAm} onChange={(e) => setLetztePruefungAm(e.target.value)} className={inputCls} disabled={!canEditStammdaten} /></label>
        </div>
        {canEditStammdaten && <button disabled={pending} onClick={saveIstVolumenstrom} className="rounded-lg bg-stone-800 px-5 py-3 text-base font-600 text-white disabled:opacity-50">Messwert speichern</button>}
        <CheckToggle title="Abluft geprüft" checked={checklist['Abluft geprüft']} disabled={!canInspect || pending} onToggle={() => toggleChecklist('Abluft geprüft', !checklist['Abluft geprüft'])} />
        <CheckToggle title="Ist-Volumenstrom dokumentiert" checked={checklist['Ist-Volumenstrom dokumentiert']} disabled={!canInspect || pending} onToggle={() => toggleChecklist('Ist-Volumenstrom dokumentiert', !checklist['Ist-Volumenstrom dokumentiert'])} />
      </div>}

      {step === 3 && <div className="mt-5 space-y-3">
        <CheckToggle title="Elektro/VDE geprüft" checked={checklist['Elektro/VDE geprüft']} disabled={!canInspect || pending} onToggle={() => toggleChecklist('Elektro/VDE geprüft', !checklist['Elektro/VDE geprüft'])} />
        <CheckToggle title="Potentialausgleich geprüft" checked={checklist['Potentialausgleich geprüft']} disabled={!canInspect || pending} onToggle={() => toggleChecklist('Potentialausgleich geprüft', !checklist['Potentialausgleich geprüft'])} />
      </div>}

      {step === 4 && <div className="mt-5 space-y-3">
        <CheckToggle title="Ex-Anforderungen erfüllt" checked={checklist['Ex-Anforderungen erfüllt']} disabled={!canInspect || pending} onToggle={() => toggleChecklist('Ex-Anforderungen erfüllt', !checklist['Ex-Anforderungen erfüllt'])} />
      </div>}

      {step === 5 && <div className="mt-5 space-y-3">
        <CheckToggle title="Kennzeichnung geprüft" checked={checklist['Kennzeichnung geprüft']} disabled={!canInspect || pending} onToggle={() => toggleChecklist('Kennzeichnung geprüft', !checklist['Kennzeichnung geprüft'])} />
      </div>}

      {step === 6 && <div className="mt-5 space-y-4">
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {blockers.map((b) => <li key={b.id} className="px-4 py-3 text-sm">{b.title}</li>)}
          {blockers.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">Keine offenen Mängel.</li>}
        </ul>
        {canInspect && <form onSubmit={(e) => { e.preventDefault(); meldeMangel() }} className="flex flex-wrap gap-2">
          <input value={mangelTitle} onChange={(e) => setMangelTitle(e.target.value)} placeholder="Mangel beschreiben" className="min-w-[240px] flex-1 rounded-lg border border-stone-300 px-4 py-3 text-base" />
          <button disabled={pending} className="rounded-lg bg-red-700 px-5 py-3 text-base font-600 text-white disabled:opacity-50">Mangel melden</button>
        </form>}
      </div>}

      {step === 7 && <div className="mt-5 space-y-4">
        {canInspect && <form onSubmit={upload} className="flex flex-wrap items-end gap-3 rounded-lg bg-stone-50 p-4">
          <label className="block"><span className="text-sm font-600">Art</span><select value={docKind} onChange={(e) => setDocKind(e.target.value)} className="mt-2 rounded-lg border border-stone-300 px-4 py-3 text-base">{PROOF_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          <label className="block"><span className="text-sm font-600">Datei</span><input ref={fileRef} type="file" required className="mt-2 block text-base" /></label>
          <button disabled={pending} className="rounded-lg bg-stone-800 px-5 py-3 text-base font-600 text-white disabled:opacity-50">Hochladen</button>
        </form>}
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200">
          {documents.map((d) => <li key={d.id} className="flex items-center justify-between px-4 py-3 text-sm"><span>{d.originalName}</span><span className="text-xs text-muted-foreground">{d.documentKind}</span></li>)}
          {documents.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">Noch keine Nachweisdokumente.</li>}
        </ul>
      </div>}

      {step === 8 && <div className="mt-5 space-y-6">
        <div>
          <h3 className="text-sm font-600 text-stone-800">Interne Freigabe</h3>
          <CheckToggle title="Dokumentation vollständig" checked={checklist['Dokumentation vollständig']} disabled={!canInspect || pending} onToggle={() => toggleChecklist('Dokumentation vollständig', !checklist['Dokumentation vollständig'])} />
          {initial.latestApprovalStatus === 'REQUESTED' && <p className="mt-2 rounded-lg bg-blue-50 p-3 text-sm text-blue-900">Interne Freigabe wurde angefragt und ist noch nicht entschieden.</p>}
          {initial.latestApprovalStatus === 'REJECTED' && <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">Die letzte interne Freigabe wurde abgelehnt. Nach Nacharbeit kann hier eine erneute Freigabe angefragt werden.</p>}
          {canApprove && initial.latestApprovalStatus !== 'REQUESTED' && <button disabled={pending} onClick={requestFreigabe} className="mt-2 rounded-lg bg-stone-800 px-6 py-3 text-base font-600 text-white disabled:opacity-50">Interne Freigabe anfordern</button>}
          {!canApprove && <p className="mt-2 text-sm text-muted-foreground">Freigabe anfordern/entscheiden erfordert die Rolle Interner Planer oder Projektleiter.</p>}
        </div>

        <div className="border-t border-stone-100 pt-4">
          <h3 className="text-sm font-600 text-stone-800">Betreiberfreigabe</h3>
          <p className="mt-1 text-xs text-muted-foreground">Technische Prüfung abgeschlossen ist nicht gleichbedeutend mit Betreiberfreigabe erteilt — erst die ausdrückliche Entscheidung des Betreibers schließt diesen Schritt ab.</p>
          {initial.betreiberstatus === 'NICHT_ANGEFORDERT' && initial.pruefstatus !== 'BESTANDEN' && <p className="mt-2 rounded-lg bg-stone-50 p-3 text-sm text-muted-foreground">Erst nach bestandener interner Prüfung anforderbar.</p>}
          {initial.betreiberstatus === 'NICHT_ANGEFORDERT' && initial.pruefstatus === 'BESTANDEN' && initial.canRequestBetreiberfreigabe && <button disabled={pending} onClick={requestBetreiberfreigabe} className="mt-2 rounded-lg bg-emerald-700 px-6 py-3 text-base font-600 text-white disabled:opacity-50">Betreiberfreigabe anfordern</button>}
          {initial.betreiberstatus === 'AUSSTEHEND' && <p className="mt-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">⚠ Betreiberfreigabe ausstehend — der Betreiber wurde informiert und prüft die Unterlagen.</p>}
          {initial.betreiberstatus === 'BEANSTANDET' && <p className="mt-2 rounded-lg bg-red-50 p-3 text-sm text-red-900">⚠ Betreiberbeanstandung vorhanden. Nach abgeschlossener Nacharbeit kann hier eine erneute Betreiberfreigabe angefordert werden.</p>}
          {initial.betreiberstatus === 'BEANSTANDET' && initial.canRequestBetreiberfreigabe && <button disabled={pending} onClick={requestBetreiberfreigabe} className="mt-2 rounded-lg bg-emerald-700 px-6 py-3 text-base font-600 text-white disabled:opacity-50">Betreiberfreigabe erneut anfordern</button>}
          {initial.betreiberstatus === 'ERTEILT' && <p className="mt-2 rounded-lg bg-green-50 p-3 text-sm text-green-900">✓ Betreiberfreigabe erteilt.</p>}
        </div>
      </div>}

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
        <button disabled={step === 0} onClick={() => goTo(step - 1)} className="rounded-lg border border-stone-300 px-5 py-3 text-base disabled:opacity-40">Zurück</button>
        {step < STEP_TITLES.length - 1 && <button onClick={() => goTo(step + 1)} className="rounded-lg bg-stone-800 px-6 py-3 text-base font-600 text-white">Weiter</button>}
        {saved && !pending && <span className="text-sm text-emerald-700">Gespeichert.</span>}
      </div>
    </div>
  </div>
}
