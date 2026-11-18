import Link from 'next/link';
import { adminDb } from '@/lib/supabase/admin';
import { STATUS_LABEL, STATUS_ORDER, STATUS_STYLE, ACTION_LABEL, PERMISSION_LABEL, type ProjectStatus } from '@/lib/labels';
import { daysSince, fmtDateTime } from '@/lib/format';

export default async function Dashboard() {
  const db = adminDb();
  const [{ data: projects }, { data: waiting }, { data: recent }] = await Promise.all([
    db.from('projects').select('status'),
    db.from('pending_responses').select('*').order('sent_at', { ascending: true }),
    db.from('audit_logs').select('id, at, actor_label, action, project_id, detail').order('at', { ascending: false }).limit(15),
  ]);
  const counts = Object.fromEntries(STATUS_ORDER.map((s) => [s, 0])) as Record<ProjectStatus, number>;
  (projects ?? []).forEach((p) => counts[p.status as ProjectStatus]++);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">대시보드</h1>
        <Link href="/admin/projects/new" className="btn btn-primary">＋ 새 프로젝트</Link>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {STATUS_ORDER.map((s) => (
          <Link key={s} href={`/admin/projects?status=${s}`} className={`rounded-xl p-4 ring-1 ring-inset transition hover:shadow ${STATUS_STYLE[s]}`}>
            <p className="text-sm font-medium">{STATUS_LABEL[s]}</p>
            <p className="text-3xl font-bold tabular-nums">{counts[s]}</p>
          </Link>
        ))}
      </section>

      <section className="card overflow-x-auto">
        <h2 className="h2 mb-1">응답 대기 중인 업체 ({waiting?.length ?? 0})</h2>
        <p className="muted mb-3">발송 후 아직 회신(승인·수정 요청, 코멘트 권한은 코멘트 포함)이 없는 담당자입니다. 3일이 지나면 매일 오전 9시에 리마인더 메일이 갑니다.</p>
        {waiting?.length ? (
          <table className="tbl">
            <thead><tr><th>경과</th><th>업체 / 담당자</th><th>권한</th><th>프로젝트</th><th>버전</th><th>발송</th><th>최근 리마인더</th></tr></thead>
            <tbody>
              {waiting.map((w) => {
                const d = daysSince(w.sent_at);
                return (
                  <tr key={`${w.link_id}`}>
                    <td className={`font-semibold tabular-nums ${d >= 3 ? 'text-rose-600' : ''}`}>{d}일</td>
                    <td>{w.vendor_name}<br /><span className="muted">{w.contact_name}</span></td>
                    <td>{PERMISSION_LABEL[w.permission as 'view']}</td>
                    <td><Link className="underline" href={`/admin/projects/${w.project_id}`}>{w.brand_name} {w.product_name} / {w.material_type}</Link></td>
                    <td>v{w.version_no}</td>
                    <td className="whitespace-nowrap">{fmtDateTime(w.sent_at)}</td>
                    <td className="whitespace-nowrap">{fmtDateTime(w.last_reminder_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="muted">대기 중인 업체가 없습니다.</p>}
      </section>

      <section className="card overflow-x-auto">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="h2">최근 활동</h2>
          <Link href="/admin/audit" className="text-sm underline">전체 보기</Link>
        </div>
        <table className="tbl">
          <tbody>
            {(recent ?? []).map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-slate-500">{fmtDateTime(r.at)}</td>
                <td className="whitespace-nowrap">{r.actor_label}</td>
                <td className="whitespace-nowrap font-medium">{ACTION_LABEL[r.action] ?? r.action}</td>
                <td className="text-slate-600">
                  {r.project_id ? <Link className="underline" href={`/admin/projects/${r.project_id}?tab=activity`}>{(r.detail as Record<string, string>)?.file_name ?? '프로젝트'}</Link> : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
