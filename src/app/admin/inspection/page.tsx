import Link from 'next/link';
import { adminDb } from '@/lib/supabase/admin';
import { fmtDateTime } from '@/lib/format';
import { fmtWeek } from '@/lib/labels';

/** 입고 검수: 최종 승인본을 바로 열어 실물과 대조 (휴대폰 사용 기준) */
export default async function Inspection({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q } = await searchParams;
  const db = adminDb();
  const { data } = await db
    .from('projects')
    .select('id, product_name, material_type, status, prod_year, prod_month, prod_week, current_version_id, brand:brands(name), approved:versions!projects_approved_version_fk(id, version_no, file_name, approved_at, print_released_at)')
    .not('approved_version_id', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(300);
  type Row = {
    id: string; product_name: string; material_type: string; status: string; prod_year: number | null; prod_month: number | null; prod_week: number | null;
    current_version_id: string; brand: { name: string }; approved: { id: string; version_no: number; file_name: string; approved_at: string; print_released_at: string | null };
  };
  const term = q?.trim().toLowerCase();
  const rows = ((data ?? []) as unknown as Row[]).filter(
    (r) => !term || `${r.brand.name} ${r.product_name} ${r.material_type} ${r.approved.file_name}`.toLowerCase().includes(term),
  );
  const ids = rows.map((r) => r.approved.id);
  const { data: approvers } = ids.length
    ? await db.from('decisions').select('version_id, signer_name, created_at').in('version_id', ids).eq('decision', 'approved').order('created_at')
    : { data: [] as { version_id: string; signer_name: string; created_at: string }[] };

  return (
    <div className="flex flex-col gap-4">
      <h1 className="h1">입고 검수 · 최종 승인본</h1>
      <form className="flex gap-2">
        <input name="q" defaultValue={q} className="input text-base" placeholder="브랜드·품목·부자재 검색" />
        <button className="btn">검색</button>
      </form>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r) => (
          <div key={r.id} className="card flex flex-col gap-2">
            <p className="muted">{r.brand.name} · {r.material_type}</p>
            <p className="text-lg font-bold">{r.product_name} <span className="text-emerald-700">v{r.approved.version_no}</span></p>
            <p className="break-all text-xs text-slate-500">{r.approved.file_name}</p>
            <p className="text-sm">승인: {fmtDateTime(r.approved.approved_at)}<br />승인자: {(approvers ?? []).filter((a) => a.version_id === r.approved.id).map((a) => a.signer_name).join(', ')}</p>
            {r.prod_year && <p className="text-sm">생산 예정: {fmtWeek(r.prod_year, r.prod_month, r.prod_week)}</p>}
            {r.approved.print_released_at && <p className="text-sm">🖨 인쇄·발주: {fmtDateTime(r.approved.print_released_at)}</p>}
            {r.current_version_id !== r.approved.id && <p className="rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">⚠ 개정 진행 중 — 새 버전이 아직 승인되지 않았습니다. 입고품이 어느 버전 기준인지 확인하세요.</p>}
            <div className="mt-auto flex gap-2 pt-2">
              <a className="btn btn-approve flex-1 py-2.5" href={`/admin/download/version/${r.approved.id}?inline=1`} target="_blank" rel="noreferrer">승인본 PDF 열기</a>
              <Link className="btn" href={`/admin/projects/${r.id}?tab=view&v=${r.approved.id}`}>상세</Link>
            </div>
          </div>
        ))}
        {!rows.length && <p className="muted">최종 승인된 파일이 없습니다.</p>}
      </div>
    </div>
  );
}
