import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt } from 'node:crypto';
import { env } from '@/lib/env';

/** 링크 토큰: 32바이트 무작위 (URL 안전 문자 43자) */
export function newLinkToken(): string {
  return randomBytes(32).toString('base64url');
}

export function isTokenShape(token: string): boolean {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}

export function sha256(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

/** 비밀번호: 헷갈리는 글자(0/O, 1/l/I) 제외 10자리 */
export function newPassword(len = 10): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[randomInt(chars.length)];
  return out;
}

function key(): Buffer {
  return createHash('sha256').update(env('LINK_ENC_KEY')).digest();
}

/** 링크 토큰 암호화 (리마인더 메일에 링크를 다시 넣기 위함). 비밀번호는 암호화 저장하지 않고 해시만 저장합니다. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString('base64url')).join('.');
}

export function decrypt(payload: string): string {
  const [iv, tag, enc] = payload.split('.').map((s) => Buffer.from(s, 'base64url'));
  const d = createDecipheriv('aes-256-gcm', key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString('utf8');
}
