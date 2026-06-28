-- Add contacted column to instructions table to track patient contact status
ALTER TABLE instructions ADD COLUMN IF NOT EXISTS contacted BOOLEAN DEFAULT false;

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

ALTER TABLE instructions REPLICA IDENTITY FULL;
