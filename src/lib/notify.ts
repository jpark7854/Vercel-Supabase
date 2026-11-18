import { adminDb } from '@/lib/supabase/admin';
import { appUrl } from '@/lib/env';
import { decrypt } from '@/lib/crypto';
import { mailTemplate, sendMail } from '@/lib/email';
import { PURPOSE_LABEL, fmtWeek } from '@/lib/labels';
import { fmtDateTime } from '@/lib/format';

export type MailKind = 'approval_request' | 'new_version' | 'reminder' | 'link_issued';

/**
 * 링크 담당자들에게 알림 메일을 보내고 email_logs·감사 로그에 남깁니다.
 * 메일 실패가 업무 흐름(업로드·발송)을 막지 않도록 예외를 밖으로 던지지 않습니다.
 */
export async function notifyLinks(linkIds: string[], versionId: string, kind: MailKind): Promise<{ sent: number; skipped: number; failed: number }> {
  const db = adminDb();
  const result = { sent: 0, skipped: 0, failed: 0 };
  if (!linkIds.length) return result;

  const { data: version } = await db.from('versions').select('id, version_no, file_name, purpose, sent_at, project_id').eq('id', versionId).single();
  if (!version) return result;
  const { data: project } = await db
    .from('projects')
    .select('id, product_name, material_type, prod_year, prod_month, prod_week, brand:brands(name)')
    .eq('id', version.project_id)
    .single();
  const { data: links } = await db
    .from('share_links')
    .select('id, permission, token_enc, contact:vendor_contacts(name, email, vendor:vendors(name))')
    .in('id', linkIds);

  const p = project as unknown as { id: string; product_name: string; material_type: string; prod_year: number; prod_month: number; prod_week: number; brand: { name: string } };
  const title = `${p.brand.name} ${p.product_name} ${p.material_type}`;

  for (const l of (links ?? []) as unknown as Array<{ id: string; permission: string; token_enc: string; contact: { name: string; email: string; vendor: { name: string } } }>) {
    const url = `${appUrl()}/r/${decrypt(l.token_enc)}`;
    const askApprove = l.permission === 'approve';
    const subject =
      kind === 'reminder'
        ? `[회신 요청] ${title} v${version.version_no} 검토를 부탁드립니다`
        : kind === 'new_version'
          ? `[새 버전] ${title} v${version.version_no} 이 업로드되었습니다`
          : kind === 'link_issued'
            ? `[파일 공유] ${title} v${version.version_no}`
            : `[${askApprove ? '승인 요청' : '검토 요청'}] ${title} v${version.version_no}`;
    const lines = [
      `파일: ${version.file_name}`,
      `발송 목적: ${PURPOSE_LABEL[version.purpose] ?? version.purpose}`,
      p.prod_year ? `생산 예정: ${fmtWeek(p.prod_year, p.prod_month, p.prod_week)}` : '',
      kind === 'reminder' ? `발송일(${fmtDateTime(version.sent_at)}) 이후 아직 회신이 없어 다시 안내드립니다.` : '',
      l.permission === 'view'
        ? '아래 버튼을 눌러 최종 파일을 확인해 주세요.'
        : askApprove
          ? '아래 버튼을 눌러 파일을 확인하신 뒤 [수정 요청] 또는 [승인]을 눌러 주세요.'
          : '아래 버튼을 눌러 파일을 확인하시고 의견을 남겨 주세요.',
    ].filter(Boolean);
    const html = mailTemplate({ heading: subject.replace(/^\[[^\]]+\]\s*/, ''), contactName: l.contact.name, lines, url, buttonText: '포털에서 파일 보기' });
    const r = await sendMail(l.contact.email, subject, html);
    result[r.status]++;
    await db.from('email_logs').insert({ link_id: l.id, version_id: version.id, kind, to_email: l.contact.email, status: r.status, error: r.error ?? null });
    await db.rpc('audit', {
      p_actor_type: 'system', p_actor_id: null, p_actor_label: '시스템',
      p_action: r.status === 'failed' ? 'email_failed' : 'email_sent',
      p_project: p.id, p_version: version.id, p_link: l.id,
      p_detail: { kind, to: `${l.contact.name} (${l.contact.vendor.name})`, status: r.status, error: r.error ?? null },
    });
  }
  return result;
}
