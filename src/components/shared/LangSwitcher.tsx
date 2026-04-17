'use client'

import { useLocale } from 'next-intl'
import { usePathname, useRouter } from 'next/navigation'
import { useTransition } from 'react'

export function LangSwitcher() {
  const locale = useLocale()
  const router = useRouter()
  const pathname = usePathname()
  const [isPending, startTransition] = useTransition()

  function switchLocale() {
    const nextLocale = locale === 'en' ? 'tr' : 'en'
    // Replace /en/ or /tr/ prefix in pathname
    const newPath = pathname.replace(/^\/(en|tr)/, `/${nextLocale}`)
    startTransition(() => {
      router.push(newPath)
    })
  }

  return (
    <button
      onClick={switchLocale}
      disabled={isPending}
      className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
      aria-label="Switch language"
    >
      {locale === 'en' ? 'TR' : 'EN'}
    </button>
  )
}
