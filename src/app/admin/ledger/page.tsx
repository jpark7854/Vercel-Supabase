import Link from 'next/link';
import { fetchLedger, LEDGER_COLUMNS } from '@/lib/ledger';
import { updateDispatch } from '../actions';
import { LedgerEditor } from './LedgerEditor';

const SHOWN = LEDGER_COLUMNS.filter((c) => !['발송 방법', '다음 할 일', '비고'].includes(c));

export default async function Ledger({ searchParams }: { searchParams: Promise<{ from?: string; to?: string; q?: string }> }) {
  const sp = await searchParams;
  const rows = await fetchLedger(sp);
  const qs = new URLSearchParams(Object.entries(sp).filter(([, v]) => v) as [string, string][]).toString();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="h1">발송·승인 대장</h1>
        <div className="flex gap-2">
          <a className="btn" href={`/admin/ledger/export?format=xlsx&${qs}`}>⬇ 엑셀</a>
          <a className="btn" href={`/admin/ledger/export?format=csv&${qs}`}>⬇ CSV</a>
        </div>
      </div>
      <form className="flex flex-wrap items-end gap-2">
        <div><label className="label">발송일 from</label><input type="date" name="from" defaultValue={sp.from} className="input" /></div>
        <div><label className="label">to</label><input type="date" name="to" defaultValue={sp.to} className="input" /></div>
        <input name="q" defaultValue={sp.q} placeholder="업체·담당자·파일명 검색" className="input w-56" />
        <button className="btn">조회</button>
      </form>
      <p className="muted">한 줄 = 한 버전을 한 업체 담당자에게 보낸 기록입니다. 발송 방법·다음 할 일·비고는 이 화면에서 바로 고칠 수 있습니다. ({rows.length}건)</p>
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="tbl">
          <thead><tr>{SHOWN.map((c) => <th key={c}>{c}</th>)}<th>발송 방법 / 다음 할 일 / 비고</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.dispatch_id}>
                {SHOWN.map((c) => (
                  <td key={c} className={c === '파일명' ? 'min-w-56 break-all' : 'whitespace-nowrap'}>
                    {c === '품목·부자재' ? <Link className="underline" href={`/admin/projects/${r.project_id}`}>{r.values[c]}</Link> : r.values[c]}
                  </td>
                ))}
                <td><LedgerEditor action={updateDispatch.bind(null, r.dispatch_id)} method={r.values['발송 방법']} nextAction={r.values['다음 할 일']} note={r.values['비고']} /></td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={SHOWN.length + 1} className="py-8 text-center text-slate-500">기록이 없습니다.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
