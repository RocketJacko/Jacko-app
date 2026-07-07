import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://plybwnfnmvshroaottby.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBseWJ3bmZubXZzaHJvYW90dGJ5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NzEyMTE1MSwiZXhwIjoyMDkyNjk3MTUxfQ.-NyMa_kHP1a91hupXw1GM4SvfWbJgM-H-w52BuuOF-M';

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: {
    persistSession: false
  }
});

async function run() {
  console.log('Querying public.system_settings...');
  const { data, error } = await supabase
    .from('system_settings')
    .select('*');

  if (error) {
    console.error('Error fetching system_settings:', error);
  } else {
    console.log('System Settings:');
    console.log(JSON.stringify(data, null, 2));
  }
}

run().catch(console.error);
