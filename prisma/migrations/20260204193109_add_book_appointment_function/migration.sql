-- Book appointment with optimistic locking to prevent double-booking
CREATE OR REPLACE FUNCTION book_appointment(
  p_slot_id UUID,
  p_patient_id UUID,
  p_expected_version INTEGER,
  p_reason TEXT DEFAULT NULL,
  p_booked_via TEXT DEFAULT 'voice'
) RETURNS TABLE(success BOOLEAN, message TEXT, appointment_id UUID) AS $$
DECLARE
  v_current_version INTEGER;
  v_is_booked BOOLEAN;
  v_appointment_id UUID;
BEGIN
  -- Lock the row and check state
  SELECT version, is_booked INTO v_current_version, v_is_booked
  FROM availability
  WHERE id = p_slot_id
  FOR UPDATE;

  -- Check if slot exists
  IF v_current_version IS NULL THEN
    RETURN QUERY SELECT false, 'Slot not found'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Check version (optimistic lock)
  IF v_current_version != p_expected_version THEN
    RETURN QUERY SELECT false, 'Slot was modified by another request. Please try again.'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Check availability
  IF v_is_booked THEN
    RETURN QUERY SELECT false, 'This slot is no longer available.'::TEXT, NULL::UUID;
    RETURN;
  END IF;

  -- Mark slot as booked
  UPDATE availability
  SET is_booked = true, version = version + 1, updated_at = NOW()
  WHERE id = p_slot_id;

  -- Create appointment
  INSERT INTO appointments (id, patient_id, slot_id, status, reason, booked_via, created_at, updated_at)
  VALUES (gen_random_uuid(), p_patient_id, p_slot_id, 'scheduled', p_reason, p_booked_via, NOW(), NOW())
  RETURNING id INTO v_appointment_id;

  RETURN QUERY SELECT true, 'Appointment booked successfully'::TEXT, v_appointment_id;
END;
$$ LANGUAGE plpgsql;
