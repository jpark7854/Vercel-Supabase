// 첫 관리자 계정 만들기
// 사용법: npm run create-admin -- 이메일 이름
//   예)  npm run create-admin -- chajang@company.co.kr 김차장
import { createClient } from '@supabase/supabase-js';
import { randomInt } from 'node:crypto';

const [email, name] = process.argv.slice(2);
if (!email || !name) {
  console.error('사용법: npm run create-admin -- 이메일 이름');
  process.exit(1);
}
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
const password = Array.from({ length: 14 }, () => chars[randomInt(chars.length)]).join('');

const { data, error } = await db.auth.admin.createUser({ email, password, email_confirm: true });
if (error) {
  console.error('계정 생성 실패:', error.message);
  process.exit(1);
}
const { error: e2 } = await db.from('staff').insert({ id: data.user.id, name, email: email.toLowerCase(), role: 'admin' });
if (e2) {
  console.error('staff 등록 실패:', e2.message);
  process.exit(1);
}
console.log('\n✅ 관리자 계정을 만들었습니다.');
console.log(`   이메일: ${email}`);
console.log(`   임시 비밀번호: ${password}`);
console.log('   로그인 후 [내 계정]에서 비밀번호를 바꿔 주세요.\n');
