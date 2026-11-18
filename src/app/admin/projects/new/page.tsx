import { adminDb } from '@/lib/supabase/admin';
import { ProjectForm } from '../ProjectForm';
import { createProject } from '../../actions';

export default async function NewProject() {
  const { data: brands } = await adminDb().from('brands').select('id, name').order('name');
  return (
    <div className="flex flex-col gap-4">
      <h1 className="h1">새 프로젝트</h1>
      {!brands?.length && <p className="text-sm text-rose-700">먼저 [설정]에서 브랜드를 등록해 주세요.</p>}
      <ProjectForm action={createProject} brands={brands ?? []} submitLabel="프로젝트 만들기" />
    </div>
  );
}
