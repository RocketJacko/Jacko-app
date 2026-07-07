import fs from 'fs';
import path from 'path';

// Read .env file manually
const envContent = fs.readFileSync('.env', 'utf-8');
const env = {};
envContent.split('\n').forEach(line => {
  const parts = line.split('=');
  if (parts.length >= 2) {
    const key = parts[0].trim();
    const val = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '');
    env[key] = val;
  }
});

const supabaseUrl = env['VITE_SUPABASE_URL'];
const supabaseAnonKey = env['VITE_SUPABASE_ANON_KEY'];

async function check() {
  const url = `${supabaseUrl}/rest/v1/products?select=*&limit=1`;
  const res = await fetch(url, {
    headers: {
      'apikey': supabaseAnonKey,
      'Authorization': `Bearer ${supabaseAnonKey}`
    }
  });
  const data = await res.json();
  console.log('Product columns:', Object.keys(data[0] || {}));
  console.log('Sample product:', data[0]);
}

check().catch(console.error);
