'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { login } from '@/features/auth/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export default function LoginPage() {
  const t = useTranslations('auth.login')
  const locale = useLocale()
  const [state, action, isPending] = useActionState(login, null)
  const [showPassword, setShowPassword] = useState(false)

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>

      <form action={action}>
        <input type="hidden" name="locale" value={locale} />
        <fieldset disabled={isPending} className="contents">
          <CardContent className="flex flex-col gap-4">
            {state?.error && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {state.error}
              </p>
            )}

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="email">{t('emailLabel')}</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder={t('emailPlaceholder')}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">{t('passwordLabel')}</Label>
                <Link
                  href={`/${locale}/forgot-password`}
                  className="text-xs text-muted-foreground underline-offset-4 hover:underline"
                  tabIndex={-1}
                >
                  {t('forgotPassword')}
                </Link>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  required
                  className="pr-9"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                  aria-label={showPassword ? t('hidePassword') : t('showPassword')}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? t('submitting') : t('submit')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t('noAccount')}{' '}
              <Link
                href={`/${locale}/register`}
                className="underline hover:text-foreground"
              >
                {t('registerLink')}
              </Link>
            </p>
          </CardFooter>
        </fieldset>
      </form>
    </Card>
  )
}
