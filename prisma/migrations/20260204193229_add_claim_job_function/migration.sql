-- Claim a job atomically for processing (prevents duplicate processing)
CREATE OR REPLACE FUNCTION claim_job()
RETURNS TABLE(
  job_id UUID,
  job_type TEXT,
  job_payload JSONB
) AS $$
DECLARE
  v_job_id UUID;
  v_job_type TEXT;
  v_job_payload JSONB;
BEGIN
  -- Claim the highest priority pending job
  SELECT id, type, payload INTO v_job_id, v_job_type, v_job_payload
  FROM jobs
  WHERE status = 'pending'
    AND run_at <= NOW()
  ORDER BY priority DESC, run_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF v_job_id IS NULL THEN
    RETURN;
  END IF;

  -- Mark as processing
  UPDATE jobs
  SET status = 'processing', started_at = NOW(), attempts = attempts + 1, updated_at = NOW()
  WHERE id = v_job_id;

  RETURN QUERY SELECT v_job_id, v_job_type, v_job_payload;
END;
$$ LANGUAGE plpgsql;
