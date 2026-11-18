import { adminDb } from '@/lib/supabase/admin';
import { AuditTable } from '@/components/AuditTable';
import { ACTION_LABEL } from '@/lib/labels';

export default async function Audit({ searchParams }: { searchParams: Promise<{ action?: string; who?: string; from?: string; to?: string }> }) {
  const sp = await searchParams;
  let q = adminDb().from('audit_logs').select('*').order('at', { ascending: false }).limit(500);
  if (sp.action) q = q.eq('action', sp.action);
  if (sp.who) q = q.ilike('actor_label', `%${sp.who.replace(/[%,()]/g, '')}%`);
  if (sp.from) q = q.gte('at', `${sp.from}T00:00:00+09:00`);
  if (sp.to) q = q.lte('at', `${sp.to}T23:59:59+09:00`);
  const { data } = await q;
  return (
    <div className="flex flex-col gap-4">
      <h1 className="h1">활동 기록</h1>
      <p className="muted">업로드·열람·코멘트·수정 요청·승인·발송·링크 발급/폐기가 모두 자동 기록됩니다. 이 기록은 누구도 수정하거나 삭제할 수 없습니다. (최근 500건 표시)</p>
      <form className="flex flex-wrap items-end gap-2">
        <select name="action" defaultValue={sp.action ?? ''} className="input w-auto">
          <option value="">전체 작업</option>
          {Object.entries(ACTION_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <input name="who" defaultValue={sp.who} placeholder="누가 (이름·업체)" className="input w-44" />
        <input type="date" name="from" defaultValue={sp.from} className="input w-auto" />
        <input type="date" name="to" defaultValue={sp.to} className="input w-auto" />
        <button className="btn">조회</button>
      </form>
      <AuditTable rows={data ?? []} showProject />
    </div>
  );
}
