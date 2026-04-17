'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { useTranslations, useLocale } from 'next-intl'
import { requestPasswordReset } from '@/features/auth/actions/auth'
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

export default function ForgotPasswordPage() {
  const t = useTranslations('auth.forgotPassword')
  const locale = useLocale()
  const [state, action, isPending] = useActionState(requestPasswordReset, null)

  if (state && 'message' in state) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle>{t('successTitle')}</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link
            href={`/${locale}/login`}
            className="text-sm underline hover:text-foreground"
          >
            {t('backToSignIn')}
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>

      <form action={action}>
        <fieldset disabled={isPending} className="contents">
          <CardContent className="flex flex-col gap-4">
            {state && 'error' in state && (
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
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? t('submitting') : t('submit')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t('rememberPassword')}{' '}
              <Link
                href={`/${locale}/login`}
                className="underline hover:text-foreground"
              >
                {t('signInLink')}
              </Link>
            </p>
          </CardFooter>
        </fieldset>
      </form>
    </Card>
  )
}
