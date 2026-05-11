-- Update appointments table to support all required fields
ALTER TABLE appointments 
    ADD COLUMN IF NOT EXISTS age INTEGER,
    ADD COLUMN IF NOT EXISTS arrival_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS booked_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS noted_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS inconsult_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS investigation_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS consult_start_time TIMESTAMP WITH TIME ZONE,
    ADD COLUMN IF NOT EXISTS is_next BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS penalty_turns INTEGER DEFAULT 0,
    ADD COLUMN IF NOT EXISTS edited_time TIMESTAMP WITH TIME ZONE;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_appointments_doctor_id ON appointments(doctor_id);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);
CREATE INDEX IF NOT EXISTS idx_appointments_appointment_time ON appointments(appointment_time);
