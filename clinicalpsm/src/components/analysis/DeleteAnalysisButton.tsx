'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

interface Props {
  analysisId: string
  analysisName: string
}

export function DeleteAnalysisButton({ analysisId, analysisName }: Props) {
  const router = useRouter()
  const [isPending, setIsPending] = useState(false)

  async function handleDelete() {
    if (!confirm(`Delete "${analysisName}"? This cannot be undone.`)) return

    setIsPending(true)
    try {
      const res = await fetch(`/api/analyses/${analysisId}`, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        alert(body.error ?? 'Failed to delete analysis.')
        return
      }
      router.refresh()
    } finally {
      setIsPending(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleDelete}
      disabled={isPending}
      className="flex items-center gap-1 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
      aria-label={`Delete ${analysisName}`}
    >
      <Trash2 className="h-4 w-4" />
    </button>
  )
}
