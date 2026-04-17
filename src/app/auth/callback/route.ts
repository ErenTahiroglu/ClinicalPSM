import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const type = searchParams.get('type') // 'recovery' | 'signup' | 'magiclink'

  // Detect locale from Referer or default to 'en'
  const referer = request.headers.get('referer') ?? ''
  const localeMatch = referer.match(/\/(en|tr)\//)
  const locale = localeMatch?.[1] ?? 'en'

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  if (type === 'recovery') {
    return NextResponse.redirect(`${origin}/${locale}/reset-password`)
  }

  return NextResponse.redirect(`${origin}/${locale}/analyses`)
}
