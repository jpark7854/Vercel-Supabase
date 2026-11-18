'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist/legacy/build/pdf.mjs';

export type Pin = { id: string; n: number; page: number; x: number; y: number };

type Props = {
  url: string;
  /** 파일이 바뀔 때만 다시 불러오기 위한 키 (서명 URL은 매번 바뀌므로) */
  fileKey: string;
  pins?: Pin[];
  activePinId?: string | null;
  pinMode?: boolean;
  onPick?: (page: number, x: number, y: number) => void;
  onPinClick?: (id: string) => void;
  page?: number;
  onPageChange?: (p: number) => void;
  onLoaded?: (numPages: number) => void;
  draftPin?: { page: number; x: number; y: number } | null;
};

export default function PdfViewer(props: Props) {
  const { url, fileKey, pins = [], activePinId, pinMode, onPick, onPinClick, onLoaded, draftPin } = props;
  const [doc, setDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [numPages, setNumPages] = useState(0);
  const [innerPage, setInnerPage] = useState(1);
  const page = props.page ?? innerPage;
  const setPage = useCallback(
    (p: number) => {
      setInnerPage(p);
      props.onPageChange?.(p);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [props.onPageChange],
  );
  const [zoom, setZoom] = useState(1);
  const [width, setWidth] = useState(0);
  const [rendering, setRendering] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const taskRef = useRef<RenderTask | null>(null);
  const urlRef = useRef(url);
  urlRef.current = url;

  // 파일 불러오기
  useEffect(() => {
    let cancelled = false;
    let loaded: PDFDocumentProxy | null = null;
    setDoc(null);
    setError(null);
    (async () => {
      try {
        const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
        pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
        loaded = await pdfjs.getDocument({ url: urlRef.current }).promise;
        if (cancelled) return void loaded.destroy();
        setDoc(loaded);
        setNumPages(loaded.numPages);
        onLoaded?.(loaded.numPages);
      } catch (e) {
        if (!cancelled) setError('PDF를 불러오지 못했습니다. 새로고침해 주세요. (링크 유효시간 10분)');
        console.error(e);
      }
    })();
    return () => {
      cancelled = true;
      loaded?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fileKey]);

  // 화면 너비 감지
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.floor(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 페이지 그리기
  useEffect(() => {
    if (!doc || !width || !canvasRef.current) return;
    let cancelled = false;
    (async () => {
      const p = await doc.getPage(Math.min(Math.max(page, 1), doc.numPages));
      if (cancelled) return;
      const base = p.getViewport({ scale: 1 });
      const cssScale = (width / base.width) * zoom;
      const dpr = Math.min(window.devicePixelRatio || 1, 3);
      const vp = p.getViewport({ scale: cssScale * dpr });
      const canvas = canvasRef.current!;
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${Math.floor(vp.width / dpr)}px`;
      canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
      taskRef.current?.cancel();
      setRendering(true);
      const task = p.render({ canvasContext: canvas.getContext('2d')!, viewport: vp });
      taskRef.current = task;
      try {
        await task.promise;
      } catch {
        /* 취소됨 */
      }
      if (!cancelled) setRendering(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [doc, page, width, zoom]);

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!pinMode || !onPick) return;
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    onPick(page, Math.round(x * 10) / 10, Math.round(y * 10) / 10);
  };

  const pagePins = pins.filter((p) => p.page === page);

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button className="btn btn-sm" onClick={() => setPage(Math.max(1, page - 1))} disabled={page <= 1} aria-label="이전 페이지">◀</button>
        <span className="tabular-nums">{numPages ? `${page} / ${numPages}쪽` : '불러오는 중…'}</span>
        <button className="btn btn-sm" onClick={() => setPage(Math.min(numPages, page + 1))} disabled={page >= numPages} aria-label="다음 페이지">▶</button>
        <span className="mx-1 h-4 w-px bg-slate-300" />
        <button className="btn btn-sm" onClick={() => setZoom((z) => Math.max(1, +(z - 0.5).toFixed(1)))} disabled={zoom <= 1} aria-label="축소">－</button>
        <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
        <button className="btn btn-sm" onClick={() => setZoom((z) => Math.min(4, +(z + 0.5).toFixed(1)))} disabled={zoom >= 4} aria-label="확대">＋</button>
        {rendering && <span className="muted">그리는 중…</span>}
        <a className="btn btn-sm ml-auto" href={url} target="_blank" rel="noreferrer">새 창에서 열기</a>
      </div>
      <div ref={boxRef} className="w-full overflow-auto rounded-lg border border-slate-200 bg-slate-200/60">
        {error ? (
          <p className="p-6 text-sm text-rose-700">{error}</p>
        ) : (
          <div
            className={`relative mx-auto w-fit ${pinMode ? 'cursor-crosshair' : ''}`}
            onClick={handleClick}
          >
            <canvas ref={canvasRef} className="block bg-white" />
            {pagePins.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPinClick?.(p.id);
                }}
                style={{ left: `${p.x}%`, top: `${p.y}%` }}
                className={`absolute -translate-y-full rounded-full rounded-bl-none px-2 py-0.5 text-xs font-bold text-white shadow ring-2 ring-white ${activePinId === p.id ? 'bg-rose-600 scale-125' : 'bg-indigo-600'}`}
                aria-label={`코멘트 ${p.n}`}
              >
                {p.n}
              </button>
            ))}
            {draftPin && draftPin.page === page && (
              <span
                style={{ left: `${draftPin.x}%`, top: `${draftPin.y}%` }}
                className="pointer-events-none absolute -translate-y-full animate-pulse rounded-full rounded-bl-none bg-amber-500 px-2 py-0.5 text-xs font-bold text-white ring-2 ring-white"
              >
                새
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
