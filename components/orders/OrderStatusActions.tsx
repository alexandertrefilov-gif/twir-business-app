'use client'
// components/orders/OrderStatusActions.tsx

import { useState }     from 'react'
import { useRouter }    from 'next/navigation'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { changeOrderStatusAction, deleteOrderAction } from '@/app/(dashboard)/orders/actions'
import type { OrderStatus } from '@/types/enums'

interface OrderStatusActionsProps {
  orderId:     string
  status:      OrderStatus
  orderNumber: string
  canEdit:     boolean
  canDelete:   boolean
}

export function OrderStatusActions({
  orderId, status, orderNumber, canEdit, canDelete,
}: OrderStatusActionsProps) {
  const router            = useRouter()
  const [error, setError] = useState<string | null>(null)

  async function doChange(to: OrderStatus) {
    setError(null)
    const res = await changeOrderStatusAction(orderId, to)
    if (!res.success) setError(res.error ?? 'Fehler')
    else router.refresh()
  }

  return (
    <div className="space-y-2">
      {error && (
        <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-2">{error}</p>
      )}

      {/* OPEN */}
      {status === 'OPEN' && (
        <>
          {canEdit && (
            <a href={`/orders/${orderId}/edit`}
              className="w-full flex items-center gap-2 h-9 px-4 rounded-md border border-stone-200 bg-white text-sm font-500 hover:bg-stone-50 transition-colors">
              <EditIcon /> Bearbeiten
            </a>
          )}
          <ConfirmDialog
            title="Auftrag starten?"
            description={`„${orderNumber}" wird auf In Bearbeitung gesetzt.`}
            confirmLabel="Starten"
            onConfirm={() => doChange('IN_PROGRESS' as OrderStatus)}
            trigger={
              <button className="w-full flex items-center gap-2 h-9 px-4 rounded-md bg-amber-500 hover:bg-amber-600 text-white text-sm font-500 transition-colors">
                <PlayIcon /> In Bearbeitung setzen
              </button>
            }
          />
          {canDelete && (
            <ConfirmDialog
              title="Auftrag löschen?"
              description={`„${orderNumber}" wird unwiderruflich gelöscht. Nur möglich solange keine Leistungen erfasst sind.`}
              confirmLabel="Löschen" danger
              onConfirm={async () => {
                const res = await deleteOrderAction(orderId)
                if (!res.success) { setError(res.error ?? 'Fehler'); return }
                router.push('/orders')
              }}
              trigger={
                <button className="w-full flex items-center gap-2 h-9 px-4 rounded-md border border-red-200 bg-white text-sm font-500 text-red-600 hover:bg-red-50 transition-colors">
                  <TrashIcon /> Löschen
                </button>
              }
            />
          )}
        </>
      )}

      {/* IN_PROGRESS */}
      {status === 'IN_PROGRESS' && (
        <>
          <ConfirmDialog
            title="Auftrag abschließen?"
            description={`„${orderNumber}" wird auf Abgeschlossen gesetzt. Danach kann eine Rechnung erstellt werden.`}
            confirmLabel="Abschließen"
            onConfirm={() => doChange('COMPLETED' as OrderStatus)}
            trigger={
              <button className="w-full flex items-center gap-2 h-9 px-4 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-500 transition-colors">
                <CheckIcon /> Abschließen
              </button>
            }
          />
          <ConfirmDialog
            title="Auftrag abbrechen?"
            description={`„${orderNumber}" wird storniert. Bereits erfasste Leistungen bleiben erhalten.`}
            confirmLabel="Abbrechen" danger
            onConfirm={() => doChange('CANCELLED' as OrderStatus)}
            trigger={
              <button className="w-full flex items-center gap-2 h-9 px-4 rounded-md border border-red-200 bg-white text-sm font-500 text-red-600 hover:bg-red-50 transition-colors">
                <XIcon /> Auftrag abbrechen
              </button>
            }
          />
        </>
      )}

      {/* COMPLETED */}
      {(status === 'INVOICED' || status === 'CANCELLED') && (
        <p className="text-xs text-muted-foreground text-center py-2">Keine weiteren Statusänderungen</p>
      )}
    </div>
  )
}

// ── Icons ─────────────────────────────────────────────────────
const cls = "w-4 h-4 shrink-0"
function EditIcon()    { return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg> }
function PlayIcon()    { return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z"/></svg> }
function CheckIcon()   { return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg> }
function XIcon()       { return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg> }
function TrashIcon()   { return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg> }
