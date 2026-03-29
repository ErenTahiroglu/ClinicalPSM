import type { PsmConfig, PsmResult } from '@/lib/psm/types'

export interface Profile {
  id: string
  user_id: string
  plan: 'free' | 'plus' | 'pro'
  analyses_used: number
  analyses_limit: number
  polar_customer_id: string | null
  plan_interval: string | null
  polar_subscription_id: string | null
  plan_reset_at: string | null
  created_at: string
}

export interface Analysis {
  id: string
  user_id: string
  name: string
  status: 'draft' | 'processing' | 'completed' | 'failed'
  config: PsmConfig | null
  result_summary: PsmResult | null
  created_at: string
  completed_at: string | null
}

export interface Upload {
  id: string
  analysis_id: string
  file_path: string
  row_count: number
  column_names: string[]
  created_at: string
}
