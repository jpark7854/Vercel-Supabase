'use server';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { adminDb } from '@/lib/supabase/admin';
import { authClient } from '@/lib/supabase/server';
import { requireAdmin, requireStaff } from '@/lib/auth';
import { BUCKET, appUrl } from '@/lib/env';
import { encrypt, newLinkToken, newPassword, sha256 } from '@/lib/crypto';
import { looksLike, readHead, removeObjects } from '@/lib/storage';
import { notifyLinks } from '@/lib/notify';
import { dbError, done, fail, type ActionResult } from '@/lib/action';
import { PURPOSE_LABEL } from '@/lib/labels';

const MAX_BYTES = 50 * 1024 * 1024;
const str = (fd: FormData, k: string) => String(fd.get(k) ?? '').trim();
const projectPath = (id: string) => `/admin/projects/${id}`;

async function audit(staffId: string, staffName: string, action: string, projectId: string | null, detail: Record<string, unknown>, versionId: string | null = null, linkId: string | null = null) {
  await adminDb().rpc('audit', {
    p_actor_type: 'staff', p_actor_id: staffId, p_actor_label: staffName, p_action: action,
    p_project: projectId, p_version: versionId, p_link: linkId, p_detail: detail,
  });
}

function mailSummary(r: { sent: number; skipped: number; failed: number }) {
  const parts = [];
  if (r.sent) parts.push(`메일 ${r.sent}건 발송`);
  if (r.skipped) parts.push(`메일 ${r.skipped}건 미발송(메일 설정 없음)`);
  if (r.failed) parts.push(`메일 ${r.failed}건 실패 — 활동 기록 확인`);
  return parts.length ? ` (${parts.join(', ')})` : '';
}

// ───────────────────────── 로그인 ─────────────────────────
export async function signIn(fd: FormData): Promise<ActionResult> {
  const supabase = await authClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email: str(fd, 'email'), password: String(fd.get('password') ?? '') });
  if (error || !data.user) return fail('이메일 또는 비밀번호가 올바르지 않습니다.');
  const { data: staff } = await adminDb().from('staff').select('id').eq('id', data.user.id).eq('active', true).maybeSingle();
  if (!staff) {
    await supabase.auth.signOut();
    return fail('포털 사용 권한이 없는 계정입니다. 관리자에게 문의하세요.');
  }
  redirect('/admin');
}

export async function signOut() {
  const supabase = await authClient();
  await supabase.auth.signOut();
  redirect('/login');
}

export async function changeMyPassword(fd: FormData): Promise<ActionResult> {
  await requireStaff();
  const pw = String(fd.get('password') ?? '');
  if (pw.length < 10) return fail('비밀번호는 10자 이상으로 정해 주세요.');
  if (pw !== String(fd.get('password2') ?? '')) return fail('두 비밀번호가 다릅니다.');
  const { error } = await (await authClient()).auth.updateUser({ password: pw });
  if (error) return fail(`변경 실패: ${error.message}`);
  return done('비밀번호를 변경했습니다.');
}

// ───────────────────────── 프로젝트 ─────────────────────────
function projectFields(fd: FormData) {
  const ym = str(fd, 'prod_month'); // YYYY-MM
  const [y, m] = ym ? ym.split('-').map(Number) : [null, null];
  const w = str(fd, 'prod_week');
  return {
    brand_id: str(fd, 'brand_id'),
    product_name: str(fd, 'product_name'),
    material_type: str(fd, 'material_type'),
    prod_year: y, prod_month: m, prod_week: w ? Number(w) : null,
    next_action: str(fd, 'next_action') || null,
    note: str(fd, 'note') || null,
  };
}

export async function createProject(fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const f = projectFields(fd);
  if (!f.brand_id || !f.product_name || !f.material_type) return fail('브랜드·품목·부자재는 필수입니다.');
  const { data, error } = await adminDb().from('projects').insert({ ...f, created_by: s.id }).select('id').single();
  if (error) return dbError(error);
  await audit(s.id, s.name, 'project_create', data.id, { product_name: f.product_name, material_type: f.material_type });
  redirect(projectPath(data.id));
}

export async function updateProject(id: string, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const f = projectFields(fd);
  if (!f.brand_id || !f.product_name || !f.material_type) return fail('브랜드·품목·부자재는 필수입니다.');
  const { error } = await adminDb().from('projects').update({ ...f, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return dbError(error);
  await audit(s.id, s.name, 'project_update', id, f);
  redirect(projectPath(id));
}

// ───────────────────────── 업로드 ─────────────────────────
type FileMeta = { name: string; size: number; type: string };
const extOf = (name: string) => name.split('.').pop()?.toLowerCase() ?? '';

/** 1단계: 비공개 저장소에 직접 올릴 수 있는 서명 업로드 URL 발급 */
export async function prepareUpload(projectId: string, pdf: FileMeta, atts: FileMeta[]): Promise<ActionResult> {
  await requireStaff();
  const db = adminDb();
  const { data: p } = await db.from('projects').select('status').eq('id', projectId).single();
  if (!p) return fail('프로젝트를 찾을 수 없습니다.');
  if (p.status === 'approved' || p.status === 'rejected') return fail('승인 또는 반려된 프로젝트입니다. [개정 시작] 후 업로드해 주세요.');
  if (extOf(pdf.name) !== 'pdf') return fail('시안은 PDF 파일만 올릴 수 있습니다. (AI·PSD 등은 PDF로 저장해 주세요)');
  if (atts.length > 5) return fail('작업지시서는 최대 5개까지 첨부할 수 있습니다.');
  for (const f of [pdf, ...atts]) {
    if (f.size > MAX_BYTES) return fail(`${f.name}: 파일당 최대 50MB까지 올릴 수 있습니다.`);
    if (f.size === 0) return fail(`${f.name}: 빈 파일입니다.`);
  }
  for (const a of atts) if (!['pdf', 'xlsx', 'xls'].includes(extOf(a.name))) return fail(`${a.name}: 작업지시서는 PDF 또는 엑셀만 가능합니다.`);

  const sign = async (ext: string) => {
    const path = `projects/${projectId}/${randomUUID()}.${ext}`;
    const { data, error } = await db.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? 'upload url');
    return { path, token: data.token };
  };
  try {
    const pdfTarget = await sign('pdf');
    const attTargets = [];
    for (const a of atts) attTargets.push({ ...(await sign(extOf(a.name))), ext: extOf(a.name), name: a.name, type: a.type });
    return done(undefined, { pdf: pdfTarget, atts: attTargets });
  } catch (e) {
    return fail(`업로드 준비 실패: ${String(e).slice(0, 200)}`);
  }
}

/** 2단계: 실제 파일 형식 확인 → 버전 등록(+선택 시 발송·메일) */
export async function finalizeVersion(
  projectId: string,
  input: { pdfPath: string; attachments: { path: string; ext: string; name: string; type: string }[]; purpose: string; note: string; send: boolean },
): Promise<ActionResult> {
  const s = await requireStaff();
  const prefix = `projects/${projectId}/`;
  const all = [{ path: input.pdfPath, ext: 'pdf' }, ...input.attachments];
  if (!all.every((f) => f.path.startsWith(prefix) && !f.path.includes('..'))) return fail('잘못된 파일 경로입니다.');
  if (!(input.purpose in PURPOSE_LABEL)) return fail('발송 목적을 선택해 주세요.');

  const sizes: number[] = [];
  for (const f of all) {
    const h = await readHead(f.path);
    if (!h || !looksLike(h.head, f.ext)) {
      await removeObjects(all.map((x) => x.path));
      return fail(f.ext === 'pdf' && f.path === input.pdfPath ? '올린 파일이 올바른 PDF가 아닙니다. PDF로 다시 저장해 주세요.' : '작업지시서 파일 형식이 올바르지 않습니다.');
    }
    sizes.push(h.size);
  }

  const { data, error } = await adminDb().rpc('create_version', {
    p_project: projectId, p_staff: s.id, p_pdf_path: input.pdfPath, p_pdf_size: sizes[0],
    p_purpose: input.purpose, p_note: input.note,
    p_attachments: input.attachments.map((a, i) => ({ path: a.path, ext: a.ext, original_name: a.name, mime_type: a.type, size: sizes[i + 1] })),
    p_send: input.send,
  });
  if (error) {
    await removeObjects(all.map((x) => x.path));
    return dbError(error);
  }
  const r = data as { version_id: string; version_no: number; file_name: string; sent_link_ids: string[] };
  let msg = `${r.file_name} 업로드 완료`;
  if (input.send) {
    const m = await notifyLinks(r.sent_link_ids ?? [], r.version_id, r.version_no > 1 ? 'new_version' : 'approval_request');
    msg += ` · 업체 ${r.sent_link_ids?.length ?? 0}명에게 발송${mailSummary(m)}`;
  }
  revalidatePath(projectPath(projectId));
  return done(msg, { versionId: r.version_id });
}

export async function sendVersionAction(projectId: string, versionId: string, _fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const { data, error } = await adminDb().rpc('send_version', { p_version: versionId, p_staff: s.id });
  if (error) return dbError(error);
  const ids = (data as string[]) ?? [];
  const { data: v } = await adminDb().from('versions').select('version_no').eq('id', versionId).single();
  const m = await notifyLinks(ids, versionId, (v?.version_no ?? 1) > 1 ? 'new_version' : 'approval_request');
  revalidatePath(projectPath(projectId));
  return done(`업체 ${ids.length}명에게 발송했습니다${mailSummary(m)}${ids.length === 0 ? ' — 발급된 링크가 없습니다. [공유 링크] 탭에서 발급하세요.' : ''}`);
}

// ───────────────────────── 상태 변경 ─────────────────────────
export async function releasePrintAction(projectId: string, _fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await adminDb().rpc('release_print', { p_project: projectId, p_staff: s.id });
  if (error) return dbError(error);
  revalidatePath(projectPath(projectId));
  return done('인쇄·발주 진행을 기록했습니다.');
}

export async function startRevisionAction(projectId: string, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await adminDb().rpc('start_revision', { p_project: projectId, p_staff: s.id, p_reason: str(fd, 'reason') });
  if (error) return dbError(error);
  revalidatePath(projectPath(projectId));
  return done('개정을 시작했습니다. 새 버전을 업로드해 주세요.');
}

export async function rejectAction(projectId: string, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await adminDb().rpc('reject_project', { p_project: projectId, p_staff: s.id, p_reason: str(fd, 'reason') });
  if (error) return dbError(error);
  revalidatePath(projectPath(projectId));
  return done('반려 처리했습니다.');
}

export async function staffComment(projectId: string, versionId: string, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const body = str(fd, 'body');
  if (!body) return fail('내용을 입력해 주세요.');
  const page = Math.max(1, parseInt(str(fd, 'page'), 10) || 1);
  const x = str(fd, 'x') ? Number(str(fd, 'x')) : null;
  const y = str(fd, 'y') ? Number(str(fd, 'y')) : null;
  const { error } = await adminDb().from('comments').insert({
    version_id: versionId, page, x, y, body: body.slice(0, 4000), author_type: 'staff', staff_id: s.id, author_name: s.name,
  });
  if (error) return dbError(error);
  await audit(s.id, s.name, 'comment', projectId, { page, body: body.slice(0, 500) }, versionId);
  revalidatePath(projectPath(projectId));
  return done('코멘트를 등록했습니다.');
}

// ───────────────────────── 공유 링크 ─────────────────────────
export async function issueLinkAction(projectId: string, fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const contactId = str(fd, 'contact_id');
  const permission = str(fd, 'permission');
  if (!contactId) return fail('업체 담당자를 선택해 주세요.');
  if (!['view', 'comment', 'approve'].includes(permission)) return fail('권한을 선택해 주세요.');
  const expires = str(fd, 'expires_at'); // YYYY-MM-DD
  const expiresAt = expires ? new Date(`${expires}T23:59:59+09:00`).toISOString() : null;

  const token = newLinkToken();
  const password = newPassword();
  const { data, error } = await adminDb().rpc('issue_link', {
    p_project: projectId, p_contact: contactId, p_permission: permission, p_expires: expiresAt,
    p_token_hash: sha256(token), p_token_enc: encrypt(token), p_password_hash: await bcrypt.hash(password, 10),
    p_staff: s.id, p_method: str(fd, 'method'),
  });
  if (error) return dbError(error);
  const r = data as { link_id: string; dispatched_version_id: string | null };
  let mail = '';
  if (fd.get('send_email') === 'on' && r.dispatched_version_id) {
    mail = mailSummary(await notifyLinks([r.link_id], r.dispatched_version_id, 'link_issued'));
  }
  revalidatePath(projectPath(projectId));
  return done(`링크를 발급했습니다${mail}`, { url: `${appUrl()}/r/${token}`, password });
}

export async function revokeLinkAction(projectId: string, linkId: string, _fd: FormData): Promise<ActionResult> {
  const s = await requireStaff();
  const { error } = await adminDb().rpc('revoke_link', { p_link: linkId, p_staff: s.id });
  if (error) return dbError(error);
  revalidatePath(projectPath(projectId));
  return done('링크를 폐기했습니다. 이 링크로는 더 이상 접속할 수 없습니다.');
}

// ───────────────────────── 대장 ─────────────────────────
export async function updateDispatch(dispatchId: string, fd: FormData): Promise<ActionResult> {
  await requireStaff();
  const { error } = await adminDb().from('dispatches').update({
    method: str(fd, 'method') || '포털 링크', next_action: str(fd, 'next_action') || null, note: str(fd, 'note') || null,
  }).eq('id', dispatchId);
  if (error) return dbError(error);
  revalidatePath('/admin/ledger');
  return done('저장됨');
}

// ───────────────────────── 기초정보 (관리자) ─────────────────────────
export async function createBrand(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = str(fd, 'name');
  if (!name) return fail('브랜드명을 입력해 주세요.');
  const { error } = await adminDb().from('brands').insert({ name });
  if (error) return error.code === '23505' ? fail('이미 있는 브랜드입니다.') : dbError(error);
  revalidatePath('/admin/settings');
  return done(`브랜드 "${name}" 추가`);
}

export async function createVendor(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const name = str(fd, 'name');
  if (!name) return fail('업체명을 입력해 주세요.');
  const { error } = await adminDb().from('vendors').insert({ name, type: str(fd, 'type') || 'other', memo: str(fd, 'memo') || null });
  if (error) return dbError(error);
  revalidatePath('/admin/settings');
  return done(`업체 "${name}" 추가`);
}

export async function createContact(fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const email = str(fd, 'email');
  if (!str(fd, 'vendor_id') || !str(fd, 'name') || !/^\S+@\S+\.\S+$/.test(email)) return fail('업체·이름·이메일을 정확히 입력해 주세요.');
  const { error } = await adminDb().from('vendor_contacts').insert({ vendor_id: str(fd, 'vendor_id'), name: str(fd, 'name'), email, phone: str(fd, 'phone') || null });
  if (error) return dbError(error);
  revalidatePath('/admin/settings');
  return done('담당자 추가');
}

export async function setContactActive(contactId: string, active: boolean, _fd: FormData): Promise<ActionResult> {
  await requireAdmin();
  const { error } = await adminDb().from('vendor_contacts').update({ active }).eq('id', contactId);
  if (error) return dbError(error);
  revalidatePath('/admin/settings');
  return done(active ? '사용으로 변경' : '사용 중지');
}

export async function createStaffAccount(fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const email = str(fd, 'email').toLowerCase();
  const name = str(fd, 'name');
  const role = str(fd, 'role') === 'admin' ? 'admin' : 'staff';
  if (!name || !/^\S+@\S+\.\S+$/.test(email)) return fail('이름과 이메일을 정확히 입력해 주세요.');
  const tempPassword = newPassword(12);
  const db = adminDb();
  const { data, error } = await db.auth.admin.createUser({ email, password: tempPassword, email_confirm: true });
  if (error || !data.user) return fail(`계정 생성 실패: ${error?.message ?? ''}`);
  const { error: e2 } = await db.from('staff').insert({ id: data.user.id, name, email, role });
  if (e2) return dbError(e2);
  await audit(admin.id, admin.name, 'staff_create', null, { name, email, role });
  revalidatePath('/admin/settings');
  return done(`${name} 계정을 만들었습니다.`, { password: tempPassword });
}

export async function setStaffActive(staffId: string, active: boolean, _fd: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  if (staffId === admin.id) return fail('본인 계정은 중지할 수 없습니다.');
  const { error } = await adminDb().from('staff').update({ active }).eq('id', staffId);
  if (error) return dbError(error);
  await audit(admin.id, admin.name, active ? 'staff_activate' : 'staff_deactivate', null, { staff_id: staffId });
  revalidatePath('/admin/settings');
  return done(active ? '사용으로 변경' : '사용 중지');
}
