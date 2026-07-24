'use client'
// components/payments/DunningPanel.tsx
// Mahnwesen-Widget auf der Rechnungsdetailseite

import { useActionState, useState }  from 'react'
import { useRouter }                 from 'next/navigation'
import { FormSubmitButton }          from '@/components/shared/FormSubmitButton'
import { ConfirmDialog }             from '@/components/shared/ConfirmDialog'
import { createDunningAction, markDunningNoticeSentAction } from '@/app/(dashboard)/payments/actions'
import { DUNNING_LEVELS }            from '@/lib/services/dunning.service'
import type { DunningNoticeData }    from '@/lib/services/dunning.service'
import type { ActionState }          from '@/app/(dashboard)/payments/actions'
import { format }                    from 'date-fns'
import { de }                        from 'date-fns/locale'

interface DunningPanelProps {
  invoiceId:   string
  invoiceStatus: string
  notices:     DunningNoticeData[]
  canManage:   boolean
}

const INIT: ActionState = {}

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r.toISOString().slice(0, 10)
}

export function DunningPanel({
  invoiceId, invoiceStatus, notices, canManage,
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

  const highestLevel   = Math.max(0, ...notices.map((n) => n.level))
  const nextLevel      = (highestLevel + 1) as 1 | 2 | 3
  const canCreate      = canManage && nextLevel <= 3
    && !['PAID', 'CANCELLED', 'DRAFT'].includes(invoiceStatus)

  const defaultDue = addDays(new Date(), DUNNING_LEVELS[nextLevel <= 3 ? nextLevel : 3].dueDays)
  const defaultFee = nextLevel <= 3 ? DUNNING_LEVELS[nextLevel].defaultFee : null

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
                  <span>Fällig: {format(new Date(n.dueDate), 'dd.MM.yyyy', { locale: de })}</span>
                  {n.fee && <span>Gebühr: {n.fee.toFixed(2)} €</span>}
                  {n.sentAt && <span className="text-emerald-600">✓ Versendet {format(new Date(n.sentAt), 'dd.MM.yy', { locale: de })}</span>}
                </div>
              </div>
              {canManage && !n.sentAt && (
                <ConfirmDialog
                  title="Als versendet markieren?"
                  description={`„${n.levelLabel}" wird als versendet markiert. Das Datum wird gespeichert.`}
                  confirmLabel="Versendet"
                  onConfirm={async () => {
                    await markDunningNoticeSentAction(n.id, null)
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

      {/* Create dunning form */}
      {canCreate && !showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center gap-2 h-9 px-4 rounded-md border border-amber-200 bg-amber-50 text-amber-700 text-sm font-500 hover:bg-amber-100 transition-colors">
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15"/>
          </svg>
          {nextLevel === 1 ? 'Zahlungserinnerung erstellen' : `${DUNNING_LEVELS[nextLevel]?.label} erstellen`}
        </button>
      )}

      {canCreate && showForm && (
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
            <span className="text-sm font-600">{DUNNING_LEVELS[nextLevel]?.label}</span>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label field-required">Neues Zahlungsziel</label>
              <input type="date" name="dueDate" required defaultValue={defaultDue}
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

      {!canCreate && highestLevel >= 3 && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700">
          Maximale Mahnstufe erreicht. Bitte rechtliche Schritte einleiten.
        </div>
      )}
    </div>
  )
}
