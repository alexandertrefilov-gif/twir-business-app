'use client'
// components/invoices/InvoiceActions.tsx
// Status-Workflow-Sidebar für die Rechnungsdetailseite.
// Nutzt: ConfirmDialog (Phase 3), addPaymentAction (Phase 7)

import { useState }        from 'react'
import { useRouter }       from 'next/navigation'
import { ConfirmDialog }   from '@/components/shared/ConfirmDialog'
import {
  finalizeInvoiceAction,
  cancelInvoiceAction,
  changeInvoiceStatusAction,
  deleteInvoiceDraftAction,
} from '@/app/(dashboard)/invoices/actions'
import type { InvoiceStatus } from '@/types/enums'

interface InvoiceActionsProps {
  invoiceId:     string
  status:        InvoiceStatus
  invoiceNumber: string | null
  totalGross:    number
  canFinalize:   boolean
  canCancel:     boolean
  canEdit:       boolean
  canDelete:     boolean
}

export function InvoiceActions({
  invoiceId, status, invoiceNumber, totalGross, canFinalize, canCancel, canEdit, canDelete,
}: InvoiceActionsProps) {
  const router            = useRouter()
  const [error, setError] = useState<string | null>(null)

  const fmt = totalGross.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  const ref = invoiceNumber ?? 'Entwurf'

  async function doChange(to: InvoiceStatus) {
    setError(null)
    const res = await changeInvoiceStatusAction(invoiceId, to)
    if (!res.success) setError(res.error ?? 'Fehler')
    else router.refresh()
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</p>
      )}

      {/* DRAFT */}
      {status === 'DRAFT' && (
        <>
          {canEdit && (
            <a href={`/invoices/${invoiceId}/edit`}
              className="w-full flex items-center gap-2 h-9 px-4 rounded-md border border-stone-200 bg-white text-sm font-500 hover:bg-stone-50 transition-colors">
              <PencilIcon /> Bearbeiten
            </a>
          )}
          {canFinalize && (
            <ConfirmDialog
              title="Rechnung finalisieren?"
              description={`„${ref}" (${fmt}) wird finalisiert. Eine Rechnungsnummer wird vergeben. Danach sind keine direkten Änderungen mehr möglich.`}
              confirmLabel="Jetzt finalisieren"
              onConfirm={async () => {
                const res = await finalizeInvoiceAction(invoiceId)
                if (!res.success) { setError(res.error ?? 'Fehler'); return }
                router.refresh()
              }}
              trigger={
                <button className="w-full flex items-center gap-2 h-9 px-4 rounded-md bg-blue-700 hover:bg-blue-800 text-white text-sm font-500 transition-colors">
                  <CheckCircleIcon /> Rechnung finalisieren
                </button>
              }
            />
          )}
          {canDelete && (
            <ConfirmDialog
              title="Rechnungsentwurf löschen?"
              description="Der Rechnungsentwurf und seine Positionen werden dauerhaft gelöscht. Diese Aktion kann nicht rückgängig gemacht werden."
              confirmLabel="Entwurf löschen"
              danger
              onConfirm={async () => {
                const res = await deleteInvoiceDraftAction(invoiceId)
                if (!res.success) { setError(res.error ?? 'Fehler'); return }
                router.push('/invoices')
                router.refresh()
              }}
              trigger={
                <button className="w-full flex items-center gap-2 h-9 px-4 rounded-md border border-red-200 bg-white text-sm font-500 text-red-600 hover:bg-red-50 transition-colors">
                  <TrashIcon /> Entwurf löschen
                </button>
              }
            />
          )}
        </>
      )}

      {/* FINALIZED */}
      {status === 'FINALIZED' && (
        <>
          <ConfirmDialog
            title="Als versendet markieren?"
            description={`„${ref}" wird auf Status VERSENDET gesetzt.`}
            confirmLabel="Als versendet markieren"
            onConfirm={() => doChange('SENT' as InvoiceStatus)}
            trigger={
              <button className="w-full flex items-center gap-2 h-9 px-4 rounded-md bg-sky-600 hover:bg-sky-700 text-white text-sm font-500 transition-colors">
                <SendIcon /> Als versendet markieren
              </button>
            }
          />
          {canCancel && <CancelButton invoiceId={invoiceId} ref_={ref} setError={setError} />}
        </>
      )}

      {/* SENT */}
      {status === 'SENT' && (
        <>
          <ConfirmDialog
            title="Als überfällig markieren?"
            description={`„${ref}" wird auf ÜBERFÄLLIG gesetzt. Mahnstufe 1 kann dann erstellt werden.`}
            confirmLabel="Als überfällig markieren"
            onConfirm={() => doChange('OVERDUE' as InvoiceStatus)}
            trigger={
              <button className="w-full flex items-center gap-2 h-9 px-4 rounded-md border border-amber-300 bg-amber-50 text-amber-800 text-sm font-500 hover:bg-amber-100 transition-colors">
                <ClockIcon /> Als überfällig markieren
              </button>
            }
          />
          {canCancel && <CancelButton invoiceId={invoiceId} ref_={ref} setError={setError} />}
        </>
      )}

      {/* OVERDUE */}
      {status === 'OVERDUE' && canCancel && (
        <CancelButton invoiceId={invoiceId} ref_={ref} setError={setError} />
      )}

      {/* PARTIALLY_PAID */}
      {status === 'PARTIALLY_PAID' && (
        <p className="text-xs text-muted-foreground text-center py-1">
          Zahlung erfassen zum Abschließen
        </p>
      )}

      {/* Terminal states */}
      {(status === 'PAID' || status === 'CANCELLED' || status === 'CORRECTED') && (
        <p className="text-xs text-muted-foreground text-center py-2">Keine weiteren Aktionen verfügbar</p>
      )}
    </div>
  )
}

// ── Cancel button sub-component ───────────────────────────────

function CancelButton({ invoiceId, ref_, setError }: {
  invoiceId: string; ref_: string
  setError: (e: string | null) => void
}) {
  const router = useRouter()
  return (
    <ConfirmDialog
      title="Rechnung stornieren?"
      description={`„${ref_}" wird storniert. Eine Stornorechnung mit negativen Beträgen wird automatisch erstellt. Diese Aktion kann nicht rückgängig gemacht werden.`}
      confirmLabel="Stornieren"
      danger
      onConfirm={async () => {
        const res = await cancelInvoiceAction(invoiceId, 'Manuelle Stornierung')
        if (!res.success) { setError(res.error ?? 'Fehler'); return }
        // redirect happens inside action on success
      }}
      trigger={
        <button className="w-full flex items-center gap-2 h-9 px-4 rounded-md border border-red-200 bg-white text-sm font-500 text-red-600 hover:bg-red-50 transition-colors">
          <XCircleIcon /> Rechnung stornieren
        </button>
      }
    />
  )
}

// ── Icons ─────────────────────────────────────────────────────

const IC = "w-4 h-4 shrink-0"
function PencilIcon()     { return <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg> }
function CheckCircleIcon(){ return <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> }
function SendIcon()       { return <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg> }
function ClockIcon()      { return <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> }
function XCircleIcon()    { return <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 9.75l4.5 4.5m0-4.5l-4.5 4.5M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg> }
function TrashIcon()      { return <svg className={IC} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166M19.228 5.79L18.16 19.673A2.25 2.25 0 0115.916 21H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0V4.477c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg> }
