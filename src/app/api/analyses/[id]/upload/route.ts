import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit, rateLimitKey } from '@/lib/rate-limit'
import { withFileUploadLimit } from '@/lib/request-limits'
import { auditLog } from '@/lib/audit'

async function handleUpload(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: analysisId } = await params
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  
  if (!checkRateLimit(rateLimitKey(ip, 'upload'), 5)) {
    await auditLog.rateLimitExceeded('upload', analysisId, { ip }, request)
    return NextResponse.json({ error: 'Too many uploads. Please wait a minute.' }, { status: 429 })
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (!user || authError) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify ownership
    const { data: analysis } = await supabase
      .from('analyses')
      .select('id')
      .eq('id', analysisId)
      .eq('user_id', user.id)
      .single()

    if (!analysis) {
      return NextResponse.json({ error: 'Analysis not found' }, { status: 404 })
    }

    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const rowCount = parseInt(String(formData.get('rowCount') ?? '0'), 10)
    const columnNamesRaw = formData.get('columnNames')

    // Server-side row limit for free plan
    const FREE_ROW_LIMIT = 500
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan')
      .eq('user_id', user.id)
      .single()

    if (profile?.plan === 'free' && rowCount > FREE_ROW_LIMIT) {
      return NextResponse.json(
        { error: `Free plan allows up to ${FREE_ROW_LIMIT} rows per analysis. Your file has ${rowCount} rows.` },
        { status: 403 }
      )
    }
    const columnNames: string[] = columnNamesRaw
      ? JSON.parse(String(columnNamesRaw))
      : []

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
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
      return NextResponse.json({ error: storageError.message }, { status: 500 })
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
      return NextResponse.json({ error: dbError.message }, { status: 500 })
    }

    // Log successful upload
    await auditLog.fileUploaded(
      user.id,
      upload.id,
      { 
        fileName: file.name,
        fileSize: file.size,
        rowCount,
        analysisId 
      },
      request
    )

    return NextResponse.json({ upload }, { status: 201 })
  } catch (error) {
    await auditLog.errorOccurred(
      error instanceof Error ? error : new Error('Unknown error in upload'),
      { analysisId, action: 'file_upload' },
      request
    )
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withFileUploadLimit(handleUpload, {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxRows: 500, // Free tier limit
})
