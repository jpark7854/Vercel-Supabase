import { adminDb } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { notifyLinks } from '@/lib/notify';

const DAY = 86_400_000;

/**
 * 매일 09:00(KST) Vercel Cron 이 호출 — 발송 후 3일간 회신이 없으면 리마인더, 이후 3일 간격으로 반복.
 * Vercel 은 Authorization: Bearer <CRON_SECRET> 헤더를 붙여 호출합니다.
 */
export async function GET(req: Request) {
  if (req.headers.get('authorization') !== `Bearer ${env('CRON_SECRET')}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  const { data, error } = await adminDb().from('pending_responses').select('link_id, version_id, sent_at, last_reminder_at');
  if (error) return Response.json({ ok: false, error: error.message }, { status: 500 });

  const now = Date.now();
  const due = (data ?? []).filter(
    (r) => now - new Date(r.sent_at).getTime() >= 3 * DAY && (!r.last_reminder_at || now - new Date(r.last_reminder_at).getTime() >= 3 * DAY - 3600_000),
  );
  const byVersion = new Map<string, string[]>();
  due.forEach((r) => byVersion.set(r.version_id, [...(byVersion.get(r.version_id) ?? []), r.link_id]));
  const totals = { sent: 0, skipped: 0, failed: 0 };
  for (const [versionId, linkIds] of byVersion) {
    const r = await notifyLinks(linkIds, versionId, 'reminder');
    totals.sent += r.sent; totals.skipped += r.skipped; totals.failed += r.failed;
  }
  return Response.json({ ok: true, checked: data?.length ?? 0, reminded: due.length, ...totals });
}
