'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import PdfViewer from '@/components/PdfViewer';
import { ActionForm, Submit } from '@/components/ActionForm';
import type { ActionResult } from '@/lib/action';

export type CommentView = {
  id: string; page: number; x: number | null; y: number | null; body: string;
  author_name: string; author_type: 'staff' | 'vendor'; created_at: string; created_label: string;
};

type Props = {
  url: string;
  fileKey: string;
  comments: CommentView[];
  canComment: boolean;
  addComment?: (fd: FormData) => Promise<ActionResult>;
  disabledReason?: string;
};

/** PDF 보기 + 파일 위 코멘트(핀) — 내부·업체 화면 공용 */
export default function ReviewWorkspace({ url, fileKey, comments, canComment, addComment, disabledReason }: Props) {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [pinMode, setPinMode] = useState(false);
  const [draft, setDraft] = useState<{ page: number; x: number; y: number } | null>(null);
  const [active, setActive] = useState<string | null>(null);

  const numbered = useMemo(() => comments.map((c, i) => ({ ...c, n: i + 1 })), [comments]);
  const pins = numbered.filter((c) => c.x != null && c.y != null).map((c) => ({ id: c.id, n: c.n, page: c.page, x: Number(c.x), y: Number(c.y) }));

  const focus = (id: string) => {
    const c = numbered.find((x) => x.id === id);
    if (!c) return;
    setActive(id);
    setPage(c.page);
    document.getElementById(`c-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 scroll-mt-16" id="pdf-area">
        {pinMode && (
          <p className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900">
            코멘트를 남길 위치를 파일 위에서 눌러 주세요.
          </p>
        )}
        <PdfViewer
          url={url}
          fileKey={fileKey}
          pins={pins}
          activePinId={active}
          pinMode={pinMode}
          draftPin={draft}
          page={page}
          onPageChange={setPage}
          onPinClick={focus}
          onPick={(p, x, y) => {
            setDraft({ page: p, x, y });
            setPinMode(false);
            setTimeout(() => document.getElementById('comment-body')?.focus(), 50);
          }}
        />
      </div>

      <aside className="flex min-w-0 flex-col gap-3">
        {canComment && addComment ? (
          <div className="card">
            <h3 className="h2 mb-2">코멘트 남기기</h3>
            <ActionForm
              action={addComment}
              resetOnSuccess
              onResult={(r) => {
                if (r.ok) {
                  setDraft(null);
                  router.refresh();
                }
              }}
            >
              <input type="hidden" name="page" value={draft?.page ?? page} />
              <input type="hidden" name="x" value={draft?.x ?? ''} />
              <input type="hidden" name="y" value={draft?.y ?? ''} />
              <div className="mb-2 flex flex-wrap items-center gap-2 text-sm">
                {draft ? (
                  <>
                    <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-900">{draft.page}쪽에 위치 지정됨</span>
                    <button type="button" className="btn btn-sm" onClick={() => setDraft(null)}>위치 지우기</button>
                  </>
                ) : (
                  <button type="button" className={`btn btn-sm ${pinMode ? 'btn-primary' : ''}`} onClick={() => {
                    const next = !pinMode;
                    setPinMode(next);
                    if (next) document.getElementById('pdf-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }}>
                    📍 {pinMode ? '위치 지정 취소' : '파일 위에 위치 찍기'}
                  </button>
                )}
                {!draft && <span className="muted">(선택 안 하면 {page}쪽 전체에 대한 코멘트)</span>}
              </div>
              <textarea id="comment-body" name="body" required maxLength={4000} rows={3} className="input" placeholder="예) 전성분 3번째 줄 오타 — '정제수'" />
              <div className="mt-2 flex justify-end">
                <Submit>코멘트 등록</Submit>
              </div>
            </ActionForm>
          </div>
        ) : disabledReason ? (
          <p className="rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-600">{disabledReason}</p>
        ) : null}

        <div className="card">
          <h3 className="h2 mb-2">코멘트 {numbered.length}건</h3>
          {numbered.length === 0 && <p className="muted">아직 코멘트가 없습니다.</p>}
          <ol className="flex max-h-[60vh] flex-col gap-2 overflow-auto">
            {numbered.map((c) => (
              <li
                key={c.id}
                id={`c-${c.id}`}
                onClick={() => focus(c.id)}
                className={`cursor-pointer rounded-lg border p-2.5 text-sm ${active === c.id ? 'border-rose-400 bg-rose-50' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                <div className="mb-1 flex items-center gap-2 text-xs text-slate-500">
                  <span className={`rounded-full px-1.5 font-bold text-white ${c.x != null ? 'bg-indigo-600' : 'bg-slate-400'}`}>{c.n}</span>
                  <span className="font-semibold text-slate-700">{c.author_name}</span>
                  {c.author_type === 'staff' && <span className="rounded bg-slate-100 px-1">명성</span>}
                  <span className="ml-auto">{c.page}쪽 · {c.created_label}</span>
                </div>
                <p className="whitespace-pre-wrap break-words">{c.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}
