'use client'

import { useActionState, useState } from 'react'
import Link from 'next/link'
import { Eye, EyeOff, Mail } from 'lucide-react'
import { register, resendConfirmation } from '@/actions/auth'
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
        <CardTitle>Check your email</CardTitle>
        <CardDescription>
          We sent a confirmation link to <strong>{email}</strong>
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-2 text-sm text-muted-foreground">
        <p>⏱ Usually arrives within 1 minute.</p>
        <p>📁 Don&apos;t see it? Check your spam or junk folder.</p>
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
            {isResending ? 'Sending…' : 'Resend confirmation email'}
          </Button>
        </form>
        <p className="text-center text-sm text-muted-foreground">
          Already confirmed?{' '}
          <Link href="/login" className="underline hover:text-foreground">
            Sign in
          </Link>
        </p>
      </CardFooter>
    </Card>
  )
}

export default function RegisterPage() {
  const [state, action, isPending] = useActionState(register, null)
  const [showPassword, setShowPassword] = useState(false)
  const [emailValue, setEmailValue] = useState('')

  if (state && 'message' in state) {
    return <ConfirmationScreen email={emailValue} />
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create account</CardTitle>
        <CardDescription>
          Start with 3 free analyses — no credit card required.
        </CardDescription>
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
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@institution.edu"
                value={emailValue}
                onChange={e => setEmailValue(e.target.value)}
                required
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
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
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">At least 10 characters with one uppercase, one lowercase, and one special character.</p>
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Creating account…' : 'Create account'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Already have an account?{' '}
              <Link href="/login" className="underline hover:text-foreground">
                Sign in
              </Link>
            </p>
          </CardFooter>
        </fieldset>
      </form>
    </Card>
  )
}
