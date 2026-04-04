'use client'

import React from 'react'

interface State {
  hasError: boolean
  errorMessage: string
}

interface Props {
  children: React.ReactNode
  /** Optional fallback instead of the default error card */
  fallback?: React.ReactNode
}

/**
 * React Error Boundary — kullanıcı dostu hata ekranı gösterir.
 * Uncaught render hatalarını yakalar, beyaz ekran yerine açıklayıcı UI sunar.
 *
 * React class component zorunlu — hooks Error Boundary mantığını desteklemez.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, errorMessage: '' }
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message ?? 'An unexpected error occurred.',
    }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Production'da gerçek bir error tracking servisi (Sentry vb.) buraya konur
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack)
  }

  handleReset = () => {
    this.setState({ hasError: false, errorMessage: '' })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback

      return (
        <div
          role="alert"
          className="flex min-h-[200px] flex-col items-center justify-center rounded-lg border border-destructive/20 bg-destructive/5 px-6 py-10 text-center"
        >
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10">
            <svg
              className="h-5 w-5 text-destructive"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
              />
            </svg>
          </div>
          <h2 className="text-sm font-semibold text-destructive">Something went wrong</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            An unexpected error occurred. Your data has not been lost.
          </p>
          <button
            type="button"
            onClick={this.handleReset}
            className="mt-4 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
