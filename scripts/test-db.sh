#!/usr/bin/env bash
# 로컬 PostgreSQL(16+)에서 DB 업무 규칙 테스트를 실행합니다. (개발자용, 운영에는 필요 없음)
# 필요: psql, createdb 명령과 접속 가능한 PostgreSQL. 예) PGUSER=postgres npm run test:db
set -euo pipefail
cd "$(dirname "$0")/.."
DB=portal_test_$$
createdb "$DB"
trap 'dropdb --if-exists "$DB"' EXIT
psql -v ON_ERROR_STOP=1 -q -d "$DB" -f supabase/tests/supabase_stub.sql -f supabase/migrations/0001_init.sql -f supabase/tests/workflow_test.sql
