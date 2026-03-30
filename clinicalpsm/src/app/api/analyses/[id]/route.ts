import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: NextRequest,
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

    // Verify ownership and get upload paths for storage cleanup
    const { data: analysis } = await supabase
      .from('analyses')
      .select('id')
      .eq('id', analysisId)
      .eq('user_id', user.id)
      .single()

    if (!analysis) {
      return Response.json({ error: 'Analysis not found' }, { status: 404 })
    }

    // Fetch associated upload file paths
    const { data: uploads } = await supabase
      .from('uploads')
      .select('file_path')
      .eq('analysis_id', analysisId)

    // Delete files from storage
    if (uploads && uploads.length > 0) {
      const paths = uploads.map(u => u.file_path)
      await supabase.storage.from('csv-uploads').remove(paths)
    }

    // Delete analysis (cascades to uploads via FK)
    const { error: deleteError } = await supabase
      .from('analyses')
      .delete()
      .eq('id', analysisId)

    if (deleteError) {
      return Response.json({ error: deleteError.message }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
