require('dotenv').config({ path: './backend/.env' });
const { supabaseAdmin, supabaseAuth } = require('./backend/utils/supabase');

async function test() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) console.error('Admin Auth Error:', error.message);
  else console.log('Admin Auth users count:', data?.users?.length);

  // Test insert to files
  const { data: fData, error: fErr } = await supabaseAdmin.from('files').select('*').limit(1);
  if (fErr) console.error('Admin DB Error:', fErr.message);
  else console.log('Admin DB Access OK');
}

test();
