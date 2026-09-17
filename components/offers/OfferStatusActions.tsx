'use client'
// components/offers/OfferStatusActions.tsx
// Rendert die richtigen Aktions-Buttons je nach aktuellem Angebots-Status.
// Nutzt ConfirmDialog aus Phase 3 (shared).

import { forwardRef, useRef, useState, type ButtonHTMLAttributes } from 'react'
import { useRouter }               from 'next/navigation'
import { ConfirmDialog }           from '@/components/shared/ConfirmDialog'
import {
  changeOfferStatusAction,
  convertToOrderAction,
  deleteOfferAction,
} from '@/app/(dashboard)/offers/actions'
import type { OfferStatus } from '@/types/enums'
import { OfferStatusBadge } from './OfferStatusBadge'

interface OfferStatusActionsProps {
  offerId:     string
  status:      OfferStatus
  totalGross:  number
  offerNumber: string
  canEdit:     boolean
  canDelete:   boolean
  canConvert:  boolean  // role: ORDER create
  showConversion?: boolean
  compactDecision?: boolean
}

export function OfferStatusActions({
  offerId, status, totalGross, offerNumber, canEdit, canDelete, canConvert,
  showConversion = true,
  compactDecision = false,
}: OfferStatusActionsProps) {
  const router            = useRouter()
  const [error, setError] = useState<string | null>(null)
  const statusChangePending = useRef(false)

  async function doStatusChange(toStatus: OfferStatus) {
    if (statusChangePending.current) return
    statusChangePending.current = true
    setError(null)
    try {
      const res = await changeOfferStatusAction(offerId, toStatus)
      if (!res.success) {
        setError(res.error ?? 'Statuswechsel fehlgeschlagen.')
        return
      }
      if (res.error) setError(res.error)
      router.refresh()
    } catch {
      setError('Statuswechsel fehlgeschlagen. Bitte versuchen Sie es erneut.')
    } finally {
      statusChangePending.current = false
    }
  }

  const fmt = totalGross.toLocaleString('de-DE', {
    style:    'currency',
    currency: 'EUR',
  })

  return (
    <div className="space-y-3">
      {error && (
        <div role="alert" className="p-2.5 rounded bg-red-50 border border-red-200 text-xs text-red-700">
          {error}
        </div>
      )}

      {/* DRAFT actions */}
      {status === 'DRAFT' && (
        <>
          {canEdit && (
            <ActionLink href={`/offers/${offerId}/edit`} label="Bearbeiten" variant="secondary" icon="edit" />
          )}
          <ConfirmDialog
            title="Angebot versenden?"
            description={`„${offerNumber}" wird als versendet markiert (${fmt}). Danach ist keine direkte Bearbeitung mehr möglich.`}
            confirmLabel="Als versendet markieren"
            onConfirm={() => doStatusChange('SENT' as OfferStatus)}
            trigger={<ActionButton label="Als versendet markieren" variant="primary" icon="send" />}
          />
          {canDelete && (
            <ConfirmDialog
              title="Angebot löschen?"
              description={`Entwurf „${offerNumber}" wird unwiderruflich gelöscht.`}
              confirmLabel="Löschen"
              danger
              onConfirm={async () => {
                const res = await deleteOfferAction(offerId)
                if (!res.success) { setError(res.error ?? 'Fehler'); return }
                router.push('/offers')
              }}
              trigger={<ActionButton label="Entwurf löschen" variant="danger" icon="delete" />}
            />
          )}
        </>
      )}

      {/* SENT actions */}
      {status === 'SENT' && (
        <div className={compactDecision ? 'grid w-full grid-cols-1 gap-2' : 'space-y-3'}>
          <ConfirmDialog
            title="Angebot als angenommen markieren?"
            description={`„${offerNumber}" (${fmt}) wird auf ANGENOMMEN gesetzt. Die Umwandlung in einen Auftrag wird danach möglich.`}
            confirmLabel="Angenommen"
            onConfirm={() => doStatusChange('ACCEPTED' as OfferStatus)}
            trigger={<ActionButton label="Angenommen" variant="success" icon="check" />}
          />
          <ConfirmDialog
            title="Angebot als abgelehnt markieren?"
            description={`„${offerNumber}" wird auf ABGELEHNT gesetzt.`}
            confirmLabel="Abgelehnt"
            danger
            onConfirm={() => doStatusChange('REJECTED' as OfferStatus)}
            trigger={<ActionButton label="Abgelehnt" variant="danger" icon="x" />}
          />
          <ConfirmDialog
            title="Angebot als abgelaufen markieren?"
            description={`„${offerNumber}" Gültigkeitszeitraum ist abgelaufen.`}
            confirmLabel="Als abgelaufen markieren"
            onConfirm={() => doStatusChange('EXPIRED' as OfferStatus)}
            trigger={<ActionButton label="Abgelaufen" variant="secondary" icon="clock" />}
          />
        </div>
      )}

      {/* ACCEPTED actions */}
      {status === 'ACCEPTED' && canConvert && showConversion && (
        <OfferConvertAction offerId={offerId} offerNumber={offerNumber} totalGross={totalGross} />
      )}

      {/* Terminal states */}
      {(status === 'REJECTED' || status === 'EXPIRED' || status === 'CONVERTED_TO_ORDER') && (
        <div className="text-xs text-muted-foreground text-center py-2">
          Keine weiteren Aktionen verfügbar
        </div>
      )}
    </div>
  )
}

export function OfferConvertAction({ offerId, offerNumber, totalGross }: {
  offerId: string
  offerNumber: string
  totalGross: number
}) {
  const [error, setError] = useState<string | null>(null)
  const total = totalGross.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })
  return (
    <div className="space-y-2">
      {error && <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">{error}</p>}
      <ConfirmDialog
        title="In Auftrag umwandeln?"
        description={`„${offerNumber}" (${total}) wird vollständig mit Textbereichen, Positionen und Schlussangaben in einen neuen Auftrag übernommen. Nicht benötigte Karten können anschließend im Auftrag entfernt werden. Diese Aktion kann nicht rückgängig gemacht werden.`}
        confirmLabel="Auftrag anlegen"
        onConfirm={async () => {
          const res = await convertToOrderAction(offerId)
          if (!res.success) setError(res.error ?? 'Fehler')
        }}
        trigger={<ActionButton label="In Auftrag umwandeln" variant="convert" icon="arrow" />}
      />
    </div>
  )
}

// ── Action primitives ─────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'danger' | 'success' | 'convert'

const ActionButton = forwardRef<HTMLButtonElement, {
  label: string
  variant: Variant
  icon: string
} & ButtonHTMLAttributes<HTMLButtonElement>>(function ActionButton({
  label, variant, icon, className = '', ...buttonProps
}, ref) {
  const styles: Record<Variant, string> = {
    primary:   'bg-blue-700 hover:bg-blue-800 text-white border-transparent',
    secondary: 'bg-white hover:bg-stone-50 text-foreground border-stone-200',
    danger:    'bg-white hover:bg-red-50 text-red-600 border-red-200',
    success:   'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent',
    convert:   'bg-violet-600 hover:bg-violet-700 text-white border-transparent',
  }
  return (
    <button
      {...buttonProps}
      ref={ref}
      type="button"
      className={`flex min-h-9 w-full items-center justify-start gap-2 rounded-md border px-4 py-2 text-left text-sm font-500 leading-tight transition-colors ${styles[variant]} ${className}`}
    >
      <BtnIcon name={icon} />
      {label}
    </button>
  )
})

function ActionLink({ href, label, variant, icon }: { href: string; label: string; variant: Variant; icon: string }) {
  const styles: Record<Variant, string> = {
    primary:   'bg-blue-700 hover:bg-blue-800 text-white border-transparent',
    secondary: 'bg-white hover:bg-stone-50 text-foreground border-stone-200',
    danger:    'bg-white hover:bg-red-50 text-red-600 border-red-200',
    success:   'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent',
    convert:   'bg-violet-600 hover:bg-violet-700 text-white border-transparent',
  }
  return (
    <a
      href={href}
      className={`w-full flex items-center gap-2 h-9 px-4 rounded-md border text-sm font-500 transition-colors ${styles[variant]}`}
    >
      <BtnIcon name={icon} />
      {label}
    </a>
  )
}

function BtnIcon({ name }: { name: string }) {
  const cls = "w-4 h-4 shrink-0"
  if (name === 'edit')   return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/></svg>
  if (name === 'send')   return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5"/></svg>
  if (name === 'check')  return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5"/></svg>
  if (name === 'x')      return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12"/></svg>
  if (name === 'clock')  return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
  if (name === 'delete') return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"/></svg>
  if (name === 'arrow')  return <svg className={cls} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3"/></svg>
  return null
}
