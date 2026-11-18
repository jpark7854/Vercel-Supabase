import { headers } from 'next/headers';

export async function requestMeta(): Promise<{ ip: string | null; ua: string | null }> {
  const h = await headers();
  const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
  return { ip, ua: h.get('user-agent')?.slice(0, 400) ?? null };
}
