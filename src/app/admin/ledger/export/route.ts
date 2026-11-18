import ExcelJS from 'exceljs';
import { getStaff } from '@/lib/auth';
import { fetchLedger, LEDGER_COLUMNS } from '@/lib/ledger';
import { fmtDate } from '@/lib/format';

export async function GET(req: Request) {
  if (!(await getStaff())) return new Response('로그인이 필요합니다.', { status: 401 });
  const sp = new URL(req.url).searchParams;
  const rows = await fetchLedger({ from: sp.get('from') ?? undefined, to: sp.get('to') ?? undefined, q: sp.get('q') ?? undefined });
  const stamp = fmtDate(new Date().toISOString()).replace(/-/g, '');
  const base = `발송승인대장_${stamp}`;

  if (sp.get('format') === 'csv') {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const csv = [LEDGER_COLUMNS.join(','), ...rows.map((r) => LEDGER_COLUMNS.map((c) => esc(r.values[c])).join(','))].join('\r\n');
    return new Response('﻿' + csv, { // BOM: 엑셀에서 한글 깨짐 방지
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(base)}.csv` },
    });
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('발송·승인 대장', { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = LEDGER_COLUMNS.map((c) => ({ header: c, key: c, width: c === '파일명' ? 48 : c === '품목·부자재' ? 26 : ['다음 할 일', '비고'].includes(c) ? 30 : 14 }));
  rows.forEach((r) => ws.addRow(r.values));
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2E8F0' } };
  ws.autoFilter = { from: 'A1', to: { row: 1, column: LEDGER_COLUMNS.length } };
  const buf = await wb.xlsx.writeBuffer();
  return new Response(buf as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(base)}.xlsx`,
    },
  });
}
