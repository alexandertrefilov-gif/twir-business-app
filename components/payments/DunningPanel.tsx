'use client'
// components/payments/DunningPanel.tsx
// Mahnwesen-Widget auf der Rechnungsdetailseite

import { useActionState, useState }  from 'react'
import { useRouter }                 from 'next/navigation'
import { FormSubmitButton }          from '@/components/shared/FormSubmitButton'
import { ConfirmDialog }             from '@/components/shared/ConfirmDialog'
import { createDunningAction, markDunningNoticeSentAction } from '@/app/(dashboard)/payments/actions'
import { DUNNING_LEVELS }            from '@/lib/services/dunning.service'
import type { DunningEligibilityDto, DunningNoticeData } from '@/lib/services/dunning.service'
import type { ActionState }          from '@/app/(dashboard)/payments/actions'
import { formatBerlinDateShortYear, formatCalendarDate } from '@/lib/utils/berlin-date'

interface DunningPanelProps {
  invoiceId:   string
  notices:     DunningNoticeData[]
  canManage:   boolean
  /**
   * REQ-029 P5-3: Ergebnis der zentralen Mahn-Policy (serverseitig berechnet), nur zur ANZEIGE.
   * `null` = konnte nicht ermittelt werden → es wird nichts angeboten. Die verbindliche Prüfung erfolgt
   * unabhängig davon beim Anlegen im Service (`createDunningNotice`).
   */
  eligibility: DunningEligibilityDto | null
  /** Rechnungsstatus erlaubt „als versendet markieren“ (Anzeige; der Service prüft erneut). */
  canMarkSent: boolean
}

const INIT: ActionState = {}

/** Addiert Kalendertage auf ein `JJJJ-MM-TT`-Datum (UTC-Rechnung, unabhängig von der Browser-Zeitzone). */
export function addDaysIso(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** `JJJJ-MM-TT` → `TT.MM.JJJJ`. */
export function formatIsoDateDe(isoDate: string): string {
  const [year, month, day] = isoDate.split('-')
  return `${day}.${month}.${year}`
}

/** Cent-String ("1234.50") → "1.234,50" – reine Zeichenkettenarbeit, keine Gleitkommazahl. */
export function formatEuroAmount(amount: string): string {
  const negative = amount.startsWith('-')
  const [integer, fraction = '00'] = amount.replace('-', '').split('.')
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${negative ? '-' : ''}${grouped},${fraction.padEnd(2, '0')}`
}

export function DunningPanel({
  invoiceId, notices, canManage, eligibility, canMarkSent,
}: DunningPanelProps) {
  const router            = useRouter()
  const [state, formAction] = useActionState(
    async (prev: ActionState, fd: FormData) => {
      const res = await createDunningAction(prev, fd)
      if (res.success) router.refresh()
      return res
    },
    INIT,
  )
  const [showForm, setShowForm] = useState(false)
  const [markError, setMarkError] = useState<string | null>(null)

  // Anzeige-Entscheidung kommt allein aus der serverseitigen Policy; hier gibt es keine eigene Status- oder Stufenlogik.
  const nextLevel   = eligibility?.ok ? eligibility.nextLevel : null
  const canCreate   = canManage && eligibility?.ok === true && nextLevel !== null
  const maxReached  = eligibility?.reasons.includes('MAX_LEVEL') === true
  const berlinDate  = eligibility?.berlinDate ?? null

  // Vorschlag in Berliner Kalendertagen; Mindestwert = morgen (der Service lehnt „heute und früher“ ab).
  const defaultDue  = canCreate && berlinDate && nextLevel ? addDaysIso(berlinDate, DUNNING_LEVELS[nextLevel].dueDays) : ''
  const minDue      = berlinDate ? addDaysIso(berlinDate, 1) : undefined
  const defaultFee  = nextLevel ? DUNNING_LEVELS[nextLevel].defaultFee : null

  return (
    <div className="space-y-4">
      {/* Existing notices */}
      {notices.length > 0 && (
        <div className="space-y-2">
          {notices.map((n) => (
            <div key={n.id}
              className="flex items-center justify-between gap-3 p-3 rounded-md border border-stone-200 bg-stone-50">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-500 ${
                    n.level === 1 ? 'bg-blue-50 text-blue-700 border-blue-200' :
                    n.level === 2 ? 'bg-amber-50 text-amber-700 border-amber-200' :
                    'bg-red-50 text-red-700 border-red-200'
                  }`}>
                    Stufe {n.level}
                  </span>
                  <span className="text-sm font-500 text-foreground">{n.levelLabel}</span>
                </div>
                <div className="flex gap-3 mt-1 text-xs text-muted-foreground">
                  <span>Fällig: {formatCalendarDate(n.dueDate)}</span>
                  {n.fee && <span>Gebühr: {n.fee.toFixed(2)} €</span>}
                  {n.sentAt && <span className="text-emerald-600">✓ Versendet {formatBerlinDateShortYear(n.sentAt)}</span>}
                </div>
              </div>
              {canManage && canMarkSent && !n.sentAt && (
                <ConfirmDialog
                  title="Als versendet markieren?"
                  description={`„${n.levelLabel}" wird als versendet markiert. Das Datum wird gespeichert.`}
                  confirmLabel="Versendet"
                  onConfirm={async () => {
                    const res = await markDunningNoticeSentAction(n.id, null)
                    setMarkError(res.success ? null : (res.error ?? 'Die Mahnung konnte nicht als versendet markiert werden.'))
                    router.refresh()
                  }}
                  trigger={
                    <button className="h-7 px-2.5 rounded border border-blue-200 bg-blue-50 text-blue-700 text-xs font-500 hover:bg-blue-100 transition-colors whitespace-nowrap">
                      Als versendet markieren
                    </button>
                  }
                />
              )}
            </div>
          ))}
        </div>
      )}

      {notices.length === 0 && (
        <p className="text-sm text-muted-foreground">Keine Mahnungen zu dieser Rechnung.</p>
      )}

      {markError && (
        <p role="alert" className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
          {markError}
        </p>
      )}

      {/* Mahnbasis (nur wenn die Policy eine Mahnung zulässt) */}
      {canManage && eligibility?.ok && eligibility.outstandingAmount !== null && (
        <p className="text-xs text-muted-foreground">
          Mahnbasis: offener Betrag {formatEuroAmount(eligibility.outstandingAmount)} € (Stand: {formatIsoDateDe(eligibility.berlinDate)})
        </p>
      )}

      {/* Create dunning form */}
      {canCreate && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center gap-2 h-9 px-4 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-sm font-500 hover:bg-amber-100 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          {nextLevel === 1 ? 'Zahlungserinnerung erstellen' : `${nextLevel ? DUNNING_LEVELS[nextLevel].label : ''} erstellen`}
        </button>
      )}

      {canCreate && showForm && nextLevel !== null && (
        <form action={formAction}
          className="p-4 rounded-md border border-amber-200 bg-amber-50/30 space-y-3">
          <input type="hidden" name="invoiceId" value={invoiceId} />
          <input type="hidden" name="level"     value={nextLevel} />

          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded border font-mono font-500 ${
              nextLevel === 1 ? 'bg-blue-50 text-blue-700 border-blue-200' :
              nextLevel === 2 ? 'bg-amber-50 text-amber-700 border-amber-200' :
              'bg-red-50 text-red-700 border-red-200'
            }`}>Stufe {nextLevel}</span>
            <span className="text-sm font-600">{DUNNING_LEVELS[nextLevel].label}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label field-required">Neues Zahlungsziel</label>
              <input type="date" name="dueDate" required defaultValue={defaultDue} min={minDue}
                className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
            </div>
            {nextLevel >= 2 && (
              <div>
                <label className="field-label">Mahngebühr (€)</label>
                <input type="number" name="fee" step="0.01" min="0"
                  defaultValue={defaultFee ?? ''}
                  placeholder="0,00"
                  className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm mono text-right focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent" />
              </div>
            )}
          </div>

          {state.error && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">
              {state.error}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowForm(false)}
              className="h-8 px-3 rounded-md border border-stone-200 bg-white text-sm text-foreground hover:bg-stone-50 transition-colors">
              Abbrechen
            </button>
            <FormSubmitButton
              idleLabel="Mahnung erstellen"
              pendingLabel="Wird erstellt…"
              className="h-8 px-4 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-sm font-500 disabled:opacity-50 transition-colors"
            />
          </div>
        </form>
      )}

      {/* Gesperrt: Gründe aus der Policy verständlich anzeigen (nie eine leere Fläche ohne Hinweis) */}
      {canManage && eligibility && !eligibility.ok && maxReached && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700">
          Maximale Mahnstufe erreicht. Bitte rechtliche Schritte einleiten.
        </div>
      )}

      {canManage && eligibility && !eligibility.ok && !maxReached && (
        <div className="p-3 rounded bg-stone-50 border border-stone-200 text-xs text-stone-700 space-y-1">
          <p className="font-500">Eine Mahnung kann derzeit nicht erstellt werden:</p>
          <ul className="list-disc pl-4 space-y-0.5">
            {eligibility.messages.map((message) => <li key={message}>{message}</li>)}
          </ul>
        </div>
      )}

      {canManage && eligibility === null && (
        <div className="p-3 rounded bg-amber-50 border border-amber-200 text-xs text-amber-800">
          Die Mahnfähigkeit dieser Rechnung konnte nicht ermittelt werden. Bitte Seite neu laden oder den Administrator informieren.
        </div>
      )}
    </div>
  )
}
