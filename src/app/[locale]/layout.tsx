import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { NextIntlClientProvider } from 'next-intl'
import { getMessages, getTranslations } from 'next-intl/server'
import { notFound } from 'next/navigation'
import { routing } from '@/i18n/routing'
import { ToastProvider } from '@/components/shared/ToastProvider'
import { ErrorBoundary } from '@/components/shared/ErrorBoundary'
import '../globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>
}): Promise<Metadata> {
  const { locale } = await params
  const t = await getTranslations({ locale, namespace: 'landing' })
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://www.clinicalpsm.com'

  return {
    metadataBase: new URL(siteUrl),
    title: {
      default: 'ClinicalPSM — Propensity Score Matching for Researchers',
      template: '%s | ClinicalPSM',
    },
    description: t('hero.description'),
    openGraph: {
      type: 'website',
      siteName: 'ClinicalPSM',
      title: 'ClinicalPSM — Propensity Score Matching for Researchers',
      description: t('hero.description'),
      url: siteUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title: 'ClinicalPSM — Propensity Score Matching for Researchers',
      description: t('hero.description'),
    },
  }
}

export function generateStaticParams() {
  return routing.locales.map(locale => ({ locale }))
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params

  if (!routing.locales.includes(locale as 'en' | 'tr')) {
    notFound()
  }

  const messages = await getMessages()

  return (
    <html
      lang={locale}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <NextIntlClientProvider messages={messages}>
          <ErrorBoundary>
            <ToastProvider>
              {children}
            </ToastProvider>
          </ErrorBoundary>
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
