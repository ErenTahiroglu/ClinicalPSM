-- Migration: 004_rename_stripe_to_polar
-- Replace legacy Stripe column with Polar.sh customer column

ALTER TABLE profiles
  RENAME COLUMN stripe_customer_id TO polar_customer_id;
