import { adminDb } from '@/lib/supabase/admin';
import { BUCKET } from '@/lib/env';

const TTL = 600; // 서명 URL 유효시간 10분

/** 브라우저에서 PDF를 바로 보기 위한 임시 URL */
export async function signedViewUrl(path: string): Promise<string | null> {
  const { data } = await adminDb().storage.from(BUCKET).createSignedUrl(path, TTL);
  return data?.signedUrl ?? null;
}

/** 지정한 파일명으로 내려받는 임시 URL */
export async function signedDownloadUrl(path: string, fileName: string): Promise<string | null> {
  const { data } = await adminDb().storage.from(BUCKET).createSignedUrl(path, TTL, { download: fileName });
  return data?.signedUrl ?? null;
}

/** 업로드된 파일의 앞부분 몇 바이트만 읽어 실제 형식을 확인 */
export async function readHead(path: string, bytes = 8): Promise<{ head: Uint8Array; size: number } | null> {
  const url = await signedViewUrl(path);
  if (!url) return null;
  const res = await fetch(url, { headers: { Range: `bytes=0-${bytes - 1}` } });
  if (!res.ok) return null;
  const buf = new Uint8Array(await res.arrayBuffer()).slice(0, bytes);
  const range = res.headers.get('content-range');
  const size = range ? Number(range.split('/')[1]) : Number(res.headers.get('content-length') || buf.length);
  return { head: buf, size };
}

export function looksLike(head: Uint8Array, ext: string): boolean {
  const hex = Array.from(head.slice(0, 4)).map((b) => b.toString(16).padStart(2, '0')).join('');
  if (ext === 'pdf') return new TextDecoder().decode(head.slice(0, 5)) === '%PDF-';
  if (ext === 'xlsx') return hex === '504b0304'; // ZIP
  if (ext === 'xls') return hex === 'd0cf11e0'; // OLE
  return false;
}

export async function removeObjects(paths: string[]) {
  if (paths.length) await adminDb().storage.from(BUCKET).remove(paths);
}
