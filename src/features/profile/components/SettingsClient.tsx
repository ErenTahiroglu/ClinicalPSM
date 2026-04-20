'use client'

import { useActionState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePassword } from '@/features/auth/actions/auth'
import { deleteAccount } from '@/features/profile/actions/profile'
import type { Profile } from '@/types/database'

const PLAN_LABELS: Record<Profile['plan'], string> = {
  free: 'Free',
  plus: 'Plus',
  pro: 'Pro',
}

interface Props {
  email: string
  profile: (Pick<Profile, 'plan' | 'analyses_limit' | 'plan_reset_at'> & { analyses_used: number }) | null
}

export function SettingsClient({ email, profile }: Props) {
  const [passwordState, passwordAction, passwordPending] = useActionState(updatePassword, null)
  const [deleteState, deleteAction, deletePending] = useActionState(deleteAccount, null)

  return (
    <div className="flex flex-col gap-10">
      {/* Account info */}
      <section className="rounded-lg border p-5">
        <h2 className="mb-4 font-semibold">Account</h2>
        <div className="flex flex-col gap-1 text-sm">
          <span className="text-muted-foreground">Email</span>
          <span className="font-medium">{email}</span>
        </div>
      </section>

      {/* Plan & usage */}
      <section className="rounded-lg border p-5">
        <h2 className="mb-4 font-semibold">Plan & Usage</h2>
        {profile ? (
          <div className="flex flex-col gap-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Current plan</span>
              <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
                {PLAN_LABELS[profile.plan]}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Analyses used {profile.plan === 'free' ? '(today)' : '(current period)'}</span>
              <span className="font-medium">
                {profile.analyses_used} / {profile.analyses_limit === 999999 ? '∞' : profile.analyses_limit}
              </span>
            </div>
            {profile.plan !== 'free' && profile.plan_reset_at && (
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">Resets on</span>
                <span className="font-medium">
                  {new Date(profile.plan_reset_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
              </div>
            )}
            {profile.plan === 'free' && (
              <Link
                href="/pricing"
                className="mt-1 text-xs text-primary underline-offset-2 hover:underline"
              >
                Upgrade to Plus or Pro for more daily analyses →
              </Link>
            )}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Could not load plan info.</p>
        )}
      </section>

      {/* Change password */}
      <section className="rounded-lg border p-5">
        <h2 className="mb-4 font-semibold">Change Password</h2>
        <form action={passwordAction} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              minLength={10}
              placeholder="Min. 10 chars, uppercase, lowercase, special"
              required
            />
          </div>
          {passwordState && 'error' in passwordState && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {passwordState.error}
            </p>
          )}
          {passwordState && 'message' in passwordState && (
            <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
              {passwordState.message}
            </p>
          )}
          <Button type="submit" disabled={passwordPending} className="self-start">
            {passwordPending ? 'Updating…' : 'Update Password'}
          </Button>
        </form>
      </section>

      {/* Danger zone */}
      <section className="rounded-lg border border-destructive/30 p-5">
        <h2 className="mb-1 font-semibold text-destructive">Danger Zone</h2>
        <p className="mb-4 text-sm text-muted-foreground">
          Permanently delete your account and all associated data. This cannot be undone.
        </p>
        <form
          action={deleteAction}
          onSubmit={e => {
            if (!window.confirm('Are you sure? This will permanently delete your account and all your analyses.')) {
              e.preventDefault()
            }
          }}
        >
          {deleteState && 'error' in deleteState && (
            <p className="mb-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {deleteState.error}
            </p>
          )}
          <Button type="submit" variant="outline" disabled={deletePending}
            className="border-destructive/50 text-destructive hover:bg-destructive/10">
            {deletePending ? 'Deleting…' : 'Delete My Account'}
          </Button>
        </form>
      </section>
    </div>
  )
}
