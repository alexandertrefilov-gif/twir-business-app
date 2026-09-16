'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'

type Membership = { id: string; role: string; user: { firstName: string; lastName: string } }

// Zeigt und bearbeitet ausschließlich SOLL-/PLANUNGS- und IST-NACH-
// UMSETZUNG/PRÜFUNG-Werte. Bestand (was vor Ort vorgefunden wurde) wird
// ausschließlich über den Bestandsaufnahme-Assistenten gepflegt — diese
// drei Ebenen dürfen laut Auftrag nicht in einem Formular vermischt werden.
export function GgaCabinetTechnicalForm({ cabinetId, canEdit, memberships, initial }: {
  cabinetId: string
  canEdit: boolean
  memberships: Membership[]
  initial: {
    abluftAnschlussdurchmesserSollMm: number | null
    abluftVolumenstromSollM3h: string | null
    abluftVolumenstromIstM3h: string | null
    pruefintervallMonate: number | null
    letztePruefungAm: string | null
    pruefpflichtNorm: string | null
    responsibleMembershipId: string | null
  }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [form, setForm] = useState(initial)

  const set = <K extends keyof typeof initial>(key: K, value: (typeof initial)[K]) => setForm((prev) => ({ ...prev, [key]: value }))

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        const response = await fetch('/api/collaboration/workflow', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'update-cabinet', id: cabinetId, data: form }),
        })
        const result = await response.json()
        if (!response.ok || !result.ok) throw new Error(result.error || 'Speichern fehlgeschlagen')
        setSaved(true)
        router.refresh()
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Aktion fehlgeschlagen')
      }
    })
  }

  if (!canEdit) return null

  const number = (label: string, key: keyof typeof initial, unit?: string) => <label className="block">
    <span className="text-xs font-600">{label}{unit ? ` (${unit})` : ''}</span>
    <input type="number" step="any" value={form[key] === null || form[key] === undefined ? '' : String(form[key])} onChange={(event) => set(key, (event.target.value === '' ? null : Number(event.target.value)) as never)} className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm" />
  </label>

  const text = (label: string, key: keyof typeof initial) => <label className="block">
    <span className="text-xs font-600">{label}</span>
    <input value={(form[key] as string) ?? ''} onChange={(event) => set(key, event.target.value as never)} className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm" />
  </label>

  return <form onSubmit={submit} className="mt-4 space-y-6">
    <section className="rounded-xl border border-blue-200 bg-blue-50/40 p-4">
      <h3 className="text-sm font-600 text-blue-900">SOLL / Planung — Abluft</h3>
      <p className="mt-1 text-xs text-blue-800/80">Was soll technisch hergestellt werden. Wird vom Planer festgelegt, unabhängig vom Bestand.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {number('Anschlussdurchmesser Soll', 'abluftAnschlussdurchmesserSollMm', 'mm')}
        {number('Volumenstrom Soll', 'abluftVolumenstromSollM3h', 'm³/h')}
      </div>
    </section>

    <section className="rounded-xl border border-emerald-200 bg-emerald-50/40 p-4">
      <h3 className="text-sm font-600 text-emerald-900">IST nach Umsetzung / Prüfung</h3>
      <p className="mt-1 text-xs text-emerald-800/80">Was tatsächlich gemessen bzw. geprüft wurde.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {number('Volumenstrom Ist (letzte Messung)', 'abluftVolumenstromIstM3h', 'm³/h')}
        <label className="block"><span className="text-xs font-600">Letzte Prüfung am</span><input type="date" value={form.letztePruefungAm ?? ''} onChange={(event) => set('letztePruefungAm', event.target.value as never)} className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm" /></label>
        {number('Prüfintervall', 'pruefintervallMonate', 'Monate')}
        {text('Prüfpflicht-Normbezug', 'pruefpflichtNorm')}
      </div>
    </section>

    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <h3 className="text-sm font-600 text-stone-800">Verantwortlichkeit</h3>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <label className="block">
          <span className="text-xs font-600">Verantwortlicher</span>
          <select value={form.responsibleMembershipId ?? ''} onChange={(event) => set('responsibleMembershipId', (event.target.value || null) as never)} className="mt-1 w-full rounded border border-stone-300 px-2 py-1 text-sm">
            <option value="">Nicht zugewiesen</option>
            {memberships.map((member) => <option key={member.id} value={member.id}>{member.user.firstName} {member.user.lastName}</option>)}
          </select>
        </label>
      </div>
    </section>

    <div className="flex items-center gap-3">
      <button disabled={pending} className="rounded bg-stone-800 px-4 py-2 text-sm font-600 text-white disabled:opacity-50">Speichern</button>
      {saved && !pending && <span className="text-xs text-emerald-700">Gespeichert.</span>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </div>
  </form>
}
