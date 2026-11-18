import { adminDb } from '@/lib/supabase/admin';
import { resolveVendor, vendorLabel, visibleVersion } from '@/lib/vendor';
import { signedViewUrl } from '@/lib/storage';
import { requestMeta } from '@/lib/request-meta';
import { DECISION_LABEL, PERMISSION_LABEL, PURPOSE_LABEL, fmtWeek } from '@/lib/labels';
import { fmtDateTime } from '@/lib/format';
import ReviewWorkspace, { type CommentView } from '@/components/ReviewWorkspace';
import { vendorComment, vendorDecide, vendorLogin } from './actions';
import { DecisionBar, LoginForm } from './VendorClient';

export const dynamic = 'force-dynamic';
export const metadata = { title: '파일 확인 | 명성코퍼레이션 디자인 포털', referrer: 'no-referrer' as const };

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-4 py-3 text-sm font-semibold">명성코퍼레이션 디자인 포털</div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 pb-32">{children}</main>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <Shell>
      <div className="card mx-auto mt-10 max-w-md text-center">
        <h1 className="mb-2 text-lg font-bold">{title}</h1>
        <p className="muted">{body}</p>
      </div>
    </Shell>
  );
}

export default async function VendorPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const st = await resolveVendor(token);

  if (st.kind === 'invalid') return <Notice title="유효하지 않은 링크입니다" body="주소를 다시 확인하시거나 명성코퍼레이션 담당자에게 문의해 주세요." />;
  if (st.kind === 'revoked') return <Notice title="사용이 중지된 링크입니다" body="이 링크는 폐기되었습니다. 새 링크가 필요하면 명성코퍼레이션 담당자에게 문의해 주세요." />;
  if (st.kind === 'expired') return <Notice title="기간이 만료된 링크입니다" body="열람 기간이 끝났습니다. 명성코퍼레이션 담당자에게 문의해 주세요." />;

  if (st.kind === 'login') {
    return (
      <Shell>
        <div className="card mx-auto mt-6 max-w-sm">
          <h1 className="mb-1 text-lg font-bold">파일 확인</h1>
          <p className="muted mb-4">메일·메시지와 별도로 전달받은 비밀번호를 입력해 주세요.</p>
          <LoginForm action={vendorLogin.bind(null, token)} />
        </div>
      </Shell>
    );
  }

  const { link } = st;
  const p = link.project;
  const db = adminDb();
  const v = await visibleVersion(p.id);
  if (!v) return <Notice title="아직 공유된 파일이 없습니다" body="파일이 준비되면 메일로 안내드리겠습니다." />;

  const [{ data: atts }, { data: cmts }, { data: myDecisions }, { data: approvals }] = await Promise.all([
    db.from('attachments').select('id, file_name, size').eq('version_id', v.id).order('created_at'),
    db.from('comments').select('id, page, x, y, body, author_name, author_type, created_at').eq('version_id', v.id).order('created_at'),
    db.from('decisions').select('decision, signer_name, message, created_at').eq('version_id', v.id).eq('link_id', link.id).order('created_at', { ascending: false }),
    v.locked
      ? db.from('decisions').select('signer_name, created_at, link_id').eq('version_id', v.id).eq('decision', 'approved').order('created_at')
      : Promise.resolve({ data: [] as { signer_name: string; created_at: string }[] }),
  ]);

  // 열람 기록 (30분 내 중복 기록 방지)
  const meta = await requestMeta();
  const since = new Date(Date.now() - 30 * 60_000).toISOString();
  const { count } = await db.from('audit_logs').select('id', { count: 'exact', head: true })
    .eq('action', 'view').eq('link_id', link.id).eq('version_id', v.id).gte('at', since);
  if (!count) {
    await db.rpc('audit', {
      p_actor_type: 'vendor', p_actor_id: link.id, p_actor_label: vendorLabel(link), p_action: 'view',
      p_project: p.id, p_version: v.id, p_link: link.id, p_detail: { version: v.version_no, file_name: v.file_name }, p_ip: meta.ip, p_ua: meta.ua,
    });
    await db.from('share_links').update({ last_accessed_at: new Date().toISOString() }).eq('id', link.id);
  }

  const url = (await signedViewUrl(v.pdf_path)) ?? '';
  const comments: CommentView[] = (cmts ?? []).map((c) => ({ ...c, created_label: fmtDateTime(c.created_at) }));
  const isCurrent = p.current_version_id === v.id;
  const canRespond = !v.locked && isCurrent && ['pending', 'changes_requested'].includes(p.status) && link.permission !== 'view';
  const last = myDecisions?.[0];

  return (
    <Shell>
      <section className="mb-4 flex flex-col gap-2">
        <p className="muted">{p.brand.name} · {p.material_type}</p>
        <h1 className="h1">{p.product_name} <span className="text-slate-400">v{v.version_no}</span></h1>
        <p className="break-all text-sm text-slate-600">{v.file_name}</p>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="rounded bg-slate-100 px-2 py-1">발송 목적: {PURPOSE_LABEL[v.purpose]}</span>
          {p.prod_year && <span className="rounded bg-slate-100 px-2 py-1">생산 예정: {fmtWeek(p.prod_year, p.prod_month, p.prod_week)}</span>}
          <span className="rounded bg-slate-100 px-2 py-1">발송일: {fmtDateTime(v.sent_at)}</span>
          <span className="rounded bg-slate-100 px-2 py-1">{link.contact.name} 님 · 권한: {PERMISSION_LABEL[link.permission]}</span>
        </div>
      </section>

      {v.locked && (
        <div className="mb-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-900">
          <p className="font-bold">✔ 최종 승인본입니다 (수정 불가)</p>
          <p className="text-sm">승인 완료: {fmtDateTime(v.approved_at)}</p>
          <p className="text-sm">승인자: {(approvals ?? []).map((a) => a.signer_name).join(', ')}</p>
        </div>
      )}
      {!isCurrent && !v.locked && (
        <div className="mb-4 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">새 버전을 준비하고 있습니다. 새 버전이 발송되면 메일로 안내드립니다.</div>
      )}
      {last && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <b>내 회신:</b> {DECISION_LABEL[last.decision]} · {last.signer_name} · {fmtDateTime(last.created_at)}
          {last.message && <p className="mt-1 whitespace-pre-wrap text-slate-600">“{last.message}”</p>}
          {canRespond && <p className="mt-1 text-slate-500">필요하면 아래 버튼으로 다시 회신할 수 있습니다.</p>}
        </div>
      )}

      <section className="mb-4 flex flex-wrap gap-2">
        <a className="btn" href={`/r/${token}/download/pdf`}>⬇ 시안 PDF 내려받기</a>
        {(atts ?? []).map((a) => (
          <a key={a.id} className="btn" href={`/r/${token}/download/${a.id}`}>⬇ {a.file_name.endsWith('.pdf') ? '작업지시서(PDF)' : '작업지시서(엑셀)'}</a>
        ))}
      </section>

      {v.note && <p className="mb-4 rounded-lg bg-white p-3 text-sm ring-1 ring-slate-200"><b>담당자 메모:</b> {v.note}</p>}

      <ReviewWorkspace
        url={url}
        fileKey={v.id}
        comments={comments}
        canComment={canRespond}
        addComment={canRespond ? vendorComment.bind(null, token, v.id) : undefined}
        disabledReason={link.permission === 'view' ? '보기 전용 링크입니다. 의견은 명성코퍼레이션 담당자에게 전달해 주세요.' : undefined}
      />

      {canRespond && (
        <DecisionBar
          canApprove={link.permission === 'approve'}
          fileName={v.file_name}
          requestChanges={vendorDecide.bind(null, token, v.id, 'changes_requested')}
          approve={link.permission === 'approve' ? vendorDecide.bind(null, token, v.id, 'approved') : undefined}
        />
      )}
    </Shell>
  );
}
