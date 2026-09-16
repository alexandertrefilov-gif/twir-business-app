'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'

type CabinetDoc = { id: string; documentKind: string; originalName: string; fileSize: number; uploadedBy?: { firstName: string; lastName: string } | null; createdAt?: string }

const PHOTO_KINDS = ['Übersicht', 'Typenschild', 'Innenraum', 'Abluft', 'Elektro', 'Mangel', 'Sonstiges'] as const

type BestandFields = {
  kennung: string
  bezeichnung: string
  herstellerName: string | null
  herstellerTyp: string | null
  seriennummer: string | null
  baujahr: number | null
  gebaeude: string | null
  ebene: string | null
  raumbezeichnung: string | null
  standortBeschreibung: string | null
  nutzungsart: string | null
  lagerklasse: string | null
  maxLagermengeKg: string | null
  abluftVorhanden: boolean
  abluftUeberwachung: boolean
  elektrischAusgestattet: boolean
  spannungVolt: string | null
  potentialausgleich: boolean
  exAssessmentStatus: 'NOT_ASSESSED' | 'REQUIRED' | 'NOT_REQUIRED'
  exZoneKlassifikation: string | null
  pruefintervallMonate: number | null
  letztePruefungAm: string | null
  pruefpflichtNorm: string | null
  bestandsBeschreibung: string | null
  responsibleMembershipId: string | null
}

const STEP_TITLES = [
  'Identifikation', 'Standort', 'Nutzung / Lagerung', 'Abluft (Bestand)', 'Elektro / VDE (Bestand)',
  'Ex-Schutz', 'Prüfstatus (bekannt)', 'Fotos / Dokumente', 'Zusammenfassung', 'Aufnahme abschließen',
]

async function patchCabinet(cabinetId: string, data: Record<string, unknown>) {
  const response = await fetch('/api/collaboration/workflow', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action: 'update-cabinet', id: cabinetId, data }),
  })
  const result = await response.json()
  if (!response.ok || !result.ok) throw new Error(result.error || 'Speichern fehlgeschlagen')
  return result.result
}

export function GgaCabinetIntakeWizard({ cabinetId, projectId, canEdit, initial, bestandsaufnahmeAbgeschlossen }: {
  cabinetId: string
  projectId: string
  canEdit: boolean
  initial: BestandFields
  bestandsaufnahmeAbgeschlossen: boolean
}) {
  const router = useRouter()
  const storageKey = `gga-intake-step-${cabinetId}`
  const [step, setStep] = useState(0)
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const [documents, setDocuments] = useState<CabinetDoc[]>([])
  const loadedDocs = useRef(false)

  useEffect(() => {
    try {
      const stored = window.sessionStorage.getItem(storageKey)
      if (stored) setStep(Math.min(Math.max(Number(stored) || 0, 0), STEP_TITLES.length - 1))
    } catch { /* sessionStorage kann in privaten Fenstern fehlschlagen — Start bei Schritt 1 */ }
  }, [storageKey])

  useEffect(() => {
    if (step !== 7) return
    if (loadedDocs.current) return
    loadedDocs.current = true
    fetch(`/api/collaboration/documents?projectId=${projectId}&cabinetId=${cabinetId}`)
      .then((r) => r.json())
      .then((r) => { if (r.ok) setDocuments(r.documents) })
      .catch(() => {})
  }, [step, projectId, cabinetId])

  const goToStep = (next: number) => {
    setStep(next)
    try { window.sessionStorage.setItem(storageKey, String(next)) } catch { /* siehe oben */ }
  }

  const set = <K extends keyof BestandFields>(key: K, value: BestandFields[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  async function save(fields: Partial<BestandFields>) {
    setSaving(true)
    setError(null)
    try {
      await patchCabinet(cabinetId, fields)
      setSavedAt(Date.now())
      router.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Speichern fehlgeschlagen')
      throw cause
    } finally {
      setSaving(false)
    }
  }

  const fieldsForStep = (index: number): Partial<BestandFields> => {
    switch (index) {
      case 0: return { bezeichnung: form.bezeichnung, herstellerName: form.herstellerName, herstellerTyp: form.herstellerTyp, seriennummer: form.seriennummer, baujahr: form.baujahr }
      case 1: return { gebaeude: form.gebaeude, ebene: form.ebene, raumbezeichnung: form.raumbezeichnung, standortBeschreibung: form.standortBeschreibung }
      case 2: return { nutzungsart: form.nutzungsart, lagerklasse: form.lagerklasse, maxLagermengeKg: form.maxLagermengeKg }
      case 3: return { abluftVorhanden: form.abluftVorhanden, abluftUeberwachung: form.abluftUeberwachung }
      case 4: return { elektrischAusgestattet: form.elektrischAusgestattet, spannungVolt: form.spannungVolt, potentialausgleich: form.potentialausgleich }
      case 5: return { exAssessmentStatus: form.exAssessmentStatus, exZoneKlassifikation: form.exZoneKlassifikation }
      case 6: return { pruefintervallMonate: form.pruefintervallMonate, letztePruefungAm: form.letztePruefungAm, pruefpflichtNorm: form.pruefpflichtNorm }
      case 8: return { bestandsBeschreibung: form.bestandsBeschreibung }
      default: return {}
    }
  }

  const zwischenspeichern = async () => { try { await save(fieldsForStep(step)) } catch { /* Fehler bereits gesetzt */ } }
  const weiter = async () => {
    try {
      await save(fieldsForStep(step))
      goToStep(Math.min(step + 1, STEP_TITLES.length - 1))
    } catch { /* Fehler bereits gesetzt, bleibt auf demselben Schritt */ }
  }
  const zurueck = () => goToStep(Math.max(step - 1, 0))

  const abschliessen = async () => {
    try {
      await save({})
      await patchCabinet(cabinetId, { bestandsaufnahmeAm: new Date().toISOString() })
      try { window.sessionStorage.removeItem(storageKey) } catch { /* siehe oben */ }
      router.push(`/collaboration/cabinets/${cabinetId}`)
      router.refresh()
    } catch { /* Fehler bereits gesetzt */ }
  }

  if (!canEdit) return <p className="rounded-xl border border-stone-200 bg-white p-6 text-sm text-muted-foreground">Für die Bestandsaufnahme sind die Rollen Interner Planer oder Projektleiter erforderlich.</p>

  const inputCls = 'mt-2 w-full rounded-lg border border-stone-300 px-4 py-3 text-base'
  const labelCls = 'block text-sm font-600 text-stone-800'
  const text = (label: string, key: keyof BestandFields, placeholder?: string) => <label className="block">
    <span className={labelCls}>{label}</span>
    <input value={(form[key] as string) ?? ''} onChange={(event) => set(key, event.target.value as never)} placeholder={placeholder} className={inputCls} />
  </label>
  const textarea = (label: string, key: keyof BestandFields) => <label className="block">
    <span className={labelCls}>{label}</span>
    <textarea value={(form[key] as string) ?? ''} onChange={(event) => set(key, event.target.value as never)} rows={4} className={inputCls} />
  </label>
  const number = (label: string, key: keyof BestandFields, unit?: string) => <label className="block">
    <span className={labelCls}>{label}{unit ? ` (${unit})` : ''}</span>
    <input type="number" step="any" value={form[key] === null || form[key] === undefined ? '' : String(form[key])} onChange={(event) => set(key, (event.target.value === '' ? null : Number(event.target.value)) as never)} className={inputCls} />
  </label>
  const toggle = (label: string, key: keyof BestandFields) => <button type="button" onClick={() => set(key, !form[key] as never)} className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-base ${form[key] ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-stone-300 bg-white text-stone-700'}`}>
    <span>{label}</span>
    <span className={`flex h-7 w-12 items-center rounded-full p-1 transition ${form[key] ? 'justify-end bg-emerald-600' : 'justify-start bg-stone-300'}`}><span className="h-5 w-5 rounded-full bg-white" /></span>
  </button>

  return <div>
    <div className="flex flex-wrap items-center gap-2 overflow-x-auto pb-1">
      {STEP_TITLES.map((title, index) => <button key={title} type="button" onClick={() => goToStep(index)} className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-600 ${index === step ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600'}`}>{index + 1}. {title}</button>)}
    </div>

    <div className="mt-4 rounded-xl border border-stone-200 bg-white p-5 sm:p-6">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">Schritt {step + 1} von {STEP_TITLES.length} · Bestand</p>
      <h2 className="mt-1 text-xl font-600">{STEP_TITLES[step]}</h2>

      {step === 0 && <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <div><span className={labelCls}>Kennung</span><p className={`${inputCls} bg-stone-50 font-600`}>{form.kennung}</p></div>
        {text('Bezeichnung', 'bezeichnung')}
        {text('Hersteller', 'herstellerName')}
        {text('Typ', 'herstellerTyp')}
        {text('Seriennummer', 'seriennummer')}
        {number('Baujahr', 'baujahr')}
      </div>}

      {step === 1 && <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {text('Gebäude', 'gebaeude')}
        {text('Ebene', 'ebene')}
        {text('Raum', 'raumbezeichnung')}
        {text('Standortbeschreibung', 'standortBeschreibung')}
      </div>}

      {step === 2 && <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {text('Nutzungsart', 'nutzungsart', 'z. B. Lagerung entzündbarer Flüssigkeiten')}
        {text('Lagerklasse', 'lagerklasse', 'z. B. LGK 3 (falls bekannt)')}
        {number('Max. Lagermenge', 'maxLagermengeKg', 'kg')}
      </div>}

      {step === 3 && <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {toggle('Abluft vorhanden', 'abluftVorhanden')}
        {toggle('Überwachung vorhanden', 'abluftUeberwachung')}
        <p className="sm:col-span-2 text-xs text-muted-foreground">Nur der vorgefundene Zustand. Soll-Werte (Anschlussdurchmesser, Volumenstrom) werden separat in der Maßnahmenplanung festgelegt.</p>
      </div>}

      {step === 4 && <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {toggle('Elektrisch ausgestattet', 'elektrischAusgestattet')}
        {number('Spannung (vorgefunden)', 'spannungVolt', 'V')}
        {toggle('Potentialausgleich vorhanden', 'potentialausgleich')}
      </div>}

      {step === 5 && <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className={labelCls}>Ex-Schutz-Bewertung</span>
          <select value={form.exAssessmentStatus} onChange={(event) => set('exAssessmentStatus', event.target.value as never)} className={inputCls}>
            <option value="NOT_ASSESSED">Noch nicht bewertet</option>
            <option value="REQUIRED">Erforderlich</option>
            <option value="NOT_REQUIRED">Nicht erforderlich</option>
          </select>
        </label>
        {form.exAssessmentStatus === 'REQUIRED' && text('Ex-Zonen-Klassifikation', 'exZoneKlassifikation')}
        <p className="sm:col-span-2 text-xs text-muted-foreground">Sicherheitsrelevant: Solange keine Bewertung vorliegt, bleibt „Noch nicht bewertet“ — niemals automatisch „Nicht erforderlich“.</p>
      </div>}

      {step === 6 && <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {number('Prüfintervall (falls bekannt)', 'pruefintervallMonate', 'Monate')}
        <label className="block"><span className={labelCls}>Letzte Prüfung (falls dokumentiert)</span><input type="date" value={form.letztePruefungAm ?? ''} onChange={(event) => set('letztePruefungAm', event.target.value as never)} className={inputCls} /></label>
        {text('Prüfpflicht-Normbezug', 'pruefpflichtNorm')}
      </div>}

      {step === 7 && <div className="mt-5">
        <p className="text-sm text-muted-foreground">Kategorien: {PHOTO_KINDS.join(' · ')}, plus Protokoll/Prüfbericht/Planzeichnung für Dokumente.</p>
        <CabinetDocUpload projectId={projectId} cabinetId={cabinetId} onUploaded={(doc) => setDocuments((prev) => [doc, ...prev])} />
        <ul className="mt-4 divide-y divide-stone-100 rounded-lg border border-stone-200">
          {documents.map((doc) => <li key={doc.id} className="flex items-center justify-between px-4 py-3 text-sm"><span>{doc.originalName}</span><span className="text-xs text-muted-foreground">{doc.documentKind}</span></li>)}
          {documents.length === 0 && <li className="px-4 py-6 text-sm text-muted-foreground">Noch keine Fotos/Dokumente hochgeladen.</li>}
        </ul>
      </div>}

      {step === 8 && <div className="mt-5 space-y-4">
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 text-sm">
          <div><dt className="text-muted-foreground">Kennung / Bezeichnung</dt><dd className="font-600">{form.kennung} — {form.bezeichnung}</dd></div>
          <div><dt className="text-muted-foreground">Hersteller / Typ</dt><dd>{[form.herstellerName, form.herstellerTyp].filter(Boolean).join(' ') || '–'}{form.seriennummer ? `, Seriennr. ${form.seriennummer}` : ''}</dd></div>
          <div><dt className="text-muted-foreground">Standort</dt><dd>{[form.gebaeude, form.ebene, form.raumbezeichnung].filter(Boolean).join(' · ') || '–'}</dd></div>
          <div><dt className="text-muted-foreground">Nutzung</dt><dd>{form.nutzungsart || '–'}{form.lagerklasse ? ` (${form.lagerklasse})` : ''}</dd></div>
          <div><dt className="text-muted-foreground">Abluft</dt><dd>{form.abluftVorhanden ? 'Vorhanden' : 'Nicht vorhanden'}{form.abluftUeberwachung ? ', überwacht' : ''}</dd></div>
          <div><dt className="text-muted-foreground">Elektro</dt><dd>{form.elektrischAusgestattet ? 'Ausgestattet' : 'Nicht ausgestattet'}{form.potentialausgleich ? ', Potentialausgleich vorhanden' : ', kein Potentialausgleich'}</dd></div>
          <div><dt className="text-muted-foreground">Ex-Schutz</dt><dd>{form.exAssessmentStatus === 'NOT_ASSESSED' ? 'Noch nicht bewertet' : form.exAssessmentStatus === 'REQUIRED' ? `Erforderlich (${form.exZoneKlassifikation || 'Zone offen'})` : 'Nicht erforderlich'}</dd></div>
          <div><dt className="text-muted-foreground">Prüfstatus (bekannt)</dt><dd>{form.pruefpflichtNorm || '–'}{form.letztePruefungAm ? `, zuletzt ${form.letztePruefungAm}` : ''}</dd></div>
          <div><dt className="text-muted-foreground">Fotos/Dokumente</dt><dd>{documents.length} hochgeladen</dd></div>
        </dl>
        {textarea('Allgemeine Bestandsnotiz (z. B. Mängel, Besonderheiten)', 'bestandsBeschreibung')}
      </div>}

      {step === 9 && <div className="mt-5">
        {bestandsaufnahmeAbgeschlossen
          ? <p className="rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">Die Bestandsaufnahme für diesen Schrank ist bereits abgeschlossen. Änderungen in den vorherigen Schritten wurden gespeichert; ein erneuter Abschluss aktualisiert nur die vorhandenen Daten.</p>
          : <p className="text-sm text-muted-foreground">Mit „Aufnahme abschließen“ wird der Zeitpunkt der Bestandsaufnahme festgehalten. Die Planung (Soll-Maßnahmen) erfolgt danach separat am Schrank.</p>}
        <button disabled={saving} onClick={abschliessen} className="mt-4 rounded-lg bg-emerald-700 px-6 py-3 text-base font-600 text-white disabled:opacity-50">Aufnahme abschließen</button>
      </div>}

      {error && <p role="alert" className="mt-4 text-sm text-red-700">{error}</p>}

      <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-stone-100 pt-4">
        <button disabled={step === 0} onClick={zurueck} className="rounded-lg border border-stone-300 px-5 py-3 text-base disabled:opacity-40">Zurück</button>
        {step < STEP_TITLES.length - 1 && <button disabled={saving} onClick={zwischenspeichern} className="rounded-lg border border-stone-400 px-5 py-3 text-base disabled:opacity-50">Zwischenspeichern</button>}
        {step < STEP_TITLES.length - 1 && <button disabled={saving} onClick={weiter} className="rounded-lg bg-stone-800 px-6 py-3 text-base font-600 text-white disabled:opacity-50">Weiter</button>}
        {savedAt && !saving && <span className="text-sm text-emerald-700">Gespeichert.</span>}
      </div>
    </div>
  </div>
}

function CabinetDocUpload({ projectId, cabinetId, onUploaded }: { projectId: string; cabinetId: string; onUploaded: (doc: CabinetDoc) => void }) {
  const [kind, setKind] = useState<string>('Übersicht')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const upload = async (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    const file = inputRef.current?.files?.[0]
    if (!file) { setError('Bitte eine Datei auswählen.'); return }
    const formData = new FormData()
    formData.set('file', file)
    formData.set('projectId', projectId)
    formData.set('cabinetId', cabinetId)
    formData.set('documentKind', kind)
    setPending(true)
    try {
      const response = await fetch('/api/collaboration/documents', { method: 'POST', body: formData })
      const result = await response.json()
      if (!response.ok || !result.ok) throw new Error(result.error || 'Upload fehlgeschlagen')
      onUploaded({ id: result.document.id, documentKind: result.document.documentKind, originalName: result.document.originalName, fileSize: result.document.fileSize })
      if (inputRef.current) inputRef.current.value = ''
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Upload fehlgeschlagen')
    } finally {
      setPending(false)
    }
  }

  return <form onSubmit={upload} className="mt-3 flex flex-wrap items-end gap-3 rounded-lg bg-stone-50 p-4">
    <label className="block"><span className="text-sm font-600">Kategorie</span><select value={kind} onChange={(event) => setKind(event.target.value)} className="mt-2 rounded-lg border border-stone-300 px-4 py-3 text-base">
      {PHOTO_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
    </select></label>
    <label className="block"><span className="text-sm font-600">Foto/Datei</span><input ref={inputRef} type="file" required className="mt-2 block text-base" /></label>
    <button disabled={pending} className="rounded-lg bg-stone-800 px-5 py-3 text-base font-600 text-white disabled:opacity-50">Hochladen</button>
    {error && <p role="alert" className="w-full text-sm text-red-700">{error}</p>}
  </form>
}
