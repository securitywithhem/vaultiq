/**
 * migrate_pg.js — run VaultIQ migrations via direct PostgreSQL connection.
 * Tries: direct host → session pooler → outputs SQL for manual run.
 */
require('dotenv').config();
const { Client } = require('pg');

const PROJECT  = 'jjtboyfbsbmnmgzeqgxa';
const PASSWORD = 'xicjob-wacxib-5vimTa';

const MIGRATIONS = `
-- profiles table (for pre-login user lookup & lockout feature)
CREATE TABLE IF NOT EXISTS public.profiles (
  id        UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email     TEXT UNIQUE NOT NULL,
  full_name TEXT
);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Profiles are readable" ON public.profiles FOR SELECT USING (true);

-- login_attempts table (account lockout)
CREATE TABLE IF NOT EXISTS public.login_attempts (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  attempts        INTEGER DEFAULT 0,
  last_attempt_at TIMESTAMPTZ DEFAULT now(),
  created_at      TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON public.login_attempts(user_id);
ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "System manages lockouts" ON public.login_attempts FOR ALL USING (false);

-- event_logs table (analytics — HDFS fallback)
CREATE TABLE IF NOT EXISTS public.event_logs (
  id              BIGSERIAL PRIMARY KEY,
  event_type      TEXT NOT NULL,
  user_id         TEXT,
  file_name       TEXT,
  file_size_bytes BIGINT,
  file_type       TEXT,
  ai_verdict      TEXT,
  ai_score        FLOAT,
  ip_address      TEXT,
  duration_ms     INTEGER,
  timestamp       TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata        JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_event_logs_timestamp  ON public.event_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_event_logs_event_type ON public.event_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_event_logs_user_id   ON public.event_logs(user_id);
ALTER TABLE public.event_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service key event_logs" ON public.event_logs FOR ALL USING (true) WITH CHECK (true);

-- system_logs table (analytics fallback)
CREATE TABLE IF NOT EXISTS public.system_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL,
  user_id    UUID,
  payload    JSONB NOT NULL,
  source     TEXT DEFAULT 'backend_fallback',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_system_logs_event_type ON public.system_logs(event_type);
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY IF NOT EXISTS "Service key system_logs" ON public.system_logs FOR ALL USING (true) WITH CHECK (true);
`;

const CONN_STRINGS = [
  // Direct connection
  `postgresql://postgres.${PROJECT}:${encodeURIComponent(PASSWORD)}@db.${PROJECT}.supabase.co:5432/postgres?sslmode=require`,
  // Session pooler (supports DDL)
  `postgresql://postgres.${PROJECT}:${encodeURIComponent(PASSWORD)}@aws-0-eu-north-1.pooler.supabase.com:5432/postgres?sslmode=require`,
];

async function tryConnect(connStr) {
  const client = new Client({ connectionString: connStr });
  await client.connect();
  return client;
}

async function run() {
  console.log('\nVaultIQ DB Migration (pg direct)\n' + '─'.repeat(40));

  let client;
  for (const conn of CONN_STRINGS) {
    const label = conn.includes('pooler') ? 'session pooler' : 'direct host';
    try {
      process.stdout.write(`Connecting via ${label}… `);
      client = await tryConnect(conn);
      console.log('connected ✓');
      break;
    } catch (err) {
      console.log(`failed (${err.message})`);
    }
  }

  if (!client) {
    console.log('\n⚠️  Could not connect to Supabase DB directly.');
    console.log('Run this SQL manually in the Supabase SQL Editor:');
    console.log('https://supabase.com/dashboard/project/' + PROJECT + '/sql/new\n');
    console.log('─'.repeat(60));
    console.log(MIGRATIONS);
    console.log('─'.repeat(60));
    return;
  }

  try {
    await client.query(MIGRATIONS);
    console.log('\n✅ All migrations applied successfully.\n');
  } catch (err) {
    if (err.message.includes('already exists')) {
      console.log('\n✅ Tables already exist — nothing to do.\n');
    } else {
      console.error('\n❌ Migration failed:', err.message);
      console.log('\nRun this SQL manually:');
      console.log('https://supabase.com/dashboard/project/' + PROJECT + '/sql/new\n');
      console.log(MIGRATIONS);
    }
  } finally {
    await client.end();
  }
}

run().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
