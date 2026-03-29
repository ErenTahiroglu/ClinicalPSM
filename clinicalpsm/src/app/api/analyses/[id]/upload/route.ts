import type { NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

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
      .select('id')
      .eq('id', analysisId)
      .eq('user_id', user.id)
      .single()

    if (!analysis) {
      return Response.json({ error: 'Analysis not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const rowCount = parseInt(String(formData.get('rowCount') ?? '0'), 10)
    const columnNamesRaw = formData.get('columnNames')
    const columnNames: string[] = columnNamesRaw
      ? JSON.parse(String(columnNamesRaw))
      : []

    if (!file) {
      return Response.json({ error: 'No file provided' }, { status: 400 })
    }

    const filePath = `csvs/${user.id}/${analysisId}/${file.name}`
    const fileBuffer = await file.arrayBuffer()

    const { error: storageError } = await supabase.storage
      .from('csv-uploads')
      .upload(filePath, fileBuffer, {
        contentType: 'text/csv',
        upsert: true,
      })

    if (storageError) {
      return Response.json({ error: storageError.message }, { status: 500 })
    }

    const { data: upload, error: dbError } = await supabase
      .from('uploads')
      .insert({
        analysis_id: analysisId,
        file_path: filePath,
        row_count: rowCount,
        column_names: columnNames,
      })
      .select()
      .single()

    if (dbError) {
      return Response.json({ error: dbError.message }, { status: 500 })
    }

    return Response.json({ upload }, { status: 201 })
  } catch {
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
