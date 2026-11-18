'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ActionForm, Submit } from '@/components/ActionForm';
import type { ActionResult } from '@/lib/action';

export function LoginForm({ action }: { action: (fd: FormData) => Promise<ActionResult> }) {
  return (
    <ActionForm action={action} className="flex flex-col gap-3">
      <label className="label" htmlFor="pw">접속 비밀번호</label>
      <input id="pw" name="password" type="password" autoComplete="off" required className="input text-base" placeholder="전달받은 비밀번호 10자리" />
      <Submit className="btn btn-primary py-3 text-base">확인</Submit>
    </ActionForm>
  );
}

type DecideProps = {
  canApprove: boolean;
  requestChanges: (fd: FormData) => Promise<ActionResult>;
  approve?: (fd: FormData) => Promise<ActionResult>;
  fileName: string;
};

/** 하단 고정 [수정 요청] [승인] 버튼 */
export function DecisionBar({ canApprove, requestChanges, approve, fileName }: DecideProps) {
  const router = useRouter();
  const [open, setOpen] = useState<'changes' | 'approve' | null>(null);
  const after = (r: ActionResult) => {
    if (r.ok) setTimeout(() => { setOpen(null); router.refresh(); }, 1200);
  };

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 p-3 backdrop-blur" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
        <div className="mx-auto flex max-w-3xl gap-2">
          <button className="btn btn-danger flex-1 py-3 text-base" onClick={() => setOpen('changes')}>수정 요청</button>
          {canApprove && <button className="btn btn-approve flex-1 py-3 text-base" onClick={() => setOpen('approve')}>승인</button>}
        </div>
      </div>

      {open && (
        <div className="fixed inset-0 z-30 flex items-end justify-center bg-black/40 sm:items-center" onClick={() => setOpen(null)}>
          <div className="w-full max-w-lg rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            {open === 'changes' ? (
              <ActionForm action={requestChanges} onResult={after} className="flex flex-col gap-3">
                <h2 className="text-lg font-bold">수정 요청</h2>
                <p className="muted">수정할 내용을 적어 주세요. 위치가 있는 내용은 화면의 [파일 위에 위치 찍기]로 코멘트를 먼저 남기시면 더 정확합니다.</p>
                <textarea name="message" required rows={4} className="input text-base" placeholder="예) 2쪽 용량 표기 50ml → 50mL 로 수정 바랍니다." />
                <label className="label" htmlFor="sn1">요청자 이름</label>
                <input id="sn1" name="signer_name" required className="input text-base" placeholder="이름" autoComplete="name" />
                <div className="flex gap-2">
                  <button type="button" className="btn flex-1" onClick={() => setOpen(null)}>취소</button>
                  <Submit className="btn btn-danger flex-1">수정 요청 보내기</Submit>
                </div>
              </ActionForm>
            ) : (
              approve && (
                <ActionForm action={approve} onResult={after} className="flex flex-col gap-3">
                  <h2 className="text-lg font-bold">최종 승인</h2>
                  <p className="rounded-lg bg-slate-100 p-3 text-sm break-all">{fileName}</p>
                  <p className="muted">승인하면 승인자 이름과 승인 일시가 기록되고, 모든 승인자가 승인하면 이 버전은 <b>최종 승인본으로 잠겨 더 이상 수정할 수 없습니다.</b></p>
                  <label className="label" htmlFor="sn2">승인자 이름 (직접 입력)</label>
                  <input id="sn2" name="signer_name" required className="input text-base" placeholder="이름" autoComplete="name" />
                  <textarea name="message" rows={2} className="input text-base" placeholder="전달할 말 (선택)" />
                  <label className="flex items-start gap-2 text-sm">
                    <input type="checkbox" name="confirm" required className="mt-0.5 h-5 w-5" />
                    <span>최종 시안을 모두 확인했으며, 이 버전으로 인쇄·생산을 진행하는 데 동의합니다.</span>
                  </label>
                  <div className="flex gap-2">
                    <button type="button" className="btn flex-1" onClick={() => setOpen(null)}>취소</button>
                    <Submit className="btn btn-approve flex-1">승인합니다</Submit>
                  </div>
                </ActionForm>
              )
            )}
          </div>
        </div>
      )}
    </>
  );
}
