'use client'

import { useActionState, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { updatePassword } from '@/actions/auth'
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

export default function ResetPasswordPage() {
  const [state, action, isPending] = useActionState(updatePassword, null)
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [clientError, setClientError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    const form = e.currentTarget
    const password = (form.elements.namedItem('password') as HTMLInputElement).value
    const confirm = (form.elements.namedItem('confirm') as HTMLInputElement).value
    if (password !== confirm) {
      e.preventDefault()
      setClientError('Passwords do not match.')
      return
    }
    setClientError(null)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="w-full max-w-sm">
        <Card>
          <CardHeader>
            <CardTitle>Set new password</CardTitle>
            <CardDescription>Enter your new password below.</CardDescription>
          </CardHeader>

          <form action={action} onSubmit={handleSubmit}>
            <fieldset disabled={isPending} className="contents">
              <CardContent className="flex flex-col gap-4">
                {(clientError || (state && 'error' in state)) && (
                  <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                    {clientError ?? (state && 'error' in state ? state.error : '')}
                  </p>
                )}

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      name="password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="••••••••••"
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

                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="confirm">Confirm new password</Label>
                  <div className="relative">
                    <Input
                      id="confirm"
                      name="confirm"
                      type={showConfirm ? 'text' : 'password'}
                      autoComplete="new-password"
                      placeholder="••••••••••"
                      minLength={10}
                      required
                      className="pr-9"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirm(v => !v)}
                      className="absolute inset-y-0 right-0 flex items-center px-2.5 text-muted-foreground hover:text-foreground"
                      tabIndex={-1}
                      aria-label={showConfirm ? 'Hide password' : 'Show password'}
                    >
                      {showConfirm ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </CardContent>

              <CardFooter>
                <Button type="submit" className="w-full" disabled={isPending}>
                  {isPending ? 'Updating…' : 'Update password'}
                </Button>
              </CardFooter>
            </fieldset>
          </form>
        </Card>
      </div>
    </div>
  )
}
