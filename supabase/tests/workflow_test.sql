-- 업무 규칙 시나리오 테스트 (로컬 PostgreSQL 전용)
-- 실행: npm run test:db   (README 참고)
\set ON_ERROR_STOP 1
set client_min_messages = warning;

insert into auth.users (id, email) values ('00000000-0000-0000-0000-000000000001', 'admin@example.com');
insert into staff (id, name, email, role) values ('00000000-0000-0000-0000-000000000001', '테스트관리자', 'admin@example.com', 'admin');

set role service_role;

create temp table t (k text primary key, id uuid);

do $$
declare
  st uuid := '00000000-0000-0000-0000-000000000001';
  b uuid; vm uuid; vb uuid; cm uuid; cb uuid; p uuid;
  lm uuid; lb uuid; lv uuid; r jsonb; v1 uuid; v2 uuid; s text; ok boolean;
begin
  insert into brands(name) values ('테스트 브랜드') returning id into b;
  insert into vendors(name, type) values ('테스트제조', 'manufacturer') returning id into vm;
  insert into vendors(name, type) values ('테스트단상자', 'box') returning id into vb;
  insert into vendor_contacts(vendor_id, name, email) values (vm, '제조담당', 'm@example.com') returning id into cm;
  insert into vendor_contacts(vendor_id, name, email) values (vb, '단상자담당', 'b@example.com') returning id into cb;
  insert into projects(brand_id, product_name, material_type, created_by) values (b, '수분 크림 50ml', '단상자', st) returning id into p;

  -- 링크 3개: 제조사(승인), 단상자(승인), 열람 전용
  lm := (issue_link(p, cm, 'approve', null, 'h1', 'e1', 'pw', st, null)->>'link_id')::uuid;
  lb := (issue_link(p, cb, 'approve', now() + interval '30 days', 'h2', 'e2', 'pw', st, null)->>'link_id')::uuid;
  lv := (issue_link(p, cb, 'view', null, 'h3', 'e3', 'pw', st, null)->>'link_id')::uuid;

  -- 1) v1 업로드 + 즉시 발송 → 회신 대기, 파일명 규칙
  r := create_version(p, st, 'projects/x/1.pdf', 100, 'design_review', null,
                      '[{"path":"projects/x/a1.xlsx","ext":"xlsx","original_name":"지시서.xlsx"}]', true);
  v1 := (r->>'version_id')::uuid;
  assert (r->>'file_name') = '테스트-브랜드_수분-크림-50ml_단상자_v1_' || to_char(now() at time zone 'Asia/Seoul', 'YYYYMMDD') || '.pdf', '파일명 규칙: ' || (r->>'file_name');
  assert jsonb_array_length(r->'sent_link_ids') = 3, '발송 대상 3명';
  assert (select status from projects where id = p) = 'pending', 'v1 발송 후 회신 대기';
  assert (select file_name from attachments where version_id = v1) like '%\_v1\_%\_작업지시서.xlsx', '작업지시서 파일명';
  assert (select count(*) from pending_responses where project_id = p) = 2, '응답 대기 2명(열람 전용 제외)';

  -- 2) 승인 전 인쇄·발주 차단
  begin perform release_print(p, st); ok := false; exception when others then ok := true; end;
  assert ok, '승인 전 인쇄·발주는 막혀야 함';
  begin update versions set print_released_at = now() where id = v1; ok := false; exception when others then ok := true; end;
  assert ok, 'DB 제약으로도 승인 전 인쇄 기록 불가';

  -- 3) 열람 전용 링크는 수정 요청 불가
  begin perform record_decision(lv, v1, 'changes_requested', '홍', '수정', null, null); ok := false; exception when others then ok := true; end;
  assert ok, '열람 전용은 수정 요청 불가';

  -- 4) 제조사 수정 요청 → 수정 요청 상태
  s := record_decision(lm, v1, 'changes_requested', '제조담당', '전성분 표기 확인 필요', '1.2.3.4', 'test');
  assert s = 'changes_requested', '수정 요청 상태';

  -- 5) v2 업로드(발송 안 함) → 발송 예정, 업체는 v1에 결정 불가
  r := create_version(p, st, 'projects/x/2.pdf', 100, 'design_review', '전성분 수정', '[]', false);
  v2 := (r->>'version_id')::uuid;
  assert (r->>'version_no')::int = 2, 'v2 번호';
  assert (select status from projects where id = p) = 'draft', '발송 전 = 발송 예정';
  begin perform record_decision(lb, v1, 'approved', '단상자담당', null, null, null); ok := false; exception when others then ok := true; end;
  assert ok, '이전 버전에는 결정 불가';

  -- 6) v2 발송, 한 명만 승인 → 아직 회신 대기 (전원 승인 필요)
  perform send_version(v2, st);
  s := record_decision(lm, v2, 'approved', '제조담당', null, null, null);
  assert s = 'pending', '1명 승인 시 회신 대기 유지: ' || s;
  begin perform release_print(p, st); ok := false; exception when others then ok := true; end;
  assert ok, '일부 승인 상태에서 인쇄 불가';

  -- 7) 승인자 이름 필수
  begin perform record_decision(lb, v2, 'approved', '  ', null, null, null); ok := false; exception when others then ok := true; end;
  assert ok, '이름 없이 승인 불가';

  -- 8) 두 번째 승인 → 최종 승인본 잠금
  s := record_decision(lb, v2, 'approved', '단상자담당', null, null, null);
  assert s = 'approved', '전원 승인 → 승인';
  assert (select locked from versions where id = v2), 'v2 잠금';
  assert (select approved_version_id from projects where id = p) = v2, '최종 승인본 = v2';
  assert (select count(*) from pending_responses where project_id = p) = 0, '응답 대기 없음';

  -- 9) 잠긴 버전 수정 불가, 새 버전 업로드 불가
  begin update versions set note = '변조' where id = v2; ok := false; exception when others then ok := true; end;
  assert ok, '최종 승인본 수정 불가';
  begin update versions set pdf_path = 'x' where id = v1; ok := false; exception when others then ok := true; end;
  assert ok, '파일 경로 변경 불가';
  begin delete from versions where id = v1; ok := false; exception when others then ok := true; end;
  assert ok, '버전 삭제 불가';
  begin perform create_version(p, st, 'projects/x/3.pdf', 1, 'design_review', null, '[]', false); ok := false; exception when others then ok := true; end;
  assert ok, '승인 후 개정 없이 업로드 불가';

  -- 10) 인쇄·발주 진행 1회만
  perform release_print(p, st);
  assert (select print_released_at is not null from versions where id = v2), '인쇄 기록';
  begin perform release_print(p, st); ok := false; exception when others then ok := true; end;
  assert ok, '인쇄 기록 중복 불가';
  begin update versions set print_released_at = null where id = v2; ok := false; exception when others then ok := true; end;
  assert ok, '인쇄 기록 되돌리기 불가';

  -- 11) 감사 로그·결정 삭제/수정 불가
  begin delete from audit_logs; ok := false; exception when others then ok := true; end;
  assert ok, '감사 로그 삭제 불가';
  begin update audit_logs set action = 'x'; ok := false; exception when others then ok := true; end;
  assert ok, '감사 로그 수정 불가';
  begin truncate audit_logs; ok := false; exception when others then ok := true; end;
  assert ok, '감사 로그 truncate 불가';
  begin delete from decisions; ok := false; exception when others then ok := true; end;
  assert ok, '결정 삭제 불가';

  -- 12) 개정 시작 → v3 업로드 가능, 인쇄 다시 잠김, 이전 승인본 보존
  begin perform start_revision(p, st, ''); ok := false; exception when others then ok := true; end;
  assert ok, '개정 사유 필수';
  perform start_revision(p, st, '용량 표기 변경');
  r := create_version(p, st, 'projects/x/3.pdf', 1, 'design_review', null, '[]', true);
  assert (select status from projects where id = p) = 'pending', '개정 후 회신 대기';
  assert (select approved_version_id from projects where id = p) = v2, '이전 승인본 보존';
  begin perform release_print(p, st); ok := false; exception when others then ok := true; end;
  assert ok, '개정 중 인쇄 불가';

  -- 13) 링크 폐기 시 결정 불가
  perform revoke_link(lm, st);
  begin perform record_decision(lm, (r->>'version_id')::uuid, 'approved', '제조담당', null, null, null); ok := false; exception when others then ok := true; end;
  assert ok, '폐기된 링크 결정 불가';

  -- 14) 로그인 5회 실패 → 잠금
  for i in 1..5 loop perform link_login_failed(lb, null, null); end loop;
  assert (select locked_until > now() from share_links where id = lb), '5회 실패 잠금';

  -- 15) 대장 행 수
  assert (select count(*) from ledger_rows where project_id = p) >= 7, '대장 행';
  raise info 'ALL WORKFLOW TESTS PASSED (audit rows: %)', (select count(*) from audit_logs);
end $$;

reset role;

-- 16) 공개 키(anon) 접근 차단
set role anon;
do $$ declare ok boolean; begin
  begin perform 1 from projects limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  assert ok, 'anon 테이블 접근 차단';
  begin perform 1 from pending_responses limit 1; ok := false; exception when insufficient_privilege then ok := true; end;
  assert ok, 'anon 뷰 접근 차단';
  begin perform audit('staff', null, 'x', 'x'); ok := false; exception when insufficient_privilege then ok := true; end;
  assert ok, 'anon 함수 실행 차단';
  raise info 'ANON ACCESS BLOCKED';
end $$;
reset role;
