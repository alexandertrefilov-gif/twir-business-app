'use client'

import { useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'

export const DOCUMENT_EDIT_WORKFLOW_ACTIONS_ID = 'document-edit-workflow-actions'
export const DOCUMENT_CREATE_WORKFLOW_ACTIONS_ID = 'document-create-workflow-actions'

interface DocumentFormWorkflowActionsProps {
  formRef: RefObject<HTMLFormElement | null>
  isPending: boolean
  error?: string
  idleLabel?: string
  pendingLabel?: string
  onCancel: () => void
  preview?: ReactNode
  targetId?: string
}

export function DocumentFormWorkflowActions({
  formRef,
  isPending,
  error,
  idleLabel = 'Änderungen speichern',
  pendingLabel = 'Wird gespeichert…',
  onCancel,
  preview,
  targetId = DOCUMENT_EDIT_WORKFLOW_ACTIONS_ID,
}: DocumentFormWorkflowActionsProps) {
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [submissionRequested, setSubmissionRequested] = useState(false)
  const submissionRequestedRef = useRef(false)

  useEffect(() => {
    setTarget(document.getElementById(targetId))
  }, [targetId])

  useEffect(() => {
    if (!isPending) {
      submissionRequestedRef.current = false
      setSubmissionRequested(false)
    }
  }, [isPending, error])

  function submitExistingForm() {
    const form = formRef.current
    if (!form || submissionRequestedRef.current) return
    if (!form.checkValidity()) {
      form.requestSubmit()
      return
    }
    submissionRequestedRef.current = true
    setSubmissionRequested(true)
    form.requestSubmit()
  }

  if (!target) return null

  return createPortal(
    <div className="grid gap-2" data-document-form-workflow-actions>
      {error && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
          {error}
        </p>
      )}
      <div className={`grid gap-2 ${preview ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending || submissionRequested}
          className="h-9 w-full rounded-md border border-stone-200 bg-white px-3 text-sm font-500 transition-colors hover:bg-stone-50 disabled:opacity-50"
        >
          Abbrechen
        </button>
        {preview}
      </div>
      <button
        type="button"
        onClick={submitExistingForm}
        disabled={isPending || submissionRequested}
        className="h-9 w-full rounded-md bg-blue-700 px-5 text-sm font-500 text-white transition-colors hover:bg-blue-800 disabled:opacity-50"
      >
        {isPending || submissionRequested ? pendingLabel : idleLabel}
      </button>
    </div>,
    target,
  )
}
