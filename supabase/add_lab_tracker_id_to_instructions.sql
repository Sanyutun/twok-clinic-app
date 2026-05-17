-- Add lab_tracker_id to instructions table
ALTER TABLE instructions 
    ADD COLUMN IF NOT EXISTS lab_tracker_id VARCHAR(100);

-- Update RLS and trigger if needed (usually not needed for just a column)
-- But ensuring it's available for the real-time replication
ALTER TABLE instructions REPLICA IDENTITY FULL;
