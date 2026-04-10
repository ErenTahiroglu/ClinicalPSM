import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ToastProvider } from '@/components/shared/ToastProvider'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://clinicalpsm.com'

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ClinicalPSM — Propensity Score Matching for Researchers',
    template: '%s | ClinicalPSM',
  },
  description:
    'Run propensity score matching analysis without code. Upload your CSV, select variables, and get publication-ready balance tables and visualizations.',
  openGraph: {
    type: 'website',
    siteName: 'ClinicalPSM',
    title: 'ClinicalPSM — Propensity Score Matching for Researchers',
    description:
      'Run PSM analysis without R or Stata. Upload a CSV, configure your analysis, and download publication-ready results in minutes.',
    url: siteUrl,
  },
  twitter: {
    card: 'summary_large_image',
    title: 'ClinicalPSM — Propensity Score Matching for Researchers',
    description:
      'Run PSM analysis without R or Stata. Upload a CSV, configure your analysis, and download publication-ready results in minutes.',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <ErrorBoundary>
          <ToastProvider>
            {children}
          </ToastProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
