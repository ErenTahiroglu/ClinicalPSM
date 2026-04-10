import { createClient } from '@/lib/supabase/server'
import { withErrorHandling, UnauthorizedError, NotFoundError } from '@/lib/errors'

export const DELETE = withErrorHandling(
  async (_req: Request, ctx: unknown) => {
    const { id: analysisId } = await (ctx as { params: Promise<{ id: string }> }).params

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (!user || authError) throw new UnauthorizedError()

    // Verify ownership and get upload paths for storage cleanup
    const { data: analysis } = await supabase
      .from('analyses')
      .select('id')
      .eq('id', analysisId)
      .eq('user_id', user.id)
      .single()

    if (!analysis) throw new NotFoundError('Analysis not found')

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

    if (deleteError) throw new Error(deleteError.message)

    return Response.json({ success: true })
  }
)

