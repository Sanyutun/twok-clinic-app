-- Push Subscriptions table for Web Push notifications
CREATE TABLE IF NOT EXISTS push_subscriptions (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    endpoint TEXT NOT NULL UNIQUE,
    keys JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable Row Level Security
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow public access for now (matching existing app pattern)
CREATE POLICY "Allow all on push_subscriptions" ON push_subscriptions
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_endpoint ON push_subscriptions (endpoint);
