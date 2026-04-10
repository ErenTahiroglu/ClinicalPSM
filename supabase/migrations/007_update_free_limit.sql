-- Migration: 007_update_free_limit
-- Reduce default free analysis limit from 3 to 1

-- 1. Update the default value for future profiles
ALTER TABLE profiles 
  ALTER COLUMN analyses_limit SET DEFAULT 1;

-- 2. Update existing 'free' plan users who still have the old limit (3)
-- Only update if they haven't been manually adjusted or already upgraded
UPDATE profiles
SET analyses_limit = 1
WHERE plan = 'free' AND analyses_limit = 3;

-- 3. Add a comment to document the change in the schema
COMMENT ON COLUMN profiles.analyses_limit IS 'Limit for total analyses. Free: 1, Plus: 25, Pro: 999999';
