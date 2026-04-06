const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function checkUser(email) {
  console.log(`Checking if user exists: ${email}`);
  
  // Note: We can't query auth.users directly with the standard client, 
  // but we can try to sign in or get user by ID if we had it.
  // However, we can use the admin API to list users.
  const { data: { users }, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error('Error listing users:', error.message);
    return;
  }
  
  const user = users.find(u => u.email === email);
  if (user) {
    console.log('User FOUND:');
    console.log(`ID: ${user.id}`);
    console.log(`Email: ${user.email}`);
    console.log(`Email Confirmed At: ${user.email_confirmed_at}`);
    console.log(`Last Sign In: ${user.last_sign_in_at}`);
    console.log(`Created At: ${user.created_at}`);
    console.log(`Confirmed: ${!!user.email_confirmed_at}`);
  } else {
    console.log('User NOT FOUND.');
    console.log('Available users:', users.map(u => u.email).join(', '));
  }
}

const targetEmail = process.argv[2] || 'hemtest@vaultiq.dev';
checkUser(targetEmail).catch(err => console.error(err));
