'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { assignExistingProjectAction } from '@/app/(dashboard)/projects/actions'

type ProjectOption = { id: string; projectNumber: string; name: string }

export function ProjectAssignmentAction({ kind, targetId, customerId, suggestedName, projects }: {
  kind: 'offer' | 'order' | 'invoice'
  targetId: string
  customerId: string
  suggestedName: string
  projects: ProjectOption[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const createHref = `/projects/new?customer=${customerId}&${kind}=${targetId}&name=${encodeURIComponent(suggestedName)}`

  function submit() {
    if (!projectId) { setError('Bitte ein Projekt auswählen.'); return }
    startTransition(async () => {
      setError(null)
      const result = await assignExistingProjectAction(kind, targetId, projectId)
      if (result.error) { setError(result.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col gap-2">
      <Link href={createHref} className="min-h-9 flex items-center justify-center rounded-md bg-blue-700 px-3 py-2 text-sm font-500 text-white hover:bg-blue-800">Projekt erstellen</Link>
      <Dialog.Root open={open} onOpenChange={next => !pending && setOpen(next)}>
        <Dialog.Trigger asChild>
          <button type="button" disabled={!projects.length} className="min-h-9 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-500 text-foreground hover:bg-stone-50 disabled:opacity-50" title={projects.length ? undefined : 'Keine bestehenden Projekte für diesen Kunden'}>Bestehendem Projekt zuordnen</button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-stone-200 bg-white p-6 shadow-2xl" aria-describedby="project-assign-description">
            <Dialog.Title className="text-base font-600">Bestehendem Projekt zuordnen</Dialog.Title>
            <Dialog.Description id="project-assign-description" className="mt-1 text-sm text-muted-foreground">Nur Projekte desselben Kunden werden angezeigt.</Dialog.Description>
            <select value={projectId} onChange={event => setProjectId(event.target.value)} className="mt-4 h-9 w-full rounded-md border border-stone-200 px-3 text-sm">
              <option value="">— Projekt wählen —</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.projectNumber} · {p.name}</option>)}
            </select>
            {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-9 rounded-md border border-stone-200 px-4 text-sm">Abbrechen</button>
              <button type="button" disabled={pending} onClick={submit} className="h-9 rounded-md bg-blue-700 px-4 text-sm font-500 text-white disabled:opacity-50">{pending ? 'Wird zugeordnet…' : 'Zuordnen'}</button>
            </div>
            <Dialog.Close className="absolute right-4 top-4 text-stone-500" aria-label="Dialog schließen">×</Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
