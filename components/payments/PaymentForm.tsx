'use client'
// components/payments/PaymentForm.tsx
// Zahlungserfassung — pro Rechnung (inline auf Rechnungsdetailseite)
// + Restbetrag-Anzeige in Echtzeit

import { useState }                 from 'react'
import { useFormState }             from 'react-dom'
import { PAYMENT_METHODS }          from '@/lib/validators/payment.schema'
import { FormSubmitButton }         from '@/components/shared/FormSubmitButton'
import type { ActionState }         from '@/app/(dashboard)/payments/actions'

interface PaymentFormProps {
  invoiceId:    string
  totalGross:   number
  paidAmount:   number
  action:       (prev: ActionState, fd: FormData) => Promise<ActionState>
  onSuccess?:   () => void
}

const todayStr = () => new Date().toISOString().slice(0, 10)
const INIT: ActionState = {}

export function PaymentForm({
  invoiceId, totalGross, paidAmount, action, onSuccess,
}: PaymentFormProps) {
  const [state, formAction] = useFormState(
    async (prev: ActionState, fd: FormData) => {
      const res = await action(prev, fd)
      if (res.success && onSuccess) onSuccess()
      return res
    },
    INIT,
  )

  const remaining   = Math.round((totalGross - paidAmount) * 100) / 100
  const fe          = state.fieldErrors ?? {}
  const fmt         = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="invoiceId" value={invoiceId} />

      {state.error && !state.fieldErrors && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-sm text-red-700">
          {state.error}
        </div>
      )}

      {state.success && (
        <div className="p-3 rounded bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 flex items-center gap-2">
          <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd"/></svg>
          Zahlung wurde erfasst.
        </div>
      )}

      {/* Balance display */}
      <div className="grid grid-cols-3 gap-3 p-3 rounded-md bg-stone-50 border border-stone-200">
        <div className="text-center">
          <p className="text-[10px] font-600 uppercase tracking-wider text-muted-foreground">Rechnungsbetrag</p>
          <p className="mono text-sm font-600 mt-0.5">{fmt(totalGross)} €</p>
        </div>
        <div className="text-center border-x border-stone-200">
          <p className="text-[10px] font-600 uppercase tracking-wider text-muted-foreground">Bezahlt</p>
          <p className="mono text-sm font-600 text-emerald-700 mt-0.5">{fmt(paidAmount)} €</p>
        </div>
        <div className="text-center">
          <p className="text-[10px] font-600 uppercase tracking-wider text-muted-foreground">Offen</p>
          <p className={`mono text-sm font-600 mt-0.5 ${remaining > 0 ? 'text-amber-700' : 'text-stone-400'}`}>
            {fmt(remaining)} €
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Amount */}
        <div>
          <label className="field-label field-required" htmlFor="pay-amount">
            Zahlungsbetrag (€)
          </label>
          <div className="relative">
            <input
              id="pay-amount" name="amount" type="number"
              step="0.01" min="0.01" max={remaining} required
              defaultValue={remaining > 0 ? remaining.toFixed(2) : ''}
              placeholder={fmt(remaining)}
              className={`w-full h-9 pl-3 pr-6 rounded-md border bg-white text-sm mono text-right focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${fe.amount ? 'border-red-400' : 'border-stone-200'}`}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">€</span>
          </div>
          {fe.amount && <p className="field-error">{fe.amount[0]}</p>}
        </div>

        {/* Date */}
        <div>
          <label className="field-label field-required" htmlFor="pay-date">Zahlungsdatum</label>
          <input
            id="pay-date" name="paymentDate" type="date" required
            defaultValue={todayStr()}
            className={`w-full h-9 px-3 rounded-md border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent ${fe.paymentDate ? 'border-red-400' : 'border-stone-200'}`}
          />
        </div>

        {/* Method */}
        <div>
          <label className="field-label" htmlFor="pay-method">Zahlungsart</label>
          <select id="pay-method" name="method"
            className="w-full h-9 px-2.5 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent">
            <option value="">— Nicht angegeben —</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Reference */}
        <div>
          <label className="field-label" htmlFor="pay-ref">Verwendungszweck / Referenz</label>
          <input
            id="pay-ref" name="reference" type="text" maxLength={200}
            placeholder="z.B. RE-2024-0042"
            className="w-full h-9 px-3 rounded-md border border-stone-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        {/* Notes */}
        <div className="sm:col-span-2">
          <label className="field-label" htmlFor="pay-notes">Notizen (intern)</label>
          <textarea
            id="pay-notes" name="notes" rows={2}
            className="w-full px-3 py-2 rounded-md border border-stone-200 bg-white text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>
      </div>

      <div className="flex justify-end">
        <FormSubmitButton
          idleLabel="Zahlung erfassen"
          pendingLabel="Wird gespeichert…"
          disabled={remaining <= 0}
          className="h-9 px-5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-500 disabled:opacity-50 transition-colors"
        />
      </div>
    </form>
  )
}
