import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import createIntlMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

const handleI18n = createIntlMiddleware(routing)

const protectedPaths = ['/analyses', '/new', '/settings']
const authPaths = ['/login', '/register', '/forgot-password']

export default async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Skip API routes and auth callback
  if (pathname.startsWith('/api/') || pathname.startsWith('/auth/')) {
    return NextResponse.next()
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('[Middleware] Missing Supabase environment variables!')
    return handleI18n(request)
  }

  // Extract locale from current path (already set by previous i18n redirect)
  const localeMatch = pathname.match(/^\/(en|tr)(\/|$)/)
  const locale = localeMatch?.[1] ?? routing.defaultLocale
  const pathWithoutLocale = localeMatch
    ? pathname.slice(locale.length + 1) || '/'
    : pathname

  // Set up Supabase client to read session
  let supabaseResponse = NextResponse.next({ request })
  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        )
        supabaseResponse = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        )
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  // Auth guards (only when path already has locale prefix)
  if (localeMatch) {
    if (protectedPaths.some(p => pathWithoutLocale.startsWith(p)) && !user) {
      return NextResponse.redirect(new URL(`/${locale}/login`, request.url))
    }
    if (authPaths.some(p => pathWithoutLocale === p) && user) {
      return NextResponse.redirect(new URL(`/${locale}/analyses`, request.url))
    }
  }

  // Apply i18n routing (handles locale prefix injection)
  const i18nResponse = handleI18n(request)

  // Copy Supabase session cookies onto the i18n response
  supabaseResponse.cookies.getAll().forEach(cookie => {
    i18nResponse.cookies.set(cookie.name, cookie.value)
  })

  return i18nResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.png$).*)'],
}
