import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

// Read local .env
const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    env[parts[0].trim()] = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
  }
});

// Read service role key from Desktop env
const desktopEnvContent = fs.readFileSync('C:/Users/JesusAlexisCarmonaCa/Desktop/b_y9xmcYCaqMB/.env.local', 'utf-8');
let serviceKey = '';
desktopEnvContent.split('\n').forEach(line => {
  if (line.startsWith('SUPABASE_SERVICE_ROLE_KEY=')) {
    serviceKey = line.split('=')[1].trim().replace(/^['"]|['"]$/g, '');
  }
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
console.log('Supabase URL:', supabaseUrl);
console.log('Service Key starts with:', serviceKey.substring(0, 10));

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false
  }
});

async function run() {
  const sql = fs.readFileSync('supabase/consolidated_migration.sql', 'utf-8');
  console.log('Executing consolidated migration...');
  
  // Let's see if we can call supabase.rpc('execute_sql', { query: sql })
  const { data, error } = await supabase.rpc('execute_sql', { query: sql });
  if (error) {
    console.error('RPC execute_sql failed:', error);
    
    // Fallback: Let's try running direct SQL using pg or http if there is a postgres connection,
    // but first let's see what RPCs are available or if we can run statements individually.
  } else {
    console.log('Success! Result:', data);
  }
}

run().catch(console.error);
