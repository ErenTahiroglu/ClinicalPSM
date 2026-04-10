'use client'

import { useRef, useState } from 'react'
import Papa from 'papaparse'
import { Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { RawRow } from '@/lib/psm/encoding'
import { getCsrfTokenFromCookie } from '@/lib/csrf-client'

interface Props {
  name: string
  onComplete: (data: {
    rawData: RawRow[]
    columns: string[]
    rowCount: number
    fileName: string
    analysisId: string
    uploadId: string
  }) => void
  onBack: () => void
}

const MAX_FILE_SIZE_MB = 5

export function WizardStep1Upload({ name, onComplete, onBack }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<{
    rows: RawRow[]
    columns: string[]
    fileName: string
    rawData: RawRow[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function handleFile(file: File) {
    setError(null)
    setPreview(null)
    setSelectedFile(null)

    if (!file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a CSV file. Only .csv files are supported.')
      return
    }

    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File is too large. Maximum size is ${MAX_FILE_SIZE_MB} MB.`)
      return
    }

    Papa.parse<RawRow>(file, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
      complete(results) {
        const columns = results.meta.fields ?? []
        if (columns.length === 0) {
          setError('Could not detect column headers. Make sure your CSV has a header row.')
          return
        }
        if (results.data.length === 0) {
          setError('The CSV file has no data rows. Please upload a file with at least one row.')
          return
        }
        setSelectedFile(file)
        setPreview({
          rows: results.data.slice(0, 5),
          columns,
          fileName: file.name,
          rawData: results.data,
        })
      },
      error(err) {
        setError(`Failed to parse CSV: ${err.message}`)
      },
    })
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const file = e.dataTransfer.files[0]
    if (file) handleFile(file)
  }

  async function handleNext() {
    if (!preview) return
    setIsSubmitting(true)
    setError(null)

    try {
      // Create analysis record using the name from step 1
      const createRes = await fetch('/api/analyses', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'X-CSRF-Token': getCsrfTokenFromCookie() ?? ''
        },
        body: JSON.stringify({ name }),
      })
      if (!createRes.ok) {
        const body = await createRes.json()
        throw new Error(body.error ?? 'Failed to create analysis')
      }
      const { analysis } = await createRes.json()

      // Upload file
      const fileInput = selectedFile
      if (!fileInput) throw new Error('No file selected')

      const formData = new FormData()
      formData.append('file', fileInput)
      formData.append('rowCount', String(preview.rawData.length))
      formData.append('columnNames', JSON.stringify(preview.columns))

      const uploadRes = await fetch(`/api/analyses/${analysis.id}/upload`, {
        method: 'POST',
        headers: {
          'X-CSRF-Token': getCsrfTokenFromCookie() ?? ''
        },
        body: formData,
      })
      if (!uploadRes.ok) {
        const body = await uploadRes.json()
        throw new Error(body.error ?? 'Failed to upload file')
      }
      const { upload } = await uploadRes.json()

      onComplete({
        rawData: preview.rawData,
        columns: preview.columns,
        rowCount: preview.rawData.length,
        fileName: preview.fileName,
        analysisId: analysis.id,
        uploadId: upload.id,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-lg font-semibold">Step 2: Upload your dataset</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a CSV file. The first row must be column headers. Maximum{' '}
          {MAX_FILE_SIZE_MB} MB.
        </p>
      </div>

      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        onClick={() => !isSubmitting && inputRef.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border p-10 text-center transition-colors hover:border-primary/50 hover:bg-muted/40 ${isSubmitting ? 'pointer-events-none opacity-60' : ''}`}
      >
        <p className="text-sm font-medium">
          Drop your CSV file here, or click to browse
        </p>
        <p className="text-xs text-muted-foreground">
          CSV up to {MAX_FILE_SIZE_MB} MB · free plan: up to 500 rows
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          className="sr-only"
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) handleFile(file)
          }}
        />
      </div>

      {error && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      )}

      {/* Success + Preview */}
      {preview && (
        <>
          <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
            File uploaded successfully — {preview.rawData.length} rows,{' '}
            {preview.columns.length} columns detected.
          </p>

          <div className="overflow-x-auto rounded-lg border">
            <table className="min-w-full text-xs">
              <thead className="bg-muted/50">
                <tr>
                  {preview.columns.map(col => (
                    <th
                      key={col}
                      className="whitespace-nowrap px-3 py-2 text-left font-medium text-muted-foreground"
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.map((row, i) => (
                  <tr key={i} className="border-t">
                    {preview.columns.map(col => (
                      <td key={col} className="whitespace-nowrap px-3 py-1.5">
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="px-3 py-2 text-xs text-muted-foreground">
              Showing first 5 of {preview.rawData.length} rows ·{' '}
              {preview.columns.length} columns
            </p>
          </div>
        </>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}>
          ← Back
        </Button>
        <Button onClick={handleNext} disabled={!preview || isSubmitting}>
          {isSubmitting ? (
            <span className="flex items-center gap-1.5">
              <Loader2 className="h-4 w-4 animate-spin" />
              Uploading…
            </span>
          ) : (
            'Next →'
          )}
        </Button>
      </div>
    </div>
  )
}
