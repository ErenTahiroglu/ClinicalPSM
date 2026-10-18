import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import type { PsmConfig, PsmResult } from '@/lib/psm/types'
import { withClinicalWriteHold } from '@/lib/safety'

async function handleSaveResults(
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

    // Verify ownership and check status
    const { data: analysis } = await supabase
      .from('analyses')
      .select('id, user_id, status')
      .eq('id', analysisId)
      .eq('user_id', user.id)
      .single()

    if (!analysis) {
      return Response.json({ error: 'Analysis not found' }, { status: 404 })
    }

    if (analysis.status === 'completed') {
      return Response.json(
        { error: 'Analysis is already completed.' },
        { status: 409 }
      )
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

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// CP-00: row-level results (propensity scores, matched pairs) must not be persisted.
export const POST = withClinicalWriteHold(handleSaveResults)
