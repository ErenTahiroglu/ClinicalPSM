-- Migration: 002_add_plans
-- Add Plus plan and subscription tracking columns

-- Update plan constraint to include 'plus' plan
ALTER TABLE profiles
  DROP CONSTRAINT IF EXISTS profiles_plan_check;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_plan_check
  CHECK (plan IN ('free', 'plus', 'pro'));

-- Add subscription tracking columns
-- Plan limit reference:
--   free  → analyses_limit = 3
--   plus  → analyses_limit = 25  ($5/mo, resets monthly via plan_reset_at)
--   pro   → analyses_limit = 999999  ($20/mo, unlimited)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS plan_interval TEXT DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS polar_subscription_id TEXT,
  ADD COLUMN IF NOT EXISTS plan_reset_at TIMESTAMPTZ;
