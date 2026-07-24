'use client'
// components/payments/PaymentJournal.tsx
// Zahlungsübersicht pro Rechnung mit Entfernen-Option

import { useState }       from 'react'
import { useRouter }      from 'next/navigation'
import { ConfirmDialog }  from '@/components/shared/ConfirmDialog'
import { removePaymentAction } from '@/app/(dashboard)/payments/actions'
import { PAYMENT_METHODS } from '@/lib/validators/payment.schema'
import { format }         from 'date-fns'
import { de }             from 'date-fns/locale'
import type { PaymentSummary } from '@/lib/services/payment.service'

interface PaymentJournalProps {
  payments:    PaymentSummary[]
  totalGross:  number
  paidAmount:  number
  invoiceStatus: string
  canDelete:   boolean
}

export function PaymentJournal({
  payments, totalGross, paidAmount, invoiceStatus, canDelete,
}: PaymentJournalProps) {
  const router = useRouter()
  const fmt    = (n: number) =>
    n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const remaining = Math.round((totalGross - paidAmount) * 100) / 100

  function methodLabel(m: string | null) {
    if (!m) return '–'
    return PAYMENT_METHODS.find((p) => p.value === m)?.label ?? m
  }

  if (payments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        Noch keine Zahlungen erfasst.
      </p>
    )
  }

  return (
    <div>
      <table className="data-table">
        <thead>
          <tr>
            <th>Datum</th>
            <th>Zahlungsart</th>
            <th>Referenz</th>
            <th className="num text-right">Betrag</th>
            {canDelete && <th className="w-10" />}
          </tr>
        </thead>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
              <td className="mono text-xs">
                {format(new Date(p.paymentDate), 'dd.MM.yyyy', { locale: de })}
              </td>
              <td className="text-sm">{methodLabel(p.method)}</td>
              <td>
                {p.reference
                  ? <span className="mono text-xs text-muted-foreground">{p.reference}</span>
                  : <span className="text-muted-foreground text-xs">–</span>}
              </td>
              <td className="num text-right">
                <span className="mono text-sm font-500 text-emerald-700">
                  {fmt(p.amount)} €
                </span>
              </td>
              {canDelete && (
                <td>
                  <ConfirmDialog
                    title="Zahlung entfernen?"
                    description={`Die Zahlung über ${fmt(p.amount)} € wird storniert. Der Rechnungsstatus wird entsprechend angepasst. Die Aktion wird im Audit-Log erfasst.`}
                    confirmLabel="Entfernen"
                    danger
                    onConfirm={async () => {
                      const res = await removePaymentAction(p.id, 'Manuell entfernt')
                      if (!res.success) throw new Error(res.error)
                      router.refresh()
                    }}
                    trigger={
                      <button className="p-1.5 rounded text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/>
                        </svg>
                      </button>
                    }
                  />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>

      {/* Summary row */}
      <div className="px-4 py-3 border-t border-stone-100 bg-stone-50/50 flex justify-between items-center">
        <span className="text-xs text-muted-foreground">
          {payments.length} Zahlung{payments.length !== 1 ? 'en' : ''}
        </span>
        <div className="flex gap-6 text-sm">
          <span className="text-muted-foreground">
            Bezahlt: <span className="mono font-500 text-emerald-700">{fmt(paidAmount)} €</span>
          </span>
          {remaining > 0 && (
            <span className="text-muted-foreground">
              Offen: <span className="mono font-500 text-amber-700">{fmt(remaining)} €</span>
            </span>
          )}
          {remaining <= 0 && (
            <span className="text-emerald-600 font-500 text-xs flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd"/></svg>
              Vollständig bezahlt
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
