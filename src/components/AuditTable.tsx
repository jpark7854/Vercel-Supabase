import Link from 'next/link';
import { ACTION_LABEL, PERMISSION_LABEL, type Permission } from '@/lib/labels';
import { fmtDateTime } from '@/lib/format';

export function AuditTable({ rows, showProject }: { rows: Record<string, unknown>[]; showProject?: boolean }) {
  return (
    <div className="card overflow-x-auto p-0 sm:p-0">
      <table className="tbl">
        <thead><tr><th>일시</th><th>누가</th><th>무엇을</th>{showProject && <th>프로젝트</th>}<th>내용</th><th>IP</th></tr></thead>
        <tbody>
          {rows.map((r) => {
            const d = (r.detail ?? {}) as Record<string, unknown>;
            const summary = [
              d.version ? `v${d.version}` : '', d.file_name as string, d.signer_name ? `서명: ${d.signer_name}` : '', d.message as string,
              d.reason ? `사유: ${d.reason}` : '', d.contact as string, d.permission ? `권한: ${PERMISSION_LABEL[d.permission as Permission]}` : '',
              d.to ? `받는 사람: ${d.to}` : '', d.body as string, d.status && d.status !== 'sent' ? `(${d.status}${d.error ? `: ${d.error}` : ''})` : '',
              Array.isArray(d.approvers) ? `승인자: ${(d.approvers as { name: string }[]).map((a) => a.name).join(', ')}` : '',
            ].filter(Boolean).join(' · ');
            return (
              <tr key={String(r.id)}>
                <td className="whitespace-nowrap text-slate-500">{fmtDateTime(r.at as string)}</td>
                <td className="whitespace-nowrap">{r.actor_label as string}<br /><span className="text-xs text-slate-400">{r.actor_type === 'vendor' ? '업체' : r.actor_type === 'staff' ? '내부' : '시스템'}</span></td>
                <td className="whitespace-nowrap font-medium">{ACTION_LABEL[r.action as string] ?? (r.action as string)}</td>
                {showProject && <td>{r.project_id ? <Link className="underline" href={`/admin/projects/${r.project_id}?tab=activity`}>보기</Link> : ''}</td>}
                <td className="max-w-md break-words text-slate-700">{summary}</td>
                <td className="whitespace-nowrap text-xs text-slate-400">{(r.ip as string) ?? ''}</td>
              </tr>
            );
          })}
          {!rows.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">기록이 없습니다.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
