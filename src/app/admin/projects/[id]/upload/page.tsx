import Link from 'next/link';
import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/supabase/admin';
import { UploadForm } from './UploadForm';

const clean = (s: string) => s.replace(/[\\/:*?"<>|\s_]+/g, '-');

export default async function UploadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminDb();
  const { data: p } = await db.from('projects').select('id, product_name, material_type, status, brand:brands(name)').eq('id', id).maybeSingle();
  if (!p) notFound();
  const { count } = await db.from('versions').select('id', { count: 'exact', head: true }).eq('project_id', id);
  const brand = (p.brand as unknown as { name: string }).name;
  const blocked = p.status === 'approved' || p.status === 'rejected';
  return (
    <div className="flex flex-col gap-4">
      <Link href={`/admin/projects/${id}`} className="text-sm underline">← 프로젝트로</Link>
      <h1 className="h1">새 버전 업로드 · {brand} {p.product_name} / {p.material_type}</h1>
      {blocked ? (
        <p className="card text-rose-700">승인 또는 반려된 프로젝트입니다. 프로젝트 화면에서 [개정 시작]을 먼저 눌러 주세요.</p>
      ) : (
        <UploadForm projectId={id} nameBase={`${clean(brand)}_${clean(p.product_name)}_${clean(p.material_type)}`} nextVersion={(count ?? 0) + 1} />
      )}
      <p className="muted max-w-2xl text-xs">이전 버전은 삭제되지 않고 보관되며, 업체에는 발송된 최신 버전만 보입니다. 파일은 비공개 저장소에 저장되고 10분짜리 임시 주소로만 열립니다.</p>
    </div>
  );
}
