const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('CRITICAL: Missing Supabase environment variables (URL or Anon Key)');
}
if (!supabaseServiceRoleKey) {
  console.error('CRITICAL: Missing SUPABASE_SERVICE_ROLE_KEY. Admin operations will fail!');
}

// Client for general use (honors RLS)
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Client for administrative tasks (bypasses RLS)
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceRoleKey);

module.exports = { supabase, supabaseAdmin };
