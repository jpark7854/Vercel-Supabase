'use client';
import { useState } from 'react';
import PdfViewer from '@/components/PdfViewer';

type Side = { id: string; label: string; url: string };

export function CompareView({ a, b }: { a: Side; b: Side }) {
  const [page, setPage] = useState(1);
  const [sync, setSync] = useState(true);
  const [pageB, setPageB] = useState(1);
  return (
    <div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={sync} onChange={(e) => setSync(e.target.checked)} /> 페이지 함께 넘기기
      </label>
      <div className="grid gap-4 md:grid-cols-2">
        <div><p className="mb-1 text-sm font-semibold">{a.label}</p><PdfViewer url={a.url} fileKey={a.id} page={page} onPageChange={setPage} /></div>
        <div><p className="mb-1 text-sm font-semibold">{b.label}</p><PdfViewer url={b.url} fileKey={b.id} page={sync ? page : pageB} onPageChange={sync ? setPage : setPageB} /></div>
      </div>
    </div>
  );
}
