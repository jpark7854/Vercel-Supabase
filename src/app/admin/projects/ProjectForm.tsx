import { ActionForm, Submit } from '@/components/ActionForm';
import { MATERIAL_TYPES } from '@/lib/labels';
import type { ActionResult } from '@/lib/action';

type P = {
  brand_id?: string; product_name?: string; material_type?: string;
  prod_year?: number | null; prod_month?: number | null; prod_week?: number | null; next_action?: string | null; note?: string | null;
};

export function ProjectForm({ action, brands, initial = {}, submitLabel }: { action: (fd: FormData) => Promise<ActionResult>; brands: { id: string; name: string }[]; initial?: P; submitLabel: string }) {
  const ym = initial.prod_year && initial.prod_month ? `${initial.prod_year}-${String(initial.prod_month).padStart(2, '0')}` : '';
  return (
    <ActionForm action={action} className="card grid max-w-2xl gap-4 sm:grid-cols-2">
      <div>
        <label className="label">브랜드 *</label>
        <select name="brand_id" required defaultValue={initial.brand_id ?? ''} className="input">
          <option value="" disabled>선택</option>
          {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </div>
      <div>
        <label className="label">부자재 *</label>
        <input name="material_type" required list="materials" defaultValue={initial.material_type ?? ''} className="input" placeholder="단상자" />
        <datalist id="materials">{MATERIAL_TYPES.map((m) => <option key={m} value={m} />)}</datalist>
      </div>
      <div className="sm:col-span-2">
        <label className="label">품목 *</label>
        <input name="product_name" required defaultValue={initial.product_name ?? ''} className="input" placeholder="예) 수분크림 50ml" />
        <p className="muted mt-1 text-xs">파일명 규칙: 브랜드_품목_부자재_v번호_YYYYMMDD.pdf (띄어쓰기는 - 로 바뀝니다)</p>
      </div>
      <div>
        <label className="label">생산 예정 월</label>
        <input name="prod_month" type="month" defaultValue={ym} className="input" />
      </div>
      <div>
        <label className="label">주차</label>
        <select name="prod_week" defaultValue={initial.prod_week ?? ''} className="input">
          <option value="">-</option>
          {[1, 2, 3, 4, 5].map((w) => <option key={w} value={w}>{w}주차</option>)}
        </select>
      </div>
      <div className="sm:col-span-2">
        <label className="label">다음 할 일</label>
        <input name="next_action" defaultValue={initial.next_action ?? ''} className="input" placeholder="예) 제조사 전성분 검수 후 라벨 발주" />
      </div>
      <div className="sm:col-span-2">
        <label className="label">비고</label>
        <textarea name="note" rows={2} defaultValue={initial.note ?? ''} className="input" />
      </div>
      <div className="sm:col-span-2 flex justify-end"><Submit>{submitLabel}</Submit></div>
    </ActionForm>
  );
}
