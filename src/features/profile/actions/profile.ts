'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

export async function deleteAccount(
  _prevState: { error: string } | null,
  _formData: FormData
): Promise<{ error: string } | null> {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: 'Not authenticated.' }

  // Collect all storage file paths belonging to this user
  const { data: analyses } = await supabase
    .from('analyses')
    .select('id')
    .eq('user_id', user.id)

  if (analyses && analyses.length > 0) {
    const { data: uploads } = await supabase
      .from('uploads')
      .select('file_path')
      .in('analysis_id', analyses.map(a => a.id))

    if (uploads && uploads.length > 0) {
      await supabase.storage
        .from('csv-uploads')
        .remove(uploads.map(u => u.file_path))
    }
  }

  // Delete auth user via admin client (cascade deletes profiles/analyses via DB)
  const adminClient = createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
  const { error } = await adminClient.auth.admin.deleteUser(user.id)

  if (error) return { error: error.message }

  redirect('/login')
}
