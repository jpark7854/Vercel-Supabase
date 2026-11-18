// 테스트용 시드 데이터 (가상 브랜드 3 · 업체 4 · 프로젝트 3)
// ⚠ 테스트용 Supabase 프로젝트에서만 실행하세요. 업체 이메일은 모두 @example.com 입니다.
// 사용법: (관리자 계정을 먼저 만든 뒤) npm run seed
import { createClient } from '@supabase/supabase-js';
import { createCipheriv, createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import ExcelJS from 'exceljs';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const env = (k) => {
  if (!process.env[k]) throw new Error(`.env.local 에 ${k} 가 없습니다.`);
  return process.env[k];
};
const db = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
const APP_URL = (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
const BUCKET = 'artwork';

// ── 앱과 같은 방식의 토큰·비밀번호·암호화 ─────────────────────────
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const encKey = createHash('sha256').update(env('LINK_ENC_KEY')).digest();
const encrypt = (plain) => {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', encKey, iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
};
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const newPassword = () => Array.from({ length: 10 }, () => chars[randomInt(chars.length)]).join('');

const must = ({ data, error }, what) => {
  if (error) throw new Error(`${what}: ${error.message}`);
  return data;
};

// ── 샘플 파일 만들기 (영문만 — PDF 기본 글꼴은 한글 미지원) ───────────
async function samplePdf(title, version, note, pages = 2) {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 1; i <= pages; i++) {
    const page = doc.addPage([595, 842]);
    page.drawRectangle({ x: 60, y: 300, width: 475, height: 460, borderColor: rgb(0.2, 0.2, 0.2), borderWidth: 1.5 });
    page.drawRectangle({ x: 60, y: 690, width: 475, height: 70, color: rgb(0.93, 0.95, 0.98) });
    page.drawText('SAMPLE ARTWORK (TEST DATA)', { x: 80, y: 730, size: 11, font, color: rgb(0.4, 0.4, 0.4) });
    page.drawText(`${title}  v${version}`, { x: 80, y: 705, size: 18, font: bold });
    page.drawText(i === 1 ? 'FRONT PANEL' : 'BACK PANEL - INGREDIENTS', { x: 80, y: 650, size: 14, font: bold });
    const lines = i === 1
      ? ['Brand logo area', 'Product name area', 'Volume: 50 mL / 1.69 fl.oz', note]
      : ['Ingredients: Water, Glycerin, Butylene Glycol, Niacinamide,', 'Panthenol, Allantoin, Sodium Hyaluronate ...', 'Manufacturer: (test) / Distributor: (test)', 'Barcode area  |  Recycling mark area', note];
    lines.forEach((t, k) => page.drawText(t, { x: 80, y: 610 - k * 26, size: 12, font }));
    page.drawText(`page ${i}/${pages}`, { x: 500, y: 40, size: 9, font, color: rgb(0.5, 0.5, 0.5) });
  }
  return Buffer.from(await doc.save());
}

async function sampleWorkOrder(title, version) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('작업지시서');
  ws.addRows([
    ['작업지시서 (테스트 데이터)'], [],
    ['품목', title], ['버전', `v${version}`], ['인쇄 방식', '오프셋 4도 + 후가공(부분 UV)'], ['용지', 'SC 마닐라 350g'], ['수량', '10,000'],
  ]);
  ws.getColumn(1).width = 14;
  ws.getColumn(2).width = 40;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

async function upload(projectId, buf, ext, type) {
  const path = `projects/${projectId}/${randomUUID()}.${ext}`;
  must(await db.storage.from(BUCKET).upload(path, buf, { contentType: type }), `업로드 ${path}`);
  return { path, size: buf.length };
}

async function addVersion(staffId, p, title, purpose, note, send, withWorkOrder) {
  const { count } = await db.from('versions').select('id', { count: 'exact', head: true }).eq('project_id', p.id);
  const n = (count ?? 0) + 1;
  const pdf = await upload(p.id, await samplePdf(title, n, note), 'pdf', 'application/pdf');
  const atts = [];
  if (withWorkOrder) {
    const x = await upload(p.id, await sampleWorkOrder(title, n), 'xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    atts.push({ path: x.path, ext: 'xlsx', original_name: '작업지시서.xlsx', mime_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', size: x.size });
  }
  return must(
    await db.rpc('create_version', {
      p_project: p.id, p_staff: staffId, p_pdf_path: pdf.path, p_pdf_size: pdf.size,
      p_purpose: purpose, p_note: note, p_attachments: atts, p_send: send,
    }),
    'create_version',
  );
}

const issued = [];
async function issueLink(staffId, p, contact, permission, label) {
  const token = randomBytes(32).toString('base64url');
  const password = newPassword();
  const r = must(
    await db.rpc('issue_link', {
      p_project: p.id, p_contact: contact.id, p_permission: permission,
      p_expires: new Date(Date.now() + 90 * 86400_000).toISOString(),
      p_token_hash: sha256(token), p_token_enc: encrypt(token), p_password_hash: await bcrypt.hash(password, 10),
      p_staff: staffId, p_method: '포털 링크(메일)',
    }),
    'issue_link',
  );
  issued.push({ 프로젝트: label, 담당자: `${contact.vendorName} ${contact.name}`, 권한: permission, 링크: `${APP_URL}/r/${token}`, 비밀번호: password });
  return r.link_id;
}

// ─────────────────────────────────────────────────────────────
const staff = must(await db.from('staff').select('id, name').eq('role', 'admin').eq('active', true).limit(1), 'staff')[0];
if (!staff) throw new Error('관리자 계정이 없습니다. 먼저 npm run create-admin -- 이메일 이름 을 실행하세요.');

const existing = must(await db.from('brands').select('id').eq('name', '론지화장품'), 'brands');
if (existing.length) {
  console.log('이미 시드 데이터가 있습니다. (브랜드 "론지화장품" 존재) — 중단합니다.');
  process.exit(0);
}

console.log('브랜드·업체 등록…');
const brands = must(await db.from('brands').insert([{ name: '론지화장품' }, { name: '펄타임백' }, { name: '셀레듀' }]).select(), 'brands');
const B = Object.fromEntries(brands.map((b) => [b.name, b]));

const vendors = must(
  await db.from('vendors').insert([
    { name: '케이피티', type: 'manufacturer', memo: '테스트 데이터' },
    { name: '탭코리아', type: 'container', memo: '테스트 데이터' },
    { name: '정우피앤피', type: 'box', memo: '테스트 데이터' },
    { name: '대영스크린', type: 'label', memo: '테스트 데이터' },
  ]).select(),
  'vendors',
);
const V = Object.fromEntries(vendors.map((v) => [v.name, v]));
const contactRows = must(
  await db.from('vendor_contacts').insert([
    { vendor_id: V['케이피티'].id, name: '김하늘', email: 'kpt.qa@example.com' },
    { vendor_id: V['탭코리아'].id, name: '이도윤', email: 'tap.container@example.com' },
    { vendor_id: V['정우피앤피'].id, name: '박서연', email: 'jungwoo.box@example.com' },
    { vendor_id: V['대영스크린'].id, name: '최민재', email: 'daeyoung.label@example.com' },
  ]).select(),
  'contacts',
);
const C = Object.fromEntries(contactRows.map((c) => [vendors.find((v) => v.id === c.vendor_id).name, { ...c, vendorName: vendors.find((v) => v.id === c.vendor_id).name }]));

const newProject = async (brand, product, material, ym, week, nextAction) =>
  must(
    await db.from('projects').insert({
      brand_id: B[brand].id, product_name: product, material_type: material,
      prod_year: ym[0], prod_month: ym[1], prod_week: week, next_action: nextAction, created_by: staff.id,
    }).select().single(),
    'project',
  );

// ① 론지화장품 수분크림 단상자 → v1 수정 요청 → v2 전원 승인 = [승인]
console.log('프로젝트 1: 론지화장품 수분크림 50ml / 단상자 (승인)');
const p1 = await newProject('론지화장품', '수분크림 50ml', '단상자', [2027, 1], 1, '최종 승인본으로 단상자 인쇄 발주');
const l1k = await issueLink(staff.id, p1, C['케이피티'], 'approve', '론지 수분크림 단상자');
const l1j = await issueLink(staff.id, p1, C['정우피앤피'], 'approve', '론지 수분크림 단상자');
const v1 = await addVersion(staff.id, p1, 'LONGI Moisture Cream 50mL BOX', 'design_review', '1st draft', true, true);
must(await db.from('comments').insert({ version_id: v1.version_id, page: 2, x: 30, y: 30, body: '전성분 순서가 처방서와 다릅니다. (글리세린 ↔ 부틸렌글라이콜)', author_type: 'vendor', link_id: l1k, author_name: '김하늘 (케이피티)' }), 'comment');
must(await db.rpc('record_decision', { p_link: l1k, p_version: v1.version_id, p_decision: 'changes_requested', p_signer: '김하늘', p_message: '전성분 순서 수정 부탁드립니다.', p_ip: null, p_ua: 'seed' }), 'decision');
const v2 = await addVersion(staff.id, p1, 'LONGI Moisture Cream 50mL BOX', 'design_review', 'Ingredients order fixed', true, true);
must(await db.rpc('record_decision', { p_link: l1k, p_version: v2.version_id, p_decision: 'approved', p_signer: '김하늘', p_message: null, p_ip: null, p_ua: 'seed' }), 'decision');
must(await db.rpc('record_decision', { p_link: l1j, p_version: v2.version_id, p_decision: 'approved', p_signer: '박서연', p_message: '인쇄 사양 확인했습니다.', p_ip: null, p_ua: 'seed' }), 'decision');

// ② 셀레듀 토너 용기 → v1 발송 4일 경과, 회신 없음 = [회신 대기] (리마인더 대상)
console.log('프로젝트 2: 셀레듀 토너 200ml / 용기 (회신 대기, 4일 경과)');
const p2 = await newProject('셀레듀', '토너 200ml', '용기', [2027, 1], 2, '제조사·용기업체 회신 대기');
await issueLink(staff.id, p2, C['케이피티'], 'approve', '셀레듀 토너 용기');
await issueLink(staff.id, p2, C['탭코리아'], 'comment', '셀레듀 토너 용기');
const v3 = await addVersion(staff.id, p2, 'CELEDU Toner 200mL BOTTLE', 'work_order', 'Silk screen 2 colors', true, true);
const fourDaysAgo = new Date(Date.now() - 4 * 86400_000).toISOString();
must(await db.from('versions').update({ sent_at: fourDaysAgo }).eq('id', v3.version_id), 'backdate');
must(await db.from('dispatches').update({ sent_at: fourDaysAgo }).eq('version_id', v3.version_id), 'backdate');

// ③ 펄타임백 바디로션 라벨 → 라벨업체 코멘트 + 제조사 수정 요청 = [수정 요청]
console.log('프로젝트 3: 펄타임백 바디로션 300ml / 라벨 (수정 요청)');
const p3 = await newProject('펄타임백', '바디로션 300ml', '라벨', [2027, 2], 1, '바코드 위치 수정 후 v2 발송');
const l3k = await issueLink(staff.id, p3, C['케이피티'], 'approve', '펄타임백 바디로션 라벨');
const l3d = await issueLink(staff.id, p3, C['대영스크린'], 'comment', '펄타임백 바디로션 라벨');
const v4 = await addVersion(staff.id, p3, 'PEARLTIME Body Lotion 300mL LABEL', 'design_review', 'Label 1st draft', true, false);
must(await db.from('comments').insert({ version_id: v4.version_id, page: 2, x: 40, y: 37, body: '바코드가 재단선에 너무 가깝습니다. 안쪽으로 3mm 이동 필요.', author_type: 'vendor', link_id: l3d, author_name: '최민재 (대영스크린)' }), 'comment');
must(await db.rpc('record_decision', { p_link: l3k, p_version: v4.version_id, p_decision: 'changes_requested', p_signer: '김하늘', p_message: '라벨업체 의견대로 바코드 위치 수정 부탁드립니다.', p_ip: null, p_ua: 'seed' }), 'decision');

console.log('\n✅ 시드 완료. 아래 링크·비밀번호로 업체 화면을 시험해 보세요. (테스트 전용 — 다시 볼 수 없으니 필요하면 복사해 두세요)\n');
console.table(issued);
