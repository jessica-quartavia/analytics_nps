ALTER TABLE analytics_nps.voc_manual_reviews
  ADD COLUMN IF NOT EXISTS reviewer_user_id text;
