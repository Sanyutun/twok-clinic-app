-- Add contacted_at column to instructions table to track when patient was contacted
ALTER TABLE instructions ADD COLUMN IF NOT EXISTS contacted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Ensure instructions table is in the realtime publication
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE instructions;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        NULL;
END $$;
