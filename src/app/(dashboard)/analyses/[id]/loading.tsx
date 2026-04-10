import { Skeleton, TableRowSkeleton } from '@/components/shared/Skeleton'

/**
 * Next.js loading.tsx — shown while the analysis detail page loads from DB.
 */
export default function AnalysisDetailLoading() {
  return (
    <div className="mx-auto max-w-4xl px-4 py-10">
      {/* Back link + title */}
      <div className="mb-6 space-y-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-7 w-64" />
        <Skeleton className="h-4 w-40" />
      </div>

      {/* Summary stats grid */}
      <div className="mb-8 grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-lg border p-3">
            <Skeleton className="mb-1 h-3 w-24" />
            <Skeleton className="h-6 w-16" />
          </div>
        ))}
      </div>

      {/* Balance table */}
      <div className="mb-8 rounded-lg border">
        <div className="border-b bg-muted/50 px-3 py-2">
          <Skeleton className="h-4 w-28" />
        </div>
        <table className="min-w-full">
          <tbody>
            {Array.from({ length: 5 }).map((_, i) => (
              <TableRowSkeleton key={i} cols={7} />
            ))}
          </tbody>
        </table>
      </div>

      {/* Chart placeholders */}
      <div className="grid gap-6 sm:grid-cols-2">
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    </div>
  )
}
