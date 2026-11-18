'use client';
import { createClient } from '@supabase/supabase-js';

/** 브라우저 → 비공개 저장소 직접 업로드 전용 (서명된 업로드 URL 사용, 그 외 권한 없음) */
export function browserStorage() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }).storage;
}
