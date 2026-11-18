import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/supabase/admin';
import { getStaff } from '@/lib/auth';
import { signedDownloadUrl, signedViewUrl } from '@/lib/storage';

/** 내부: /admin/download/version/{id} (?inline=1 이면 브라우저에서 바로 열기) · /admin/download/attachment/{id} */
export async function GET(req: Request, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const staff = await getStaff();
  if (!staff) return new NextResponse('로그인이 필요합니다.', { status: 401 });
  const { kind, id } = await params;
  const db = adminDb();
  const row =
    kind === 'version'
      ? (await db.from('versions').select('pdf_path, file_name').eq('id', id).maybeSingle()).data
      : kind === 'attachment'
        ? (await db.from('attachments').select('path, file_name').eq('id', id).maybeSingle()).data
        : null;
  if (!row) return new NextResponse('파일을 찾을 수 없습니다.', { status: 404 });
  const path = 'pdf_path' in row ? row.pdf_path : row.path;
  const inline = new URL(req.url).searchParams.get('inline') === '1';
  const url = inline ? await signedViewUrl(path) : await signedDownloadUrl(path, row.file_name);
  if (!url) return new NextResponse('파일을 열 수 없습니다.', { status: 500 });
  return NextResponse.redirect(url, 303);
}
