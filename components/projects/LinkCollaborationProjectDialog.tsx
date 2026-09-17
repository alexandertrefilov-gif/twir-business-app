'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import * as Dialog from '@radix-ui/react-dialog'
import { linkExistingCollaborationProjectAction } from '@/app/(dashboard)/projects/actions'
import { COLLABORATION_PROJECT_STATUS_LABELS, type CollaborationProjectStatus } from '@/types/enums'

type LinkableCollaborationProject = { id: string; projectNumber: string | null; name: string; status: CollaborationProjectStatus }

export function LinkCollaborationProjectDialog({ projectId, projectNumber, projectName, options }: {
  projectId: string
  projectNumber: string
  projectName: string
  options: LinkableCollaborationProject[]
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [collaborationProjectId, setCollaborationProjectId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const selected = options.find(o => o.id === collaborationProjectId)

  function submit() {
    if (!collaborationProjectId) { setError('Bitte eine Zusammenarbeit auswählen.'); return }
    startTransition(async () => {
      setError(null)
      const result = await linkExistingCollaborationProjectAction(projectId, collaborationProjectId)
      if (result.error) { setError(result.error); return }
      setOpen(false)
      router.refresh()
    })
  }

  if (!options.length) return null

  return (
    <Dialog.Root open={open} onOpenChange={next => !pending && setOpen(next)}>
      <Dialog.Trigger asChild>
        <button type="button" className="min-h-9 rounded-md border border-stone-200 bg-white px-3 py-2 text-sm font-500 text-foreground hover:bg-stone-50">Bestehende Zusammenarbeit verknüpfen</button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-xl border border-stone-200 bg-white p-6 shadow-2xl" aria-describedby="link-collaboration-description">
          <Dialog.Title className="text-base font-600">Bestehende Zusammenarbeit verknüpfen</Dialog.Title>
          <Dialog.Description id="link-collaboration-description" className="mt-1 text-sm text-muted-foreground">Nur unverknüpfte, aktive Collaboration-Projekte werden angezeigt.</Dialog.Description>
          <select value={collaborationProjectId} onChange={event => setCollaborationProjectId(event.target.value)} className="mt-4 h-9 w-full rounded-md border border-stone-200 px-3 text-sm">
            <option value="">— Zusammenarbeit wählen —</option>
            {options.map(o => <option key={o.id} value={o.id}>{o.projectNumber ?? '—'} · {o.name} · {COLLABORATION_PROJECT_STATUS_LABELS[o.status]}</option>)}
          </select>
          {selected && (
            <p className="mt-3 rounded-md border border-stone-200 bg-stone-50 p-3 text-sm">
              Intern: <strong>{projectNumber}</strong> {projectName}<br />
              wird verbunden mit<br />
              Collaboration: <strong>{selected.projectNumber ?? '—'}</strong> {selected.name}
              <br /><br />
              Bestehende Inhalte der Zusammenarbeit bleiben erhalten.
            </p>
          )}
          {error && <p role="alert" className="mt-3 rounded-md border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" disabled={pending} onClick={() => setOpen(false)} className="h-9 rounded-md border border-stone-200 px-4 text-sm">Abbrechen</button>
            <button type="button" disabled={pending || !collaborationProjectId} onClick={submit} className="h-9 rounded-md bg-blue-700 px-4 text-sm font-500 text-white disabled:opacity-50">{pending ? 'Wird verknüpft…' : 'Verknüpfen'}</button>
          </div>
          <Dialog.Close className="absolute right-4 top-4 text-stone-500" aria-label="Dialog schließen">×</Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
