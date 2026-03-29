import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PsmConfig, PsmResult } from '@/lib/psm/types'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: analysisId } = await params

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (!user || authError) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const { data: analysis } = await supabase
      .from('analyses')
      .select('id, user_id')
      .eq('id', analysisId)
      .eq('user_id', user.id)
      .single()

    if (!analysis) {
      return Response.json({ error: 'Analysis not found' }, { status: 404 })
    }

    const body = await request.json()
    const resultSummary = body.resultSummary as PsmResult
    const config = body.config as PsmConfig

    // Update analysis record
    const { error: updateError } = await supabase
      .from('analyses')
      .update({
        status: 'completed',
        result_summary: resultSummary,
        config,
        completed_at: new Date().toISOString(),
      })
      .eq('id', analysisId)

    if (updateError) {
      return Response.json({ error: updateError.message }, { status: 500 })
    }

    // Increment usage quota (only on success)
    const { data: profile } = await supabase
      .from('profiles')
      .select('analyses_used')
      .eq('user_id', user.id)
      .single()

    if (profile) {
      await supabase
        .from('profiles')
        .update({ analyses_used: profile.analyses_used + 1 })
        .eq('user_id', user.id)
    }

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
