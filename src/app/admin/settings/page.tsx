import { adminDb } from '@/lib/supabase/admin';
import { requireAdmin } from '@/lib/auth';
import { ActionForm, Submit } from '@/components/ActionForm';
import { VENDOR_TYPE_LABEL } from '@/lib/labels';
import { createBrand, createContact, createStaffAccount, createVendor, setContactActive, setStaffActive } from '../actions';
import { StaffCreateForm } from './StaffCreateForm';

export default async function Settings() {
  const me = await requireAdmin();
  const db = adminDb();
  const [{ data: brands }, { data: vendors }, { data: contacts }, { data: staff }] = await Promise.all([
    db.from('brands').select('*').order('name'),
    db.from('vendors').select('*').order('name'),
    db.from('vendor_contacts').select('*, vendor:vendors(name)').order('created_at'),
    db.from('staff').select('*').order('created_at'),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <h1 className="h1">설정 (관리자)</h1>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">브랜드</h2>
        <div className="flex flex-wrap gap-2">{(brands ?? []).map((b) => <span key={b.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{b.name}</span>)}</div>
        <ActionForm action={createBrand} resetOnSuccess className="flex gap-2">
          <input name="name" required placeholder="새 브랜드명" className="input max-w-xs" />
          <Submit>추가</Submit>
        </ActionForm>
      </section>

      <section className="card flex flex-col gap-3">
        <h2 className="h2">업체</h2>
        <div className="flex flex-wrap gap-2">
          {(vendors ?? []).map((v) => <span key={v.id} className="rounded-full bg-slate-100 px-3 py-1 text-sm">{v.name} <span className="text-slate-500">· {VENDOR_TYPE_LABEL[v.type]}</span></span>)}
        </div>
        <ActionForm action={createVendor} resetOnSuccess className="flex flex-wrap gap-2">
          <input name="name" required placeholder="업체명" className="input max-w-xs" />
          <select name="type" className="input w-auto">{Object.entries(VENDOR_TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <input name="memo" placeholder="메모 (선택)" className="input max-w-xs" />
          <Submit>추가</Submit>
        </ActionForm>
      </section>

      <section className="card flex flex-col gap-3 overflow-x-auto">
        <h2 className="h2">업체 담당자</h2>
        <table className="tbl">
          <thead><tr><th>업체</th><th>이름</th><th>이메일</th><th>연락처</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {(contacts ?? []).map((c) => (
              <tr key={c.id} className={c.active ? '' : 'opacity-50'}>
                <td>{c.vendor?.name}</td><td>{c.name}</td><td>{c.email}</td><td>{c.phone}</td><td>{c.active ? '사용' : '중지'}</td>
                <td>
                  <ActionForm action={setContactActive.bind(null, c.id, !c.active)}>
                    <Submit className="btn btn-sm">{c.active ? '사용 중지' : '다시 사용'}</Submit>
                  </ActionForm>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <ActionForm action={createContact} resetOnSuccess className="grid gap-2 sm:grid-cols-5">
          <select name="vendor_id" required defaultValue="" className="input">
            <option value="" disabled>업체 선택</option>
            {(vendors ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <input name="name" required placeholder="이름" className="input" />
          <input name="email" type="email" required placeholder="이메일" className="input" />
          <input name="phone" placeholder="연락처 (선택)" className="input" />
          <Submit>추가</Submit>
        </ActionForm>
      </section>

      <section className="card flex flex-col gap-3 overflow-x-auto">
        <h2 className="h2">내부 계정</h2>
        <table className="tbl">
          <thead><tr><th>이름</th><th>이메일</th><th>역할</th><th>상태</th><th></th></tr></thead>
          <tbody>
            {(staff ?? []).map((s) => (
              <tr key={s.id} className={s.active ? '' : 'opacity-50'}>
                <td>{s.name}</td><td>{s.email}</td><td>{s.role === 'admin' ? '관리자' : '담당자'}</td><td>{s.active ? '사용' : '중지'}</td>
                <td>{s.id !== me.id && (
                  <ActionForm action={setStaffActive.bind(null, s.id, !s.active)}><Submit className="btn btn-sm">{s.active ? '사용 중지' : '다시 사용'}</Submit></ActionForm>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <StaffCreateForm action={createStaffAccount} />
      </section>
    </div>
  );
}
