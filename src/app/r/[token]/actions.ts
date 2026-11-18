'use server';
import bcrypt from 'bcryptjs';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { adminDb } from '@/lib/supabase/admin';
import { findLink, resolveVendor, startVendorSession, vendorLabel, visibleVersion } from '@/lib/vendor';
import { requestMeta } from '@/lib/request-meta';
import { dbError, done, fail, type ActionResult } from '@/lib/action';

export async function vendorLogin(token: string, fd: FormData): Promise<ActionResult> {
  const link = await findLink(token);
  if (!link) return fail('유효하지 않은 링크입니다.');
  if (link.revoked_at) return fail('폐기된 링크입니다. 명성코퍼레이션 담당자에게 문의해 주세요.');
  if (link.expires_at && new Date(link.expires_at) <= new Date()) return fail('만료된 링크입니다. 명성코퍼레이션 담당자에게 문의해 주세요.');
  if (link.locked_until && new Date(link.locked_until) > new Date()) {
    return fail('비밀번호를 5회 잘못 입력하여 15분간 접속이 제한됩니다. 잠시 후 다시 시도해 주세요.');
  }
  const password = String(fd.get('password') ?? '').trim();
  const meta = await requestMeta();
  const db = adminDb();
  if (!password || !(await bcrypt.compare(password, link.password_hash))) {
    await db.rpc('link_login_failed', { p_link: link.id, p_ip: meta.ip, p_ua: meta.ua });
    return fail('비밀번호가 올바르지 않습니다. (5회 틀리면 15분간 잠깁니다)');
  }
  await db.rpc('link_login_ok', { p_link: link.id, p_ip: meta.ip, p_ua: meta.ua });
  await startVendorSession(token, link.id);
  redirect(`/r/${token}`);
}

export async function vendorComment(token: string, versionId: string, fd: FormData): Promise<ActionResult> {
  const st = await resolveVendor(token);
  if (st.kind !== 'ok') return fail('접속이 만료되었습니다. 새로고침 후 비밀번호를 다시 입력해 주세요.');
  const { link } = st;
  if (link.permission === 'view') return fail('코멘트 권한이 없는 링크입니다.');
  const v = await visibleVersion(link.project_id);
  if (!v || v.id !== versionId) return fail('새 버전이 올라왔습니다. 화면을 새로고침해 주세요.');
  if (v.locked) return fail('최종 승인본에는 코멘트를 남길 수 없습니다.');

  const body = String(fd.get('body') ?? '').trim();
  if (!body) return fail('내용을 입력해 주세요.');
  const page = Math.max(1, parseInt(String(fd.get('page') ?? '1'), 10) || 1);
  const x = fd.get('x') ? Number(fd.get('x')) : null;
  const y = fd.get('y') ? Number(fd.get('y')) : null;
  const meta = await requestMeta();
  const db = adminDb();
  const { error } = await db.from('comments').insert({
    version_id: v.id, page, x, y, body: body.slice(0, 4000),
    author_type: 'vendor', link_id: link.id, author_name: vendorLabel(link),
  });
  if (error) return dbError(error);
  await db.rpc('audit', {
    p_actor_type: 'vendor', p_actor_id: link.id, p_actor_label: vendorLabel(link), p_action: 'comment',
    p_project: link.project_id, p_version: v.id, p_link: link.id,
    p_detail: { version: v.version_no, page, body: body.slice(0, 500) }, p_ip: meta.ip, p_ua: meta.ua,
  });
  revalidatePath(`/r/${token}`);
  return done('코멘트를 등록했습니다.');
}

export async function vendorDecide(token: string, versionId: string, decision: 'approved' | 'changes_requested', fd: FormData): Promise<ActionResult> {
  const st = await resolveVendor(token);
  if (st.kind !== 'ok') return fail('접속이 만료되었습니다. 새로고침 후 비밀번호를 다시 입력해 주세요.');
  const signer = String(fd.get('signer_name') ?? '').trim();
  const message = String(fd.get('message') ?? '').trim();
  if (decision === 'approved' && fd.get('confirm') !== 'on') return fail('최종 확인 항목에 체크해 주세요.');
  const meta = await requestMeta();
  const { data, error } = await adminDb().rpc('record_decision', {
    p_link: st.link.id, p_version: versionId, p_decision: decision,
    p_signer: signer, p_message: message, p_ip: meta.ip, p_ua: meta.ua,
  });
  if (error) return dbError(error);
  revalidatePath(`/r/${token}`);
  if (decision === 'changes_requested') return done('수정 요청을 전달했습니다. 수정본이 올라오면 메일로 알려드립니다.');
  return done(
    data === 'approved'
      ? '승인이 완료되어 이 버전이 최종 승인본으로 확정되었습니다.'
      : '승인이 기록되었습니다. 다른 승인자의 승인이 끝나면 최종 승인본으로 확정됩니다.',
  );
}
