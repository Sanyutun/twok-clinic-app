-- Enable Realtime for all tables in Supabase
-- Run this in the Supabase SQL Editor

-- 1. Create the publication if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        CREATE PUBLICATION supabase_realtime;
    END IF;
END $$;

-- 2. Add tables to the publication
-- This allows Supabase to broadcast changes to these tables via WebSockets
-- We use individual ALTER statements to be safe
DO $$ 
DECLARE
    t text;
    tables text[] := ARRAY['patients', 'doctors', 'appointments', 'instructions', 'expenses', 'expense_categories', 'lab_records', 'addresses', 'specialities', 'hospitals', 'settings'];
BEGIN
    FOREACH t IN ARRAY tables LOOP
        BEGIN
            EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I', t);
        EXCEPTION WHEN duplicate_object THEN
            -- Ignore if already added
        END;
        
        -- Set Replica Identity to FULL to ensure UPDATE/DELETE payloads are complete
        EXECUTE format('ALTER TABLE %I REPLICA IDENTITY FULL', t);
    END LOOP;
END $$;
