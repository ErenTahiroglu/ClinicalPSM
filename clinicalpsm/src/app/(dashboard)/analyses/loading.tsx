import { AnalysisCardSkeleton } from '@/components/shared/Skeleton'

/**
 * Next.js loading.tsx — shown automatically while the analyses page is loading.
 * Provides skeleton placeholders to reduce perceived load time.
 */
export default function AnalysesLoading() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      {/* Header skeleton */}
      <div className="mb-8 flex items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="h-7 w-36 animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded-md bg-muted" />
        </div>
        <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
      </div>

      {/* Card skeletons */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <AnalysisCardSkeleton key={i} />
        ))}
      </div>
    </div>
  )
}
