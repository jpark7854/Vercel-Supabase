import { cookies } from 'next/headers';
import { SignJWT, jwtVerify } from 'jose';
import { adminDb } from '@/lib/supabase/admin';
import { env } from '@/lib/env';
import { isTokenShape, sha256 } from '@/lib/crypto';
import type { Permission, ProjectStatus } from '@/lib/labels';

const COOKIE = 'rv_session';
const SESSION_HOURS = 12;

export type VendorLink = {
  id: string;
  project_id: string;
  permission: Permission;
  password_hash: string;
  expires_at: string | null;
  revoked_at: string | null;
  locked_until: string | null;
  contact: { id: string; name: string; email: string; vendor: { name: string; type: string } };
  project: {
    id: string; product_name: string; material_type: string; status: ProjectStatus;
    prod_year: number | null; prod_month: number | null; prod_week: number | null;
    current_version_id: string | null; approved_version_id: string | null;
    brand: { name: string };
  };
};

export type LinkState =
  | { kind: 'invalid' }
  | { kind: 'revoked'; link: VendorLink }
  | { kind: 'expired'; link: VendorLink }
  | { kind: 'login'; link: VendorLink }
  | { kind: 'ok'; link: VendorLink };

const secret = () => new TextEncoder().encode(env('SESSION_SECRET'));

export async function findLink(token: string): Promise<VendorLink | null> {
  if (!isTokenShape(token)) return null;
  const { data } = await adminDb()
    .from('share_links')
    .select(
      'id, project_id, permission, password_hash, expires_at, revoked_at, locked_until,' +
        'contact:vendor_contacts(id, name, email, vendor:vendors(name, type)),' +
        'project:projects(id, product_name, material_type, status, prod_year, prod_month, prod_week, current_version_id, approved_version_id, brand:brands(name))',
    )
    .eq('token_hash', sha256(token))
    .maybeSingle();
  return (data as unknown as VendorLink) ?? null;
}

/** 링크 상태 + 로그인 세션 확인. 매 요청마다 DB에서 폐기·만료를 다시 확인합니다. */
export async function resolveVendor(token: string): Promise<LinkState> {
  const link = await findLink(token);
  if (!link) return { kind: 'invalid' };
  if (link.revoked_at) return { kind: 'revoked', link };
  if (link.expires_at && new Date(link.expires_at) <= new Date()) return { kind: 'expired', link };

  const jar = await cookies();
  const raw = jar.get(COOKIE)?.value;
  if (raw) {
    try {
      const { payload } = await jwtVerify(raw, secret());
      if (payload.lid === link.id) return { kind: 'ok', link };
    } catch {
      /* 만료·위조 → 다시 로그인 */
    }
  }
  return { kind: 'login', link };
}

export async function startVendorSession(token: string, linkId: string) {
  const jwt = await new SignJWT({ lid: linkId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secret());
  const jar = await cookies();
  // 쿠키 경로를 이 링크 주소로 한정 → 같은 브라우저에서 여러 링크를 열어도 섞이지 않음
  jar.set(COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: `/r/${token}`,
    maxAge: SESSION_HOURS * 3600,
  });
}

export function vendorLabel(link: VendorLink): string {
  return `${link.contact.name} (${link.contact.vendor.name})`;
}

/** 업체에게 보여줄 버전 = 발송된 버전 중 가장 최신 */
export async function visibleVersion(projectId: string) {
  const { data } = await adminDb()
    .from('versions')
    .select('*')
    .eq('project_id', projectId)
    .not('sent_at', 'is', null)
    .order('version_no', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as VersionRow | null;
}

export type VersionRow = {
  id: string; project_id: string; version_no: number; file_name: string; pdf_path: string; pdf_size: number | null;
  purpose: string; note: string | null; uploaded_at: string; sent_at: string | null; locked: boolean;
  approved_at: string | null; print_released_at: string | null; print_released_by: string | null; uploaded_by: string | null;
};
