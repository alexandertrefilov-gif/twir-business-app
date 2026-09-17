'use client'

import * as Dialog from '@radix-ui/react-dialog'

export function OfferPdfDialog({ offerId }: { offerId: string }) {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="inline-flex min-h-8 w-full items-center justify-center rounded border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-500 text-blue-700 hover:bg-stone-50"
        >
          Vorschau
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/45 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed inset-4 z-50 flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-2xl sm:inset-8"
          aria-describedby={undefined}
        >
          <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
            <Dialog.Title className="text-sm font-600 text-foreground">Angebotsvorschau</Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Vorschau schließen"
                title="Vorschau schließen"
                className="inline-flex h-8 w-8 items-center justify-center rounded-md text-xl text-muted-foreground hover:bg-stone-100 hover:text-foreground"
              >
                ×
              </button>
            </Dialog.Close>
          </div>
          <iframe
            src={`/api/offers/${offerId}/preview`}
            title="PDF-Vorschau des Angebots"
            className="min-h-0 w-full flex-1 bg-stone-100"
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
