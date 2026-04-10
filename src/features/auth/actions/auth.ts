'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

function validatePassword(password: string): string | null {
  if (password.length < 10) return 'Password must be at least 10 characters.'
  // Modern generated passwords often use symbols, but we shouldn't fail if they miss one specific type
  // unless business requirements strictly demand it.
  if (!/[A-Z]/.test(password)) return 'Password must contain at least one uppercase letter.'
  if (!/[a-z]/.test(password)) return 'Password must contain at least one lowercase letter.'
  // Broadening special character check to include any non-alphanumeric or common symbols
  if (!/[\W_]/.test(password)) return 'Password must contain at least one special character (e.g. !@#$%).'
  return null
}

export async function login(
  _prevState: { error: string } | null,
  formData: FormData
): Promise<{ error: string } | null> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Normalize Supabase auth errors to user-friendly messages
    const msg = error.message.toLowerCase()
    if (msg.includes('invalid') || msg.includes('credentials') || msg.includes('password') || msg.includes('not found')) {
      return { error: 'Invalid credentials' }
    }
    return { error: error.message }
  }

  redirect('/analyses')
}

export async function register(
  _prevState: { error: string } | { message: string } | null,
  formData: FormData
): Promise<{ error: string } | { message: string } | null> {
  const email = formData.get('email') as string
  const password = formData.get('password') as string

  const passwordError = validatePassword(password)
  if (passwordError) return { error: passwordError }

  const supabase = await createClient()
  
  // Use Vercel URL or custom Site URL for redirecting after email confirmation
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 
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
    redirect('/analyses')
  }

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

  const passwordError = validatePassword(password)
  if (passwordError) return { error: passwordError }

  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser({ password })
  if (error) return { error: error.message }
  redirect('/analyses')
}
