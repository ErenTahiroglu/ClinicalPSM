'use server'

import { redirect } from 'next/navigation'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'

async function validatePassword(password: string, locale?: string): Promise<string | null> {
  const t = await getTranslations({ locale: locale ?? 'en', namespace: 'auth.serverMessages' })
  if (password.length < 10) return t('passwordTooShort')
  if (!/[A-Z]/.test(password)) return t('passwordNoUppercase')
  if (!/[a-z]/.test(password)) return t('passwordNoLowercase')
  if (!/[\W_]/.test(password)) return t('passwordNoSpecial')
  return null
}

export async function login(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const locale = (formData.get('locale') as string) || 'en'

  const t = await getTranslations({ locale, namespace: 'auth' })
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const msg = error.message.toLowerCase()
    if (
      msg.includes('invalid') ||
      msg.includes('credentials') ||
      msg.includes('password') ||
      msg.includes('not found')
    ) {
      return { error: t('invalidCredentials') }
    }
    return { error: error.message }
  }

  const currentLocale = await getLocale()
  redirect(`/${currentLocale}/analyses`)
}

export async function register(
  _prevState: { error: string } | { message: string } | null,
  formData: FormData
): Promise<{ error: string } | { message: string } | null> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string
  const locale = (formData.get('locale') as string) || 'en'

  const passwordError = await validatePassword(password, locale)
  if (passwordError) return { error: passwordError }

  const t = await getTranslations({ locale, namespace: 'auth.serverMessages' })
  const supabase = await createClient()

  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000')

  const { data, error } = await supabase.auth.signUp({
    email: email.trim(),
    password,
    options: {
      emailRedirectTo: `${siteUrl}/auth/callback`,
    },
  })

  if (error) {
    console.error('[Register] Supabase error:', error.message)
    return { error: error.message }
  }

  if (data.session) {
    const currentLocale = await getLocale()
    redirect(`/${currentLocale}/analyses`)
  }

  return { message: t('emailConfirmationSent') }
}

export async function resendConfirmation(
  _prevState: { error: string } | { message: string } | null,
  formData: FormData
): Promise<{ error: string } | { message: string }> {
  const email = formData.get('email') as string
  const locale = await getLocale()
  const t = await getTranslations({ locale, namespace: 'auth.serverMessages' })
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/auth/callback`,
    },
  })
  if (error) return { error: error.message }
  return { message: t('confirmationResent') }
}

export async function signOut(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  const locale = await getLocale()
  redirect(`/${locale}/login`)
}

export async function requestPasswordReset(
  _prevState: { error: string } | { message: string } | null,
  formData: FormData
): Promise<{ error: string } | { message: string }> {
  const email = formData.get('email') as string
  const locale = await getLocale()
  const t = await getTranslations({ locale, namespace: 'auth.serverMessages' })
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/${locale}/reset-password`,
  })
  if (error) return { error: error.message }
  return { message: t('passwordResetSent') }
}

export async function updatePassword(
  _prevState: { error: string } | { message: string } | null,
  formData: FormData
): Promise<{ error: string } | { message: string }> {
  const password = formData.get('password') as string
  const locale = await getLocale()

  const passwordError = await validatePassword(password, locale)
  if (passwordError) return { error: passwordError }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  redirect(`/${locale}/analyses`)
}
