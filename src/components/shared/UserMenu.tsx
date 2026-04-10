'use client'

import { useState } from 'react'
import Link from 'next/link'
import { signOut } from '@/features/auth/actions/auth'

export function UserMenu() {
  const [open, setOpen] = useState(false)

  return (
    <div className="relative">
      <button
        aria-label="User menu"
        onClick={() => setOpen(v => !v)}
        className="flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm hover:bg-muted/40"
      >
        Menu
      </button>

      {open && (
        <div className="absolute right-0 top-full z-10 mt-1 w-44 rounded-md border bg-background shadow-md">
          <Link
            href="/analyses"
            className="block px-3 py-2 text-sm hover:bg-muted/40"
            onClick={() => setOpen(false)}
          >
            Dashboard
          </Link>
          <Link
            href="/settings"
            className="block px-3 py-2 text-sm hover:bg-muted/40"
            onClick={() => setOpen(false)}
          >
            Settings
          </Link>
          <div className="my-1 border-t" />
          <form action={signOut}>
            <button
              type="submit"
              className="w-full px-3 py-2 text-left text-sm hover:bg-muted/40"
            >
              Logout
            </button>
          </form>
        </div>
      )}
    </div>
  )
}
