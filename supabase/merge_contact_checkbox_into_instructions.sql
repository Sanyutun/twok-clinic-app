-- Merge contact_checkbox into instructions table
ALTER TABLE instructions ADD COLUMN IF NOT EXISTS contacted BOOLEAN DEFAULT false;

-- Drop the separate contact_checkbox table
DROP TABLE IF EXISTS contact_checkbox;

-- Update realtime publication if necessary
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        -- We can't easily remove a table from a publication if it's gone, 
        -- but we want to make sure instructions is there (it should be)
        ALTER PUBLICATION supabase_realtime ADD TABLE instructions;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN 
        NULL;
END $$;
