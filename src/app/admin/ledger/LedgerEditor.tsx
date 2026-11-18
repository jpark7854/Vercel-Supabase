'use client';
import { ActionForm, Submit } from '@/components/ActionForm';
import type { ActionResult } from '@/lib/action';

/** 대장의 발송 방법·다음 할 일·비고 수정 (행 단위) */
export function LedgerEditor({ action, method, nextAction, note }: { action: (fd: FormData) => Promise<ActionResult>; method: string; nextAction: string; note: string }) {
  return (
    <ActionForm action={action} className="flex min-w-72 flex-col gap-1">
      <input name="method" defaultValue={method} className="input py-1 text-xs" placeholder="발송 방법" aria-label="발송 방법" />
      <input name="next_action" defaultValue={nextAction} className="input py-1 text-xs" placeholder="다음 할 일" aria-label="다음 할 일" />
      <input name="note" defaultValue={note} className="input py-1 text-xs" placeholder="비고" aria-label="비고" />
      <Submit className="btn btn-sm self-end">저장</Submit>
    </ActionForm>
  );
}
