-- =====================================================================
-- 디자인 최종 파일 공유·검수·승인 포털 — 초기 스키마
-- Supabase 대시보드 > SQL Editor 에 이 파일 전체를 붙여넣고 실행하세요.
--
-- 보안 원칙
--  * 모든 테이블은 RLS(행 수준 보안)를 켜고 정책을 두지 않습니다.
--    → 브라우저용 공개 키(anon key)로는 어떤 데이터도 읽거나 쓸 수 없습니다.
--    → 데이터는 서버(Next.js)가 service_role 키로만 다룹니다.
--  * 감사 로그·업체 결정·코멘트는 "추가만 가능"(수정·삭제 불가)하도록 트리거로 막습니다.
--  * 승인된 버전(locked)은 트리거로 수정을 막고, 인쇄·발주 기록은 승인된 버전에만 남길 수 있습니다.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- 기초 정보
-- ---------------------------------------------------------------------
create table staff (
  id          uuid primary key references auth.users(id) on delete restrict,
  name        text not null,
  email       text not null unique,
  role        text not null default 'staff' check (role in ('admin', 'staff')),
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table brands (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create table vendors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  -- brand: 브랜드사, manufacturer: 제조사, container: 용기, tube: 튜브, box: 단상자, label: 라벨, other: 기타
  type        text not null check (type in ('brand', 'manufacturer', 'container', 'tube', 'box', 'label', 'other')),
  memo        text,
  created_at  timestamptz not null default now()
);

create table vendor_contacts (
  id          uuid primary key default gen_random_uuid(),
  vendor_id   uuid not null references vendors(id) on delete restrict,
  name        text not null,
  email       text not null,
  phone       text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 프로젝트 / 버전 / 첨부
-- ---------------------------------------------------------------------
create table projects (
  id                  uuid primary key default gen_random_uuid(),
  brand_id            uuid not null references brands(id) on delete restrict,
  product_name        text not null,             -- 품목 (예: 수분크림 50ml)
  material_type       text not null,             -- 부자재 (용기/단상자/라벨/튜브 …)
  prod_year           int  check (prod_year between 2000 and 2100),
  prod_month          int  check (prod_month between 1 and 12),
  prod_week           int  check (prod_week between 1 and 6),
  -- draft: 발송 예정, pending: 회신 대기, changes_requested: 수정 요청, approved: 승인, rejected: 반려
  status              text not null default 'draft'
                      check (status in ('draft', 'pending', 'changes_requested', 'approved', 'rejected')),
  current_version_id  uuid,                      -- 가장 최근에 올린 버전
  approved_version_id uuid,                      -- 가장 최근의 최종 승인본
  next_action         text,
  note                text,
  created_by          uuid references staff(id),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create table versions (
  id                 uuid primary key default gen_random_uuid(),
  project_id         uuid not null references projects(id) on delete restrict,
  version_no         int  not null check (version_no > 0),
  file_name          text not null,              -- 브랜드_품목_부자재_v번호_YYYYMMDD.pdf
  pdf_path           text not null unique,       -- 저장소 내부 경로 (비공개)
  pdf_size           bigint,
  -- design_review: 시안 검토, work_order: 작업지시서, final_approved: 최종 승인본,
  -- purchase_order: 발주서, data_request: 자료 요청
  purpose            text not null check (purpose in ('design_review', 'work_order', 'final_approved', 'purchase_order', 'data_request')),
  note               text,
  uploaded_by        uuid references staff(id),
  uploaded_at        timestamptz not null default now(),
  sent_at            timestamptz,                -- 업체에 발송한 시각 (null = 발송 예정)
  locked             boolean not null default false,
  approved_at        timestamptz,
  print_released_at  timestamptz,                -- 인쇄·발주 진행 시각
  print_released_by  uuid references staff(id),
  unique (project_id, version_no),
  constraint locked_has_approved_at check (locked = (approved_at is not null)),
  -- ★ 승인 전에는 인쇄·발주 진행 기록을 남길 수 없음 (DB 차원의 차단)
  constraint print_requires_approval check (print_released_at is null or locked)
);

alter table projects
  add constraint projects_current_version_fk  foreign key (current_version_id)  references versions(id),
  add constraint projects_approved_version_fk foreign key (approved_version_id) references versions(id);

create table attachments (
  id             uuid primary key default gen_random_uuid(),
  version_id     uuid not null references versions(id) on delete restrict,
  file_name      text not null,                  -- 자동 생성 이름 (…_작업지시서.xlsx)
  original_name  text,
  path           text not null unique,
  mime_type      text,
  size           bigint,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 업체별 공유 링크
-- ---------------------------------------------------------------------
create table share_links (
  id               uuid primary key default gen_random_uuid(),
  project_id       uuid not null references projects(id) on delete restrict,
  contact_id       uuid not null references vendor_contacts(id) on delete restrict,
  permission       text not null check (permission in ('view', 'comment', 'approve')),
  token_hash       text not null unique,   -- 링크 토큰의 SHA-256 (조회용)
  token_enc        text not null,          -- 링크 토큰 암호문 (리마인더 메일 재발송용, 서버 키로만 복호화)
  password_hash    text not null,          -- bcrypt 해시. 비밀번호 원문은 저장하지 않음
  expires_at       timestamptz,
  revoked_at       timestamptz,
  revoked_by       uuid references staff(id),
  failed_attempts  int not null default 0,
  locked_until     timestamptz,
  last_accessed_at timestamptz,
  created_by       uuid references staff(id),
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 코멘트 / 업체 결정 (추가만 가능)
-- ---------------------------------------------------------------------
create table comments (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references versions(id) on delete restrict,
  page         int  not null default 1 check (page > 0),
  x            numeric check (x between 0 and 100),   -- 페이지 내 위치 (%), 핀 없이 남기면 null
  y            numeric check (y between 0 and 100),
  body         text not null check (length(body) between 1 and 4000),
  author_type  text not null check (author_type in ('staff', 'vendor')),
  staff_id     uuid references staff(id),
  link_id      uuid references share_links(id),
  author_name  text not null,
  created_at   timestamptz not null default now()
);

create table decisions (
  id           uuid primary key default gen_random_uuid(),
  version_id   uuid not null references versions(id) on delete restrict,
  link_id      uuid not null references share_links(id) on delete restrict,
  decision     text not null check (decision in ('changes_requested', 'approved')),
  signer_name  text not null,      -- 업체 담당자가 직접 입력한 이름
  message      text,
  ip           text,
  user_agent   text,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 발송 기록 (발송·승인 대장의 한 줄) / 메일 기록
-- ---------------------------------------------------------------------
create table dispatches (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete restrict,
  version_id   uuid not null references versions(id) on delete restrict,
  link_id      uuid not null references share_links(id) on delete restrict,
  sent_at      timestamptz not null default now(),
  purpose      text not null,
  method       text not null default '포털 링크',   -- 발송 방법 (메일/카톡/전화 …) — 대장에서 수정 가능
  next_action  text,
  note         text,
  created_by   uuid references staff(id),
  unique (version_id, link_id)
);

create table email_logs (
  id          uuid primary key default gen_random_uuid(),
  link_id     uuid references share_links(id),
  version_id  uuid references versions(id),
  kind        text not null check (kind in ('approval_request', 'new_version', 'reminder', 'link_issued')),
  to_email    text not null,
  status      text not null check (status in ('sent', 'skipped', 'failed')),
  error       text,
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 감사 로그 (추가만 가능, 삭제·수정 불가)
-- ---------------------------------------------------------------------
create table audit_logs (
  id           bigint generated always as identity primary key,
  at           timestamptz not null default now(),
  actor_type   text not null check (actor_type in ('staff', 'vendor', 'system')),
  actor_id     uuid,           -- staff.id 또는 share_links.id
  actor_label  text,           -- "홍길동" / "김담당 (케이피티)" / "시스템"
  action       text not null,
  project_id   uuid references projects(id),
  version_id   uuid references versions(id),
  link_id      uuid references share_links(id),
  detail       jsonb not null default '{}'::jsonb,
  ip           text,
  user_agent   text
);

create index on versions (project_id, version_no desc);
create index on share_links (project_id);
create index on comments (version_id, created_at);
create index on decisions (version_id, link_id, created_at desc);
create index on dispatches (sent_at desc);
create index on audit_logs (project_id, at desc);
create index on audit_logs (at desc);
create index on email_logs (link_id, version_id, created_at desc);

-- =====================================================================
-- 보호 트리거
-- =====================================================================
create or replace function forbid_change() returns trigger
language plpgsql as $$
begin
  raise exception '% 기록은 수정하거나 삭제할 수 없습니다.', tg_table_name;
end $$;

create trigger audit_logs_append_only before update or delete on audit_logs
  for each row execute function forbid_change();
create trigger audit_logs_no_truncate before truncate on audit_logs
  for each statement execute function forbid_change();
create trigger decisions_append_only before update or delete on decisions
  for each row execute function forbid_change();
create trigger decisions_no_truncate before truncate on decisions
  for each statement execute function forbid_change();
create trigger comments_append_only before update or delete on comments
  for each row execute function forbid_change();
create trigger attachments_append_only before update or delete on attachments
  for each row execute function forbid_change();

-- 버전: 삭제 불가, 파일 정보 변경 불가, 승인(잠금) 후에는 인쇄·발주 기록 1회 외 변경 불가
create or replace function versions_guard() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception '버전은 삭제할 수 없습니다. (이전 버전은 보관됩니다)';
  end if;

  if new.project_id <> old.project_id or new.version_no <> old.version_no
     or new.pdf_path <> old.pdf_path or new.file_name <> old.file_name
     or new.uploaded_at <> old.uploaded_at or new.uploaded_by is distinct from old.uploaded_by then
    raise exception '업로드된 파일 정보는 변경할 수 없습니다.';
  end if;

  if old.locked then
    if new.locked is distinct from old.locked
       or new.approved_at is distinct from old.approved_at
       or new.sent_at is distinct from old.sent_at
       or new.purpose is distinct from old.purpose
       or new.note is distinct from old.note
       or new.pdf_size is distinct from old.pdf_size
       or (old.print_released_at is not null and
           (new.print_released_at is distinct from old.print_released_at
            or new.print_released_by is distinct from old.print_released_by)) then
      raise exception '최종 승인본은 수정할 수 없습니다.';
    end if;
  end if;
  return new;
end $$;

create trigger versions_guard before update or delete on versions
  for each row execute function versions_guard();

-- 승인된 버전에는 첨부를 추가할 수 없음
create or replace function attachments_insert_guard() returns trigger
language plpgsql as $$
begin
  if exists (select 1 from versions where id = new.version_id and locked) then
    raise exception '최종 승인본에는 파일을 추가할 수 없습니다.';
  end if;
  return new;
end $$;

create trigger attachments_insert_guard before insert on attachments
  for each row execute function attachments_insert_guard();

-- 업체 코멘트는 잠긴 버전에 남길 수 없음
create or replace function comments_insert_guard() returns trigger
language plpgsql as $$
begin
  if new.author_type = 'vendor' and exists (select 1 from versions where id = new.version_id and locked) then
    raise exception '최종 승인본에는 코멘트를 남길 수 없습니다.';
  end if;
  return new;
end $$;

create trigger comments_insert_guard before insert on comments
  for each row execute function comments_insert_guard();

-- =====================================================================
-- 업무 함수 (서버에서 service_role 로만 호출)
-- =====================================================================

-- 감사 로그 기록
create or replace function audit(
  p_actor_type text, p_actor_id uuid, p_actor_label text, p_action text,
  p_project uuid default null, p_version uuid default null, p_link uuid default null,
  p_detail jsonb default '{}'::jsonb, p_ip text default null, p_ua text default null
) returns void
language sql as $$
  insert into audit_logs (actor_type, actor_id, actor_label, action, project_id, version_id, link_id, detail, ip, user_agent)
  values (p_actor_type, p_actor_id, p_actor_label, p_action, p_project, p_version, p_link, coalesce(p_detail, '{}'::jsonb), p_ip, p_ua);
$$;

create or replace function staff_label(p_staff uuid) returns text
language sql stable as $$
  select coalesce((select name from staff where id = p_staff), '알 수 없음');
$$;

create or replace function link_label(p_link uuid) returns text
language sql stable as $$
  select c.name || ' (' || v.name || ')'
  from share_links l join vendor_contacts c on c.id = l.contact_id join vendors v on v.id = c.vendor_id
  where l.id = p_link;
$$;

-- 파일명 규칙: 브랜드_품목_부자재_v번호_YYYYMMDD
create or replace function make_base_name(p_brand text, p_product text, p_material text, p_version int, p_at timestamptz)
returns text
language sql immutable as $$
  select regexp_replace(p_brand,    '[\\/:*?"<>|\s_]+', '-', 'g') || '_' ||
         regexp_replace(p_product,  '[\\/:*?"<>|\s_]+', '-', 'g') || '_' ||
         regexp_replace(p_material, '[\\/:*?"<>|\s_]+', '-', 'g') || '_' ||
         'v' || p_version || '_' ||
         to_char(p_at at time zone 'Asia/Seoul', 'YYYYMMDD');
$$;

-- 현재 활성 링크인지
create or replace function link_is_active(l share_links) returns boolean
language sql stable as $$
  select l.revoked_at is null and (l.expires_at is null or l.expires_at > now());
$$;

-- 업체에 발송: sent_at 기록, 상태 '회신 대기', 활성 링크마다 발송 기록 생성.
-- 반환: 발송 대상 링크 id 배열 (메일 발송용)
create or replace function send_version(p_version uuid, p_staff uuid)
returns uuid[]
language plpgsql as $$
declare
  v versions;
  p projects;
  ids uuid[];
begin
  select * into v from versions where id = p_version;
  if not found then raise exception '버전을 찾을 수 없습니다.'; end if;
  select * into p from projects where id = v.project_id for update;
  if p.current_version_id <> v.id then raise exception '최신 버전만 발송할 수 있습니다.'; end if;
  if v.sent_at is not null then raise exception '이미 발송한 버전입니다.'; end if;
  if p.status in ('approved', 'rejected') then raise exception '승인 또는 반려된 프로젝트는 [개정 시작] 후 발송할 수 있습니다.'; end if;

  update versions set sent_at = now() where id = v.id;
  update projects set status = 'pending', updated_at = now() where id = p.id;

  with ins as (
    insert into dispatches (project_id, version_id, link_id, purpose, method, created_by)
    select p.id, v.id, l.id, v.purpose, '포털 링크(메일 알림)', p_staff
    from share_links l
    where l.project_id = p.id and link_is_active(l)
    on conflict (version_id, link_id) do nothing
    returning link_id
  )
  select coalesce(array_agg(link_id), '{}') into ids from ins;

  perform audit('staff', p_staff, staff_label(p_staff), 'send', p.id, v.id, null,
                jsonb_build_object('version', v.version_no, 'file_name', v.file_name, 'recipients', coalesce(array_length(ids, 1), 0)));
  return ids;
end $$;

-- 새 버전 등록 (버전 번호·파일명 자동, 작업지시서 묶기, 선택 시 즉시 발송)
-- p_attachments: [{ "path": "...", "ext": "xlsx", "original_name": "...", "mime_type": "...", "size": 123 }, ...]
create or replace function create_version(
  p_project uuid, p_staff uuid, p_pdf_path text, p_pdf_size bigint,
  p_purpose text, p_note text, p_attachments jsonb, p_send boolean
) returns jsonb
language plpgsql as $$
declare
  p projects;
  b brands;
  n int;
  base text;
  v versions;
  a jsonb;
  i int := 0;
  cnt int;
  sent uuid[] := '{}';
begin
  select * into p from projects where id = p_project for update;
  if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
  if p.status = 'approved' then
    raise exception '최종 승인된 프로젝트입니다. 변경이 필요하면 [개정 시작]을 먼저 눌러 주세요.';
  end if;
  if p.status = 'rejected' then
    raise exception '반려된 프로젝트입니다. 다시 진행하려면 [개정 시작]을 먼저 눌러 주세요.';
  end if;

  select coalesce(max(version_no), 0) + 1 into n from versions where project_id = p.id;
  select * into b from brands where id = p.brand_id;
  base := make_base_name(b.name, p.product_name, p.material_type, n, now());

  insert into versions (project_id, version_no, file_name, pdf_path, pdf_size, purpose, note, uploaded_by)
  values (p.id, n, base || '.pdf', p_pdf_path, p_pdf_size, p_purpose, nullif(trim(p_note), ''), p_staff)
  returning * into v;

  cnt := jsonb_array_length(coalesce(p_attachments, '[]'::jsonb));
  for a in select * from jsonb_array_elements(coalesce(p_attachments, '[]'::jsonb)) loop
    i := i + 1;
    insert into attachments (version_id, file_name, original_name, path, mime_type, size)
    values (v.id,
            base || '_작업지시서' || case when cnt > 1 then '-' || i else '' end || '.' || lower(a->>'ext'),
            a->>'original_name', a->>'path', a->>'mime_type', (a->>'size')::bigint);
  end loop;

  update projects set current_version_id = v.id, status = 'draft', updated_at = now() where id = p.id;

  perform audit('staff', p_staff, staff_label(p_staff), 'upload', p.id, v.id, null,
                jsonb_build_object('version', n, 'file_name', v.file_name, 'attachments', cnt, 'purpose', p_purpose));

  if p_send then
    sent := send_version(v.id, p_staff);
  end if;

  return jsonb_build_object('version_id', v.id, 'version_no', n, 'file_name', v.file_name, 'sent_link_ids', to_jsonb(sent));
end $$;

-- 프로젝트 상태 재계산 (업체 결정·링크 폐기 후 호출)
-- 규칙: 승인 권한 링크(폐기되지 않은 것) 전원이 최신 버전을 승인 → 최종 승인본으로 잠금
--       그 외 수정 요청이 하나라도 있으면 '수정 요청', 아니면 '회신 대기'
create or replace function recompute_project_status(p_project uuid)
returns text
language plpgsql as $$
declare
  p projects;
  v versions;
  required int;
  approved_cnt int;
  any_changes boolean;
  approvers jsonb;
begin
  select * into p from projects where id = p_project for update;
  if p.status not in ('pending', 'changes_requested') or p.current_version_id is null then
    return p.status;
  end if;
  select * into v from versions where id = p.current_version_id;
  if v.sent_at is null or v.locked then return p.status; end if;

  with latest as (
    select distinct on (d.link_id) d.link_id, d.decision, d.signer_name, d.created_at
    from decisions d where d.version_id = v.id
    order by d.link_id, d.created_at desc
  )
  select
    count(*) filter (where l.permission = 'approve'),
    count(*) filter (where l.permission = 'approve' and lt.decision = 'approved'),
    coalesce(bool_or(lt.decision = 'changes_requested'), false),
    coalesce(jsonb_agg(jsonb_build_object('name', lt.signer_name, 'contact', link_label(l.id), 'at', lt.created_at))
             filter (where l.permission = 'approve' and lt.decision = 'approved'), '[]'::jsonb)
  into required, approved_cnt, any_changes, approvers
  from share_links l
  left join latest lt on lt.link_id = l.id
  where l.project_id = p.id and l.revoked_at is null;

  if required > 0 and approved_cnt = required then
    update versions set locked = true, approved_at = now() where id = v.id;
    update projects set status = 'approved', approved_version_id = v.id, updated_at = now() where id = p.id;
    perform audit('system', null, '시스템', 'final_approved', p.id, v.id, null,
                  jsonb_build_object('version', v.version_no, 'file_name', v.file_name, 'approvers', approvers));
    return 'approved';
  elsif any_changes then
    update projects set status = 'changes_requested', updated_at = now() where id = p.id;
    return 'changes_requested';
  else
    update projects set status = 'pending', updated_at = now() where id = p.id;
    return 'pending';
  end if;
end $$;

-- 업체 결정 (수정 요청 / 승인)
create or replace function record_decision(
  p_link uuid, p_version uuid, p_decision text, p_signer text, p_message text, p_ip text, p_ua text
) returns text
language plpgsql as $$
declare
  l share_links;
  p projects;
  v versions;
begin
  select * into l from share_links where id = p_link;
  if not found or not link_is_active(l) then raise exception '만료되었거나 폐기된 링크입니다.'; end if;
  select * into p from projects where id = l.project_id for update;
  select * into v from versions where id = p_version;
  if not found or v.project_id <> p.id then raise exception '버전을 찾을 수 없습니다.'; end if;
  if v.locked then raise exception '이미 최종 승인된 버전입니다.'; end if;
  if p.current_version_id <> v.id or v.sent_at is null then
    raise exception '새 버전이 준비 중입니다. 새 버전이 발송되면 다시 검토해 주세요.';
  end if;
  if p.status not in ('pending', 'changes_requested') then
    raise exception '현재 회신을 받을 수 없는 상태입니다.';
  end if;
  if p_decision = 'approved' and l.permission <> 'approve' then
    raise exception '승인 권한이 없는 링크입니다.';
  end if;
  if p_decision = 'changes_requested' and l.permission not in ('comment', 'approve') then
    raise exception '수정 요청 권한이 없는 링크입니다.';
  end if;
  if coalesce(trim(p_signer), '') = '' then raise exception '이름을 입력해 주세요.'; end if;
  if p_decision = 'changes_requested' and coalesce(trim(p_message), '') = '' then
    raise exception '수정 요청 내용을 입력해 주세요.';
  end if;

  insert into decisions (version_id, link_id, decision, signer_name, message, ip, user_agent)
  values (v.id, l.id, p_decision, trim(p_signer), nullif(trim(p_message), ''), p_ip, p_ua);

  perform audit('vendor', l.id, link_label(l.id), p_decision, p.id, v.id, l.id,
                jsonb_build_object('version', v.version_no, 'file_name', v.file_name,
                                   'signer_name', trim(p_signer), 'message', nullif(trim(p_message), '')),
                p_ip, p_ua);

  return recompute_project_status(p.id);
end $$;

-- 공유 링크 발급 (이미 발송된 버전이 있으면 그 버전의 발송 기록도 생성)
create or replace function issue_link(
  p_project uuid, p_contact uuid, p_permission text, p_expires timestamptz,
  p_token_hash text, p_token_enc text, p_password_hash text, p_staff uuid, p_method text
) returns jsonb
language plpgsql as $$
declare
  l share_links;
  p projects;
  sv versions;
  dispatched boolean := false;
begin
  select * into p from projects where id = p_project for update;
  if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
  if not exists (select 1 from vendor_contacts where id = p_contact and active) then
    raise exception '업체 담당자를 찾을 수 없습니다.';
  end if;
  if p_expires is not null and p_expires <= now() then raise exception '만료일은 오늘 이후로 지정해 주세요.'; end if;

  insert into share_links (project_id, contact_id, permission, token_hash, token_enc, password_hash, expires_at, created_by)
  values (p.id, p_contact, p_permission, p_token_hash, p_token_enc, p_password_hash, p_expires, p_staff)
  returning * into l;

  -- 업체가 볼 버전: 발송된 버전 중 가장 최신
  select * into sv from versions where project_id = p.id and sent_at is not null order by version_no desc limit 1;
  if found then
    insert into dispatches (project_id, version_id, link_id, purpose, method, created_by)
    values (p.id, sv.id, l.id, case when sv.locked then 'final_approved' else sv.purpose end,
            coalesce(nullif(trim(p_method), ''), '포털 링크'), p_staff);
    dispatched := true;
  end if;

  perform audit('staff', p_staff, staff_label(p_staff), 'link_issue', p.id, sv.id, l.id,
                jsonb_build_object('contact', link_label(l.id), 'permission', p_permission, 'expires_at', p_expires));

  return jsonb_build_object('link_id', l.id, 'dispatched_version_id', case when dispatched then sv.id end);
end $$;

create or replace function revoke_link(p_link uuid, p_staff uuid) returns void
language plpgsql as $$
declare l share_links;
begin
  select * into l from share_links where id = p_link for update;
  if not found then raise exception '링크를 찾을 수 없습니다.'; end if;
  if l.revoked_at is not null then raise exception '이미 폐기된 링크입니다.'; end if;
  update share_links set revoked_at = now(), revoked_by = p_staff where id = l.id;
  perform audit('staff', p_staff, staff_label(p_staff), 'link_revoke', l.project_id, null, l.id,
                jsonb_build_object('contact', link_label(l.id)));
  perform recompute_project_status(l.project_id);
end $$;

-- 인쇄·발주 진행 (최종 승인본이 최신 버전일 때만)
create or replace function release_print(p_project uuid, p_staff uuid) returns void
language plpgsql as $$
declare p projects; v versions;
begin
  select * into p from projects where id = p_project for update;
  if not found then raise exception '프로젝트를 찾을 수 없습니다.'; end if;
  if p.status <> 'approved' or p.approved_version_id is null or p.approved_version_id <> p.current_version_id then
    raise exception '최종 승인 전에는 인쇄·발주를 진행할 수 없습니다.';
  end if;
  select * into v from versions where id = p.approved_version_id;
  if v.print_released_at is not null then raise exception '이미 인쇄·발주 진행이 기록되었습니다.'; end if;
  update versions set print_released_at = now(), print_released_by = p_staff where id = v.id;
  perform audit('staff', p_staff, staff_label(p_staff), 'print_release', p.id, v.id, null,
                jsonb_build_object('version', v.version_no, 'file_name', v.file_name));
end $$;

-- 개정 시작 (승인/반려 이후 다시 새 버전을 올려야 할 때)
create or replace function start_revision(p_project uuid, p_staff uuid, p_reason text) returns void
language plpgsql as $$
declare p projects;
begin
  select * into p from projects where id = p_project for update;
  if p.status not in ('approved', 'rejected') then raise exception '승인 또는 반려된 프로젝트만 개정할 수 있습니다.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception '개정 사유를 입력해 주세요.'; end if;
  update projects set status = 'draft', updated_at = now() where id = p.id;
  perform audit('staff', p_staff, staff_label(p_staff), 'revision_start', p.id, p.current_version_id, null,
                jsonb_build_object('reason', trim(p_reason), 'previous_status', p.status));
end $$;

create or replace function reject_project(p_project uuid, p_staff uuid, p_reason text) returns void
language plpgsql as $$
declare p projects;
begin
  select * into p from projects where id = p_project for update;
  if p.status in ('approved', 'rejected') then raise exception '이미 승인 또는 반려된 프로젝트입니다.'; end if;
  if coalesce(trim(p_reason), '') = '' then raise exception '반려 사유를 입력해 주세요.'; end if;
  update projects set status = 'rejected', updated_at = now() where id = p.id;
  perform audit('staff', p_staff, staff_label(p_staff), 'reject', p.id, p.current_version_id, null,
                jsonb_build_object('reason', trim(p_reason)));
end $$;

-- 업체 비밀번호 오류 횟수 (5회 → 15분 잠금)
create or replace function link_login_failed(p_link uuid, p_ip text, p_ua text) returns void
language plpgsql as $$
declare l share_links;
begin
  update share_links
     set failed_attempts = failed_attempts + 1,
         locked_until = case when failed_attempts + 1 >= 5 then now() + interval '15 minutes' else locked_until end
   where id = p_link
  returning * into l;
  perform audit('vendor', l.id, link_label(l.id), 'login_fail', l.project_id, null, l.id,
                jsonb_build_object('attempts', l.failed_attempts, 'locked', l.locked_until is not null and l.locked_until > now()),
                p_ip, p_ua);
  if l.failed_attempts >= 5 then
    update share_links set failed_attempts = 0 where id = p_link;
  end if;
end $$;

create or replace function link_login_ok(p_link uuid, p_ip text, p_ua text) returns void
language plpgsql as $$
declare l share_links;
begin
  update share_links set failed_attempts = 0, locked_until = null, last_accessed_at = now()
   where id = p_link returning * into l;
  perform audit('vendor', l.id, link_label(l.id), 'login', l.project_id, null, l.id, '{}'::jsonb, p_ip, p_ua);
end $$;

-- =====================================================================
-- 조회용 뷰
-- =====================================================================

-- 응답 대기: 최신 발송본에 대해 아직 회신하지 않은 담당자
--  * 승인 권한: 수정 요청/승인 결정이 없을 때
--  * 코멘트 권한: 결정도 코멘트도 없을 때
create view pending_responses with (security_invoker = true) as
select
  l.id as link_id, l.project_id, l.permission,
  c.name as contact_name, c.email as contact_email, vd.name as vendor_name,
  v.id as version_id, v.version_no, v.file_name,
  coalesce(d.sent_at, v.sent_at) as sent_at,
  (select max(e.created_at) from email_logs e
    where e.link_id = l.id and e.version_id = v.id and e.kind = 'reminder' and e.status in ('sent', 'skipped')) as last_reminder_at,
  p.status as project_status, b.name as brand_name, p.product_name, p.material_type
from share_links l
join projects p        on p.id = l.project_id
join versions v        on v.id = p.current_version_id
join vendor_contacts c on c.id = l.contact_id
join vendors vd        on vd.id = c.vendor_id
join brands b          on b.id = p.brand_id
left join lateral (select min(x.sent_at) as sent_at from dispatches x where x.link_id = l.id and x.version_id = v.id) d on true
where l.revoked_at is null
  and (l.expires_at is null or l.expires_at > now())
  and l.permission in ('comment', 'approve')
  and p.status in ('pending', 'changes_requested')
  and v.sent_at is not null and not v.locked
  and not exists (select 1 from decisions x where x.link_id = l.id and x.version_id = v.id)
  and (l.permission = 'approve'
       or not exists (select 1 from comments x where x.link_id = l.id and x.version_id = v.id));

-- 발송·승인 대장 원본 데이터
create view ledger_rows with (security_invoker = true) as
select
  ds.id as dispatch_id, ds.sent_at, ds.purpose, ds.method, ds.next_action, ds.note,
  vd.name as vendor_name, c.name as contact_name, c.email as contact_email,
  b.name as brand_name, p.id as project_id, p.product_name, p.material_type,
  p.prod_year, p.prod_month, p.prod_week, p.status as project_status, p.current_version_id,
  v.id as version_id, v.version_no, v.file_name, v.locked as version_locked, v.approved_at,
  l.permission, l.revoked_at,
  ld.decision, ld.signer_name, ld.created_at as decided_at
from dispatches ds
join share_links l     on l.id = ds.link_id
join vendor_contacts c on c.id = l.contact_id
join vendors vd        on vd.id = c.vendor_id
join versions v        on v.id = ds.version_id
join projects p        on p.id = ds.project_id
join brands b          on b.id = p.brand_id
left join lateral (
  select d.decision, d.signer_name, d.created_at from decisions d
  where d.link_id = l.id and d.version_id = v.id
  order by d.created_at desc limit 1
) ld on true;

-- =====================================================================
-- 권한: 공개 키(anon)·로그인 사용자(authenticated)는 어떤 것도 직접 접근 불가
-- =====================================================================
alter table staff           enable row level security;
alter table brands          enable row level security;
alter table vendors         enable row level security;
alter table vendor_contacts enable row level security;
alter table projects        enable row level security;
alter table versions        enable row level security;
alter table attachments     enable row level security;
alter table share_links     enable row level security;
alter table comments        enable row level security;
alter table decisions       enable row level security;
alter table dispatches      enable row level security;
alter table email_logs      enable row level security;
alter table audit_logs      enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

-- =====================================================================
-- 비공개 파일 저장소 (PDF·엑셀만, 파일당 50MB)
-- =====================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artwork', 'artwork', false, 52428800,
        array['application/pdf',
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
              'application/vnd.ms-excel'])
on conflict (id) do nothing;
