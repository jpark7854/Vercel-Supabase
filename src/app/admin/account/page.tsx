import { requireStaff } from '@/lib/auth';
import { ActionForm, Submit } from '@/components/ActionForm';
import { changeMyPassword } from '../actions';

export default async function Account() {
  const s = await requireStaff();
  return (
    <div className="flex max-w-md flex-col gap-4">
      <h1 className="h1">내 계정</h1>
      <p className="text-sm">{s.name} · {s.email} · {s.role === 'admin' ? '관리자' : '담당자'}</p>
      <ActionForm action={changeMyPassword} resetOnSuccess className="card flex flex-col gap-3">
        <h2 className="h2">비밀번호 변경</h2>
        <input type="password" name="password" required minLength={10} autoComplete="new-password" placeholder="새 비밀번호 (10자 이상)" className="input" />
        <input type="password" name="password2" required minLength={10} autoComplete="new-password" placeholder="새 비밀번호 확인" className="input" />
        <Submit>변경</Submit>
      </ActionForm>
    </div>
  );
}
