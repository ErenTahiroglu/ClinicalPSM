'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export async function login(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) return { error: error.message }

  redirect('/analyses')
}

export async function register(
  _prevState: { error: string } | { message: string } | null,
  formData: FormData
): Promise<{ error: string } | { message: string } | null> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/auth/callback`,
    },
  })

  if (error) return { error: error.message }

  return { message: 'Check your email to confirm your account.' }
}

export async function resendConfirmation(
  _prevState: { error: string } | { message: string } | null,
  formData: FormData
): Promise<{ error: string } | { message: string }> {
  const email = formData.get('email') as string
  const supabase = await createClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/auth/callback`,
    },
  })
  if (error) return { error: error.message }
  return { message: 'Confirmation email resent.' }
}

export async function signOut(): Promise<never> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}

export async function requestPasswordReset(
  _prevState: { error: string } | { message: string } | null,
  formData: FormData
): Promise<{ error: string } | { message: string }> {
  const email = formData.get('email') as string
  const supabase = await createClient()
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? ''}/reset-password`,
  })
  if (error) return { error: error.message }
  return { message: 'Check your email for a password reset link.' }
}

export async function updatePassword(
  _prevState: { error: string } | { message: string } | null,
  formData: FormData
): Promise<{ error: string } | { message: string }> {
  const password = formData.get('password') as string
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  redirect('/analyses')
}
