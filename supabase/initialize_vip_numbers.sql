-- Initialize VIP Reserved Numbers in Settings table
-- Run this in your Supabase SQL Editor

INSERT INTO settings (id, value, updated_at)
VALUES (
    'vipReservedNumbers', 
    '[1, 2, 5, 8, 12, 14, 18]', 
    NOW()
)
ON CONFLICT (id) DO UPDATE 
SET value = EXCLUDED.value,
    updated_at = NOW();

-- Also ensure replication is enabled for the settings table
-- (This should be done via the Supabase UI under Database -> Replication)
