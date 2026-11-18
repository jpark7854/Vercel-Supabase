import { redirect } from 'next/navigation';
import { authClient } from '@/lib/supabase/server';
import { adminDb } from '@/lib/supabase/admin';

export type Staff = { id: string; name: string; email: string; role: 'admin' | 'staff' };

export async function getStaff(): Promise<Staff | null> {
  const supabase = await authClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return null;
  const { data: staff } = await adminDb()
    .from('staff')
    .select('id, name, email, role')
    .eq('id', data.user.id)
    .eq('active', true)
    .maybeSingle();
  return (staff as Staff) ?? null;
}

export async function requireStaff(): Promise<Staff> {
  const s = await getStaff();
  if (!s) redirect('/login');
  return s;
}

export async function requireAdmin(): Promise<Staff> {
  const s = await requireStaff();
  if (s.role !== 'admin') redirect('/admin');
  return s;
}
