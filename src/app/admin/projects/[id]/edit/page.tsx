import { notFound } from 'next/navigation';
import { adminDb } from '@/lib/supabase/admin';
import { ProjectForm } from '../../ProjectForm';
import { updateProject } from '../../../actions';

export default async function EditProject({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = adminDb();
  const [{ data: p }, { data: brands }] = await Promise.all([
    db.from('projects').select('*').eq('id', id).maybeSingle(),
    db.from('brands').select('id, name').order('name'),
  ]);
  if (!p) notFound();
  return (
    <div className="flex flex-col gap-4">
      <h1 className="h1">프로젝트 정보 수정</h1>
      <p className="muted">이미 올린 버전의 파일명은 바뀌지 않습니다. 다음 버전부터 새 이름이 적용됩니다.</p>
      <ProjectForm action={updateProject.bind(null, id)} brands={brands ?? []} initial={p} submitLabel="저장" />
    </div>
  );
}
