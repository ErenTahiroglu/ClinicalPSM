/**
 * Skeleton loading component — content placeholder during data fetching.
 * Replaces raw content with animated placeholders to reduce perceived load time.
 */

interface SkeletonProps {
  className?: string
}

export function Skeleton({ className = '' }: SkeletonProps) {
  return (
    <div
      className={`animate-pulse rounded-md bg-muted ${className}`}
      aria-hidden="true"
    />
  )
}

/** Full analysis card skeleton row for the dashboard list */
export function AnalysisCardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-sm" aria-hidden="true">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 space-y-2">
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-3 w-32" />
        </div>
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="mt-3 flex gap-1">
        <Skeleton className="h-5 w-12 rounded-full" />
        <Skeleton className="h-5 w-16 rounded-full" />
        <Skeleton className="h-5 w-10 rounded-full" />
      </div>
    </div>
  )
}

/** Table row skeleton for results tables */
export function TableRowSkeleton({ cols = 7 }: { cols?: number }) {
  return (
    <tr aria-hidden="true">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <Skeleton className="h-3 w-full" />
        </td>
      ))}
    </tr>
  )
}
