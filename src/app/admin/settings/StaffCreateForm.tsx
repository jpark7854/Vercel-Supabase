'use client';
import { useState } from 'react';
import { ActionForm, Submit } from '@/components/ActionForm';
import type { ActionResult } from '@/lib/action';

export function StaffCreateForm({ action }: { action: (fd: FormData) => Promise<ActionResult> }) {
  const [pw, setPw] = useState<string | null>(null);
  return (
    <div>
      <ActionForm action={action} resetOnSuccess className="grid gap-2 sm:grid-cols-4" onResult={(r) => setPw(r.ok ? String(r.data?.password ?? '') : null)}>
        <input name="name" required placeholder="이름" className="input" />
        <input name="email" type="email" required placeholder="회사 이메일" className="input" />
        <select name="role" className="input"><option value="staff">담당자</option><option value="admin">관리자</option></select>
        <Submit>계정 만들기</Submit>
      </ActionForm>
      {pw && (
        <p className="mt-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-3 text-sm">
          임시 비밀번호: <b className="font-mono text-base tracking-wider">{pw}</b> — 지금 한 번만 표시됩니다. 본인에게 직접 전달하고, 첫 로그인 후 [내 계정]에서 바꾸도록 안내하세요.
        </p>
      )}
    </div>
  );
}
