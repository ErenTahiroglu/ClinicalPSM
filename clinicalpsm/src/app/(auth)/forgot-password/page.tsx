'use client'

import { useActionState } from 'react'
import Link from 'next/link'
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
  const [state, action, isPending] = useActionState(requestPasswordReset, null)

  if (state && 'message' in state) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle>Check your email</CardTitle>
          <CardDescription>{state.message}</CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm underline hover:text-foreground">
            Back to sign in
          </Link>
        </CardFooter>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          Enter your email and we&apos;ll send you a reset link.
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
                required
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Sending…' : 'Send reset link'}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              Remember your password?{' '}
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
