-- SQL Script to create the system_logs table for fault-tolerant analytics fallback
-- Run this in your Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.system_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    user_id UUID,
    payload JSONB NOT NULL,
    source TEXT DEFAULT 'backend_fallback',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indexing for performance in analytics aggregation
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_event_type ON public.system_logs(event_type);

-- Table Permissions (allow Service Key to insert)
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service key all access" ON public.system_logs
    USING (true)
    WITH CHECK (true);

COMMENT ON TABLE public.system_logs IS 'Fault-tolerant fallback logs from VaultIQ when HDFS is unreachable.';
