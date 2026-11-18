import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/supabase/admin';
import { resolveVendor, vendorLabel, visibleVersion } from '@/lib/vendor';
import { signedDownloadUrl } from '@/lib/storage';
import { requestMeta } from '@/lib/request-meta';

/** 업체: 최신본 PDF(id=pdf) 또는 작업지시서(id=첨부 id) 내려받기 */
export async function GET(_req: Request, { params }: { params: Promise<{ token: string; id: string }> }) {
  const { token, id } = await params;
  const st = await resolveVendor(token);
  if (st.kind !== 'ok') return new NextResponse('접속이 만료되었습니다. 링크로 다시 접속해 주세요.', { status: 401 });
  const v = await visibleVersion(st.link.project_id);
  if (!v) return new NextResponse('공유된 파일이 없습니다.', { status: 404 });

  const db = adminDb();
  let path = v.pdf_path;
  let name = v.file_name;
  if (id !== 'pdf') {
    const { data: a } = await db.from('attachments').select('path, file_name').eq('id', id).eq('version_id', v.id).maybeSingle();
    if (!a) return new NextResponse('파일을 찾을 수 없습니다.', { status: 404 });
    path = a.path;
    name = a.file_name;
  }
  const url = await signedDownloadUrl(path, name);
  if (!url) return new NextResponse('파일을 열 수 없습니다.', { status: 500 });
  const meta = await requestMeta();
  await db.rpc('audit', {
    p_actor_type: 'vendor', p_actor_id: st.link.id, p_actor_label: vendorLabel(st.link), p_action: 'download',
    p_project: st.link.project_id, p_version: v.id, p_link: st.link.id, p_detail: { file_name: name }, p_ip: meta.ip, p_ua: meta.ua,
  });
  return NextResponse.redirect(url, 303);
}
