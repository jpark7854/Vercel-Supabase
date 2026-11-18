import { adminDb } from '@/lib/supabase/admin';
import { PURPOSE_LABEL, fmtWeek } from '@/lib/labels';
import { fmtDate } from '@/lib/format';

export const LEDGER_COLUMNS = [
  '발송일', '업체', '담당자', '브랜드', '품목·부자재', '파일명', '버전', '승인 상태',
  '생산 예정 주차', '회신일', '승인자', '발송 목적', '발송 방법', '다음 할 일', '비고',
] as const;

export type LedgerRow = {
  dispatch_id: string; project_id: string; values: Record<(typeof LEDGER_COLUMNS)[number], string>;
};

type Raw = {
  dispatch_id: string; sent_at: string; purpose: string; method: string; next_action: string | null; note: string | null;
  vendor_name: string; contact_name: string; brand_name: string; project_id: string; product_name: string; material_type: string;
  prod_year: number | null; prod_month: number | null; prod_week: number | null; project_status: string; current_version_id: string;
  version_id: string; version_no: number; file_name: string; version_locked: boolean; approved_at: string | null;
  permission: string; revoked_at: string | null; decision: string | null; signer_name: string | null; decided_at: string | null;
};

function statusOf(r: Raw): string {
  if (r.version_locked) return r.permission === 'approve' ? '승인' : '최종 승인본 공유';
  if (r.decision === 'approved') return '승인(다른 승인자 대기)';
  if (r.decision === 'changes_requested') return '수정 요청';
  if (r.project_status === 'rejected') return '반려';
  if (r.version_id !== r.current_version_id) return '새 버전으로 대체';
  if (r.revoked_at) return '링크 폐기';
  if (r.permission === 'view') return '열람 전용';
  return '회신 대기';
}

export async function fetchLedger(f: { from?: string; to?: string; q?: string }): Promise<LedgerRow[]> {
  let query = adminDb().from('ledger_rows').select('*').order('sent_at', { ascending: false }).limit(5000);
  if (f.from) query = query.gte('sent_at', `${f.from}T00:00:00+09:00`);
  if (f.to) query = query.lte('sent_at', `${f.to}T23:59:59+09:00`);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  const q = f.q?.trim().toLowerCase();
  return ((data ?? []) as Raw[])
    .map((r) => ({
      dispatch_id: r.dispatch_id,
      project_id: r.project_id,
      values: {
        발송일: fmtDate(r.sent_at),
        업체: r.vendor_name,
        담당자: r.contact_name,
        브랜드: r.brand_name,
        '품목·부자재': `${r.product_name} / ${r.material_type}`,
        파일명: r.file_name,
        버전: `v${r.version_no}`,
        '승인 상태': statusOf(r),
        '생산 예정 주차': fmtWeek(r.prod_year, r.prod_month, r.prod_week),
        회신일: fmtDate(r.decided_at),
        승인자: r.decision === 'approved' ? (r.signer_name ?? '') : '',
        '발송 목적': PURPOSE_LABEL[r.purpose] ?? r.purpose,
        '발송 방법': r.method ?? '',
        '다음 할 일': r.next_action ?? '',
        비고: r.note ?? '',
      },
    }))
    .filter((r) => !q || Object.values(r.values).some((v) => v.toLowerCase().includes(q)));
}
