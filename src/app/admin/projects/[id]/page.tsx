import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/supabase/admin';
import { requireStaff } from '@/lib/auth';
import { signedViewUrl } from '@/lib/storage';
import { StatusBadge } from '@/components/StatusBadge';
import { ActionForm, Submit } from '@/components/ActionForm';
import ReviewWorkspace, { type CommentView } from '@/components/ReviewWorkspace';
import { DECISION_LABEL, PERMISSION_LABEL, PURPOSE_LABEL, fmtWeek, type Permission, type ProjectStatus } from '@/lib/labels';
import { fmtDateTime, fmtSize } from '@/lib/format';
import type { VersionRow } from '@/lib/vendor';
import { IssueLinkForm } from './IssueLinkForm';
import { AuditTable } from '@/components/AuditTable';
import {
  rejectAction, releasePrintAction, revokeLinkAction, sendVersionAction, staffComment, startRevisionAction, issueLinkAction,
} from '../../actions';

const TABS = [
  { key: 'view', label: '파일 보기·코멘트' },
  { key: 'versions', label: '버전 이력' },
  { key: 'links', label: '공유 링크' },
  { key: 'activity', label: '활동 기록' },
];

type LinkRow = {
  id: string; permission: Permission; expires_at: string | null; revoked_at: string | null; last_accessed_at: string | null; created_at: string;
  contact: { name: string; email: string; vendor: { name: string } };
};

export default async function ProjectDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string; v?: string }> }) {
  await requireStaff();
  const { id } = await params;
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? sp.tab! : 'view';
  const db = adminDb();

  const { data: project } = await db.from('projects').select('*, brand:brands(name)').eq('id', id).maybeSingle();
  if (!project) notFound();
  const status = project.status as ProjectStatus;

  const [{ data: versionsData }, { data: linksData }, { data: staffList }] = await Promise.all([
    db.from('versions').select('*').eq('project_id', id).order('version_no', { ascending: false }),
    db.from('share_links').select('id, permission, expires_at, revoked_at, last_accessed_at, created_at, contact:vendor_contacts(name, email, vendor:vendors(name))').eq('project_id', id).order('created_at'),
    db.from('staff').select('id, name'),
  ]);
  const versions = (versionsData ?? []) as VersionRow[];
  const links = (linksData ?? []) as unknown as LinkRow[];
  const staffName = (sid: string | null) => staffList?.find((s) => s.id === sid)?.name ?? '';
  const current = versions.find((v) => v.id === project.current_version_id) ?? null;
  const approved = versions.find((v) => v.id === project.approved_version_id) ?? null;
  const selected = versions.find((v) => v.id === sp.v) ?? current;

  // 현재 버전에 대한 업체별 최신 회신
  const { data: decs } = current
    ? await db.from('decisions').select('link_id, decision, signer_name, message, created_at').eq('version_id', current.id).order('created_at', { ascending: false })
    : { data: [] as { link_id: string; decision: string; signer_name: string; message: string | null; created_at: string }[] };
  const latestByLink = new Map<string, NonNullable<typeof decs>[number]>();
  (decs ?? []).forEach((d) => { if (!latestByLink.has(d.link_id)) latestByLink.set(d.link_id, d); });

  const canPrint = status === 'approved' && approved && current && approved.id === current.id && !approved.print_released_at;
  const printBlockedReason =
    approved?.print_released_at && approved.id === current?.id
      ? null
      : status !== 'approved'
        ? '최종 승인 전에는 인쇄·발주를 진행할 수 없습니다.'
        : null;
  const activeLinks = links.filter((l) => !l.revoked_at);
  const title = `${project.brand.name} · ${project.product_name} / ${project.material_type}`;

  return (
    <div className="flex flex-col gap-5">
      {/* 헤더 */}
      <section className="card flex flex-col gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <p className="muted">{project.brand.name} · {project.material_type}</p>
            <h1 className="h1 flex flex-wrap items-center gap-2">{project.product_name} <StatusBadge status={status} /></h1>
            <p className="mt-1 text-sm text-slate-600">
              생산 예정: {fmtWeek(project.prod_year, project.prod_month, project.prod_week) || '-'}
              {project.next_action && <> · 다음 할 일: <b>{project.next_action}</b></>}
            </p>
            {project.note && <p className="text-sm text-slate-500">비고: {project.note}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/projects/${id}/edit`} className="btn">정보 수정</Link>
            {status !== 'approved' && status !== 'rejected' && <Link href={`/admin/projects/${id}/upload`} className="btn btn-primary">⬆ 새 버전 업로드</Link>}
          </div>
        </div>

        {current && !current.sent_at && (
          <div className="flex flex-wrap items-center gap-3 rounded-lg bg-slate-100 p-3 text-sm">
            <span><b>v{current.version_no}</b> 이(가) 아직 업체에 발송되지 않았습니다 (발송 예정).</span>
            <ActionForm action={sendVersionAction.bind(null, id, current.id)} confirm={`v${current.version_no}을(를) 링크가 발급된 업체 ${activeLinks.length}명에게 발송할까요?`}>
              <Submit>업체에 발송</Submit>
            </ActionForm>
          </div>
        )}

        {/* 인쇄·발주 */}
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 p-3">
          {approved?.print_released_at && approved.id === current?.id ? (
            <p className="text-sm font-medium text-emerald-800">✔ 인쇄·발주 진행됨 — {fmtDateTime(approved.print_released_at)} · {staffName(approved.print_released_by)} (v{approved.version_no})</p>
          ) : (
            <>
              <ActionForm action={releasePrintAction.bind(null, id)} confirm="최종 승인본 기준으로 인쇄·발주 진행을 기록할까요? (되돌릴 수 없습니다)">
                <Submit className="btn btn-approve" disabled={!canPrint}>🖨 인쇄·발주 진행</Submit>
              </ActionForm>
              {printBlockedReason && <span className="text-sm text-rose-700">🔒 {printBlockedReason}</span>}
            </>
          )}
          {approved && (
            <Link href={`/admin/projects/${id}?tab=view&v=${approved.id}`} className="ml-auto text-sm underline">
              최종 승인본 v{approved.version_no} 열기 ({fmtDateTime(approved.approved_at)})
            </Link>
          )}
        </div>

        {/* 승인 진행 현황 */}
        {current?.sent_at && (
          <div>
            <h2 className="mb-2 text-sm font-semibold">v{current.version_no} 회신 현황</h2>
            <div className="flex flex-wrap gap-2">
              {activeLinks.filter((l) => l.permission !== 'view').map((l) => {
                const d = latestByLink.get(l.id);
                return (
                  <div key={l.id} className={`rounded-lg px-3 py-2 text-sm ring-1 ${d?.decision === 'approved' ? 'bg-emerald-50 ring-emerald-300' : d?.decision === 'changes_requested' ? 'bg-rose-50 ring-rose-300' : 'bg-white ring-slate-200'}`}>
                    <p className="font-medium">{l.contact.vendor.name} · {l.contact.name} <span className="text-xs text-slate-500">({PERMISSION_LABEL[l.permission]})</span></p>
                    <p className="text-xs">{d ? `${DECISION_LABEL[d.decision]} · ${d.signer_name} · ${fmtDateTime(d.created_at)}` : '회신 대기'}</p>
                    {d?.message && <p className="mt-1 max-w-xs whitespace-pre-wrap text-xs text-slate-600">“{d.message}”</p>}
                  </div>
                );
              })}
              {!activeLinks.some((l) => l.permission !== 'view') && <p className="muted">코멘트·승인 권한 링크가 없습니다. [공유 링크] 탭에서 발급하세요.</p>}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {(status === 'approved' || status === 'rejected') && (
            <details className="rounded-lg border border-slate-200 p-2 text-sm">
              <summary className="cursor-pointer font-medium">개정 시작 (새 버전으로 다시 검토)</summary>
              <ActionForm action={startRevisionAction.bind(null, id)} className="mt-2 flex flex-wrap gap-2" confirm="개정을 시작하면 인쇄·발주가 다시 잠기고 새 버전 승인이 필요합니다. 진행할까요?">
                <input name="reason" required className="input w-72" placeholder="개정 사유 (예: 용량 표기 변경)" />
                <Submit className="btn">개정 시작</Submit>
              </ActionForm>
            </details>
          )}
          {status !== 'approved' && status !== 'rejected' && (
            <details className="rounded-lg border border-slate-200 p-2 text-sm">
              <summary className="cursor-pointer text-slate-600">반려 처리 (프로젝트 중단·취소)</summary>
              <ActionForm action={rejectAction.bind(null, id)} className="mt-2 flex flex-wrap gap-2" confirm="반려 처리할까요?">
                <input name="reason" required className="input w-72" placeholder="반려 사유" />
                <Submit className="btn btn-danger">반려</Submit>
              </ActionForm>
            </details>
          )}
        </div>
      </section>

      {/* 탭 */}
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <Link key={t.key} href={`/admin/projects/${id}?tab=${t.key}`} className={`whitespace-nowrap border-b-2 px-3 py-2 text-sm ${tab === t.key ? 'border-slate-900 font-semibold' : 'border-transparent text-slate-500'}`}>
            {t.label}{t.key === 'links' ? ` (${activeLinks.length})` : t.key === 'versions' ? ` (${versions.length})` : ''}
          </Link>
        ))}
      </nav>

      {tab === 'view' && <ViewTab projectId={id} selected={selected} versions={versions} approvedId={approved?.id} currentId={current?.id} title={title} />}
      {tab === 'versions' && <VersionsTab projectId={id} versions={versions} approvedId={approved?.id} staffName={staffName} />}
      {tab === 'links' && <LinksTab projectId={id} links={links} hasSentVersion={versions.some((v) => v.sent_at)} />}
      {tab === 'activity' && <ActivityTab projectId={id} />}
    </div>
  );
}

async function ViewTab({ projectId, selected, versions, approvedId, currentId }: { projectId: string; selected: VersionRow | null; versions: VersionRow[]; approvedId?: string; currentId?: string; title: string }) {
  if (!selected) {
    return (
      <div className="card text-center">
        <p className="mb-3">아직 올린 파일이 없습니다.</p>
        <Link href={`/admin/projects/${projectId}/upload`} className="btn btn-primary">⬆ 첫 버전(v1) 업로드</Link>
      </div>
    );
  }
  const db = adminDb();
  const [{ data: atts }, { data: cmts }] = await Promise.all([
    db.from('attachments').select('id, file_name, size').eq('version_id', selected.id).order('created_at'),
    db.from('comments').select('id, page, x, y, body, author_name, author_type, created_at').eq('version_id', selected.id).order('created_at'),
  ]);
  const url = (await signedViewUrl(selected.pdf_path)) ?? '';
  const comments: CommentView[] = (cmts ?? []).map((c) => ({ ...c, created_label: fmtDateTime(c.created_at) }));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5">
        {versions.map((v) => (
          <Link key={v.id} href={`/admin/projects/${projectId}?tab=view&v=${v.id}`} className={`rounded-full px-3 py-1 text-sm ring-1 ${v.id === selected.id ? 'bg-slate-900 text-white ring-slate-900' : 'bg-white ring-slate-300'}`}>
            v{v.version_no}{v.id === approvedId ? ' ✔승인본' : v.id === currentId ? ' (최신)' : ''}
          </Link>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="break-all font-medium">{selected.file_name}</span>
        <span className="muted">{fmtSize(selected.pdf_size)} · {PURPOSE_LABEL[selected.purpose]} · 업로드 {fmtDateTime(selected.uploaded_at)} · {selected.sent_at ? `발송 ${fmtDateTime(selected.sent_at)}` : '미발송'}</span>
        {selected.locked && <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-800">🔒 최종 승인본 · {fmtDateTime(selected.approved_at)}</span>}
        {selected.id !== currentId && <span className="rounded bg-amber-100 px-2 py-0.5 text-xs text-amber-900">보관된 이전 버전 (업체에는 보이지 않음)</span>}
      </div>
      <div className="flex flex-wrap gap-2">
        <a className="btn btn-sm" href={`/admin/download/version/${selected.id}`}>⬇ PDF</a>
        {(atts ?? []).map((a) => <a key={a.id} className="btn btn-sm" href={`/admin/download/attachment/${a.id}`}>⬇ {a.file_name}</a>)}
      </div>
      {selected.note && <p className="text-sm text-slate-600">메모: {selected.note}</p>}
      <ReviewWorkspace url={url} fileKey={selected.id} comments={comments} canComment addComment={staffComment.bind(null, projectId, selected.id)} />
    </div>
  );
}

function VersionsTab({ projectId, versions, approvedId, staffName }: { projectId: string; versions: VersionRow[]; approvedId?: string; staffName: (id: string | null) => string }) {
  return (
    <div className="flex flex-col gap-4">
      {versions.length >= 2 && (
        <form action={`/admin/projects/${projectId}/compare`} className="card flex flex-wrap items-end gap-2">
          <div><label className="label">비교 A</label><select name="a" defaultValue={versions[1].id} className="input">{versions.map((v) => <option key={v.id} value={v.id}>v{v.version_no}</option>)}</select></div>
          <div><label className="label">비교 B</label><select name="b" defaultValue={versions[0].id} className="input">{versions.map((v) => <option key={v.id} value={v.id}>v{v.version_no}</option>)}</select></div>
          <button className="btn btn-primary">나란히 비교</button>
        </form>
      )}
      <div className="card overflow-x-auto p-0 sm:p-0">
        <table className="tbl">
          <thead><tr><th>버전</th><th>파일명</th><th>발송 목적</th><th>업로드</th><th>발송</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.id}>
                <td className="font-semibold">v{v.version_no}</td>
                <td className="break-all">{v.file_name}</td>
                <td className="whitespace-nowrap">{PURPOSE_LABEL[v.purpose]}</td>
                <td className="whitespace-nowrap">{fmtDateTime(v.uploaded_at)}<br /><span className="muted">{staffName(v.uploaded_by)}</span></td>
                <td className="whitespace-nowrap">{v.sent_at ? fmtDateTime(v.sent_at) : '미발송'}</td>
                <td className="whitespace-nowrap">
                  {v.locked ? <span className="text-emerald-700">🔒 승인 {fmtDateTime(v.approved_at)}{v.id === approvedId ? ' (최종)' : ''}</span> : '-'}
                  {v.print_released_at && <><br /><span className="text-xs">🖨 인쇄·발주 {fmtDateTime(v.print_released_at)}</span></>}
                </td>
                <td><Link className="btn btn-sm" href={`/admin/projects/${projectId}?tab=view&v=${v.id}`}>보기</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function LinksTab({ projectId, links, hasSentVersion }: { projectId: string; links: LinkRow[]; hasSentVersion: boolean }) {
  const { data: contacts } = await adminDb().from('vendor_contacts').select('id, name, email, vendor:vendors(name)').eq('active', true).order('name');
  const list = ((contacts ?? []) as unknown as { id: string; name: string; email: string; vendor: { name: string } }[])
    .map((c) => ({ id: c.id, name: c.name, email: c.email, vendor: c.vendor.name }))
    .sort((a, b) => a.vendor.localeCompare(b.vendor, 'ko'));
  const now = Date.now();
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <IssueLinkForm action={issueLinkAction.bind(null, projectId)} contacts={list} hasSentVersion={hasSentVersion} />
      <div className="card overflow-x-auto">
        <h3 className="h2 mb-3">발급된 링크</h3>
        <table className="tbl">
          <thead><tr><th>업체 / 담당자</th><th>권한</th><th>만료</th><th>최근 접속</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {links.map((l) => {
              const expired = l.expires_at && new Date(l.expires_at).getTime() <= now;
              return (
                <tr key={l.id} className={l.revoked_at ? 'opacity-50' : ''}>
                  <td>{l.contact.vendor.name}<br /><span className="muted">{l.contact.name} · {l.contact.email}</span></td>
                  <td>{PERMISSION_LABEL[l.permission]}</td>
                  <td className="whitespace-nowrap">{l.expires_at ? fmtDateTime(l.expires_at).slice(0, 12) : '무기한'}</td>
                  <td className="whitespace-nowrap">{fmtDateTime(l.last_accessed_at)}</td>
                  <td className="whitespace-nowrap">{l.revoked_at ? `폐기 ${fmtDateTime(l.revoked_at)}` : expired ? '만료' : '사용 중'}</td>
                  <td>
                    {!l.revoked_at && (
                      <ActionForm action={revokeLinkAction.bind(null, projectId, l.id)} confirm={`${l.contact.name} 님의 링크를 폐기할까요? 즉시 접속할 수 없게 됩니다.`}>
                        <Submit className="btn btn-sm btn-danger">폐기</Submit>
                      </ActionForm>
                    )}
                  </td>
                </tr>
              );
            })}
            {!links.length && <tr><td colSpan={6} className="py-6 text-center text-slate-500">발급된 링크가 없습니다.</td></tr>}
          </tbody>
        </table>
        <p className="muted mt-3 text-xs">비밀번호를 잊은 업체에는 기존 링크를 폐기하고 새로 발급하세요. (보안상 비밀번호는 다시 볼 수 없습니다)</p>
      </div>
    </div>
  );
}

async function ActivityTab({ projectId }: { projectId: string }) {
  const { data } = await adminDb().from('audit_logs').select('*').eq('project_id', projectId).order('at', { ascending: false }).limit(500);
  return <AuditTable rows={data ?? []} />;
}
