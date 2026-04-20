import Link from 'next/link'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { ButtonLink } from '@/components/ui/button-link'
import { UserMenu } from './UserMenu'
import { LangSwitcher } from './LangSwitcher'

export default async function Header() {
  const locale = await getLocale()
  const t = await getTranslations('common')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href={`/${locale}`} className="text-lg font-semibold tracking-tight">
          {t('brand')}
        </Link>

        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href={`/${locale}/analyses`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t('nav.dashboard')}
              </Link>
              <Link
                href={`/${locale}/pricing`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t('nav.pricing')}
              </Link>
              <LangSwitcher />
              <UserMenu />
            </>
          ) : (
            <>
              <Link
                href={`/${locale}/pricing`}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                {t('nav.pricing')}
              </Link>
              <LangSwitcher />
              <ButtonLink href={`/${locale}/login`} variant="outline" size="sm">
                {t('nav.login')}
              </ButtonLink>
              <ButtonLink href={`/${locale}/register`} size="sm">
                {t('nav.register')}
              </ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
