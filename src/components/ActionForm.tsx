'use client';
import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import type { ActionResult } from '@/lib/action';

type Props = {
  action: (fd: FormData) => Promise<ActionResult>;
  children: React.ReactNode;
  className?: string;
  /** 제출 전 확인 문구 */
  confirm?: string;
  resetOnSuccess?: boolean;
  onResult?: (r: ActionResult) => void;
};

export function ActionForm({ action, children, className, confirm, resetOnSuccess, onResult }: Props) {
  const ref = useRef<HTMLFormElement>(null);
  const [state, formAction] = useActionState<ActionResult | null, FormData>((_prev, fd) => action(fd), null);

  useEffect(() => {
    if (!state) return;
    if (state.ok && resetOnSuccess) ref.current?.reset();
    onResult?.(state);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  return (
    <form
      ref={ref}
      action={formAction}
      className={className}
      onSubmit={(e) => {
        if (confirm && !window.confirm(confirm)) e.preventDefault();
      }}
    >
      {children}
      {state?.error && <p className="mt-2 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700" role="alert">{state.error}</p>}
      {state?.ok && state.message && <p className="mt-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{state.message}</p>}
    </form>
  );
}

export function Submit({ children, className = 'btn btn-primary', disabled }: { children: React.ReactNode; className?: string; disabled?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending || disabled}>
      {pending ? '처리 중…' : children}
    </button>
  );
}
