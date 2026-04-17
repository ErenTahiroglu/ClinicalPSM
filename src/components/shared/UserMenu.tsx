'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { signOut } from '@/features/auth/actions/auth'

export function UserMenu() {
  const t = useTranslations('common.nav')
  const locale = useLocale()
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        aria-label="User menu"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/40"
      >
        {t('menu')}
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md border bg-background shadow-md">
          <Link
            href={`/${locale}/analyses`}
            className="block px-3 py-2 text-sm hover:bg-muted/40"
            onClick={() => setOpen(false)}
          >
            {t('dashboard')}
          </Link>
          <Link
            href={`/${locale}/settings`}
            className="block px-3 py-2 text-sm hover:bg-muted/40"
            onClick={() => setOpen(false)}
          >
            {t('settings')}
          </Link>
          <div className="my-1 border-t" />
          <form action={signOut}>
            <button
              type="submit"
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted/40"
            >
              {t('logout')}
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
