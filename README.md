# 디자인 최종 파일 공유·검수·승인 포털

명성코퍼레이션이 브랜드사·제조사·부자재 업체와 디자인 파일(시안·작업지시서·최종 승인본)을 주고받는 포털입니다.
**최종 승인본을 한 곳에 보관하고**, **승인 전 인쇄를 막고**, **누가 언제 무엇을 했는지 지울 수 없게 기록**합니다.

- 내부 담당자: 이메일 로그인 → `/admin`
- 외부 업체: 담당자별 개별 링크 + 비밀번호 → `/r/…` (회원가입 없음, 휴대폰 지원)

---

## 1. 기술 구성과 선택 이유

| 구성 | 이유 |
|---|---|
| **Next.js 15** (App Router, TypeScript) | 화면과 서버 로직을 한 프로젝트에서 관리. 가장 널리 쓰여 다른 개발자에게 맡기기 쉬움 |
| **Supabase** (PostgreSQL · Storage · Auth) | DB·비공개 파일 저장소·로그인을 한 서비스에서. 관리 화면에서 데이터를 엑셀처럼 바로 확인 가능 |
| **Vercel** | GitHub에 올리면 자동 배포. 매일 리마인더(Cron) 내장 |
| **Resend** | 메일 발송 API. 설정이 단순하고 월 3,000통 무료 |
| **pdf.js** | 휴대폰 포함 모든 브라우저에서 PDF를 바로 보여주고, 그 위에 코멘트 핀 표시 |

**중요한 업무 규칙은 화면이 아니라 DB에서 강제**합니다. 화면에 버그가 있어도 아래 규칙은 깨지지 않습니다.
- 승인 전에는 인쇄·발주 기록을 남길 수 없음 (DB 제약 조건)
- 최종 승인본(잠긴 버전)은 수정·삭제 불가 (DB 트리거)
- 감사 로그·업체 결정·코멘트는 수정·삭제 불가 (DB 트리거, 관리자도 불가)
- 승인 권한 링크 **전원**이 최신 버전을 승인해야 최종 승인본으로 잠김

---

## 2. 폴더 구조

```
supabase/migrations/0001_init.sql   DB 전체 (테이블·규칙·함수·저장소). Supabase SQL Editor에 붙여넣어 실행
supabase/tests/                     DB 규칙 자동 테스트 (개발자용)
scripts/create-admin.mjs            첫 관리자 계정 만들기
scripts/seed.mjs                    테스트용 가상 데이터 넣기
src/app/admin/…                     내부 담당자 화면
src/app/r/[token]/…                 업체 화면
src/app/api/cron/reminders          3일 무응답 리마인더 (매일 09:00)
src/lib/…                           공용 로직 (메일, 암호화, 대장 등)
docs/                               사용 안내서 · 2차 개발 후보
```

---

## 3. 로컬(내 PC)에서 실행하기

> 처음 한 번만 30분 정도 걸립니다. 명령어는 Windows는 "명령 프롬프트" 또는 "PowerShell", Mac은 "터미널"에서 실행합니다.

### 3-1. 준비물
1. **Node.js 22 LTS** 설치: https://nodejs.org → LTS 버튼 → 설치
   설치 확인: `node -v` 를 입력해 `v22…` 가 나오면 성공
2. **Supabase 계정**: https://supabase.com 에서 GitHub 또는 이메일로 가입

### 3-2. Supabase 프로젝트 만들기
1. Supabase 대시보드 → **New project**
   - Name: `design-portal-test` (테스트용) — ⚠ 운영용은 나중에 따로 만듭니다 (아래 5장 참고)
   - Database Password: 자동 생성된 값을 안전한 곳에 보관
   - Region: **Northeast Asia (Seoul)**
2. 1~2분 기다린 뒤 왼쪽 메뉴 **SQL Editor** → **New query**
3. 이 프로젝트의 `supabase/migrations/0001_init.sql` 파일을 메모장으로 열어 **전체 복사 → 붙여넣기 → Run**
   `Success. No rows returned` 가 나오면 성공
4. 왼쪽 **Authentication → Sign In / Providers → Email** 에서
   - **Allow new users to sign up** 끄기 (관리자가 만든 계정만 로그인 가능하게)
5. 왼쪽 **Project Settings → API Keys** (또는 **Data API**) 에서 다음 3가지를 복사해 둡니다.
   - Project URL (`https://xxxx.supabase.co`)
   - `anon` `public` 키
   - `service_role` 키 (⚠ 비밀 키 — 메일·카톡으로 보내지 말 것)

### 3-3. 프로젝트 설정
```bash
cd design-portal
npm install
```
`.env.example` 파일을 복사해 이름을 `.env.local` 로 바꾸고 값을 채웁니다.

```bash
cp .env.example .env.local
```

| 항목 | 값 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | anon public 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | service_role 키 |
| `APP_URL` | `http://localhost:3000` |
| `SESSION_SECRET`, `LINK_ENC_KEY`, `CRON_SECRET` | 아래 명령을 **3번** 실행해 나온 서로 다른 값 |
| `RESEND_API_KEY` | 로컬 테스트에서는 비워 두세요 (메일 대신 기록만 남음) |

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

> ⚠ `LINK_ENC_KEY` 는 한 번 정하면 바꾸지 마세요. 바꾸면 기존 링크로 리마인더 메일을 보낼 수 없습니다(링크 자체는 계속 작동).

### 3-4. 관리자 계정 · 테스트 데이터
```bash
npm run create-admin -- 내이메일@회사.co.kr 김차장
```
화면에 나온 **임시 비밀번호**를 메모합니다.

```bash
npm run seed
```
가상 브랜드 3개(론지화장품·펄타임백·셀레듀), 업체 4개(케이피티·탭코리아·정우피앤피·대영스크린), 프로젝트 3개가 만들어집니다. 각 프로젝트는 상태가 다릅니다(승인 / 회신 대기 4일 경과 / 수정 요청). 끝에 **업체용 링크와 비밀번호 표**가 출력되니 복사해 두세요. 업체 이메일은 모두 `@example.com` 입니다.

### 3-5. 실행
```bash
npm run dev
```
브라우저에서 http://localhost:3000 → 로그인 → 대시보드.
업체 화면은 seed가 출력한 링크를 **다른 브라우저(또는 시크릿 창)** 에서 열고 비밀번호를 입력해 확인합니다.
휴대폰 화면은 크롬에서 F12 → 휴대폰 아이콘(기기 툴바)으로 볼 수 있습니다.

---

## 4. 배포하기 (Vercel + Supabase + Resend)

### 4-1. 코드를 GitHub에 올리기
1. https://github.com 에서 **New repository** → 이름 `design-portal` → **Private** 선택 → Create
2. 프로젝트 폴더에서:
```bash
git init
```
```bash
git add .
```
```bash
git commit -m "디자인 포털 MVP"
```
```bash
git branch -M main
```
```bash
git remote add origin https://github.com/<내계정>/design-portal.git
```
```bash
git push -u origin main
```
> `.env.local` 은 `.gitignore` 에 들어 있어 올라가지 않습니다. 비밀 키를 GitHub에 올리지 마세요.

### 4-2. 운영용 Supabase 프로젝트 만들기
테스트용과 **별도로** 새 프로젝트(예: `design-portal`)를 만들고 3-2의 1~5단계를 똑같이 진행합니다.
> 감사 로그는 삭제가 불가능하도록 설계되어 있어 테스트 데이터를 지울 수 없습니다. 그래서 운영은 깨끗한 새 프로젝트로 시작합니다.

### 4-3. Vercel에 배포
1. https://vercel.com → GitHub로 가입 → **Add New → Project** → `design-portal` 저장소 **Import**
2. **Environment Variables** 에 `.env.local` 과 같은 항목을 모두 입력 (운영용 Supabase 값으로)
   - `APP_URL` 은 일단 비워 두고 배포 → 배포 후 나온 주소(예: `https://design-portal-xxx.vercel.app`)를 넣고 **Redeploy**
   - `SESSION_SECRET`, `LINK_ENC_KEY`, `CRON_SECRET` 은 운영용으로 **새로 생성**
3. **Deploy** → 완료되면 주소로 접속해 확인
4. 관리자 계정: 내 PC의 `.env.local` 을 잠시 운영용 값으로 바꿔 `npm run create-admin -- 이메일 이름` 실행 → 끝나면 테스트용 값으로 되돌리기
   (또는 `.env.production.local` 파일을 따로 만들고 `node --env-file=.env.production.local scripts/create-admin.mjs 이메일 이름`)
5. ⚠ 운영 DB에는 `npm run seed` 를 실행하지 마세요.

> 📌 **Vercel 무료(Hobby) 플랜은 약관상 비상업용**입니다. 시범 운영 후 실제 업무에 쓰기 시작하면 **Pro($20/월)** 로 바꾸세요.

### 4-4. 메일 발송 설정 (Resend)
1. https://resend.com 가입 → **Domains → Add Domain** → 회사 도메인 입력 (예: `myungsung.co.kr`. 하위 도메인 `mail.myungsung.co.kr` 권장)
2. 화면에 나온 DNS 레코드(TXT·MX 등)를 도메인 관리 업체(가비아·카페24·후이즈 등) 관리 화면에 그대로 추가 → Resend에서 **Verify** (수 분~수 시간)
3. **API Keys → Create** → Vercel 환경변수 `RESEND_API_KEY` 에 입력
4. `MAIL_FROM` 을 `명성코퍼레이션 디자인포털 <noreply@mail.myungsung.co.kr>` 형태로 입력 → Redeploy
5. 테스트: 내 개인 이메일로 업체 담당자를 하나 등록하고 링크를 발급해 메일이 오는지 확인
> 메일 발송 결과는 프로젝트의 [활동 기록] 탭에 "메일 발송 / 메일 실패"로 남습니다.

### 4-5. 리마인더(3일 무응답) 확인
`vercel.json` 에 매일 00:00 UTC(= **한국 09:00**) 실행이 설정되어 있어 배포만 하면 자동으로 동작합니다.
Vercel 대시보드 → 프로젝트 → **Settings → Cron Jobs** 에서 실행 기록을 볼 수 있습니다. 수동 테스트:
```bash
curl -H "Authorization: Bearer <CRON_SECRET값>" https://<포털주소>/api/cron/reminders
```

### 4-6. (선택) 회사 도메인 연결
Vercel → **Settings → Domains** → `portal.myungsung.co.kr` 추가 → 안내된 CNAME을 DNS에 등록 → `APP_URL` 을 새 주소로 바꾸고 Redeploy.

---

## 5. 운영 시 알아둘 점

| 항목 | 내용 |
|---|---|
| 무료 플랜 한도 | 파일 1GB(파일당 50MB), DB 500MB. PDF 5~10MB 기준 약 100~200개 버전 |
| 일시정지 | Supabase 무료는 7일간 사용이 없으면 멈춤. 매일 리마인더 작업이 접속하므로 보통은 멈추지 않음 |
| 백업 | 무료 플랜은 자동 백업 없음 → **매월 발송·승인 대장 엑셀을 내려받아 보관**. 실사용 시 Supabase Pro($25/월, 매일 백업) 권장 |
| 비밀번호 분실 (업체) | 비밀번호는 해시로만 저장되어 다시 볼 수 없음 → 기존 링크 **폐기 후 새로 발급** |
| 비밀번호 분실 (내부) | 관리자가 Supabase → Authentication → Users → 해당 사용자 → Send password recovery 또는 새 계정 발급 |
| 담당자 퇴사 (업체) | [설정]에서 담당자 "사용 중지" + 해당 링크 폐기 |
| 키 유출 의심 | Supabase에서 service_role 키 재발급 → Vercel 환경변수 교체 → Redeploy |

### 보안 설계 요약
- 저장소는 **비공개 버킷**이며, 파일은 매번 **10분짜리 서명 URL**로만 열립니다.
- 업체 링크 주소에는 무작위 토큰(43자)만 들어가며 **이름·이메일·비밀번호 등 개인정보는 URL에 넣지 않습니다**. 비밀번호는 POST 본문으로만 전송합니다.
- 링크 토큰은 SHA-256 해시로 조회하고, 비밀번호는 **bcrypt 해시로만 저장**합니다.
- 비밀번호 5회 오류 시 15분 잠금. 링크 폐기·만료는 매 요청마다 확인하므로 폐기 즉시 차단됩니다.
- 브라우저용 공개 키(anon)로는 DB의 어떤 테이블·함수에도 접근할 수 없습니다. 모든 데이터 처리는 서버에서만 합니다.
- 업로드된 파일은 서버에서 실제 형식(PDF·엑셀 시그니처)을 확인한 뒤에만 등록합니다.

---

## 6. 개발자용

```bash
npm run typecheck   # 타입 검사
npm run build       # 배포용 빌드 확인
npm run test:db     # 로컬 PostgreSQL에서 DB 업무 규칙 테스트 (PostgreSQL 16+ 필요)
```
DB 구조를 바꿀 때는 `supabase/migrations/0002_…sql` 처럼 **새 파일을 추가**하고 SQL Editor에서 실행하세요(기존 파일 수정 금지).

## 7. 문서
- [업체용 사용 안내 (1페이지)](docs/업체용_사용안내.md)
- [내부 담당자용 사용 안내](docs/내부_사용안내.md)
- [2차 개발 후보](docs/2차_개발_후보.md)
