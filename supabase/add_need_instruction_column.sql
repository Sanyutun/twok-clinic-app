-- Add need_instruction column to doctors, appointments, and instructions tables
-- This ensures the column exists even if tables were created with an older schema

-- 1. Doctors table (if not already present)
ALTER TABLE doctors 
    ADD COLUMN IF NOT EXISTS need_instruction BOOLEAN DEFAULT true;

-- 2. Appointments table (to match DataLayer.js allowedFields)
ALTER TABLE appointments 
    ADD COLUMN IF NOT EXISTS need_instruction BOOLEAN DEFAULT true;

-- 3. Instructions table (to match DataLayer.js allowedFields)
ALTER TABLE instructions 
    ADD COLUMN IF NOT EXISTS need_instruction BOOLEAN DEFAULT true;

-- Update RLS and Replication to include new columns
ALTER TABLE doctors REPLICA IDENTITY FULL;
ALTER TABLE appointments REPLICA IDENTITY FULL;
ALTER TABLE instructions REPLICA IDENTITY FULL;
