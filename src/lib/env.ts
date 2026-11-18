export function env(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`환경변수 ${name} 이(가) 설정되지 않았습니다. .env.local 을 확인하세요.`);
  return v;
}

export const BUCKET = 'artwork';
export const appUrl = () => (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
