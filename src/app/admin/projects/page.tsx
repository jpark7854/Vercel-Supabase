import Link from 'next/link';
import { adminDb } from '@/lib/supabase/admin';
import { StatusBadge } from '@/components/StatusBadge';
import { STATUS_LABEL, STATUS_ORDER, fmtWeek, type ProjectStatus } from '@/lib/labels';
import { fmtDateTime } from '@/lib/format';

type SP = Promise<{ status?: string; brand?: string; q?: string }>;

export default async function Projects({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const db = adminDb();
  let q = db
    .from('projects')
    .select('id, product_name, material_type, status, prod_year, prod_month, prod_week, next_action, updated_at, brand:brands(name), current:versions!projects_current_version_fk(version_no, file_name, sent_at)')
    .order('updated_at', { ascending: false })
    .limit(500);
  if (sp.status && sp.status in STATUS_LABEL) q = q.eq('status', sp.status);
  if (sp.brand) q = q.eq('brand_id', sp.brand);
  if (sp.q) q = q.or(`product_name.ilike.%${sp.q.replace(/[%,()]/g, '')}%,material_type.ilike.%${sp.q.replace(/[%,()]/g, '')}%`);
  const [{ data }, { data: brands }] = await Promise.all([q, db.from('brands').select('id, name').order('name')]);
  type Row = {
    id: string; product_name: string; material_type: string; status: ProjectStatus; prod_year: number | null; prod_month: number | null; prod_week: number | null;
    next_action: string | null; updated_at: string; brand: { name: string }; current: { version_no: number; file_name: string; sent_at: string | null } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">프로젝트</h1>
        <Link href="/admin/projects/new" className="btn btn-primary">＋ 새 프로젝트</Link>
      </div>
      <form className="flex flex-wrap gap-2">
        <select name="status" defaultValue={sp.status ?? ''} className="input w-auto">
          <option value="">전체 상태</option>
          {STATUS_ORDER.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}
        </select>
        <select name="brand" defaultValue={sp.brand ?? ''} className="input w-auto">
          <option value="">전체 브랜드</option>
          {(brands ?? []).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <input name="q" defaultValue={sp.q ?? ''} placeholder="품목·부자재 검색" className="input w-48" />
        <button className="btn">검색</button>
      </form>
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="tbl">
          <thead><tr><th>상태</th><th>브랜드</th><th>품목 / 부자재</th><th>최신 버전</th><th>생산 예정</th><th>다음 할 일</th><th>최근 변경</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <td><StatusBadge status={r.status} /></td>
                <td className="whitespace-nowrap">{r.brand.name}</td>
                <td><Link className="font-medium underline-offset-2 hover:underline" href={`/admin/projects/${r.id}`}>{r.product_name}</Link><br /><span className="muted">{r.material_type}</span></td>
                <td className="whitespace-nowrap">{r.current ? `v${r.current.version_no}${r.current.sent_at ? '' : ' (미발송)'}` : '-'}</td>
                <td className="whitespace-nowrap">{fmtWeek(r.prod_year, r.prod_month, r.prod_week)}</td>
                <td className="max-w-xs truncate">{r.next_action}</td>
                <td className="whitespace-nowrap text-slate-500">{fmtDateTime(r.updated_at)}</td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={7} className="py-8 text-center text-slate-500">프로젝트가 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
