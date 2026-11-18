import { redirect } from 'next/navigation';
import { getStaff } from '@/lib/auth';
import { ActionForm, Submit } from '@/components/ActionForm';
import { signIn } from '@/app/admin/actions';

export const dynamic = 'force-dynamic';

export default async function LoginPage() {
  if (await getStaff()) redirect('/admin');
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm">
        <p className="muted">명성코퍼레이션</p>
        <h1 className="h1 mb-5">디자인 포털 로그인</h1>
        <ActionForm action={signIn} className="flex flex-col gap-3">
          <div>
            <label className="label" htmlFor="email">이메일</label>
            <input id="email" name="email" type="email" required autoComplete="username" className="input" />
          </div>
          <div>
            <label className="label" htmlFor="password">비밀번호</label>
            <input id="password" name="password" type="password" required autoComplete="current-password" className="input" />
          </div>
          <Submit className="btn btn-primary mt-2 py-2.5">로그인</Submit>
        </ActionForm>
        <p className="muted mt-4 text-xs">외부 업체 담당자는 메일로 받은 링크로 접속해 주세요.</p>
      </div>
    </main>
  );
}
