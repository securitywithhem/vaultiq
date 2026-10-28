/**
 * migrate.js — run all VaultIQ DB migrations via Supabase REST API.
 * Usage: node scripts/migrate.js
 */
require('dotenv').config();
const axios = require('axios');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env');
  process.exit(1);
}

const headers = {
  apikey:        SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
};

// Execute raw SQL via Supabase's pg-meta / SQL endpoint
async function sql(description, query) {
  try {
    // Use the undocumented but stable REST SQL endpoint
    const res = await axios.post(
      `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
      { query },
      { headers }
    );
    console.log(`  ✓ ${description}`);
    return res.data;
  } catch (err) {
    // Fall back: try creating tables by inserting a dummy row and letting
    // the SDK surface the real error (table-not-found vs other errors)
    const msg = err.response?.data?.message || err.response?.data?.error || err.message;
    // If it's "already exists" — that's fine
    if (msg && (msg.includes('already exists') || msg.includes('duplicate'))) {
      console.log(`  ~ ${description} (already exists — skipped)`);
      return;
    }
    throw new Error(`${description}: ${msg}`, { cause: err });
  }
}

// Direct table operations via Supabase REST (no raw SQL needed)
async function ensureTable(table, sampleRow) {
  try {
    const res = await axios.get(`${SUPABASE_URL}/rest/v1/${table}?limit=1`, { headers });
    console.log(`  ✓ Table '${table}' exists (${res.data.length} rows checked)`);
    return true;
  } catch (err) {
    const status = err.response?.status;
    const msg    = err.response?.data?.message || err.response?.data?.hint || err.message;
    if (status === 404 || (msg && msg.includes('does not exist'))) {
      return false; // table missing
    }
    // Table exists but other error (RLS etc.) — treat as exists
    console.log(`  ~ Table '${table}' — check skipped (${msg})`);
    return true;
  }
}

async function run() {
  console.log('\nVaultIQ DB Migration\n' + '─'.repeat(40));
  console.log(`Target: ${SUPABASE_URL}\n`);

  // ── 1. Check which tables exist ───────────────────────────────────────────
  const filesExists        = await ensureTable('files');
  const profilesExists     = await ensureTable('profiles');
  const loginAttempts      = await ensureTable('login_attempts');
  const eventLogs          = await ensureTable('event_logs');
  const systemLogs         = await ensureTable('system_logs');

  // ── 2. Build the SQL that creates missing tables ──────────────────────────
  // We send it all in one shot via the management API /pg endpoint.
  // Supabase exposes this at /pg/query for projects (needs service key).

  const statements = [];

  if (!filesExists) {
    statements.push(`
      CREATE TABLE IF NOT EXISTS public.files (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
        filename     TEXT NOT NULL,
        s3_key       TEXT NOT NULL UNIQUE,
        file_size    BIGINT NOT NULL DEFAULT 0,
        mime_type    TEXT NOT NULL DEFAULT 'application/octet-stream',
        sha256_hash  TEXT,
        uploaded_at  TIMESTAMPTZ NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_files_user_id       ON public.files(user_id);
      CREATE INDEX IF NOT EXISTS idx_files_user_uploaded ON public.files(user_id, uploaded_at DESC);
      ALTER TABLE public.files ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "Users can view own files"   ON public.files;
      DROP POLICY IF EXISTS "Users can insert own files" ON public.files;
      DROP POLICY IF EXISTS "Users can delete own files" ON public.files;
      CREATE POLICY "Users can view own files"   ON public.files FOR SELECT USING (auth.uid() = user_id);
      CREATE POLICY "Users can insert own files" ON public.files FOR INSERT WITH CHECK (auth.uid() = user_id);
      CREATE POLICY "Users can delete own files" ON public.files FOR DELETE USING (auth.uid() = user_id);
    `);
  }

  if (!profilesExists) {
    statements.push(`
      CREATE TABLE IF NOT EXISTS public.profiles (
        id       UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        email    TEXT UNIQUE NOT NULL,
        full_name TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
      ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "Profiles are public" ON public.profiles;
      CREATE POLICY "Profiles are public" ON public.profiles FOR SELECT USING (true);
    `);
  }

  if (!loginAttempts) {
    statements.push(`
      CREATE TABLE IF NOT EXISTS public.login_attempts (
        user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
        attempts        INTEGER DEFAULT 0,
        last_attempt_at TIMESTAMPTZ DEFAULT now(),
        created_at      TIMESTAMPTZ DEFAULT now(),
        updated_at      TIMESTAMPTZ DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS idx_login_attempts_user_id ON public.login_attempts(user_id);
      ALTER TABLE public.login_attempts ENABLE ROW LEVEL SECURITY;
      DROP POLICY IF EXISTS "System manages lockouts" ON public.login_attempts;
      CREATE POLICY "System manages lockouts" ON public.login_attempts FOR ALL USING (false);
    `);
  }

  if (!eventLogs) {
    statements.push(`
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
      DROP POLICY IF EXISTS "Service key full access on event_logs" ON public.event_logs;
      CREATE POLICY "Service key full access on event_logs" ON public.event_logs FOR ALL USING (true) WITH CHECK (true);
    `);
  }

  if (!systemLogs) {
    statements.push(`
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
      DROP POLICY IF EXISTS "Service key full access on system_logs" ON public.system_logs;
      CREATE POLICY "Service key full access on system_logs" ON public.system_logs FOR ALL USING (true) WITH CHECK (true);
    `);
  }

  if (statements.length === 0) {
    console.log('\nAll tables already exist — nothing to migrate.\n');
    return;
  }

  // ── 3. Run via Supabase Management API ───────────────────────────────────
  // The pg-meta SQL endpoint is available at /pg/query on the project's API.
  const fullSQL = statements.join('\n');
  console.log(`\nRunning ${statements.length} migration(s) via Supabase SQL API...`);

  try {
    // Supabase exposes raw SQL execution via the database URL + pg-meta
    const resp = await axios.post(
      `${SUPABASE_URL}/rest/v1/rpc/exec_sql`,
      { query: fullSQL },
      { headers }
    );
    console.log('\n✅ Migrations complete.\n');
    return;
  } catch (err1) {
    // exec_sql RPC doesn't exist — try the pg-meta path used by the dashboard
    try {
      const mgmtResp = await axios.post(
        `${SUPABASE_URL.replace('.supabase.co', '')}/v1/projects/jjtboyfbsbmnmgzeqgxa/database/query`,
        { query: fullSQL },
        {
          headers: {
            Authorization: `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
          }
        }
      );
      console.log('\n✅ Migrations complete (via management API).\n');
      return;
    } catch (err2) {
      // Both REST paths unavailable — print SQL for manual run
      console.log('\n⚠️  Could not auto-run SQL (no pg-meta access). Copy the SQL below and run it in the Supabase SQL Editor:\n');
      console.log('─'.repeat(60));
      console.log(fullSQL);
      console.log('─'.repeat(60));
      console.log('\nGo to: https://supabase.com/dashboard/project/jjtboyfbsbmnmgzeqgxa/sql/new\n');
    }
  }
}

run().catch(err => {
  console.error('\n❌ Migration error:', err.message);
  process.exit(1);
});
