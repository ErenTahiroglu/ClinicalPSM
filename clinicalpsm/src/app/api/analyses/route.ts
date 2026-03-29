import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (!user || authError) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Server-side quota check
    const { data: profile } = await supabase
      .from('profiles')
      .select('analyses_used, analyses_limit')
      .eq('user_id', user.id)
      .single()

    if (profile && profile.analyses_used >= profile.analyses_limit) {
      return Response.json(
        { error: 'Analysis limit reached. Upgrade to Pro for unlimited analyses.' },
        { status: 403 }
      )
    }

    const body = await request.json()
    const name = (body.name as string | undefined)?.trim() || 'Untitled Analysis'

    const { data, error } = await supabase
      .from('analyses')
      .insert({ user_id: user.id, name, status: 'draft' })
      .select()
      .single()

    if (error) {
      return Response.json({ error: error.message }, { status: 500 })
    }

    return Response.json({ analysis: data }, { status: 201 })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
