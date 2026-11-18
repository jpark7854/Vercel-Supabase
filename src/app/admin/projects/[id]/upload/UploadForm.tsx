'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserStorage } from '@/lib/supabase/browser';
import { finalizeVersion, prepareUpload } from '../../../actions';
import { PURPOSE_LABEL } from '@/lib/labels';

const MAX = 50 * 1024 * 1024;
const ext = (n: string) => n.split('.').pop()?.toLowerCase() ?? '';
/** 브라우저가 형식을 비워 보내는 경우가 있어 확장자로 지정 (저장소는 PDF·엑셀만 허용) */
const MIME: Record<string, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls: 'application/vnd.ms-excel',
};

async function isRealPdf(f: File) {
  const head = new TextDecoder().decode(await f.slice(0, 5).arrayBuffer());
  return head === '%PDF-';
}

export function UploadForm({ projectId, nameBase, nextVersion }: { projectId: string; nameBase: string; nextVersion: number }) {
  const router = useRouter();
  const [pdf, setPdf] = useState<File | null>(null);
  const [atts, setAtts] = useState<File[]>([]);
  const [purpose, setPurpose] = useState('design_review');
  const [note, setNote] = useState('');
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'info' | 'ok'; text: string } | null>(null);

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()).replace(/-/g, '');
  const fileName = `${nameBase}_v${nextVersion}_${today}.pdf`;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!pdf) return setMsg({ kind: 'err', text: '시안 PDF를 선택해 주세요.' });
    if (ext(pdf.name) !== 'pdf' || !(await isRealPdf(pdf))) return setMsg({ kind: 'err', text: '시안은 PDF 파일만 올릴 수 있습니다. AI 파일은 일러스트레이터에서 [다른 이름으로 저장 → Adobe PDF]로 저장해 주세요.' });
    for (const f of [pdf, ...atts]) if (f.size > MAX) return setMsg({ kind: 'err', text: `${f.name}: 파일당 최대 50MB입니다.` });
    for (const a of atts) if (!['pdf', 'xlsx', 'xls'].includes(ext(a.name))) return setMsg({ kind: 'err', text: `${a.name}: 작업지시서는 PDF 또는 엑셀(xlsx, xls)만 가능합니다.` });

    setBusy(true);
    try {
      setMsg({ kind: 'info', text: '업로드 준비 중…' });
      const meta = (f: File) => ({ name: f.name, size: f.size, type: MIME[ext(f.name)] });
      const prep = await prepareUpload(projectId, meta(pdf), atts.map(meta));
      if (!prep.ok || !prep.data) throw new Error(prep.error);
      const t = prep.data as { pdf: { path: string; token: string }; atts: { path: string; token: string; ext: string; name: string; type: string }[] };
      const storage = browserStorage().from('artwork');

      setMsg({ kind: 'info', text: `시안 PDF 올리는 중… (${(pdf.size / 1024 / 1024).toFixed(1)}MB)` });
      const up = await storage.uploadToSignedUrl(t.pdf.path, t.pdf.token, pdf, { contentType: 'application/pdf' });
      if (up.error) throw new Error(`PDF 업로드 실패: ${up.error.message}`);
      for (let i = 0; i < atts.length; i++) {
        setMsg({ kind: 'info', text: `작업지시서 올리는 중… (${i + 1}/${atts.length})` });
        const a = t.atts[i];
        const r = await storage.uploadToSignedUrl(a.path, a.token, atts[i], { contentType: MIME[a.ext] });
        if (r.error) throw new Error(`${atts[i].name} 업로드 실패: ${r.error.message}`);
      }

      setMsg({ kind: 'info', text: '파일 확인 및 버전 등록 중…' });
      const fin = await finalizeVersion(projectId, { pdfPath: t.pdf.path, attachments: t.atts, purpose, note, send });
      if (!fin.ok) throw new Error(fin.error);
      setMsg({ kind: 'ok', text: fin.message ?? '완료' });
      setTimeout(() => router.push(`/admin/projects/${projectId}?tab=view`), 1200);
    } catch (err) {
      setMsg({ kind: 'err', text: err instanceof Error ? err.message : String(err) });
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="card flex max-w-2xl flex-col gap-4">
      <div>
        <label className="label">시안 PDF *</label>
        <input type="file" accept="application/pdf,.pdf" required onChange={(e) => setPdf(e.target.files?.[0] ?? null)} className="input" />
        <p className="mt-1 rounded bg-slate-100 px-2 py-1 font-mono text-xs break-all">저장될 파일명: {fileName}</p>
      </div>
      <div>
        <label className="label">작업지시서 (PDF 또는 엑셀, 여러 개 가능)</label>
        <input type="file" multiple accept=".pdf,.xlsx,.xls" onChange={(e) => setAtts(Array.from(e.target.files ?? []))} className="input" />
        {atts.length > 0 && <p className="muted mt-1 text-xs">→ {fileName.replace('.pdf', '')}_작업지시서{atts.length > 1 ? '-1, -2…' : ''}.확장자 로 저장됩니다.</p>}
      </div>
      <div>
        <label className="label">발송 목적 *</label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PURPOSE_LABEL).map(([k, v]) => (
            <label key={k} className={`cursor-pointer rounded-full px-3 py-1.5 text-sm ring-1 ${purpose === k ? 'bg-slate-900 text-white ring-slate-900' : 'ring-slate-300'}`}>
              <input type="radio" name="purpose" value={k} checked={purpose === k} onChange={() => setPurpose(k)} className="sr-only" />{v}
            </label>
          ))}
        </div>
      </div>
      <div>
        <label className="label">메모 (업체에도 보입니다)</label>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} className="input" placeholder="예) v1 대비 전성분 3번째 줄 수정" />
      </div>
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={send} onChange={(e) => setSend(e.target.checked)} className="mt-0.5 h-4 w-4" />
        <span><b>지금 업체에 발송</b> — 링크가 발급된 담당자에게 메일 알림을 보내고 상태를 ‘회신 대기’로 바꿉니다. 체크하지 않으면 ‘발송 예정’으로 저장됩니다.</span>
      </label>
      {msg && (
        <p className={`rounded-md px-3 py-2 text-sm ${msg.kind === 'err' ? 'bg-rose-50 text-rose-700' : msg.kind === 'ok' ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{msg.text}</p>
      )}
      <button className="btn btn-primary self-end" disabled={busy}>{busy ? '처리 중…' : `v${nextVersion} 업로드`}</button>
    </form>
  );
}
