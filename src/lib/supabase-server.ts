import { createClient } from '@supabase/supabase-js';

/** عميل للقراءة العامة من السيرفر (زائر غير مسجل) */
export function supabaseServer() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
