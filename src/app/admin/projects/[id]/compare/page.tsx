import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/supabase/admin';
import { signedViewUrl } from '@/lib/storage';
import { fmtDateTime } from '@/lib/format';
import { CompareView } from './CompareView';

export default async function Compare({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ a?: string; b?: string }> }) {
  const { id } = await params;
  const { a, b } = await searchParams;
  if (!a || !b) notFound();
  const { data } = await adminDb().from('versions').select('id, version_no, file_name, pdf_path, uploaded_at, locked').eq('project_id', id).in('id', [a, b]);
  const va = data?.find((v) => v.id === a);
  const vb = data?.find((v) => v.id === b);
  if (!va || !vb) notFound();
  const side = async (v: NonNullable<typeof va>) => ({
    id: v.id, url: (await signedViewUrl(v.pdf_path)) ?? '',
    label: `v${v.version_no}${v.locked ? ' 🔒승인본' : ''} · ${fmtDateTime(v.uploaded_at)}`,
  });
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/admin/projects/${id}?tab=versions`} className="text-sm underline">← 버전 이력</Link>
      <h1 className="h1">버전 비교 v{va.version_no} ↔ v{vb.version_no}</h1>
      <p className="muted">두 버전을 나란히 놓고 같은 페이지를 확인합니다. (차이 자동 표시는 2차 개발 예정)</p>
      <CompareView a={await side(va)} b={await side(vb)} />
    </div>
  );
}
