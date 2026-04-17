'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Mail } from 'lucide-react'
import { useTranslations, useLocale } from 'next-intl'
import { register, resendConfirmation } from '@/features/auth/actions/auth'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card'

function ConfirmationScreen({ email }: { email: string }) {
  const t = useTranslations('auth.register.confirmation')
  const locale = useLocale()
  const [resendState, resendAction, isResending] = useActionState(
    resendConfirmation,
    null
  )

  return (
    <Card>
      <CardHeader className="items-center text-center">
        <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-muted">
          <Mail className="h-6 w-6 text-muted-foreground" />
        </div>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>
          {t('description')} <strong>{email}</strong>
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>⏱ {t('arrives')}</p>
        <p>📁 {t('spam')}</p>
        {resendState && 'message' in resendState && (
          <p className="text-green-700">{resendState.message}</p>
        )}
        {resendState && 'error' in resendState && (
          <p className="text-destructive">{resendState.error}</p>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-3">
        <form action={resendAction} className="w-full">
          <input type="hidden" name="email" value={email} />
          <Button
            type="submit"
            variant="outline"
            className="w-full"
            disabled={isResending}
          >
            {isResending ? t('resending') : t('resend')}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          {t('alreadyConfirmed')}{' '}
          <Link
            href={`/${locale}/login`}
            className="underline hover:text-foreground"
          >
            {t('signInLink')}
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}

export default function RegisterPage() {
  const t = useTranslations('auth.register')
  const locale = useLocale()
  const [state, action, isPending] = useActionState(register, null)
  const [showPassword, setShowPassword] = useState(false)
  const [emailValue, setEmailValue] = useState('')
  const [clientError, setClientError] = useState<string | null>(null)

  if (state && 'message' in state) {
    return <ConfirmationScreen email={emailValue} />
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    setClientError(null)
    const form = e.currentTarget
    const email = (form.elements.namedItem('email') as HTMLInputElement).value
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    const confirm = (form.elements.namedItem('confirmPassword') as HTMLInputElement).value

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      e.preventDefault()
      setClientError(t('validation.invalidEmail'))
      return
    }
    if (password.length < 10) {
      e.preventDefault()
      setClientError(t('validation.passwordTooShort'))
      return
    }
    if (password !== confirm) {
      e.preventDefault()
      setClientError(t('validation.passwordMismatch'))
      return
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>

      <form action={action} onSubmit={handleSubmit} noValidate>
        <input type="hidden" name="locale" value={locale} />
        <fieldset disabled={isPending} className="contents">
          <CardContent className="flex flex-col gap-4">
            {(clientError || (state && 'error' in state)) && (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {clientError ?? (state as { error: string }).error}
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
                value={emailValue}
                onChange={e => setEmailValue(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">{t('passwordLabel')}</Label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="••••••••"
                  minLength={10}
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
              <p className="text-xs text-muted-foreground">{t('passwordHint')}</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="confirmPassword">{t('confirmLabel')}</Label>
              <Input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                minLength={10}
                required
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? t('submitting') : t('submit')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              {t('hasAccount')}{' '}
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
