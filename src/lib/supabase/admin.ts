import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '@/lib/env';

let client: SupabaseClient | null = null;

/** 서버 전용 DB 클라이언트 (service_role). 절대 브라우저 코드에서 import 하지 마세요. */
export function adminDb(): SupabaseClient {
  if (typeof window !== 'undefined') throw new Error('adminDb 는 서버에서만 사용할 수 있습니다.');
  if (!client) {
    client = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
