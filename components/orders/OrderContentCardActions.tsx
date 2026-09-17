'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { removeOrderContentCardAction } from '@/app/(dashboard)/orders/actions'
import type { OrderContentCard } from '@/lib/offers/rich-text'

const labels: Record<OrderContentCard, string> = {
  descriptionBefore: 'Thema und Beschreibung',
  positions: 'Positionen',
  descriptionAfter: 'Weitere Angebotsinhalte',
}

export function OrderContentCardActions({
  orderId,
  card,
}: {
  orderId: string
  card: OrderContentCard
}) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const label = labels[card]

  async function remove() {
    setError(null)
    const result = await removeOrderContentCardAction(orderId, card)
    if (!result.success) {
      setError(result.error ?? 'Karte konnte nicht entfernt werden')
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <Link
        href={`/orders/${orderId}/edit#order-content-cards`}
        className="inline-flex min-h-8 items-center rounded border border-stone-200 bg-white px-2.5 text-xs font-500 text-blue-700 hover:bg-stone-50"
      >
        Bearbeiten
      </Link>
      <ConfirmDialog
        title={`„${label}“ entfernen?`}
        description={`Die Karte „${label}“ wird aus diesem Auftrag entfernt. Das Ursprungsangebot bleibt unverändert.`}
        confirmLabel="Karte entfernen"
        danger
        onConfirm={remove}
        trigger={(
          <button
            type="button"
            className="inline-flex min-h-8 items-center rounded border border-red-200 bg-white px-2.5 text-xs font-500 text-red-600 hover:bg-red-50"
          >
            Entfernen
          </button>
        )}
      />
    </div>
  )
}
