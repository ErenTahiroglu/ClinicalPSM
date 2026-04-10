import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { ButtonLink } from '@/components/ui/button-link'
import { UserMenu } from './UserMenu'

export default async function Header() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          ClinicalPSM
        </Link>

        <nav className="flex items-center gap-3">
          {user ? (
            <>
              <Link
                href="/analyses"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Dashboard
              </Link>
              <Link
                href="/pricing"
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Pricing
              </Link>
              <UserMenu />
            </>
          ) : (
            <>
              <ButtonLink href="/login" variant="outline" size="sm">
                Login
              </ButtonLink>
              <ButtonLink href="/register" size="sm">
                Register
              </ButtonLink>
            </>
          )}
        </nav>
      </div>
    </header>
  )
}
