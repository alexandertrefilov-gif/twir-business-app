'use client'

import { useFormStatus } from 'react-dom'

interface FormSubmitButtonProps {
  idleLabel:    string
  pendingLabel: string
  disabled?:    boolean
  className:    string
}

export function FormSubmitButton({
  idleLabel,
  pendingLabel,
  disabled = false,
  className,
}: FormSubmitButtonProps) {
  const { pending } = useFormStatus()

  return (
    <button type="submit" disabled={disabled || pending} className={className}>
      {pending ? pendingLabel : idleLabel}
    </button>
  )
}
