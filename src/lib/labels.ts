export type ProjectStatus = 'draft' | 'pending' | 'changes_requested' | 'approved' | 'rejected';
export type Permission = 'view' | 'comment' | 'approve';

export const STATUS_LABEL: Record<ProjectStatus, string> = {
  draft: '발송 예정',
  pending: '회신 대기',
  changes_requested: '수정 요청',
  approved: '승인',
  rejected: '반려',
};

export const STATUS_STYLE: Record<ProjectStatus, string> = {
  draft: 'bg-slate-100 text-slate-700 ring-slate-300',
  pending: 'bg-amber-50 text-amber-800 ring-amber-300',
  changes_requested: 'bg-rose-50 text-rose-700 ring-rose-300',
  approved: 'bg-emerald-50 text-emerald-800 ring-emerald-300',
  rejected: 'bg-zinc-200 text-zinc-700 ring-zinc-400',
};

export const STATUS_ORDER: ProjectStatus[] = ['draft', 'pending', 'changes_requested', 'approved', 'rejected'];

export const PURPOSE_LABEL: Record<string, string> = {
  design_review: '시안 검토',
  work_order: '작업지시서',
  final_approved: '최종 승인본',
  purchase_order: '발주서',
  data_request: '자료 요청',
};

export const PERMISSION_LABEL: Record<Permission, string> = {
  view: '보기',
  comment: '코멘트',
  approve: '승인',
};

export const PERMISSION_HELP: Record<Permission, string> = {
  view: '최신본 보기·작업지시서 다운로드만 가능',
  comment: '보기 + 코멘트 + 수정 요청',
  approve: '보기 + 코멘트 + 수정 요청 + 승인',
};

export const VENDOR_TYPE_LABEL: Record<string, string> = {
  brand: '브랜드사',
  manufacturer: '제조사',
  container: '용기',
  tube: '튜브',
  box: '단상자',
  label: '라벨',
  other: '기타',
};

export const MATERIAL_TYPES = ['용기', '단상자', '라벨', '튜브', '캡', '펌프', '파우치', '기타'];

export const DECISION_LABEL: Record<string, string> = {
  changes_requested: '수정 요청',
  approved: '승인',
};

export const ACTION_LABEL: Record<string, string> = {
  project_create: '프로젝트 등록',
  project_update: '프로젝트 수정',
  upload: '업로드',
  send: '업체 발송',
  view: '열람',
  download: '다운로드',
  comment: '코멘트',
  changes_requested: '수정 요청',
  approved: '승인',
  final_approved: '최종 승인 확정',
  print_release: '인쇄·발주 진행',
  revision_start: '개정 시작',
  reject: '반려',
  link_issue: '링크 발급',
  link_revoke: '링크 폐기',
  login: '업체 접속',
  login_fail: '비밀번호 오류',
  email_sent: '메일 발송',
  email_failed: '메일 실패',
  staff_create: '내부 계정 생성',
  staff_activate: '내부 계정 사용',
  staff_deactivate: '내부 계정 중지',
};

export function fmtWeek(y?: number | null, m?: number | null, w?: number | null): string {
  if (!y || !m) return '';
  return `${y}-${String(m).padStart(2, '0')}${w ? ` ${w}주차` : ''}`;
}
