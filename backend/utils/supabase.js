/**
 * =============================================================
 * VaultIQ — Supabase Client (Service Role) — Lazy Init
 * =============================================================
 * Creates a Supabase client using the SERVICE_ROLE key for
 * server-side operations that bypass Row Level Security.
 *
 * Uses lazy initialization so the server can boot even when
 * Supabase credentials are not yet configured — the client
 * is only created on first use, and routes will return
 * appropriate errors if it's unavailable.
 * =============================================================
 */

const { createClient } = require('@supabase/supabase-js');

let _supabase = null;

/**
 * Get or create the Supabase client.
 * Throws a clear error if env vars are missing.
 * @returns {import('@supabase/supabase-js').SupabaseClient}
 */
function getSupabase() {
  if (_supabase) return _supabase;

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_KEY in .env. ' +
      'Copy .env.example to .env and fill in your Supabase credentials.'
    );
  }

  _supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  return _supabase;
}

module.exports = getSupabase;
